import { apiFetchJson } from "../lib/apiFetch";
import type { Aggregation, AggregationResult, CreateAggregationPayload, PaginatedResponse } from "./types";

const BASE = "/api/aggregations";

export const fetchAggregations = (siftId?: string): Promise<Aggregation[]> => {
  const url = siftId ? `${BASE}?sift_id=${siftId}&limit=1000` : `${BASE}?limit=1000`;
  return apiFetchJson<PaginatedResponse<Aggregation>>(url).then((r) => r.items);
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
