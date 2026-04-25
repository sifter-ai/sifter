import { apiFetch, apiFetchJson } from "../lib/apiFetch";

// ---- Billing ----

export interface Subscription {
  plan_code: string;
  plan_name: string;
  status: "active" | "past_due" | "trial" | "canceled";
  trial_end_at: string | null;
  has_stripe_subscription: boolean;
  pending_plan_code: string | null;
  pending_plan_at: string | null;
  current_period_end: string | null;
}

export interface Usage {
  docs_processed: number;
  docs_limit: number | null;
  storage_bytes: number;
  storage_limit_mb: number | null;
  sifts_count: number;
  sifts_limit: number | null;
}

export const fetchSubscription = (): Promise<Subscription> =>
  apiFetchJson("/api/billing/subscription");

export const fetchUsage = (): Promise<Usage> =>
  apiFetchJson("/api/usage");

export const openBillingPortal = (return_url?: string): Promise<{ url: string }> =>
  apiFetchJson("/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ return_url: return_url ?? window.location.href }),
  });

export const startCheckout = (
  plan_code: string,
  success_url: string,
  cancel_url: string
): Promise<{ checkout_url: string }> =>
  apiFetchJson("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code, success_url, cancel_url }),
  });

export const upgradeSubscription = (
  plan_code: string
): Promise<{
  plan_code: string;
  status: "pending_webhook";
  pending_plan_code?: string;
  pending_plan_at?: string;
}> =>
  apiFetchJson("/api/billing/upgrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code }),
  });

// ---- Audit Log ----

export interface AuditEvent {
  id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  ip: string;
  created_at: string;
}

export const fetchAuditLog = (params: {
  action?: string;
  since?: string;
  limit?: number;
}): Promise<{ items: AuditEvent[] }> => {
  const qs = new URLSearchParams();
  if (params.action) qs.set("action", params.action);
  if (params.since) qs.set("since", params.since);
  qs.set("limit", String(params.limit ?? 100));
  return apiFetchJson(`/api/cloud/audit?${qs}`);
};

// ---- Connectors ----

export interface ConnectorConnection {
  id: string;
  account_email: string;
  status: "active" | "error" | "paused";
  sync_status?: "idle" | "syncing";
  last_error?: string | null;
  last_sync_at?: string | null;
  label_id?: string | null;
  label_name?: string | null;
  folder_id?: string | null;
  drive_folder_id?: string | null;
  drive_folder_name?: string | null;
  recursive?: boolean;
}

export const fetchGmailConnections = (): Promise<ConnectorConnection[]> =>
  apiFetchJson("/api/cloud/connectors/gmail");
export const getGmailOAuthUrl = (): Promise<{ url: string }> =>
  apiFetchJson("/api/cloud/connectors/gmail/oauth-url");
export const gmailOAuthCallback = (code: string, state: string): Promise<void> =>
  apiFetchJson("/api/cloud/connectors/gmail/oauth-callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
export const fetchGmailLabels = (id: string): Promise<{ id: string; name: string }[]> =>
  apiFetchJson(`/api/cloud/connectors/gmail/${id}/labels`);
export const configureGmail = (id: string, cfg: Record<string, unknown>): Promise<void> =>
  apiFetchJson(`/api/cloud/connectors/gmail/${id}/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
export const syncGmail = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/connectors/gmail/${id}/sync`, { method: "POST" });
export const revokeGmail = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/connectors/gmail/${id}`, { method: "DELETE" });

export const fetchGDriveConnections = (): Promise<ConnectorConnection[]> =>
  apiFetchJson("/api/cloud/connectors/gdrive");
export const getGDriveOAuthUrl = (): Promise<{ url: string }> =>
  apiFetchJson("/api/cloud/connectors/gdrive/oauth-url");
export const gdriveOAuthCallback = (code: string, state: string): Promise<void> =>
  apiFetchJson("/api/cloud/connectors/gdrive/oauth-callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
export const browseGDrive = (
  id: string,
  parent_id?: string
): Promise<{ id: string; name: string; is_folder: boolean }[]> =>
  apiFetchJson(
    `/api/cloud/connectors/gdrive/${id}/browse${parent_id ? `?parent_id=${parent_id}` : ""}`
  );
export const configureGDrive = (id: string, cfg: Record<string, unknown>): Promise<void> =>
  apiFetchJson(`/api/cloud/connectors/gdrive/${id}/configure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
export const syncGDrive = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/connectors/gdrive/${id}/sync`, { method: "POST" });
export const revokeGDrive = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/connectors/gdrive/${id}`, { method: "DELETE" });

