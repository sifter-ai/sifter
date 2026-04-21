import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, ArrowUp, ArrowDown, Copy, ExternalLink, Search, X, Info, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import type { Citation, SiftRecord } from "@/api/types";
import { reindexSift } from "@/api/extractions";

interface RecordsTableProps {
  records: SiftRecord[];
  isLoading?: boolean;
  siftId?: string;
}

type SortDir = "asc" | "desc" | null;
interface SortState { key: string; dir: SortDir }

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.85 ? "bg-emerald-500" : value >= 0.6 ? "bg-amber-400" : "bg-red-400";
  const textColor =
    value >= 0.85 ? "text-emerald-700" : value >= 0.6 ? "text-amber-700" : "text-red-600";
  return (
    <div className="flex items-center gap-1.5 min-w-[52px]">
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-[11px] tabular-nums ${textColor}`}>{pct}%</span>
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground/40 select-none">—</span>;
  if (typeof value === "boolean")
    return <span className={value ? "text-emerald-600" : "text-slate-400"}>{value ? "true" : "false"}</span>;
  if (typeof value === "number")
    return <span className="tabular-nums text-right block">{value.toLocaleString()}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="text-muted-foreground/40 select-none">—</span>;
    const allPrimitive = value.every((v) => typeof v !== "object" || v === null);
    if (allPrimitive)
      return <span title={value.join(", ")}>{value.join(", ")}</span>;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{value.length}</span>
        {" item"}{value.length !== 1 ? "s" : ""}
      </span>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    return <span className="text-xs text-muted-foreground" title={entries}>{entries || "{ }"}</span>;
  }
  const str = String(value);
  return <span title={str}>{str}</span>;
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground/40 italic">—</span>;
  if (typeof value === "boolean")
    return (
      <Badge variant={value ? "default" : "secondary"} className="text-xs font-mono">
        {value ? "true" : "false"}
      </Badge>
    );
  if (typeof value === "number")
    return <span className="font-mono tabular-nums">{value.toLocaleString()}</span>;
  if (typeof value === "object")
    return (
      <pre className="text-xs font-mono bg-muted/60 border border-border/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  return <span className="break-words">{String(value)}</span>;
}

function CitationBadge({ citation }: { citation?: Citation }) {
  if (!citation) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 shrink-0"
        title="Source not located in document"
      >
        <Info className="h-3 w-3" />
        Unverified
      </span>
    );
  }
  const conf = citation.confidence ?? 1;
  const isLow = citation.inferred || conf < 0.6;
  const isMed = !isLow && conf < 0.85;
  const dot = isLow
    ? "bg-red-500"
    : isMed
    ? "bg-amber-400"
    : "bg-emerald-500";
  const label = isLow ? "Low" : isMed ? "Medium" : "High";
  const textColor = isLow
    ? "text-red-600"
    : isMed
    ? "text-amber-700"
    : "text-emerald-700";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium shrink-0 ${textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function SnippetBlock({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);
  const snippet = citation.source_text;
  const truncated = snippet.length > 120;
  return (
    <div className="mt-1.5 text-[11px] font-mono text-muted-foreground bg-muted/40 border border-border/40 rounded px-2 py-1.5">
      <span className="whitespace-pre-wrap break-words">
        {truncated && !expanded ? snippet.slice(0, 120) + "…" : snippet}
      </span>
      {truncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-primary hover:underline text-[10px]"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
      {citation.page != null && (
        <div className="mt-0.5 text-[10px] opacity-60">page {citation.page}</div>
      )}
    </div>
  );
}

function ReindexBanner({ siftId }: { siftId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReindex = async () => {
    setLoading(true);
    try {
      await reindexSift(siftId);
      setDone(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (done) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span>Reindex this sift to populate citations</span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] gap-1"
        onClick={handleReindex}
        disabled={loading}
      >
        <RotateCcw className="h-3 w-3" />
        {loading ? "Reindexing…" : "Reindex"}
      </Button>
    </div>
  );
}

function RecordDetailModal({
  record,
  columns,
  siftId,
  onClose,
}: {
  record: SiftRecord | null;
  columns: string[];
  siftId?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!record) return null;

  const copyId = () => {
    navigator.clipboard.writeText(record.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const hasCitations = record.citations && Object.keys(record.citations).length > 0;

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-start gap-3 text-base pr-6">
            <span className="truncate">{record.filename || record.document_id}</span>
          </DialogTitle>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {record.document_type && (
              <Badge variant="secondary" className="text-[11px] font-mono">
                {record.document_type}
              </Badge>
            )}
            <ConfidencePill value={record.confidence} />
          </div>
        </DialogHeader>

        {/* Reindex banner — shown when citations map is entirely empty */}
        {!hasCitations && siftId && <ReindexBanner siftId={siftId} />}

        {/* Extracted fields */}
        <div className="space-y-0 divide-y divide-border/50">
          {columns.map((col) => {
            const citation = record.citations?.[col];
            return (
              <div key={col} className="py-3 grid grid-cols-[160px_1fr] gap-4 items-start">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-0.5 truncate">
                  {col.replace(/_/g, " ")}
                </span>
                <div className="text-sm min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <DetailValue value={record.extracted_data[col]} />
                    <CitationBadge citation={citation} />
                  </div>
                  {citation?.source_text && <SnippetBlock citation={citation} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Metadata */}
        <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Metadata</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Record ID</span>
              <span className="font-mono text-[11px] text-foreground/70 truncate">{record.id}</span>
              <button onClick={copyId} title="Copy ID" className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <span className="text-emerald-500 text-[10px]">Copied</span> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Document</span>
              <button
                onClick={() => { onClose(); navigate(`/documents/${record.document_id}`); }}
                className="font-mono text-[11px] text-primary hover:underline flex items-center gap-1 truncate"
              >
                {record.document_id}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </button>
            </div>
            {record.record_index > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 shrink-0">Record index</span>
                <span className="font-mono">{record.record_index}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Created</span>
              <span>{new Date(record.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortIcon({ col, sort }: { col: string; sort: SortState }) {
  if (sort.key !== col || sort.dir === null)
    return <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60 transition-opacity" />;
  return sort.dir === "asc"
    ? <ArrowUp className="h-3 w-3 text-primary" />
    : <ArrowDown className="h-3 w-3 text-primary" />;
}

function nextDir(current: SortDir): SortDir {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

function getColValue(record: SiftRecord, col: string): unknown {
  if (col === "__filename") return record.filename ?? record.document_id;
  if (col === "__type") return record.document_type ?? "";
  if (col === "__conf") return record.confidence;
  return record.extracted_data[col];
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function RecordsTable({ records, isLoading, siftId }: RecordsTableProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });
  const [selected, setSelected] = useState<SiftRecord | null>(null);

  const columns = useMemo(() => {
    if (!records.length) return [];
    const keys = new Set<string>();
    records.forEach((r) => Object.keys(r.extracted_data).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [records]);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (r.filename?.toLowerCase().includes(q)) return true;
      if (r.document_type?.toLowerCase().includes(q)) return true;
      return Object.values(r.extracted_data).some((v) =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(q)
      );
    });
  }, [records, search]);

  const sorted = useMemo(() => {
    if (!sort.key || sort.dir === null) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = compareValues(getColValue(a, sort.key), getColValue(b, sort.key));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const toggleSort = (col: string) => {
    setSort((prev) => {
      if (prev.key !== col) return { key: col, dir: "asc" };
      const dir = nextDir(prev.dir);
      return dir === null ? { key: "", dir: null } : { key: col, dir };
    });
  };

  const thClass = "px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] whitespace-nowrap";
  const sortableTh = (col: string, label: string) => (
    <th key={col} className={thClass}>
      <button
        className="flex items-center gap-1 group hover:text-foreground transition-colors"
        onClick={() => toggleSort(col)}
      >
        {label}
        <SortIcon col={col} sort={sort} />
      </button>
    </th>
  );

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
          <FileText className="h-5 w-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-foreground">No records yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload and process documents to see extracted data here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search records…"
          className="pl-8 h-8 text-sm pr-8"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/70 shadow-[0_1px_4px_0_hsl(var(--foreground)/0.04)] bg-white dark:bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/60">
              {sortableTh("__filename", "Document")}
              {sortableTh("__type", "Type")}
              {sortableTh("__conf", "Conf")}
              {columns.map((col) => sortableTh(col, col.replace(/_/g, " ")))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={3 + columns.length} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No records match your search.{" "}
                  <button onClick={() => setSearch("")} className="text-primary hover:underline">Clear</button>
                </td>
              </tr>
            ) : (
              sorted.map((record, i) => (
                <tr
                  key={record.id}
                  className={`border-b last:border-0 transition-colors hover:bg-primary/[0.03] cursor-pointer ${
                    i % 2 === 1 ? "bg-muted/20" : ""
                  }`}
                  onClick={() => setSelected(record)}
                >
                  <td className="px-3 py-2 max-w-[160px]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/documents/${record.document_id}`);
                      }}
                      title={`Open document — ${record.filename || record.document_id}`}
                      className="font-mono text-[11px] text-foreground/80 hover:text-primary hover:underline truncate block w-full text-left transition-colors"
                    >
                      {record.filename || record.document_id}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                    {record.document_type || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ConfidencePill value={record.confidence} />
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2 font-mono text-[11px] text-foreground/80 max-w-[200px] truncate">
                      <CellValue value={record.extracted_data[col]} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-mono">
            {search && sorted.length !== records.length ? (
              <><span className="text-foreground">{sorted.length}</span> of {records.length} records</>
            ) : (
              <>{records.length} record{records.length !== 1 ? "s" : ""} · {columns.length} field{columns.length !== 1 ? "s" : ""}</>
            )}
          </span>
        </div>
      </div>

      <RecordDetailModal
        record={selected}
        columns={columns}
        siftId={siftId}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
