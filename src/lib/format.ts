/** Up to two decimals, trailing zeros dropped: 8.5, 4.95, 10, 4.68. */
export function fmt(n: number): string {
  return String(Math.round(n * 100 + 1e-9) / 100);
}

/** One decimal for tight spots like the board magnets: 8.5, 5.0, 10. */
export function fmt1(n: number): string {
  const r = Math.round(n * 10 + 1e-9) / 10;
  return r >= 10 ? String(r) : r.toFixed(1);
}

/** "Alif", "Alif and Siv", "Alif, Siv and Ere". */
export function andList(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function stepsText(steps: number): string {
  if (steps === 0) return 'main role';
  return `${plural(steps, 'step')} off main`;
}
