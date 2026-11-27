/**
 * Gold, silver and bronze stars for the top three in a stats column.
 *
 * Ties share a star, judged on the number as it's shown (two KDAs that both
 * show as 3.3 tie), and the next star is skipped, as in sport: two golds,
 * then bronze. A zero never earns a star (nobody "leads" with no first
 * bloods), except where lower is better.
 */
export type Medal = 1 | 2 | 3;

export interface MedalEntry {
  name: string;
  value: number | null;
  /** The value as shown in the table, used to decide ties. */
  shown: string;
}

export function medals(entries: MedalEntry[], opts: { lowerBetter?: boolean; goldOnly?: boolean } = {}): Map<string, Medal> {
  const { lowerBetter = false, goldOnly = false } = opts;
  const ranked = entries
    .filter((e): e is MedalEntry & { value: number } => typeof e.value === 'number' && Number.isFinite(e.value) && (lowerBetter || e.value > 0))
    .sort((a, b) => (lowerBetter ? a.value - b.value : b.value - a.value));
  const out = new Map<string, Medal>();
  let rank = 0;
  ranked.forEach((e, i) => {
    if (i === 0 || e.shown !== ranked[i - 1].shown) rank = i + 1;
    if (rank <= (goldOnly ? 1 : 3)) out.set(e.name, rank as Medal);
  });
  return out;
}
