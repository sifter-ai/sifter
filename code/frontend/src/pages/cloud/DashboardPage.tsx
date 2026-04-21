import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchDashboard,
  deleteDashboardTileStandalone,
  refreshDashboardTileStandalone,
  regenerateDashboard,
  updateDashboardLayout,
  updateDashboard,
  deleteDashboard,
} from "@/api/cloud";
import { TileGrid } from "./TileGrid";
import { DrillDownPanel } from "./DrillDownPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardSpecPanel } from "./DashboardSpecPanel";

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

  const [specError, setSpecError] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [deleteTileId, setDeleteTileId] = useState<string | null>(null);
  const [deleteDashboardOpen, setDeleteDashboardOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["dashboard", dashboardId],
    queryFn: () => fetchDashboard(dashboardId!),
    staleTime: 0,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dashboard", dashboardId] });

  useEffect(() => {
    if (renameOpen) {
      setNameDraft(dashboard?.name ?? "");
      setTimeout(() => nameInputRef.current?.select(), 50);
    }
  }, [renameOpen, dashboard?.name]);

  const deleteTileMutation = useMutation({
    mutationFn: (tileId: string) => deleteDashboardTileStandalone(dashboardId!, tileId),
    onSuccess: () => { invalidate(); setDeleteTileId(null); },
  });

  const refreshTileMutation = useMutation({
    mutationFn: (tileId: string) => refreshDashboardTileStandalone(dashboardId!, tileId),
    onSuccess: invalidate,
  });

  const layoutMutation = useMutation({
    mutationFn: (layouts: Array<{ tile_id: string; x: number; y: number; w: number; h: number }>) =>
      updateDashboardLayout(dashboardId!, layouts),
    onSuccess: (updated) => { qc.setQueryData(["dashboard", dashboardId], updated); },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateDashboard(dashboardId!, { name }),
    onSuccess: (updated) => {
      qc.setQueryData(["dashboard", dashboardId], updated);
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      setRenameOpen(false);
    },
  });

  const deleteDashboardMutation = useMutation({
    mutationFn: () => deleteDashboard(dashboardId!),
    onSuccess: () => navigate("/dashboards"),
  });

  const regenerateMutation = useMutation({
    mutationFn: (spec: string) => regenerateDashboard(dashboardId!, spec),
    onSuccess: (result) => {
      invalidate();
      setSpecError(null);
      if (result.added === 0) {
        setSpecError("The agent didn't produce any widgets — try rephrasing your spec.");
      }
    },
    onError: (err: unknown) => {
      setSpecError(err instanceof Error ? err.message : "Regeneration failed");
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
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Dashboard not found.</div>;
  }

  const tileCount = dashboard.tiles.length;
  const descriptionDiffers =
    dashboard.description &&
    dashboard.description.trim().toLowerCase() !== dashboard.name.trim().toLowerCase();

  return (
    <div className="relative flex h-full min-h-screen">
      {/* Atmospheric backdrop */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] -z-10"
        style={{
          background:
            "radial-gradient(900px 320px at 30% -10%, hsl(263 72% 52% / 0.10), transparent 60%), radial-gradient(700px 240px at 85% -20%, hsl(40 92% 58% / 0.08), transparent 55%)",
        }}
        aria-hidden
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-6 py-10 max-w-6xl mx-auto space-y-8">
          {/* Back link */}
          <button
            onClick={() => navigate("/dashboards")}
            className="group flex items-center gap-1.5 text-[11px] font-mono tracking-[0.14em] uppercase text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            All dashboards
          </button>

          {/* Header */}
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

            {/* Actions — same pattern as SiftDetailPage */}
            <div className="flex items-center gap-2 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" title="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteDashboardOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete dashboard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Tiles or empty state */}
          {tileCount === 0 ? (
            <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-card/40 py-20 px-6 flex flex-col items-center justify-center text-center">
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
                    Describe what you want to see in the spec panel — the agent will compose widgets from your data.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <TileGrid
              dashboardId={dashboardId!}
              tiles={dashboard.tiles}
              snapshots={dashboard.snapshots ?? {}}
              onTileDelete={(id) => setDeleteTileId(id)}
              onTileRefresh={(id) => refreshTileMutation.mutate(id)}
              onBucketClick={handleBucketClick}
              onLayoutChange={(layouts) => layoutMutation.mutate(layouts)}
            />
          )}
        </div>
      </div>

      {/* Spec sidebar */}
      <DashboardSpecPanel
        dashboard={dashboard}
        isRegenerating={regenerateMutation.isPending}
        onRegenerate={(spec) => { setSpecError(null); regenerateMutation.mutate(spec); }}
        regenerateError={specError}
      />

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

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nameDraft.trim()) renameMutation.mutate(nameDraft.trim());
                  if (e.key === "Escape") setRenameOpen(false);
                }}
                disabled={renameMutation.isPending}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!nameDraft.trim() || renameMutation.isPending}
                onClick={() => renameMutation.mutate(nameDraft.trim())}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete tile confirm */}
      <ConfirmDialog
        open={!!deleteTileId}
        onOpenChange={(open) => { if (!open) setDeleteTileId(null); }}
        title="Delete widget?"
        description="The widget will be removed from the dashboard."
        confirmLabel="Delete widget"
        destructive
        loading={deleteTileMutation.isPending}
        onConfirm={() => deleteTileId && deleteTileMutation.mutate(deleteTileId)}
      />

      {/* Delete dashboard confirm */}
      <ConfirmDialog
        open={deleteDashboardOpen}
        onOpenChange={setDeleteDashboardOpen}
        title="Delete dashboard?"
        description={`"${dashboard.name}" and all its widgets will be permanently deleted.`}
        confirmLabel="Delete dashboard"
        destructive
        loading={deleteDashboardMutation.isPending}
        onConfirm={() => deleteDashboardMutation.mutate()}
      />
    </div>
  );
}
