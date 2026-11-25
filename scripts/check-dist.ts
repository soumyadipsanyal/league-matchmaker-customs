/**
 * npm run check-dist  (after npm run build)
 *
 * Checks the built site in dist/ for leaks:
 *   1. the password does not appear anywhere (any letter case);
 *   2. no plaintext rating data: no rating fields, no steps-per-role maps, and
 *      none of the decrypted roster's own values in their original shape;
 *   3. the encrypted roster is in there, so the app can still unlock.
 *
 * It asks for the password (or reads ROSTER_PASSWORD) and first proves that it
 * opens the shipped roster, so the search really is for the right password.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decryptJson, WrongPasswordError } from '../src/lib/lock.ts';
import type { LockedRosterFile, SecretRoster } from '../src/lib/roster.ts';
import { askPassword, closePrompt } from './lib/prompt.ts';
import { DIST, LOCKED_ROSTER, PRIVATE_ROSTER, rel } from './lib/paths.ts';

const TEXT = /\.(html?|js|mjs|cjs|css|json|map|svg|txt|xml|webmanifest)$/i;
const ROLE = '["\']?(?:top|jg|mid|adc|sp)["\']?';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(DIST)) throw new Error('No dist folder. Run npm run build first.');
  const locked = JSON.parse(fs.readFileSync(LOCKED_ROSTER, 'utf8')) as LockedRosterFile;

  const password = await askPassword('Password (to search the build for it): ');
  closePrompt();
  if (!password) throw new Error('No password given.');
  let secret: SecretRoster;
  try {
    secret = await decryptJson<SecretRoster>(locked.lock, password);
  } catch (e) {
    if (e instanceof WrongPasswordError) throw new Error("That password doesn't open the shipped roster, so the check would be meaningless.");
    throw e;
  }

  const files = listFiles(DIST);
  const texts = files.filter((f) => TEXT.test(f)).map((f) => ({ file: rel(f), text: fs.readFileSync(f, 'utf8') }));
  const binaries = files.filter((f) => !TEXT.test(f)).map((f) => ({ file: rel(f), buf: fs.readFileSync(f) }));
  const problems: string[] = [];

  // 1. The password, in any case, in text files and raw bytes of everything else.
  const pwLower = password.toLowerCase();
  for (const t of texts) if (t.text.toLowerCase().includes(pwLower)) problems.push(`${t.file} contains the password.`);
  for (const b of binaries) if (b.buf.toString('latin1').toLowerCase().includes(pwLower)) problems.push(`${b.file} contains the password.`);

  // 2. Plaintext rating data.
  const patterns: { what: string; re: RegExp }[] = [
    { what: 'a plaintext "rating" field', re: /["']?\brating["']?\s*:\s*-?\.?\d/ },
    { what: 'a steps-per-role map', re: new RegExp(`${ROLE}\\s*:\\s*\\d+\\s*,\\s*${ROLE}\\s*:\\s*\\d`) },
    { what: 'a "steps" object', re: /["']?\bsteps["']?\s*:\s*\{\s*["']?(?:top|jg|mid|adc|sp)\b/ },
  ];
  // The decrypted roster's own shapes, exactly as they would be serialised.
  for (const p of secret.players) {
    patterns.push({ what: `${p.name}'s ratings as JSON`, re: new RegExp(escapeRe(JSON.stringify(p))) });
    // Skip trivially short shapes like {} (a player with no roles yet), which match any empty object.
    if (Object.keys(p.steps).length > 0) patterns.push({ what: `${p.name}'s steps as JSON`, re: new RegExp(escapeRe(JSON.stringify(p.steps))) });
  }
  patterns.push({ what: 'the decrypted roster', re: new RegExp(escapeRe(JSON.stringify(secret))) });
  if (fs.existsSync(PRIVATE_ROSTER)) {
    const raw = fs.readFileSync(PRIVATE_ROSTER, 'utf8');
    for (const line of raw.split(/\r?\n/).map((l) => l.trim().replace(/,$/, '')).filter((l) => l.length > 20)) {
      patterns.push({ what: 'a line of roster.private.json', re: new RegExp(escapeRe(line)) });
    }
  }
  for (const t of texts) {
    for (const p of patterns) {
      const m = p.re.exec(t.text);
      if (m) problems.push(`${t.file} contains ${p.what}: …${t.text.slice(Math.max(0, m.index - 30), m.index + 50)}…`);
    }
  }

  // 3. The encrypted roster made it in.
  const shipped = texts.some((t) => t.text.includes(locked.lock.data));
  if (!shipped) problems.push('The encrypted roster is not in the build, so the app could not unlock.');

  console.log(`Checked ${files.length} files in dist/.`);
  if (problems.length) {
    console.error(`\nFAILED:\n  - ${problems.join('\n  - ')}\n`);
    process.exit(1);
  }
  console.log('  ✓ The password does not appear anywhere (any letter case).');
  console.log(`  ✓ No plaintext ratings, steps or one-trick ratings (${patterns.length} patterns).`);
  console.log('  ✓ The encrypted roster is present.');
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
