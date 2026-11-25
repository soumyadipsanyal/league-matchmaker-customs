/**
 * Makes the night's teams: who sits out each game, then the best split and
 * roles for each game's ten.
 *
 * With more than ten players the sit-out schedule is searched with a
 * randomised local search over priority orders (every order gives a schedule
 * that keeps the rotation rules), with restarts, under a time budget. Each
 * game's ten is then solved exactly by the Balancer, memoised so the search
 * never solves the same ten twice.
 */
import { ROLES } from '../lib/roles.ts';
import { lineupKey, type Placement } from './lineup.ts';

export { lineupKey, type Placement };
import { Balancer, maskOf, type Lineup, type SlotMatrix } from './balance.ts';
import { SEARCH_TIME_MS, SHUFFLE_TOLERANCE } from './constants.ts';
import { makeRng, randInt, shuffleInPlace, type Rng } from './rng.ts';
import { SEATS, scheduleFromOrder, scheduleKey, sitOutsPerGame, type Schedule } from './rotation.ts';

/** A player's numbers in each role (ROLES order), worked out on the main thread. */
export interface MatchPlayer {
  name: string;
  slots: { value: number; steps: number; unlisted: boolean; champ: string | null }[];
}

export interface MatchRequest {
  players: MatchPlayer[];
  games: number;
  mode: 'make' | 'shuffle';
  seed?: number;
  /** Shuffle only: the current lineup of each game (see lineupKey), to pick something different. */
  avoid?: string[];
  tolerance?: number;
  timeBudgetMs?: number;
}

export interface MatchGame {
  blue: Placement[];
  red: Placement[];
  out: string[];
  score: number;
}

