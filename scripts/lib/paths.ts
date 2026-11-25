import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PRIVATE_ROSTER = path.join(ROOT, 'roster.private.json');
export const LOCKED_ROSTER = path.join(ROOT, 'src', 'data', 'roster.locked.json');
export const DIST = path.join(ROOT, 'dist');

export const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');
