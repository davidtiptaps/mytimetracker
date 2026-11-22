import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { budgetStatus, type Totals } from '../lib/calc';
import { firstGrapheme, formatHours, formatMoney } from '../lib/format';
import { useNow } from '../lib/hooks';
import { syncNow, useSyncState } from '../lib/sync';
import type { Budget } from '../lib/types';

export const COLORS = [
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7',
  '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93',
];

export const EMOJIS = [
  '🏠', '🏡', '🛠️', '🔨', '🪚', '🧱', '🎨', '🖌️', '🪴', '🍳', '🛁', '🚿', '🛏️', '🛋️', '🚪', '🪟',
  '💡', '🔌', '🚰', '🧰', '📐', '🧹', '🌳', '🚗', '💻', '📊', '📞', '✍️', '📚', '🎓', '💼', '⭐',
];

// Line icons drawn to sit alongside iOS's SF Symbols.
const ICONS: Record<string, ReactNode> = {
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.5-1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3h6.5L19 8.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M13.5 3v5.5H19M9 13h6M9 16.5h6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  chevronLeft: <path d="M15 5.5L8.5 12l6.5 6.5" />,
  xmark: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.6v.1" />
    </>
  ),
  share: <path d="M12 14V3.5M8 7.5l4-4 4 4M6 11H5.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H18" />,
  sync: <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.7M20 3.5v5.2h-5.2" />,
  play: <path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor" stroke="none" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor" stroke="none" />,
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Large-title header with floating glass buttons, like iOS navigation bars. */
export function NavHeader({
  title,
  back,
  trailing,
  showSync = true,
}: {
  title: ReactNode;
  back?: { href: string; label: string };
  trailing?: ReactNode;
  showSync?: boolean;
}) {
  return (
    <header className="nav">
      <div className="nav-bar">
        {back ? (
          <a className="glass-btn" href={back.href} aria-label={`Back to ${back.label}`}>
            <Icon name="chevronLeft" />
          </a>
        ) : (
          <span />
        )}
        <div className="nav-actions">{trailing}</div>
      </div>
      <h1 className="large-title">{title}</h1>
      {showSync && <SyncStatus />}
    </header>
  );
}

function SyncStatus() {
  const sync = useSyncState();
  useNow(true, 30000);
  const ago = sync.lastSync ? formatDistanceToNowStrict(sync.lastSync, { addSuffix: true }) : 'never';
  const map = {
    idle: sync.lastSync ? { cls: 'ok', text: `Synced ${ago}` } : { cls: '', text: 'Not synced yet' },
    syncing: { cls: '', text: 'Syncing…' },
    offline: { cls: 'warn', text: `Laptop offline · synced ${ago}` },
    unauthorized: { cls: 'bad', text: 'Wrong sync passcode' },
    'no-passcode': { cls: '', text: 'Sync not set up' },
    error: { cls: 'bad', text: `Sync error${'message' in sync && sync.message ? ` (${sync.message})` : ''}` },
  } as const;
  const { cls, text } = map[sync.status];
  return (
    <button
      className={`sync-status ${cls}`}
      onClick={() => (sync.status === 'no-passcode' || sync.status === 'unauthorized' ? (location.hash = '#/settings') : void syncNow())}
      title="Tap to sync now"
    >
      <span className="dot" />
      {text}
    </button>
  );
}

/** An inset grouped list section. */
export function Group({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="group">
      {header && <h2 className="group-header">{header}</h2>}
      <div className="group-body">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  );
}

/** A form row: label on the left, control on the right. */
export function Cell({ label, children, asDiv }: { label: ReactNode; children: ReactNode; asDiv?: boolean }) {
  const inner = (
    <>
      <span className="cell-label">{label}</span>
      <span className="cell-value">{children}</span>
    </>
  );
  return asDiv ? <div className="cell">{inner}</div> : <label className="cell">{inner}</label>;
}

