import { useSyncExternalStore } from "react";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";

/** A run held in this browser session, or `null` if there is none, or `undefined`
 *  while we do not yet know — which is the state the server is always in. */
export type CachedRun = FoldResponse | null | undefined;

const KEY = (runId: string) => `foldq:run:${runId}`;

/** Parsed runs, memoised by id.
 *
 *  `getSnapshot` must return a stable reference or React re-renders forever, and
 *  parsing the JSON afresh would hand back a new object every call. A run id is a
 *  content hash of its inputs, so the value behind an id never changes and caching
 *  it is sound. A miss is not cached: `null` is a primitive, so returning it
 *  repeatedly is stable, and a later navigation can still find a run that has been
 *  written since. */
const parsed = new Map<string, FoldResponse>();

function readRun(runId: string): FoldResponse | null {
  // Storage is consulted on every call, before the memo. The memo exists only to
  // keep the returned reference stable for React, not to avoid the lookup — if it
  // short-circuited it would keep serving a run after the entry was removed, which
  // is a cache outliving its source rather than caching it.
  const raw = sessionStorage.getItem(KEY(runId));
  if (!raw) {
    parsed.delete(runId);
    return null;
  }
  const hit = parsed.get(runId);
  if (hit) return hit;
  const result = foldResponseSchema.safeParse(JSON.parse(raw));
  if (!result.success) return null;
  parsed.set(runId, result.data);
  return result.data;
}

const subscribe = () => () => {};

/** Reads a run from session storage without a hydration mismatch.
 *
 *  sessionStorage does not exist on the server, so reading it during render made
 *  every server render report a miss — the report page committed to its "not in
 *  this browser session" branch and the client never reliably replaced it. Reading
 *  it in an effect fixed that but sets state on mount, which is what
 *  react-hooks/set-state-in-effect exists to discourage.
 *
 *  useSyncExternalStore is the primitive for this: it takes an explicit server
 *  snapshot, so the server and the first client render agree on `undefined`
 *  ("not looked yet") and React swaps in the real value itself. The caller can
 *  then distinguish "still looking" from "looked and found nothing", and only the
 *  second should ever show a miss.
 */
export function useCachedRun(runId: string): CachedRun {
  return useSyncExternalStore<CachedRun>(
    subscribe,
    () => readRun(runId),
    () => undefined,
  );
}
