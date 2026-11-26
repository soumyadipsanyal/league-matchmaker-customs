/**
 * Best split and role assignment for a fixed ten players.
 *
 * Every split into two fives (126, with the first player always on side A so
 * mirror images aren't counted twice) and every role assignment for each side
 * (120 × 120) is covered, but branch-and-bound skips most of it: each five's
 * 120 assignments are pre-sorted by their own fixed cost (steps off main and
 * unlisted roles), so the inner loops stop as soon as no remaining pair can
 * beat the best score found. Results are exact.
 */
import { WEIGHTS } from './constants.ts';
import { SEATS, TEAM_SIZE } from './rotation.ts';

const ROLE_COUNT = 5;

/** Numbers for every available player in every role: index p * 5 + role. */
export interface SlotMatrix {
  n: number;
  value: Float64Array;
  /** Cost of the placement for not being on the player's main role (see rolePenalty). */
  penalty: Float64Array;
}

/** A lineup: blue[r] / red[r] = player index playing role r. */
export interface Lineup {
  score: number;
  blue: number[];
  red: number[];
}

/** A five's 120 role assignments, sorted by own cost. */
interface TeamTable {
  players: number[];
  own: Float64Array;
  total: Float64Array;
  top: Float64Array;
  jg: Float64Array;
  mid: Float64Array;
  /** ADC + support. */
  bot: Float64Array;
  /** Index into the permutation list. */
  perm: Uint8Array;
}

function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i < n; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}
const PERMS = permutations(ROLE_COUNT);
const PERM_COUNT = PERMS.length; // 120
/** ROLE_OF[pi * 5 + k] = role given to the five's k-th player. */
const ROLE_OF = Uint8Array.from(PERMS.flat());
/** WHO_HAS[pi * 5 + r] = which of the five plays role r. */
const WHO_HAS = Uint8Array.from(PERMS.flatMap((p) => [0, 1, 2, 3, 4].map((r) => p.indexOf(r))));

function combinations(from: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (from.length < k) return [];
  const [head, ...rest] = from;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}
/** Positions in a sorted ten: side A always holds position 0. 126 splits. */
const SPLIT_A = combinations([1, 2, 3, 4, 5, 6, 7, 8, 9], TEAM_SIZE - 1).map((c) => [0, ...c]);
const SPLIT_B = SPLIT_A.map((a) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => !a.includes(i)));
const SPLIT_COUNT = SPLIT_A.length;

const EPS = 1e-9;
const W_GAP = WEIGHTS.teamGap;
const W_MAX = WEIGHTS.maxLane;
const W_AVG = WEIGHTS.avgLane / 4;

const POW2 = Array.from({ length: 53 }, (_, i) => 2 ** i);
export const maskOf = (players: readonly number[]) => {
  let m = 0;
  for (const p of players) m += POW2[p];
  return m;
};

interface Hit {
  s: number;
  a: TeamTable;
  i: number;
  b: TeamTable;
  j: number;
}

export class Balancer {
  private readonly teams = new Map<number, TeamTable>();
  private readonly bests = new Map<number, number>();
  /** Tens known to score at least this much (from cut-off searches). */
  private readonly floors = new Map<number, number>();
  /** Number of distinct tens solved exactly. */
  solved = 0;

  // Scratch space reused by every table build.
  private readonly pv = new Float64Array(25);
  private readonly pp = new Float64Array(25);
  private readonly rawOwn = new Float64Array(PERM_COUNT);
  private readonly rawTotal = new Float64Array(PERM_COUNT);
  private readonly order = new Uint8Array(PERM_COUNT);
  private readonly keys = new Int32Array(PERM_COUNT);
  private readonly splitLb = new Float64Array(SPLIT_COUNT);

  constructor(private readonly m: SlotMatrix) {
    if (m.n > 50) throw new Error('Too many players for the balancer (max 50).');
  }

