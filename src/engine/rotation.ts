/**
 * Who sits out which game.
 *
 * Rules (players are numbered 0..n-1, every game seats exactly ten):
 *  - Each game, n − 10 players sit out.
 *  - Nobody sits out twice before everyone has sat out once (and so on for
 *    later rounds): everyone sitting out a game has sat out no more often than
 *    anyone playing it.
 *  - Anyone who sat out a game plays the next one. With 20 or fewer players
 *    this can always be kept; beyond that it is dropped because it can't be.
 *
 * A schedule is built from a priority order of the players: each game takes the
 * players who have sat out least, earliest in the order first. Every order
 * gives a valid schedule, so the search can shuffle orders freely.
 */

export const TEAM_SIZE = 5;
export const SEATS = TEAM_SIZE * 2;

export const sitOutsPerGame = (n: number) => Math.max(0, n - SEATS);

/** Whether "sat out a game → plays the next" can always be kept with n players. */
export const consecutiveRuleHolds = (n: number) => 2 * sitOutsPerGame(n) <= n;

/** schedule[g] = sorted indices of the players sitting out game g. */
export type Schedule = number[][];

/**
 * Where the night stands before these games: how many games each player has
 * already sat out, and who sat out the last one (from today's saved games).
 */
export interface RotationStart {
  count: number[];
  prev: number[];
}

export const freshStart = (n: number): RotationStart => ({ count: new Array<number>(n).fill(0), prev: [] });

/** Whether "sat out last game → plays this one" can be kept, given who sat out last. */
const canKeepConsecutive = (n: number, k: number, prev: ReadonlySet<number>) => n - prev.size >= k;

export function scheduleFromOrder(order: readonly number[], games: number, start: RotationStart = freshStart(order.length)): Schedule {
  const n = order.length;
  const k = sitOutsPerGame(n);
  if (k === 0) return Array.from({ length: games }, () => []);
  const pos = new Array<number>(n);
  order.forEach((p, i) => (pos[p] = i));
  const count = [...start.count];
  const out: Schedule = [];
  let prev = new Set<number>(start.prev);

  // Sitting out twice running comes first: if it can be avoided, last game's
  // sit-outs aren't candidates at all. Then the least-rested sit out first.
  const pick = (): number[] => {
    const pool = canKeepConsecutive(n, k, prev) ? order.filter((p) => !prev.has(p)) : [...order];
    return pool.sort((a, b) => count[a] - count[b] || pos[a] - pos[b]).slice(0, k);
  };

  for (let g = 0; g < games; g++) {
    const s = pick().sort((a, b) => a - b);
    out.push(s);
    for (const p of s) count[p]++;
    prev = new Set(s);
  }
  return out;
}

/** Checks a schedule against the rules above. Returns the first problem, or null. */
export function scheduleProblem(n: number, schedule: Schedule, start: RotationStart = freshStart(n)): string | null {
  const k = sitOutsPerGame(n);
  const count = [...start.count];
  let prev = new Set<number>(start.prev);
  for (let g = 0; g < schedule.length; g++) {
    const s = schedule[g];
    const set = new Set(s);
    if (s.length !== k || set.size !== k) return `game ${g + 1} has ${set.size} sitting out, expected ${k}`;
    if (s.some((p) => p < 0 || p >= n)) return `game ${g + 1} names an unknown player`;
    const keep = canKeepConsecutive(n, k, prev);
    if (keep && s.some((p) => prev.has(p))) return `game ${g + 1}: someone sits out two games in a row`;
    if (k > 0) {
      const maxIn = Math.max(...s.map((p) => count[p]));
      for (let p = 0; p < n; p++) {
        // Last game's sit-outs are excused: playing again comes first.
        if (!set.has(p) && count[p] < maxIn && !(keep && prev.has(p))) return `game ${g + 1}: player ${p} hasn't sat out as often as someone sitting out again`;
      }
    }
    for (const p of s) count[p]++;
    prev = set;
  }
  return null;
}

export const scheduleKey = (s: Schedule) => s.map((g) => g.join(',')).join('|');
