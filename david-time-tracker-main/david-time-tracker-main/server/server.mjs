// Time Tracker sync server.
//
// - Serves the built app (the dist/ folder) so a phone can install it.
// - POST /api/sync: receives changed records from a device and sends back
//   everything other devices changed since that device's last sync.
// - Stores data in data/timetracker.db (SQLite, built into Node).
//
// No npm packages are needed to run this file: just Node 22.13 or newer.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

// SQLite is built into Node from 22.13 on. Check before loading it so an
// old Node gives a clear message instead of a module error.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`\n  Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org\n`);
  process.exit(1);
}
const { DatabaseSync } = await import('node:sqlite');

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.TRACKER_PORT || 8787);
// Only this computer can connect directly; the phone comes in through
// `tailscale serve`, which forwards to localhost. Set TRACKER_HOST=0.0.0.0
// to open it to the local network instead.
const HOST = process.env.TRACKER_HOST || '127.0.0.1';
const TABLES = new Set(['projects', 'items', 'entries', 'settings']);
const PAGE_SIZE = 2000;
const MAX_BODY = 10 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

// The passcode is created once and kept in data/config.json.
const configPath = path.join(DATA_DIR, 'config.json');
let config = {};
if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (process.env.SYNC_PASSCODE) config.passcode = process.env.SYNC_PASSCODE;
if (!config.passcode) {
  config.passcode = crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const db = new DatabaseSync(path.join(DATA_DIR, 'timetracker.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS records (
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (tbl, id)
  );
  CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
`);

// `seq` goes up by one on every write. A device remembers the highest seq
// it has seen (its "cursor") and asks only for newer records next time.
let seq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records').get().s;

const getRecord = db.prepare('SELECT updated_at FROM records WHERE tbl = ? AND id = ?');
const putRecord = db.prepare(`
  INSERT INTO records (tbl, id, updated_at, seq, data) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (tbl, id) DO UPDATE SET updated_at = excluded.updated_at, seq = excluded.seq, data = excluded.data
`);
const changesSince = db.prepare('SELECT tbl, id, seq, data FROM records WHERE seq > ? ORDER BY seq LIMIT ?');

function sync({ since, changes }) {
  db.exec('BEGIN');
  try {
    for (const c of changes) {
      if (!TABLES.has(c?.table) || typeof c.id !== 'string' || typeof c.data?.updatedAt !== 'number') continue;
      const existing = getRecord.get(c.table, c.id);
      // Last write wins: keep the most recently edited version.
      if (!existing || c.data.updatedAt > existing.updated_at) {
        putRecord.run(c.table, c.id, c.data.updatedAt, ++seq, JSON.stringify({ ...c.data, id: c.id }));
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const rows = changesSince.all(since, PAGE_SIZE);
  return {
    cursor: rows.length ? rows[rows.length - 1].seq : since,
    more: rows.length === PAGE_SIZE,
    changes: rows.map((r) => ({ table: r.tbl, id: r.id, data: JSON.parse(r.data) })),
  };
}

function checkAuth(req) {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(config.passcode);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    return res.end('The app has not been built yet. Run "npm run build" first.');
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(DIST, path.normalize(urlPath));
  // Never serve anything outside dist/.
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    return res.end();
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');

  const ext = path.extname(file);
  // Hashed files in assets/ never change; everything else must be rechecked
  // so phones pick up new versions of the app.
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/health') return sendJson(res, 200, { ok: true });
    if (req.url === '/api/sync') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
      if (!checkAuth(req)) return sendJson(res, 401, { error: 'Wrong passcode' });
      const body = JSON.parse((await readBody(req)) || '{}');
      const since = Number.isInteger(body.since) && body.since >= 0 ? body.since : 0;
      const changes = Array.isArray(body.changes) ? body.changes : [];
      const result = sync({ since, changes });
      if (changes.length) console.log(`${new Date().toLocaleTimeString()}  received ${changes.length} change(s)`);
      return sendJson(res, 200, result);
    }
    if (req.url.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
    serveStatic(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, err instanceof SyntaxError ? 400 : 500, { error: err.message });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Is the server already running in another window?\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

/** This laptop's HTTPS address on the tailnet, or null if Tailscale isn't available. */
function tailscaleAddress() {
  const candidates =
    process.platform === 'win32'
      ? ['tailscale', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe')]
      : ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  return new Promise((resolve) => {
    const attempt = (i) => {
      if (i >= candidates.length) return resolve(null);
      execFile(candidates[i], ['status', '--json'], { timeout: 5000 }, (err, stdout) => {
        if (err) return attempt(i + 1);
        try {
          const name = JSON.parse(stdout).Self?.DNSName?.replace(/\.$/, '');
          resolve(name ? `https://${name}` : null);
        } catch {
          resolve(null);
        }
      });
    };
    attempt(0);
  });
}

server.listen(PORT, HOST, async () => {
  const phoneUrl = await tailscaleAddress();
  console.log('');
  console.log('  Time Tracker server is running');
  console.log('');
  if (phoneUrl) {
    console.log(`  iPhone address:  ${phoneUrl}`);
    console.log('                   (open it in Safari on the iPhone, with the Tailscale app on)');
  } else {
    console.log('  iPhone address:  not available. Is Tailscale installed and signed in?');
  }
  console.log(`  Sync passcode:   ${config.passcode}`);
  console.log(`                   (also saved in ${configPath})`);
  console.log('');
  console.log(`  On this computer: http://localhost:${PORT}`);
  console.log(`  Data is saved in: ${DATA_DIR}`);
  console.log('');
  console.log('  Keep this window open while you want the phone to sync. Close it to stop.');
  console.log('');
});
