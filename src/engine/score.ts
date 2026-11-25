import { WEIGHTS } from './constants.ts';

/** The parts of a slot that scoring needs. */
export interface ScoredSlot {
  value: number;
  steps: number;
  unlisted: boolean;
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
  const unlisted = all.filter((x) => x.unlisted).length;
  const teamGap = Math.abs(blueTotal - redTotal);
  const score =
    WEIGHTS.teamGap * teamGap + WEIGHTS.maxLane * maxLane + WEIGHTS.avgLane * avgLane + WEIGHTS.steps * steps + WEIGHTS.unlisted * unlisted;
  return { blueTotal, redTotal, teamGap, lanes, maxLane, avgLane, steps, unlisted, score };
}