  private team(players: number[]): TeamTable {
    const key = maskOf(players);
    const hit = this.teams.get(key);
    if (hit) return hit;
    const { value, penalty } = this.m;
    const { pv, pp, rawOwn, rawTotal, order, keys } = this;
    for (let k = 0; k < TEAM_SIZE; k++) {
      const base = players[k] * ROLE_COUNT;
      for (let r = 0; r < ROLE_COUNT; r++) {
        pv[k * 5 + r] = value[base + r];
        pp[k * 5 + r] = penalty[base + r];
      }
    }
    let integral = true;
    let maxKey = 0;
    for (let pi = 0; pi < PERM_COUNT; pi++) {
      let tot = 0;
      let own = 0;
      const o = pi * 5;
      for (let k = 0; k < TEAM_SIZE; k++) {
        const x = k * 5 + ROLE_OF[o + k];
        tot += pv[x];
        own += pp[x];
      }
      rawOwn[pi] = own;
      rawTotal[pi] = tot;
      const q = Math.round(own * 10);
      if (Math.abs(own * 10 - q) > 1e-6 || q > 4000) integral = false;
      keys[pi] = q;
      if (q > maxKey) maxKey = q;
    }
    if (integral) {
      // Counting sort (stable) on own × 10.
      const counts = new Int32Array(maxKey + 2);
      for (let pi = 0; pi < PERM_COUNT; pi++) counts[keys[pi] + 1]++;
      for (let q = 1; q <= maxKey + 1; q++) counts[q] += counts[q - 1];
      for (let pi = 0; pi < PERM_COUNT; pi++) order[counts[keys[pi]]++] = pi;
    } else {
      const idx = Array.from({ length: PERM_COUNT }, (_, i) => i).sort((a, b) => rawOwn[a] - rawOwn[b] || a - b);
      for (let i = 0; i < PERM_COUNT; i++) order[i] = idx[i];
    }
    const buf = new Float64Array(PERM_COUNT * 6);
    const t: TeamTable = {
      players,
      own: buf.subarray(0, 120),
      total: buf.subarray(120, 240),
      top: buf.subarray(240, 360),
      jg: buf.subarray(360, 480),
      mid: buf.subarray(480, 600),
      bot: buf.subarray(600, 720),
      perm: new Uint8Array(PERM_COUNT),
    };
    for (let i = 0; i < PERM_COUNT; i++) {
      const pi = order[i];
      const o = pi * 5;
      t.own[i] = rawOwn[pi];
      t.total[i] = rawTotal[pi];
      t.top[i] = pv[WHO_HAS[o] * 5];
      t.jg[i] = pv[WHO_HAS[o + 1] * 5 + 1];
      t.mid[i] = pv[WHO_HAS[o + 2] * 5 + 2];
      t.bot[i] = pv[WHO_HAS[o + 3] * 5 + 3] + pv[WHO_HAS[o + 4] * 5 + 4];
      t.perm[i] = pi;
    }
    this.teams.set(key, t);
    return t;
  }

  private lineup(h: Hit): Lineup {
    const blue = new Array<number>(ROLE_COUNT);
    const red = new Array<number>(ROLE_COUNT);
    PERMS[h.a.perm[h.i]].forEach((r, k) => (blue[r] = h.a.players[k]));
    PERMS[h.b.perm[h.j]].forEach((r, k) => (red[r] = h.b.players[k]));
    return { score: h.s, blue, red };
  }