// ---- Inbound Email ----

export interface InboundPolicy {
  folder_id?: string;
  enabled: boolean;
  allowed_senders: string[];
  allow_pdf_only: boolean;
  max_attachment_size_mb: number;
  secret_token?: string;
}

export interface InboundPolicyResponse {
  policy: InboundPolicy;
  inbound_address: string;
}

export interface InboundEvent {
  from_email: string;
  received_at: string;
  accepted: boolean;
  rejection_reason: string | null;
}

export const fetchInboundPolicy = (folderId: string): Promise<InboundPolicyResponse> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound`);
export const enableInbound = (
  folderId: string,
  params?: { allowed_senders?: string[]; allow_pdf_only?: boolean; max_attachment_size_mb?: number }
): Promise<{ status: string; inbound_address: string }> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
export const disableInbound = (folderId: string): Promise<void> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound/disable`, { method: "POST" });
export const updateInboundPolicy = (
  folderId: string,
  policy: Partial<Pick<InboundPolicy, "allowed_senders" | "allow_pdf_only" | "max_attachment_size_mb">>
): Promise<void> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policy),
  });
export const fetchInboundEvents = (folderId: string): Promise<{ events: InboundEvent[] }> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound/events`);

export const fetchAllInboundPolicies = (): Promise<{ policies: Array<{ folder_id: string; enabled: boolean }> }> =>
  apiFetchJson("/api/cloud/inbound/policies");

// ---- Shares ----

export interface Share {
  _id: string;
  title: string;
  slug: string;
  kind: "aggregation" | "chat_message" | "dashboard_view";
  access: "private_link" | "org_only" | "password";
  view_count: number;
  expires_at: string | null;
  created_at: string;
  source_snapshot?: unknown;
}

export const createShare = (payload: {
  title: string;
  kind: Share["kind"];
  source_id: string;
  access: Share["access"];
  password?: string;
  expires_at?: string;
}): Promise<Share> =>
  apiFetchJson("/api/cloud/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const fetchShares = (): Promise<{ items: Share[] }> =>
  apiFetchJson("/api/cloud/shares");

export const revokeShare = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/shares/${id}/revoke`, { method: "POST" });

