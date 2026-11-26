import { ROLES, ROLE_NAME, isRole } from './roles.ts';
import type { Player, PublicPlayer } from './roster.ts';
import { placedSlot, type Slot } from '../engine/rating.ts';
import { scoreLineup, type GameNumbers } from '../engine/score.ts';
import type { Placement } from '../engine/lineup.ts';
import { andList, plural } from './format.ts';
import { adjustFactor, adjustSlot, cleanAdjustments, type Adjustments } from './adjust.ts';

export type { Placement };

/** One game's lineup: who plays what, and who sits out. No numbers. */
export interface TeamsGame {
  /** In role order: top, jg, mid, adc, sp. */
  blue: Placement[];
  red: Placement[];
  out: string[];
}

/** The night's teams. Holds no ratings, so it is safe to keep in localStorage. */
export interface Teams {
  games: TeamsGame[];
  /** Everyone in the pool (playing or sitting out). */
  players: string[];
  /** One-tricks allowed when the teams were made. */
  allowed: string[];
  /** Tonight's adjustments the teams were made with (percentage lower, by player). */
  adjust: Adjustments;
  /** Who was owed their main role when the teams were made (off it the game before). */
  priority: string[];
  /** Today's saved games the teams carried on from (sit-out counts, last game's sit-outs), if used. */
  history?: { satOut: Record<string, number>; lastOut: string[] };
  /** Bumped on every make/shuffle, to replay the board animation. */
  seq: number;
}

export interface GameView {
  blue: Slot[];
  red: Slot[];
  numbers: GameNumbers;
}

/** Works out every number for a game from the unlocked roster. */
export function gameView(g: TeamsGame, byName: Map<string, Player>, drop: number, adjust: Adjustments = {}): GameView | null {
  const slot = (p: Placement) => {
    const pl = byName.get(p.name);
    return pl ? adjustSlot(placedSlot(pl, p.role, p.champ, drop), adjustFactor(adjust, p.name)) : null;
  };
  const blue = g.blue.map(slot);
  const red = g.red.map(slot);
  if (blue.some((s) => !s) || red.some((s) => !s)) return null;
  const b = blue as Slot[];
  const r = red as Slot[];
  return { blue: b, red: r, numbers: scoreLineup(b, r) };
}

/** Champion display name for a key ("MasterYi" → "Master Yi"). */
export function champName(byName: Map<string, PublicPlayer>, player: string, key: string): string {
  return byName.get(player)?.ot.find((o) => o.key === key)?.champ ?? key;
}

/** Plain text for the group chat. Never includes ratings. */
export function teamsToText(t: Teams, byName: Map<string, PublicPlayer>): string {
  const who = (p: Placement) => (p.champ ? `${p.name} (${champName(byName, p.name, p.champ)})` : p.name);
  const lines = [`Thursday Customs: ${plural(t.games.length, 'game')}`];
  t.games.forEach((g, i) => {
    lines.push('', t.games.length > 1 ? `Game ${i + 1}: Blue v Red` : 'Blue v Red');
    ROLES.forEach((r, k) => lines.push(`${ROLE_NAME[r]}: ${who(g.blue[k])} v ${who(g.red[k])}`));
    if (g.out.length) lines.push(`Sitting out: ${andList(g.out)}`);
  });
  return lines.join('\n');
}

function cleanHistory(x: unknown, names: Set<string>): Teams['history'] {
  if (!x || typeof x !== 'object') return undefined;
  const h = x as { satOut?: unknown; lastOut?: unknown };
  const satOut: Record<string, number> = {};
  if (h.satOut && typeof h.satOut === 'object') {
    for (const [n, c] of Object.entries(h.satOut as Record<string, unknown>)) {
      if (names.has(n) && typeof c === 'number' && Number.isInteger(c) && c >= 0) satOut[n] = c;
    }
  }
  const lastOut = Array.isArray(h.lastOut) ? h.lastOut.filter((n): n is string => typeof n === 'string' && names.has(n)) : [];
  return { satOut, lastOut };
}

/** Checks teams loaded from storage against the current roster. */
export function validTeams(x: unknown, names: Set<string>): Teams | null {
  if (!x || typeof x !== 'object') return null;
  const t = x as Teams;
  if (!Array.isArray(t.games) || t.games.length < 1 || t.games.length > 3) return null;
  if (!Array.isArray(t.players) || !Array.isArray(t.allowed)) return null;
  const okSide = (s: unknown) =>
    Array.isArray(s) &&
    s.length === 5 &&
    s.every((p: Placement, k) => p && names.has(p.name) && isRole(p.role) && p.role === ROLES[k] && (p.champ === null || typeof p.champ === 'string'));
  for (const g of t.games) {
    if (!okSide(g.blue) || !okSide(g.red) || !Array.isArray(g.out) || !g.out.every((n) => names.has(n))) return null;
  }
  if (!t.players.every((n) => names.has(n))) return null;
  return {
    games: t.games,
    players: t.players,
    allowed: t.allowed.filter((a) => typeof a === 'string'),
    adjust: cleanAdjustments(t.adjust, names, t.players),
    priority: Array.isArray(t.priority) ? t.priority.filter((n) => typeof n === 'string' && t.players.includes(n)) : [],
    history: cleanHistory(t.history, names),
    seq: 0,
  };
}
