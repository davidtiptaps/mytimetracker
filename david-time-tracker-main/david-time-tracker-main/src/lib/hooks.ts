import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { buildLookup, type Lookup } from './calc';
import { db, DEFAULT_SETTINGS } from './db';
import type { Entry, Item, Project, Settings } from './types';

const alive = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);
const byOrder = <T extends { order: number; name: string }>(a: T, b: T) => a.order - b.order || a.name.localeCompare(b.name);

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('settings'), []);
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...s }), [s]);
}

export function useProjects(includeArchived = false): Project[] | undefined {
  return useLiveQuery(async () => {
    const rows = alive(await db.projects.toArray()).sort(byOrder);
    return includeArchived ? rows : rows.filter((p) => !p.archived);
  }, [includeArchived]);
}

export function useAllItems(): Item[] | undefined {
  return useLiveQuery(async () => alive(await db.items.toArray()).sort(byOrder), []);
}

export function useEntries(): Entry[] | undefined {
  return useLiveQuery(async () => alive(await db.entries.toArray()), []);
}

export function useRunning(): Entry | undefined {
  return useLiveQuery(async () => {
    const rows = await db.entries.filter((e) => !e.deleted && e.end === null).toArray();
    return rows.sort((a, b) => b.start - a.start)[0];
  }, []);
}

/** Projects, items and settings bundled for rate and total calculations. */
export function useLookup(): Lookup | undefined {
  const projects = useProjects(true);
  const items = useAllItems();
  const settings = useSettings();
  return useMemo(
    () => (projects && items ? buildLookup(projects, items, settings) : undefined),
    [projects, items, settings],
  );
}

/** Current time, refreshed every `ms` while `active`. */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}
