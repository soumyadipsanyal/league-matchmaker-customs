import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, WrongPasswordError } from '../src/lib/lock.ts';
import { scrambleJson, unscrambleJson } from '../src/lib/scramble.ts';
import { mergeRoster, splitRoster, validateRoster, type LockedRosterFile, type PrivateRosterEntry, type SecretRoster } from '../src/lib/roster.ts';

const LOCKED_PATH = new URL('../src/data/roster.locked.json', import.meta.url);
const PRIVATE_PATH = new URL('../roster.private.json', import.meta.url);
const locked = JSON.parse(fs.readFileSync(LOCKED_PATH, 'utf8')) as LockedRosterFile;
const havePrivate = fs.existsSync(PRIVATE_PATH);
// The real password is never written in any file. Pass it in to run that check:
//   PowerShell:  $env:ROSTER_PASSWORD = '…'; npm test
const realPassword = process.env.ROSTER_PASSWORD;

const sample: PrivateRosterEntry[] = [
  { name: 'Ann', rating: 7, roles: { mid: 0, top: 1 }, ot: [{ champ: 'Some Champ', key: 'SomeChamp', role: 'mid', rating: 8 }] },
  { name: 'Bo', rating: 4.5, roles: {} },
];

describe('password lock (AES-GCM, PBKDF2 key)', () => {
  it('the right password decrypts and a wrong one fails', async () => {
    const box = await encryptJson({ hello: 'world', n: 7.5 }, 'correct horse', 2000);
    await expect(decryptJson(box, 'correct horse')).resolves.toEqual({ hello: 'world', n: 7.5 });
    await expect(decryptJson(box, 'Correct horse')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(decryptJson(box, '')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('uses a fresh salt and IV every time', async () => {
    const a = await encryptJson('x', 'pw', 1000);
    const b = await encryptJson('x', 'pw', 1000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('splits a roster so only names, roles played, mains and one-trick champions stay in the clear', async () => {
    const { players, secret } = splitRoster(sample);
    expect(JSON.stringify(players)).not.toMatch(/rating|steps|"[0-9.]+"|:\s*[0-9]/);
    expect(players[0]).toEqual({ name: 'Ann', roles: ['top', 'mid'], mains: ['mid'], ot: [{ champ: 'Some Champ', key: 'SomeChamp', role: 'mid' }] });
    const box = await encryptJson(secret, 'pw', 1000);
    const merged = mergeRoster(players, await decryptJson<SecretRoster>(box, 'pw'));
    expect(merged[0]).toMatchObject({ rating: 7, steps: { mid: 0, top: 1 }, otRating: { SomeChamp: 8 } });
    expect(merged[1]).toMatchObject({ rating: 4.5, roles: [], steps: {} });
  });

  it('validates roster.private.json entries', () => {
    expect(validateRoster(sample)).toEqual([]);
    const errs = validateRoster([
      { name: 'X', rating: 11, roles: { mid: 1, bot: 0 } },
      { name: 'Y', rating: 5, roles: { mid: 1 } },
      { name: 'x', rating: 5, roles: {} },
    ]);
    expect(errs.join('\n')).toMatch(/X.*"rating" must be a number from 0 to 10/);
    expect(errs.join('\n')).toMatch(/unknown role "bot"/);
    expect(errs.join('\n')).toMatch(/Y.*needs 0 steps/);
    expect(errs.join('\n')).toMatch(/name is used twice/);
  });
});

describe('scrambled copy for team-making', () => {
  it('round-trips without the password and is not readable as-is', () => {
    const value = { players: [{ name: 'Ann', rating: 7.5, steps: { mid: 0 } }] };
    const box = scrambleJson(value);
    expect(unscrambleJson(box)).toEqual(value);
    expect(atob(box.data)).not.toMatch(/rating|Ann|mid/);
    expect(scrambleJson(value).data).not.toBe(box.data); // a fresh key each time
  });
});

describe('the shipped roster (src/data/roster.locked.json)', () => {
  it('has a scrambled copy anyone can use to make teams, matching the public names', () => {
    const secret = unscrambleJson<SecretRoster>(locked.scrambled);
    expect(secret.players.map((p) => p.name)).toEqual(locked.players.map((p) => p.name));
    expect(atob(locked.scrambled.data)).not.toMatch(/rating|steps/);
  });

  it('carries no ratings in the clear', () => {
    expect(JSON.stringify(locked.players)).not.toMatch(/rating|steps/i);
    expect(locked.lock).toMatchObject({ alg: 'AES-GCM', kdf: 'PBKDF2', hash: 'SHA-256' });
    expect(locked.lock.iterations).toBeGreaterThanOrEqual(100_000);
  });

  it('a wrong password fails to open it', async () => {
    await expect(decryptJson(locked.lock, 'definitely not it')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it.skipIf(!realPassword)('the right password opens it, and it matches roster.private.json', async () => {
    const secret = await decryptJson<SecretRoster>(locked.lock, realPassword!);
    expect(secret.players.map((p) => p.name)).toEqual(locked.players.map((p) => p.name));
    if (havePrivate) {
      const entries = JSON.parse(fs.readFileSync(PRIVATE_PATH, 'utf8')) as PrivateRosterEntry[];
      const fresh = splitRoster(entries);
      expect(secret).toEqual(fresh.secret);
      expect(unscrambleJson(locked.scrambled)).toEqual(fresh.secret);
      expect(locked.players).toEqual(fresh.players);
    }
  });

  it.skipIf(!havePrivate)('roster.private.json round-trips through the lock', async () => {
    const entries = JSON.parse(fs.readFileSync(PRIVATE_PATH, 'utf8')) as PrivateRosterEntry[];
    expect(validateRoster(entries)).toEqual([]);
    const { players, secret } = splitRoster(entries);
    const box = await encryptJson(secret, 'a test password, not the real one', 1000);
    await expect(decryptJson(box, 'a test password, not the real one')).resolves.toEqual(secret);
    await expect(decryptJson(box, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
    expect(players).toEqual(locked.players);
  });
});
