import { useEffect, useRef, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { anyTable, db, getMeta, save, setMeta, SYNCED_TABLES } from '../lib/db';
import { deliverFile } from '../lib/share';
import { CURRENCIES, currencySymbol, formatMoney, isValidCurrency } from '../lib/format';
import { useSettings } from '../lib/hooks';
import { syncNow, useSyncState } from '../lib/sync';
import type { Settings, SyncFields, TableName } from '../lib/types';
import { Cell, Group, ListRow, NavHeader, NumberInput } from '../components/ui';

const ROUNDING = [0, 5, 6, 10, 15, 30];

export function SettingsView() {
  const settings = useSettings();
  const update = (patch: Partial<Settings>) => void save('settings', { ...settings, ...patch });
  const [customCurrency, setCustomCurrency] = useState('');
  const isCustom = !CURRENCIES.includes(settings.currency);

  return (
    <>
      <NavHeader title="Settings" />

      <Group
        header="Money"
        footer={`Rates are looked up in this order: the item's rate, then its project's, then this default (now ${formatMoney(settings.defaultRate, settings.currency)}/h).`}
      >
        <Cell label="Currency">
          <select
            className="cell-select"
            value={isCustom ? 'other' : settings.currency}
            onChange={(e) => e.target.value !== 'other' && update({ currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} ({currencySymbol(c)})
              </option>
            ))}
            <option value="other">{isCustom ? `${settings.currency} (${currencySymbol(settings.currency)})` : 'Other…'}</option>
          </select>
        </Cell>
        <Cell label="Other Currency Code">
          <input
            className="cell-input code-input"
            placeholder="e.g. THB"
            maxLength={3}
            value={customCurrency}
            autoCapitalize="characters"
            onChange={(e) => setCustomCurrency(e.target.value.toUpperCase())}
          />
          {isValidCurrency(customCurrency) && (
            <button
              className="btn tinted small"
              onClick={() => {
                update({ currency: customCurrency });
                setCustomCurrency('');
              }}
            >
              Use
            </button>
          )}
        </Cell>
        <Cell label={`Default Rate (${currencySymbol(settings.currency)}/h)`}>
          <NumberInput value={settings.defaultRate} onChange={(v) => update({ defaultRate: v ?? 0 })} />
        </Cell>
      </Group>

      <Group
        header="Timer & Calendar"
        footer={
          settings.roundTimerMinutes > 0
            ? `When a timer stops, its time rounds up: 7 minutes becomes ${settings.roundTimerMinutes}, ${settings.roundTimerMinutes + 1} becomes ${settings.roundTimerMinutes * 2}.`
            : 'Timers keep their exact time.'
        }
      >
        <Cell label="Round Timers Up To">
          <select className="cell-select" value={settings.roundTimerMinutes} onChange={(e) => update({ roundTimerMinutes: Number(e.target.value) })}>
            {ROUNDING.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Off' : `${m} min`}
              </option>
            ))}
          </select>
        </Cell>
        <Cell label="Week Starts On">
          <select className="cell-select" value={settings.weekStart} onChange={(e) => update({ weekStart: Number(e.target.value) as 0 | 1 })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </Cell>
      </Group>

      <SyncSettings />
      <BackupSettings />
    </>
  );
}

function SyncSettings() {
  const sync = useSyncState();
  const [passcode, setPasscode] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    void getMeta('passcode', '').then((p) => {
      setPasscode(p);
      setSaved(p);
    });
  }, []);

  const status = {
    idle: { text: 'Connected', cls: 'ok' },
    syncing: { text: 'Syncing…', cls: '' },
    offline: { text: 'Laptop not reachable', cls: 'warn' },
    unauthorized: { text: 'Wrong passcode', cls: 'bad' },
    'no-passcode': { text: 'Not set up', cls: '' },
    error: { text: 'Error', cls: 'bad' },
  }[sync.status];

  return (
    <Group
      header="Sync With Laptop"
      footer="Everything is saved on this device first. When the laptop server is running and reachable over Tailscale, changes sync both ways in the background. The passcode is shown in the server window."
    >
      <Cell label="Passcode">
        <input
          className="cell-input"
          type="password"
          autoComplete="off"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value.trim())}
          placeholder="Required"
        />
        {(passcode !== saved || sync.status === 'unauthorized') && passcode && (
          <button
            className="btn tinted small"
            onClick={async () => {
              await setMeta('passcode', passcode);
              setSaved(passcode);
              await syncNow();
            }}
          >
            Save
          </button>
        )}
      </Cell>
      <Cell label="Status" asDiv>
        <span className={`status-text ${status.cls}`}>
          <span className="dot" />
          {status.text}
          {sync.lastSync && sync.status !== 'syncing' && (
            <span className="muted"> · {formatDistanceToNowStrict(sync.lastSync, { addSuffix: true })}</span>
          )}
        </span>
      </Cell>
      <ListRow title="Sync Now" tone="tint" onClick={saved ? () => void syncNow() : undefined} />
    </Group>
  );
}

function BackupSettings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const exportBackup = async () => {
    const data: Record<string, unknown[]> = {};
    for (const t of SYNCED_TABLES) data[t] = (await db[t].toArray()).map(({ dirty: _d, ...r }) => r);
    const blob = new Blob([JSON.stringify({ app: 'time-tracker', version: 1, exportedAt: Date.now(), data }, null, 2)], {
      type: 'application/json',
    });
    await deliverFile(blob, `time-tracker-backup_${format(Date.now(), 'yyyy-MM-dd')}.json`);
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== 'time-tracker') throw new Error('Not a Time Tracker backup');
      let count = 0;
      await db.transaction('rw', SYNCED_TABLES.map((t) => db[t]), async () => {
        for (const t of SYNCED_TABLES as TableName[]) {
          for (const rec of (parsed.data?.[t] ?? []) as SyncFields[]) {
            if (typeof rec?.id !== 'string' || typeof rec.updatedAt !== 'number') continue;
            const local = await anyTable(t).get(rec.id);
            // Keep whichever copy is newer, same as sync does.
            if (!local || rec.updatedAt > local.updatedAt) {
              await anyTable(t).put({ ...rec, dirty: 1 });
              count++;
            }
          }
        }
      });
      setMessage(`Restored ${count} records.`);
      void syncNow();
    } catch (e) {
      setMessage(`Couldn't import: ${(e as Error).message}`);
    }
  };

  return (
    <Group header="Backup" footer={message || "A JSON file with all projects, items and time. Importing merges it with what's here."}>
      <ListRow title="Export Backup" tone="tint" onClick={() => void exportBackup()} />
      <ListRow title="Import Backup" tone="tint" onClick={() => fileRef.current?.click()} />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importBackup(f);
          e.target.value = '';
        }}
      />
    </Group>
  );
}
