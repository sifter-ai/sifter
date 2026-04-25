import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { createShare, type Share } from "@/api/cloud";
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

export function ShareDialog({ open, onOpenChange, title, kind, sourceId }: ShareDialogProps) {
  const [access, setAccess] = useState<Share["access"]>("private_link");
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("");
  const [share, setShare] = useState<Share | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = share ? `${window.location.origin}/s/${share.slug}` : "";

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    onSuccess: (s) => {
      setShare(s);
    },
  });

  const reset = () => { setShare(null); setPassword(""); setExpires(""); setCopied(false); };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
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
                <option value="private_link">Anyone with the link</option>
                <option value="password">Password protected</option>
              </select>
            </div>
            {access === "password" && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password…" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Expires (optional)</Label>
              <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
            <Button
              className="w-full"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || (access === "password" && !password)}
            >
              {createMutation.isPending ? "Creating…" : "Create link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
              <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                {copied ? "Link copied to clipboard" : "Link ready"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(shareUrl)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {access === "password" ? "Recipients will need the password to view." : "Anyone with this link can view."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
