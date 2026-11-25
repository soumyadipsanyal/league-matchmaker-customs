import type { Role } from '../lib/roles.ts';

export interface Placement {
  name: string;
  role: Role;
  champ: string | null;
}

/** Same teams and roles, either side: "top:Envy jg:Darky(Udyr) … v …". */
export function lineupKey(g: { blue: Placement[]; red: Placement[] }): string {
  const side = (s: Placement[]) => s.map((p) => `${p.role}:${p.name}${p.champ ? `(${p.champ})` : ''}`).join(' ');
  return [side(g.blue), side(g.red)].sort().join(' v ');
}
