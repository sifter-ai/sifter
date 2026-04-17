export interface SifterOptions {
  apiUrl?: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}

export interface SiftData {
  id: string;
  name: string;
  description: string;
  instructions: string;
  schema: string | null;
  schema_version: number;
  schema_fields: SchemaField[] | null;
  status: "active" | "indexing" | "paused" | "error";
  error: string | null;
  processed_documents: number;
  total_documents: number;
  default_folder_id: string | null;
  multi_record: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchemaField {
  name: string;
  type: string;
  nullable: boolean;
  format?: string;
}

export interface FolderData {
  id: string;
  name: string;
  description: string;
  document_count: number;
  parent_id: string | null;
  path: string | null;
  created_at: string;
}

export interface SiftRecord {
  id: string;
  sift_id: string;
  document_id: string;
  filename: string;
  document_type: string;
  confidence: number;
  extracted_data: Record<string, unknown>;
  citations?: Record<string, Citation> | null;
  record_index: number;
  created_at: string;
}

export interface Citation {
  document_id: string;
  page: number;
  bbox: [number, number, number, number];
  source_text: string;
  inferred?: boolean;
}

export interface SiftPage<T = SiftRecord> {
  records: T[];
  next_cursor: string | null;
}

export interface SchemaResponse {
  schema_text: string | null;
  schema_fields: SchemaField[] | null;
  schema_version: number;
}

export interface PageInfo {
  page: number;
  width: number;
  height: number;
  thumbnail_url: string;
}

export type SortSpec = [string, 1 | -1][];
export type FilterDict = Record<string, unknown>;

export type { SiftRecord as Record };
