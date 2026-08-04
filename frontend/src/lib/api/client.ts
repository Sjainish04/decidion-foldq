import {
  diagramJobSchema,
  diagramResultSchema,
  foldResponseSchema,
  metaResponseSchema,
  type DiagramJob,
  type DiagramResult,
  type FoldResponse,
  type MetaResponse,
} from "./schemas";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export interface FoldRequest {
  sequence: string;
  solver: string;
  seed?: number;
  pseudoknots?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Stable identifier from the API, e.g. SEQUENCE_TOO_LONG_FOR_SOLVER.
     *  Undefined for framework-level validation errors, which are raised before
     *  the typed handler runs. */
    readonly code?: string,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The API returns a typed body: { error: { code, message, details, trace_id } }.
    // `detail` is still read as a fallback because FastAPI raises its own
    // validation errors in that shape before any handler runs.
    const typed = body?.error;
    throw new ApiError(
      typed?.message ?? body?.detail ?? response.statusText,
      response.status,
      typed?.code,
      typed?.trace_id,
    );
  }
  return schema.parse(body);
}

export function foldSequence(payload: FoldRequest): Promise<FoldResponse> {
  return request("/api/v1/fold", foldResponseSchema, {
    method: "POST",
    body: JSON.stringify({ seed: 42, pseudoknots: false, ...payload }),
  });
}

export function fetchMeta(): Promise<MetaResponse> {
  return request("/api/v1/meta", metaResponseSchema);
}

/** Start an R2DT job. Returns its id; the diagram is not ready yet. */
export function submitDiagram(sequence: string): Promise<DiagramJob> {
  return request("/api/v1/diagrams/r2dt", diagramJobSchema, {
    method: "POST",
    body: JSON.stringify({ sequence }),
  });
}

export function fetchDiagram(jobId: string): Promise<DiagramResult> {
  return request(`/api/v1/diagrams/r2dt/${encodeURIComponent(jobId)}`, diagramResultSchema);
}

/** Submit and poll until R2DT finishes, or give up.
 *
 *  Polling rather than one long request: an R2DT job takes tens of seconds, and
 *  a request held open that long would hit the serverless function's budget and
 *  leave the user with an unexplained spinner. `onState` lets the UI report
 *  which stage it is in instead.
 */
export async function requestDiagram(
  sequence: string,
  {
    signal,
    onState,
    intervalMs = 3000,
    timeoutMs = 180_000,
  }: {
    signal?: AbortSignal;
    onState?: (state: string) => void;
    intervalMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<DiagramResult> {
  const { job_id } = await submitDiagram(sequence);
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const result = await fetchDiagram(job_id);
    onState?.(result.state);
    if (result.state === "FINISHED" && result.svg) return result;
    if (Date.now() > deadline) {
      throw new ApiError(`R2DT did not finish within ${Math.round(timeoutMs / 1000)}s`, 504);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