  /**
   * Searches every split of `ten`. With tolerance 0 it returns just the best
   * lineup (or nothing, if nothing scores below `cutoff`); otherwise every
   * lineup within `tolerance` of the best (up to `limit`), best first.
   */
  search(ten: readonly number[], tolerance = 0, limit = 1, cutoff = Infinity): Lineup[] {
    if (ten.length !== SEATS) throw new Error(`Need exactly ${SEATS} players, got ${ten.length}.`);
    const t = [...ten].sort((x, y) => x - y);
    const collect = tolerance > 0;

    const as = new Array<TeamTable>(SPLIT_COUNT);
    const bs = new Array<TeamTable>(SPLIT_COUNT);
    const lb = this.splitLb;
    for (let s = 0; s < SPLIT_COUNT; s++) {
      const a = this.team(SPLIT_A[s].map((i) => t[i]));
      const b = this.team(SPLIT_B[s].map((i) => t[i]));
      as[s] = a;
      bs[s] = b;
      lb[s] = a.own[0] + b.own[0];
    }
    const splitOrder = Array.from({ length: SPLIT_COUNT }, (_, s) => s).sort((x, y) => lb[x] - lb[y] || x - y);

    let best = Infinity;
    // A cutoff only applies to best-only searches: nothing at or above it is wanted.
    let bound = collect ? Infinity : cutoff;
    let bestHit: Hit | null = null;
    let hits: Hit[] = [];
    let cap = Infinity; // when collecting, the limit-th best score so far
    const setBound = () => {
      bound = collect ? Math.min(best + tolerance, cap) + EPS : best - EPS;
    };

    for (const s of splitOrder) {
      if (lb[s] > bound) break;
      const a = as[s];
      const b = bs[s];
      const aOwn = a.own;
      const bOwn = b.own;
      const bTotal = b.total;
      const bTop = b.top;
      const bJg = b.jg;
      const bMid = b.mid;
      const bBot = b.bot;
      const bMin = bOwn[0];
      for (let i = 0; i < PERM_COUNT; i++) {
        const oa = aOwn[i];
        if (oa + bMin > bound) break;
        const tA = a.total[i];
        const topA = a.top[i];
        const jgA = a.jg[i];
        const midA = a.mid[i];
        const botA = a.bot[i];
        for (let j = 0; j < PERM_COUNT; j++) {
          const own = oa + bOwn[j];
          if (own > bound) break;
          let sc = own + W_GAP * Math.abs(tA - bTotal[j]);
          if (sc > bound) continue;
          const g1 = Math.abs(topA - bTop[j]);
          const g2 = Math.abs(jgA - bJg[j]);
          const g3 = Math.abs(midA - bMid[j]);
          const g4 = Math.abs(botA - bBot[j]) * 0.5;
          let mx = g1;
          if (g2 > mx) mx = g2;
          if (g3 > mx) mx = g3;
          if (g4 > mx) mx = g4;
          sc += W_MAX * mx + W_AVG * (g1 + g2 + g3 + g4);
          if (sc > bound) continue;
          if (!collect) {
            best = sc;
            bestHit = { s: sc, a, i, b, j };
            setBound();
            continue;
          }
          hits.push({ s: sc, a, i, b, j });
          if (sc < best) {
            best = sc;
            setBound();
          }
          if (hits.length > limit * 4) {
            hits = hits.filter((h) => h.s <= best + tolerance + EPS).sort((x, y) => x.s - y.s).slice(0, limit);
            if (hits.length === limit) cap = hits[limit - 1].s;
            setBound();
          }
        }
      }
    }

    const key = maskOf(t);
    if (best < Infinity || cutoff === Infinity) {
      if (!this.bests.has(key)) {
        this.bests.set(key, best);
        this.solved++;
      }
    } else {
      // Nothing below the cutoff: remember that as a lower bound.
      this.floors.set(key, Math.max(this.floors.get(key) ?? 0, cutoff));
    }
    if (!collect) return bestHit ? [this.lineup(bestHit)] : [];
    return hits
      .filter((h) => h.s <= best + tolerance + EPS)
      .sort((x, y) => x.s - y.s)
      .slice(0, limit)
      .map((h) => this.lineup(h));
  }

  /** Best score for a ten (memoised). */
  best(ten: readonly number[]): number {
    const hit = this.bests.get(maskOf(ten));
    if (hit !== undefined) return hit;
    const [l] = this.search(ten);
    return l ? l.score : Infinity;
  }

  /**
   * The best score if it is below `cutoff`; otherwise some number at or above
   * `cutoff` (a lower bound). Much faster than best() when most tens can't
   * beat the cutoff, which is the usual case while searching schedules.
   */
  bestBelow(ten: readonly number[], cutoff: number): { score: number; exact: boolean } {
    const key = maskOf(ten);
    const hit = this.bests.get(key);
    if (hit !== undefined) return { score: hit, exact: true };
    const floor = this.floors.get(key);
    if (floor !== undefined && floor >= cutoff) return { score: floor, exact: false };
    const [l] = this.search(ten, 0, 1, cutoff);
    return l ? { score: l.score, exact: true } : { score: cutoff, exact: false };
  }

  /** Exact best if already known. */
  known(ten: readonly number[]): number | undefined {
    return this.bests.get(maskOf(ten));
  }
}
