import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Mail,
  Plug,
  RefreshCw,
  Trash2,
  XCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  fetchGDriveConnections,
  getGDriveOAuthUrl,
  configureGDrive,
  syncGDrive,
  revokeGDrive,
  fetchGmailConnections,
  getGmailOAuthUrl,
  fetchGmailLabels,
  configureGmail,
  syncGmail,
  revokeGmail,
  type ConnectorConnection,
} from "@/api/cloud";
import { fetchFolders } from "@/api/folders";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanLimitError } from "@/lib/apiFetch";
import { InboundEmailPanel } from "@/components/cloud/InboundEmailPanel";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  active: {
    label: "Active",
    icon: CheckCircle2,
    cls: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    label: "Error",
    icon: XCircle,
    cls: "text-destructive",
  },
  paused: {
    label: "Paused",
    icon: AlertCircle,
    cls: "text-amber-500",
  },
};

// ─── Connection card ──────────────────────────────────────────────────────────

function ConnectionCard({
  conn,
  folders,
  onConfigure,
  onSync,
  onRevoke,
  syncPending,
  revokePending,
}: {
  conn: ConnectorConnection;
  folders: { id: string; name: string }[];
  onConfigure: (cfg: Record<string, unknown>) => void;
  onSync: () => void;
  onRevoke: () => void;
  syncPending: boolean;
  revokePending: boolean;
}) {
  const status = STATUS[conn.status] ?? STATUS.active;
  const StatusIcon = status.icon;

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border bg-card transition-colors hover:border-foreground/15">
      <div className="min-w-0 flex-1 space-y-3">
        {/* Email + status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{conn.account_email}</span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${status.cls}`}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </span>
        </div>

        {/* Error */}
        {conn.last_error && (
          <p className="text-xs text-destructive leading-snug">{conn.last_error}</p>
        )}

        {/* Drive folder */}
        {conn.drive_folder_name && (
          <p className="text-xs text-muted-foreground">
            Drive folder:{" "}
            <span className="text-foreground/70 font-medium">{conn.drive_folder_name}</span>
          </p>
        )}

        {/* Sifter folder selector */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            Sifter folder
          </label>
          <select
            className="w-full max-w-xs rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue={conn.folder_id ?? ""}
            onChange={(e) => onConfigure({ folder_id: e.target.value || null })}
          >
            <option value="">— select folder —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onSync}
          disabled={syncPending}
        >
          {syncPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Sync
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onRevoke}
          disabled={revokePending}
        >
          <Trash2 className="h-3 w-3" />
          Revoke
        </Button>
      </div>
    </div>
  );
}

// ─── Connector section ────────────────────────────────────────────────────────

function ConnectorSection({
  queryKey,
  fetchConnections,
  getOAuthUrl,
  configure,
  sync,
  revoke,
  logo,
  name,
  description,
  folders,
}: {
  queryKey: string;
  fetchConnections: () => Promise<ConnectorConnection[]>;
  getOAuthUrl: () => Promise<{ url: string }>;
  configure: (id: string, cfg: Record<string, unknown>) => Promise<void>;
  sync: (id: string) => Promise<void>;
  revoke: (id: string) => Promise<void>;
  logo: React.ReactNode;
  name: string;
  description: string;
  folders: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [planError, setPlanError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: fetchConnections,
    select: (data) => (Array.isArray(data) ? data : []),
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { url } = await getOAuthUrl();
      window.location.href = url;
    },
    onError: (err) => {
      if (err instanceof PlanLimitError) {
        setPlanError("Your plan doesn't include this connector. Upgrade to connect.");
      }
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border bg-card flex items-center justify-center shrink-0">
            {logo}
          </div>
          <div>
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs shrink-0"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
        >
          {connectMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" />
          )}
          Connect
        </Button>
      </div>

      {/* Plan error */}
      {planError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2.5">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="text-amber-800 dark:text-amber-300 font-medium">{planError}</p>
            <a href="/settings/billing" className="text-amber-600 hover:underline">
              View plans →
            </a>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && <Skeleton className="h-20 rounded-xl" />}

      {/* Connections */}
      {!isLoading && connections.length === 0 && !planError && (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            No {name} accounts connected yet.
          </p>
        </div>
      )}

      {connections.map((conn) => (
        <ConnectionCard
          key={conn.id}
          conn={conn}
          folders={folders}
          onConfigure={(cfg) => configure(conn.id, cfg).then(invalidate)}
          onSync={() => {
            setSyncingId(conn.id);
            sync(conn.id)
              .then(invalidate)
              .finally(() => setSyncingId(null));
          }}
          onRevoke={() => {
            setRevokingId(conn.id);
            revoke(conn.id)
              .then(invalidate)
              .finally(() => setRevokingId(null));
          }}
          syncPending={syncingId === conn.id}
          revokePending={revokingId === conn.id}
        />
      ))}
    </div>
  );
}

