// ---- Pagination ----

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next_cursor?: string | null;
}

// ---- Auth ----

export interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  auth_provider: "email" | "google";
  avatar_url: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrganizationMember {
  user_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
}

export interface APIKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

// ---- Sifts ----

export type SiftStatus = "active" | "indexing" | "paused" | "error";

export interface Sift {
  id: string;
  name: string;
  description: string;
  instructions: string;
  schema: string | null;
  status: SiftStatus;
  error: string | null;
  processed_documents: number;
  total_documents: number;
  default_folder_id: string | null;
  multi_record: boolean;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  document_id: string;
  source_text: string;
  page?: number;
  confidence?: number;
  inferred?: boolean;
}

export interface SiftRecord {
  id: string;
  document_id: string;
  filename: string;
  document_type: string;
  confidence: number;
  extracted_data: Record<string, unknown>;
  citations?: Record<string, Citation>;
  record_index: number;
  created_at: string;
}

// Legacy alias
export type ExtractionRecord = SiftRecord;

export interface CreateSiftPayload {
  name: string;
  description?: string;
  instructions: string;
  schema?: string;
  multi_record?: boolean;
}

// ---- Aggregations ----

export type AggregationStatus = "generating" | "ready" | "active" | "error";

export interface Aggregation {
  id: string;
  name: string;
  description: string;
  sift_id: string;
  aggregation_query: string;
  pipeline: Record<string, unknown>[] | null;
  aggregation_error: string | null;
  status: AggregationStatus;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueryResult {
  results: Record<string, unknown>[];
  pipeline: Record<string, unknown>[];
}

export interface AggregationResult {
  results: Record<string, unknown>[];
  pipeline: Record<string, unknown>[];
  ran_at: string;
}

export interface CreateAggregationPayload {
  name: string;
  description?: string;
  sift_id: string;
  aggregation_query: string;
}

// ---- Chat ----

export interface ToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  result_preview: string;
  duration_ms: number;
}

export interface ChatResponse {
  response: string;
  data: Record<string, unknown>[] | null;
  query: string | null;
  pipeline: Record<string, unknown>[] | null;
  trace?: ToolCallTrace[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>[] | null;
  pipeline?: Record<string, unknown>[] | null;
  trace?: ToolCallTrace[];
}

// ---- Folders & Documents ----

export interface Folder {
  id: string;
  name: string;
  description: string;
  document_count: number;
  parent_id: string | null;
  path: string | null;
  created_at: string;
}

export interface FolderExtractor {
  id: string;
  folder_id?: string;
  sift_id: string;
  created_at: string;
}

export interface Document {
  id: string;
  folder_id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  storage_path?: string;
  connector_source?: string | null;
}

export interface DocumentSiftStatus {
  id?: string;
  sift_id: string;
  status: "pending" | "processing" | "done" | "error" | "discarded";
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  filter_reason?: string | null;
  sift_record_id: string | null;
}

// Legacy alias
export type DocumentExtractionStatus = DocumentSiftStatus;

export interface SiftDocument {
  document_id: string;
  filename: string | null;
  folder_id: string | null;
  size_bytes: number;
  uploaded_at: string | null;
  status: "pending" | "processing" | "done" | "error" | "discarded";
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  filter_reason: string | null;
  sift_record_id: string | null;
}
