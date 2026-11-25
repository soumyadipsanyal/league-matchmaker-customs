import { ROLES, isRole, type Role } from './roles.ts';
import type { LockBox } from './lock.ts';

/** One entry of roster.private.json, exactly as the owner edits it. */
export interface PrivateRosterEntry {
  name: string;
  /** Out of 10, on the player's main role. */
  rating: number;
  /** Role -> how many steps below main (0 = main). Empty = roles not set yet. */
  roles: Partial<Record<Role, number>>;
  ot?: { champ: string; key: string; role: Role; rating: number }[];
}

/** A one-trick as shipped in the clear: no rating. */
export interface PublicOneTrick {
  champ: string;
  key: string;
  role: Role;
}

/** What anyone can see: names, roles played, main roles and one-trick champions. */
export interface PublicPlayer {
  name: string;
  /** Roles played, in fixed map order (top, jg, mid, adc, sp) so the order leaks nothing. */
  roles: Role[];
  /** Main role(s). */
  mains: Role[];
  ot: PublicOneTrick[];
}

/** The encrypted half: ratings, steps per role and one-trick ratings. */
export interface SecretPlayer {
  name: string;
  rating: number;
  steps: Partial<Record<Role, number>>;
  ot: { key: string; rating: number }[];
}

export interface SecretRoster {
  v: 1;
  players: SecretPlayer[];
}

/** The file the app ships: src/data/roster.locked.json. */
export interface LockedRosterFile {
  v: 1;
  players: PublicPlayer[];
  lock: LockBox;
}

/** A player once the roster is unlocked. */
export interface Player extends PublicPlayer {
  rating: number;
  steps: Partial<Record<Role, number>>;
  /** One-trick key -> rating. */
  otRating: Record<string, number>;
}

/** A one-trick's id in selections: "Subham:Sett". */
export const otId = (player: string, key: string) => `${player}:${key}`;

export const rolesNotSet = (p: PublicPlayer) => p.roles.length === 0;

/** Checks roster.private.json and returns a list of problems (empty = fine). */
export function validateRoster(data: unknown): string[] {
  const errs: string[] = [];
  if (!Array.isArray(data)) return ['The roster must be a JSON array of players.'];
  const names = new Set<string>();
  data.forEach((p: unknown, i) => {
    const at = `Player ${i + 1}`;
    if (!p || typeof p !== 'object') {
      errs.push(`${at} is not an object.`);
      return;
    }
    const e = p as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const who = name ? `${at} (${name})` : at;
    if (!name) errs.push(`${at} needs a "name".`);
    else if (names.has(name.toLowerCase())) errs.push(`${who}: the name is used twice.`);
    else names.add(name.toLowerCase());
    if (typeof e.rating !== 'number' || !(e.rating >= 0 && e.rating <= 10)) errs.push(`${who}: "rating" must be a number from 0 to 10.`);
    if (!e.roles || typeof e.roles !== 'object' || Array.isArray(e.roles)) {
      errs.push(`${who}: "roles" must be an object such as {"mid":0,"top":1}.`);
    } else {
      const roles = e.roles as Record<string, unknown>;
      for (const [r, s] of Object.entries(roles)) {
        if (!isRole(r)) errs.push(`${who}: unknown role "${r}". Use ${ROLES.join(', ')}.`);
        if (typeof s !== 'number' || !Number.isInteger(s) || s < 0) errs.push(`${who}: steps for "${r}" must be a whole number, 0 or more.`);
      }
      const vals = Object.values(roles).filter((s): s is number => typeof s === 'number');
      if (vals.length > 0 && !vals.includes(0)) errs.push(`${who}: one role needs 0 steps (the main role).`);
    }
    if (e.ot !== undefined) {
      if (!Array.isArray(e.ot)) errs.push(`${who}: "ot" must be a list.`);
      else
        e.ot.forEach((o: unknown, j) => {
          const t = (o ?? {}) as Record<string, unknown>;
          const ow = `${who}, one-trick ${j + 1}`;
          if (typeof t.champ !== 'string' || !t.champ.trim()) errs.push(`${ow}: needs "champ".`);
          if (typeof t.key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(t.key)) errs.push(`${ow}: "key" must be letters and numbers only, such as "MasterYi".`);
          if (!isRole(t.role)) errs.push(`${ow}: "role" must be one of ${ROLES.join(', ')}.`);
          if (typeof t.rating !== 'number' || !(t.rating >= 0 && t.rating <= 10)) errs.push(`${ow}: "rating" must be a number from 0 to 10.`);
        });
    }
  });
  return errs;
}

/** Splits the private roster into the part that ships in the clear and the part that gets encrypted. */
export function splitRoster(entries: PrivateRosterEntry[]): { players: PublicPlayer[]; secret: SecretRoster } {
  const players: PublicPlayer[] = entries.map((e) => ({
    name: e.name.trim(),
    roles: ROLES.filter((r) => e.roles[r] !== undefined),
    mains: ROLES.filter((r) => e.roles[r] === 0),
    ot: (e.ot ?? []).map((o) => ({ champ: o.champ, key: o.key, role: o.role })),
  }));
  const secret: SecretRoster = {
    v: 1,
    players: entries.map((e) => ({
      name: e.name.trim(),
      rating: e.rating,
      steps: Object.fromEntries(ROLES.filter((r) => e.roles[r] !== undefined).map((r) => [r, e.roles[r]])),
      ot: (e.ot ?? []).map((o) => ({ key: o.key, rating: o.rating })),
    })),
  };
  return { players, secret };
}

/** Joins the public roster with the decrypted secret half. */
export function mergeRoster(pub: PublicPlayer[], secret: SecretRoster): Player[] {
  const byName = new Map(secret.players.map((s) => [s.name, s]));
  return pub.map((p) => {
    const s = byName.get(p.name);
    if (!s) throw new Error(`The locked roster has no ratings for ${p.name}. Run npm run encrypt-roster again.`);
    return {
      ...p,
      rating: s.rating,
      steps: s.steps,
      otRating: Object.fromEntries(s.ot.map((o) => [o.key, o.rating])),
    };
  });
}
