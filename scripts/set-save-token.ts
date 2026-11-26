/**
 * npm run set-save-token
 *
 * Sets the master password and the GitHub token the organiser's Save button
 * uses, and writes them encrypted to src/data/save-lock.json. Leave the token
 * empty to set the master password now and the token later.
 *
 * Non-interactive: set ROSTER_MASTER_PASSWORD (and SAVE_TOKEN, possibly empty).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { decryptJson, encryptJson, PBKDF2_ITERATIONS } from '../src/lib/lock.ts';
import type { LockedRosterFile } from '../src/lib/roster.ts';
import { RECORDS_PATH, type SaveLockFile, type SaveSecret } from '../src/lib/savelock.ts';
import { askPassword, closePrompt } from './lib/prompt.ts';
import { LOCKED_ROSTER, ROOT, rel } from './lib/paths.ts';

const SAVE_LOCK = path.join(ROOT, 'src', 'data', 'save-lock.json');

function repoFromGit(): string | null {
  try {
    const remote = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();
    const m = /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(remote);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function checkToken(repo: string, token: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (res.status === 401) throw new Error('GitHub says that token is not valid (it may have expired or been mistyped).');
  if (res.status === 404 || res.status === 403) throw new Error(`That token can't see ${repo}. Give it access to this repository.`);
  if (!res.ok) throw new Error(`GitHub answered ${res.status} when checking the token.`);
  const body = (await res.json()) as { permissions?: { push?: boolean } };
  if (body.permissions && body.permissions.push === false) {
    throw new Error('That token can read the repo but not write to it. Give it "Contents: Read and write".');
  }
}

async function main() {
  const existing = fs.existsSync(SAVE_LOCK) ? (JSON.parse(fs.readFileSync(SAVE_LOCK, 'utf8')) as SaveLockFile) : null;
  const repo = existing?.repo ?? repoFromGit();
  if (!repo) throw new Error("Couldn't work out the GitHub repo (no 'origin' remote). Push the project to GitHub first.");

  const fromEnv = process.env.ROSTER_MASTER_PASSWORD !== undefined;
  const master = fromEnv ? process.env.ROSTER_MASTER_PASSWORD! : await askPassword('Master password: ');
  if (!master) throw new Error('The master password cannot be empty.');
  if (!fromEnv) {
    const again = await askPassword('Type it again: ');
    if (again !== master) throw new Error("The two passwords don't match. Nothing was written.");
  }

  // The master password must not also be the normal one.
  const locked = JSON.parse(fs.readFileSync(LOCKED_ROSTER, 'utf8')) as LockedRosterFile;
  const same = await decryptJson(locked.lock, master).then(
    () => true,
    () => false,
  );
  if (same) throw new Error('That is the normal password. Pick a different master password.');

  let token: string | null;
  if (process.env.SAVE_TOKEN !== undefined) token = process.env.SAVE_TOKEN || null;
  else token = (await askPassword('GitHub token for saving (press Enter to set it up later): ')).trim() || null;
  closePrompt();

  if (token) {
    process.stdout.write(`Checking the token against ${repo}… `);
    await checkToken(repo, token);
    console.log('it can write to the repo.');
  }

  process.stdout.write('Encrypting… ');
  const secret: SaveSecret = { master: true, token };
  const lock = await encryptJson(secret, master, PBKDF2_ITERATIONS);
  const check = await decryptJson<SaveSecret>(lock, master);
  if (check.token !== token) throw new Error('Self-check failed. Nothing was written.');
  const file: SaveLockFile = { v: 1, repo, branch: existing?.branch ?? 'main', path: existing?.path ?? RECORDS_PATH, lock };
  fs.writeFileSync(SAVE_LOCK, JSON.stringify(file, null, 2) + '\n');
  console.log('done.');
  console.log(`Wrote ${rel(SAVE_LOCK)} for ${repo}: master password set, ${token ? 'save token stored' : 'no save token yet (Save will say so)'}.`);
  console.log('Commit and push it to update the site.');
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
