import { describe, expect, it } from 'vitest';
import { adjustFactor, buildMatchPlayers, cleanAdjustments } from '../src/lib/adjust.ts';
import { gameView, validTeams, type TeamsGame } from '../src/lib/teams.ts';
import { ROLES } from '../src/lib/roles.ts';
import { otId } from '../src/lib/roster.ts';
import { player, syntheticRoster } from './helpers.ts';

const DROP = 0.15;

describe("tonight's adjustments", () => {
  const ann = player('Ann', 8, { mid: 0, top: 1 }, [{ key: 'Ahri', role: 'mid', rating: 9 }]);
  const bo = player('Bo', 6, { sp: 0 });
  const roster = new Map([ann, bo].map((p) => [p.name, p]));
  const allowed = new Set([otId('Ann', 'Ahri')]);

  it('lowers every role and one-trick by the percentage, and nothing else', () => {
    const plain = buildMatchPlayers(['Ann', 'Bo'], roster, allowed, DROP);
    const lowered = buildMatchPlayers(['Ann', 'Bo'], roster, allowed, DROP, { Ann: 20 });
    ROLES.forEach((_, r) => {
      expect(lowered[0].slots[r].value).toBeCloseTo(plain[0].slots[r].value * 0.8, 10);
      expect(lowered[0].slots[r].steps).toBe(plain[0].slots[r].steps);
      expect(lowered[0].slots[r].unlisted).toBe(plain[0].slots[r].unlisted);
      expect(lowered[0].slots[r].champ).toBe(plain[0].slots[r].champ);
      expect(lowered[1].slots[r]).toEqual(plain[1].slots[r]);
    });
    // On the one-trick in mid: 9 × 0.8.
    expect(lowered[0].slots[2]).toMatchObject({ champ: 'Ahri' });
    expect(lowered[0].slots[2].value).toBeCloseTo(7.2, 10);
  });

  it('cleans stored values: known players only, 0–50%, zeros dropped', () => {
    const names = new Set(['Ann', 'Bo', 'Cy']);
    expect(cleanAdjustments({ Ann: 20, Bo: 0, Cy: 80, Zed: 30, Ann2: 'x' }, names)).toEqual({ Ann: 20, Cy: 50 });
    expect(cleanAdjustments({ Ann: 20, Cy: 10 }, names, ['Cy'])).toEqual({ Cy: 10 });
    expect(cleanAdjustments(null, names)).toEqual({});
    expect(adjustFactor({ Ann: 25 }, 'Ann')).toBeCloseTo(0.75, 10);
    expect(adjustFactor({}, 'Ann')).toBe(1);
  });

  it('applies to the numbers shown for teams, and old saved teams still load', () => {
    const ten = syntheticRoster(10, 12);
    const byName = new Map(ten.map((p) => [p.name, p]));
    const place = (i: number, r: number) => ({ name: ten[i].name, role: ROLES[r], champ: null });
    const game: TeamsGame = { blue: ROLES.map((_, r) => place(r, r)), red: ROLES.map((_, r) => place(r + 5, r)), out: [] };
    const plain = gameView(game, byName, DROP)!;
    const lowered = gameView(game, byName, DROP, { [ten[0].name]: 50 })!;
    expect(lowered.blue[0].value).toBeCloseTo(plain.blue[0].value / 2, 10);
    expect(lowered.numbers.blueTotal).toBeCloseTo(plain.numbers.blueTotal - plain.blue[0].value / 2, 10);
    expect(lowered.numbers.redTotal).toBeCloseTo(plain.numbers.redTotal, 10);

    const names = new Set(ten.map((p) => p.name));
    const old = validTeams({ games: [game], players: ten.map((p) => p.name), allowed: [] }, names);
    expect(old?.adjust).toEqual({});
  });
});
