import { RefreshCw, Trash2 } from "lucide-react";
import type { SiftDashboardTile, TileSnapshot } from "@/api/cloud";
import { KpiTile } from "./tiles/KpiTile";
import { TableTile } from "./tiles/TableTile";
import { BarChartTile } from "./tiles/BarChartTile";
import { LineChartTile } from "./tiles/LineChartTile";

interface TileGridProps {
  tiles: SiftDashboardTile[];
  snapshots: Record<string, TileSnapshot>;
  onTileDelete: (tileId: string) => void;
  onTileRefresh: (tileId: string) => void;
  onBucketClick: (tileId: string, bucketKey: string, bucketValue: string) => void;
}

function tileColSpan(kind: SiftDashboardTile["kind"]): string {
  switch (kind) {
    case "kpi": return "col-span-1";
    case "table": return "col-span-2 lg:col-span-3";
    case "bar_chart": return "col-span-1";
    case "line_chart": return "col-span-2";
    default: return "col-span-1";
  }
}

function tileMinHeight(kind: SiftDashboardTile["kind"]): string {
  switch (kind) {
    case "kpi": return "min-h-[140px]";
    case "table": return "min-h-[280px]";
    case "bar_chart": return "min-h-[220px]";
    case "line_chart": return "min-h-[220px]";
    default: return "min-h-[180px]";
  }
}

interface TileCardProps {
  tile: SiftDashboardTile;
  snapshot: TileSnapshot | undefined;
  onDelete: () => void;
  onRefresh: () => void;
  onBucketClick: (bucketKey: string, bucketValue: string) => void;
}

function TileCard({ tile, snapshot, onDelete, onRefresh, onBucketClick }: TileCardProps) {
  return (
    <div className={`bg-card border rounded-lg flex flex-col overflow-hidden ${tileMinHeight(tile.kind)}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <p className="text-xs font-semibold text-foreground truncate">{tile.title}</p>
        <div className="flex gap-1 shrink-0 ml-2">
          <button
            onClick={onRefresh}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
            title="Remove tile"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden p-3">
        {tile.kind === "kpi" && (
          <KpiTile title={tile.title} snapshot={snapshot} />
        )}
        {tile.kind === "table" && (
          <TableTile title={tile.title} snapshot={snapshot} />
        )}
        {tile.kind === "bar_chart" && (
          <BarChartTile
            title={tile.title}
            snapshot={snapshot}
            chartX={tile.chart_x}
            chartY={tile.chart_y}
            onBucketClick={onBucketClick}
          />
        )}
        {tile.kind === "line_chart" && (
          <LineChartTile
            title={tile.title}
            snapshot={snapshot}
            chartX={tile.chart_x}
            chartY={tile.chart_y}
          />
        )}
      </div>

      {/* Footer: snapshot age */}
      {snapshot?.ran_at && (
        <div className="px-3 pb-1.5 shrink-0">
          <p className="text-[10px] text-muted-foreground/60">
            Updated {new Date(snapshot.ran_at).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

export function TileGrid({
  tiles,
  snapshots,
  onTileDelete,
  onTileRefresh,
  onBucketClick,
}: TileGridProps) {
  const sorted = [...tiles].sort((a, b) => a.position - b.position);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((tile) => (
        <div key={tile.id} className={tileColSpan(tile.kind)}>
          <TileCard
            tile={tile}
            snapshot={snapshots[tile.id]}
            onDelete={() => onTileDelete(tile.id)}
            onRefresh={() => onTileRefresh(tile.id)}
            onBucketClick={(k, v) => onBucketClick(tile.id, k, v)}
          />
        </div>
      ))}
    </div>
  );
}
