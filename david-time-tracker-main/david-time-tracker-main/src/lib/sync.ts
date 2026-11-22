import { useSyncExternalStore } from 'react';
import { anyTable, db, getMeta, onLocalChange, setMeta, SYNCED_TABLES } from './db';
import type { SyncFields, TableName } from './types';

// The app always works from its local database. Sync runs in the
// background whenever the laptop server can be reached: it pushes local
// changes, pulls everything the server has seen since the last sync, and
// for each record keeps whichever version was edited most recently.

export type SyncState =
  | { status: 'idle' | 'syncing'; lastSync: number | null }
  | { status: 'offline' | 'unauthorized' | 'no-passcode' | 'error'; lastSync: number | null; message?: string };

interface Change {
  table: TableName;
  id: string;
  updatedAt: number;
  data: SyncFields;
}

interface SyncResponse {
  cursor: number;
  changes: Change[];
  more: boolean;
}

let state: SyncState = { status: 'idle', lastSync: null };
const subscribers = new Set<() => void>();

function setState(next: SyncState) {
  state = next;
  subscribers.forEach((fn) => fn());
}

export function useSyncState() {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    () => state,
  );
}

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce() {
  const passcode = await getMeta<string>('passcode', '');
  const lastSync = await getMeta<number | null>('lastSync', null);
  if (!passcode) {
    setState({ status: 'no-passcode', lastSync });
    return;
  }
  setState({ status: 'syncing', lastSync });

  let more = true;
  while (more) {
    const since = await getMeta<number>('cursor', 0);
    const pushed: Change[] = [];
    for (const table of SYNCED_TABLES) {
      const dirty = await db[table].where('dirty').equals(1).toArray();
      for (const { dirty: _omit, ...data } of dirty) {
        pushed.push({ table, id: data.id, updatedAt: data.updatedAt, data });
      }
    }

    let res: Response;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${passcode}` },
        body: JSON.stringify({ since, changes: pushed }),
        signal: abort.signal,
      });
    } catch {
      setState({ status: 'offline', lastSync });
      return;
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      setState({ status: 'unauthorized', lastSync });
      return;
    }
    // A missing server behind the service worker or a proxy shows up as a
    // non-JSON error page rather than a network failure.
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
      setState({ status: res.status >= 500 || res.status === 404 ? 'offline' : 'error', lastSync, message: `HTTP ${res.status}` });
      return;
    }
    const body = (await res.json()) as SyncResponse;
    await applyResponse(pushed, body);
    more = body.more;
  }

  const now = Date.now();
  await setMeta('lastSync', now);
  setState({ status: 'idle', lastSync: now });
}

async function applyResponse(pushed: Change[], body: SyncResponse) {
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db[t]), db.meta], async () => {
    for (const c of pushed) {
      const table = anyTable(c.table);
      const local = await table.get(c.id);
      // Only clear the flag if nothing changed while the request was in flight.
      if (local && local.updatedAt === c.updatedAt) await table.update(c.id, { dirty: 0 });
    }
    for (const c of body.changes) {
      if (!SYNCED_TABLES.includes(c.table)) continue;
      const table = anyTable(c.table);
      const local = await table.get(c.id);
      if (!local || c.data.updatedAt > local.updatedAt) {
        await table.put({ ...c.data, dirty: 0 });
      }
    }
    await db.meta.put({ key: 'cursor', value: body.cursor });
  });
}

/** Starts background sync: on launch, after edits, when back online, and every 30s. */
export function startAutoSync() {
  void navigator.storage?.persist?.();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  onLocalChange(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 1500);
  });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 30000);
  void syncNow();
}
