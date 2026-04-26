import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Code2,
  Copy,
  Key,
  Plug2,
  Plus,
  Terminal,
  Trash2,
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
import { APIKey } from "../api/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function ApiKeyUseCase({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
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
{`curl https://sifter.run/v1/sifts \\
  -H "X-API-Key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
      </pre>
    </div>
  );
}

function ApiKeysCard() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const { data: keysPage, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: fetchApiKeys,
  });
  const keys = keysPage?.items ?? [];

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
                  <p className="text-xs text-muted-foreground font-mono">{key.key_prefix}…</p>
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

        <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="flex items-center gap-1">
          <Plus className="h-4 w-4" /> Create key
        </Button>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create API Key</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key name</Label>
                <Input
                  placeholder="e.g. Production SDK"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newKeyName.trim()) createMutation.mutate(newKeyName); }}
                />
              </div>
              <Button onClick={() => createMutation.mutate(newKeyName)} disabled={!newKeyName.trim() || createMutation.isPending} className="w-full">
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
            <DialogHeader><DialogTitle>Your new API key</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Copy this key now — it will not be shown again.</p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">{createdKey}</code>
                <Button variant="ghost" size="sm" onClick={copyKey}>
                  {keyCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={() => setCreatedKey(null)} className="w-full">Done</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!confirmRevokeId} onOpenChange={() => setConfirmRevokeId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Revoke API Key</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to revoke this API key? This action cannot be undone.
              Any application using this key will lose access immediately.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmRevokeId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => { if (confirmRevokeId) { revokeMutation.mutate(confirmRevokeId); setConfirmRevokeId(null); } }}
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

export default function ApiKeysPage() {
  return (
    <div className="relative min-h-full">
      {/* Atmospheric backdrop */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px] -z-10"
        style={{
          background:
            "radial-gradient(900px 280px at 25% -10%, hsl(263 72% 52% / 0.10), transparent 60%), radial-gradient(700px 220px at 85% -20%, hsl(300 70% 55% / 0.06), transparent 55%)",
        }}
        aria-hidden
      />
      <div className="px-6 py-10 max-w-6xl mx-auto space-y-8">
        {/* Editorial header */}
        <header className="flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-border/70">
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70">
              <Key className="h-3 w-3 text-primary/80" strokeWidth={2.25} />
              <span>Build</span>
              <span className="h-px w-6 bg-border" aria-hidden />
              <span>Developer</span>
            </div>
            <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em] text-foreground">
              API Keys
            </h1>
            <p className="text-sm text-muted-foreground/90 max-w-xl leading-relaxed">
              One key unlocks the entire Sifter surface — REST, SDK, CLI, MCP.{" "}
              <span className="text-foreground/80">Shown once. Scoped to you.</span>
            </p>
          </div>
        </header>

        <div className="space-y-8">
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
      </div>
    </div>
  );
}
