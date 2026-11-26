import { describe, expect, it } from 'vitest';
import { DEFAULT_STEP_DROP, WEIGHTS } from '../src/engine/constants.ts';
import { placedSlot, roleRating, slotFor } from '../src/engine/rating.ts';
import { rolePenalty, scoreLineup } from '../src/engine/score.ts';
import { Balancer } from '../src/engine/balance.ts';
import { ROLES } from '../src/lib/roles.ts';
import { otId } from '../src/lib/roster.ts';
import { player, syntheticRoster, toMatch } from './helpers.ts';

const DROP = DEFAULT_STEP_DROP;
const none = new Set<string>();

describe('role rating = main × (1 − 0.15 × steps)', () => {
  it('uses 15% per step by default', () => {
    expect(DEFAULT_STEP_DROP).toBe(0.15);
    expect(roleRating(10, 0, DROP)).toBe(10);
    expect(roleRating(10, 1, DROP)).toBeCloseTo(8.5, 10);
    expect(roleRating(9, 3, DROP)).toBeCloseTo(4.95, 10);
    expect(roleRating(6.5, 2, DROP)).toBeCloseTo(4.55, 10);
  });

  it('follows the drop setting and never goes below zero', () => {
    expect(roleRating(10, 1, 0.2)).toBeCloseTo(8, 10);
    expect(roleRating(10, 5, 0.3)).toBe(0);
  });

  it('rates a listed role by its steps', () => {
    const p = player('A', 10, { mid: 0, jg: 1 });
    const s = slotFor(p, 'jg', none, DROP);
    expect(s.value).toBeCloseTo(8.5, 10);
    expect(s).toMatchObject({ steps: 1, unlisted: false, rolesNotSet: false, champ: null });
  });

  it('rates an unlisted role one step below the lowest listed role, and flags it', () => {
    const p = player('B', 9, { jg: 0, top: 2, mid: 3, sp: 3 });
    const s = slotFor(p, 'adc', none, DROP);
    expect(s.steps).toBe(4);
    expect(s.value).toBeCloseTo(9 * (1 - 0.6), 10);
    expect(s.unlisted).toBe(true);
  });

  it('treats a player with no roles set as one step below main anywhere, flagged but not unlisted', () => {
    const p = player('C', 5, {});
    for (const r of ROLES) {
      const s = slotFor(p, r, none, DROP);
      expect(s.value).toBeCloseTo(4.25, 10);
      expect(s).toMatchObject({ steps: 1, rolesNotSet: true, unlisted: false });
    }
  });
});

describe('one-tricks', () => {
  const p = player('D', 6.5, { jg: 0, top: 1 }, [{ key: 'Yi', role: 'jg', rating: 8.5 }]);
  const allowed = new Set([otId('D', 'Yi')]);

  it('counts the one-trick rating when allowed and in its role, and shows the champion', () => {
    const s = slotFor(p, 'jg', allowed, DROP);
    expect(s.value).toBeCloseTo(8.5, 10);
    expect(s.champ).toBe('Yi');
  });

  it('keeps the role rating when that is higher', () => {
    const q = player('E', 9, { top: 0 }, [{ key: 'Shen', role: 'top', rating: 7 }]);
    const s = slotFor(q, 'top', new Set([otId('E', 'Shen')]), DROP);
    expect(s.value).toBe(9);
    expect(s.champ).toBe('Shen');
  });

  it('ignores the one-trick when not allowed or in another role', () => {
    expect(slotFor(p, 'jg', none, DROP)).toMatchObject({ value: 6.5, champ: null });
    expect(slotFor(p, 'top', allowed, DROP).champ).toBeNull();
  });

  it('re-derives the same numbers from a stored placement', () => {
    expect(placedSlot(p, 'jg', 'Yi', DROP).value).toBeCloseTo(8.5, 10);
    expect(placedSlot(p, 'jg', null, DROP).value).toBe(6.5);
  });
});

