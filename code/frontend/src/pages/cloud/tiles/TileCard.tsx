import { useState } from "react";
import {
  RefreshCw,
  Trash2,
  BarChart2,
  LineChart as LineIcon,
  Table2,
  Gauge,
  GripVertical,
  Info,
  ExternalLink,
  Code2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DashboardTile, DashboardSnapshot } from "@/api/cloud";
import { ShareBtn } from "@/components/cloud/ShareBtn";
import { KpiTile } from "./KpiTile";
import { TableTile } from "./TableTile";
import { BarChartTile } from "./BarChartTile";
import { LineChartTile } from "./LineChartTile";
import { formatRelative } from "@/lib/relativeTime";

export const KIND_META: Record<
  DashboardTile["kind"],
  { label: string; Icon: typeof Gauge; accent: string }
> = {
  kpi:        { label: "METRIC",    Icon: Gauge,     accent: "bg-primary" },
  bar_chart:  { label: "BREAKDOWN", Icon: BarChart2, accent: "bg-amber-500" },
  line_chart: { label: "TREND",     Icon: LineIcon,  accent: "bg-emerald-500" },
  table:      { label: "RECORDS",   Icon: Table2,    accent: "bg-sky-500" },
};

interface TileCardProps {
  tile: DashboardTile;
  snapshot: DashboardSnapshot | undefined;
  siftName?: string;
  onDelete: () => void;
  onRefresh: () => void;
  onShare?: () => void;
  onBucketClick: (bucketKey: string, bucketValue: string) => void;
}

export function TileCard({ tile, snapshot, siftName, onDelete, onRefresh, onShare, onBucketClick }: TileCardProps) {
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const meta = KIND_META[tile.kind] ?? KIND_META.kpi;
  const Icon = meta.Icon;

  const resultCount = snapshot?.result?.length ?? null;
  const ranAt = snapshot?.ran_at;

  const stopProp = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div className="group relative bg-card rounded-xl flex flex-col overflow-hidden ring-1 ring-border/80 shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_14px_-8px_rgba(70,30,120,0.12)] hover:ring-border hover:shadow-[0_1px_0_rgba(0,0,0,0.03),0_8px_24px_-10px_rgba(70,30,120,0.18)] transition-all duration-200 h-full">
      {/* Colored accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${meta.accent}`} aria-hidden />

      {/* Header — drag handle for react-grid-layout */}
      <div className="tile-drag-handle cursor-grab active:cursor-grabbing flex items-start justify-between px-5 pt-4 pb-3 shrink-0 gap-3 select-none">
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
          {tile.description && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-1 leading-relaxed">
              {tile.description}
            </p>
          )}
        </div>

        {/* Actions — stop propagation so clicks don't trigger drag */}
        <div
          className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 -mr-1 -mt-0.5"
          onPointerDown={stopProp}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mr-0.5" aria-hidden />

          {onShare && <ShareBtn onClick={onShare} size="sm" />}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 p-1.5 rounded-md transition-colors"
                title="Widget details"
                aria-label="Widget details"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {siftName && (
                <>
                  <div className="px-2 py-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-0.5">Source</p>
                    <a
                      href={`/sifts/${tile.sift_id}`}
                      className="text-xs font-medium text-foreground hover:text-primary flex items-center gap-1 truncate"
                    >
                      {siftName}
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              {ranAt && (
                <div className="px-2 py-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-0.5">Last updated</p>
                  <p className="text-xs text-foreground">
                    {new Date(ranAt).toLocaleString("en-US", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
              )}
              {resultCount !== null && (
                <div className="px-2 py-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-0.5">Rows</p>
                  <p className="text-xs text-foreground">{resultCount.toLocaleString("en-US")}</p>
                </div>
              )}
              {tile.is_auto_generated && (
                <div className="px-2 py-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-primary/70 bg-primary/8 rounded px-1.5 py-0.5">
                    AI generated
                  </span>
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-xs cursor-pointer"
                onClick={() => setPipelineOpen(true)}
              >
                <Code2 className="h-3.5 w-3.5" />
                View pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
            title="Remove widget"
            aria-label="Remove widget"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden px-5">
        {tile.kind === "kpi" && <KpiTile title={tile.title} snapshot={snapshot as Parameters<typeof KpiTile>[0]["snapshot"]} />}
        {tile.kind === "table" && <TableTile title={tile.title} snapshot={snapshot as Parameters<typeof TableTile>[0]["snapshot"]} />}
        {tile.kind === "bar_chart" && (
          <BarChartTile
            title={tile.title}
            snapshot={snapshot as Parameters<typeof BarChartTile>[0]["snapshot"]}
            chartX={tile.chart_x}
            chartY={tile.chart_y}
            onBucketClick={onBucketClick}
          />
        )}
        {tile.kind === "line_chart" && (
          <LineChartTile
            title={tile.title}
            snapshot={snapshot as Parameters<typeof LineChartTile>[0]["snapshot"]}
            chartX={tile.chart_x}
            chartY={tile.chart_y}
          />
        )}
      </div>

      {/* Footer */}
      {ranAt && (
        <div className="px-5 py-2.5 mt-2 shrink-0 border-t border-border/60 flex items-center gap-2 flex-wrap">
          <span className="h-1 w-1 rounded-full bg-emerald-500/80 shrink-0" aria-hidden />
          <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground/60 uppercase">
            {formatRelative(ranAt)}
          </span>
          {siftName && (
            <>
              <span className="text-muted-foreground/30 text-[10px]">·</span>
              <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground/50 truncate max-w-[120px]">
                {siftName}
              </span>
            </>
          )}
          {resultCount !== null && (
            <>
              <span className="text-muted-foreground/30 text-[10px]">·</span>
              <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground/50">
                {resultCount.toLocaleString("en-US")} rows
              </span>
            </>
          )}
        </div>
      )}

      {/* Pipeline viewer */}
      <Dialog open={pipelineOpen} onOpenChange={setPipelineOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-primary/70 mb-1.5">
              MongoDB pipeline
            </div>
            <DialogTitle className="text-base tracking-tight">{tile.title}</DialogTitle>
          </DialogHeader>
          <pre className="mt-3 text-xs bg-muted/60 rounded-lg p-4 overflow-x-auto leading-relaxed font-mono text-foreground/80 whitespace-pre-wrap break-all">
            {JSON.stringify(tile.pipeline, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
