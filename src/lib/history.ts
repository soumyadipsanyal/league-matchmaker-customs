/**
 * Match history: one entry per night (a date folder under
 * public/assets/history), with its screenshots grouped by game.
 *
 * Screenshot names start with the game number: "game-1.png", "Game 2.jpg",
 * "game-2-scoreboard.png". Anything else in the folder shows under "Other".
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-26" → "26 Nov". */
export function shortNight(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

/** "2026-11-26" → "Thursday 26 November 2026". */
export function nightLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export interface NightShots {
  /** Game number → screenshot paths, sorted by name. */
  games: Map<number, string[]>;
  other: string[];
}

/** Groups a night's screenshot paths (from the asset manifest) by game. */
export function shotsFor(date: string, files: readonly string[]): NightShots {
  const dir = `assets/history/${date}/`;
  const games = new Map<number, string[]>();
  const other: string[] = [];
  for (const f of files) {
    if (!f.startsWith(dir) || f.slice(dir.length).includes('/')) continue;
    const m = /^game[\s_-]*(\d+)(?!\d)/i.exec(f.slice(dir.length));
    if (m) {
      const n = Number(m[1]);
      games.set(n, [...(games.get(n) ?? []), f]);
    } else {
      other.push(f);
    }
  }
  for (const list of games.values()) list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  other.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { games, other };
}
