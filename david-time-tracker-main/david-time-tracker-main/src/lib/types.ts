// Every synced record carries these fields. `updatedAt` decides which edit
// wins when two devices change the same record (last write wins), and
// `deleted` lets a deletion travel to other devices instead of the record
// silently reappearing on the next sync.
export interface SyncFields {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export interface Budget {
  budgetHours?: number | null;
  budgetAmount?: number | null;
}

export interface Project extends SyncFields, Budget {
  name: string;
  emoji: string;
  color: string;
  /** Hourly rate for items in this project that don't set their own. */
  rate?: number | null;
  archived?: boolean;
  order: number;
}

export interface Item extends SyncFields, Budget {
  projectId: string;
  name: string;
  /** Empty means "use the project's emoji/color". */
  emoji: string;
  color: string;
  rate?: number | null;
  archived?: boolean;
  order: number;
}

export type EntryKind = 'actual' | 'plan';

export interface Entry extends SyncFields {
  itemId: string;
  kind: EntryKind;
  /** Epoch milliseconds. */
  start: number;
  /** null while a timer is running. */
  end: number | null;
  note: string;
  billable: boolean;
}

export interface Settings extends SyncFields {
  id: 'settings';
  currency: string;
  defaultRate: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStart: 0 | 1;
  /** Stopped timers round their duration up to this many minutes (0 = off). */
  roundTimerMinutes: number;
}

export type TableName = 'projects' | 'items' | 'entries' | 'settings';

export type RecordOf<T extends TableName> = T extends 'projects'
  ? Project
  : T extends 'items'
    ? Item
    : T extends 'entries'
      ? Entry
      : Settings;
