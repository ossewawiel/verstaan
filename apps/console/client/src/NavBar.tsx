// SPDX-License-Identifier: MPL-2.0
import { NavLink } from 'react-router-dom';
import { useStateQuery } from './api/queries';

const ROOMS: { to: string; label: string }[] = [
  { to: '/', label: 'Console' },
  { to: '/quests', label: 'Quests' },
  { to: '/playbook', label: 'Playbook' },
  { to: '/library', label: 'Library' },
  { to: '/glossary', label: 'Glossary' },
  { to: '/jobs', label: 'Jobs' },
];

export function NavBar() {
  const { data: model } = useStateQuery();
  // A fixed-width slot for the update time (issue 99: "no layout shift on update"): the clock
  // face is always eight characters (HH:MM:SS), so a changed timestamp never resizes the bar.
  const updated = model ? new Date(model.generated).toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--';

  return (
    <header className="cic-bar snub">
      <span className="cic-bar__sigil" aria-hidden="true">
        ▲
      </span>
      <span className="cic-bar__id">
        <span className="cic-bar__proj">Verstaan</span>
        <span className="cic-bar__sub">Console</span>
      </span>
      <nav className="cic-bar__nav" aria-label="Rooms">
        {ROOMS.map((r) => (
          <NavLink key={r.to} to={r.to} end={r.to === '/'} className={({ isActive }) => `cic-bar__link${isActive ? ' cic-bar__here' : ''}`}>
            {r.label}
          </NavLink>
        ))}
      </nav>
      <span className="cic-bar__clock" aria-label="Last updated" title="Last updated">
        {updated}
      </span>
    </header>
  );
}
