import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import {
  ResponsiveGridLayout,
  verticalCompactor,
  useContainerWidth,
} from "react-grid-layout";
import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useQuery } from "@tanstack/react-query";
import type { DashboardTile, DashboardSnapshot } from "@/api/cloud";
import { fetchSifts } from "@/api/extractions";
import { TileCard } from "./tiles/TileCard";
import { deriveLgLayout, deriveBreakpointLayout } from "./tiles/layoutDefaults";

interface TileGridProps {
  dashboardId: string;
  tiles: DashboardTile[];
  snapshots: Record<string, DashboardSnapshot>;
  onTileDelete: (tileId: string) => void;
  onTileRefresh: (tileId: string) => void;
  onTileShare?: (tileId: string, tileTitle: string) => void;
  onBucketClick: (tileId: string, bucketKey: string, bucketValue: string) => void;
  onLayoutChange?: (layouts: Array<{ tile_id: string; x: number; y: number; w: number; h: number }>) => void;
}

function buildLayouts(tiles: DashboardTile[]): ResponsiveLayouts {
  return {
    lg: deriveLgLayout(tiles) as LayoutItem[],
    md: deriveBreakpointLayout(tiles, 8) as LayoutItem[],
    sm: deriveBreakpointLayout(tiles, 4) as LayoutItem[],
  };
}

export function TileGrid({
  dashboardId: _dashboardId,
  tiles,
  snapshots,
  onTileDelete,
  onTileRefresh,
  onTileShare,
  onBucketClick,
  onLayoutChange,
}: TileGridProps) {
  const { data: siftsData } = useQuery({
    queryKey: ["sifts"],
    queryFn: () => fetchSifts(100),
    staleTime: 60_000,
  });

  const siftNames: Record<string, string> = {};
  for (const s of siftsData?.items ?? []) {
    siftNames[s.id] = s.name;
  }

  const tileIds = tiles.map((t) => t.id).join(",");

  // Track which tile set the current localLayouts was built for.
  // When tileIds changes (add/remove/regenerate), reset layouts immediately
  // during render — avoids the one-render gap that useEffect would cause.
  const [trackedTileIds, setTrackedTileIds] = useState(tileIds);
  const [localLayouts, setLocalLayouts] = useState<ResponsiveLayouts>(() => buildLayouts(tiles));

  if (trackedTileIds !== tileIds) {
    setTrackedTileIds(tileIds);
    setLocalLayouts(buildLayouts(tiles));
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLayoutChange = useCallback(
    (currentLayout: Layout, allLayouts: ResponsiveLayouts) => {
      setLocalLayouts(allLayouts);
      if (!onLayoutChange) return;
      const lgLayout = (allLayouts["lg"] ?? []) as LayoutItem[];
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onLayoutChange(lgLayout.map((item) => ({
          tile_id: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        })));
      }, 600);
    },
    [onLayoutChange]
  );

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const { width, containerRef } = useContainerWidth({ initialWidth: 1280 });
  const typedRef = containerRef as React.RefObject<HTMLDivElement>;

  if (tiles.length === 0) return null;

  return (
    <div ref={typedRef} className="rgl-wrapper -mx-1">
      <ResponsiveGridLayout
        width={width}
        layouts={localLayouts}
        breakpoints={{ lg: 960, md: 640, sm: 0 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={60}
        margin={[16, 16]}
        dragConfig={{ handle: ".tile-drag-handle" }}
        resizeConfig={{ handles: ["se"] }}
        compactor={verticalCompactor}
        onLayoutChange={handleLayoutChange}
        className="layout"
      >
        {tiles.map((tile, i) => (
          <div
            key={tile.id}
            className="animate-tile-in"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <TileCard
              tile={tile}
              snapshot={snapshots[tile.id]}
              siftName={siftNames[tile.sift_id]}
              onDelete={() => onTileDelete(tile.id)}
              onRefresh={() => onTileRefresh(tile.id)}
              onShare={onTileShare ? () => onTileShare(tile.id, tile.title) : undefined}
              onBucketClick={(k, v) => onBucketClick(tile.id, k, v)}
            />
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
