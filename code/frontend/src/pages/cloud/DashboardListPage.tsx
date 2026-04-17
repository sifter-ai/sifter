import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fetchDashboards, createDashboard, deleteDashboard, type StandaloneDashboard } from "@/api/cloud";

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center space-y-5">
      {/* Ghost canvas illustration */}
      <div className="relative w-40 h-28">
        <svg viewBox="0 0 160 112" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Grid lines */}
          <rect x="4" y="4" width="152" height="104" rx="6" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" strokeDasharray="4 3" className="text-foreground" />
          {/* Ghost tiles */}
          <rect x="14" y="14" width="40" height="30" rx="3" fill="currentColor" fillOpacity="0.06" className="text-primary" />
          <rect x="60" y="14" width="40" height="30" rx="3" fill="currentColor" fillOpacity="0.06" className="text-primary" />
          <rect x="106" y="14" width="40" height="30" rx="3" fill="currentColor" fillOpacity="0.06" className="text-primary" />
          <rect x="14" y="52" width="86" height="48" rx="3" fill="currentColor" fillOpacity="0.06" className="text-primary" />
          <rect x="106" y="52" width="40" height="48" rx="3" fill="currentColor" fillOpacity="0.06" className="text-primary" />
          {/* Bar chart ghost */}
          <rect x="22" y="72" width="6" height="20" rx="1" fill="currentColor" fillOpacity="0.14" className="text-primary" />
          <rect x="31" y="64" width="6" height="28" rx="1" fill="currentColor" fillOpacity="0.14" className="text-primary" />
          <rect x="40" y="68" width="6" height="24" rx="1" fill="currentColor" fillOpacity="0.14" className="text-primary" />
          <rect x="49" y="60" width="6" height="32" rx="1" fill="currentColor" fillOpacity="0.14" className="text-primary" />
          <rect x="58" y="74" width="6" height="18" rx="1" fill="currentColor" fillOpacity="0.14" className="text-primary" />
          {/* KPI value ghost */}
          <rect x="20" y="30" width="28" height="8" rx="2" fill="currentColor" fillOpacity="0.10" className="text-muted-foreground" />
          <rect x="66" y="30" width="22" height="8" rx="2" fill="currentColor" fillOpacity="0.10" className="text-muted-foreground" />
          <rect x="112" y="30" width="28" height="8" rx="2" fill="currentColor" fillOpacity="0.10" className="text-muted-foreground" />
        </svg>
      </div>

      <div className="space-y-1.5 max-w-xs">
        <h2 className="text-base font-semibold tracking-tight">No dashboards yet</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Create a dashboard to visualize data across your sifts — charts, KPIs, tables, all in one view.
        </p>
      </div>

      <Button onClick={onCreate} className="gap-2">
        <Plus className="h-4 w-4" />
        New dashboard
      </Button>
    </div>
  );
}

const KIND_COLOR: Record<string, string> = {
  kpi: "hsl(263 72% 58%)",          // violet (primary)
  bar_chart: "hsl(40 92% 58%)",     // amber
  line_chart: "hsl(158 64% 48%)",   // emerald
  table: "hsl(200 85% 55%)",        // sky
};

