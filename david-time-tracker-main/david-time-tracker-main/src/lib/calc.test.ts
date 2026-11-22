import { describe, expect, it } from 'vitest';
import { budgetStatus, buildLookup, buildReport, HOUR, MINUTE, resolveRate, roundedEnd } from './calc';
import { DEFAULT_SETTINGS } from './db';
import type { Entry, Item, Project } from './types';

const settings = { ...DEFAULT_SETTINGS, defaultRate: 30 };
const project: Project = { id: 'p', name: 'Casita Work', emoji: '🏡', color: '#000', rate: 40, order: 0, updatedAt: 1 };
const kitchen: Item = { id: 'k', projectId: 'p', name: 'Kitchen', emoji: '', color: '', rate: null, order: 0, updatedAt: 1 };
const bath: Item = { ...kitchen, id: 'b', name: 'Bathroom', rate: 55, order: 1 };

const entry = (patch: Partial<Entry>): Entry => ({
  id: Math.random().toString(),
  itemId: 'k',
  kind: 'actual',
  start: 0,
  end: HOUR,
  note: '',
  billable: true,
  updatedAt: 1,
  ...patch,
});

describe('roundedEnd', () => {
  it('rounds the duration up to the next 15 minutes', () => {
    expect(roundedEnd(0, 7 * MINUTE, 15)).toBe(15 * MINUTE);
    expect(roundedEnd(0, 15 * MINUTE, 15)).toBe(15 * MINUTE);
    expect(roundedEnd(0, 16 * MINUTE, 15)).toBe(30 * MINUTE);
  });

  it('never makes an entry shorter than one step', () => {
    expect(roundedEnd(0, 2000, 15)).toBe(15 * MINUTE);
  });

  it('leaves the time alone when rounding is off', () => {
    expect(roundedEnd(0, 7 * MINUTE, 0)).toBe(7 * MINUTE);
  });
});

describe('resolveRate', () => {
  it('prefers item, then project, then the default', () => {
    expect(resolveRate(bath, project, settings)).toBe(55);
    expect(resolveRate(kitchen, project, settings)).toBe(40);
    expect(resolveRate(kitchen, { ...project, rate: null }, settings)).toBe(30);
  });

  it('treats a rate of 0 as set, not missing', () => {
    expect(resolveRate({ ...kitchen, rate: 0 }, project, settings)).toBe(0);
  });
});

describe('buildReport', () => {
  const lookup = buildLookup([project], [kitchen, bath], settings);

  it('totals worked, billable and planned time per item', () => {
    const entries = [
      entry({ itemId: 'k', end: 2 * HOUR }),
      entry({ itemId: 'b', end: HOUR }),
      entry({ itemId: 'b', end: HOUR, billable: false }),
      entry({ itemId: 'k', kind: 'plan', end: 3 * HOUR }),
    ];
    const { groups, totals } = buildReport(entries, lookup, new Set(['p']), 0, 24 * HOUR);
    expect(totals).toEqual({ hours: 4, billableHours: 3, plannedHours: 3, amount: 2 * 40 + 55 });
    expect(groups[0].rows.map((r) => r.item.name)).toEqual(['Kitchen', 'Bathroom']);
  });

  it('skips projects that are not selected and entries outside the range', () => {
    const entries = [entry({ start: 25 * HOUR, end: 26 * HOUR }), entry({})];
    expect(buildReport(entries, lookup, new Set(), 0, 24 * HOUR).totals.hours).toBe(0);
    expect(buildReport(entries, lookup, new Set(['p']), 0, 24 * HOUR).totals.hours).toBe(1);
  });
});

describe('budgetStatus', () => {
  const totals = { hours: 9, billableHours: 9, plannedHours: 0, amount: 450 };
  it('warns at 80% and flags going over', () => {
    expect(budgetStatus({ budgetHours: 10 }, totals)[0].level).toBe('warn');
    expect(budgetStatus({ budgetAmount: 400 }, totals)[0].level).toBe('over');
    expect(budgetStatus({ budgetHours: 100 }, totals)[0].level).toBe('ok');
    expect(budgetStatus({}, totals)).toEqual([]);
  });
});
