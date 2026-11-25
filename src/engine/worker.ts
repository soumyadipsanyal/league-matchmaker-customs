/// Runs the matchmaker off the main thread so the page stays responsive.
import { createMatchmaker, type MatchRequest, type MatchResult } from './matchmaker.ts';

export type WorkerIn = { id: number; req: MatchRequest };
export type WorkerOut = { id: number; ok: true; res: MatchResult } | { id: number; ok: false; error: string };

const run = createMatchmaker();
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
  postMessage: (m: WorkerOut) => void;
};

scope.onmessage = (e) => {
  const { id, req } = e.data;
  try {
    scope.postMessage({ id, ok: true, res: run(req) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
