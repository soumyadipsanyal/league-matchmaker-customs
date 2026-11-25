import { useCallback, useEffect, useState } from 'react';
import lockedRoster from './data/roster.locked.json';
import { Footer } from './components/Footer.tsx';
import { Backdrop } from './components/Icons.tsx';
import { Header, SCREENS, type Screen } from './components/Header.tsx';
import { UnlockDialog } from './components/UnlockDialog.tsx';
import { runMatch } from './engine/client.ts';
import { DEFAULT_STEP_DROP, STEP_DROP_MAX, STEP_DROP_MIN } from './engine/constants.ts';
import { lineupKey } from './engine/lineup.ts';
import type { MatchPlayer } from './engine/matchmaker.ts';
import { slotsFor } from './engine/rating.ts';
import { backgroundFiles } from './lib/assets.ts';
import { decryptJson } from './lib/lock.ts';
import { mergeRoster, type LockedRosterFile, type Player, type SecretRoster } from './lib/roster.ts';
import { unscrambleJson } from './lib/scramble.ts';
import { load, save } from './lib/storage.ts';
import { validTeams, type Teams } from './lib/teams.ts';
import { RosterScreen } from './screens/RosterScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { TeamsScreen } from './screens/TeamsScreen.tsx';
import { TonightScreen } from './screens/TonightScreen.tsx';

const LOCKED = lockedRoster as unknown as LockedRosterFile;
const PUBLIC = LOCKED.players;
const PUB_BY_NAME = new Map(PUBLIC.map((p) => [p.name, p]));
/** Ratings for making teams: always available, only shown once unlocked. */
const ROSTER = new Map(mergeRoster(PUBLIC, unscrambleJson<SecretRoster>(LOCKED.scrambled)).map((p) => [p.name, p]));
const NAMES = new Set(PUBLIC.map((p) => p.name));
const OT_IDS = new Set(PUBLIC.flatMap((p) => p.ot.map((o) => `${p.name}:${o.key}`)));
const playerOf = (otId: string) => otId.slice(0, otId.lastIndexOf(':'));

interface SavedSelection {
  players: string[];
  ots: string[];
  games: number;
}