function TileGlyph({ kind, w = 40, h = 28 }: { kind: string; w?: number; h?: number }) {
  const color = KIND_COLOR[kind] ?? "hsl(263 72% 58%)";
  // Inner area with 4px padding
  const pad = 4;
  const iw = w - pad * 2;
  const ih = h - pad * 2;

  return (
    <g transform={`translate(${pad}, ${pad})`}>
      {/* Tile background */}
      <rect
        x={-pad}
        y={-pad}
        width={w}
        height={h}
        rx={3}
        fill={color}
        fillOpacity={0.06}
      />
      {/* Left accent strip (echoes real tile kind-accent) */}
      <rect x={-pad} y={-pad} width={1.5} height={h} fill={color} fillOpacity={0.85} />

      {kind === "kpi" && (
        <>
          <rect x={2} y={ih * 0.28} width={iw * 0.55} height={4.5} rx={1} fill={color} fillOpacity={0.9} />
          <rect x={2} y={ih * 0.28 + 7} width={iw * 0.35} height={2} rx={1} fill={color} fillOpacity={0.35} />
        </>
      )}
      {kind === "bar_chart" && (
        <g>
          {[0.55, 0.8, 0.45, 0.9, 0.65].map((bh, i) => (
            <rect
              key={i}
              x={2 + i * (iw / 6)}
              y={ih - ih * bh}
              width={iw / 6 - 2}
              height={ih * bh}
              rx={0.8}
              fill={color}
              fillOpacity={0.7}
            />
          ))}
        </g>
      )}
      {kind === "line_chart" && (
        <g>
          <path
            d={`M 2 ${ih * 0.7} L ${iw * 0.25} ${ih * 0.55} L ${iw * 0.5} ${ih * 0.65} L ${iw * 0.75} ${ih * 0.3} L ${iw} ${ih * 0.4}`}
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d={`M 2 ${ih * 0.7} L ${iw * 0.25} ${ih * 0.55} L ${iw * 0.5} ${ih * 0.65} L ${iw * 0.75} ${ih * 0.3} L ${iw} ${ih * 0.4} L ${iw} ${ih} L 2 ${ih} Z`}
            fill={color}
            fillOpacity={0.12}
          />
        </g>
      )}
      {kind === "table" && (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={2}
              y={i * 5 + 2}
              width={iw - 4}
              height={1.5}
              rx={0.5}
              fill={color}
              fillOpacity={i === 0 ? 0.9 : 0.35}
            />
          ))}
        </g>
      )}
    </g>
  );
}

function DashboardPreview({ tiles }: { tiles: { kind: string }[] }) {
  const W = 224;
  const H = 100;
  const shown = tiles.slice(0, 6);
  const kinds = shown.map((t) => t.kind);

  // Two-row layout inspired by the real grid: top row 3 slots, bottom row 2-3 slots.
  const rowTop = kinds.slice(0, 3);
  const rowBot = kinds.slice(3, 6);
  const gap = 6;
  const rowPadX = 8;
  const rowPadY = 8;
  const rowHeight = (H - rowPadY * 2 - gap) / 2;

  const renderRow = (row: string[], y: number) => {
    if (row.length === 0) return null;
    const total = W - rowPadX * 2 - gap * (row.length - 1);
    const tileW = total / row.length;
    return row.map((kind, i) => (
      <g key={`${y}-${i}`} transform={`translate(${rowPadX + i * (tileW + gap)}, ${y})`}>
        <TileGlyph kind={kind} w={tileW} h={rowHeight} />
      </g>
    ));
  };

  if (shown.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" aria-hidden>
        <rect
          x={4} y={4} width={W - 8} height={H - 8}
          rx={6}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.14}
          strokeWidth={1.25}
          strokeDasharray="4 3"
          className="text-foreground"
        />
        <text x={W / 2} y={H / 2 + 3} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.4} fontFamily="var(--font-mono)" letterSpacing={1}>
          EMPTY
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" aria-hidden>
      {renderRow(rowTop, rowPadY)}
      {renderRow(rowBot, rowPadY + rowHeight + gap)}
    </svg>
  );
}

