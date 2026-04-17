import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Database,
  Plus,
  Trash2,
  Webhook as WebhookIcon,
  Workflow,
  Zap,
} from "lucide-react";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const AVAILABLE_EVENTS = [
  { value: "sift.document.processed", label: "Document processed" },
  { value: "sift.error", label: "Processing error" },
  { value: "sift.*", label: "All sift events" },
];

export default function WebhooksSettingsPage() {
  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-3 ring-1 ring-primary/10">
          <WebhookIcon className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Developer
          </p>
          <h2 className="text-2xl font-semibold tracking-tight leading-none">Webhooks</h2>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Push Sifter events to your stack the instant they happen.{" "}
            <span className="text-foreground/80">No polling. No cron.</span>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <UseCase
          icon={<Database className="h-4 w-4" strokeWidth={1.75} />}
          title="Data pipelines"
          body="Stream extracted records into your warehouse, CRM, or database as soon as a document is processed."
        />
        <UseCase
          icon={<Bell className="h-4 w-4" strokeWidth={1.75} />}
          title="Real-time alerts"
          body="Ping Slack, email, or PagerDuty the moment a specific record type — a high-value invoice, a contract clause — lands."
        />
        <UseCase
          icon={<Workflow className="h-4 w-4" strokeWidth={1.75} />}
          title="Automations"
          body="Trigger downstream flows in n8n, Zapier, or your own code. Each webhook is a deterministic fan-out point."
        />
      </div>

      <PayloadPreview />

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Endpoints</h3>
          <p className="text-[11px] text-muted-foreground">
            Signed with <code className="font-mono">HMAC-SHA256</code> · retried on non-2xx
          </p>
        </div>
        <EndpointsCard />
      </div>
    </div>
  );
}

function UseCase({
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

function PayloadPreview() {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card/40">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            POST /your-endpoint
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">application/json</span>
      </div>
      <pre className="text-xs font-mono leading-relaxed p-4 overflow-x-auto text-foreground/85">
{`{
  "event": "sift.document.processed",
  "sift_id":     "sft_abc123",
  "document_id": "doc_xyz789",
  "record": {
    "invoice_number": "INV-2026-0421",
    "total":          1284.00,
    "currency":       "EUR"
  },
  "timestamp": "2026-04-17T10:23:45Z"
}`}
      </pre>
    </div>
  );
}

function EndpointsCard() {
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
      <CardContent className="p-4 space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2 border border-dashed rounded-lg">
            <WebhookIcon className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No endpoints configured yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {webhooks.map((hook: Webhook) => (
              <div
                key={hook.id}
                className="flex items-start justify-between gap-2 p-3 border rounded-lg hover:border-foreground/20 transition-colors"
              >
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm font-mono truncate">{hook.url}</p>
                  <div className="flex flex-wrap gap-1">
                    {hook.events.map((ev) => (
                      <Badge key={ev} variant="secondary" className="text-xs font-mono">
                        {ev}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
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
          <Plus className="h-4 w-4" /> Add endpoint
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
                {createMutation.isPending ? "Creating…" : "Add Webhook"}
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
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
