import { useState } from 'react';
import { format } from 'date-fns';
import { HOUR, MINUTE, resolveRate } from '../lib/calc';
import { newId, remove, removeItem, removeProject, save } from '../lib/db';
import { currencySymbol, formatMoney } from '../lib/format';
import { useAllItems, useProjects, useSettings } from '../lib/hooks';
import { itemLook } from '../lib/look';
import type { Budget, Entry, EntryKind, Item, Project } from '../lib/types';
import { Cell, ColorPicker, COLORS, DurationPicker, EmojiPicker, Group, IconTile, ListRow, Modal, NumberInput, Segmented, Switch } from './ui';

function BudgetFields<T extends Budget>({ draft, set, sym }: { draft: T; set: (p: Partial<Budget>) => void; sym: string }) {
  return (
    <Group header="Budget" footer="You'll see a warning at 80% of a budget.">
      <Cell label="Hours">
        <NumberInput value={draft.budgetHours} onChange={(budgetHours) => set({ budgetHours })} placeholder="None" />
      </Cell>
      <Cell label={`Amount (${sym})`}>
        <NumberInput value={draft.budgetAmount} onChange={(budgetAmount) => set({ budgetAmount })} placeholder="None" />
      </Cell>
    </Group>
  );
}

export function ProjectEditor({ project, onClose }: { project?: Project; onClose: () => void }) {
  const settings = useSettings();
  const projects = useProjects(true) ?? [];
  const [draft, setDraft] = useState<Project>(
    project ?? {
      id: newId(),
      name: '',
      emoji: '🏠',
      color: COLORS[(6 + projects.length) % COLORS.length],
      rate: null,
      budgetHours: null,
      budgetAmount: null,
      order: projects.length,
      updatedAt: 0,
    },
  );
  const set = (patch: Partial<Project>) => setDraft((d) => ({ ...d, ...patch }));
  const sym = currencySymbol(settings.currency);

  const submit = async () => {
    if (!draft.name.trim()) return;
    await save('projects', { ...draft, name: draft.name.trim() });
    onClose();
  };

  return (
    <Modal title={project ? 'Edit Project' : 'New Project'} onClose={onClose} onDone={submit} doneDisabled={!draft.name.trim()}>
      <div className="hero">
        <IconTile emoji={draft.emoji || '🙂'} color={draft.color} size="lg" />
      </div>
      <Group>
        <input className="cell cell-text" value={draft.name} autoFocus={!project} placeholder="Name, e.g. Casita Work" onChange={(e) => set({ name: e.target.value })} />
      </Group>
      <Group header="Color">
        <div className="cell padded">
          <ColorPicker value={draft.color} onChange={(color) => set({ color })} />
        </div>
      </Group>
      <Group header="Emoji">
        <div className="cell padded">
          <EmojiPicker value={draft.emoji} onChange={(emoji) => set({ emoji })} />
        </div>
      </Group>
      <Group header="Rate" footer={`Used by items in this project that don't set their own. Leave blank to use the default (${formatMoney(settings.defaultRate, settings.currency)}/h).`}>
        <Cell label={`Hourly rate (${sym})`}>
          <NumberInput value={draft.rate} onChange={(rate) => set({ rate })} placeholder="Default" />
        </Cell>
      </Group>
      <BudgetFields draft={draft} set={set} sym={sym} />
      {project && (
        <>
          <Group footer="Archived projects are hidden from the Track screen but stay in reports.">
            <Cell label="Archived">
              <Switch checked={!!draft.archived} onChange={(archived) => set({ archived })} />
            </Cell>
          </Group>
          <Group>
            <ListRow
              title="Delete Project"
              tone="danger"
              onClick={async () => {
                if (confirm(`Delete "${project.name}", all its items and all logged time? This can't be undone.`)) {
                  await removeProject(project);
                  onClose();
                }
              }}
            />
          </Group>
        </>
      )}
    </Modal>
  );
}

export function ItemEditor({ item, project, onClose }: { item?: Item; project: Project; onClose: () => void }) {
  const settings = useSettings();
  const items = useAllItems() ?? [];
  const [draft, setDraft] = useState<Item>(
    item ?? {
      id: newId(),
      projectId: project.id,
      name: '',
      emoji: '',
      color: '',
      rate: null,
      budgetHours: null,
      budgetAmount: null,
      order: items.filter((i) => i.projectId === project.id).length,
      updatedAt: 0,
    },
  );
  const set = (patch: Partial<Item>) => setDraft((d) => ({ ...d, ...patch }));
  const sym = currencySymbol(settings.currency);
  const inherited = resolveRate(undefined, project, settings);
  const look = itemLook(draft, project);

  const submit = async () => {
    if (!draft.name.trim()) return;
    await save('items', { ...draft, name: draft.name.trim() });
    onClose();
  };

  return (
    <Modal title={item ? 'Edit Item' : 'New Item'} onClose={onClose} onDone={submit} doneDisabled={!draft.name.trim()}>
      <div className="hero">
        <IconTile emoji={look.emoji} color={look.color} size="lg" />
        <span className="hero-caption">in {project.name}</span>
      </div>
      <Group>
        <input className="cell cell-text" value={draft.name} autoFocus={!item} placeholder="Name, e.g. Kitchen" onChange={(e) => set({ name: e.target.value })} />
      </Group>
      <Group header="Color" footer="The striped circle uses the project's color.">
        <div className="cell padded">
          <ColorPicker value={draft.color} onChange={(color) => set({ color })} allowInherit />
        </div>
      </Group>
      <Group header="Emoji" footer="Leave it empty to use the project's emoji.">
        <div className="cell padded">
          <EmojiPicker value={draft.emoji} onChange={(emoji) => set({ emoji })} />
        </div>
      </Group>
      <Group header="Rate" footer={`Leave blank to use the project's rate (${formatMoney(inherited, settings.currency)}/h).`}>
        <Cell label={`Hourly rate (${sym})`}>
          <NumberInput value={draft.rate} onChange={(rate) => set({ rate })} placeholder="Project" />
        </Cell>
      </Group>
      <BudgetFields draft={draft} set={set} sym={sym} />
      {item && (
        <>
          <Group footer="Archived items are hidden from the project screen but stay in reports.">
            <Cell label="Archived">
              <Switch checked={!!draft.archived} onChange={(archived) => set({ archived })} />
            </Cell>
          </Group>
          <Group>
            <ListRow
              title="Delete Item"
              tone="danger"
              onClick={async () => {
                if (confirm(`Delete "${item.name}" and all its logged time? This can't be undone.`)) {
                  await removeItem(item);
                  onClose();
                }
              }}
            />
          </Group>
        </>
      )}
    </Modal>
  );
}

