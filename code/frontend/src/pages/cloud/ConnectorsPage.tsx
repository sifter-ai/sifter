import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Plug,
  RefreshCw,
  Trash2,
  XCircle,
  AlertCircle,
  Loader2,
  Zap,
} from "lucide-react";
import {
  fetchGmailConnections,
  getGmailOAuthUrl,
  configureGmail,
  syncGmail,
  revokeGmail,
  fetchGDriveConnections,
  getGDriveOAuthUrl,
  configureGDrive,
  syncGDrive,
  revokeGDrive,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function GmailLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.148C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335" />
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
  const folders: { id: string; name: string }[] = foldersData ?? [];

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-3 ring-1 ring-primary/10">
          <Plug className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Cloud
          </p>
          <h2 className="text-2xl font-semibold tracking-tight leading-none">Connectors</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Auto-sync documents from Gmail and Google Drive into your Sifter folders.
          </p>
        </div>
      </header>

      {/* ── Connectors ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border overflow-hidden divide-y">
        <div className="p-5 space-y-4">
          <ConnectorSection
            queryKey="gmail-connections"
            fetchConnections={fetchGmailConnections}
            getOAuthUrl={getGmailOAuthUrl}
            configure={configureGmail}
            sync={syncGmail}
            revoke={revokeGmail}
            logo={<GmailLogo />}
            name="Gmail"
            description="Forward attachments from a Gmail label to a Sifter folder"
            folders={folders}
          />
        </div>

        <div className="p-5 space-y-4">
          <ConnectorSection
            queryKey="gdrive-connections"
            fetchConnections={fetchGDriveConnections}
            getOAuthUrl={getGDriveOAuthUrl}
            configure={configureGDrive}
            sync={syncGDrive}
            revoke={revokeGDrive}
            logo={<DriveLogo />}
            name="Google Drive"
            description="Watch a Drive folder and sync new PDFs to Sifter automatically"
            folders={folders}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground px-0.5">
        Connectors require Starter plan or above. Documents synced via connectors count toward your monthly quota.
      </p>
    </div>
  );
}
