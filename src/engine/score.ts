import { WEIGHTS } from './constants.ts';

/** The parts of a slot that scoring needs. */
export interface ScoredSlot {
  value: number;
  steps: number;
  unlisted: boolean;
}

/**
 * What a placement costs for not being on the player's main role: a flat cost
 * for being off main plus a cost per step, a large extra cost if they were
 * also off main the last game they played, and a large cost for a role they
 * don't list at all.
 */
export function rolePenalty(s: { steps: number; unlisted: boolean }, offLastGame = false): number {
  const off = s.steps > 0 ? WEIGHTS.offMain + WEIGHTS.steps * s.steps + (offLastGame ? WEIGHTS.offRoleAgain : 0) : 0;
  return off + (s.unlisted ? WEIGHTS.unlisted : 0);
}

export interface LaneGaps {
  top: number;
  jg: number;
  mid: number;
  /** ADC and support as a duo: |(blue ADC + blue support) − (red ADC + red support)| ÷ 2. */
  bot: number;
}

export interface GameNumbers {
  blueTotal: number;
  redTotal: number;
  teamGap: number;
  lanes: LaneGaps;
  maxLane: number;
  avgLane: number;
  steps: number;
  /** Players not on their main role. */
  offMain: number;
  unlisted: number;
  score: number;
}

/**
 * Scores one game. `blue` and `red` are in role order: top, jg, mid, adc, sp.
 * Lower is better.
 */
export function scoreLineup(blue: readonly ScoredSlot[], red: readonly ScoredSlot[]): GameNumbers {
  const sum = (a: readonly ScoredSlot[]) => a.reduce((s, x) => s + x.value, 0);
  const blueTotal = sum(blue);
  const redTotal = sum(red);
  const lanes: LaneGaps = {
    top: Math.abs(blue[0].value - red[0].value),
    jg: Math.abs(blue[1].value - red[1].value),
    mid: Math.abs(blue[2].value - red[2].value),
    bot: Math.abs(blue[3].value + blue[4].value - (red[3].value + red[4].value)) / 2,
  };
  const gaps = [lanes.top, lanes.jg, lanes.mid, lanes.bot];
  const maxLane = Math.max(...gaps);
  const avgLane = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const all = [...blue, ...red];
  const steps = all.reduce((s, x) => s + x.steps, 0);
  const offMain = all.filter((x) => x.steps > 0).length;
  const unlisted = all.filter((x) => x.unlisted).length;
  const penalties = all.reduce((s, x) => s + rolePenalty(x), 0);
  const teamGap = Math.abs(blueTotal - redTotal);
  const score =
    WEIGHTS.teamGap * teamGap + WEIGHTS.maxLane * maxLane + WEIGHTS.avgLane * avgLane + penalties;
  return { blueTotal, redTotal, teamGap, lanes, maxLane, avgLane, steps, offMain, unlisted, score };
}