describe('game score', () => {
  const s = (value: number, steps = 0, unlisted = false) => ({ value, steps, unlisted });

  it('matches the formula by hand', () => {
    // Blue 10+8+7+6+5 = 36, red 9+8+6+6+4 = 33.
    const blue = [s(10), s(8, 1), s(7), s(6), s(5, 2)];
    const red = [s(9), s(8), s(6), s(6, 1, true), s(4)];
    const n = scoreLineup(blue, red);
    expect(n.blueTotal).toBe(36);
    expect(n.redTotal).toBe(33);
    expect(n.lanes).toEqual({ top: 1, jg: 0, mid: 1, bot: 0.5 }); // bot: |(6+5) − (6+4)| ÷ 2
    expect(n.maxLane).toBe(1);
    expect(n.avgLane).toBeCloseTo(0.625, 10);
    expect(n.steps).toBe(4);
    expect(n.offMain).toBe(3);
    expect(n.unlisted).toBe(1);
    // 4×3 + 1×1 + 0.4×0.625, then each off-main placement (1, 2 and 1 steps) and the unlisted one.
    const off = (steps: number) => WEIGHTS.offMain + WEIGHTS.steps * steps;
    expect(n.score).toBeCloseTo(12 + 1 + 0.25 + off(1) + off(2) + off(1) + WEIGHTS.unlisted, 10);
  });

  it('prefers main roles over a small balance gain', () => {
    // One player one step off main costs more than a 0.25 gap between team totals.
    expect(rolePenalty({ steps: 1, unlisted: false })).toBeGreaterThan(WEIGHTS.teamGap * 0.25);
    expect(rolePenalty({ steps: 0, unlisted: false })).toBe(0);
  });

  it('makes being off main two games running very costly', () => {
    const once = rolePenalty({ steps: 1, unlisted: false });
    const again = rolePenalty({ steps: 1, unlisted: false }, true);
    expect(again - once).toBe(WEIGHTS.offRoleAgain);
    // Worse than a 1.5 gap between team totals.
    expect(again).toBeGreaterThan(WEIGHTS.teamGap * 1.5);
    expect(rolePenalty({ steps: 0, unlisted: false }, true)).toBe(0);
  });
});

describe('balancer', () => {
  it('finds exactly the best of all 126 splits × 120 × 120 role assignments', () => {
    const players = toMatch(syntheticRoster(10, 3));
    const perms: number[][] = [];
    const permute = (a: number[], l: number) => {
      if (l === a.length) return void perms.push([...a]);
      for (let i = l; i < a.length; i++) {
        [a[l], a[i]] = [a[i], a[l]];
        permute(a, l + 1);
        [a[l], a[i]] = [a[i], a[l]];
      }
    };
    permute([0, 1, 2, 3, 4], 0);
    let brute = Infinity;
    for (let mask = 0; mask < 1024; mask++) {
      if (!(mask & 1) || [...Array(10).keys()].filter((i) => mask & (1 << i)).length !== 5) continue;
      const A = [...Array(10).keys()].filter((i) => mask & (1 << i));
      const B = [...Array(10).keys()].filter((i) => !(mask & (1 << i)));
      for (const pa of perms)
        for (const pb of perms) {
          const blue = ROLES.map((_, r) => players[A[pa.indexOf(r)]].slots[r]);
          const red = ROLES.map((_, r) => players[B[pb.indexOf(r)]].slots[r]);
          brute = Math.min(brute, scoreLineup(blue, red).score);
        }
    }
    const m = {
      n: 10,
      value: new Float64Array(players.flatMap((p) => p.slots.map((x) => x.value))),
      penalty: new Float64Array(players.flatMap((p) => p.slots.map((x) => rolePenalty(x)))),
    };
    const [best] = new Balancer(m).search([...Array(10).keys()]);
    expect(best.score).toBeCloseTo(brute, 9);
    // And the lineup it returns really scores that.
    const again = scoreLineup(
      best.blue.map((p, r) => players[p].slots[r]),
      best.red.map((p, r) => players[p].slots[r]),
    );
    expect(again.score).toBeCloseTo(best.score, 9);
  });
});