const toDate = (ms: number) => format(ms, 'yyyy-MM-dd');
const toTime = (ms: number) => format(ms, 'HH:mm');
const combine = (date: string, time: string) => new Date(`${date}T${time || '00:00'}`).getTime();

export interface EntryDraft {
  itemId?: string;
  kind?: EntryKind;
  start: number;
  end: number;
}

/** Create or edit a time entry or a planned block. */
export function EntryEditor({ entry, initial, onClose }: { entry?: Entry; initial?: EntryDraft; onClose: () => void }) {
  const projects = useProjects(true) ?? [];
  const items = useAllItems() ?? [];
  const running = entry?.end === null;
  const base = entry ?? {
    id: newId(),
    itemId: initial?.itemId ?? '',
    kind: initial?.kind ?? 'actual',
    start: initial?.start ?? Date.now() - HOUR,
    end: initial?.end ?? Date.now(),
    note: '',
    billable: true,
    updatedAt: 0,
  };
  const [itemId, setItemId] = useState(base.itemId);
  const [kind, setKind] = useState<EntryKind>(base.kind);
  const [date, setDate] = useState(toDate(base.start));
  const [startTime, setStartTime] = useState(toTime(base.start));
  const [endTime, setEndTime] = useState(toTime(base.end ?? Date.now()));
  const [note, setNote] = useState(base.note);
  const [billable, setBillable] = useState(base.billable);

  const start = combine(date, startTime);
  let end = combine(date, endTime);
  // An end time before the start means the block runs past midnight.
  if (end <= start) end += 24 * HOUR;
  const minutes = Math.round((end - start) / MINUTE);
  const resolvedItemId = itemId || items.find((i) => !i.archived)?.id || '';

  const build = (overrides: Partial<Entry> = {}): Entry => ({
    ...base,
    itemId: resolvedItemId,
    kind,
    start,
    end: running ? null : end,
    note: note.trim(),
    billable,
    ...overrides,
  });

  const submit = async () => {
    if (!resolvedItemId) return;
    await save('entries', build());
    onClose();
  };

  return (
    <Modal
      title={entry ? (kind === 'plan' ? 'Planned Work' : 'Time Entry') : 'Add Time'}
      onClose={onClose}
      onDone={submit}
      doneDisabled={!resolvedItemId}
    >
      <Segmented
        value={kind}
        onChange={setKind}
        disabled={running}
        options={[
          { value: 'actual', label: 'Worked' },
          { value: 'plan', label: 'Planned' },
        ]}
      />
      <Group footer={!resolvedItemId ? 'Create a project and an item first.' : undefined}>
        <Cell label="Item">
          <select className="cell-select" value={resolvedItemId} onChange={(e) => setItemId(e.target.value)}>
            {projects.map((p) => (
              <optgroup key={p.id} label={`${p.emoji} ${p.name}`}>
                {items
                  .filter((i) => i.projectId === p.id && (!i.archived || i.id === base.itemId))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.emoji || p.emoji} {i.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Cell>
      </Group>
      <Group footer={running ? 'The timer is still running.' : combine(date, endTime) <= start ? 'Ends the next day.' : undefined}>
        <Cell label="Date">
          <input className="cell-input pill-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Cell>
        <Cell label="Starts">
          <input className="cell-input pill-input" type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Cell>
        {!running && (
          <>
            <Cell label="Ends">
              <input className="cell-input pill-input" type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Cell>
            <Cell label="Duration" asDiv>
              <DurationPicker minutes={minutes} onChange={(m) => setEndTime(toTime(start + m * MINUTE))} />
            </Cell>
          </>
        )}
      </Group>
      <Group>
        <textarea className="cell cell-text note" value={note} placeholder="Note" onChange={(e) => setNote(e.target.value)} />
        <Cell label="Billable">
          <Switch checked={billable} onChange={setBillable} />
        </Cell>
      </Group>
      {entry && (
        <Group>
          {kind === 'plan' && (
            <ListRow
              title="Log as Worked"
              tone="tint"
              onClick={async () => {
                await save('entries', build({ id: newId(), kind: 'actual' }));
                onClose();
              }}
            />
          )}
          <ListRow
            title={kind === 'plan' ? 'Delete Plan' : 'Delete Entry'}
            tone="danger"
            onClick={async () => {
              if (confirm('Delete this entry?')) {
                await remove('entries', entry);
                onClose();
              }
            }}
          />
        </Group>
      )}
    </Modal>
  );
}
