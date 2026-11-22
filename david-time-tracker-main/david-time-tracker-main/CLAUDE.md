# Time Tracker: notes for Claude

Offline-first time tracking PWA for iPhone, synced to a single-user Node server
on a laptop over Tailscale. See README.md for setup and architecture.

## Commands

- `npm run dev`: Vite on :5173 plus the sync server on 127.0.0.1:8787 (Vite proxies `/api`)
- `npm test`: vitest (`src/lib/*.test.ts`)
- `npm run build`: `tsc --noEmit` then `vite build` into `dist/`
- `npm start`: production server, which serves `dist/` and `/api/sync`

## Layout

- `src/lib/`: data and logic, no UI
  - `types.ts`: Project → Item → Entry, plus Settings. Every synced record has `id`, `updatedAt`, `deleted`.
  - `db.ts`: Dexie (IndexedDB). **Always write through `save` / `saveMany` / `remove`**: they stamp `updatedAt`, set `dirty`, and trigger sync. Deletes are soft (`deleted: true`).
  - `sync.ts`: push dirty records and pull since a cursor. Last write wins on `updatedAt`.
  - `calc.ts`: timer rounding, rate resolution (item → project → default), report totals, budgets. Pure functions with unit tests.
  - `export.ts`: PDF/CSV, loaded lazily because jsPDF is large.
- `src/components/ui.tsx`: iOS-style building blocks (NavHeader, Group, Cell, ListRow, Modal sheet, Switch, Segmented, DurationPicker, Icon). Build new screens from these rather than one-off markup.
- `src/views/`: one file per screen. Routing is hash-based in `App.tsx`.
- `server/server.mjs`: dependency-free Node (needs ≥22.13 for `node:sqlite`). Keep it free of npm packages so it runs from a plain checkout.

## Conventions

- Styling follows current iOS design: system colors as CSS variables in `styles.css`, with light and dark mode.
- Money is computed from current rates at report time; amounts aren't stored on entries.
- Settings default to `updatedAt: 0` so a new device never overwrites real settings from the server.
- `start-server.bat` / `update-app.bat` are what the end user runs on Windows. Keep them simple, with CRLF endings (see `.gitattributes`).
