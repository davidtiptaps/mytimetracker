import { useMemo, useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import { addEntry, emptyTotals, entryHours, resolveRate, type Totals } from '../lib/calc';
import { formatHours, formatMoney } from '../lib/format';
import { useAllItems, useEntries, useLookup, useNow, useProjects, useRunning, useSettings } from '../lib/hooks';
import { itemLook } from '../lib/look';
import { startTimer, stopTimer } from '../lib/timer';
import type { Entry, Item } from '../lib/types';
import { EntryEditor, ItemEditor, ProjectEditor } from '../components/Editors';
import { BudgetBars, Cell, Group, Icon, IconTile, ListRow, NavHeader, Switch } from '../components/ui';

export function ProjectView({ projectId }: { projectId: string }) {
  const projects = useProjects(true);
  const allItems = useAllItems();
  const entries = useEntries();
  const lookup = useLookup();
  const settings = useSettings();
  const running = useRunning();
  const now = useNow(!!running);
  const [editProject, setEditProject] = useState(false);
  const [editItem, setEditItem] = useState<Item | 'new' | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const project = projects?.find((p) => p.id === projectId);
  const items = useMemo(() => (allItems ?? []).filter((i) => i.projectId === projectId), [allItems, projectId]);
  const visibleItems = items.filter((i) => showArchived || !i.archived);

  const { stats, projectTotals, recent } = useMemo(() => {
    const stats = new Map<string, { week: number; all: Totals }>();
    const projectTotals = emptyTotals();
    const recent: Entry[] = [];
    if (!entries || !lookup) return { stats, projectTotals, recent };
    const ids = new Set(items.map((i) => i.id));
    const weekStart = startOfWeek(now, { weekStartsOn: settings.weekStart }).getTime();
    for (const e of entries) {
      if (!ids.has(e.itemId) || e.kind !== 'actual') continue;
      let s = stats.get(e.itemId);
      if (!s) stats.set(e.itemId, (s = { week: 0, all: emptyTotals() }));
      addEntry(s.all, e, lookup, now);
      addEntry(projectTotals, e, lookup, now);
      if (e.start >= weekStart) s.week += entryHours(e, now);
      recent.push(e);
    }
    recent.sort((a, b) => b.start - a.start);
    return { stats, projectTotals, recent: recent.slice(0, 25) };
  }, [entries, lookup, items, now, settings.weekStart]);

  if (!projects || !allItems) return null;
  if (!project) {
    return (
      <>
        <NavHeader title="Not Found" back={{ href: '#/', label: 'Projects' }} />
        <div className="empty">
          <p>This project no longer exists.</p>
        </div>
      </>
    );
  }

  const hasBudget = project.budgetHours || project.budgetAmount;

  return (
    <>
      <NavHeader
        title={project.name}
        back={{ href: '#/', label: 'Projects' }}
        trailing={
          <button className="glass-btn text" onClick={() => setEditProject(true)}>
            Edit
          </button>
        }
      />

      {hasBudget ? (
        <Group header="Budget">
          <div className="cell padded">
            <BudgetBars budget={project} totals={projectTotals} currency={settings.currency} />
          </div>
        </Group>
      ) : null}

      <Group header="Items" footer={items.length ? 'Tap an item to start or stop its timer.' : undefined}>
        {visibleItems.map((item) => {
          const look = itemLook(item, project);
          const isRunning = running?.itemId === item.id;
          const s = stats.get(item.id);
          return (
            <ListRow
              key={item.id}
              icon={<IconTile emoji={look.emoji} color={look.color} />}
              title={
                <>
                  {item.name}
                  {item.archived && <span className="tag">Archived</span>}
                </>
              }
              subtitle={`${formatHours(s?.week ?? 0)} this week · ${formatMoney(resolveRate(item, project, settings), settings.currency)}/h`}
              onClick={() => void (isRunning ? stopTimer(running, settings) : startTimer(item.id, settings))}
              trailing={
                <>
                  <button
                    className="info-btn"
                    aria-label={`Edit ${item.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditItem(item);
                    }}
                  >
                    <Icon name="info" />
                  </button>
                  <span className={`play-btn ${isRunning ? 'on' : ''}`} style={{ ['--c' as string]: look.color }} aria-hidden="true">
                    <Icon name={isRunning ? 'stop' : 'play'} size={18} />
                  </span>
                </>
              }
            >
              <BudgetBars budget={item} totals={s?.all ?? emptyTotals()} currency={settings.currency} />
            </ListRow>
          );
        })}
        <ListRow title="Add Item" tone="tint" icon={<span className="row-icon"><Icon name="plus" /></span>} onClick={() => setEditItem('new')} />
        {items.length > 0 && (
          <ListRow
            title="Add Time Manually"
            tone="tint"
            icon={<span className="row-icon"><Icon name="timer" /></span>}
            onClick={() => setEditEntry('new')}
          />
        )}
      </Group>

      {items.some((i) => i.archived) && (
        <Group>
          <Cell label="Show Archived Items">
            <Switch checked={showArchived} onChange={setShowArchived} />
          </Cell>
        </Group>
      )}

      {recent.length > 0 && lookup && (
        <Group header="Recent Time">
          {recent.map((e) => {
            const item = lookup.items.get(e.itemId);
            const look = itemLook(item, project);
            const meta = [!e.billable && 'Non-billable', e.note].filter(Boolean).join(' · ');
            return (
              <ListRow
                key={e.id}
                icon={<IconTile emoji={look.emoji} color={look.color} />}
                title={item?.name}
                subtitle={
                  <>
                    {format(e.start, 'EEE d MMM, HH:mm')}
                    {e.end ? `–${format(e.end, 'HH:mm')}` : ' · running'}
                    {meta && <span className="row-note">{meta}</span>}
                  </>
                }
                trailing={<span className="row-value">{formatHours(entryHours(e, now))}</span>}
                chevron
                onClick={() => setEditEntry(e)}
              />
            );
          })}
        </Group>
      )}

      {editProject && <ProjectEditor project={project} onClose={() => setEditProject(false)} />}
      {editItem && <ItemEditor project={project} item={editItem === 'new' ? undefined : editItem} onClose={() => setEditItem(null)} />}
      {editEntry && (
        <EntryEditor
          entry={editEntry === 'new' ? undefined : editEntry}
          initial={editEntry === 'new' ? { itemId: visibleItems[0]?.id, start: now - 3_600_000, end: now } : undefined}
          onClose={() => setEditEntry(null)}
        />
      )}
    </>
  );
}
