import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Check, Download } from "lucide-react";
import { createShare, sendShareEmail, downloadSharePdf, type Share } from "@/api/cloud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  kind: Share["kind"];
  sourceId: string;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <Input value={value} readOnly className="font-mono text-xs" />
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function ShareDialog({ open, onOpenChange, title, kind, sourceId }: ShareDialogProps) {
  const [access, setAccess] = useState<Share["access"]>("private_link");
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("");
  const [share, setShare] = useState<Share | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [showEmail, setShowEmail] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      createShare({
        title,
        kind,
        source_id: sourceId,
        access,
        password: access === "password" ? password : undefined,
        expires_at: expires || undefined,
      }),
    onSuccess: (s) => setShare(s),
  });

  const emailMutation = useMutation({
    mutationFn: () =>
      sendShareEmail(share!.id, {
        recipients: emailTo.split(",").map((e) => e.trim()).filter(Boolean),
        subject: `Shared: ${title}`,
      }),
    onSuccess: () => { setShowEmail(false); setEmailTo(""); },
  });

  const shareUrl = share ? `${window.location.origin}/s/${share.slug}` : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setShare(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share "{title}"</DialogTitle>
        </DialogHeader>
        {!share ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Access</Label>
              <select
                value={access}
                onChange={(e) => setAccess(e.target.value as Share["access"])}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="private_link">Private link (anyone with link)</option>
                <option value="org_only">Org members only</option>
                <option value="password">Password protected</option>
              </select>
            </div>
            {access === "password" && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Expires (optional)</Label>
              <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Share link</Label>
              <CopyField value={shareUrl} />
            </div>
            {!showEmail ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowEmail(true)}>Send email</Button>
                <Button variant="outline" size="sm" onClick={() => downloadSharePdf(share.id, title)}>
                  <Download className="h-4 w-4 mr-1" />PDF
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="recipient@example.com, another@example.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => emailMutation.mutate()} disabled={emailMutation.isPending}>
                    {emailMutation.isPending ? "Sending…" : "Send"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowEmail(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
