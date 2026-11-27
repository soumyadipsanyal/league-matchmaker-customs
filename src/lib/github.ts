/**
 * Reads and writes the match records file in the site's GitHub repo, through
 * GitHub's contents API. Reading needs no token (the repo is public); saving
 * uses the organiser's token, which only exists in memory after the master
 * password unlocks it.
 */
import { fromBase64, toBase64 } from './lock.ts';
import { addGame, emptyRecords, setDone, validateRecords, type RecordGame, type RecordsFile } from './records.ts';

export interface SaveTarget {
  /** "owner/name" */
  repo: string;
  branch: string;
  path: string;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

type Fetch = typeof fetch;

const url = (t: SaveTarget) => `https://api.github.com/repos/${t.repo}/contents/${t.path}`;

const headers = (token?: string | null): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const encode = (file: RecordsFile) => toBase64(new TextEncoder().encode(JSON.stringify(file, null, 2) + '\n'));
const decode = (b64: string) => JSON.parse(new TextDecoder().decode(fromBase64(b64.replace(/\s/g, '')))) as unknown;

/** The records file as it is on GitHub right now, and its version (sha). */
export async function readRecords(t: SaveTarget, token?: string | null, f: Fetch = fetch): Promise<{ file: RecordsFile; sha: string | null }> {
  const res = await f(`${url(t)}?ref=${encodeURIComponent(t.branch)}`, { headers: headers(token), cache: 'no-store' });
  if (res.status === 404) return { file: emptyRecords(), sha: null };
  if (res.status === 401 || res.status === 403) throw new SaveError('GitHub refused the request. The save token may have expired, or reading limits were hit; try again in a while.');
  if (!res.ok) throw new SaveError(`GitHub answered ${res.status} when reading the match records.`);
  const body = (await res.json()) as { sha: string; content: string };
  const data = decode(body.content);
  const problems = validateRecords(data);
  if (problems.length) throw new SaveError(`The match records file on GitHub looks damaged: ${problems[0]}`);
  return { file: data as RecordsFile, sha: body.sha };
}

/**
 * Reads the records on GitHub, applies a change and writes them back. If
 * someone else saved at the same moment, it reads the file again and retries.
 * A change that returns no message leaves the file as it is.
 */
async function updateRecords<T>(
  t: SaveTarget,
  token: string,
  change: (file: RecordsFile) => { file: RecordsFile; message: string | null; result: T },
  f: Fetch,
): Promise<{ file: RecordsFile; result: T }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { file, sha } = await readRecords(t, token, f);
    const next = change(file);
    if (next.message === null) return { file, result: next.result };
    const res = await f(url(t), {
      method: 'PUT',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: next.message, content: encode(next.file), branch: t.branch, ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return { file: next.file, result: next.result };
    if (res.status === 409 || res.status === 422) continue; // changed underneath us: read again
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new SaveError("GitHub refused the save token. It may have expired or not have write access to the repo; set a new one with npm run set-save-token.");
    }
    throw new SaveError(`GitHub answered ${res.status} when saving.`);
  }
  throw new SaveError('Someone else kept saving at the same time. Try again.');
}

/**
 * Adds a game to the night on GitHub. The night is worked out from the file
 * as it is on GitHub (so it carries on tonight's games, or starts a new night
 * once the last one is marked done).
 */
export async function saveGame(
  t: SaveTarget,
  token: string,
  nightOf: (file: RecordsFile) => string,
  game: RecordGame,
  f: Fetch = fetch,
): Promise<{ number: number; already: boolean; date: string; file: RecordsFile }> {
  const { file, result } = await updateRecords(
    t,
    token,
    (current) => {
      const date = nightOf(current);
      const next = addGame(current, date, game);
      return { file: next.file, message: next.already ? null : `Save game ${next.number} for ${date}`, result: { number: next.number, already: next.already, date } };
    },
    f,
  );
  return { ...result, file };
}

/** Marks a night "all matches done" on GitHub, or reopens it. */
export async function markNightDone(t: SaveTarget, token: string, date: string, done: boolean, f: Fetch = fetch): Promise<{ file: RecordsFile }> {
  const { file } = await updateRecords(
    t,
    token,
    (current) => {
      if (!current.nights.some((n) => n.date === date)) throw new SaveError(`There are no saved games for ${date} to mark.`);
      const next = setDone(current, date, done);
      return { file: next.file, message: next.changed ? `${done ? 'All matches done' : 'Reopen'} for ${date}` : null, result: null };
    },
    f,
  );
  return { file };
}
