import {
  foldResponseSchema,
  metaResponseSchema,
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
    throw new ApiError(body.detail ?? response.statusText, response.status);
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
