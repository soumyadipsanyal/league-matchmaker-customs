import { ROLES, type Role } from '../lib/roles.ts';
import { otId, type Player } from '../lib/roster.ts';

/** A player's numbers in one role on one night. */
export interface Slot {
  /** Rating counted for the game. */
  value: number;
  /** Rating from the role alone (before any one-trick). */
  base: number;
  /** Steps below main. */
  steps: number;
  /** Placed in a role they don't list (a last resort). */
  unlisted: boolean;
  /** The player has no roles set yet, so every role counts as one step below main. */
  rolesNotSet: boolean;
  /** Champion key when they're on an allowed one-trick in this role. */
  champ: string | null;
}

/** main × (1 − drop × steps), never below zero. */
export function roleRating(main: number, steps: number, drop: number): number {
  return Math.max(0, main * (1 - drop * steps));
}

/** Steps below main for a role, and whether it's a last-resort (unlisted) role. */
export function roleSteps(p: Pick<Player, 'steps'>, role: Role): { steps: number; unlisted: boolean; rolesNotSet: boolean } {
  const listed = Object.values(p.steps).filter((s): s is number => typeof s === 'number');
  if (listed.length === 0) return { steps: 1, unlisted: false, rolesNotSet: true };
  const s = p.steps[role];
  if (s !== undefined) return { steps: s, unlisted: false, rolesNotSet: false };
  // Not listed: one step below their lowest listed role.
  return { steps: Math.max(...listed) + 1, unlisted: true, rolesNotSet: false };
}

/** The player's numbers in a role, given the champion they're on (if any). */
export function placedSlot(p: Player, role: Role, champ: string | null, drop: number): Slot {
  const { steps, unlisted, rolesNotSet } = roleSteps(p, role);
  const base = roleRating(p.rating, steps, drop);
  const ot = champ ? p.ot.find((o) => o.key === champ && o.role === role) : undefined;
  if (ot && p.otRating[ot.key] !== undefined) {
    return { value: Math.max(base, p.otRating[ot.key]), base, steps, unlisted: false, rolesNotSet, champ: ot.key };
  }
  return { value: base, base, steps, unlisted, rolesNotSet, champ: null };
}

/** The best allowed one-trick this player has in this role, if any. */
export function allowedOneTrick(p: Player, role: Role, allowed: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestRating = -Infinity;
  for (const o of p.ot) {
    if (o.role !== role || !allowed.has(otId(p.name, o.key))) continue;
    const r = p.otRating[o.key] ?? -Infinity;
    if (r > bestRating) {
      best = o.key;
      bestRating = r;
    }
  }
  return best;
}

/** The player's numbers in a role tonight: on their one-trick if it's allowed and fits the role. */
export function slotFor(p: Player, role: Role, allowed: ReadonlySet<string>, drop: number): Slot {
  return placedSlot(p, role, allowedOneTrick(p, role, allowed), drop);
}

/** Slots for every role, in ROLES order. */
export function slotsFor(p: Player, allowed: ReadonlySet<string>, drop: number): Slot[] {
  return ROLES.map((r) => slotFor(p, r, allowed, drop));
}
