import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aggregate, champKey, minutesOf, validateStats, type StatGame, type StatLine } from '../src/lib/stats.ts';
import { nightLabel, shotsFor } from '../src/lib/history.ts';

const line = (player: string, champ: string, k: number, d: number, a: number, cs: number, gold: number, dmg: number | null = null, vision: number | null = null): StatLine => ({
  player,
  champ,
  k,
  d,
  a,
  cs,
  gold,
  dmg,
  vision,
});

// One 30-minute game, made-up numbers. Blue: 20 kills, 50,000 gold, 100,000 damage.
const game: StatGame = {
  game: 1,
  duration: '30:00',
  winner: 'blue',
  blue: [
    line('Ann', 'Ahri', 5, 2, 7, 240, 12_000, 30_000, 30),
    line('Bo', 'Lee Sin', 4, 3, 10, 150, 10_000, 15_000, 45),
    line('Cy', 'Darius', 6, 4, 3, 210, 11_000, 25_000, 15),
    line('Di', 'Jhin', 4, 1, 6, 260, 11_000, 22_000, 20),
    line('Ed', 'Thresh', 1, 5, 14, 30, 6_000, 8_000, 80),
  ],
  red: [
    line('Fi', 'Viktor', 3, 4, 5, 230, 10_500, 21_000, null),
    line('Gu', 'Udyr', 2, 5, 6, 160, 9_000, 14_000, null),
    line('Hal', 'Shen', 4, 6, 2, 190, 9_500, 16_000, null),
    line('Ivy', "Kai'Sa", 3, 3, 4, 250, 10_000, 20_000, null),
    line('Jo', 'Rell', 0, 2, 9, 25, 5_500, 6_000, null),
  ],
};

describe('stats maths (gol.gg style)', () => {
  it('reads mm:ss durations', () => {
    expect(minutesOf('31:24')).toBeCloseTo(31.4, 10);
    expect(minutesOf('31:75')).toBeNaN();
  });

  it('works out a player row by hand', () => {
    const { players, games } = aggregate([{ date: '2026-11-26', games: [game] }]);
    expect(games).toBe(1);
    const ann = players.find((p) => p.player === 'Ann')!;
    expect(ann).toMatchObject({ games: 1, wins: 1, losses: 0, winRate: 1 });
    expect(ann.kda).toBeCloseTo((5 + 7) / 2, 10);
    expect(ann.csm).toBeCloseTo(240 / 30, 10);
    expect(ann.gpm).toBeCloseTo(12_000 / 30, 10);
    expect(ann.kp).toBeCloseTo((5 + 7) / 20, 10);
    expect(ann.dmgShare).toBeCloseTo(30_000 / 100_000, 10);
    expect(ann.goldShare).toBeCloseTo(12_000 / 50_000, 10);
    expect(ann.dpm).toBeCloseTo(1_000, 10);
    expect(ann.vspm).toBeCloseTo(1, 10);
    expect(ann.champs).toEqual([['Ahri', 1]]);
  });

  it('shows unknowns as null rather than guessing', () => {
    const { players } = aggregate([{ date: '2026-11-26', games: [game] }]);
    const fi = players.find((p) => p.player === 'Fi')!;
    expect(fi.vspm).toBeNull();
    expect(fi.winRate).toBe(0);
    expect(fi.kda).toBeCloseTo((3 + 5) / 4, 10);
  });

  it('adds up across games and builds champion rows', () => {
    const second: StatGame = { ...game, game: 2, winner: 'red', duration: '20:00' };
    const { players, champs } = aggregate([{ date: '2026-11-26', games: [game, second] }]);
    const ann = players.find((p) => p.player === 'Ann')!;
    expect(ann).toMatchObject({ games: 2, wins: 1, losses: 1, winRate: 0.5 });
    expect(ann.csm).toBeCloseTo(480 / 50, 10);
    const ahri = champs.find((c) => c.champ === 'Ahri')!;
    expect(ahri).toMatchObject({ games: 2, wins: 1 });
    expect(ahri.players).toEqual([['Ann', 2]]);
  });

  it('validates the stats file and explains problems', () => {
    expect(validateStats({ nights: [{ date: '2026-11-26', games: [game] }] })).toEqual([]);
    const broken = { nights: [{ date: '26/11/2026', games: [{ ...game, duration: '30', winner: 'green', red: game.red.slice(0, 4) }] }] };
    const errs = validateStats(broken).join('\n');
    expect(errs).toMatch(/"date" must look like/);
    expect(errs).toMatch(/"duration" must look like/);
    expect(errs).toMatch(/"winner" must be/);
    expect(errs).toMatch(/red needs exactly 5 players/);
  });

  it('the shipped stats file is valid', () => {
    const data = JSON.parse(fs.readFileSync(new URL('../src/data/match-stats.json', import.meta.url), 'utf8'));
    expect(validateStats(data)).toEqual([]);
  });

  it("turns champion names into Data Dragon icon names", () => {
    expect(champKey('Master Yi')).toBe('MasterYi');
    expect(champKey("Kai'Sa")).toBe('Kaisa');
    expect(champKey("Rek'Sai")).toBe('RekSai');
    expect(champKey('Dr. Mundo')).toBe('DrMundo');
    expect(champKey('Wukong')).toBe('MonkeyKing');
    expect(champKey('Jarvan IV')).toBe('JarvanIV');
  });
});

