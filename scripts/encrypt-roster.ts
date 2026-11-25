/**
 * npm run encrypt-roster
 *
 * Reads roster.private.json, asks for the password, and writes
 * src/data/roster.locked.json: names, roles played and one-trick champions in
 * the clear; the ratings, steps per role and one-trick ratings encrypted with
 * AES-GCM under a PBKDF2-derived key (Unlock checks the password against this);
 * and the same ratings scrambled, so anyone can make teams without the password.
 *
 * Set ROSTER_PASSWORD to skip the prompt (for example in CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { decryptJson, encryptJson, PBKDF2_ITERATIONS } from '../src/lib/lock.ts';
import { scrambleJson, unscrambleJson } from '../src/lib/scramble.ts';
import { splitRoster, validateRoster, type LockedRosterFile, type PrivateRosterEntry, type SecretRoster } from '../src/lib/roster.ts';
import { askPassword, closePrompt } from './lib/prompt.ts';
import { LOCKED_ROSTER, PRIVATE_ROSTER, rel } from './lib/paths.ts';

async function main() {
  if (!fs.existsSync(PRIVATE_ROSTER)) {
    throw new Error(`Can't find ${rel(PRIVATE_ROSTER)}. It should sit in the project folder.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(PRIVATE_ROSTER, 'utf8'));
  } catch (e) {
    throw new Error(`${rel(PRIVATE_ROSTER)} isn't valid JSON: ${(e as Error).message}`);
  }
  const problems = validateRoster(data);
  if (problems.length) {
    throw new Error(`Please fix ${rel(PRIVATE_ROSTER)} first:\n  - ${problems.join('\n  - ')}`);
  }
  const entries = data as PrivateRosterEntry[];

  const fromEnv = Boolean(process.env.ROSTER_PASSWORD);
  const password = await askPassword('Password: ');
  if (!password) throw new Error('The password cannot be empty.');
  if (!fromEnv) {
    const again = await askPassword('Type it again: ');
    if (again !== password) throw new Error("The two passwords don't match. Nothing was written.");
  }
  closePrompt();
  if (password.length < 12) {
    console.warn(
      '\nNote: short or common passwords can be guessed by anyone who downloads the site and tries a list of words.\n' +
        'A longer passphrase (four or more random words) keeps the ratings properly private.\n',
    );
  }

  const { players, secret } = splitRoster(entries);
  process.stdout.write('Encrypting… ');
  const lock = await encryptJson(secret, password, PBKDF2_ITERATIONS);

  // Prove the file opens with this password before writing it.
  const check = await decryptJson<SecretRoster>(lock, password);
  if (JSON.stringify(check) !== JSON.stringify(secret)) throw new Error('Self-check failed: decrypted data does not match.');

  const scrambled = scrambleJson(secret);
  if (JSON.stringify(unscrambleJson(scrambled)) !== JSON.stringify(secret)) throw new Error('Self-check failed: unscrambled data does not match.');

  const file: LockedRosterFile = { v: 1, players, lock, scrambled };
  fs.mkdirSync(path.dirname(LOCKED_ROSTER), { recursive: true });
  fs.writeFileSync(LOCKED_ROSTER, JSON.stringify(file, null, 2) + '\n');
  console.log('done.');
  console.log(`Wrote ${rel(LOCKED_ROSTER)}: ${players.length} players.`);
  console.log(`  - ratings locked under the password (${PBKDF2_ITERATIONS.toLocaleString('en-GB')} PBKDF2 rounds): Unlock checks this`);
  console.log('  - ratings scrambled for team-making: anyone can make teams, and someone who digs into the code could unscramble them');
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
