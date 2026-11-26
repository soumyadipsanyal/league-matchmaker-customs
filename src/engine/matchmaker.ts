/**
 * Makes the night's teams: who sits out each game, then the best split and
 * roles for each game's ten.
 *
 * With more than ten players the sit-out schedule is searched with a
 * randomised local search over priority orders (every order gives a schedule
 * that keeps the rotation rules), with restarts, under a time budget. Each
 * game's ten is then solved exactly by the Balancer, memoised so the search
 * never solves the same ten twice.
 *
 * Main roles first: anyone who was off their main role in the last game they
 * played is "owed" it, and being off main again costs them double. Games are
 * filled in order, so game 1's off-roles are owed in game 2, and the result
 * says who is still owed so the next Make teams can carry it on.
 */
import { ROLES } from '../lib/roles.ts';
import { lineupKey, type Placement } from './lineup.ts';

export { lineupKey, type Placement };
import { Balancer, maskOf, type Lineup, type SlotMatrix } from './balance.ts';
import { SEARCH_TIME_MS, SHUFFLE_TOLERANCE } from './constants.ts';
import { rolePenalty } from './score.ts';
import { makeRng, randInt, shuffleInPlace, type Rng } from './rng.ts';
import { SEATS, freshStart, scheduleFromOrder, scheduleKey, sitOutsPerGame, type RotationStart, type Schedule } from './rotation.ts';

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
  /** Players owed their main role: off it in the last game they played (from teams made earlier this visit). */
  priority?: string[];
  /** Today's saved games so far: games each player sat out, and who sat out the last one. */
  history?: { satOut: Record<string, number>; lastOut: string[] };
}

export interface MatchGame {
  blue: Placement[];
  red: Placement[];
  out: string[];
  score: number;
  /** Best score possible for this game's ten (with who was owed a main role at that point). */
  best: number;
}

export interface MatchResult {
  games: MatchGame[];
  /** Shuffle: false when no different lineup was close enough to the best. */
  changed: boolean;
  /** Best total score found for the night. */
  bestTotal: number;
  ms: number;
  tensSolved: number;
  /** Who is owed their main role after the last game: pass as `priority` next time. */
  owed: string[];
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function toMatrix(players: MatchPlayer[], owed: ReadonlySet<number>): SlotMatrix {
  const n = players.length;
  const value = new Float64Array(n * 5);
  const penalty = new Float64Array(n * 5);
  players.forEach((p, i) =>
    p.slots.forEach((s, r) => {
      value[i * 5 + r] = s.value;
      penalty[i * 5 + r] = rolePenalty(s, owed.has(i));
    }),
  );
  return { n, value, penalty };
}

const owedKey = (owed: ReadonlySet<number>) => [...owed].sort((a, b) => a - b).join(',');

interface Visited {
  schedule: Schedule;
  total: number;
}

interface Search {
  key: string;
  players: MatchPlayer[];
  /** Balancer with the owed players at the start of the night. */
  balancer: Balancer;
  visited: Map<string, Visited>;
  best: Visited;
  /** Owed at the start of the night (player indices). */
  owed: Set<number>;
  /** Balancers for other owed sets, as later games need them. */
  balancers: Map<string, Balancer>;
}

function balancerFor(s: Search, owed: ReadonlySet<number>): Balancer {
  const k = owedKey(owed);
  if (k === owedKey(s.owed)) return s.balancer;
  let b = s.balancers.get(k);
  if (!b) {
    b = new Balancer(toMatrix(s.players, owed));
    s.balancers.set(k, b);
  }
  return b;
}

/**
 * Fills each game of a schedule in order. `choose` picks the lineup for a
 * game given the balancer for whoever is owed a main role by then.
 */
function playNight(
  s: Search,
  schedule: Schedule,
  choose: (bal: Balancer, ten: number[], g: number) => Lineup,
): { games: { lineup: Lineup; out: number[]; best: number }[]; owed: Set<number> } {
  const n = s.players.length;
  const owed = new Set(s.owed);
  const games = schedule.map((out, g) => {
    const bal = balancerFor(s, owed);
    const ten = playingIn(n, out);
    const lineup = choose(bal, ten, g);
    const best = bal.best(ten);
    // Whoever played: owed next time if off main now, square again if on main.
    const settle = (p: number, r: number) => (s.players[p].slots[r].steps > 0 ? owed.add(p) : owed.delete(p));
    lineup.blue.forEach(settle);
    lineup.red.forEach(settle);
    return { lineup, out, best };
  });
  return { games, owed };
}

const playingIn = (n: number, out: readonly number[]) => {
  const o = new Set(out);
  return Array.from({ length: n }, (_, i) => i).filter((i) => !o.has(i));
};

function searchSchedules(players: MatchPlayer[], games: number, rng: Rng, budgetMs: number, owed: Set<number>, start: RotationStart): Search {
  const n = players.length;
  const balancer = new Balancer(toMatrix(players, owed));
  const base = { players, balancer, owed, balancers: new Map<string, Balancer>(), key: '' };
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
    const best = evalSchedule(scheduleFromOrder(identity, games, start));
    return { ...base, visited, best };
  }
  if (binomial(n, k) <= EXACT_TENS_LIMIT) return { ...base, ...exactSearch(players, games, balancer, start) };

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

