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

export function scheduleFromOrder(order: readonly number[], games: number): Schedule {
  const n = order.length;
  const k = sitOutsPerGame(n);
  if (k === 0) return Array.from({ length: games }, () => []);
  const pos = new Array<number>(n);
  order.forEach((p, i) => (pos[p] = i));
  const count = new Array<number>(n).fill(0);
  const strict = consecutiveRuleHolds(n);
  const out: Schedule = [];
  let prev = new Set<number>();

  const pick = (avoidPrev: boolean): number[] => {
    const byCount = [...order].sort((a, b) => count[a] - count[b] || pos[a] - pos[b]);
    const chosen: number[] = [];
    let i = 0;
    while (chosen.length < k && i < byCount.length) {
      const level = count[byCount[i]];
      const group: number[] = [];
      while (i < byCount.length && count[byCount[i]] === level) group.push(byCount[i++]);
      for (const p of group) {
        if (chosen.length === k) break;
        if (avoidPrev && prev.has(p)) continue;
        chosen.push(p);
      }
    }
    return chosen;
  };
  const fair = (s: number[]) => {
    if (s.length !== k) return false;
    const inSet = new Set(s);
    const maxIn = Math.max(...s.map((p) => count[p]));
    for (let p = 0; p < n; p++) if (!inSet.has(p) && count[p] < maxIn) return false;
    return true;
  };

  for (let g = 0; g < games; g++) {
    let s = pick(strict);
    if (!fair(s)) s = pick(false);
    s.sort((a, b) => a - b);
    out.push(s);
    for (const p of s) count[p]++;
    prev = new Set(s);
  }
  return out;
}

/** Checks a schedule against the rules above. Returns the first problem, or null. */
export function scheduleProblem(n: number, schedule: Schedule): string | null {
  const k = sitOutsPerGame(n);
  const count = new Array<number>(n).fill(0);
  const strict = consecutiveRuleHolds(n);
  for (let g = 0; g < schedule.length; g++) {
    const s = schedule[g];
    const set = new Set(s);
    if (s.length !== k || set.size !== k) return `game ${g + 1} has ${set.size} sitting out, expected ${k}`;
    if (s.some((p) => p < 0 || p >= n)) return `game ${g + 1} names an unknown player`;
    if (k > 0) {
      const maxIn = Math.max(...s.map((p) => count[p]));
      for (let p = 0; p < n; p++) {
        if (!set.has(p) && count[p] < maxIn) return `game ${g + 1}: player ${p} hasn't sat out as often as someone sitting out again`;
      }
    }
    if (strict && g > 0 && s.some((p) => schedule[g - 1].includes(p))) return `game ${g + 1}: someone sits out two games in a row`;
    for (const p of s) count[p]++;
  }
  return null;
}

export const scheduleKey = (s: Schedule) => s.map((g) => g.join(',')).join('|');