export const deleteShare = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/shares/${id}`, { method: "DELETE" });

export const sendShareEmail = (
  id: string,
  payload: { recipients: string[]; subject: string; message?: string }
): Promise<void> =>
  apiFetchJson(`/api/cloud/shares/${id}/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const downloadSharePdf = async (id: string, title: string): Promise<void> => {
  const res = await apiFetch(`/api/cloud/shares/${id}/pdf`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export const fetchPublicShare = async (slug: string, viewJwt?: string): Promise<any> => {
  const headers: Record<string, string> = {};
  if (viewJwt) headers["Authorization"] = `Bearer ${viewJwt}`;
  const res = await fetch(`/public/shares/${slug}`, { headers });
  if (!res.ok) {
    const err = Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    throw err;
  }
  return res.json();
};

export const unlockShare = async (slug: string, password: string): Promise<{ view_token: string }> => {
  const res = await fetch(`/public/shares/${slug}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    throw err;
  }
  return res.json();
};

// ---- Advanced Chat ----

export interface ChatSession {
  id: string;
  title: string;
  sift_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ChatBlock {
  type: "text" | "big_number" | "table" | "chart" | "records_list";
  title?: string;
  content?: string;
  value?: number | string;
  label?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  chart_type?: "bar" | "line" | "pie";
  chart_data?: { name: string; value: number }[];
  record_ids?: string[];
  sift_id?: string;
}

export interface ChatStep {
  tool: string;
  label: string;
  result_count: number;
}

export interface ChatMessageCloud {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: ChatBlock[];
  steps?: ChatStep[];
  created_at: string;
}

export const fetchChatSessions = (): Promise<{ items: ChatSession[] }> =>
  apiFetchJson("/api/cloud/chat/sessions");

export const createChatSession = (payload: {
  sift_ids: string[];
  title?: string;
}): Promise<ChatSession> =>
  apiFetchJson("/api/cloud/chat/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const fetchChatSession = (id: string): Promise<{
  session: ChatSession;
  messages: ChatMessageCloud[];
}> => apiFetchJson(`/api/cloud/chat/sessions/${id}`);

export const deleteChatSession = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/chat/sessions/${id}`, { method: "DELETE" });

export const sendCloudChatMessage = (
  sessionId: string,
  content: string
): Promise<ChatMessageCloud> =>
  apiFetchJson(`/api/cloud/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

export const fetchChatSuggestions = (sift_ids: string[]): Promise<{ suggestions: string[] }> =>
  apiFetchJson("/api/cloud/chat/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sift_ids }),
  });

// ---- Dashboards (legacy org-level — kept for backward compat) ----

export interface DashboardWidget {
  id: string;
  title: string;
  kind: "big_number" | "table" | "chart";
  sift_id: string;
  pipeline: Record<string, unknown>[];
  snapshot?: ChatBlock;
  layout: { x: number; y: number; w: number; h: number };
}

export interface Dashboard {
  id: string;
  name: string;
  sift_ids: string[];
  widgets: DashboardWidget[];
  created_at: string;
  updated_at: string;
}

// ---- Per-sift dashboard ----

export interface SiftDashboardTile {
  id: string;
  kind: "kpi" | "table" | "bar_chart" | "line_chart";
  title: string;
  pipeline: Record<string, unknown>[];
  chart_x: string | null;
  chart_y: string | null;
  position: number;
  is_auto_generated: boolean;
  created_at: string;
}

export interface TileSnapshot {
  tile_id: string;
  sift_id: string;
  result: Record<string, unknown>[];
  ran_at: string;
  record_ids_by_bucket?: Record<string, string[]> | null;
}

export interface SiftDashboard {
  _id: string;
  org_id: string;
  sift_id: string;
  tiles: SiftDashboardTile[];
  snapshots: Record<string, TileSnapshot>;
  created_at: string;
  updated_at: string;
}

export const fetchSiftDashboard = (siftId: string): Promise<SiftDashboard> =>
  apiFetchJson(`/api/cloud/sifts/${siftId}/dashboard`);

export const generateDashboard = (siftId: string): Promise<SiftDashboard> =>
  apiFetchJson(`/api/cloud/sifts/${siftId}/dashboard/generate`, { method: "POST" });

export const addDashboardTile = (
  siftId: string,
  tile: {
    kind: string;
    title: string;
    pipeline: Record<string, unknown>[];
    chart_x?: string;
    chart_y?: string;
  }
): Promise<SiftDashboard> =>
  apiFetchJson(`/api/cloud/sifts/${siftId}/dashboard/tiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tile),
  });

export const updateDashboardTile = (
  siftId: string,
  tileId: string,
  updates: Partial<SiftDashboardTile>
): Promise<SiftDashboard> =>
  apiFetchJson(`/api/cloud/sifts/${siftId}/dashboard/tiles/${tileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

export const deleteDashboardTile = (siftId: string, tileId: string): Promise<{ status: string }> =>
  apiFetchJson(`/api/cloud/sifts/${siftId}/dashboard/tiles/${tileId}`, { method: "DELETE" });

export const refreshDashboardTile = (siftId: string, tileId: string): Promise<TileSnapshot> =>
  apiFetchJson(`/api/cloud/sifts/${siftId}/dashboard/tiles/${tileId}/refresh`, { method: "POST" });

export const drillDownTile = (
  siftId: string,
  tileId: string,
  bucketKey: string,
  bucketValue: string
): Promise<{ record_ids: string[] }> =>
  apiFetchJson(
    `/api/cloud/sifts/${siftId}/dashboard/tiles/${tileId}/drill-down?bucket_key=${encodeURIComponent(bucketKey)}&bucket_value=${encodeURIComponent(bucketValue)}`
  );

export const reorderDashboardTiles = (
  siftId: string,
  order: { id: string; position: number }[]
): Promise<SiftDashboard> =>
  apiFetchJson(`/api/cloud/sifts/${siftId}/dashboard/tiles`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });

// ---- Standalone Dashboards ----

export interface TileLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface DashboardTile {
  id: string;
  sift_id: string;
  kind: "kpi" | "table" | "bar_chart" | "line_chart";
  title: string;
  pipeline: Record<string, unknown>[];
  chart_x: string | null;
  chart_y: string | null;
  is_auto_generated: boolean;
  created_at: string;
  layout?: TileLayout | null;
  description?: string | null;
}

export interface DashboardSnapshot {
  tile_id: string;
  sift_id: string;
  result: Record<string, unknown>[];
  ran_at: string;
}

export interface StandaloneDashboard {
  _id: string;
  name: string;
  description: string;
  spec: string;
  tiles: DashboardTile[];
  snapshots: Record<string, DashboardSnapshot>;
  created_at: string;
  updated_at: string;
}

export interface DashboardsListResponse {
  items: StandaloneDashboard[];
  total: number;
}

export const fetchDashboards = (): Promise<DashboardsListResponse> =>
  apiFetchJson("/api/dashboards");

export const createDashboard = (payload: { name: string; description?: string; spec?: string }): Promise<StandaloneDashboard> =>
  apiFetchJson("/api/dashboards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const fetchDashboard = (dashboardId: string): Promise<StandaloneDashboard> =>
  apiFetchJson(`/api/dashboards/${dashboardId}`);

export const updateDashboard = (
  dashboardId: string,
  updates: { name?: string; description?: string; spec?: string }
): Promise<StandaloneDashboard> =>
  apiFetchJson(`/api/dashboards/${dashboardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

export const deleteDashboard = (dashboardId: string): Promise<{ status: string }> =>
  apiFetchJson(`/api/dashboards/${dashboardId}`, { method: "DELETE" });

export const addDashboardTileStandalone = (
  dashboardId: string,
  tile: { sift_id: string; kind: string; title: string; pipeline: Record<string, unknown>[]; chart_x?: string; chart_y?: string }
): Promise<StandaloneDashboard> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/tiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tile),
  });

