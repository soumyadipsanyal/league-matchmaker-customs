/**
 * Light scrambling for the copy of the ratings that team-making uses, so
 * anyone can make teams without the password.
 *
 * This is NOT encryption: the key ships right next to the data, so anyone
 * who reads the site's code can undo it. It only keeps the numbers from being
 * readable at a glance or by searching the site's files. Unlock (the password)
 * controls whether the app shows them.
 *
 * Plain JavaScript (no Web Crypto), so it also works on plain-http pages.
 */
import { fromBase64, toBase64 } from './lock.ts';

export interface ScrambledBox {
  alg: 'xorshift128';
  /** Base64, 16 bytes. */
  key: string;
  /** Base64. */
  data: string;
}

function keystream(key: Uint8Array): () => number {
  const v = new DataView(key.buffer, key.byteOffset, 16);
  let x = v.getUint32(0) || 1;
  let y = v.getUint32(4) || 2;
  let z = v.getUint32(8) || 3;
  let w = v.getUint32(12) || 4;
  return () => {
    const t = x ^ (x << 11);
    x = y;
    y = z;
    z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return w & 255;
  };
}

function xorBytes(bytes: Uint8Array, key: Uint8Array): Uint8Array {
  const next = keystream(key);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ next();
  return out;
}

export function scrambleJson(value: unknown, key: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): ScrambledBox {
  const plain = new TextEncoder().encode(JSON.stringify(value));
  return { alg: 'xorshift128', key: toBase64(key), data: toBase64(xorBytes(plain, key)) };
}

export function unscrambleJson<T>(box: ScrambledBox): T {
  const plain = xorBytes(fromBase64(box.data), fromBase64(box.key));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
