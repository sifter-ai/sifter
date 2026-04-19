import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Loader2, Zap } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/cloud/TagInput";
import { PlanLimitError } from "@/lib/apiFetch";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Copy">
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
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
    mutationFn: () =>
      enableInbound(folderId, {
        allowed_senders: allowedSenders,
        allow_pdf_only: allowPdfOnly,
        max_attachment_size_mb: maxSizeMb,
      }),
    onSuccess: () => {
      setPlanError(null);
      qc.invalidateQueries({ queryKey: ["inbound-policy", folderId] });
    },
    onError: (err) => {
      if (err instanceof PlanLimitError) {
        setPlanError("Mail-to-upload is a Pro feature. Upgrade to enable it.");
      }
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => disableInbound(folderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbound-policy", folderId] }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateInboundPolicy(folderId, {
        allowed_senders: allowedSenders,
        allow_pdf_only: allowPdfOnly,
        max_attachment_size_mb: maxSizeMb,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbound-policy", folderId] }),
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

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

      {/* Toggle header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{enabled ? "Enabled" : "Disabled"}</p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? "This folder accepts email attachments."
              : "Enable to receive documents via email."}
          </p>
        </div>
        <Button
          size="sm"
          variant={enabled ? "outline" : "default"}
          className="h-7 gap-1.5 text-xs shrink-0"
          disabled={toggling}
          onClick={() => (enabled ? disableMutation.mutate() : enableMutation.mutate())}
        >
          {toggling && <Loader2 className="h-3 w-3 animate-spin" />}
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>

      {/* Inbound address */}
      {enabled && address && (
        <div className="rounded-lg bg-muted/60 border px-3 py-2 flex items-center gap-2">
          <span className="text-xs font-mono truncate flex-1 text-foreground/80">{address}</span>
          <CopyButton text={address} />
        </div>
      )}

      {/* Settings */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Allowed senders</Label>
          <TagInput
            value={allowedSenders}
            onChange={setAllowedSenders}
            placeholder="*@company.com — leave empty for org members only"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id={`pdf-only-${folderId}`}
            checked={allowPdfOnly}
            onChange={(e) => setAllowPdfOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor={`pdf-only-${folderId}`} className="cursor-pointer text-xs font-normal">
            Accept PDF attachments only
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Label className="text-xs whitespace-nowrap">Max size (MB)</Label>
          <Input
            type="number"
            value={maxSizeMb}
            onChange={(e) => setMaxSizeMb(Number(e.target.value))}
            min={1}
            max={50}
            className="w-20 h-7 text-xs"
          />
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Save settings
        </Button>
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent activity</p>
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
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-mono truncate max-w-[160px]">{ev.from_email}</td>
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                      {new Date(ev.received_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={ev.accepted ? "text-emerald-600" : "text-destructive"}>
                        {ev.accepted ? "✓ accepted" : "✗ rejected"}
                      </span>
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
