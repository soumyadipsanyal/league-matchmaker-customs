export type Screen = 'tonight' | 'teams' | 'history' | 'stats' | 'roster' | 'settings';

export const SCREENS: { id: Screen; label: string }[] = [
  { id: 'tonight', label: 'Tonight' },
  { id: 'teams', label: 'Teams' },
  { id: 'history', label: 'Match history' },
  { id: 'stats', label: 'Stats' },
  { id: 'roster', label: 'Roster' },
  { id: 'settings', label: 'Settings' },
];

function Padlock({ open }: { open: boolean }) {
  return (
    <svg className="gl" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d={open ? 'M8 10.5V7.5a4 4 0 0 1 7.6-1.7' : 'M8 10.5V7.5a4 4 0 0 1 8 0v3'} />
      <path d="M12 14.5v2" />
    </svg>
  );
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0a1428" stroke="#c8aa6e" strokeWidth="1.5" />
      <path d="M7 24 24 7" stroke="#c8aa6e" strokeOpacity=".75" strokeWidth="3" strokeLinecap="round" />
      <circle cx="11" cy="20" r="4.2" fill="#2c68c4" stroke="#9cc8ff" strokeWidth="1.5" />
      <circle cx="21" cy="11" r="4.2" fill="#c8363d" stroke="#ffb0b2" strokeWidth="1.5" />
    </svg>
  );
}

interface Props {
  screen: Screen;
  unlocked: boolean;
  /** Unlocked with the master password. */
  organiser: boolean;
  onLockClick: () => void;
}

export function Header({ screen, unlocked, organiser, onLockClick }: Props) {
  return (
    <header className="hdr">
      <div className="wrap hdr-row">
        <a className="brand" href="#tonight">
          <Mark />
          <span>Thursday Customs</span>
        </a>
        <nav className="nav" aria-label="Screens">
          {SCREENS.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={screen === s.id ? 'page' : undefined}>
              {s.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          className={`lockbtn${unlocked ? ' open' : ''}${organiser ? ' org' : ''}`}
          onClick={onLockClick}
          aria-label={unlocked ? `Lock: hide the ratings${organiser ? ' and leave organiser mode' : ''}` : 'Unlock the ratings'}
        >
          <Padlock open={unlocked} />
          <span>{unlocked ? 'Lock' : 'Unlock'}</span>
          {organiser && <span className="orgtag">Organiser</span>}
        </button>
      </div>
    </header>
  );
}
