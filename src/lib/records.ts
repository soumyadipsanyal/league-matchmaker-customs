/**
 * Today's match record: the games the organiser saved (names, roles and who
 * sat out), kept in src/data/match-records.json in the repo. Shown in Match
 * history, and used by "Use today's match record" so later teams that day
 * carry on from them: nobody sits out twice running, sit-outs stay fair
 * across the night, and nobody is off their main role twice running.
 */
import { ROLES, isRole, type Role } from './roles.ts';
import type { TeamsGame } from './teams.ts';

export interface RecordPlacement {
  name: string;
  role: Role;
}

export interface RecordGame {
  /** In role order: top, jg, mid, adc, sp. */
  blue: RecordPlacement[];
  red: RecordPlacement[];
  out: string[];
}

export interface RecordNight {
  /** YYYY-MM-DD */
  date: string;
  games: RecordGame[];
}

export interface RecordsFile {
  nights: RecordNight[];
}

export const emptyRecords = (): RecordsFile => ({ nights: [] });

/**
 * The date a game belongs to, in the player's own time zone. Games before
 * 6 am count for the night before, so a late Thursday stays on Thursday.
 */
export function nightDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toRecordGame(g: TeamsGame): RecordGame {
  const side = (s: TeamsGame['blue']) => s.map((p) => ({ name: p.name, role: p.role }));
  return { blue: side(g.blue), red: side(g.red), out: [...g.out].sort((a, b) => a.localeCompare(b)) };
}

/** Same teams and roles, either side. */
export function recordKey(g: RecordGame): string {
  const side = (s: RecordPlacement[]) => s.map((p) => `${p.role}:${p.name}`).join(' ');
  return [side(g.blue), side(g.red)].sort().join(' v ');
}

/** Adds a game to a night (creating the night). Returns the new file and the game's number. */
export function addGame(file: RecordsFile, date: string, game: RecordGame): { file: RecordsFile; number: number; already: boolean } {
  const nights = file.nights.map((n) => ({ ...n, games: [...n.games] }));
  let night = nights.find((n) => n.date === date);
  if (!night) {
    night = { date, games: [] };
    nights.push(night);
    nights.sort((a, b) => a.date.localeCompare(b.date));
  }
  const at = night.games.findIndex((g) => recordKey(g) === recordKey(game));
  if (at >= 0) return { file: { nights }, number: at + 1, already: true };
  night.games.push(game);
  return { file: { nights }, number: night.games.length, already: false };
}

/** Joins two copies of the records (e.g. the site's and this device's), keeping each game once. */
export function mergeRecords(a: RecordsFile, b: RecordsFile): RecordsFile {
  let out: RecordsFile = { nights: a.nights.map((n) => ({ ...n, games: [...n.games] })) };
  for (const n of b.nights) for (const g of n.games) out = addGame(out, n.date, g).file;
  return out;
}

export interface NightState {
  games: number;
  /** Games each player sat out. */
  satOut: Record<string, number>;
  /** Who sat out the last game. */
  lastOut: string[];
  /** Off their main role in the last game they played. */
  owed: string[];
}

/** What a night's saved games mean for the next teams. `mains` is each player's main roles. */
export function nightState(night: RecordNight | undefined, mains: ReadonlyMap<string, readonly Role[]>): NightState {
  const games = night?.games ?? [];
  const satOut: Record<string, number> = {};
  const lastRole = new Map<string, Role>();
  for (const g of games) {
    for (const n of g.out) satOut[n] = (satOut[n] ?? 0) + 1;
    for (const p of [...g.blue, ...g.red]) lastRole.set(p.name, p.role);
  }
  const owed = [...lastRole]
    .filter(([name, role]) => {
      const m = mains.get(name);
      return m !== undefined && m.length > 0 && !m.includes(role);
    })
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  return { games: games.length, satOut, lastOut: games.length ? [...games[games.length - 1].out] : [], owed };
}

/** Problems with a records file, as readable messages (empty = fine). */
export function validateRecords(data: unknown): string[] {
  const errs: string[] = [];
  const f = data as RecordsFile;
  if (!f || typeof f !== 'object' || !Array.isArray(f.nights)) return ['The records file needs a "nights" list.'];
  f.nights.forEach((n, i) => {
    const at = `Night ${i + 1}${n?.date ? ` (${n.date})` : ''}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n?.date ?? '')) errs.push(`${at}: "date" must look like 2026-11-27.`);
    if (!Array.isArray(n?.games)) {
      errs.push(`${at}: needs a "games" list.`);
      return;
    }
    n.games.forEach((g, j) => {
      const gt = `${at}, game ${j + 1}`;
      for (const side of ['blue', 'red'] as const) {
        const s = g?.[side];
        if (!Array.isArray(s) || s.length !== 5) {
          errs.push(`${gt}: ${side} needs 5 players.`);
          continue;
        }
        s.forEach((p, k) => {
          if (!p || typeof p.name !== 'string' || !p.name) errs.push(`${gt}: ${side} ${k + 1} needs a name.`);
          if (!isRole(p?.role) || p.role !== ROLES[k]) errs.push(`${gt}: ${side} ${k + 1} should be ${ROLES[k]}.`);
        });
      }
      if (!Array.isArray(g?.out) || !g.out.every((x) => typeof x === 'string')) errs.push(`${gt}: "out" must be a list of names.`);
    });
  });
  return errs;
}
