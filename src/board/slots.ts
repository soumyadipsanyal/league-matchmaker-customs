import type { Role } from '../lib/roles.ts';

export type Side = 'blue' | 'red';

/**
 * Where each magnet stands on the board, as a percentage of the board's width
 * (x, from the left) and height (y, from the top). Blue's base is bottom left,
 * red's top right.
 *
 * Nudge these if you add your own map image (public/assets/map/summoners-rift.png)
 * and the magnets don't sit on its lanes.
 *
 *   label: which side of the magnet the name goes: b(elow), a(bove), l(eft), r(ight)
 *   badge: which corner the champion badge sits in: tr, tl, br, bl
 */
export const BOARD = {
  slots: {
    blue: {
      top: { x: 14, y: 32, label: 'b', badge: 'tr' },
      jg: { x: 23, y: 63, label: 'b', badge: 'tr' },
      mid: { x: 44, y: 56, label: 'b', badge: 'tr' },
      adc: { x: 53, y: 86, label: 'a', badge: 'br' },
      sp: { x: 70, y: 86, label: 'b', badge: 'tr' },
    },
    red: {
      top: { x: 32, y: 14, label: 'r', badge: 'tl' },
      jg: { x: 63, y: 23, label: 'r', badge: 'tl' },
      mid: { x: 56, y: 44, label: 'r', badge: 'tl' },
      adc: { x: 86, y: 53, label: 'l', badge: 'tr' },
      sp: { x: 86, y: 70, label: 'b', badge: 'tr' },
    },
  },
  /** Where magnets start from (each team's base). */
  home: {
    blue: { x: 9, y: 91 },
    red: { x: 91, y: 9 },
  },
} as const satisfies {
  slots: Record<Side, Record<Role, { x: number; y: number; label: 'a' | 'b' | 'l' | 'r'; badge: 'tr' | 'tl' | 'br' | 'bl' }>>;
  home: Record<Side, { x: number; y: number }>;
};
