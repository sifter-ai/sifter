import { apiFetch, apiFetchJson } from "../lib/apiFetch";
import type {
  ChatResponse,
  CreateSiftPayload,
  PaginatedResponse,
  Sift,
  SiftDocument,
  SiftRecord,
  QueryResult,
} from "./types";

const BASE = "/api/sifts";

export const fetchSifts = (limit = 50, offset = 0): Promise<PaginatedResponse<Sift>> =>
  apiFetchJson<PaginatedResponse<Sift>>(`${BASE}?limit=${limit}&offset=${offset}`);

export const fetchSift = (id: string): Promise<Sift> =>
  apiFetchJson<Sift>(`${BASE}/${id}`);

export const createSift = (payload: CreateSiftPayload): Promise<Sift> =>
  apiFetchJson<Sift>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const updateSift = (
  id: string,
  payload: { name?: string; instructions?: string; description?: string; schema?: string; multi_record?: boolean }
): Promise<Sift> =>
  apiFetchJson<Sift>(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteSift = (id: string): Promise<void> =>
  apiFetchJson<void>(`${BASE}/${id}`, { method: "DELETE" });

export const fetchSiftFolders = (id: string): Promise<PaginatedResponse<{ id: string; name: string; path: string | null }>> =>
  apiFetchJson<PaginatedResponse<{ id: string; name: string; path: string | null }>>(`${BASE}/${id}/folders`);

export const uploadDocuments = (id: string, formData: FormData): Promise<unknown> =>
  apiFetchJson<unknown>(`${BASE}/${id}/upload`, { method: "POST", body: formData });

export const reindexSift = (id: string): Promise<unknown> =>
  apiFetchJson<unknown>(`${BASE}/${id}/reindex`, { method: "POST" });

export const resetSift = (id: string): Promise<Sift> =>
  apiFetchJson<Sift>(`${BASE}/${id}/reset`, { method: "POST" });

export const fetchSiftRecords = (id: string, limit = 50, offset = 0): Promise<PaginatedResponse<SiftRecord>> =>
  apiFetchJson<PaginatedResponse<SiftRecord>>(`${BASE}/${id}/records?limit=${limit}&offset=${offset}`);

export const fetchSiftDocuments = (id: string, limit = 50, offset = 0): Promise<PaginatedResponse<SiftDocument>> =>
  apiFetchJson<PaginatedResponse<SiftDocument>>(`${BASE}/${id}/documents?limit=${limit}&offset=${offset}`);

export const exportSiftCsv = async (id: string, name: string): Promise<void> => {
  const res = await apiFetch(`${BASE}/${id}/records/csv`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const querySift = (id: string, query: string): Promise<QueryResult> =>
  apiFetchJson<QueryResult>(`${BASE}/${id}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

export const chatWithSift = (
  id: string,
  message: string,
  history: Array<{ role: string; content: string }>
): Promise<ChatResponse> =>
  apiFetchJson<ChatResponse>(`${BASE}/${id}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

// Legacy aliases for backward compat within this file
export const fetchExtractions = fetchSifts;
export const fetchExtraction = fetchSift;
export const createExtraction = createSift;
export const updateExtraction = updateSift;
export const deleteExtraction = deleteSift;
export const reindexExtraction = reindexSift;
export const resetExtraction = resetSift;
export const fetchExtractionRecords = fetchSiftRecords;
export const exportExtractionCsv = exportSiftCsv;
export const queryExtraction = querySift;
export const chatWithExtraction = chatWithSift;