describe('match history', () => {
  it('labels nights in British style', () => {
    expect(nightLabel('2026-11-26')).toBe('Thursday 26 November 2026');
  });

  it('groups a night\'s screenshots by game', () => {
    const files = [
      'assets/history/2026-11-26/game-1.png',
      'assets/history/2026-11-26/Game 2.jpg',
      'assets/history/2026-11-26/game-2-b.png',
      'assets/history/2026-11-26/game-10.png',
      'assets/history/2026-11-26/team-photo.jpg',
      'assets/history/2026-11-26/sub/game-3.png',
      'assets/history/2026-12-03/game-1.png',
    ];
    const s = shotsFor('2026-11-26', files);
    expect([...s.games.keys()].sort((a, b) => a - b)).toEqual([1, 2, 10]);
    expect(s.games.get(2)).toEqual(['assets/history/2026-11-26/Game 2.jpg', 'assets/history/2026-11-26/game-2-b.png']);
    expect(s.other).toEqual(['assets/history/2026-11-26/team-photo.jpg']);
  });
});

describe('turret damage and the role filter', () => {
  // Made-up numbers: Ann plays mid in game 1 and jungle in game 2.
  const withRoles = (g: StatGame, roles: string[], turrets: (number | null)[]): StatGame => ({
    ...g,
    blue: g.blue.map((l, i) => ({ ...l, role: roles[i] as StatLine['role'], turrets: turrets[i] })),
    red: g.red.map((l, i) => ({ ...l, role: (['top', 'jg', 'mid', 'adc', 'sp'] as const)[i] })),
  });
  const g1 = withRoles(game, ['mid', 'jg', 'top', 'adc', 'sp'], [3000, 1000, 5000, 4000, 0]);
  const g2 = withRoles({ ...game, game: 2, winner: 'red', duration: '20:00' }, ['jg', 'mid', 'top', 'adc', 'sp'], [6000, 2000, null, 1000, 500]);
  const night = [{ date: '2026-11-26', games: [g1, g2] }];

  it('averages turret damage over the games that recorded it', () => {
    const { players } = aggregate(night);
    expect(players.find((p) => p.player === 'Ann')!.turretDmg).toBeCloseTo((3000 + 6000) / 2, 10);
    expect(players.find((p) => p.player === 'Cy')!.turretDmg).toBeCloseTo(5000, 10);
    expect(players.find((p) => p.player === 'Fi')!.turretDmg).toBeNull();
  });

  it('keeps only the games each player spent in the chosen role', () => {
    const jungle = aggregate(night, 'jg');
    const ann = jungle.players.find((p) => p.player === 'Ann')!;
    expect(ann).toMatchObject({ games: 1, wins: 0, losses: 1, champs: [['Ahri', 1]] });
    expect(ann.turretDmg).toBeCloseTo(6000, 10);
    // KP% still compares with the whole team in that game.
    expect(ann.kp).toBeCloseTo((5 + 7) / 20, 10);
    expect(jungle.players.map((p) => p.player).sort()).toEqual(['Ann', 'Bo', 'Gu']);
    expect(jungle.champs.map((c) => c.champ).sort()).toEqual(['Ahri', 'Lee Sin', 'Udyr']);
    // All roles together still adds up to every game.
    expect(aggregate(night).players.find((p) => p.player === 'Ann')!.games).toBe(2);
  });

  it('rejects a bad turret number', () => {
    const bad = { nights: [{ date: '2026-11-26', games: [{ ...g1, blue: [{ ...g1.blue[0], turrets: -5 }, ...g1.blue.slice(1)] }] }] };
    expect(validateStats(bad).join(' ')).toMatch(/"turrets" must be a number or null/);
  });
});

describe('team objectives', () => {
  // Made-up numbers. Game 1: blue takes 3 drakes; game 2: blue takes 5 dragons, one of them Elder.
  const obj = (towers: number, barons: number, dragons: number, elders: number, heralds: number, grubs: number) => ({ towers, inhibitors: 0, barons, dragons, elders, heralds, grubs });
  const g1: StatGame = { ...game, objectives: { blue: obj(8, 1, 3, 0, 1, 3), red: obj(2, 0, 1, 0, 0, 0) } };
  const g2: StatGame = { ...game, game: 2, objectives: { blue: obj(9, 2, 5, 1, 0, 1), red: obj(3, 0, 0, 0, 1, 2) } };

  it("averages the player's team's objectives per game, Elder kept apart from drakes", () => {
    const { players } = aggregate([{ date: '2026-11-26', games: [g1, g2] }]);
    const bo = players.find((p) => p.player === 'Bo')!;
    expect(bo.drakesPg).toBeCloseTo((3 + 4) / 2, 10);
    expect(bo.eldersPg).toBeCloseTo(0.5, 10);
    expect(bo.baronsPg).toBeCloseTo(1.5, 10);
    expect(bo.heraldsPg).toBeCloseTo(0.5, 10);
    expect(bo.grubsPg).toBeCloseTo(2, 10);
    const gu = players.find((p) => p.player === 'Gu')!;
    expect(gu.grubsPg).toBeCloseTo(1, 10);
  });

  it('shows objectives as unknown for games without them', () => {
    const { players } = aggregate([{ date: '2026-11-26', games: [game] }]);
    expect(players[0].drakesPg).toBeNull();
  });

  it('rejects impossible objective numbers', () => {
    const bad = { nights: [{ date: '2026-11-26', games: [{ ...g1, objectives: { blue: obj(8, 1, 1, 2, 1, 3), red: { ...obj(2, 0, 1, 0, 0, 0), grubs: -1 } } }] }] };
    const msg = validateStats(bad).join(' ');
    expect(msg).toMatch(/more Elder dragons than dragons/);
    expect(msg).toMatch(/red objectives "grubs" must be a whole number/);
  });
});
