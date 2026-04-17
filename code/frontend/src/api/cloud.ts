import { apiFetch, apiFetchJson } from "../lib/apiFetch";

// ---- Billing ----

export interface Subscription {
  plan_code: string;
  plan_name: string;
  status: "active" | "past_due" | "trial" | "canceled";
  trial_end_at: string | null;
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

export const openBillingPortal = (): Promise<{ url: string }> =>
  apiFetchJson("/api/billing/portal", { method: "POST" });

export const startCheckout = (
  plan_code: string,
  success_url: string,
  cancel_url: string
): Promise<{ checkout_url: string }> =>
  apiFetchJson("/api/cloud/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code, success_url, cancel_url }),
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
  last_error?: string | null;
  label_id?: string | null;
  folder_id?: string | null;
  options?: Record<string, unknown>;
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
  enabled: boolean;
  address: string;
  allowed_senders: string[];
  allow_pdf_only: boolean;
  max_attachment_size_mb: number;
}

export interface InboundEvent {
  from_email: string;
  received_at: string;
  accepted: boolean;
  rejection_reason: string | null;
}

export const fetchInboundPolicy = (folderId: string): Promise<InboundPolicy> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound`);
export const enableInbound = (folderId: string): Promise<void> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound/enable`, { method: "POST" });
export const disableInbound = (folderId: string): Promise<void> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound/disable`, { method: "POST" });
export const updateInboundPolicy = (folderId: string, policy: Partial<InboundPolicy>): Promise<void> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policy),
  });
export const fetchInboundEvents = (folderId: string): Promise<InboundEvent[]> =>
  apiFetchJson(`/api/cloud/folders/${folderId}/inbound/events`);

// ---- Shares ----

export interface Share {
  id: string;
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

export const fetchPublicShare = (slug: string, viewJwt?: string): Promise<Share> =>
  apiFetchJson(`/public/shares/${slug}`, {
    headers: viewJwt ? { Authorization: `Bearer ${viewJwt}` } : {},
  });

export const unlockShare = (slug: string, password: string): Promise<{ view_token: string }> =>
  apiFetchJson(`/public/shares/${slug}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

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

export interface ChatMessageCloud {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: ChatBlock[];
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

// ---- Dashboards ----

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

export const fetchDashboards = (): Promise<{ items: Dashboard[] }> =>
  apiFetchJson("/api/cloud/dashboards");

export const createDashboard = (payload: { name: string; sift_ids: string[] }): Promise<Dashboard> =>
  apiFetchJson("/api/cloud/dashboards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const fetchDashboard = (id: string): Promise<Dashboard> =>
  apiFetchJson(`/api/cloud/dashboards/${id}`);

export const updateDashboard = (id: string, payload: Partial<Dashboard>): Promise<Dashboard> =>
  apiFetchJson(`/api/cloud/dashboards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteDashboard = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/dashboards/${id}`, { method: "DELETE" });

export const createWidget = (payload: Omit<DashboardWidget, "id" | "snapshot">): Promise<DashboardWidget> =>
  apiFetchJson("/api/cloud/widgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const updateWidget = (id: string, payload: Partial<DashboardWidget>): Promise<DashboardWidget> =>
  apiFetchJson(`/api/cloud/widgets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteWidget = (id: string): Promise<void> =>
  apiFetchJson(`/api/cloud/widgets/${id}`, { method: "DELETE" });

export const refreshWidget = (id: string): Promise<DashboardWidget> =>
  apiFetchJson(`/api/cloud/widgets/${id}/refresh`, { method: "POST" });

export const drillDownWidget = (
  id: string,
  bucket_key: string
): Promise<{ record_ids: string[] }> =>
  apiFetchJson(`/api/cloud/widgets/${id}/drill-down?bucket_key=${encodeURIComponent(bucket_key)}`);

// ---- GitHub Auth ----

export const githubCallback = (code: string): Promise<{ access_token: string }> =>
  apiFetchJson("/api/auth/github", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
