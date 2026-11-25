/**
 * Password lock for the private half of the roster.
 *
 * AES-GCM (256-bit) with a key derived from the password by PBKDF2-SHA-256.
 * Uses only the Web Crypto API, so the same code runs in the browser (to
 * unlock) and in Node (npm run encrypt-roster, tests).
 */

export interface LockBox {
  alg: 'AES-GCM';
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  /** Base64. */
  salt: string;
  /** Base64. */
  iv: string;
  /** Base64 ciphertext, including the GCM tag. */
  data: string;
}

/** OWASP's current figure for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password');
    this.name = 'WrongPasswordError';
  }
}

export class CryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto is not available here. Open the site over https (or on localhost) to unlock it.');
    this.name = 'CryptoUnavailableError';
  }
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new CryptoUnavailableError();
  return s;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const s = subtle();
  const base = await s.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(value: unknown, password: string, iterations = PBKDF2_ITERATIONS): Promise<LockBox> {
  if (!password) throw new Error('The password cannot be empty.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  return { alg: 'AES-GCM', kdf: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(ct) };
}

/** Decrypts a LockBox. Throws WrongPasswordError if the password is wrong. */
export async function decryptJson<T>(box: LockBox, password: string): Promise<T> {
  const key = await deriveKey(password, fromBase64(box.salt), box.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(box.iv) }, key, fromBase64(box.data));
  } catch {
    // GCM authentication fails when the key is wrong.
    throw new WrongPasswordError();
  }
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
