/**
 * Runs before `npm run build`. Makes sure src/data/roster.locked.json exists
 * and matches roster.private.json, so a forgotten `npm run encrypt-roster`
 * doesn't ship an out-of-date roster.
 *
 * Without the password it can only compare the public half (names, roles,
 * main roles, one-tricks). When roster.private.json has been saved since the
 * last encrypt it prints a reminder, since ratings may have changed.
 *
 * When roster.private.json isn't there (e.g. on GitHub Actions) it only checks
 * that the locked file exists.
 */
import fs from 'node:fs';
import { splitRoster, validateRoster, type LockedRosterFile, type PrivateRosterEntry } from '../src/lib/roster.ts';
import { LOCKED_ROSTER, PRIVATE_ROSTER, rel } from './lib/paths.ts';

function fail(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(LOCKED_ROSTER)) {
  fail(`${rel(LOCKED_ROSTER)} is missing. Run: npm run encrypt-roster`);
}
const locked = JSON.parse(fs.readFileSync(LOCKED_ROSTER, 'utf8')) as LockedRosterFile;
if (!locked.scrambled) {
  fail(`${rel(LOCKED_ROSTER)} is from an older version and can't be used to make teams without the password. Run: npm run encrypt-roster`);
}

if (!fs.existsSync(PRIVATE_ROSTER)) {
  console.log(`Roster: using ${rel(LOCKED_ROSTER)} (${locked.players.length} players). ${rel(PRIVATE_ROSTER)} not found, so skipping the freshness check.`);
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(PRIVATE_ROSTER, 'utf8')) as unknown;
const problems = validateRoster(data);
if (problems.length) fail(`Please fix ${rel(PRIVATE_ROSTER)}:\n  - ${problems.join('\n  - ')}`);

const { players } = splitRoster(data as PrivateRosterEntry[]);
if (JSON.stringify(players) !== JSON.stringify(locked.players)) {
  fail(
    `${rel(PRIVATE_ROSTER)} has changed since it was last encrypted (names, roles or one-tricks differ).\n` +
      'Run: npm run encrypt-roster',
  );
}

const editedAfter = fs.statSync(PRIVATE_ROSTER).mtimeMs > fs.statSync(LOCKED_ROSTER).mtimeMs + 1000;
if (editedAfter) {
  console.warn(
    `Reminder: ${rel(PRIVATE_ROSTER)} was saved after the last encrypt. If you changed any ratings, run npm run encrypt-roster before deploying.`,
  );
} else {
  console.log(`Roster: ${rel(LOCKED_ROSTER)} is up to date (${locked.players.length} players).`);
}