// ─── Gmail connection card ────────────────────────────────────────────────────

function GmailConnectionCard({
  conn,
  folders,
  onConfigure,
  onSync,
  onRevoke,
  syncPending,
  revokePending,
}: {
  conn: ConnectorConnection;
  folders: { id: string; name: string }[];
  onConfigure: (cfg: Record<string, unknown>) => void;
  onSync: () => void;
  onRevoke: () => void;
  syncPending: boolean;
  revokePending: boolean;
}) {
  const status = STATUS[conn.status] ?? STATUS.active;
  const StatusIcon = status.icon;
  const [labelId, setLabelId] = useState(conn.label_id ?? "");
  const [folderId, setFolderId] = useState(conn.folder_id ?? "");

  const { data: labels = [] } = useQuery({
    queryKey: ["gmail-labels", conn.id],
    queryFn: () => fetchGmailLabels(conn.id),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border bg-card transition-colors hover:border-foreground/15">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{conn.account_email || "Gmail account"}</span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${status.cls}`}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </span>
        </div>

        {conn.last_error && (
          <p className="text-xs text-destructive leading-snug">{conn.last_error}</p>
        )}

        {conn.label_name && (
          <p className="text-xs text-muted-foreground">
            Label: <span className="text-foreground/70 font-medium">{conn.label_name}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground font-medium">Gmail label</label>
            <select
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
            >
              <option value="">— all mail —</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              Sifter folder
            </label>
            <select
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">— select folder —</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onConfigure({ label_id: labelId, folder_id: folderId })}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onSync}
          disabled={syncPending}
        >
          {syncPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Sync
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onRevoke}
          disabled={revokePending}
        >
          <Trash2 className="h-3 w-3" />
          Revoke
        </Button>
      </div>
    </div>
  );
}

// ─── Gmail section ────────────────────────────────────────────────────────────

function GmailSection({ folders }: { folders: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [planError, setPlanError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["gmail-connections"],
    queryFn: fetchGmailConnections,
    select: (data) => (Array.isArray(data) ? data : []),
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { url } = await getGmailOAuthUrl();
      window.location.href = url;
    },
    onError: (err) => {
      if (err instanceof PlanLimitError) {
        setPlanError("Your plan doesn't include this connector. Upgrade to connect.");
      }
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["gmail-connections"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border bg-card flex items-center justify-center shrink-0">
            <GmailLogo />
          </div>
          <div>
            <p className="text-sm font-semibold">Gmail</p>
            <p className="text-[11px] text-muted-foreground">Sync email attachments from a Gmail label to Sifter</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs shrink-0"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
        >
          {connectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
          Connect
        </Button>
      </div>

      {planError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2.5">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="text-amber-800 dark:text-amber-300 font-medium">{planError}</p>
            <a href="/settings/billing" className="text-amber-600 hover:underline">View plans →</a>
          </div>
        </div>
      )}

      {isLoading && <Skeleton className="h-20 rounded-xl" />}

      {!isLoading && connections.length === 0 && !planError && (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">No Gmail accounts connected yet.</p>
        </div>
      )}

      {connections.map((conn) => (
        <GmailConnectionCard
          key={conn.id}
          conn={conn}
          folders={folders}
          onConfigure={(cfg) => configureGmail(conn.id, cfg).then(invalidate)}
          onSync={() => {
            setSyncingId(conn.id);
            syncGmail(conn.id).then(invalidate).finally(() => setSyncingId(null));
          }}
          onRevoke={() => {
            setRevokingId(conn.id);
            revokeGmail(conn.id).then(invalidate).finally(() => setRevokingId(null));
          }}
          syncPending={syncingId === conn.id}
          revokePending={revokingId === conn.id}
        />
      ))}
    </div>
  );
}

// ─── Mail-to-Upload section ───────────────────────────────────────────────────

function MailToUploadSection({ folders }: { folders: { id: string; name: string }[] }) {
  const [folderId, setFolderId] = useState<string>("");

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border bg-card flex items-center justify-center shrink-0">
            <Mail className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">Mail to Upload</p>
            <p className="text-[11px] text-muted-foreground">
              Forward emails with PDF attachments to a Sifter folder automatically
            </p>
          </div>
        </div>

        {/* Folder selector */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            Target folder
          </label>
          <select
            className="w-full max-w-xs rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">— select a folder to configure —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Panel */}
        {folderId ? (
          <div className="rounded-xl border bg-muted/20 p-4">
            <InboundEmailPanel folderId={folderId} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              Select a folder above to view or configure its inbound email address.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function GmailLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z" />
      <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z" />
      <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17" />
      <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z" />
      <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0C43.076,8,45,9.924,45,12.298z" />
    </svg>
  );
}

function DriveLogo() {
  return (
    <svg viewBox="0 0 87.3 78" className="h-5 w-5" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

export default function ConnectorsPage() {
  const { data: foldersData } = useQuery({
    queryKey: ["folders"],
    queryFn: () => fetchFolders(),
  });
  const folders: { id: string; name: string }[] = foldersData?.items ?? [];

  return (
    <div className="relative min-h-full">
      {/* Atmospheric backdrop */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px] -z-10"
        style={{
          background:
            "radial-gradient(900px 280px at 25% -10%, hsl(263 72% 52% / 0.10), transparent 60%), radial-gradient(700px 220px at 85% -20%, hsl(200 85% 55% / 0.07), transparent 55%)",
        }}
        aria-hidden
      />
      <div className="px-6 py-10 max-w-6xl mx-auto space-y-8">
        {/* Editorial header */}
        <header className="flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-border/70">
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70">
              <Plug className="h-3 w-3 text-primary/80" strokeWidth={2.25} />
              <span>Build</span>
              <span className="h-px w-6 bg-border" aria-hidden />
              <span>Ingest</span>
            </div>
            <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em] text-foreground">
              Connectors
            </h1>
            <p className="text-sm text-muted-foreground/90 max-w-xl leading-relaxed">
              Auto-sync documents from Google Drive straight into your Sifter folders.{" "}
              <span className="text-foreground/80">No uploads. No babysitting.</span>
            </p>
          </div>
        </header>

        {/* Cloud feature hero */}
        <section className="rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-transparent to-sky-500/[0.06] p-6 space-y-4 relative overflow-hidden">
          <div
            className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full blur-3xl opacity-40"
            style={{ background: "radial-gradient(closest-side, hsl(200 85% 55% / 0.3), transparent)" }}
            aria-hidden
          />
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-primary/90">
            <Sparkles className="h-3 w-3" strokeWidth={2.25} />
            <span>Sifter Cloud</span>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight">
              Connect once. Sync forever.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
              Link a Google Drive folder and Sifter pulls in new documents automatically —
              no manual uploads, no scripts. Every synced file lands in the Sifter folder of your choice and is
              processed through your sifts.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2.5">
            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" strokeWidth={2.25} />
            <div className="text-xs leading-relaxed space-y-0.5">
              <p className="text-amber-900 dark:text-amber-200 font-medium">
                Connectors are a <span className="font-semibold">Starter</span> feature.
              </p>
              <p className="text-amber-800/80 dark:text-amber-300/80">
                Free-plan orgs cannot connect external sources.{" "}
                <a href="/settings/billing" className="underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100">
                  Upgrade →
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ── OAuth Connectors ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border overflow-hidden divide-y">
          <div className="p-5">
            <GmailSection folders={folders} />
          </div>
          <div className="p-5">
            <ConnectorSection
              queryKey="gdrive-connections"
              fetchConnections={fetchGDriveConnections}
              getOAuthUrl={getGDriveOAuthUrl}
              configure={configureGDrive}
              sync={syncGDrive}
              revoke={revokeGDrive}
              logo={<DriveLogo />}
              name="Google Drive"
              description="Watch a Drive folder and sync new documents to Sifter automatically"
              folders={folders}
            />
          </div>
        </div>

        {/* ── Mail-to-Upload ────────────────────────────────────────────────────── */}
        <MailToUploadSection folders={folders} />

        <p className="text-[11px] text-muted-foreground px-0.5">
          Documents synced via connectors count toward your monthly quota.
        </p>
      </div>
    </div>
  );
}
