import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchDashboard,
  deleteDashboardTileStandalone,
  refreshDashboardTileStandalone,
  regenerateDashboard,
  reorderStandaloneDashboardTiles,
} from "@/api/cloud";
import { TileGrid } from "./TileGrid";
import { DrillDownPanel } from "./DrillDownPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface DrillDownState {
  tileId: string;
  bucketKey: string;
  bucketValue: string;
  siftId: string;
}

export default function DashboardPage() {
  const { id: dashboardId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showEditSpec, setShowEditSpec] = useState(false);
  const [specDraft, setSpecDraft] = useState("");
  const [specError, setSpecError] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [deleteTileId, setDeleteTileId] = useState<string | null>(null);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["dashboard", dashboardId],
    queryFn: () => fetchDashboard(dashboardId!),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dashboard", dashboardId] });

  // Seed the draft from server spec whenever the dialog opens.
  useEffect(() => {
    if (showEditSpec) {
      setSpecDraft(dashboard?.spec ?? "");
      setSpecError(null);
    }
  }, [showEditSpec, dashboard?.spec]);

  const deleteTileMutation = useMutation({
    mutationFn: (tileId: string) => deleteDashboardTileStandalone(dashboardId!, tileId),
    onSuccess: () => {
      invalidate();
      setDeleteTileId(null);
    },
  });

  const refreshTileMutation = useMutation({
    mutationFn: (tileId: string) => refreshDashboardTileStandalone(dashboardId!, tileId),
    onSuccess: invalidate,
  });

  const reorderTilesMutation = useMutation({
    mutationFn: (tileIds: string[]) => reorderStandaloneDashboardTiles(dashboardId!, tileIds),
    // Optimistic: TileGrid already renders the new order locally. We only
    // invalidate on failure so the server's truth can snap us back.
    onError: invalidate,
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateDashboard(dashboardId!, specDraft.trim()),
    onSuccess: (result) => {
      invalidate();
      if (result.added === 0) {
        setSpecError("The agent did not produce any widgets — try rephrasing.");
        return;
      }
      setShowEditSpec(false);
      setSpecError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Regeneration failed";
      setSpecError(msg);
    },
  });

  const handleBucketClick = (tileId: string, bucketKey: string, bucketValue: string) => {
    const tile = dashboard?.tiles.find((t) => t.id === tileId);
    if (!tile) return;
    setDrillDown({ tileId, bucketKey, bucketValue, siftId: tile.sift_id });
  };

  if (isLoading) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-48" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="px-6 py-8 text-sm text-muted-foreground">Dashboard not found.</div>
    );
  }

  // Adapt tiles/snapshots to the shape TileGrid expects
  const tilesForGrid = dashboard.tiles.map((t) => ({
    id: t.id,
    kind: t.kind,
    title: t.title,
    pipeline: t.pipeline,
    chart_x: t.chart_x,
    chart_y: t.chart_y,
    position: 0,
    is_auto_generated: t.is_auto_generated,
    created_at: t.created_at,
  }));

  const snapshotsForGrid = Object.fromEntries(
    Object.entries(dashboard.snapshots ?? {}).map(([k, v]) => [
      k,
      { tile_id: v.tile_id, sift_id: v.sift_id, result: v.result, ran_at: v.ran_at },
    ])
  );

  const tileCount = tilesForGrid.length;
  const descriptionDiffers =
    dashboard.description &&
    dashboard.description.trim().toLowerCase() !== dashboard.name.trim().toLowerCase();

  return (
    <div className="relative min-h-full">
      {/* Atmospheric backdrop — subtle violet glow behind header */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] -z-10"
        style={{
          background:
            "radial-gradient(900px 320px at 30% -10%, hsl(263 72% 52% / 0.10), transparent 60%), radial-gradient(700px 240px at 85% -20%, hsl(40 92% 58% / 0.08), transparent 55%)",
        }}
        aria-hidden
      />

      <div className="px-6 py-10 max-w-6xl mx-auto space-y-8">
        {/* Back link — small, Swiss-style */}
        <button
          onClick={() => navigate("/dashboards")}
          className="group flex items-center gap-1.5 text-[11px] font-mono tracking-[0.14em] uppercase text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          All dashboards
        </button>

        {/* Editorial header */}
        <header className="flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-border/70">
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70">
              <span>Dashboard</span>
              <span className="h-px w-6 bg-border" aria-hidden />
              <span className="tabular-nums">
                {tileCount} {tileCount === 1 ? "widget" : "widgets"}
              </span>
            </div>
            <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em] text-foreground break-words">
              {dashboard.name}
            </h1>
            {descriptionDiffers && (
              <p className="text-sm text-muted-foreground/90 max-w-xl leading-relaxed">
                {dashboard.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => setShowEditSpec(true)}
              title="Edit the natural-language description — widgets regenerate from it"
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              {dashboard.spec ? "Edit spec" : "Write spec"}
            </Button>
          </div>
        </header>

      {/* Tiles or empty state */}
      {tilesForGrid.length === 0 ? (
        <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-card/40 py-20 px-6 flex flex-col items-center justify-center text-center">
          {/* Ghost tile grid backdrop */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 gap-3 p-6 opacity-[0.35]" aria-hidden>
            <div className="rounded-lg border border-border/70 bg-card" />
            <div className="rounded-lg border border-border/70 bg-card" />
            <div className="rounded-lg border border-border/70 bg-card" />
            <div className="col-span-2 rounded-lg border border-border/70 bg-card" />
            <div className="rounded-lg border border-border/70 bg-card" />
          </div>
          <div className="relative space-y-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <div className="space-y-1">
              <p className="text-lg font-semibold tracking-tight">A blank canvas</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Describe what matters most in your data — the agent will compose widgets from your words.
              </p>
            </div>
            <div className="flex gap-2 justify-center pt-1">
              <Button size="sm" onClick={() => setShowEditSpec(true)} className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Write your dashboard spec
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <TileGrid
          tiles={tilesForGrid}
          snapshots={snapshotsForGrid}
          onTileDelete={(id) => setDeleteTileId(id)}
          onTileRefresh={(id) => refreshTileMutation.mutate(id)}
          onBucketClick={handleBucketClick}
          onReorder={(ids) => reorderTilesMutation.mutate(ids)}
        />
      )}

      {/* Edit spec dialog — single source of truth for the dashboard */}
      <Dialog
        open={showEditSpec}
        onOpenChange={(open) => {
          setShowEditSpec(open);
          if (!open) setSpecError(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-primary/70 mb-1.5">
              Natural language
            </div>
            <DialogTitle className="text-xl tracking-tight">
              {dashboard.spec ? "Edit dashboard spec" : "Write dashboard spec"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              Describe what you want to see. The widgets are composed from this text — editing it regenerates the whole dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Your dashboard spec</Label>
              <Textarea
                rows={8}
                className="text-[14px] leading-relaxed resize-y min-h-[180px]"
                placeholder="e.g. Track monthly revenue by region, top 5 products by margin, and trend of new leads over the last 12 months."
                value={specDraft}
                onChange={(e) => setSpecDraft(e.target.value)}
                autoFocus
              />
              {dashboard.tiles.length > 0 && (
                <p className="text-[11px] text-amber-600/90 dark:text-amber-400/90 leading-relaxed pt-1">
                  Regenerating replaces all {dashboard.tiles.length} existing widget{dashboard.tiles.length === 1 ? "" : "s"}. Snapshots will be lost.
                </p>
              )}
            </div>
            {specError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {specError}
              </div>
            )}
            <Button
              className="w-full gap-2"
              disabled={!specDraft.trim() || regenerateMutation.isPending}
              onClick={() => { setSpecError(null); regenerateMutation.mutate(); }}
            >
              {regenerateMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 animate-spin" />Composing widgets…</>
              ) : (
                <><Sparkles className="h-4 w-4" />{dashboard.spec ? "Regenerate dashboard" : "Generate dashboard"}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drill-down side panel */}
      {drillDown && (
        <DrillDownPanel
          siftId={drillDown.siftId}
          tileId={drillDown.tileId}
          bucketKey={drillDown.bucketKey}
          bucketValue={drillDown.bucketValue}
          onClose={() => setDrillDown(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTileId}
        onOpenChange={(open) => { if (!open) setDeleteTileId(null); }}
        title="Delete tile?"
        description="This tile will be removed from the dashboard. You can always add it back later."
        confirmLabel="Delete tile"
        destructive
        loading={deleteTileMutation.isPending}
        onConfirm={() => deleteTileId && deleteTileMutation.mutate(deleteTileId)}
      />
      </div>
    </div>
  );
}
