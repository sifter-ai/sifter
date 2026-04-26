import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, RefreshCw, PanelRightClose, PanelRightOpen, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useSifts } from "@/hooks/useExtractions";
import type { StandaloneDashboard } from "@/api/cloud";

const STORAGE_KEY = "dashboard-spec-collapsed";

interface DashboardSpecPanelProps {
  dashboard: StandaloneDashboard;
  isRegenerating: boolean;
  onRegenerate: (spec: string) => void;
  regenerateError: string | null;
}

export function DashboardSpecPanel({
  dashboard,
  isRegenerating,
  onRegenerate,
  regenerateError,
}: DashboardSpecPanelProps) {
  const { data: siftsPage, isLoading: siftsLoading } = useSifts();
  const allSifts = siftsPage?.items ?? [];

  const usedSiftIds = useMemo(
    () => new Set(dashboard.tiles.map((t) => t.sift_id)),
    [dashboard.tiles],
  );

  const usedSifts = useMemo(
    () => allSifts.filter((s) => usedSiftIds.has(s.id)),
    [allSifts, usedSiftIds],
  );

  const tileCountBySift = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of dashboard.tiles) {
      counts[t.sift_id] = (counts[t.sift_id] ?? 0) + 1;
    }
    return counts;
  }, [dashboard.tiles]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === "1";
    } catch {}
    return typeof window !== "undefined" && window.innerWidth < 768;
  });
  const [draft, setDraft] = useState(dashboard.spec ?? "");

  useEffect(() => {
    setDraft(dashboard.spec ?? "");
  }, [dashboard.spec]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const isDirty = draft !== (dashboard.spec ?? "");
  const tileCount = dashboard.tiles.length;
  const hasTiles = tileCount > 0;

  return (
    <aside
      className={`shrink-0 flex flex-col border-l border-border/70 bg-card/60 transition-all duration-300 ${
        collapsed ? "w-10" : "w-80"
      }`}
      aria-label="Spec panel"
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-border/60 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary/70" />
            <span className="text-xs font-semibold tracking-tight text-foreground/80">Spec</span>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className="ml-auto text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 p-1.5 rounded-md transition-colors"
          title={collapsed ? "Expand spec" : "Collapse spec"}
          aria-label={collapsed ? "Expand spec" : "Collapse spec"}
        >
          {collapsed
            ? <PanelRightOpen className="h-4 w-4" />
            : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col flex-1 overflow-y-auto p-4 gap-4">
          <div className="space-y-2">
            <Textarea
              rows={10}
              className="text-[13px] leading-relaxed resize-none min-h-[180px] bg-background/60"
              placeholder="Describe what you want to see. The agent will build widgets from your instructions."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {hasTiles && isDirty && (
              <p className="text-[11px] text-amber-600/90 leading-relaxed">
                Regenerating will replace all {tileCount} existing widget{tileCount === 1 ? "" : "s"}.
              </p>
            )}
            {regenerateError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {regenerateError}
              </div>
            )}
          </div>

          <Button
            size="sm"
            className="w-full gap-2"
            disabled={!draft.trim() || isRegenerating}
            onClick={() => onRegenerate(draft.trim())}
          >
            {isRegenerating ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Composing widgets…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />{dashboard.spec ? "Regenerate dashboard" : "Generate dashboard"}</>
            )}
          </Button>

          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground/70 font-mono uppercase tracking-wider">Widgets</span>
              <span className="text-[11px] font-semibold tabular-nums">{tileCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground/70 font-mono uppercase tracking-wider">Created</span>
              <span className="text-[11px] tabular-nums text-muted-foreground/80">
                {new Date(dashboard.created_at).toLocaleDateString("en-US", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
            </div>
            {dashboard.updated_at && (
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground/70 font-mono uppercase tracking-wider">Updated</span>
                <span className="text-[11px] tabular-nums text-muted-foreground/80">
                  {new Date(dashboard.updated_at).toLocaleDateString("en-US", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Sifts used by tiles */}
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground/70 font-mono uppercase tracking-wider">Scope</span>
              {usedSifts.length > 0 && (
                <span className="text-[11px] font-semibold tabular-nums">{usedSifts.length}</span>
              )}
            </div>
            {siftsLoading ? (
              <div className="space-y-1">
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
            ) : usedSifts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/50 px-2">
                {tileCount === 0 ? "No widgets yet" : "Loading sifts…"}
              </p>
            ) : (
              <div className="space-y-0.5">
                {usedSifts.map((sift) => (
                  <Link
                    key={sift.id}
                    to={`/sifts/${sift.id}`}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" strokeWidth={1.75} />
                    <span className="truncate flex-1 text-[12px]">{sift.name}</span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 shrink-0">
                      {tileCountBySift[sift.id]}w
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
