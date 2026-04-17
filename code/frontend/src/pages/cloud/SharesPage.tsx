import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Trash2 } from "lucide-react";
import { fetchShares, revokeShare, deleteShare, type Share } from "@/api/cloud";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const KIND_LABELS: Record<string, string> = {
  aggregation: "Aggregation",
  chat_message: "Chat",
  dashboard_view: "Dashboard",
};
const ACCESS_VARIANTS: Record<string, string> = {
  private_link: "secondary",
  org_only: "outline",
  password: "outline",
};

export default function SharesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["shares"], queryFn: fetchShares });

  const revokeMutation = useMutation({
    mutationFn: revokeShare,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteShare,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
  });

  const copyLink = (slug: string) =>
    navigator.clipboard.writeText(`${window.location.origin}/s/${slug}`);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const shares = data?.items ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Shares</h2>
      {shares.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No shares yet.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Title", "Kind", "Access", "Views", "Expires", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shares.map((s: Share) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{s.title}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="text-xs">{KIND_LABELS[s.kind] ?? s.kind}</Badge>
                  </td>
                  <td className="px-3 py-2 capitalize text-xs">{s.access.replace("_", " ")}</td>
                  <td className="px-3 py-2">{s.view_count}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => copyLink(s.slug)} title="Copy link">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(s.id)} title="Revoke">
                        <Link2 className="h-3.5 w-3.5 text-amber-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(s.id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
