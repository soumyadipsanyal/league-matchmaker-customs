import type { MatchRequest, MatchResult } from './matchmaker.ts';
import type { WorkerIn, WorkerOut } from './worker.ts';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: MatchResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.res);
    else p.reject(new Error(m.error));
  };
  worker.onerror = (e) => {
    e.preventDefault();
    const err = new Error(e.message || 'The team maker stopped unexpectedly.');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Runs the matchmaker in a Web Worker (or on the page if workers aren't available). */
export async function runMatch(req: MatchRequest): Promise<MatchResult> {
  const w = getWorker();
  if (!w) {
    const { createMatchmaker } = await import('./matchmaker.ts');
    return createMatchmaker()(req);
  }
  const id = nextId++;
  return new Promise<MatchResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const msg: WorkerIn = { id, req };
    w.postMessage(msg);
  });
}
