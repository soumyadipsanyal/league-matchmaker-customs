import { describe, expect, it } from 'vitest';
import { medals, type MedalEntry } from '../src/lib/medals.ts';

// Made-up values, shown to one decimal place like the table.
const e = (name: string, value: number | null): MedalEntry => ({ name, value, shown: value === null ? '–' : value.toFixed(1) });
const asObject = (m: Map<string, number>) => Object.fromEntries(m);

describe('top-three stars', () => {
  it('gives gold, silver and bronze to the top three', () => {
    expect(asObject(medals([e('Ann', 3), e('Bo', 5), e('Cy', 4), e('Di', 1), e('Ed', 2)]))).toEqual({ Bo: 1, Cy: 2, Ann: 3 });
  });

  it('shares a star between ties, judged on the shown value, and skips the next one', () => {
    // 4.04 and 4.01 both show as 4.0, so they tie for gold; the next is bronze.
    expect(asObject(medals([e('Ann', 4.04), e('Bo', 4.01), e('Cy', 3), e('Di', 2)]))).toEqual({ Ann: 1, Bo: 1, Cy: 3 });
  });

  it('never gives a star for zero or a missing value', () => {
    expect(asObject(medals([e('Ann', 2), e('Bo', 0), e('Cy', 0), e('Di', null)]))).toEqual({ Ann: 1 });
  });

  it('can rank lowest first, where zero is the best', () => {
    expect(asObject(medals([e('Ann', 5), e('Bo', 0), e('Cy', 2), e('Di', 7)], { lowerBetter: true }))).toEqual({ Bo: 1, Cy: 2, Ann: 3 });
  });

  it('gives only gold, to everyone tied on the most, when asked', () => {
    expect(asObject(medals([e('Ann', 1), e('Bo', 1), e('Cy', 1), e('Di', 0)], { goldOnly: true }))).toEqual({ Ann: 1, Bo: 1, Cy: 1 });
  });
});
