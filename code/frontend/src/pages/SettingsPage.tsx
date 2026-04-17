import { useState } from "react";
import { Link, useLocation, Outlet, NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Key, Plus, Trash2, Webhook as WebhookIcon, CreditCard, BarChart2, ClipboardList, Plug, Share2 } from "lucide-react";
import { createApiKey, fetchApiKeys, revokeApiKey } from "../api/keys";
import { createWebhook, deleteWebhook, fetchWebhooks, Webhook } from "../api/webhooks";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
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

function SettingsSidebarLink({ to, icon: Icon, children }: { to: string; icon: React.ElementType; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
        active ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
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
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        {user?.email && (
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        )}
      </div>
      <div className="flex gap-8">
        {/* Settings sidebar */}
        <nav className="w-44 shrink-0 space-y-0.5">
          <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">General</p>
          <NavLink to="/settings" end className={settingsNavClass}>
            <Key className="h-4 w-4 shrink-0" />API Keys
          </NavLink>
          {mode === "cloud" && (
            <>
              <p className="px-3 py-1 mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</p>
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

        {/* Content — rendered by nested routes via Outlet */}
        <div className="flex-1 space-y-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function SettingsIndex() {
  return (
    <>
      <ApiKeysSection />
      <WebhooksSection />
    </>
  );
}

function ApiKeysSection() {
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-4 w-4" /> API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((key: APIKey) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div>
                  <p className="font-medium text-sm">{key.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {key.key_prefix}...
                  </p>
                  <p className="text-xs text-muted-foreground">
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
          <Plus className="h-4 w-4" /> Create Key
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
                <p className="text-sm text-destructive">
                  {(createMutation.error as Error).message}
                </p>
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

const AVAILABLE_EVENTS = [
  { value: "sift.document.processed", label: "Document processed" },
  { value: "sift.error", label: "Processing error" },
  { value: "sift.*", label: "All sift events" },
];

function WebhooksSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["sift.document.processed"]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: webhooks = [], isLoading, error } = useQuery({
    queryKey: ["webhooks"],
    queryFn: fetchWebhooks,
  });

  const createMutation = useMutation({
    mutationFn: () => createWebhook({ url: newUrl, events: selectedEvents }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setShowCreate(false);
      setNewUrl("");
      setSelectedEvents(["sift.document.processed"]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["webhooks"] });
      const previous = queryClient.getQueryData<Webhook[]>(["webhooks"]);
      queryClient.setQueryData<Webhook[]>(["webhooks"], (old) =>
        old?.filter((w) => w.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["webhooks"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WebhookIcon className="h-4 w-4" /> Webhooks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Receive HTTP POST notifications when documents are processed.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : webhooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No webhooks configured.</p>
        ) : (
          <div className="space-y-2">
            {webhooks.map((hook: Webhook) => (
              <div
                key={hook.id}
                className="flex items-start justify-between gap-2 p-3 border rounded-md"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-mono truncate">{hook.url}</p>
                  <div className="flex flex-wrap gap-1">
                    {hook.events.map((ev) => (
                      <Badge key={ev} variant="secondary" className="text-xs">
                        {ev}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(hook.created_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeleteId(hook.id)}
                  disabled={deleteMutation.isPending}
                  className="shrink-0"
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
          <Plus className="h-4 w-4" /> Add Webhook
        </Button>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Webhook</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Endpoint URL</Label>
                <Input
                  placeholder="https://your-server.com/webhook"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Events</Label>
                <div className="space-y-2">
                  {AVAILABLE_EVENTS.map((ev) => (
                    <label key={ev.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(ev.value)}
                        onChange={() => toggleEvent(ev.value)}
                        className="rounded border-input"
                      />
                      <span className="text-sm">{ev.label}</span>
                      <code className="text-xs text-muted-foreground">{ev.value}</code>
                    </label>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!newUrl.trim() || selectedEvents.length === 0 || createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending ? "Creating..." : "Add Webhook"}
              </Button>
              {createMutation.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{(createMutation.error as Error).message}</AlertDescription>
                </Alert>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Webhook</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this webhook? You will no longer receive
              notifications at this endpoint.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirmDeleteId) {
                    deleteMutation.mutate(confirmDeleteId);
                    setConfirmDeleteId(null);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
