import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { drillDownTile } from "@/api/cloud";
import { apiFetchJson } from "@/lib/apiFetch";

interface DrillDownPanelProps {
  siftId: string;
  tileId: string;
  bucketKey: string;
  bucketValue: string;
  onClose: () => void;
}

interface RecordItem {
  id: string;
  [key: string]: unknown;
}

async function fetchRecordsBatch(siftId: string, ids: string[]): Promise<RecordItem[]> {
  if (!ids.length) return [];
  try {
    const data = await apiFetchJson(`/api/sifts/${siftId}/records/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (Array.isArray(data)) return data as RecordItem[];
    return (data as { records?: RecordItem[] }).records ?? [];
  } catch {
    return [];
  }
}

export function DrillDownPanel({
  siftId,
  tileId,
  bucketKey,
  bucketValue,
  onClose,
}: DrillDownPanelProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    drillDownTile(siftId, tileId, bucketKey, bucketValue)
      .then(({ record_ids }) => {
        if (cancelled) return;
        return fetchRecordsBatch(siftId, record_ids.slice(0, 50));
      })
      .then((recs) => {
        if (cancelled) return;
        setRecords(recs ?? []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siftId, tileId, bucketKey, bucketValue]);

  const cols = records.length > 0 ? Object.keys(records[0]).filter((k) => k !== "id") : [];

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-background border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm">Drill-down</h3>
          <p className="text-xs text-muted-foreground truncate">
            {bucketKey}: <span className="font-mono">{bucketValue}</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground ml-3 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : records.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No records found for this bucket.</div>
        ) : (
          <div className="p-4 space-y-3">
            {records.map((rec) => (
              <div key={rec.id} className="border rounded-lg p-3 text-xs space-y-1.5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">{rec.id}</span>
                  <a
                    href={`/sifts/${siftId}`}
                    className="text-primary hover:underline flex items-center gap-0.5"
                    title="Open sift records"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {cols.slice(0, 6).map((col) => (
                  <div key={col} className="flex gap-2">
                    <span className="text-muted-foreground font-medium min-w-[100px] shrink-0">{col}</span>
                    <span className="truncate text-foreground">
                      {rec[col] === null || rec[col] === undefined ? "—" : String(rec[col])}
                    </span>
                  </div>
                ))}
                {cols.length > 6 && (
                  <p className="text-muted-foreground/60">+{cols.length - 6} more fields</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