function DashboardCard({
  dashboard,
  onDelete,
}: {
  dashboard: StandaloneDashboard;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const tiles = dashboard.tiles ?? [];
  const tileCount = tiles.length;
  const siftIds = [...new Set(tiles.map((t) => t.sift_id))];

  return (
    <div
      className="group relative rounded-xl bg-card ring-1 ring-border/80 overflow-hidden cursor-pointer transition-all duration-200 hover:ring-primary/40 hover:shadow-[0_12px_30px_-12px_rgba(70,30,120,0.25)] hover:-translate-y-0.5"
      onClick={() => navigate(`/dashboards/${dashboard._id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/dashboards/${dashboard._id}`)}
    >
      {/* Preview canvas — reflects actual tile kinds */}
      <div className="relative h-28 bg-gradient-to-br from-primary/[0.04] via-muted/30 to-amber-500/[0.04] border-b border-border/60">
        <DashboardPreview tiles={tiles} />
        {/* Dot-grid overlay for texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: "radial-gradient(hsl(var(--border)) 0.8px, transparent 0.8px)",
            backgroundSize: "10px 10px",
          }}
          aria-hidden
        />
      </div>

      {/* Content */}
      <div className="p-5 space-y-2.5">
        <h3 className="font-semibold text-[15px] leading-snug tracking-tight group-hover:text-primary transition-colors truncate">
          {dashboard.name}
        </h3>

        {dashboard.spec && dashboard.spec.trim().length > 0 ? (
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/70 italic line-clamp-3 tracking-[0.01em]">
            &ldquo;{dashboard.spec}&rdquo;
          </p>
        ) : dashboard.description && dashboard.description.trim().toLowerCase() !== dashboard.name.trim().toLowerCase() ? (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {dashboard.description}
          </p>
        ) : null}

        <div className="flex items-center gap-2 pt-1.5 mt-0.5 border-t border-border/40 font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground/70">
          <span className="tabular-nums">
            {tileCount} {tileCount === 1 ? "tile" : "tiles"}
          </span>
          {siftIds.length > 0 && (
            <>
              <span className="h-px w-3 bg-border" aria-hidden />
              <span className="tabular-nums">
                {siftIds.length} {siftIds.length === 1 ? "sift" : "sifts"}
              </span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/80 hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-md bg-background/70 backdrop-blur-sm"
        title="Delete"
        aria-label="Delete dashboard"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function DashboardListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StandaloneDashboard | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboards"],
    queryFn: fetchDashboards,
  });

  const createMutation = useMutation({
    mutationFn: () => createDashboard({ name: name.trim(), spec: spec.trim() }),
    onSuccess: (dashboard) => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      setShowCreate(false);
      setName("");
      setSpec("");
      setCreateError(null);
      navigate(`/dashboards/${dashboard._id}`);
    },
    onError: (err: Error) => {
      setCreateError(err.message || "Failed to create dashboard");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      setDeleteTarget(null);
    },
  });

  const dashboards = data?.items ?? [];

  return (
    <div className="relative min-h-full">
      {/* Atmospheric backdrop */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px] -z-10"
        style={{
          background:
            "radial-gradient(900px 280px at 25% -10%, hsl(263 72% 52% / 0.10), transparent 60%), radial-gradient(700px 220px at 85% -20%, hsl(40 92% 58% / 0.07), transparent 55%)",
        }}
        aria-hidden
      />
      <div className="px-6 py-10 max-w-6xl mx-auto space-y-8">
        {/* Editorial header */}
        <header className="flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-border/70">
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70">
              <LayoutDashboard className="h-3 w-3 text-primary/80" strokeWidth={2.25} />
              <span>Workspace</span>
              <span className="h-px w-6 bg-border" aria-hidden />
              <span className="tabular-nums">
                {dashboards.length} {dashboards.length === 1 ? "board" : "boards"}
              </span>
            </div>
            <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em] text-foreground">
              Dashboards
            </h1>
            <p className="text-sm text-muted-foreground/90 max-w-xl leading-relaxed">
              Compose views across your sifts — KPIs, trends, breakdowns and tables, side by side.
            </p>
          </div>
          {dashboards.length > 0 && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" />
              New dashboard
            </Button>
          )}
        </header>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : dashboards.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {dashboards.map((d) => (
            <DashboardCard
              key={d._id}
              dashboard={d}
              onDelete={() => setDeleteTarget(d)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setCreateError(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-primary/70 mb-1.5">
              Natural language
            </div>
            <DialogTitle className="text-xl tracking-tight">New dashboard</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Describe what you want to see. We&rsquo;ll compose the widgets for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                placeholder="e.g. Sales overview"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Describe your dashboard
                <span className="text-muted-foreground text-xs ml-1">(natural language)</span>
              </Label>
              <Textarea
                rows={7}
                className="text-[14px] leading-relaxed resize-y min-h-[160px]"
                placeholder={
                  "e.g. Track monthly revenue by region, top 5 products by margin, and trend of new leads over the last 12 months."
                }
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed pt-1">
                The agent will design a set of widgets (KPIs, breakdowns, trends, tables) based on your description. You can always edit the spec later.
              </p>
            </div>
            {createError && (
              <div className="text-[12px] leading-relaxed text-destructive bg-destructive/10 border border-destructive/25 rounded-md px-3 py-2">
                {createError}
              </div>
            )}
            <Button
              className="w-full"
              disabled={!name.trim() || !spec.trim() || createMutation.isPending}
              onClick={() => {
                setCreateError(null);
                createMutation.mutate();
              }}
            >
              {createMutation.isPending ? "Composing widgets…" : "Create & generate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete dashboard?"
        description={
          deleteTarget ? (
            <>
              This will permanently remove <strong>{deleteTarget.name}</strong> and all its tiles.
              This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete dashboard"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
      />
      </div>
    </div>
  );
}