  // From a fresh start, a position in the order always gets the same sit-out
  // pattern (which games), so swapping two positions with the same pattern
  // changes nothing and is skipped. Carrying on from earlier games, players
  // differ, so every swap is tried.
  const fresh = start.prev.length === 0 && start.count.every((c) => c === start.count[0]);
  const patternAt = (() => {
    const s = scheduleFromOrder(identity, games, start);
    return identity.map((p) => s.map((out) => (out.includes(p) ? '1' : '0')).join(''));
  })();
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!fresh || patternAt[i] !== patternAt[j]) pairs.push([i, j]);

  const startedAt = now();
  const timeLeft = () => now() - startedAt < budgetMs;
  const maxStall = 30 + 3 * n;

  /** Hill-climbs from `order` (changed in place) by swapping players' patterns. */
  const climb = (order: number[]): Visited => {
    let cur = evalSchedule(scheduleFromOrder(order, games, start));
    let stall = 0;
    while (stall < maxStall && timeLeft()) {
      const [i, j] = pairs[randInt(rng, pairs.length)];
      [order[i], order[j]] = [order[j], order[i]];
      // Evaluated exactly when within the shuffle tolerance, so Shuffle has near-best schedules to pick from.
      const next = tryEval(scheduleFromOrder(order, games, start), cur.total + SHUFFLE_TOLERANCE);
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
  return { ...base, visited, best };
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
 * and who sat out last game. Not sitting out twice running comes first (last
 * game's sit-outs are left out whenever enough others remain); then the
 * least-rested sit out first, all of a level before any of the next.
 */
function validSitOuts(n: number, k: number, count: number[], prev: ReadonlySet<number>): number[][] {
  const everyone = Array.from({ length: n }, (_, i) => i);
  const pool = n - prev.size >= k ? everyone.filter((p) => !prev.has(p)) : everyone;
  const levels = [...new Set(pool.map((p) => count[p]))].sort((a, b) => a - b);
  const forced: number[] = [];
  for (const level of levels) {
    const group = pool.filter((i) => count[i] === level);
    const need = k - forced.length;
    if (group.length <= need) {
      forced.push(...group);
      if (forced.length === k) return [forced.sort((a, b) => a - b)];
      continue;
    }
    return combos(group, need).map((c) => [...forced, ...c].sort((a, b) => a - b));
  }
  return [];
}

function exactSearch(players: MatchPlayer[], games: number, balancer: Balancer, start: RotationStart): { visited: Map<string, Visited>; best: Visited } {
  const n = players.length;
  const k = sitOutsPerGame(n);
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
  const count = [...start.count];
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
    for (const s of validSitOuts(n, k, count, prev)) {
      for (const p of s) count[p]++;
      sched.push(s);
      dfs(g + 1, new Set(s), total + cost.get(s.join(','))!);
      sched.pop();
      for (const p of s) count[p]--;
    }
  };
  dfs(0, new Set(start.prev), 0);
  const visited = new Map<string, Visited>();
  for (const v of near) if (v.total <= bestTotal + tol + 1e-9) visited.set(scheduleKey(v.schedule), v);
  if (!found.best) throw new Error('No schedule keeps the sit-out rules.');
  return { visited, best: found.best };
}

function toGame(players: MatchPlayer[], l: Lineup, out: readonly number[], flip: boolean, best = l.score): MatchGame {
  const place = (idx: number[]): Placement[] =>
    idx.map((p, r) => ({ name: players[p].name, role: ROLES[r], champ: players[p].slots[r].champ }));
  const blue = place(flip ? l.red : l.blue);
  const red = place(flip ? l.blue : l.red);
  return { blue, red, out: out.map((p) => players[p].name).sort((a, b) => a.localeCompare(b)), score: l.score, best };
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
    const names = new Map(players.map((p, i) => [p.name, i]));
    const startOwed = new Set((req.priority ?? []).map((nm) => names.get(nm)).filter((i): i is number => i !== undefined));
    const start = freshStart(players.length);
    for (const [nm, c] of Object.entries(req.history?.satOut ?? {})) {
      const i = names.get(nm);
      if (i !== undefined) start.count[i] = c;
    }
    start.prev = (req.history?.lastOut ?? []).map((nm) => names.get(nm)).filter((i): i is number => i !== undefined);
    const key = JSON.stringify([players, games, owedKey(startOwed), start]);
    const owedNames = (o: Set<number>) => [...o].map((i) => players[i].name).sort((a, b) => a.localeCompare(b));

    if (req.mode === 'make' || !last || last.key !== key) {
      const rng = makeRng(req.mode === 'make' ? 1 : (req.seed ?? 1));
      last = searchSchedules(players, games, rng, req.timeBudgetMs ?? SEARCH_TIME_MS, startOwed, start);
      last.key = key;
    }
    const s = last;

    if (req.mode === 'make') {
      const night = playNight(s, s.best.schedule, (bal, ten) => bal.search(ten)[0]);
      const out = night.games.map((g) => toGame(players, g.lineup, g.out, false, g.best));
      return { games: out, changed: true, bestTotal: s.best.total, ms: now() - t0, tensSolved: s.balancer.solved, owed: owedNames(night.owed) };
    }

    // Shuffle: a near-best schedule, then a near-best lineup for each game, different from now if possible.
    const rng = makeRng(req.seed ?? Date.now());
    const avoid = req.avoid ?? [];
    const near = [...s.visited.values()].filter((v) => v.total <= s.best.total + tol + 1e-9);
    shuffleInPlace(rng, near);
    const candidates = new Map<Balancer, Map<number, Lineup[]>>();
    const lineupsFor = (bal: Balancer, ten: number[]) => {
      const byTen = candidates.get(bal) ?? new Map<number, Lineup[]>();
      candidates.set(bal, byTen);
      const m = maskOf(ten);
      let c = byTen.get(m);
      if (!c) {
        c = bal.search(ten, tol, 60);
        byTen.set(m, c);
      }
      return c;
    };

    let fallback: { games: MatchGame[]; owed: string[] } | null = null;
    for (const v of near) {
      const night = playNight(s, v.schedule, (bal, ten, g) => {
        const options = lineupsFor(bal, ten);
        const out = v.schedule[g];
        const fresh = options.filter((l) => lineupKey(toGame(players, l, out, false)) !== avoid[g]);
        const pool = fresh.length ? fresh : options;
        return pool[randInt(rng, pool.length)];
      });
      const result = night.games.map((g) => toGame(players, g.lineup, g.out, rng() < 0.5, g.best));
      const changed = result.some((g, i) => lineupKey(g) !== avoid[i]);
      const owed = owedNames(night.owed);
      if (changed) return { games: result, changed, bestTotal: s.best.total, ms: now() - t0, tensSolved: s.balancer.solved, owed };
      fallback ??= { games: result, owed };
    }
    return { games: fallback?.games ?? [], changed: false, bestTotal: s.best.total, ms: now() - t0, tensSolved: s.balancer.solved, owed: fallback?.owed ?? [] };
  };
}