function readScreen(): Screen | null {
  const h = window.location.hash.replace(/^#\/?/, '');
  return SCREENS.some((s) => s.id === h) ? (h as Screen) : null;
}

function initialSelection() {
  const s = load<SavedSelection>('selection');
  return {
    players: new Set((s?.players ?? []).filter((n) => NAMES.has(n))),
    ots: new Set((s?.ots ?? []).filter((id) => OT_IDS.has(id))),
    games: s && [1, 2, 3].includes(s.games) ? s.games : 3,
  };
}

interface SavedSettings {
  drop: number;
  /** 'random', 'none' or a file under assets/backgrounds/. */
  background: string;
}

function initialSettings(): SavedSettings {
  const s = load<Partial<SavedSettings>>('settings');
  const d = s?.drop;
  const b = s?.background;
  return {
    drop: typeof d === 'number' && d >= STEP_DROP_MIN && d <= STEP_DROP_MAX ? d : DEFAULT_STEP_DROP,
    background: b === 'none' || (typeof b === 'string' && backgroundFiles.includes(b)) ? b : 'random',
  };
}

/** Chosen once per visit, so "random" doesn't change while you use the app. */
const RANDOM_BACKGROUND = backgroundFiles.length ? backgroundFiles[Math.floor(Math.random() * backgroundFiles.length)] : null;

const toMatchPlayers = (names: string[], roster: Map<string, Player>, allowed: ReadonlySet<string>, drop: number): MatchPlayer[] =>
  names.map((name) => ({
    name,
    slots: slotsFor(roster.get(name)!, allowed, drop).map((s) => ({ value: s.value, steps: s.steps, unlisted: s.unlisted, champ: s.champ })),
  }));

export function App() {
  const [screen, setScreen] = useState<Screen>(() => readScreen() ?? 'tonight');
  const [unlocked, setUnlocked] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [sel] = useState(initialSelection);
  const [selected, setSelected] = useState<Set<string>>(sel.players);
  const [ots, setOts] = useState<Set<string>>(sel.ots);
  const [games, setGames] = useState<number>(sel.games);
  const [settings] = useState(initialSettings);
  const [drop, setDrop] = useState<number>(settings.drop);
  const [background, setBackground] = useState<string>(settings.background);
  const [teams, setTeams] = useState<Teams | null>(() => validTeams(load('teams'), NAMES));
  const [gameIndex, setGameIndex] = useState(0);
  const [busy, setBusy] = useState<'' | 'make' | 'shuffle'>('');
  const [makeError, setMakeError] = useState('');
  const [notice, setNotice] = useState('');

  // Screens show numbers only when given this.
  const rated = unlocked ? ROSTER : null;

  useEffect(() => {
    const onHash = () => {
      const s = readScreen();
      if (s) {
        setScreen(s);
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => save('selection', { players: [...selected], ots: [...ots], games } satisfies SavedSelection), [selected, ots, games]);
  useEffect(() => save('settings', { drop, background } satisfies SavedSettings), [drop, background]);
  const backdrop = background === 'none' ? null : background === 'random' ? RANDOM_BACKGROUND : background;
  useEffect(() => save('teams', teams ? { games: teams.games, players: teams.players, allowed: teams.allowed } : null), [teams]);

  const go = (s: Screen) => {
    if (window.location.hash !== `#${s}`) window.location.hash = s;
    setScreen(s);
  };

  const unlock = useCallback(async (password: string) => {
    // Opening the password-locked copy proves the password; it holds the same ratings.
    await decryptJson<SecretRoster>(LOCKED.lock, password);
    setUnlocked(true);
    setDialog(false);
  }, []);

  const lock = () => {
    setUnlocked(false);
    setNotice('');
  };

  async function make() {
    const names = PUBLIC.filter((p) => selected.has(p.name)).map((p) => p.name);
    if (names.length < 10) return;
    const allowed = new Set([...ots].filter((id) => selected.has(playerOf(id))));
    setBusy('make');
    setMakeError('');
    try {
      const res = await runMatch({ players: toMatchPlayers(names, ROSTER, allowed, drop), games, mode: 'make' });
      setTeams((t) => ({
        games: res.games.map((g) => ({ blue: g.blue, red: g.red, out: g.out })),
        players: names,
        allowed: [...allowed],
        seq: (t?.seq ?? 0) + 1,
      }));
      setGameIndex(0);
      setNotice('');
      go('teams');
    } catch (e) {
      setMakeError(`Couldn't make teams: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function shuffle() {
    if (!teams) return;
    setBusy('shuffle');
    setNotice('');
    try {
      const allowed = new Set(teams.allowed);
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const res = await runMatch({
        players: toMatchPlayers(teams.players, ROSTER, allowed, drop),
        games: teams.games.length,
        mode: 'shuffle',
        seed,
        avoid: teams.games.map(lineupKey),
      });
      if (!res.changed) {
        setNotice('No other lineup is close enough to the fairest one, so these teams stay.');
      } else {
        setTeams((t) => (t ? { ...t, games: res.games.map((g) => ({ blue: g.blue, red: g.red, out: g.out })), seq: t.seq + 1 } : t));
        setNotice('Shuffled. Every game is still within 0.5 of its fairest lineup.');
      }
    } catch (e) {
      setNotice(`Couldn't shuffle: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  const toggle = (set: Set<string>, item: string) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  return (
    <>
      {backdrop && <Backdrop path={backdrop} />}
      <Header screen={screen} unlocked={unlocked} onLockClick={() => (unlocked ? lock() : setDialog(true))} />
      <main>
        {screen === 'tonight' && (
          <TonightScreen
            players={PUBLIC}
            rated={rated}
            selected={selected}
            ots={ots}
            games={games}
            busy={busy === 'make'}
            error={makeError}
            onTogglePlayer={(n) => setSelected((s) => toggle(s, n))}
            onToggleOt={(id) => setOts((s) => toggle(s, id))}
            onSelectAll={() => setSelected(new Set(NAMES))}
            onClear={() => setSelected(new Set())}
            onGames={setGames}
            onMake={make}
          />
        )}
        {screen === 'teams' && (
          <TeamsScreen
            teams={teams}
            pub={PUB_BY_NAME}
            rated={rated}
            drop={drop}
            gameIndex={teams ? Math.min(gameIndex, teams.games.length - 1) : 0}
            onGame={setGameIndex}
            onShuffle={shuffle}
            busy={busy === 'shuffle'}
            notice={notice}
          />
        )}
        {screen === 'roster' && <RosterScreen players={PUBLIC} rated={rated} drop={drop} />}
        {screen === 'settings' && <SettingsScreen players={PUBLIC} drop={drop} onDrop={setDrop} background={background} onBackground={setBackground} />}
      </main>
      <Footer />
      <UnlockDialog open={dialog} onClose={() => setDialog(false)} onUnlock={unlock} />
    </>
  );
}
