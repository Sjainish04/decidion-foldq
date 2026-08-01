import { ApiError } from "@/lib/api/client";
import {
  structureSchema,
  structureSearchSchema,
  type Structure,
  type StructureSearchResponse,
} from "./schemas";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

async function request<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.detail ?? response.statusText, response.status);
  }
  return schema.parse(body);
}

export function searchStructures(params: {
  text?: string;
  maxResolution?: number;
  limit?: number;
}): Promise<StructureSearchResponse> {
  const query = new URLSearchParams({
    text: params.text ?? "",
    max_resolution: String(params.maxResolution ?? 3.0),
    limit: String(params.limit ?? 25),
  });
  return request(`/api/v1/structures/search?${query}`, structureSearchSchema);
}

export function fetchStructure(pdbId: string): Promise<Structure> {
  return request(`/api/v1/structures/${pdbId}`, structureSchema);
}