/** A tappable list row with an optional icon, subtitle and trailing content. */
export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  chevron,
  tone,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  tone?: 'tint' | 'danger';
  children?: ReactNode;
}) {
  const onKey = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      className={`cell list-row ${onClick ? 'tappable' : ''} ${tone ?? ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKey}
    >
      {icon}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
        {children}
      </span>
      {trailing}
      {chevron && (
        <span className="chevron">
          <Icon name="chevronRight" size={16} />
        </span>
      )}
    </div>
  );
}

/** Rounded-square icon, like the ones in the Settings app. */
export function IconTile({ emoji, color, size = 'md' }: { emoji: string; color: string; size?: 'md' | 'lg' }) {
  return (
    <span className={`icon-tile ${size}`} style={{ background: color }}>
      {emoji}
    </span>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  onDone,
  doneDisabled,
  children,
}: {
  title: string;
  onClose: () => void;
  onDone?: () => void;
  doneDisabled?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-head">
          <button className="glass-btn" onClick={onClose} aria-label="Cancel">
            <Icon name="xmark" />
          </button>
          <h2>{title}</h2>
          {onDone ? (
            <button className="glass-btn prominent" onClick={onDone} disabled={doneDisabled} aria-label="Save">
              <Icon name="check" />
            </button>
          ) : (
            <span className="glass-spacer" />
          )}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  allowInherit,
}: {
  value: string;
  onChange: (c: string) => void;
  allowInherit?: boolean;
}) {
  return (
    <div className="swatches">
      {allowInherit && (
        <button
          type="button"
          className={`swatch inherit ${value === '' ? 'on' : ''}`}
          onClick={() => onChange('')}
          title="Same as project"
          aria-label="Same as project"
        />
      )}
      {COLORS.map((c) => (
        <button key={c} type="button" className={`swatch ${value === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
      <label className={`swatch custom ${value && !COLORS.includes(value) ? 'on' : ''}`} title="Custom color">
        <input type="color" value={value || '#888888'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="emoji-picker">
      <input
        className="emoji-input"
        value={value}
        placeholder="🙂"
        aria-label="Emoji"
        onChange={(e) => onChange(firstGrapheme(e.target.value.replace(value, '')) || firstGrapheme(e.target.value))}
      />
      <div className="emojis">
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={value === e ? 'on' : ''} onClick={() => onChange(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A right-aligned number field that maps an empty value to null. */
export function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="cell-input"
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
    />
  );
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Pick a duration in `step`-minute increments. The value is a plain
 * <select>, which shows as a scroll wheel on iPhone; the − / + stepper
 * nudges it by one step.
 */
export function DurationPicker({
  minutes,
  onChange,
  step = 15,
  max = 16 * 60,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  step?: number;
  max?: number;
}) {
  const options: number[] = [];
  for (let m = step; m <= max; m += step) options.push(m);
  // Keep an off-step value (like a 7-minute entry) selectable as-is.
  if (minutes > 0 && !options.includes(minutes)) {
    options.push(minutes);
    options.sort((a, b) => a - b);
  }
  const down = Math.max(step, Math.ceil(minutes / step) * step - step);
  const up = Math.min(max, Math.floor(minutes / step) * step + step);

  return (
    <span className="duration">
      <select className="cell-select" value={minutes} onChange={(e) => onChange(Number(e.target.value))} aria-label="Duration">
        {options.map((m) => (
          <option key={m} value={m}>
            {formatDuration(m)}
          </option>
        ))}
      </select>
      <span className="stepper">
        <button type="button" onClick={() => onChange(down)} disabled={minutes <= step} aria-label={`${step} minutes less`}>
          <Icon name="minus" size={18} />
        </button>
        <button type="button" onClick={() => onChange(up)} disabled={minutes >= max} aria-label={`${step} minutes more`}>
          <Icon name="plus" size={18} />
        </button>
      </span>
    </span>
  );
}

export function BudgetBars({ budget, totals, currency }: { budget: Budget; totals: Totals; currency: string }) {
  const statuses = budgetStatus(budget, totals);
  if (!statuses.length) return null;
  return (
    <span className="budgets">
      {statuses.map((s) => {
        const fmt = (v: number) => (s.kind === 'hours' ? formatHours(v) : formatMoney(v, currency));
        return (
          <span key={s.kind} className={`budget ${s.level}`}>
            <span className="bar">
              <span style={{ width: `${Math.min(100, s.fraction * 100)}%` }} />
            </span>
            <span className="budget-text">
              {fmt(s.used)} of {fmt(s.limit)}
              {s.level === 'over' ? ' · over budget' : s.level === 'warn' ? ` · ${Math.round(s.fraction * 100)}%` : ''}
            </span>
          </span>
        );
      })}
    </span>
  );
}
