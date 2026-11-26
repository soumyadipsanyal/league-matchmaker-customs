/**
 * Tonight's adjustments: lower a player's overall skill for one night's
 * teams (someone tired, ill, on a borrowed laptop…) without touching their
 * saved ratings. Stored as a percentage off every number they have (each
 * role and one-trick), so it can be shown without revealing any rating.
 */
import type { Player } from './roster.ts';
import { slotsFor, type Slot } from '../engine/rating.ts';
import type { MatchPlayer } from '../engine/matchmaker.ts';

/** Player name → percentage lower tonight (0–50). */
export type Adjustments = Record<string, number>;

export const ADJUST_MAX = 50;
export const ADJUST_STEP = 5;

const clampPct = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(ADJUST_MAX, Math.max(0, Math.round(n))) : 0);

/** Multiplier for a player's numbers tonight: 0.8 for 20% lower. */
export const adjustFactor = (adjust: Adjustments | undefined, name: string) => 1 - clampPct(adjust?.[name]) / 100;

/** Applies a player's adjustment to one of their slots. */
export function adjustSlot(slot: Slot, factor: number): Slot {
  return factor === 1 ? slot : { ...slot, value: slot.value * factor, base: slot.base * factor };
}

/** Keeps only real, non-zero adjustments for known players (e.g. when loading from storage). */
export function cleanAdjustments(x: unknown, names: ReadonlySet<string>, only?: readonly string[]): Adjustments {
  const out: Adjustments = {};
  if (!x || typeof x !== 'object') return out;
  for (const [name, v] of Object.entries(x as Record<string, unknown>)) {
    const pct = clampPct(v);
    if (pct > 0 && names.has(name) && (!only || only.includes(name))) out[name] = pct;
  }
  return out;
}

/** The team maker's input: every player's numbers in each role tonight, adjustments applied. */
export function buildMatchPlayers(
  names: readonly string[],
  roster: ReadonlyMap<string, Player>,
  allowed: ReadonlySet<string>,
  drop: number,
  adjust: Adjustments = {},
): MatchPlayer[] {
  return names.map((name) => {
    const f = adjustFactor(adjust, name);
    return {
      name,
      slots: slotsFor(roster.get(name)!, allowed, drop).map((s) => {
        const a = adjustSlot(s, f);
        return { value: a.value, steps: a.steps, unlisted: a.unlisted, champ: a.champ };
      }),
    };
  });
}
