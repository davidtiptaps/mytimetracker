import { Fragment, useMemo, useState } from 'react';
import {
  addDays, endOfMonth, endOfWeek, endOfYear, format, startOfDay, startOfMonth, startOfWeek, startOfYear, subMonths, subWeeks,
} from 'date-fns';
import { buildReport, entryHours } from '../lib/calc';
import type { ReportData } from '../lib/export';
import { formatHours, formatMoney } from '../lib/format';
import { useEntries, useLookup, useProjects, useSettings } from '../lib/hooks';
import { itemLook } from '../lib/look';
import { Cell, Group, Icon, IconTile, ListRow, NavHeader, Switch } from '../components/ui';

type Preset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'this-year' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'this-week', label: 'This Week' },
  { id: 'last-week', label: 'Last Week' },
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'this-year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

const day = (d: Date) => format(d, 'yyyy-MM-dd');

export function ReportsView() {
  const projects = useProjects(true);
  const entries = useEntries();
  const lookup = useLookup();
  const settings = useSettings();
  const [preset, setPreset] = useState<Preset>('this-month');
  const [custom, setCustom] = useState({ from: day(startOfMonth(new Date())), to: day(new Date()) });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showEntries, setShowEntries] = useState(false);
  const [busy, setBusy] = useState(false);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const opts = { weekStartsOn: settings.weekStart };
    const span = (a: Date, b: Date) => ({ from: startOfDay(a).getTime(), to: addDays(startOfDay(b), 1).getTime() });
    switch (preset) {
      case 'this-week':
        return span(startOfWeek(now, opts), endOfWeek(now, opts));
      case 'last-week':
        return span(startOfWeek(subWeeks(now, 1), opts), endOfWeek(subWeeks(now, 1), opts));
      case 'this-month':
        return span(startOfMonth(now), endOfMonth(now));
      case 'last-month':
        return span(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)));
      case 'this-year':
        return span(startOfYear(now), endOfYear(now));
      case 'custom': {
        const a = new Date(`${custom.from}T00:00`);
        const b = new Date(`${custom.to}T00:00`);
        return a <= b ? span(a, b) : span(b, a);
      }
    }
  }, [preset, custom, settings.weekStart]);

  const report: ReportData | null = useMemo(() => {
    if (!entries || !lookup || !projects) return null;
    const ids = new Set(projects.map((p) => p.id).filter((id) => !excluded.has(id)));
    return { ...buildReport(entries, lookup, ids, from, to), from, to, lookup };
  }, [entries, lookup, projects, excluded, from, to]);

  if (!projects || !report) return null;
  const money = (v: number) => formatMoney(v, settings.currency);
  const empty = report.groups.length === 0;

  const exportAs = async (kind: 'pdf' | 'csv') => {
    setBusy(true);
    try {
      // The PDF library is large, so it only loads when someone exports.
      const ex = await import('../lib/export');
      if (kind === 'pdf') await ex.deliverFile(ex.reportPdf(report), ex.pdfFilename(report));
      else await ex.deliverFile(ex.reportCsv(report), ex.csvFilename(report));
    } finally {
      setBusy(false);
    }
  };

  const toggleProject = (id: string) =>
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <NavHeader title="Reports" />

      <Group header="Period" footer={`${format(from, 'd MMM yyyy')} – ${format(to - 1, 'd MMM yyyy')}`}>
        <Cell label="Show">
          <select className="cell-select" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Cell>
        {preset === 'custom' && (
          <>
            <Cell label="From">
              <input className="cell-input pill-input" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </Cell>
            <Cell label="To">
              <input className="cell-input pill-input" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </Cell>
          </>
        )}
      </Group>

      {projects.length > 0 && (
        <Group
          header={
            <span className="spread">
              Projects
              <button className="header-btn" onClick={() => setExcluded(excluded.size ? new Set() : new Set(projects.map((p) => p.id)))}>
                {excluded.size ? 'Select All' : 'Deselect All'}
              </button>
            </span>
          }
        >
          {projects.map((p) => (
            <ListRow
              key={p.id}
              icon={<IconTile emoji={p.emoji} color={p.color} />}
              title={
                <>
                  {p.name}
                  {p.archived && <span className="tag">Archived</span>}
                </>
              }
              onClick={() => toggleProject(p.id)}
              trailing={<span className="checkmark">{!excluded.has(p.id) && <Icon name="check" />}</span>}
            />
          ))}
        </Group>
      )}

      <Group header="Summary">
        <Cell label="Worked" asDiv>
          <span className="row-value">{formatHours(report.totals.hours)}</span>
        </Cell>
        <Cell label="Planned" asDiv>
          <span className="row-value">{formatHours(report.totals.plannedHours)}</span>
        </Cell>
        <Cell label="Billable" asDiv>
          <span className="row-value">{formatHours(report.totals.billableHours)}</span>
        </Cell>
        <Cell label={<strong>Amount</strong>} asDiv>
          <strong className="row-value strong">{money(report.totals.amount)}</strong>
        </Cell>
      </Group>

      <div className="button-row">
        <button className="btn prominent" disabled={busy || empty} onClick={() => void exportAs('pdf')}>
          <Icon name="share" size={18} /> Export PDF
        </button>
        <button className="btn tinted" disabled={busy || empty} onClick={() => void exportAs('csv')}>
          Export CSV
        </button>
      </div>

      {empty ? (
        <div className="empty small">
          <p>No time in this period for the selected projects.</p>
        </div>
      ) : (
        <Group header="Breakdown">
          <div className="table-wrap">
            <table className="report">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Planned</th>
                  <th>Worked</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.groups.map((g) => (
                  <Fragment key={g.project.id}>
                    <tr className="group-row">
                      <td>
                        {g.project.emoji} {g.project.name}
                      </td>
                      <td>{formatHours(g.totals.plannedHours)}</td>
                      <td>{formatHours(g.totals.hours)}</td>
                      <td>{money(g.totals.amount)}</td>
                    </tr>
                    {g.rows.map((row) => {
                      const look = itemLook(row.item, g.project);
                      const diff = row.totals.hours - row.totals.plannedHours;
                      return (
                        <tr key={row.item.id}>
                          <td>
                            <span className="color-dot" style={{ background: look.color }} />
                            {row.item.name}
                            <div className="sub">{money(row.rate)}/h</div>
                          </td>
                          <td>{formatHours(row.totals.plannedHours)}</td>
                          <td>
                            {formatHours(row.totals.hours)}
                            {row.totals.plannedHours > 0 && (
                              <div className="sub">
                                {diff >= 0 ? '+' : '−'}
                                {formatHours(Math.abs(diff))}
                              </div>
                            )}
                          </td>
                          <td>{money(row.totals.amount)}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Group>
      )}

      {!empty && (
        <Group>
          <Cell label="Show Every Entry">
            <Switch checked={showEntries} onChange={setShowEntries} />
          </Cell>
          {showEntries &&
            report.groups
              .flatMap((g) => g.rows.flatMap((row) => row.entries.map((e) => ({ e, g, row }))))
              .sort((a, b) => a.e.start - b.e.start)
              .map(({ e, g, row }) => {
                const look = itemLook(row.item, g.project);
                return (
                  <ListRow
                    key={e.id}
                    icon={<IconTile emoji={look.emoji} color={look.color} />}
                    title={
                      <>
                        {row.item.name}
                        {e.kind === 'plan' && <span className="tag">Planned</span>}
                      </>
                    }
                    subtitle={
                      <>
                        {format(e.start, 'EEE d MMM, HH:mm')}
                        {e.end && `–${format(e.end, 'HH:mm')}`}
                        {e.note && <span className="row-note">{e.note}</span>}
                      </>
                    }
                    trailing={<span className="row-value">{formatHours(entryHours(e))}</span>}
                  />
                );
              })}
        </Group>
      )}
    </>
  );
}
