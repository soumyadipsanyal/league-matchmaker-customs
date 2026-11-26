import { describe, expect, it } from 'vitest';
import { createMatchmaker } from '../src/engine/matchmaker.ts';
import { lineupKey } from '../src/engine/lineup.ts';
import { makeRng, shuffleInPlace } from '../src/engine/rng.ts';
import { scheduleFromOrder, scheduleProblem, type Schedule } from '../src/engine/rotation.ts';
import { ROLES } from '../src/lib/roles.ts';
import { player, syntheticRoster, toMatch } from './helpers.ts';

/** Checks the sit-out rules directly, independently of scheduleProblem. */
function checkRules(n: number, schedule: Schedule) {
  const k = n - 10;
  const count = new Array(n).fill(0);
  schedule.forEach((out, g) => {
    expect(new Set(out).size, `game ${g + 1} sit-outs`).toBe(k);
    for (const p of out) {
      // Nobody sits out again while someone else hasn't sat out as often.
      const others = [...Array(n).keys()].filter((q) => !out.includes(q));
      for (const q of others) expect(count[p], `game ${g + 1}: ${p} sits again before ${q}`).toBeLessThanOrEqual(count[q]);
      // Sat out last game → plays this one.
      if (g > 0) expect(schedule[g - 1], `game ${g + 1}: ${p} sits out twice running`).not.toContain(p);
    }
    for (const p of out) count[p]++;
  });
  // Spread evenly: nobody has sat out more than once more than anyone else.
  expect(Math.max(...count) - Math.min(...count)).toBeLessThanOrEqual(1);
}

describe('sit-out rotation', () => {
  it('every priority order gives a schedule that keeps the rules (11 to 18 players, 1 to 3 games)', () => {
    const rng = makeRng(11);
    for (let n = 10; n <= 18; n++) {
      for (let games = 1; games <= 3; games++) {
        for (let t = 0; t < 40; t++) {
          const s = scheduleFromOrder(shuffleInPlace(rng, [...Array(n).keys()]), games);
          expect(scheduleProblem(n, s)).toBeNull();
          checkRules(n, s);
        }
      }
    }
  });

  it('with 18 players over 3 games, everyone sits out once before six sit out a second time', () => {
    const s = scheduleFromOrder([...Array(18).keys()], 3);
    const all = s.flat();
    expect(new Set([...s[0], ...s[1]]).size).toBe(16);
    expect(new Set(all).size).toBe(18);
    expect(all.length).toBe(24);
  });

  it('rejects schedules that break the rules', () => {
    expect(scheduleProblem(12, [[0, 1], [0, 2]])).toMatch(/two games in a row|sat out as often/);
    expect(scheduleProblem(12, [[0, 1], [2, 3], [0, 4]])).toMatch(/sat out as often/);
    expect(scheduleProblem(11, [[0, 1]])).toMatch(/expected 1/);
  });
});

describe('main roles first', () => {
  // Three mid mains who can also support, one support main, and two each of
  // top, jungle and ADC: exactly one mid main has to play support.
  const ten = [
    player('M1', 5, { mid: 0, sp: 1 }),
    player('M2', 5, { mid: 0, sp: 1 }),
    player('M3', 5, { mid: 0, sp: 1 }),
    player('S1', 5, { sp: 0 }),
    player('T1', 5, { top: 0 }),
    player('T2', 5, { top: 0 }),
    player('J1', 5, { jg: 0 }),
    player('J2', 5, { jg: 0 }),
    player('A1', 5, { adc: 0 }),
    player('A2', 5, { adc: 0 }),
  ];
  const offMain = (g: { blue: { name: string; role: string }[]; red: { name: string; role: string }[] }) =>
    [...g.blue, ...g.red].filter((p) => p.role === 'sp' && p.name.startsWith('M')).map((p) => p.name);

  it('gives the main role to whoever was off it last time', () => {
    const first = createMatchmaker()({ players: toMatch(ten), games: 1, mode: 'make' });
    const [x] = offMain(first.games[0]);
    expect(x).toBeDefined();
    expect(first.owed).toEqual([x]);
    const next = createMatchmaker()({ players: toMatch(ten), games: 1, mode: 'make', priority: [x] });
    const off = offMain(next.games[0]);
    expect(off).toHaveLength(1);
    expect(off[0]).not.toBe(x);
    expect(next.owed).toEqual(off);
  });

  it('never leaves the same player off their main role two games running', () => {
    const res = createMatchmaker()({ players: toMatch(ten), games: 3, mode: 'make' });
    const offs = res.games.map((g) => offMain(g));
    for (let g = 1; g < offs.length; g++) {
      expect(offs[g]).toHaveLength(1);
      expect(offs[g][0]).not.toBe(offs[g - 1][0]);
    }
    expect(res.owed).toEqual(offs[2]);
  });
});

describe('matchmaker', () => {
  const cases: [number, number][] = [
    [10, 3],
    [11, 3],
    [12, 2],
    [13, 3],
    [15, 3],
    [18, 3],
  ];
  it.each(cases)('%i players, %i games: valid lineups and the rotation rules', (n, games) => {
    const roster = syntheticRoster(n, n * 31);
    const res = createMatchmaker()({ players: toMatch(roster), games, mode: 'make', timeBudgetMs: 600 });
    expect(res.games).toHaveLength(games);
    const idx = new Map(roster.map((p, i) => [p.name, i]));
    for (const g of res.games) {
      const playing = [...g.blue, ...g.red].map((p) => p.name);
      expect(new Set(playing).size).toBe(10);
      expect(g.blue.map((p) => p.role)).toEqual([...ROLES]);
      expect(g.red.map((p) => p.role)).toEqual([...ROLES]);
      expect(g.out.filter((o) => playing.includes(o))).toEqual([]);
      expect(playing.length + g.out.length).toBe(n);
    }
    const schedule = res.games.map((g) => g.out.map((o) => idx.get(o)!).sort((a, b) => a - b));
    expect(scheduleProblem(n, schedule)).toBeNull();
    checkRules(n, schedule);
  });

  it('makes 18 players × 3 games in well under 2 seconds', () => {
    const t0 = performance.now();
    createMatchmaker()({ players: toMatch(syntheticRoster(18, 5)), games: 3, mode: 'make' });
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('shuffles to a different lineup, each game within 0.5 of the best for its ten', () => {
    const run = createMatchmaker();
    const players = toMatch(syntheticRoster(12, 9));
    const made = run({ players, games: 2, mode: 'make' });
    const before = made.games.map(lineupKey);
    for (const seed of [1, 2, 3, 99, 1234]) {
      const res = run({ players, games: 2, mode: 'shuffle', seed, avoid: before });
      expect(res.changed).toBe(true);
      expect(res.games.map(lineupKey)).not.toEqual(before);
      // Each game's lineup is within 0.5 of the best for that game's ten.
      for (const g of res.games) expect(g.score).toBeLessThanOrEqual(g.best + 0.5 + 1e-9);
    }
  });

  it('says so when nothing else is close enough to shuffle to', () => {
    const run = createMatchmaker();
    const players = toMatch(syntheticRoster(10, 4));
    const made = run({ players, games: 1, mode: 'make' });
    const res = run({ players, games: 1, mode: 'shuffle', seed: 5, avoid: made.games.map(lineupKey), tolerance: 1e-6 });
    expect(res.changed).toBe(false);
  });
});
