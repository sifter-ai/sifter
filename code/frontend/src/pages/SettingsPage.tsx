import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart2,
  ClipboardList,
  Code2,
  Copy,
  CreditCard,
  Key,
  Palette,
  Plug,
  Plug2,
  Plus,
  Share2,
  Terminal,
  Trash2,
  UserCircle,
  Webhook as WebhookIcon,
} from "lucide-react";
import { createApiKey, fetchApiKeys, revokeApiKey } from "../api/keys";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { useAuthContext } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import { APIKey } from "../api/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const settingsNavClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
    isActive
      ? "bg-primary/10 text-foreground font-medium"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
  }`;

export default function SettingsPage() {
  const { user } = useAuthContext();
  const { mode } = useConfig();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-card/60 min-h-[48px]">
        <h1 className="text-sm font-semibold">Settings</h1>
        {user?.email && (
          <span className="text-xs text-muted-foreground">{user.email}</span>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        <nav className="w-44 shrink-0 space-y-0.5 px-3 py-4 border-r bg-card/40">
          <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">General</p>
          <NavLink to="/settings/account" className={settingsNavClass}>
            <UserCircle className="h-4 w-4 shrink-0" />Account
          </NavLink>
          <NavLink to="/settings/appearance" className={settingsNavClass}>
            <Palette className="h-4 w-4 shrink-0" />Appearance
          </NavLink>

          <p className="px-3 py-1 mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Developer</p>
          <NavLink to="/settings" end className={settingsNavClass}>
            <Key className="h-4 w-4 shrink-0" />API Keys
          </NavLink>
          <NavLink to="/settings/webhooks" className={settingsNavClass}>
            <WebhookIcon className="h-4 w-4 shrink-0" />Webhooks
          </NavLink>

          {mode === "cloud" && (
            <>
              <p className="px-3 py-1 mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cloud</p>
              <NavLink to="/settings/billing" className={settingsNavClass}>
                <CreditCard className="h-4 w-4 shrink-0" />Billing
              </NavLink>
              <NavLink to="/settings/usage" className={settingsNavClass}>
                <BarChart2 className="h-4 w-4 shrink-0" />Usage
              </NavLink>
              <NavLink to="/settings/audit" className={settingsNavClass}>
                <ClipboardList className="h-4 w-4 shrink-0" />Audit log
              </NavLink>
              <NavLink to="/settings/connectors" className={settingsNavClass}>
                <Plug className="h-4 w-4 shrink-0" />Connectors
              </NavLink>
              <NavLink to="/settings/shares" className={settingsNavClass}>
                <Share2 className="h-4 w-4 shrink-0" />Shares
              </NavLink>
            </>
          )}
        </nav>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsIndex() {
  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-3 ring-1 ring-primary/10">
          <Key className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Developer
          </p>
          <h2 className="text-2xl font-semibold tracking-tight leading-none">API Keys</h2>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            One key unlocks the entire Sifter surface — REST, SDK, CLI, MCP.{" "}
            <span className="text-foreground/80">Shown once. Scoped to you.</span>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ApiKeyUseCase
          icon={<Code2 className="h-4 w-4" strokeWidth={1.75} />}
          title="SDK & scripts"
          body="Drop the key into your Python or TypeScript SDK to run extractions from your own code."
        />
        <ApiKeyUseCase
          icon={<Terminal className="h-4 w-4" strokeWidth={1.75} />}
          title="CLI & MCP"
          body="Pipe documents through the sifter CLI, or expose Sifter to Claude Desktop via MCP."
        />
        <ApiKeyUseCase
          icon={<Plug2 className="h-4 w-4" strokeWidth={1.75} />}
          title="No-code tools"
          body="Connect Zapier, n8n, and Make with the same key — no extra setup on the Sifter side."
        />
      </div>

      <AuthSnippet />

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Your keys</h3>
          <p className="text-[11px] text-muted-foreground">
            Revocation is instant — applications using a revoked key lose access immediately.
          </p>
        </div>
        <ApiKeysCard />
      </div>
    </div>
  );
}

function ApiKeyUseCase({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group relative rounded-xl border bg-card/60 p-4 hover:border-foreground/20 transition-colors">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <p className="text-sm font-medium tracking-tight">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function AuthSnippet() {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card/40">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            Authentication
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">header-based</span>
      </div>
      <pre className="text-xs font-mono leading-relaxed p-4 overflow-x-auto text-foreground/85">
{`curl https://api.sifter.run/v1/sifts \\
  -H "X-API-Key: sk_live_xxxxxxxxxxxxxxxx"`}
      </pre>
    </div>
  );
}

function ApiKeysCard() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: fetchApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setCreatedKey(data.plaintext);
      setNewKeyName("");
      setShowCreate(false);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(keyId),
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey: ["api-keys"] });
      const previous = queryClient.getQueryData<APIKey[]>(["api-keys"]);
      queryClient.setQueryData<APIKey[]>(["api-keys"], (old) =>
        old?.filter((k) => k.id !== keyId) ?? []
      );
      return { previous };
    },
    onError: (_err, _keyId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["api-keys"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2 border border-dashed rounded-lg">
            <Key className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No keys yet — create your first one below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((key: APIKey) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:border-foreground/20 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">{key.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {key.key_prefix}…
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Created {formatDate(key.created_at)}
                    {key.last_used_at && ` · Last used ${formatDate(key.last_used_at)}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRevokeId(key.id)}
                  disabled={revokeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1"
        >
          <Plus className="h-4 w-4" /> Create key
        </Button>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key name</Label>
                <Input
                  placeholder="e.g. Production SDK"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newKeyName.trim()) createMutation.mutate(newKeyName);
                  }}
                />
              </div>
              <Button
                onClick={() => createMutation.mutate(newKeyName)}
                disabled={!newKeyName.trim() || createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
              {createMutation.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{(createMutation.error as Error).message}</AlertDescription>
                </Alert>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Copy this key now — it will not be shown again.
              </p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                  {createdKey}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => createdKey && navigator.clipboard.writeText(createdKey)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={() => setCreatedKey(null)} className="w-full">
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!confirmRevokeId} onOpenChange={() => setConfirmRevokeId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke API Key</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to revoke this API key? This action cannot be undone.
              Any application using this key will lose access immediately.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmRevokeId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirmRevokeId) {
                    revokeMutation.mutate(confirmRevokeId);
                    setConfirmRevokeId(null);
                  }
                }}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? "Revoking..." : "Revoke"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
