import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchSiftDashboard,
  generateDashboard,
  addDashboardTile,
  deleteDashboardTile,
  refreshDashboardTile,
} from "@/api/cloud";
import { TileGrid } from "./TileGrid";
import { TileEditor } from "./TileEditor";
import { DrillDownPanel } from "./DrillDownPanel";

interface DrillDownState {
  tileId: string;
  bucketKey: string;
  bucketValue: string;
}

export default function DashboardPage() {
  const { id: siftId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showAddTile, setShowAddTile] = useState(false);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["sift-dashboard", siftId],
    queryFn: () => fetchSiftDashboard(siftId!),
    staleTime: 30_000,
  });

  const regenMutation = useMutation({
    mutationFn: () => generateDashboard(siftId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sift-dashboard", siftId] }),
  });

  const addTileMutation = useMutation({
    mutationFn: (tile: Parameters<typeof addDashboardTile>[1]) =>
      addDashboardTile(siftId!, tile),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sift-dashboard", siftId] });
      setShowAddTile(false);
    },
  });

  const deleteTileMutation = useMutation({
    mutationFn: (tileId: string) => deleteDashboardTile(siftId!, tileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sift-dashboard", siftId] }),
  });

  const refreshTileMutation = useMutation({
    mutationFn: (tileId: string) => refreshDashboardTile(siftId!, tileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sift-dashboard", siftId] }),
  });

  const handleBucketClick = (tileId: string, bucketKey: string, bucketValue: string) => {
    setDrillDown({ tileId, bucketKey, bucketValue });
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

  const tiles = dashboard?.tiles ?? [];
  const snapshots = dashboard?.snapshots ?? {};

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate(`/sifts/${siftId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight flex-1">Dashboard</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => regenMutation.mutate()}
          disabled={regenMutation.isPending}
          title="Regenerate tiles from current schema"
        >
          {regenMutation.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">Regenerate</span>
        </Button>
        <Button
          size="sm"
          onClick={() => setShowAddTile(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add tile
        </Button>
      </div>

      {/* Tiles or empty state */}
      {tiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
          <Sparkles className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-foreground">
              {regenMutation.isPending ? "Auto-generating…" : "No tiles yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Regenerate" to auto-generate tiles from your sift schema, or add a custom tile.
            </p>
          </div>
        </div>
      ) : (
        <TileGrid
          tiles={tiles}
          snapshots={snapshots}
          onTileDelete={(id) => deleteTileMutation.mutate(id)}
          onTileRefresh={(id) => refreshTileMutation.mutate(id)}
          onBucketClick={handleBucketClick}
        />
      )}

      {/* Add tile side panel */}
      {showAddTile && (
        <TileEditor
          onSubmit={(tile) => addTileMutation.mutate(tile)}
          onClose={() => setShowAddTile(false)}
          isPending={addTileMutation.isPending}
        />
      )}

      {/* Drill-down side panel */}
      {drillDown && (
        <DrillDownPanel
          siftId={siftId!}
          tileId={drillDown.tileId}
          bucketKey={drillDown.bucketKey}
          bucketValue={drillDown.bucketValue}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
