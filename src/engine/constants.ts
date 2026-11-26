/** Each step down a player's role list takes this share off their main rating. Editable in Settings. */
export const DEFAULT_STEP_DROP = 0.15;

/** Settings allows the drop to be set between these (as fractions). */
export const STEP_DROP_MIN = 0;
export const STEP_DROP_MAX = 0.3;

/**
 * Game score, lower is better:
 *   4 × |blue total − red total| + 1.0 × biggest lane gap + 0.4 × average lane gap
 *   + for each player off their main role: offMain + steps × (steps off main),
 *     doubled if they were also off their main role last game they played
 *   + 10 × unlisted-role placements
 *
 * Getting people onto their main role counts for more than perfect balance:
 * one player one step off main costs as much as a 0.75 gap between team totals.
 */
export const WEIGHTS = {
  teamGap: 4,
  maxLane: 1,
  avgLane: 0.4,
  offMain: 1.5,
  steps: 1.5,
  unlisted: 10,
} as const;

/** Off their main role last game they played: their off-role cost is multiplied by this. */
export const OFF_ROLE_REPEAT = 2;

/** Shuffle picks among lineups within this much of the best score. */
export const SHUFFLE_TOLERANCE = 0.5;

/** Time the search may take before it settles for the best found so far. */
export const SEARCH_TIME_MS = 1300;
