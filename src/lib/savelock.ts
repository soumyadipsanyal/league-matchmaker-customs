/**
 * The organiser's lock: src/data/save-lock.json. The master password opens
 * it; inside is the GitHub token Save uses to write the match records. The
 * password and the token never appear in the site in readable form.
 */
import type { LockBox } from './lock.ts';

export interface SaveLockFile {
  v: 1;
  /** "owner/name" of the site's GitHub repo. */
  repo: string;
  branch: string;
  /** Where the match records live in the repo. */
  path: string;
  lock: LockBox;
}

/** What the master password unlocks. */
export interface SaveSecret {
  master: true;
  /** GitHub token with write access to the repo's contents, or null if not set up yet. */
  token: string | null;
}

export const RECORDS_PATH = 'src/data/match-records.json';
