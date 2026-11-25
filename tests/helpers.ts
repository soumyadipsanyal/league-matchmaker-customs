import { ROLES, type Role } from '../src/lib/roles.ts';
import type { Player } from '../src/lib/roster.ts';
import { slotsFor } from '../src/engine/rating.ts';
import type { MatchPlayer } from '../src/engine/matchmaker.ts';
import { makeRng } from '../src/engine/rng.ts';

/** A made-up player (tests never use the real ratings, which are private). */
export function player(name: string, rating: number, steps: Partial<Record<Role, number>>, ot: { key: string; role: Role; rating: number }[] = []): Player {
  const roles = ROLES.filter((r) => steps[r] !== undefined);
  return {
    name,
    roles,
    mains: roles.filter((r) => steps[r] === 0),
    ot: ot.map((o) => ({ champ: o.key, key: o.key, role: o.role })),
    rating,
    steps,
    otRating: Object.fromEntries(ot.map((o) => [o.key, o.rating])),
  };
}

/** A made-up roster of n players with varied ratings and role lists. */
export function syntheticRoster(n: number, seed = 7): Player[] {
  const rng = makeRng(seed);
  return Array.from({ length: n }, (_, i) => {
    const order = [...ROLES].sort(() => rng() - 0.5);
    const count = 1 + Math.floor(rng() * 5);
    const steps: Partial<Record<Role, number>> = {};
    order.slice(0, count).forEach((r, k) => (steps[r] = k === 0 ? 0 : 1 + Math.floor(rng() * 2)));
    return player(`P${String(i + 1).padStart(2, '0')}`, Math.round((1 + rng() * 9) * 2) / 2, steps);
  });
}

export const toMatch = (ps: Player[], drop = 0.15): MatchPlayer[] =>
  ps.map((p) => ({ name: p.name, slots: slotsFor(p, new Set(), drop).map((s) => ({ value: s.value, steps: s.steps, unlisted: s.unlisted, champ: s.champ })) }));
