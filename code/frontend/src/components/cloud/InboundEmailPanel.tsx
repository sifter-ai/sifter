import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Loader2, Zap, Mail, ToggleLeft, ToggleRight } from "lucide-react";
import {
  fetchInboundPolicy,
  enableInbound,
  disableInbound,
  updateInboundPolicy,
  fetchInboundEvents,
  type InboundPolicyResponse,
} from "@/api/cloud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/cloud/TagInput";
import { PlanLimitError } from "@/lib/apiFetch";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs bg-background/80 border hover:bg-background hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function InboundEmailPanel({ folderId }: { folderId: string }) {
  const qc = useQueryClient();
  const [allowedSenders, setAllowedSenders] = useState<string[]>([]);
  const [allowPdfOnly, setAllowPdfOnly] = useState(true);
  const [maxSizeMb, setMaxSizeMb] = useState(25);
  const [planError, setPlanError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<InboundPolicyResponse | null>({
    queryKey: ["inbound-policy", folderId],
    queryFn: () => fetchInboundPolicy(folderId).catch(() => null),
  });

  const policy = data?.policy ?? null;
  const address = data?.inbound_address ?? null;
  const enabled = policy?.enabled ?? false;

  useEffect(() => {
    if (policy) {
      setAllowedSenders(policy.allowed_senders ?? []);
      setAllowPdfOnly(policy.allow_pdf_only ?? true);
      setMaxSizeMb(policy.max_attachment_size_mb ?? 25);
    }
  }, [policy?.enabled]);

  const { data: eventsData } = useQuery({
    queryKey: ["inbound-events", folderId],
    queryFn: () => fetchInboundEvents(folderId).catch(() => ({ events: [] })),
    enabled: !!enabled,
  });
  const events = eventsData?.events ?? [];

  const enableMutation = useMutation({
    mutationFn: () => enableInbound(folderId, {
      allowed_senders: allowedSenders,
      allow_pdf_only: allowPdfOnly,
      max_attachment_size_mb: maxSizeMb,
    }),
    onSuccess: () => { setPlanError(null); qc.invalidateQueries({ queryKey: ["inbound-policy", folderId] }); },
    onError: (err) => {
      if (err instanceof PlanLimitError) setPlanError("Mail-to-upload is a Pro feature. Upgrade to enable it.");
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => disableInbound(folderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbound-policy", folderId] }),
  });

  const saveMutation = useMutation({
    mutationFn: () => updateInboundPolicy(folderId, {
      allowed_senders: allowedSenders,
      allow_pdf_only: allowPdfOnly,
      max_attachment_size_mb: maxSizeMb,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbound-policy", folderId] }),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const toggling = enableMutation.isPending || disableMutation.isPending;

  return (
    <div className="space-y-5">
      {/* Plan error */}
      {planError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2.5">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="text-amber-800 dark:text-amber-300 font-medium">{planError}</p>
            <a href="/settings/billing" className="text-amber-600 hover:underline">View plans →</a>
          </div>
        </div>
      )}

      {/* Address block — focal point */}
      {enabled && address ? (
        <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <Mail className="h-3.5 w-3.5" />
            Inbound address — forward emails with attachments here
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono text-foreground/90 break-all flex-1">{address}</code>
            <CopyButton text={address} />
          </div>
        </div>
      ) : !enabled ? (
        <div className="rounded-lg border border-dashed px-4 py-5 text-center space-y-1">
          <Mail className="h-6 w-6 mx-auto text-muted-foreground/25 mb-2" />
          <p className="text-xs text-muted-foreground">Enable to get your unique inbound email address.</p>
        </div>
      ) : null}

      {/* Enable / Disable toggle */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{enabled ? "Enabled" : "Disabled"}</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? "This folder accepts incoming email attachments." : "No emails will be processed."}
          </p>
        </div>
        <button
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            enabled
              ? "text-emerald-600 hover:text-emerald-700"
              : "text-muted-foreground hover:text-foreground"
          }`}
          disabled={toggling}
          onClick={() => (enabled ? disableMutation.mutate() : enableMutation.mutate())}
        >
          {toggling
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : enabled
            ? <ToggleRight className="h-6 w-6" />
            : <ToggleLeft className="h-6 w-6" />}
          {enabled ? "Disable" : "Enable"}
        </button>
      </div>

      {/* Settings */}
      <div className="space-y-4 border-t pt-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Settings</p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Allowed senders</label>
          <TagInput
            value={allowedSenders}
            onChange={setAllowedSenders}
            placeholder="*@company.com — leave empty to allow anyone"
          />
          <p className="text-[11px] text-muted-foreground/70">
            Wildcard patterns like <code className="font-mono">*@acme.com</code> are supported. Leave empty to allow all.
          </p>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowPdfOnly}
              onChange={(e) => setAllowPdfOnly(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Accept PDF attachments only
          </label>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Max size</label>
            <Input
              type="number" min={1} max={50}
              value={maxSizeMb}
              onChange={(e) => setMaxSizeMb(Number(e.target.value))}
              className="w-20 h-7 text-xs"
            />
            <span className="text-xs text-muted-foreground">MB</span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm" variant="outline" className="h-7 text-xs gap-1.5"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Save settings
          </Button>
        </div>
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Recent activity</p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["From", "Received", "Status", "Reason"].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 10).map((ev, i) => (
                  <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 font-mono truncate max-w-[160px]">{ev.from_email}</td>
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                      {new Date(ev.received_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      {ev.accepted
                        ? <span className="text-emerald-600 font-medium">✓ accepted</span>
                        : <span className="text-destructive font-medium">✗ rejected</span>}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{ev.rejection_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
