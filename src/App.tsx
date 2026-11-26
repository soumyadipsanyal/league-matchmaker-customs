import { useCallback, useEffect, useMemo, useState } from 'react';
import lockedRoster from './data/roster.locked.json';
import recordsJson from './data/match-records.json';
import saveLockJson from './data/save-lock.json';
import { Footer } from './components/Footer.tsx';
import { Backdrop } from './components/Icons.tsx';
import { Header, SCREENS, type Screen } from './components/Header.tsx';
import { UnlockDialog } from './components/UnlockDialog.tsx';
import { runMatch } from './engine/client.ts';
import { DEFAULT_STEP_DROP, STEP_DROP_MAX, STEP_DROP_MIN } from './engine/constants.ts';
import { lineupKey } from './engine/lineup.ts';
import { buildMatchPlayers, cleanAdjustments, type Adjustments } from './lib/adjust.ts';
import { backgroundFiles } from './lib/assets.ts';
import { readRecords, saveGame, SaveError, type SaveTarget } from './lib/github.ts';
import { nightLabel } from './lib/history.ts';
import { decryptJson, WrongPasswordError } from './lib/lock.ts';
import { emptyRecords, mergeRecords, nightDate, nightState, recordKey, toRecordGame, validateRecords, type RecordsFile } from './lib/records.ts';
import { mergeRoster, type LockedRosterFile, type SecretRoster } from './lib/roster.ts';
import type { SaveLockFile, SaveSecret } from './lib/savelock.ts';
import { unscrambleJson } from './lib/scramble.ts';
import { load, save } from './lib/storage.ts';
import { validTeams, type Teams } from './lib/teams.ts';
import { HistoryScreen } from './screens/HistoryScreen.tsx';
import { RosterScreen } from './screens/RosterScreen.tsx';
import { StatsScreen } from './screens/StatsScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { TeamsScreen, type SaveStatus } from './screens/TeamsScreen.tsx';
import { TonightScreen } from './screens/TonightScreen.tsx';

const LOCKED = lockedRoster as unknown as LockedRosterFile;
const PUBLIC = LOCKED.players;
const PUB_BY_NAME = new Map(PUBLIC.map((p) => [p.name, p]));
/** Ratings for making teams: always available, only shown once unlocked. */
const ROSTER = new Map(mergeRoster(PUBLIC, unscrambleJson<SecretRoster>(LOCKED.scrambled)).map((p) => [p.name, p]));
const NAMES = new Set(PUBLIC.map((p) => p.name));
const MAINS = new Map(PUBLIC.map((p) => [p.name, p.mains]));
const OT_IDS = new Set(PUBLIC.flatMap((p) => p.ot.map((o) => `${p.name}:${o.key}`)));
const playerOf = (otId: string) => otId.slice(0, otId.lastIndexOf(':'));

const SAVE_LOCK = saveLockJson as unknown as SaveLockFile;
const TARGET: SaveTarget = { repo: SAVE_LOCK.repo, branch: SAVE_LOCK.branch, path: SAVE_LOCK.path };
/** The records as built into this version of the site. */
const BUNDLED_RECORDS: RecordsFile = validateRecords(recordsJson).length ? emptyRecords() : (recordsJson as RecordsFile);

interface SavedSelection {
  players: string[];
  ots: string[];
  games: number;
  /** Tonight's adjustments: percentage lower, by player. */
  adjust?: Adjustments;
  /** "Use today's match record" is pressed in. */
  useRecord?: boolean;
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
    adjust: cleanAdjustments(s?.adjust, NAMES),
    useRecord: s?.useRecord === true,
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

/** The latest copy of the records this device has seen (from GitHub or its own saves). */
function initialRecordsCache(): RecordsFile {
  const c = load<unknown>('records-cache');
  return c && validateRecords(c).length === 0 ? (c as RecordsFile) : emptyRecords();
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new SaveError("GitHub didn't answer in time.")), ms))]);

/** Chosen once per visit, so "random" doesn't change while you use the app. */
const RANDOM_BACKGROUND = backgroundFiles.length ? backgroundFiles[Math.floor(Math.random() * backgroundFiles.length)] : null;

