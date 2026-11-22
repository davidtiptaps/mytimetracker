import Dexie, { type EntityTable } from 'dexie';
import type { Entry, Item, Project, RecordOf, Settings, SyncFields, TableName } from './types';

// Local copies carry a `dirty` flag (1 = not yet pushed to the server).
// It is stored as a number because IndexedDB can't index booleans.
type Local<T> = T & { dirty?: 0 | 1 };

export interface Meta {
  key: string;
  value: unknown;
}

class TrackerDB extends Dexie {
  projects!: EntityTable<Local<Project>, 'id'>;
  items!: EntityTable<Local<Item>, 'id'>;
  entries!: EntityTable<Local<Entry>, 'id'>;
  settings!: EntityTable<Local<Settings>, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor() {
    super('time-tracker');
    this.version(1).stores({
      projects: 'id, dirty',
      items: 'id, projectId, dirty',
      entries: 'id, itemId, start, dirty',
      settings: 'id, dirty',
      meta: 'key',
    });
  }
}

export const db = new TrackerDB();

export const SYNCED_TABLES: TableName[] = ['projects', 'items', 'entries', 'settings'];

/** Loosely typed table access for code that loops over every synced table. */
export function anyTable(name: TableName) {
  return db[name] as unknown as EntityTable<Local<SyncFields>, 'id'>;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currency: 'USD',
  defaultRate: 0,
  weekStart: 1,
  roundTimerMinutes: 15,
  // updatedAt 0 means a fresh device never overrides settings already saved
  // on the server: any real edit is newer.
  updatedAt: 0,
};

const listeners = new Set<() => void>();

/** Called after every local change, so sync can push it soon. */
export function onLocalChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function newId() {
  return crypto.randomUUID();
}

export async function save<T extends TableName>(table: T, record: RecordOf<T>) {
  const stamped = { ...record, updatedAt: Date.now(), dirty: 1 as const };
  await (db[table] as unknown as EntityTable<Local<RecordOf<T>>, 'id'>).put(stamped);
  listeners.forEach((fn) => fn());
  return stamped as RecordOf<T>;
}

export async function saveMany<T extends TableName>(table: T, records: RecordOf<T>[]) {
  const now = Date.now();
  const stamped = records.map((r) => ({ ...r, updatedAt: now, dirty: 1 as const }));
  await (db[table] as unknown as EntityTable<Local<RecordOf<T>>, 'id'>).bulkPut(stamped);
  listeners.forEach((fn) => fn());
}

export async function remove<T extends TableName>(table: T, record: RecordOf<T>) {
  await save(table, { ...record, deleted: true });
}

/** Deleting a project also deletes its items and all their time entries. */
export async function removeProject(project: Project) {
  await db.transaction('rw', db.projects, db.items, db.entries, async () => {
    const items = await db.items.where('projectId').equals(project.id).toArray();
    const entries = await db.entries.where('itemId').anyOf(items.map((i) => i.id)).toArray();
    await saveMany('entries', entries.map((e) => ({ ...e, deleted: true })));
    await saveMany('items', items.map((i) => ({ ...i, deleted: true })));
    await remove('projects', project);
  });
}

export async function removeItem(item: Item) {
  await db.transaction('rw', db.items, db.entries, async () => {
    const entries = await db.entries.where('itemId').equals(item.id).toArray();
    await saveMany('entries', entries.map((e) => ({ ...e, deleted: true })));
    await remove('items', item);
  });
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
