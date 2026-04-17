import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
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

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  paused: "bg-amber-100 text-amber-800",
};

function ConnectionCard({
  conn,
  folders,
  onConfigure,
  onSync,
  onRevoke,
}: {
  conn: ConnectorConnection;
  folders: { id: string; name: string }[];
  onConfigure: (cfg: Record<string, unknown>) => void;
  onSync: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{conn.account_email}</p>
          {conn.last_error && (
            <p className="text-xs text-destructive mt-0.5">{conn.last_error}</p>
          )}
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[conn.status] ?? ""}`}>
          {conn.status}
        </span>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Sifter folder</label>
        <select
          className="w-full mt-0.5 rounded border border-input bg-background px-2 py-1 text-sm"
          defaultValue={conn.folder_id ?? ""}
          onChange={(e) => onConfigure({ folder_id: e.target.value })}
        >
          <option value="">— select folder —</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onSync}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Sync now
        </Button>
        <Button variant="ghost" size="sm" onClick={onRevoke} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-1" />Revoke
        </Button>
      </div>
    </div>
  );
}

function GmailSection({ folders }: { folders: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["gmail-connections"],
    queryFn: fetchGmailConnections,
  });

  const connectMutation = useMutation({
    mutationFn: () => getGmailOAuthUrl().then(({ url }) => { window.location.href = url; }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-red-50 flex items-center justify-center text-sm font-bold text-red-600">G</div>
          <span className="font-medium">Gmail</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
          Connect Gmail
        </Button>
      </div>
      {isLoading && <Skeleton className="h-20 w-full" />}
      {(connections as ConnectorConnection[]).map((conn) => (
        <ConnectionCard
          key={conn.id}
          conn={conn}
          folders={folders}
          onConfigure={(cfg) => configureGmail(conn.id, cfg).then(() => qc.invalidateQueries({ queryKey: ["gmail-connections"] }))}
          onSync={() => syncGmail(conn.id).then(() => qc.invalidateQueries({ queryKey: ["gmail-connections"] }))}
          onRevoke={() => revokeGmail(conn.id).then(() => qc.invalidateQueries({ queryKey: ["gmail-connections"] }))}
        />
      ))}
    </div>
  );
}

function DriveSection({ folders }: { folders: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["gdrive-connections"],
    queryFn: fetchGDriveConnections,
  });

  const connectMutation = useMutation({
    mutationFn: () => getGDriveOAuthUrl().then(({ url }) => { window.location.href = url; }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600">D</div>
          <span className="font-medium">Google Drive</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
          Connect Drive
        </Button>
      </div>
      {isLoading && <Skeleton className="h-20 w-full" />}
      {(connections as ConnectorConnection[]).map((conn) => (
        <ConnectionCard
          key={conn.id}
          conn={conn}
          folders={folders}
          onConfigure={(cfg) => configureGDrive(conn.id, cfg).then(() => qc.invalidateQueries({ queryKey: ["gdrive-connections"] }))}
          onSync={() => syncGDrive(conn.id).then(() => qc.invalidateQueries({ queryKey: ["gdrive-connections"] }))}
          onRevoke={() => revokeGDrive(conn.id).then(() => qc.invalidateQueries({ queryKey: ["gdrive-connections"] }))}
        />
      ))}
    </div>
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
      <h2 className="text-xl font-semibold">Connectors</h2>
      <GmailSection folders={folders} />
      <hr />
      <DriveSection folders={folders} />
    </div>
  );
}
