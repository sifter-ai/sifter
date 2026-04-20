import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Folder as FolderIcon,
  FolderOpen,
  Mail,
  Plug,
  RefreshCw,
  Trash2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  fetchGDriveConnections,
  getGDriveOAuthUrl,
  browseGDrive,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlanLimitError } from "@/lib/apiFetch";
import { InboundEmailPanel } from "@/components/cloud/InboundEmailPanel";

// ─── Drive folder picker dialog ───────────────────────────────────────────────

function DriveFolderPickerDialog({
  connectionId,
  open,
  onOpenChange,
  onSelect,
}: {
  connectionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (folder: { id: string; name: string }) => void;
}) {
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const currentFolder = path[path.length - 1] ?? null;
  const parentId = currentFolder?.id;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["gdrive-browse", connectionId, parentId ?? "root"],
    queryFn: () => browseGDrive(connectionId, parentId),
    enabled: open,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (d: any) => Array.isArray(d) ? d : (d?.folders ?? []),
  });

  const enter = (item: { id: string; name: string }) =>
    setPath((p) => [...p, item]);

  const goUp = () => setPath((p) => p.slice(0, -1));

  const handleOpen = (v: boolean) => {
    if (!v) setPath([]);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Select Google Drive folder</DialogTitle>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground min-h-[24px] flex-wrap">
          <button
            className="hover:text-foreground transition-colors"
            onClick={() => setPath([])}
          >
            My Drive
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 opacity-50" />
              <button
                className="hover:text-foreground transition-colors font-medium text-foreground"
                onClick={() => setPath((prev) => prev.slice(0, i + 1))}
              >
                {p.name}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="rounded-lg border overflow-hidden min-h-[200px]">
          {path.length > 0 && (
            <button
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/50 border-b transition-colors"
              onClick={goUp}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}

          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No subfolders here
            </div>
          ) : (
            <div className="divide-y max-h-[280px] overflow-y-auto">
              {items.map((f: { id: string; name: string; is_folder: boolean }) => (
                <button
                  key={f.id}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors group"
                  onClick={() => enter(f)}
                >
                  <FolderIcon className="h-4 w-4 text-amber-500/70 shrink-0" />
                  <span className="text-sm flex-1 truncate">{f.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => handleOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!currentFolder}
            onClick={() => {
              if (currentFolder) { onSelect(currentFolder); handleOpen(false); }
            }}
          >
            Select
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── GDrive connection card ───────────────────────────────────────────────────

const STATUS_CFG = {
  active: { label: "Active", icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  error:  { label: "Error",  icon: XCircle,      cls: "text-destructive",                       bar: "bg-destructive" },
  paused: { label: "Paused", icon: AlertCircle,   cls: "text-amber-500",                         bar: "bg-amber-400" },
};

function GDriveConnectionCard({
  conn,
  folders,
  onSaved,
  onSync,
  onRevoke,
  syncPending,
  revokePending,
}: {
  conn: ConnectorConnection;
  folders: { id: string; name: string }[];
  onSaved: () => void;
  onSync: () => void;
  onRevoke: () => void;
  syncPending: boolean;
  revokePending: boolean;
}) {
  const cfg = STATUS_CFG[conn.status] ?? STATUS_CFG.active;
  const StatusIcon = cfg.icon;

  const [driveFolder, setDriveFolder] = useState<{ id: string; name: string } | null>(
    conn.drive_folder_id ? { id: conn.drive_folder_id, name: conn.drive_folder_name ?? conn.drive_folder_id } : null
  );
  const [sifterId, setSifterId] = useState(conn.folder_id ?? "");
  const [recursive, setRecursive] = useState(conn.recursive ?? true);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const isDirty =
    (driveFolder?.id ?? "") !== (conn.drive_folder_id ?? "") ||
    sifterId !== (conn.folder_id ?? "") ||
    recursive !== (conn.recursive ?? true);

  const isSyncing = conn.sync_status === "syncing";

  const handleSave = async () => {
    if (!driveFolder || !sifterId) return;
    setSaving(true);
    try {
      await configureGDrive(conn.id, {
        drive_folder_id: driveFolder.id,
        drive_folder_name: driveFolder.name,
        sifter_folder_id: sifterId,
        recursive,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden flex">
        {/* Active state bar */}
        <div className={`w-1 shrink-0 ${cfg.bar}`} />

        <div className="flex-1 p-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">
                  {conn.account_email || "Google Drive"}
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cfg.cls}`}>
                  <StatusIcon className="h-3 w-3" />
                  {cfg.label}
                </span>
              </div>
              {conn.last_error && (
                <p className="text-xs text-destructive leading-snug">{conn.last_error}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={onSync} disabled={syncPending || isSyncing}
              >
                {(syncPending || isSyncing) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {isSyncing ? "Syncing…" : "Sync"}
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDisconnectOpen(true)} disabled={revokePending}
                title="Disconnect"
              >
                {revokePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Folder mapping */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            {/* Drive folder */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <DriveLogo mini /> Google Drive folder
              </label>
              <button
                className="w-full flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-2 text-xs hover:border-primary/40 hover:bg-primary/[0.02] transition-colors text-left group"
                onClick={() => setBrowseOpen(true)}
              >
                <FolderIcon className="h-3.5 w-3.5 text-amber-500/70 shrink-0" />
                <span className={`flex-1 truncate ${!driveFolder ? "text-muted-foreground" : ""}`}>
                  {driveFolder?.name ?? "— select folder —"}
                </span>
                <span className="text-[10px] text-primary/60 group-hover:text-primary transition-colors shrink-0">
                  Browse
                </span>
              </button>
            </div>

            {/* Arrow */}
            <div className="pb-2">
              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
            </div>

            {/* Sifter folder */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <FolderOpen className="h-3 w-3" /> Sifter folder
              </label>
              <select
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                value={sifterId}
                onChange={(e) => setSifterId(e.target.value)}
              >
                <option value="">— select folder —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recursive toggle + last sync */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3 w-3 rounded accent-primary"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
              />
              Include subfolders
            </label>
            {conn.last_sync_at && !isSyncing && (
              <span>Last sync {new Date(conn.last_sync_at).toLocaleString()}</span>
            )}
            {isSyncing && (
              <span className="text-primary animate-pulse">Syncing in progress…</span>
            )}
          </div>

          {/* Missing folder warning */}
          {(!driveFolder || !sifterId) && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {!driveFolder && !sifterId
                ? "Select a Google Drive folder and a Sifter folder to start syncing."
                : !driveFolder
                ? "Select a Google Drive folder to watch."
                : "Select a Sifter folder where documents will land."}
            </p>
          )}

          {/* Save row */}
          {(isDirty || (driveFolder && sifterId)) && (
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                disabled={!driveFolder || !sifterId || saving}
                onClick={handleSave}
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save mapping
              </Button>
            </div>
          )}
        </div>
      </div>

      <DriveFolderPickerDialog
        connectionId={conn.id}
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        onSelect={setDriveFolder}
      />

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop syncing{conn.drive_folder_name ? ` "${conn.drive_folder_name}"` : ""}. Documents already synced to Sifter will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onRevoke}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── GDrive section ───────────────────────────────────────────────────────────

function GDriveSection({ folders }: { folders: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [planError, setPlanError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["gdrive-connections"],
    queryFn: fetchGDriveConnections,
    select: (d) => (Array.isArray(d) ? d : []),
    refetchInterval: (query) => {
      const conns = query.state.data ?? [];
      return conns.some((c: ConnectorConnection) => c.sync_status === "syncing") ? 2000 : false;
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { url } = await getGDriveOAuthUrl();
      window.location.href = url;
    },
    onError: (err) => {
      if (err instanceof PlanLimitError)
        setPlanError("Your plan doesn't include this connector. Upgrade to connect.");
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["gdrive-connections"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border bg-card flex items-center justify-center shrink-0">
            <DriveLogo />
          </div>
          <div>
            <p className="text-sm font-semibold">Google Drive</p>
            <p className="text-[11px] text-muted-foreground">
              Watch a Drive folder and sync new documents to Sifter automatically
            </p>
          </div>
        </div>
        {connections.length === 0 && (
          <Button
            size="sm" variant="outline" className="gap-1.5 text-xs shrink-0"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ExternalLink className="h-3.5 w-3.5" />}
            Connect
          </Button>
        )}
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

      {isLoading && <Skeleton className="h-28 rounded-xl" />}

      {!isLoading && connections.length === 0 && !planError && (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            No Google Drive accounts connected yet.
          </p>
        </div>
      )}

      {connections.map((conn) => (
        <GDriveConnectionCard
          key={conn.id}
          conn={conn}
          folders={folders}
          onSaved={invalidate}
          onSync={() => {
            setSyncingId(conn.id);
            syncGDrive(conn.id).then(invalidate).finally(() => setSyncingId(null));
          }}
          onRevoke={() => {
            setRevokingId(conn.id);
            revokeGDrive(conn.id).then(invalidate).finally(() => setRevokingId(null));
          }}
          syncPending={syncingId === conn.id}
          revokePending={revokingId === conn.id}
        />
      ))}

      {connections.length > 0 && (
        <button
          className="flex items-center gap-2 w-full rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
        >
          {connectMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <span className="text-base leading-none">+</span>}
          Add another folder
        </button>
      )}
    </div>
  );
}

// ─── Mail-to-Upload section ───────────────────────────────────────────────────

function MailToUploadSection({ folders }: { folders: { id: string; name: string }[] }) {
  const [folderId, setFolderId] = useState<string>("");

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border bg-card flex items-center justify-center shrink-0">
            <Mail className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">Mail to Upload</p>
            <p className="text-[11px] text-muted-foreground">
              Get a unique email address — forward attachments directly into a Sifter folder
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <FolderOpen className="h-3 w-3" /> Target folder
          </label>
          <select
            className="w-full max-w-xs rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">— select a folder to configure —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {folderId ? (
          <div className="rounded-xl border bg-muted/20 p-4">
            <InboundEmailPanel folderId={folderId} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <Mail className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Select a folder above to view or set up its inbound email address.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Logos ────────────────────────────────────────────────────────────────────

function DriveLogo({ mini }: { mini?: boolean }) {
  const cls = mini ? "h-3 w-3" : "h-5 w-5";
  return (
    <svg viewBox="0 0 87.3 78" className={cls} aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConnectorsPage() {
  const { data: foldersData } = useQuery({
    queryKey: ["folders"],
    queryFn: () => fetchFolders(),
  });
  const folders: { id: string; name: string }[] = foldersData?.items ?? [];

  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px] -z-10"
        style={{
          background:
            "radial-gradient(900px 280px at 25% -10%, hsl(263 72% 52% / 0.10), transparent 60%), radial-gradient(700px 220px at 85% -20%, hsl(200 85% 55% / 0.07), transparent 55%)",
        }}
        aria-hidden
      />
      <div className="px-6 py-10 max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <header className="pb-6 border-b border-border/70 space-y-2.5">
          <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70">
            <Plug className="h-3 w-3 text-primary/80" strokeWidth={2.25} />
            <span>Build</span>
            <span className="h-px w-6 bg-border" aria-hidden />
            <span>Ingest</span>
          </div>
          <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em]">
            Connectors
          </h1>
          <p className="text-sm text-muted-foreground/90 max-w-xl leading-relaxed">
            Sync documents automatically — from Google Drive or via email — straight into your Sifter folders.
          </p>
        </header>

        {/* Cloud hero */}
        <section className="rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-transparent to-sky-500/[0.06] p-5 space-y-3 relative overflow-hidden">
          <div
            className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full blur-3xl opacity-40"
            style={{ background: "radial-gradient(closest-side, hsl(200 85% 55% / 0.3), transparent)" }}
            aria-hidden
          />
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-primary/90">
            <Sparkles className="h-3 w-3" strokeWidth={2.25} />
            <span>Sifter Cloud</span>
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

        {/* Google Drive */}
        <div className="rounded-xl border overflow-hidden">
          <div className="p-5">
            <GDriveSection folders={folders} />
          </div>
        </div>

        {/* Mail to Upload */}
        <MailToUploadSection folders={folders} />

        <p className="text-[11px] text-muted-foreground px-0.5">
          Documents synced via connectors count toward your monthly quota.
        </p>
      </div>
    </div>
  );
}
