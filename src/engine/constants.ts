/** Main-role preference: cost of being off main at all, and per step down the role list. */
const OFF_MAIN = 0.6;
const STEP_COST = 0.8;

/** Each step down a player's role list takes this share off their main rating. Editable in Settings. */
export const DEFAULT_STEP_DROP = 0.15;

/** Settings allows the drop to be set between these (as fractions). */
export const STEP_DROP_MIN = 0;
export const STEP_DROP_MAX = 0.3;

/**
 * Game score, lower is better:
 *   4 × |blue total − red total| + 1.0 × biggest lane gap + 0.4 × average lane gap
 *   + for each player off their main role: offMain + steps × (steps off main)
 *   + offRoleAgain for each player off main who was also off main last game they played
 *   + 10 × unlisted-role placements
 *
 * Main roles are preferred over a little balance, and being off-role two games
 * running is avoided whenever there is any reasonable alternative.
 */
export const WEIGHTS = {
  teamGap: 4,
  maxLane: 1,
  avgLane: 0.4,
  offMain: OFF_MAIN,
  steps: STEP_COST,
  offRoleAgain: 8,
  unlisted: 10,
} as const;

/** Shuffle picks among lineups within this much of the best score. */
export const SHUFFLE_TOLERANCE = 0.5;

/** Time the search may take before it settles for the best found so far. */
export const SEARCH_TIME_MS = 1300;
