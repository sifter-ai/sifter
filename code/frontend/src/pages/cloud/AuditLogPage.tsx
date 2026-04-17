import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog, type AuditEvent } from "@/api/cloud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const ACTION_CATEGORIES = ["all", "billing", "sift", "user", "connector", "api_key"];

const CATEGORY_COLORS: Record<string, string> = {
  billing: "bg-blue-100 text-blue-800",
  sift: "bg-green-100 text-green-800",
  user: "bg-amber-100 text-amber-800",
  connector: "bg-purple-100 text-purple-800",
  api_key: "bg-gray-100 text-gray-800",
};

function ActionChip({ action }: { action: string }) {
  const cat = ACTION_CATEGORIES.find((c) => c !== "all" && action.startsWith(c)) ?? "";
  const cls = CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-medium ${cls}`}>
      {action}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [since, setSince] = useState("");
  const [search, setSearch] = useState("");
  const [allEvents, setAllEvents] = useState<AuditEvent[]>([]);

  const { data, isLoading, fetchStatus } = useQuery({
    queryKey: ["audit-log", actionFilter, since],
    queryFn: async () => {
      const result = await fetchAuditLog({
        action: actionFilter !== "all" ? actionFilter : undefined,
        since: since || undefined,
      });
      setAllEvents(result.items);
      return result;
    },
  });

  const filtered = useMemo(
    () =>
      allEvents.filter(
        (e) =>
          !search ||
          e.actor_id.toLowerCase().includes(search.toLowerCase()) ||
          e.target_id.toLowerCase().includes(search.toLowerCase())
      ),
    [allEvents, search]
  );

  const loadMore = () => {
    if (allEvents.length === 0) return;
    setSince(allEvents[allEvents.length - 1].created_at);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Audit Log</h2>

      <div className="flex flex-wrap gap-2">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          {ACTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c === "all" ? "All actions" : `${c}.*`}</option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        <Input
          placeholder="Search actor or target…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No audit events found.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Time", "Actor", "Action", "Target", "IP"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => (
                <tr key={ev.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap" title={ev.created_at}>
                    {timeAgo(ev.created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono max-w-[160px] truncate" title={ev.actor_id}>
                    {ev.actor_id}
                  </td>
                  <td className="px-3 py-2"><ActionChip action={ev.action} /></td>
                  <td className="px-3 py-2 text-xs font-mono max-w-[160px] truncate" title={ev.target_id}>
                    {ev.target_id}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono" title={ev.ip}>
                    {ev.ip?.slice(0, 15)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
          Load more
        </Button>
      )}
    </div>
  );
}
