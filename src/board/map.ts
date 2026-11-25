/**
 * The drawn board: Summoner's Rift as a coach's tactics board on green felt.
 * An original drawing (no Riot artwork): three lanes, a river, trees, towers
 * and the two bases. Returns the inside of a 1000 × 1000 SVG.
 */

const LANE = 'M140 880V205Q140 140 205 140H880M120 860H795Q860 860 860 795V120M190 810L810 190';
const SEGS: [number, number, number, number][] = [
  [140, 880, 140, 140],
  [140, 140, 880, 140],
  [120, 860, 860, 860],
  [860, 860, 860, 120],
  [190, 810, 810, 190],
];

function distToSeg(x: number, y: number, [ax, ay, bx, by]: [number, number, number, number]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

const f = (n: number) => n.toFixed(1);

function buildMap(): string {
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const a: string[] = [];
  const b: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const c = 130 + 740 * t;
    const w = (52 + 12 * Math.sin(t * Math.PI * 4)) / Math.SQRT2;
    a.push(`${f(c + w)} ${f(c - w)}`);
    b.push(`${f(c - w)} ${f(c + w)}`);
  }
  const river = `M${a.join('L')}L${b.reverse().join('L')}Z`;

  const trees: [number, number, number][] = [];
  for (let k = 0; k < 1500 && trees.length < 120; k++) {
    const r = 13 + rnd() * 17;
    const x = 50 + rnd() * 900;
    const y = 50 + rnd() * 900;
    if (SEGS.some((s) => distToSeg(x, y, s) < 40 + r) || distToSeg(x, y, [130, 130, 870, 870]) < 62 + r) continue;
    if (Math.hypot(x - 105, y - 895) < 235 || Math.hypot(x - 895, y - 105) < 235) continue;
    if (trees.some((t) => Math.hypot(t[0] - x, t[1] - y) < (t[2] + r) * 0.82)) continue;
    trees.push([x, y, r]);
  }
  const tones = ['#1d5538', '#215f3e', '#194c33'];
  const treeSvg = trees
    .sort((p, q) => p[1] - q[1])
    .map(
      ([x, y, r]) =>
        `<ellipse cx="${f(x + r * 0.25)}" cy="${f(y + r * 0.55)}" rx="${f(r)}" ry="${f(r * 0.55)}" fill="#07160f" opacity=".45"/>` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${tones[Math.floor(rnd() * 3)]}"/>` +
        `<circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.32)}" r="${f(r * 0.5)}" fill="#3a8a5c" opacity=".5"/>`,
    )
    .join('');

  const hexPath = (x: number, y: number, r: number) =>
    'M' +
    [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const ang = (Math.PI / 3) * i + Math.PI / 6;
        return `${f(x + r * Math.cos(ang))} ${f(y + r * Math.sin(ang))}`;
      })
      .join('L') +
    'Z';
  const base = (x: number, y: number, side: string, dark: string, light: string) =>
    `<circle cx="${x}" cy="${y}" r="150" fill="url(#g-${side})"/>` +
    `<circle cx="${x}" cy="${y}" r="86" fill="${dark}" fill-opacity=".25" stroke="${light}" stroke-opacity=".6" stroke-width="3"/>` +
    `<path d="${hexPath(x, y, 34)}" fill="${dark}" stroke="${light}" stroke-width="4"/>`;
  const towers = [
    [140, 700],
    [180, 820],
    [300, 860],
    [420, 860],
  ];
  const tower = (x: number, y: number, c: string) =>
    `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" rx="4" fill="${c}" stroke="#eef1e6" stroke-width="3" transform="rotate(45 ${x} ${y})"/>`;

  return `<defs>
<radialGradient id="felt" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#1f5039"/><stop offset="1" stop-color="#153d2b"/></radialGradient>
<radialGradient id="g-blue"><stop offset="0" stop-color="#4a9af9" stop-opacity=".5"/><stop offset="1" stop-color="#4a9af9" stop-opacity="0"/></radialGradient>
<radialGradient id="g-red"><stop offset="0" stop-color="#ff5a5f" stop-opacity=".45"/><stop offset="1" stop-color="#ff5a5f" stop-opacity="0"/></radialGradient>
<linearGradient id="water" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d5670"/><stop offset=".5" stop-color="#2a6f8e"/><stop offset="1" stop-color="#1d5670"/></linearGradient></defs>
<rect width="1000" height="1000" rx="34" fill="#07150e"/>
<rect x="18" y="18" width="964" height="964" rx="22" fill="url(#felt)"/>
<path d="${river}" fill="url(#water)"/>
<path d="M160 160L840 840" stroke="#9fd3e6" stroke-opacity=".28" stroke-width="3" stroke-dasharray="36 28"/>
${treeSvg}
<path d="${LANE}" fill="none" stroke="#cdbf93" stroke-opacity=".36" stroke-width="62" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${LANE}" fill="none" stroke="#eef1e6" stroke-opacity=".42" stroke-width="3" stroke-dasharray="14 16"/>
${[
  [345, 345],
  [655, 655],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="40" fill="#163f52" stroke="#eef1e6" stroke-opacity=".4" stroke-width="3" stroke-dasharray="8 8"/>`)
  .join('')}
${towers.map(([x, y]) => tower(x, y, '#2c68c4')).join('')}${towers.map(([x, y]) => tower(y, x, '#c8363d')).join('')}
${base(105, 895, 'blue', '#2c68c4', '#cfe2ff')}${base(895, 105, 'red', '#c8363d', '#ffd3d4')}
<rect x="18" y="18" width="964" height="964" rx="22" fill="none" stroke="#eef1e6" stroke-opacity=".1" stroke-width="2"/>`;
}

export const MAP_SVG = buildMap();