export interface MatchResult {
  games: MatchGame[];
  /** Shuffle: false when no different lineup was close enough to the best. */
  changed: boolean;
  /** Best total score found for the night. */
  bestTotal: number;
  ms: number;
  tensSolved: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function toMatrix(players: MatchPlayer[]): SlotMatrix {
  const n = players.length;
  const value = new Float64Array(n * 5);
  const steps = new Float64Array(n * 5);
  const unlisted = new Uint8Array(n * 5);
  players.forEach((p, i) =>
    p.slots.forEach((s, r) => {
      value[i * 5 + r] = s.value;
      steps[i * 5 + r] = s.steps;
      unlisted[i * 5 + r] = s.unlisted ? 1 : 0;
    }),
  );
  return { n, value, steps, unlisted };
}

interface Visited {
  schedule: Schedule;
  total: number;
}

interface Search {
  key: string;
  players: MatchPlayer[];
  balancer: Balancer;
  visited: Map<string, Visited>;
  best: Visited;
}

const playingIn = (n: number, out: readonly number[]) => {
  const o = new Set(out);
  return Array.from({ length: n }, (_, i) => i).filter((i) => !o.has(i));
};

function searchSchedules(players: MatchPlayer[], games: number, rng: Rng, budgetMs: number): Search {
  const n = players.length;
  const balancer = new Balancer(toMatrix(players));
  const visited = new Map<string, Visited>();
  const evalSchedule = (schedule: Schedule): Visited => {
    const key = scheduleKey(schedule);
    const hit = visited.get(key);
    if (hit) return hit;
    const total = schedule.reduce((s, out) => s + balancer.best(playingIn(n, out)), 0);
    const v = { schedule, total };
    visited.set(key, v);
    return v;
  };

  const k = sitOutsPerGame(n);
  const identity = Array.from({ length: n }, (_, i) => i);
  if (k === 0) {
    const best = evalSchedule(scheduleFromOrder(identity, games));
    return { key: '', players, balancer, visited, best };
  }
  if (binomial(n, k) <= EXACT_TENS_LIMIT) return exactSearch(players, games, balancer);

  // Exact total if it can be at most `cutoff`, else null. Tens that can't
  // beat what's left of the cutoff stop searching early (Balancer.bestBelow).
  const floors = new Map<string, number>();
  const tryEval = (schedule: Schedule, cutoff: number): Visited | null => {
    const key = scheduleKey(schedule);
    const hit = visited.get(key);
    if (hit) return hit;
    if ((floors.get(key) ?? -Infinity) > cutoff) return null;
    const tens = schedule.map((out) => playingIn(n, out));
    let total = 0;
    const unknown: number[][] = [];
    for (const t of tens) {
      const c = balancer.known(t);
      if (c === undefined) unknown.push(t);
      else total += c;
    }
    for (const t of unknown) {
      if (total > cutoff) break;
      const r = balancer.bestBelow(t, cutoff - total + 1e-9);
      total += r.score;
      if (!r.exact) total = Math.max(total, cutoff + 1e-6);
    }
    if (total > cutoff + 1e-9) {
      floors.set(key, total);
      return null;
    }
    const v = { schedule, total };
    visited.set(key, v);
    return v;
  };

  // A position in the order always gets the same sit-out pattern (which games),
  // so swapping two positions just swaps two players' patterns. Swaps between
  // positions with the same pattern change nothing and are skipped.
  const patternAt = (() => {
    const s = scheduleFromOrder(identity, games);
    return identity.map((p) => s.map((out) => (out.includes(p) ? '1' : '0')).join(''));
  })();
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (patternAt[i] !== patternAt[j]) pairs.push([i, j]);

  const start = now();
  const timeLeft = () => now() - start < budgetMs;
  const maxStall = 30 + 3 * n;

  /** Hill-climbs from `order` (changed in place) by swapping players' patterns. */
  const climb = (order: number[]): Visited => {
    let cur = evalSchedule(scheduleFromOrder(order, games));
    let stall = 0;
    while (stall < maxStall && timeLeft()) {
      const [i, j] = pairs[randInt(rng, pairs.length)];
      [order[i], order[j]] = [order[j], order[i]];
      // Evaluated exactly when within the shuffle tolerance, so Shuffle has near-best schedules to pick from.
      const next = tryEval(scheduleFromOrder(order, games), cur.total + SHUFFLE_TOLERANCE);
      if (next && next.total < cur.total - 1e-9) {
        cur = next;
        stall = 0;
      } else if (next && next.total <= cur.total + 1e-9) {
        cur = next; // sideways: wander along plateaus
        stall++;
      } else {
        [order[i], order[j]] = [order[j], order[i]];
        stall++;
      }
    }
    return cur;
  };

  // Iterated local search: climb, then repeatedly kick the best order with a
  // few random swaps and climb again; start afresh now and then.
  let bestOrder = shuffleInPlace(rng, [...identity]);
  let best = climb(bestOrder);
  let sinceBetter = 0;
  let barren = 0; // climbs in a row that found no schedule not already seen
  while (timeLeft() && barren < 25) {
    const seen = visited.size;
    let order: number[];
    if (sinceBetter >= 12) {
      order = shuffleInPlace(rng, [...identity]);
      sinceBetter = 0;
    } else {
      order = [...bestOrder];
      const kicks = 2 + randInt(rng, 3);
      for (let x = 0; x < kicks; x++) {
        const [i, j] = pairs[randInt(rng, pairs.length)];
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    const got = climb(order);
    if (got.total < best.total - 1e-9) {
      best = got;
      bestOrder = order;
      sinceBetter = 0;
    } else {
      sinceBetter++;
    }
    // On small nights every schedule is soon seen; stop rather than spin.
    barren = visited.size === seen ? barren + 1 : 0;
  }
  return { key: '', players, balancer, visited, best };
}

/** Up to this many possible tens (14 players), every ten is solved and every schedule checked. */
const EXACT_TENS_LIMIT = 1500;
const NEAR_LIMIT = 20_000;

function binomial(n: number, k: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

function combos(from: readonly number[], k: number, start = 0, acc: number[] = [], out: number[][] = []): number[][] {
  if (acc.length === k) {
    out.push([...acc]);
    return out;
  }
  for (let i = start; i <= from.length - (k - acc.length); i++) {
    acc.push(from[i]);
    combos(from, k, i + 1, acc, out);
    acc.pop();
  }
  return out;
}

/**
 * Every set that may sit out next, given how often each player has sat out
 * and who sat out last game: the least-rested first, all of a level before
 * any of the next.
 */
function validSitOuts(n: number, k: number, count: number[], prev: ReadonlySet<number>, strict: boolean): number[][] {
  const levels = [...new Set(count)].sort((a, b) => a - b);
  const forced: number[] = [];
  for (const level of levels) {
    const group = Array.from({ length: n }, (_, i) => i).filter((i) => count[i] === level);
    const need = k - forced.length;
    if (group.length <= need) {
      if (strict && group.some((p) => prev.has(p))) return [];
      forced.push(...group);
      if (forced.length === k) return [forced.sort((a, b) => a - b)];
      continue;
    }
    const pool = strict ? group.filter((p) => !prev.has(p)) : group;
    return combos(pool, need).map((c) => [...forced, ...c].sort((a, b) => a - b));
  }
  return [];
}

function exactSearch(players: MatchPlayer[], games: number, balancer: Balancer): Search {
  const n = players.length;
  const k = sitOutsPerGame(n);
  const strict = 2 * k <= n;
  const cost = new Map<string, number>();
  let minCost = Infinity;
  for (const out of combos(Array.from({ length: n }, (_, i) => i), k)) {
    const c = balancer.best(playingIn(n, out));
    cost.set(out.join(','), c);
    if (c < minCost) minCost = c;
  }
  const tol = SHUFFLE_TOLERANCE;
  let bestTotal = Infinity;
  const found: { best: Visited | null } = { best: null };
  const near: Visited[] = [];
  const count = new Array<number>(n).fill(0);
  const sched: Schedule = [];
  const dfs = (g: number, prev: ReadonlySet<number>, total: number) => {
    if (total + (games - g) * minCost > bestTotal + tol + 1e-9) return;
    if (g === games) {
      const v = { schedule: sched.map((s) => [...s]), total };
      if (total < bestTotal - 1e-9) {
        bestTotal = total;
        found.best = v;
      }
      if (near.length < NEAR_LIMIT) near.push(v);
      return;
    }
    for (const s of validSitOuts(n, k, count, prev, strict)) {
      for (const p of s) count[p]++;
      sched.push(s);
      dfs(g + 1, new Set(s), total + cost.get(s.join(','))!);
      sched.pop();
      for (const p of s) count[p]--;
    }
  };
  dfs(0, new Set(), 0);
  const visited = new Map<string, Visited>();
  for (const v of near) if (v.total <= bestTotal + tol + 1e-9) visited.set(scheduleKey(v.schedule), v);
  if (!found.best) throw new Error('No schedule keeps the sit-out rules.');
  return { key: '', players, balancer, visited, best: found.best };
}

function toGame(players: MatchPlayer[], l: Lineup, out: readonly number[], flip: boolean): MatchGame {
  const place = (idx: number[]): Placement[] =>
    idx.map((p, r) => ({ name: players[p].name, role: ROLES[r], champ: players[p].slots[r].champ }));
  const blue = place(flip ? l.red : l.blue);
  const red = place(flip ? l.blue : l.red);
  return { blue, red, out: out.map((p) => players[p].name).sort((a, b) => a.localeCompare(b)), score: l.score };
}

/** Keeps the last search so Shuffle doesn't have to start again. */
export function createMatchmaker() {
  let last: Search | null = null;

  return function run(req: MatchRequest): MatchResult {
    const t0 = now();
    const { players, games } = req;
    if (players.length < SEATS) throw new Error(`Need at least ${SEATS} players, got ${players.length}.`);
    if (games < 1 || games > 3) throw new Error('Games must be 1, 2 or 3.');
    const tol = req.tolerance ?? SHUFFLE_TOLERANCE;
    const key = JSON.stringify([players, games]);
    const n = players.length;

    if (req.mode === 'make' || !last || last.key !== key) {
      const rng = makeRng(req.mode === 'make' ? 1 : (req.seed ?? 1));
      last = searchSchedules(players, games, rng, req.timeBudgetMs ?? SEARCH_TIME_MS);
      last.key = key;
    }
    const s = last;

    if (req.mode === 'make') {
      const out = s.best.schedule.map((o) => {
        const [l] = s.balancer.search(playingIn(n, o));
        return toGame(players, l, o, false);
      });
      return { games: out, changed: true, bestTotal: s.best.total, ms: now() - t0, tensSolved: s.balancer.solved };
    }

    // Shuffle: a near-best schedule, then a near-best lineup for each game, different from now if possible.
    const rng = makeRng(req.seed ?? Date.now());
    const avoid = req.avoid ?? [];
    const near = [...s.visited.values()].filter((v) => v.total <= s.best.total + tol + 1e-9);
    shuffleInPlace(rng, near);
    const candidatesFor = new Map<number, Lineup[]>();
    const lineupsFor = (o: number[]) => {
      const ten = playingIn(n, o);
      const m = maskOf(ten);
      let c = candidatesFor.get(m);
      if (!c) {
        c = s.balancer.search(ten, tol, 60);
        candidatesFor.set(m, c);
      }
      return c;
    };

    let fallback: MatchGame[] | null = null;
    for (const v of near) {
      const result = v.schedule.map((o, g) => {
        const options = lineupsFor(o).map((l) => toGame(players, l, o, rng() < 0.5));
        const fresh = options.filter((x) => lineupKey(x) !== avoid[g]);
        const pool = fresh.length ? fresh : options;
        return pool[randInt(rng, pool.length)];
      });
      const changed = result.some((g, i) => lineupKey(g) !== avoid[i]);
      if (changed) return { games: result, changed, bestTotal: s.best.total, ms: now() - t0, tensSolved: s.balancer.solved };
      fallback ??= result;
    }
    return { games: fallback ?? [], changed: false, bestTotal: s.best.total, ms: now() - t0, tensSolved: s.balancer.solved };
  };
}
