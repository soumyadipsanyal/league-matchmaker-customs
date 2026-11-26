import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRecords, saveGame, SaveError, type SaveTarget } from '../src/lib/github.ts';
import { decryptJson, toBase64, WrongPasswordError } from '../src/lib/lock.ts';
import { addGame, emptyRecords, mergeRecords, nightDate, nightState, recordKey, validateRecords, type RecordGame, type RecordsFile } from '../src/lib/records.ts';
import { ROLES, type Role } from '../src/lib/roles.ts';
import type { LockedRosterFile } from '../src/lib/roster.ts';
import type { SaveLockFile, SaveSecret } from '../src/lib/savelock.ts';

const game = (blue: string[], red: string[], out: string[] = []): RecordGame => ({
  blue: blue.map((name, k) => ({ name, role: ROLES[k] })),
  red: red.map((name, k) => ({ name, role: ROLES[k] })),
  out,
});
const g1 = game(['A', 'B', 'C', 'D', 'E'], ['F', 'G', 'H', 'I', 'J'], ['K', 'L']);
const g2 = game(['K', 'B', 'C', 'D', 'E'], ['L', 'G', 'H', 'I', 'J'], ['A', 'F']);

describe("today's match record", () => {
  it('counts games after midnight for the night before', () => {
    expect(nightDate(new Date(2026, 10, 26, 21, 30))).toBe('2026-11-26');
    expect(nightDate(new Date(2026, 10, 27, 1, 15))).toBe('2026-11-26');
    expect(nightDate(new Date(2026, 10, 27, 7, 0))).toBe('2026-11-27');
  });

  it('adds games to a night once each, in order', () => {
    let f = addGame(emptyRecords(), '2026-11-27', g1);
    expect(f).toMatchObject({ number: 1, already: false });
    f = addGame(f.file, '2026-11-27', g2);
    expect(f).toMatchObject({ number: 2, already: false });
    // Same teams with sides swapped is the same game.
    const again = addGame(f.file, '2026-11-27', { blue: g1.red, red: g1.blue, out: g1.out });
    expect(again).toMatchObject({ number: 1, already: true });
    expect(validateRecords(f.file)).toEqual([]);
    expect(mergeRecords(f.file, addGame(emptyRecords(), '2026-11-27', g1).file).nights[0].games).toHaveLength(2);
  });

  it("works out who sat out last, sit-out counts and who's owed a main role", () => {
    const mains = new Map<string, Role[]>([
      ['A', ['top']],
      ['B', ['mid']], // played jungle: off main
      ['K', ['sp']], // played top in game 2: off main
      ['C', ['mid']],
    ]);
    const st = nightState({ date: '2026-11-27', games: [g1, g2] }, mains);
    expect(st.games).toBe(2);
    expect(st.lastOut).toEqual(['A', 'F']);
    expect(st.satOut).toEqual({ K: 1, L: 1, A: 1, F: 1 });
    // A was on main (top) in game 1, then sat out: not owed. B off main last played; K off main in game 2.
    expect(st.owed).toEqual(['B', 'K']);
  });

  it('the shipped records file is valid', () => {
    const data = JSON.parse(fs.readFileSync(new URL('../src/data/match-records.json', import.meta.url), 'utf8'));
    expect(validateRecords(data)).toEqual([]);
  });
});

/** A pretend GitHub contents API for one file. */
function fakeGitHub(opts: { start?: RecordsFile | null; token?: string; conflictOnce?: boolean } = {}) {
  let content: string | null = opts.start ? toBase64(new TextEncoder().encode(JSON.stringify(opts.start))) : null;
  let sha = content ? 'v1' : null;
  let conflict = opts.conflictOnce ?? false;
  const puts: { message: string; sha?: string }[] = [];
  const f = (async (_url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    const authed = auth === `Bearer ${opts.token ?? 'good'}`;
    if (!init?.method || init.method === 'GET') {
      if (!content) return new Response('', { status: 404 });
      return new Response(JSON.stringify({ sha, content }), { status: 200 });
    }
    if (!authed) return new Response('', { status: 401 });
    const body = JSON.parse(String(init.body)) as { message: string; content: string; sha?: string };
    puts.push({ message: body.message, sha: body.sha });
    if (conflict) {
      conflict = false;
      sha = 'someone-else';
      return new Response('', { status: 409 });
    }
    if ((body.sha ?? null) !== sha) return new Response('', { status: 409 });
    content = body.content;
    sha = `v${puts.length + 1}`;
    return new Response(JSON.stringify({ content: { sha } }), { status: 201 });
  }) as typeof fetch;
  return { f, puts, read: () => readRecords(target, null, f) };
}
const target: SaveTarget = { repo: 'me/site', branch: 'main', path: 'src/data/match-records.json' };

describe('saving to GitHub', () => {
  it('creates the file, then adds to it', async () => {
    const gh = fakeGitHub();
    const a = await saveGame(target, 'good', '2026-11-27', g1, gh.f);
    expect(a).toMatchObject({ number: 1, already: false });
    const b = await saveGame(target, 'good', '2026-11-27', g2, gh.f);
    expect(b).toMatchObject({ number: 2, already: false });
    const { file } = await gh.read();
    expect(file.nights[0].games.map(recordKey)).toEqual([recordKey(g1), recordKey(g2)]);
    expect(gh.puts.map((p) => p.message)).toEqual(['Save game 1 for 2026-11-27', 'Save game 2 for 2026-11-27']);
  });

  it("doesn't save the same game twice", async () => {
    const gh = fakeGitHub({ start: addGame(emptyRecords(), '2026-11-27', g1).file });
    const res = await saveGame(target, 'good', '2026-11-27', g1, gh.f);
    expect(res).toMatchObject({ number: 1, already: true });
    expect(gh.puts).toHaveLength(0);
  });

  it('reads again and retries if someone else saved at the same moment', async () => {
    const gh = fakeGitHub({ start: emptyRecords(), conflictOnce: true });
    const res = await saveGame(target, 'good', '2026-11-27', g1, gh.f);
    expect(res.already).toBe(false);
    expect(gh.puts.length).toBe(2);
  });

  it('explains a refused token', async () => {
    const gh = fakeGitHub();
    await expect(saveGame(target, 'expired', '2026-11-27', g1, gh.f)).rejects.toBeInstanceOf(SaveError);
  });
});

describe('master password lock (src/data/save-lock.json)', () => {
  const saveLock = JSON.parse(fs.readFileSync(new URL('../src/data/save-lock.json', import.meta.url), 'utf8')) as SaveLockFile;
  const locked = JSON.parse(fs.readFileSync(new URL('../src/data/roster.locked.json', import.meta.url), 'utf8')) as LockedRosterFile;
  const master = process.env.ROSTER_MASTER_PASSWORD;
  const normal = process.env.ROSTER_PASSWORD;

  it('ships no token or password in the clear', () => {
    expect(Object.keys(saveLock).sort()).toEqual(['branch', 'lock', 'path', 'repo', 'v']);
    expect(JSON.stringify(saveLock)).not.toMatch(/github_pat_|ghp_/);
  });

  it('a wrong password fails to open it', async () => {
    await expect(decryptJson(saveLock.lock, 'definitely not it')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it.skipIf(!master)('the master password opens it, and not the ratings lock', async () => {
    const secret = await decryptJson<SaveSecret>(saveLock.lock, master!);
    expect(secret.master).toBe(true);
    await expect(decryptJson(locked.lock, master!)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it.skipIf(!normal)('the normal password does not open it', async () => {
    await expect(decryptJson(saveLock.lock, normal!)).rejects.toBeInstanceOf(WrongPasswordError);
  });
});
