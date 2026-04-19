import { apiFetchJson } from "../lib/apiFetch";
import type { Aggregation, AggregationResult, CreateAggregationPayload, PaginatedResponse } from "./types";

const BASE = "/api/aggregations";

export const fetchAggregations = (siftId?: string, limit = 100, offset = 0): Promise<PaginatedResponse<Aggregation>> => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (siftId) params.set("sift_id", siftId);
  return apiFetchJson<PaginatedResponse<Aggregation>>(`${BASE}?${params}`);
};

export const fetchAggregation = (id: string): Promise<Aggregation> =>
  apiFetchJson<Aggregation>(`${BASE}/${id}`);

export const createAggregation = (payload: CreateAggregationPayload): Promise<Aggregation> =>
  apiFetchJson<Aggregation>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const fetchAggregationResult = (id: string): Promise<AggregationResult> =>
  apiFetchJson<AggregationResult>(`${BASE}/${id}/result`);

export const regenerateAggregation = (id: string): Promise<Aggregation> =>
  apiFetchJson<Aggregation>(`${BASE}/${id}/regenerate`, { method: "POST" });

export const deleteAggregation = (id: string): Promise<void> =>
  apiFetchJson<void>(`${BASE}/${id}`, { method: "DELETE" });
