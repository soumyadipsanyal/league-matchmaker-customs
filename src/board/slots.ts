import type { Role } from '../lib/roles.ts';

export type Side = 'blue' | 'red';
type Spot = { x: number; y: number; label: 'a' | 'b' | 'l' | 'r'; badge: 'tr' | 'tl' | 'br' | 'bl' };
type Layout = { slots: Record<Side, Record<Role, Spot>>; home: Record<Side, { x: number; y: number }> };

/**
 * Where each magnet stands on the board, as a percentage of the board's width
 * (x, from the left) and height (y, from the top). Blue's base is bottom left,
 * red's top right.
 *
 *   label: which side of the magnet the name goes: b(elow), a(bove), l(eft), r(ight)
 *   badge: which corner the champion badge sits in: tr, tl, br, bl
 *   home:  where the magnets slide out from
 *
 * `image` is used when public/assets/map/summoners-rift.png is there, and is
 * lined up with Riot's Data Dragon minimap (map11.png), whose outer lanes run
 * about 8% in from each edge. `drawn` is for the built-in drawn board. Nudge
 * `image` if you swap in a different map picture.
 */
export const BOARD = {
  image: {
    slots: {
      blue: {
        top: { x: 9, y: 32, label: 'b', badge: 'tr' },
        jg: { x: 23, y: 63, label: 'b', badge: 'tr' },
        mid: { x: 44, y: 56, label: 'b', badge: 'tr' },
        adc: { x: 53, y: 91, label: 'a', badge: 'tr' },
        sp: { x: 70, y: 91, label: 'a', badge: 'tr' },
      },
      red: {
        top: { x: 32, y: 9, label: 'r', badge: 'bl' },
        jg: { x: 63, y: 23, label: 'r', badge: 'tl' },
        mid: { x: 56, y: 44, label: 'r', badge: 'tl' },
        adc: { x: 91, y: 53, label: 'l', badge: 'tl' },
        sp: { x: 91, y: 70, label: 'l', badge: 'tl' },
      },
    },
    home: {
      blue: { x: 11, y: 89 },
      red: { x: 89, y: 11 },
    },
  },
  drawn: {
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
    home: {
      blue: { x: 9, y: 91 },
      red: { x: 91, y: 9 },
    },
  },
} as const satisfies Record<'image' | 'drawn', Layout>;
