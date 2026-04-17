import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Sift } from "@/api/types";

type TileKind = "kpi" | "table" | "bar_chart" | "line_chart";

interface TileEditorStandaloneProps {
  sifts: Sift[];
  onSubmit: (tile: {
    sift_id: string;
    kind: TileKind;
    title: string;
    pipeline: Record<string, unknown>[];
    chart_x?: string;
    chart_y?: string;
  }) => void;
  onClose: () => void;
  isPending?: boolean;
}

const KIND_LABELS: Record<TileKind, string> = {
  kpi: "KPI (big number)",
  table: "Table",
  bar_chart: "Bar Chart",
  line_chart: "Line Chart",
};

const KIND_DEFAULTS: Record<TileKind, string> = {
  kpi: '[{"$group": {"_id": null, "value": {"$sum": "$extracted_data.amount"}}}]',
  table: "[]",
  bar_chart:
    '[{"$group": {"_id": "$extracted_data.client", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 10}]',
  line_chart:
    '[{"$group": {"_id": {"$substr": ["$extracted_data.date", 0, 7]}, "count": {"$sum": 1}}}, {"$sort": {"_id": 1}}]',
};

export function TileEditorStandalone({ sifts, onSubmit, onClose, isPending }: TileEditorStandaloneProps) {
  const [siftId, setSiftId] = useState(sifts[0]?.id ?? "");
  const [kind, setKind] = useState<TileKind>("kpi");
  const [title, setTitle] = useState("");
  const [pipeline, setPipeline] = useState(KIND_DEFAULTS.kpi);
  const [chartX, setChartX] = useState("_id");
  const [chartY, setChartY] = useState("count");
  const [pipelineError, setPipelineError] = useState("");

  const handleKindChange = (k: TileKind) => {
    setKind(k);
    setPipeline(KIND_DEFAULTS[k]);
    setPipelineError("");
  };

  const handleSubmit = () => {
    if (!siftId) return;
    let parsed: Record<string, unknown>[];
    try {
      parsed = JSON.parse(pipeline);
      if (!Array.isArray(parsed)) throw new Error("Pipeline must be an array");
    } catch (e) {
      setPipelineError((e as Error).message);
      return;
    }
    onSubmit({
      sift_id: siftId,
      kind,
      title: title.trim(),
      pipeline: parsed,
      chart_x: ["bar_chart", "line_chart"].includes(kind) ? chartX : undefined,
      chart_y: ["bar_chart", "line_chart"].includes(kind) ? chartY : undefined,
    });
  };

  const isChartKind = kind === "bar_chart" || kind === "line_chart";

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-background border-l shadow-xl p-5 space-y-4 overflow-y-auto z-50 flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-sm">Add Tile</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        <div className="space-y-1.5">
          <Label>Sift</Label>
          <select
            value={siftId}
            onChange={(e) => setSiftId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select a sift…</option>
            {sifts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Type</Label>
          <select
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as TileKind)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {(Object.entries(KIND_LABELS) as [TileKind, string][]).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Revenue by Client"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Pipeline (JSON)</Label>
          <p className="text-xs text-muted-foreground">
            Pipeline stages run against <code className="font-mono">extracted_data</code> fields.
            The <code className="font-mono">sift_id</code> filter is injected automatically.
          </p>
          <textarea
            value={pipeline}
            onChange={(e) => { setPipeline(e.target.value); setPipelineError(""); }}
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {pipelineError && (
            <p className="text-xs text-destructive">{pipelineError}</p>
          )}
        </div>

        {isChartKind && (
          <>
            <div className="space-y-1.5">
              <Label>X-axis field</Label>
              <Input value={chartX} onChange={(e) => setChartX(e.target.value)} placeholder="_id" />
            </div>
            <div className="space-y-1.5">
              <Label>Y-axis field</Label>
              <Input value={chartY} onChange={(e) => setChartY(e.target.value)} placeholder="count" />
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 pt-2">
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={!siftId || !title.trim() || isPending}
        >
          {isPending ? "Adding…" : "Add Tile"}
        </Button>
      </div>
    </div>
  );
}
