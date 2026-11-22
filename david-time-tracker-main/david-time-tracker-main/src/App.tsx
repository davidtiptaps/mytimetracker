import { useEffect, useState } from 'react';
import { formatClock } from './lib/format';
import { useLookup, useNow, useRunning, useSettings } from './lib/hooks';
import { itemLook } from './lib/look';
import { stopTimer } from './lib/timer';
import type { Entry } from './lib/types';
import { EntryEditor } from './components/Editors';
import { Icon, IconTile } from './components/ui';
import { CalendarView } from './views/CalendarView';
import { ProjectView } from './views/ProjectView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { TrackView } from './views/TrackView';

function useHashRoute() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.slice(1).split('/').filter(Boolean);
}

const TABS = [
  { path: '', icon: 'timer', label: 'Track' },
  { path: 'calendar', icon: 'calendar', label: 'Calendar' },
  { path: 'reports', icon: 'doc', label: 'Reports' },
  { path: 'settings', icon: 'gear', label: 'Settings' },
] as const;

export function App() {
  const [section = '', param] = useHashRoute();
  const running = useRunning();

  let view;
  if (section === 'project' && param) view = <ProjectView projectId={param} />;
  else if (section === 'calendar') view = <CalendarView />;
  else if (section === 'reports') view = <ReportsView />;
  else if (section === 'settings') view = <SettingsView />;
  else view = <TrackView />;

  const activeTab = section === 'project' ? '' : section;

  return (
    <>
      <main className={`app ${running ? 'has-timer' : ''}`}>{view}</main>
      <div className="bottom-chrome">
        {running && <TimerAccessory entry={running} />}
        <nav className="tabbar glass">
          {TABS.map((t) => (
            <a key={t.path} href={`#/${t.path}`} className={activeTab === t.path ? 'active' : ''}>
              <Icon name={t.icon} size={24} />
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}

/** The running timer, floating above the tab bar like the Music mini player. */
function TimerAccessory({ entry }: { entry: Entry }) {
  const lookup = useLookup();
  const settings = useSettings();
  const now = useNow(true);
  const [editing, setEditing] = useState(false);
  const item = lookup?.items.get(entry.itemId);
  const project = item && lookup?.projects.get(item.projectId);
  const look = itemLook(item, project);

  return (
    <>
      <div className="accessory glass">
        <button className="accessory-main" onClick={() => setEditing(true)}>
          <IconTile emoji={look.emoji} color={look.color} />
          <span className="row-text">
            <span className="row-title">{item?.name ?? 'Deleted item'}</span>
            <span className="row-subtitle">{project?.name}</span>
          </span>
          <span className="clock" style={{ color: look.color }}>
            {formatClock(now - entry.start)}
          </span>
        </button>
        <button className="stop-btn" onClick={() => void stopTimer(entry, settings)} aria-label="Stop timer">
          <Icon name="stop" size={20} />
        </button>
      </div>
      {editing && <EntryEditor entry={entry} onClose={() => setEditing(false)} />}
    </>
  );
}