export const updateDashboardTileStandalone = (
  dashboardId: string,
  tileId: string,
  updates: Partial<DashboardTile>
): Promise<StandaloneDashboard> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/tiles/${tileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

export const deleteDashboardTileStandalone = (dashboardId: string, tileId: string): Promise<StandaloneDashboard> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/tiles/${tileId}`, { method: "DELETE" });

export const refreshDashboardTileStandalone = (dashboardId: string, tileId: string): Promise<DashboardSnapshot> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/tiles/${tileId}/refresh`, { method: "POST" });

export const reorderStandaloneDashboardTiles = (
  dashboardId: string,
  tileIds: string[]
): Promise<StandaloneDashboard> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/tiles/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tile_ids: tileIds }),
  });

export const updateDashboardLayout = (
  dashboardId: string,
  layouts: Array<{ tile_id: string; x: number; y: number; w: number; h: number }>
): Promise<StandaloneDashboard> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/layout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layouts }),
  });

export interface GenerateTilesResult {
  dashboard: StandaloneDashboard;
  added: number;
  trace: Array<{
    tool: string;
    args: Record<string, unknown>;
    result_preview: string;
    duration_ms: number;
  }>;
  refresh_errors: Array<{ tile_id: string; error: string }>;
}

export const generateDashboardTiles = (
  dashboardId: string,
  prompt: string,
  siftId?: string
): Promise<GenerateTilesResult> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, sift_id: siftId || null }),
  });

export const regenerateDashboard = (
  dashboardId: string,
  spec: string
): Promise<GenerateTilesResult> =>
  apiFetchJson(`/api/dashboards/${dashboardId}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec }),
  });

