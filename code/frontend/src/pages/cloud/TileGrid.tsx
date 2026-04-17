import { useEffect, useState } from "react";
import { RefreshCw, Trash2, BarChart2, LineChart as LineIcon, Table2, Gauge, GripVertical } from "lucide-react";
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
  onReorder?: (orderedTileIds: string[]) => void;
}

function tileColSpan(kind: SiftDashboardTile["kind"]): string {
  switch (kind) {
    case "kpi": return "col-span-1";
    case "table": return "col-span-2 lg:col-span-3";
    case "bar_chart": return "col-span-1 lg:col-span-2";
    case "line_chart": return "col-span-2 lg:col-span-3";
    default: return "col-span-1";
  }
}

function tileMinHeight(kind: SiftDashboardTile["kind"]): string {
  switch (kind) {
    case "kpi": return "min-h-[200px]";
    case "table": return "min-h-[320px]";
    case "bar_chart": return "min-h-[280px]";
    case "line_chart": return "min-h-[280px]";
    default: return "min-h-[200px]";
  }
}

const KIND_META: Record<SiftDashboardTile["kind"], { label: string; Icon: typeof Gauge; accent: string }> = {
  kpi:        { label: "METRIC",   Icon: Gauge,     accent: "bg-primary" },
  bar_chart:  { label: "BREAKDOWN",Icon: BarChart2, accent: "bg-amber-500" },
  line_chart: { label: "TREND",    Icon: LineIcon,  accent: "bg-emerald-500" },
  table:      { label: "RECORDS",  Icon: Table2,    accent: "bg-sky-500" },
};

interface TileCardProps {
  tile: SiftDashboardTile;
  snapshot: TileSnapshot | undefined;
  onDelete: () => void;
  onRefresh: () => void;
  onBucketClick: (bucketKey: string, bucketValue: string) => void;
  // drag-and-drop
  draggable: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

function TileCard({
  tile,
  snapshot,
  onDelete,
  onRefresh,
  onBucketClick,
  draggable,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDrop,
}: TileCardProps) {
  const meta = KIND_META[tile.kind] ?? KIND_META.kpi;
  const Icon = meta.Icon;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative bg-card rounded-xl flex flex-col overflow-hidden ring-1 ring-border/80 shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_14px_-8px_rgba(70,30,120,0.12)] hover:ring-border hover:shadow-[0_1px_0_rgba(0,0,0,0.03),0_8px_24px_-10px_rgba(70,30,120,0.18)] transition-all duration-200 ${tileMinHeight(tile.kind)} ${
        isDragging ? "opacity-40 scale-[0.98]" : ""
      } ${isDropTarget ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-background" : ""}`}
    >
      {/* Colored accent strip — signals tile kind */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${meta.accent}`} aria-hidden />

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0 gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon className="h-3 w-3 text-muted-foreground/70" strokeWidth={2.25} />
            <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground/70 uppercase">
              {meta.label}
            </span>
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground leading-snug truncate">
            {tile.title}
          </h3>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 -mr-1 -mt-0.5">
          {draggable && (
            <span
              className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 p-1.5 rounded-md transition-colors"
              title="Drag to reorder"
              aria-label="Drag handle"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          <button
            onClick={onRefresh}
            className="text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 p-1.5 rounded-md transition-colors"
            title="Refresh"
            aria-label="Refresh tile"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors"
            title="Remove tile"
            aria-label="Remove tile"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden px-5">
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

      {/* Footer */}
      {snapshot?.ran_at && (
        <div className="px-5 py-2.5 mt-2 shrink-0 border-t border-border/60 flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-emerald-500/80 shrink-0" aria-hidden />
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground/60 uppercase">
            Live · {new Date(snapshot.ran_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
  onReorder,
}: TileGridProps) {
  // Local working order — lets us reorder optimistically while the server round-trips.
  // Re-sync only when the SET of tile ids changes (add/remove). Pure reorders from
  // the server are assumed to agree with our local order, so we keep what we have.
  const [order, setOrder] = useState<string[]>(() => tiles.map((t) => t.id));
  useEffect(() => {
    const propIds = tiles.map((t) => t.id);
    const propSet = new Set(propIds);
    setOrder((prev) => {
      const prevSet = new Set(prev);
      const added = propIds.filter((id) => !prevSet.has(id));
      const filtered = prev.filter((id) => propSet.has(id));
      if (added.length === 0 && filtered.length === prev.length) return prev;
      return [...filtered, ...added];
    });
  }, [tiles]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const tileById = new Map(tiles.map((t) => [t.id, t]));
  const orderedTiles = order
    .map((id) => tileById.get(id))
    .filter((t): t is SiftDashboardTile => !!t);

  const canDrag = !!onReorder && orderedTiles.length > 1;

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  const handleDragEnter = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setDropTargetId(targetId);
    // Optimistic: splice-move the dragging tile into the target's slot.
    setOrder((prev) => {
      const next = prev.filter((x) => x !== draggingId);
      const targetIdx = next.indexOf(targetId);
      if (targetIdx < 0) return prev;
      next.splice(targetIdx, 0, draggingId);
      return next;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    // Required to allow dropping.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = () => {
    if (!draggingId || !onReorder) {
      handleDragEnd();
      return;
    }
    const finalOrder = [...order];
    handleDragEnd();
    onReorder(finalOrder);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
      {orderedTiles.map((tile, i) => (
        <div
          key={tile.id}
          className={`${tileColSpan(tile.kind)} animate-tile-in`}
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
        >
          <TileCard
            tile={tile}
            snapshot={snapshots[tile.id]}
            onDelete={() => onTileDelete(tile.id)}
            onRefresh={() => onTileRefresh(tile.id)}
            onBucketClick={(k, v) => onBucketClick(tile.id, k, v)}
            draggable={canDrag}
            isDragging={draggingId === tile.id}
            isDropTarget={dropTargetId === tile.id && draggingId !== tile.id}
            onDragStart={() => handleDragStart(tile.id)}
            onDragEnd={handleDragEnd}
            onDragEnter={() => handleDragEnter(tile.id)}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        </div>
      ))}
    </div>
  );
}