export function App() {
  const [screen, setScreen] = useState<Screen>(() => readScreen() ?? 'tonight');
  const [unlocked, setUnlocked] = useState(false);
  /** Set when the master password was used: the organiser's save token (or null if not set up). */
  const [organiser, setOrganiser] = useState<{ token: string | null } | null>(null);
  const [dialog, setDialog] = useState(false);
  const [sel] = useState(initialSelection);
  const [selected, setSelected] = useState<Set<string>>(sel.players);
  const [ots, setOts] = useState<Set<string>>(sel.ots);
  const [games, setGames] = useState<number>(sel.games);
  const [adjust, setAdjust] = useState<Adjustments>(sel.adjust);
  const [useRecord, setUseRecord] = useState<boolean>(sel.useRecord);
  // Who was off their main role in the last game of teams made on this visit.
  // Kept in memory only, so a refresh starts afresh.
  const [owed, setOwed] = useState<string[]>([]);
  const [settings] = useState(initialSettings);
  const [drop, setDrop] = useState<number>(settings.drop);
  const [background, setBackground] = useState<string>(settings.background);
  const [teams, setTeams] = useState<Teams | null>(() => validTeams(load('teams'), NAMES));
  const [gameIndex, setGameIndex] = useState(0);
  const [busy, setBusy] = useState<'' | 'make' | 'shuffle'>('');
  const [makeError, setMakeError] = useState('');
  const [notice, setNotice] = useState('');
  const [recordsCache, setRecordsCache] = useState<RecordsFile>(initialRecordsCache);
  const [recordsNote, setRecordsNote] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);

  // Screens show numbers only when given this.
  const rated = unlocked ? ROSTER : null;
  const records = useMemo(() => mergeRecords(BUNDLED_RECORDS, recordsCache), [recordsCache]);
  const today = nightDate();
  const todayState = useMemo(() => nightState(records.nights.find((n) => n.date === today), MAINS), [records, today]);

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

  useEffect(
    () => save('selection', { players: [...selected], ots: [...ots], games, adjust, useRecord } satisfies SavedSelection),
    [selected, ots, games, adjust, useRecord],
  );
  useEffect(() => save('settings', { drop, background } satisfies SavedSettings), [drop, background]);
  useEffect(() => save('records-cache', recordsCache), [recordsCache]);
  const backdrop = background === 'none' ? null : background === 'random' ? RANDOM_BACKGROUND : background;
  useEffect(
    () =>
      save(
        'teams',
        teams
          ? { games: teams.games, players: teams.players, allowed: teams.allowed, adjust: teams.adjust, priority: teams.priority, history: teams.history }
          : null,
      ),
    [teams],
  );

  /** Today's record straight from GitHub (so saves from any device count at once). */
  const refreshRecords = useCallback(async (): Promise<RecordsFile> => {
    try {
      const { file } = await withTimeout(readRecords(TARGET, organiser?.token), 6000);
      setRecordsCache(file);
      setRecordsNote('');
      return mergeRecords(BUNDLED_RECORDS, file);
    } catch {
      setRecordsNote("Couldn't reach GitHub just now, so this uses the games this device knows about.");
      return mergeRecords(BUNDLED_RECORDS, recordsCache);
    }
  }, [organiser, recordsCache]);

  useEffect(() => {
    if (useRecord) void refreshRecords();
    // Only when the button is pressed in (or on load with it pressed in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRecord]);

  const go = (s: Screen) => {
    if (window.location.hash !== `#${s}`) window.location.hash = s;
    setScreen(s);
  };

  const unlock = useCallback(async (password: string) => {
    // Try both locks at once: the normal password opens the ratings, the master password the organiser's lock.
    const [normal, master] = await Promise.allSettled([decryptJson<SecretRoster>(LOCKED.lock, password), decryptJson<SaveSecret>(SAVE_LOCK.lock, password)]);
    if (master.status === 'fulfilled') {
      setOrganiser({ token: master.value.token });
      setUnlocked(true);
      setDialog(false);
      return;
    }
    if (normal.status === 'fulfilled') {
      setOrganiser(null);
      setUnlocked(true);
      setDialog(false);
      return;
    }
    const err = normal.reason instanceof WrongPasswordError ? normal.reason : master.reason;
    throw err instanceof Error ? err : new WrongPasswordError();
  }, []);

  const lock = () => {
    setUnlocked(false);
    setOrganiser(null);
    setSaveStatus(null);
    setNotice('');
  };

  async function make() {
    const names = PUBLIC.filter((p) => selected.has(p.name)).map((p) => p.name);
    if (names.length < 10) return;
    const allowed = new Set([...ots].filter((id) => selected.has(playerOf(id))));
    const tonight = cleanAdjustments(adjust, NAMES, names);
    setBusy('make');
    setMakeError('');
    try {
      let priority = owed.filter((n) => names.includes(n));
      let history: Teams['history'];
      if (useRecord) {
        const fresh = await refreshRecords();
        const st = nightState(
          fresh.nights.find((n) => n.date === nightDate()),
          MAINS,
        );
        history = { satOut: st.satOut, lastOut: st.lastOut };
        priority = st.owed.filter((n) => names.includes(n));
      }
      const res = await runMatch({ players: buildMatchPlayers(names, ROSTER, allowed, drop, tonight), games, mode: 'make', priority, history });
      setTeams((t) => ({
        games: res.games.map((g) => ({ blue: g.blue, red: g.red, out: g.out })),
        players: names,
        allowed: [...allowed],
        adjust: tonight,
        priority,
        history,
        seq: (t?.seq ?? 0) + 1,
      }));
      setOwed(res.owed);
      setGameIndex(0);
      setNotice('');
      setSaveStatus(null);
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
        players: buildMatchPlayers(teams.players, ROSTER, allowed, drop, teams.adjust),
        games: teams.games.length,
        mode: 'shuffle',
        seed,
        avoid: teams.games.map(lineupKey),
        priority: teams.priority,
        history: teams.history,
      });
      if (!res.changed) {
        setNotice('No other lineup is close enough to the fairest one, so these teams stay.');
      } else {
        setTeams((t) => (t ? { ...t, games: res.games.map((g) => ({ blue: g.blue, red: g.red, out: g.out })), seq: t.seq + 1 } : t));
        setOwed(res.owed);
        setSaveStatus(null);
        setNotice('Shuffled. Every game is still within 0.5 of its fairest lineup.');
      }
    } catch (e) {
      setNotice(`Couldn't shuffle: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  /** Organiser only: adds the game on screen to today's match record on GitHub. */
  async function saveShown() {
    if (!organiser || !teams) return;
    const game = toRecordGame(teams.games[Math.min(gameIndex, teams.games.length - 1)]);
    const key = recordKey(game);
    if (!organiser.token) {
      setSaveStatus({ key, state: 'error', message: "Saving isn't set up yet: the GitHub save token still needs adding (see the README, npm run set-save-token)." });
      return;
    }
    setSaveStatus({ key, state: 'saving', message: 'Saving to GitHub…' });
    try {
      const date = nightDate();
      const res = await saveGame(TARGET, organiser.token, date, game);
      setRecordsCache(res.file);
      setSaveStatus({
        key,
        state: 'saved',
        message: res.already
          ? `Already saved as game ${res.number} of ${nightLabel(date)}.`
          : `Saved as game ${res.number} of ${nightLabel(date)}. It shows in Match history for everyone in about 2 minutes.`,
      });
    } catch (e) {
      setSaveStatus({ key, state: 'error', message: e instanceof SaveError ? e.message : `Couldn't save: ${(e as Error).message}` });
    }
  }

  const toggle = (set: Set<string>, item: string) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  const shownGame = teams ? teams.games[Math.min(gameIndex, teams.games.length - 1)] : null;
  const todaysGames = records.nights.find((n) => n.date === today)?.games ?? [];
  const savedAs = shownGame ? todaysGames.findIndex((g) => recordKey(g) === recordKey(toRecordGame(shownGame))) + 1 : 0;

  return (
    <>
      {backdrop && <Backdrop path={backdrop} />}
      <Header screen={screen} unlocked={unlocked} organiser={Boolean(organiser)} onLockClick={() => (unlocked ? lock() : setDialog(true))} />
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
            adjust={adjust}
            owed={useRecord ? todayState.owed : owed}
            useRecord={useRecord}
            onUseRecord={() => setUseRecord((u) => !u)}
            today={{ label: nightLabel(today), games: todayState.games, lastOut: todayState.lastOut, owed: todayState.owed, note: recordsNote }}
            onAdjust={(name, pct) => setAdjust((a) => cleanAdjustments({ ...a, [name]: pct }, NAMES))}
            onResetAdjust={() => setAdjust({})}
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
            onGame={(i) => {
              setGameIndex(i);
              setSaveStatus(null);
            }}
            onShuffle={shuffle}
            busy={busy === 'shuffle'}
            notice={notice}
            organiser={Boolean(organiser)}
            savedAs={savedAs}
            saveStatus={saveStatus && shownGame && saveStatus.key === recordKey(toRecordGame(shownGame)) ? saveStatus : null}
            onSave={saveShown}
          />
        )}
        {screen === 'history' && <HistoryScreen records={records} />}
        {screen === 'stats' && <StatsScreen />}
        {screen === 'roster' && <RosterScreen players={PUBLIC} rated={rated} drop={drop} />}
        {screen === 'settings' && <SettingsScreen players={PUBLIC} drop={drop} onDrop={setDrop} background={background} onBackground={setBackground} />}
      </main>
      <Footer />
      <UnlockDialog open={dialog} onClose={() => setDialog(false)} onUnlock={unlock} />
    </>
  );
}
