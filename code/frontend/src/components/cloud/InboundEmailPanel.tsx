import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";
import {
  fetchInboundPolicy,
  enableInbound,
  disableInbound,
  updateInboundPolicy,
  fetchInboundEvents,
  type InboundPolicy,
  type InboundEvent,
} from "@/api/cloud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/cloud/TagInput";

interface InboundEmailPanelProps {
  folderId: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors" title="Copy">
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export function InboundEmailPanel({ folderId }: InboundEmailPanelProps) {
  const qc = useQueryClient();
  const [allowedSenders, setAllowedSenders] = useState<string[]>([]);
  const [allowPdfOnly, setAllowPdfOnly] = useState(true);
  const [maxSizeMb, setMaxSizeMb] = useState(10);

  const { data: policy, isLoading } = useQuery<InboundPolicy | null>({
    queryKey: ["inbound-policy", folderId],
    queryFn: () =>
      fetchInboundPolicy(folderId).catch((e: Error) => {
        if (e.message?.includes("404")) return null;
        throw e;
      }),
  });

  useEffect(() => {
    if (policy) {
      setAllowedSenders(policy.allowed_senders);
      setAllowPdfOnly(policy.allow_pdf_only);
      setMaxSizeMb(policy.max_attachment_size_mb);
    }
  }, [policy?.address]);

  const { data: events } = useQuery<InboundEvent[]>({
    queryKey: ["inbound-events", folderId],
    queryFn: () => fetchInboundEvents(folderId).catch(() => []),
    enabled: !!policy?.enabled,
  });

  const enableMutation = useMutation({
    mutationFn: () => enableInbound(folderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbound-policy", folderId] }),
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

  const enabled = policy?.enabled ?? false;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Inbound Email</p>
          <p className="text-sm text-muted-foreground">
            Send PDF attachments directly to this folder via email.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => (enabled ? disableMutation.mutate() : enableMutation.mutate())}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>

      {enabled && policy?.address && (
        <div className="rounded-md bg-muted px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-sm font-mono truncate">{policy.address}</span>
          <CopyButton text={policy.address} />
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Allowed senders</Label>
          <TagInput
            value={allowedSenders}
            onChange={setAllowedSenders}
            placeholder="*@company.com — leave empty for org members only"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="pdf-only"
            checked={allowPdfOnly}
            onChange={(e) => setAllowPdfOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="pdf-only" className="cursor-pointer">Accept PDF attachments only</Label>
        </div>

        <div className="space-y-1.5">
          <Label>Max attachment size (MB)</Label>
          <Input
            type="number"
            value={maxSizeMb}
            onChange={(e) => setMaxSizeMb(Number(e.target.value))}
            min={1}
            max={50}
            className="w-24"
          />
        </div>

        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      {events && events.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent events</p>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["From", "Received", "Accepted", "Reason"].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 10).map((ev, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{ev.from_email}</td>
                    <td className="px-3 py-1.5">{new Date(ev.received_at).toLocaleString()}</td>
                    <td className="px-3 py-1.5">{ev.accepted ? "✓" : "✗"}</td>
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
