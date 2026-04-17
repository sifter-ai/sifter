import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, X, Edit2 } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GridLayout = require("react-grid-layout").default;
type Layout = { i: string; x: number; y: number; w: number; h: number };
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  fetchDashboard,
  updateDashboard,
  createWidget,
  updateWidget,
  deleteWidget,
  refreshWidget,
  type Dashboard,
  type DashboardWidget,
} from "@/api/cloud";
import { fetchSifts } from "@/api/extractions";
import { BlockRenderer } from "@/components/cloud/BlockRenderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function AddWidgetPanel({
  dashboardId,
  siftIds,
  onClose,
}: {
  dashboardId: string;
  siftIds: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: sifts = [] } = useQuery({ queryKey: ["sifts"], queryFn: fetchSifts });
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"big_number" | "table" | "chart">("big_number");
  const [siftId, setSiftId] = useState(siftIds[0] ?? "");
  const [pipeline, setPipeline] = useState("[]");
  const [pipelineError, setPipelineError] = useState("");

  const createMutation = useMutation({
    mutationFn: () => {
      let parsed: any[];
      try { parsed = JSON.parse(pipeline); } catch { throw new Error("Invalid JSON pipeline"); }
      return createWidget({
        title,
        kind,
        sift_id: siftId,
        dashboard_id: dashboardId,
        pipeline: parsed,
        layout: { x: 0, y: 0, w: 6, h: 4 },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", dashboardId] });
      onClose();
    },
    onError: (e: Error) => setPipelineError(e.message),
  });

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-background border-l shadow-lg p-5 space-y-4 overflow-y-auto z-50">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Add Widget</h3>
        <button onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" />
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="big_number">Big Number</option>
            <option value="table">Table</option>
            <option value="chart">Chart</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Sift</Label>
          <select
            value={siftId}
            onChange={(e) => setSiftId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {(sifts as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Pipeline (JSON)</Label>
          <textarea
            value={pipeline}
            onChange={(e) => { setPipeline(e.target.value); setPipelineError(""); }}
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {pipelineError && <p className="text-xs text-destructive">{pipelineError}</p>}
        </div>
        <Button
          className="w-full"
          onClick={() => createMutation.mutate()}
          disabled={!title || createMutation.isPending}
        >
          {createMutation.isPending ? "Adding…" : "Add Widget"}
        </Button>
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  editMode,
  onRefresh,
  onDelete,
}: {
  widget: DashboardWidget;
  editMode: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="h-full bg-card border rounded-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <p className="text-sm font-medium truncate">{widget.title}</p>
        <div className="flex gap-1">
          <button onClick={onRefresh} className="text-muted-foreground hover:text-foreground p-0.5">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {editMode && (
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {widget.snapshot ? (
          <BlockRenderer block={widget.snapshot} />
        ) : (
          <p className="text-sm text-muted-foreground">No data — click refresh.</p>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["dashboard", id],
    queryFn: () => fetchDashboard(id!),
  });

  const refreshMutation = useMutation({
    mutationFn: (widgetId: string) => refreshWidget(widgetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (widgetId: string) => deleteWidget(widgetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", id] }),
  });

  // SSE auto-refresh
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/cloud/dashboards/${id}/stream`);
    es.addEventListener("widget_updated", () => {
      qc.invalidateQueries({ queryKey: ["dashboard", id] });
    });
    return () => es.close();
  }, [id]);

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (!dashboard) return null;

  const widgets = dashboard.widgets ?? [];
  const layout: Layout[] = widgets.map((w) => ({
    i: w.id,
    x: w.layout?.x ?? 0,
    y: w.layout?.y ?? 0,
    w: w.layout?.w ?? 6,
    h: w.layout?.h ?? 4,
  }));

  const onLayoutChange = (newLayout: Layout[]) => {
    if (!editMode) return;
    newLayout.forEach((l: Layout) => {
      const widget = widgets.find((w) => w.id === l.i);
      if (widget) {
        updateWidget(widget.id, { layout: { x: l.x, y: l.y, w: l.w, h: l.h } });
      }
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0">
        <h1 className="text-lg font-semibold flex-1">{dashboard.name}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditMode((v) => !v)}
        >
          <Edit2 className="h-3.5 w-3.5 mr-1" />
          {editMode ? "Done" : "Edit"}
        </Button>
        {editMode && (
          <Button size="sm" onClick={() => setShowAddWidget(true)}>
            <Plus className="h-4 w-4 mr-1" />Add widget
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4" ref={(el) => el && setContainerWidth(el.clientWidth)}>
        {widgets.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No widgets yet. Enter edit mode to add one.
          </div>
        ) : (
          <GridLayout
            layout={layout as any}
            cols={12}
            rowHeight={60}
            width={containerWidth - 32}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={onLayoutChange as any}
            margin={[12, 12]}
          >
            {widgets.map((w) => (
              <div key={w.id}>
                <WidgetCard
                  widget={w}
                  editMode={editMode}
                  onRefresh={() => refreshMutation.mutate(w.id)}
                  onDelete={() => deleteMutation.mutate(w.id)}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {showAddWidget && (
        <AddWidgetPanel
          dashboardId={id!}
          siftIds={dashboard.sift_ids}
          onClose={() => setShowAddWidget(false)}
        />
      )}
    </div>
  );
}
