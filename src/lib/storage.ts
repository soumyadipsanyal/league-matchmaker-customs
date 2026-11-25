/**
 * localStorage, wrapped so a private window or blocked storage never breaks
 * the app. Only selections, settings and lineups (names and roles) are kept.
 * Never the password, never ratings.
 */
const PREFIX = 'thursday-customs:';

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: carry on without it */
  }
}
