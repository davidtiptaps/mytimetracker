import type { Budget, Entry, Item, Project, Settings } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/**
 * The end time for a stopped timer: its duration rounded up to the next
 * whole `stepMinutes` (so 7 min becomes 15, 16 min becomes 30). The start
 * time stays as recorded.
 */
export function roundedEnd(start: number, stop: number, stepMinutes: number): number {
  if (stepMinutes <= 0) return stop;
  const step = stepMinutes * MINUTE;
  const steps = Math.max(1, Math.ceil((stop - start) / step));
  return start + steps * step;
}

/** Item rate, else its project's rate, else the default rate. */
export function resolveRate(item: Item | undefined, project: Project | undefined, settings: Settings): number {
  if (item?.rate != null) return item.rate;
  if (project?.rate != null) return project.rate;
  return settings.defaultRate;
}

export function entryHours(entry: Entry, now = Date.now()): number {
  return Math.max(0, (entry.end ?? now) - entry.start) / HOUR;
}

export interface Lookup {
  items: Map<string, Item>;
  projects: Map<string, Project>;
  settings: Settings;
}

export function buildLookup(projects: Project[], items: Item[], settings: Settings): Lookup {
  return {
    items: new Map(items.map((i) => [i.id, i])),
    projects: new Map(projects.map((p) => [p.id, p])),
    settings,
  };
}

export function entryAmount(entry: Entry, lookup: Lookup, now = Date.now()): number {
  if (!entry.billable) return 0;
  const item = lookup.items.get(entry.itemId);
  const project = item && lookup.projects.get(item.projectId);
  return entryHours(entry, now) * resolveRate(item, project, lookup.settings);
}

export interface Totals {
  plannedHours: number;
  hours: number;
  billableHours: number;
  amount: number;
}

export function emptyTotals(): Totals {
  return { plannedHours: 0, hours: 0, billableHours: 0, amount: 0 };
}

export function addEntry(t: Totals, entry: Entry, lookup: Lookup, now = Date.now()) {
  const h = entryHours(entry, now);
  if (entry.kind === 'plan') {
    t.plannedHours += h;
    return;
  }
  t.hours += h;
  if (entry.billable) {
    t.billableHours += h;
    t.amount += entryAmount(entry, lookup, now);
  }
}

export interface ReportRow {
  item: Item;
  rate: number;
  totals: Totals;
  entries: Entry[];
}

export interface ReportGroup {
  project: Project;
  rows: ReportRow[];
  totals: Totals;
}

/** Groups entries between `from` and `to` by project and item. */
export function buildReport(
  entries: Entry[],
  lookup: Lookup,
  projectIds: Set<string>,
  from: number,
  to: number,
  now = Date.now(),
): { groups: ReportGroup[]; totals: Totals } {
  const groups = new Map<string, ReportGroup>();
  const totals = emptyTotals();

  const inRange = entries
    .filter((e) => e.start < to && (e.end ?? now) > from)
    .sort((a, b) => a.start - b.start);

  for (const entry of inRange) {
    const item = lookup.items.get(entry.itemId);
    const project = item && lookup.projects.get(item.projectId);
    if (!item || !project || !projectIds.has(project.id)) continue;

    let group = groups.get(project.id);
    if (!group) {
      group = { project, rows: [], totals: emptyTotals() };
      groups.set(project.id, group);
    }
    let row = group.rows.find((r) => r.item.id === item.id);
    if (!row) {
      row = { item, rate: resolveRate(item, project, lookup.settings), totals: emptyTotals(), entries: [] };
      group.rows.push(row);
    }
    row.entries.push(entry);
    addEntry(row.totals, entry, lookup, now);
    addEntry(group.totals, entry, lookup, now);
    addEntry(totals, entry, lookup, now);
  }

  const sorted = [...groups.values()].sort((a, b) => a.project.order - b.project.order);
  sorted.forEach((g) => g.rows.sort((a, b) => a.item.order - b.item.order));
  return { groups: sorted, totals };
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

export interface BudgetStatus {
  kind: 'hours' | 'amount';
  used: number;
  limit: number;
  fraction: number;
  level: BudgetLevel;
}

/** Budgets count all time logged so far (not just one period). */
export function budgetStatus(budget: Budget, totals: Totals): BudgetStatus[] {
  const out: BudgetStatus[] = [];
  const push = (kind: BudgetStatus['kind'], used: number, limit: number | null | undefined) => {
    if (!limit || limit <= 0) return;
    const fraction = used / limit;
    out.push({ kind, used, limit, fraction, level: fraction >= 1 ? 'over' : fraction >= 0.8 ? 'warn' : 'ok' });
  };
  push('hours', totals.hours, budget.budgetHours);
  push('amount', totals.amount, budget.budgetAmount);
  return out;
}
