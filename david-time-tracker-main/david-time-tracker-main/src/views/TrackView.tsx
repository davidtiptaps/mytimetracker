import { useMemo, useState } from 'react';
import { startOfWeek } from 'date-fns';
import { addEntry, emptyTotals, type Totals } from '../lib/calc';
import { newId, saveMany } from '../lib/db';
import { formatClock, formatHours } from '../lib/format';
import { useEntries, useLookup, useNow, useProjects, useRunning, useSettings } from '../lib/hooks';
import type { Item, Project } from '../lib/types';
import { ProjectEditor } from '../components/Editors';
import { BudgetBars, Group, Icon, IconTile, ListRow, NavHeader } from '../components/ui';

export function TrackView() {
  const projects = useProjects();
  const entries = useEntries();
  const lookup = useLookup();
  const settings = useSettings();
  const running = useRunning();
  const now = useNow(!!running);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  // Per project: this week's hours and all-time totals (for budgets).
  const stats = useMemo(() => {
    const out = new Map<string, { week: number; all: Totals }>();
    if (!entries || !lookup) return out;
    const weekStart = startOfWeek(now, { weekStartsOn: settings.weekStart }).getTime();
    for (const e of entries) {
      if (e.kind !== 'actual') continue;
      const projectId = lookup.items.get(e.itemId)?.projectId;
      if (!projectId) continue;
      let s = out.get(projectId);
      if (!s) out.set(projectId, (s = { week: 0, all: emptyTotals() }));
      addEntry(s.all, e, lookup, now);
      if (e.start >= weekStart) s.week += ((e.end ?? now) - e.start) / 3_600_000;
    }
    return out;
  }, [entries, lookup, now, settings.weekStart]);

  if (!projects) return null;
  const runningItem = running && lookup?.items.get(running.itemId);

  return (
    <>
      <NavHeader
        title="Projects"
        trailing={
          <button className="glass-btn" onClick={() => setEditing('new')} aria-label="New project">
            <Icon name="plus" />
          </button>
        }
      />

      {projects.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="timer" size={44} />
          </div>
          <h2>No Projects</h2>
          <p>
            Make a project like <b>Casita Work</b>, add the things you work on inside it, like <b>Kitchen</b> and <b>Bathroom</b>,
            then tap one to start its timer.
          </p>
          <button className="btn prominent" onClick={() => setEditing('new')}>
            New Project
          </button>
          <button className="btn plain" onClick={() => void addExample()}>
            Add an Example
          </button>
        </div>
      ) : (
        <Group>
          {projects.map((p) => {
            const s = stats.get(p.id);
            const isRunning = runningItem?.projectId === p.id;
            return (
              <ListRow
                key={p.id}
                icon={<IconTile emoji={p.emoji} color={p.color} />}
                title={p.name}
                subtitle={`${formatHours(s?.week ?? 0)} this week`}
                onClick={() => (location.hash = `#/project/${p.id}`)}
                chevron
                trailing={
                  <>
                    {isRunning && running && (
                      <span className="row-value running" style={{ color: p.color }}>
                        {formatClock(now - running.start)}
                      </span>
                    )}
                    <button
                      className="info-btn"
                      aria-label={`Edit ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(p);
                      }}
                    >
                      <Icon name="info" />
                    </button>
                  </>
                }
              >
                <BudgetBars budget={p} totals={s?.all ?? emptyTotals()} currency={settings.currency} />
              </ListRow>
            );
          })}
        </Group>
      )}

      {editing && <ProjectEditor project={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

async function addExample() {
  const projectId = newId();
  const project: Project = {
    id: projectId,
    name: 'Casita Work',
    emoji: '🏡',
    color: '#34c759',
    rate: 45,
    budgetHours: 120,
    order: 0,
    updatedAt: 0,
  };
  const items: Item[] = [
    ['Kitchen', '🍳', '#ff9500'],
    ['Bathroom', '🛁', '#007aff'],
    ['Bedroom', '🛏️', '#5856d6'],
    ['Yard', '🌳', '#00c7be'],
  ].map(([name, emoji, color], order) => ({ id: newId(), projectId, name, emoji, color, rate: null, order, updatedAt: 0 }));
  await saveMany('projects', [project]);
  await saveMany('items', items);
}
