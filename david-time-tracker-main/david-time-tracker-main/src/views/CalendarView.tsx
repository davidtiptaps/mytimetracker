import { useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventApi, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core';
import { entryHours } from '../lib/calc';
import { save } from '../lib/db';
import { formatHours } from '../lib/format';
import { useEntries, useLookup, useNow, useProjects, useSettings } from '../lib/hooks';
import { itemLook } from '../lib/look';
import type { Entry } from '../lib/types';
import { EntryEditor, type EntryDraft } from '../components/Editors';
import { Icon, NavHeader, Segmented } from '../components/ui';

const VIEWS = [
  { id: 'timeGridDay', label: 'Day' },
  { id: 'timeGrid3', label: '3 days' },
  { id: 'timeGridWeek', label: 'Week' },
  { id: 'dayGridMonth', label: 'Month' },
];

export function CalendarView() {
  const entries = useEntries();
  const lookup = useLookup();
  const projects = useProjects(true);
  const settings = useSettings();
  const now = useNow(true, 60000);
  const calRef = useRef<FullCalendar>(null);
  const [view, setView] = useState(() => (window.innerWidth < 700 ? 'timeGrid3' : 'timeGridWeek'));
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ entry?: Entry; initial?: EntryDraft } | null>(null);

  const visible = useMemo(() => {
    if (!entries || !lookup) return [];
    return entries.filter((e) => {
      const projectId = lookup.items.get(e.itemId)?.projectId;
      return projectId && !hidden.has(projectId);
    });
  }, [entries, lookup, hidden]);

  const events: EventInput[] = useMemo(() => {
    if (!lookup) return [];
    return visible.map((e) => {
      const item = lookup.items.get(e.itemId);
      const project = item && lookup.projects.get(item.projectId);
      const look = itemLook(item, project);
      const running = e.end === null;
      return {
        id: e.id,
        start: e.start,
        end: running ? Math.max(now, e.start + 15 * 60000) : e.end!,
        title: item?.name ?? '?',
        backgroundColor: look.color,
        borderColor: look.color,
        classNames: [e.kind === 'plan' ? 'plan' : 'actual', running ? 'running' : ''],
        editable: !running,
        extendedProps: { entry: e, emoji: look.emoji, color: look.color, project: project?.name },
      };
    });
  }, [visible, lookup, now]);

  const summary = useMemo(() => {
    let worked = 0;
    let planned = 0;
    if (range) {
      for (const e of visible) {
        if (e.start < range.start || e.start >= range.end) continue;
        if (e.kind === 'plan') planned += entryHours(e, now);
        else worked += entryHours(e, now);
      }
    }
    return { worked, planned };
  }, [visible, range, now]);

  const onSelect = (info: DateSelectArg) => {
    calRef.current?.getApi().unselect();
    const start = info.start.getTime();
    let end = info.end.getTime();
    // A tap in month view selects a whole day; turn it into a 1-hour block.
    if (info.allDay) {
      const at = new Date(start);
      at.setHours(9);
      end = at.getTime() + 3_600_000;
      return setEditing({ initial: { start: at.getTime(), end, kind: at.getTime() > Date.now() ? 'plan' : 'actual' } });
    }
    // Blocks in the future default to "planned".
    setEditing({ initial: { start, end, kind: start > Date.now() ? 'plan' : 'actual' } });
  };

  const onMove = async (event: EventApi) => {
    const entry = event.extendedProps.entry as Entry;
    if (!event.start) return;
    const start = event.start.getTime();
    const end = event.end ? event.end.getTime() : start + ((entry.end ?? start) - entry.start);
    await save('entries', { ...entry, start, end });
  };

  return (
    <>
      <NavHeader
        title="Calendar"
        trailing={
          <button className="glass-btn" onClick={() => setEditing({ initial: { start: Date.now() - 3_600_000, end: Date.now() } })} aria-label="Add time">
            <Icon name="plus" />
          </button>
        }
      />

      <Segmented
        value={view}
        onChange={(v) => {
          setView(v);
          calRef.current?.getApi().changeView(v);
        }}
        options={VIEWS.map((v) => ({ value: v.id, label: v.label }))}
      />
      <p className="caption">
        Worked {formatHours(summary.worked)} · Planned {formatHours(summary.planned)}
      </p>

      {projects && projects.length > 1 && (
        <div className="chips">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`chip ${hidden.has(p.id) ? '' : 'on'}`}
              style={{ ['--c' as string]: p.color }}
              onClick={() =>
                setHidden((h) => {
                  const next = new Set(h);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  return next;
                })
              }
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="calendar-card">
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={view}
          views={{ timeGrid3: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 days' } }}
          headerToolbar={{ left: 'title', center: '', right: 'today prev,next' }}
          buttonText={{ today: 'Today' }}
          titleFormat={{ month: 'long', year: 'numeric' }}
          firstDay={settings.weekStart}
          height={Math.max(480, window.innerHeight - 340)}
          allDaySlot={false}
          nowIndicator
          selectable
          selectMirror
          editable
          eventResizableFromStart
          longPressDelay={350}
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          scrollTime="07:00:00"
          slotLabelFormat={{ hour: 'numeric', minute: '2-digit', omitZeroMinute: true }}
          dayHeaderFormat={view === 'dayGridMonth' ? { weekday: 'short' } : { weekday: 'short', day: 'numeric' }}
          events={events}
          select={onSelect}
          eventClick={(info: EventClickArg) => setEditing({ entry: info.event.extendedProps.entry as Entry })}
          eventDrop={(info) => void onMove(info.event)}
          eventResize={(info) => void onMove(info.event)}
          datesSet={(info) => setRange({ start: info.start.getTime(), end: info.end.getTime() })}
          eventDidMount={(info) => info.el.style.setProperty('--ev', info.event.extendedProps.color as string)}
          eventContent={renderEvent}
        />
        <div className="legend">
          <span>
            <i />
            Worked
          </span>
          <span>
            <i className="plan" />
            Planned
          </span>
          <span>Drag on empty space to add (long-press on iPhone)</span>
        </div>
      </div>

      {editing && <EntryEditor entry={editing.entry} initial={editing.initial} onClose={() => setEditing(null)} />}
    </>
  );
}

function renderEvent(arg: EventContentArg) {
  const { entry, emoji } = arg.event.extendedProps as { entry: Entry; emoji: string };
  return (
    <div className="ev">
      <div className="t">
        {emoji} {arg.event.title}
        {entry.end === null && ' ⏱'}
      </div>
      {arg.view.type !== 'dayGridMonth' && <div className="n">{arg.timeText}</div>}
      {entry.note && <div className="n">{entry.note}</div>}
    </div>
  );
}
