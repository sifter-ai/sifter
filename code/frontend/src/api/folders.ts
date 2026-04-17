import { apiFetch, apiFetchJson } from "../lib/apiFetch";
import {
  Document,
  DocumentSiftStatus,
  Folder,
  FolderExtractor,
  PaginatedResponse,
} from "./types";

// ---- Folders ----

export async function fetchFolders(): Promise<Folder[]> {
  return apiFetchJson<PaginatedResponse<Folder>>("/api/folders?limit=1000").then((r) => r.items);
}

export async function fetchFolder(folderId: string): Promise<Folder & { extractors: FolderExtractor[]; inherited_extractors: (FolderExtractor & { folder_id: string })[] }> {
  return apiFetchJson(`/api/folders/${folderId}`);
}

export async function createFolder(
  name: string,
  description?: string,
  parentId?: string | null
): Promise<Folder> {
  return apiFetchJson<Folder>("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description ?? "", parent_id: parentId ?? null }),
  });
}

export async function fetchFolderPath(folderId: string): Promise<Folder[]> {
  return apiFetchJson<Folder[]>(`/api/folders/${folderId}/path`);
}

export async function updateFolder(
  folderId: string,
  payload: { name?: string; description?: string }
): Promise<Folder> {
  return apiFetchJson<Folder>(`/api/folders/${folderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteFolder(folderId: string): Promise<void> {
  await apiFetch(`/api/folders/${folderId}`, { method: "DELETE" });
}

// ---- Folder-Sift Links ----

export async function fetchFolderExtractors(folderId: string): Promise<FolderExtractor[]> {
  return apiFetchJson<FolderExtractor[]>(`/api/folders/${folderId}/extractors`);
}

export async function linkExtractor(folderId: string, siftId: string): Promise<FolderExtractor> {
  return apiFetchJson<FolderExtractor>(`/api/folders/${folderId}/extractors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sift_id: siftId }),
  });
}

export async function unlinkExtractor(folderId: string, siftId: string): Promise<void> {
  await apiFetch(`/api/folders/${folderId}/extractors/${siftId}`, {
    method: "DELETE",
  });
}

// ---- Documents ----

export interface DocumentWithStatuses {
  id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  sift_statuses: DocumentSiftStatus[];
}

export async function fetchFolderDocuments(
  folderId: string
): Promise<DocumentWithStatuses[]> {
  return apiFetchJson<PaginatedResponse<DocumentWithStatuses>>(`/api/folders/${folderId}/documents?limit=1000`).then((r) => r.items);
}

export async function uploadDocument(
  folderId: string,
  file: File
): Promise<{ id: string; filename: string; enqueued_for: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch(`/api/folders/${folderId}/documents`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchDocument(
  documentId: string
): Promise<Document & { sift_statuses: DocumentSiftStatus[] }> {
  return apiFetchJson(`/api/documents/${documentId}`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiFetch(`/api/documents/${documentId}`, { method: "DELETE" });
}

export async function reprocessDocument(
  documentId: string,
  siftId?: string
): Promise<{ document_id: string; enqueued_for: string[] }> {
  return apiFetchJson(`/api/documents/${documentId}/reprocess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sift_id: siftId }),
  });
}

export async function downloadDocument(documentId: string, filename: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/download`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchDocumentBlob(documentId: string): Promise<{ url: string; contentType: string }> {
  const res = await apiFetch(`/api/documents/${documentId}/download`);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), contentType: blob.type };
}
