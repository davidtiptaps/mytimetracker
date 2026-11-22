import { roundedEnd } from './calc';
import { db, newId, save } from './db';
import type { Entry, Settings } from './types';

export async function stopTimer(entry: Entry, settings: Settings) {
  const end = roundedEnd(entry.start, Date.now(), settings.roundTimerMinutes);
  await save('entries', { ...entry, end });
}

/** Starts a timer on an item, stopping any timer already running. */
export async function startTimer(itemId: string, settings: Settings) {
  const running = await db.entries.filter((e) => !e.deleted && e.end === null).toArray();
  for (const r of running) await stopTimer(r, settings);
  await save('entries', {
    id: newId(),
    itemId,
    kind: 'actual',
    start: Date.now(),
    end: null,
    note: '',
    billable: true,
    updatedAt: 0,
  });
}
