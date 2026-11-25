export const ROLES = ['top', 'jg', 'mid', 'adc', 'sp'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAME: Record<Role, string> = {
  top: 'Top',
  jg: 'Jungle',
  mid: 'Mid',
  adc: 'ADC',
  sp: 'Support',
};

export const ROLE_SHORT: Record<Role, string> = {
  top: 'Top',
  jg: 'Jg',
  mid: 'Mid',
  adc: 'ADC',
  sp: 'Sup',
};

/** File name (without .png) of each role icon in public/assets/roles. */
export const ROLE_FILE: Record<Role, string> = {
  top: 'top',
  jg: 'jungle',
  mid: 'mid',
  adc: 'adc',
  sp: 'support',
};

export const isRole = (x: unknown): x is Role => typeof x === 'string' && (ROLES as readonly string[]).includes(x);
