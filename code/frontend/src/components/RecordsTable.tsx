import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, ArrowUp, ArrowDown, Copy, ExternalLink, Search, X, Info, RotateCcw, AlertTriangle, Wand2, Pencil, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import type { Citation, SiftRecord } from "@/api/types";
import { fetchRecordsCount, reindexSift, patchRecord } from "@/api/extractions";
import { useQueryClient } from "@tanstack/react-query";

interface RecordsTableProps {
  records: SiftRecord[];
  isLoading?: boolean;
  siftId?: string;
  showUncertainOnly?: boolean;
  onFilterChange?: (value: boolean) => void;
}

type SortDir = "asc" | "desc" | null;
interface SortState { key: string; dir: SortDir }


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

function CitationBadge({
  citation,
  isEdited,
  onReset,
}: {
  citation?: Citation;
  isEdited?: boolean;
  onReset?: () => void;
}) {
  if (isEdited) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-foreground/10 text-foreground px-1.5 py-0.5 rounded">
          edited
        </span>
        {onReset && (
          <button
            onClick={onReset}
            title="Reset to original"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }
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
  const isLow = conf < 0.6;
  const isMed = !isLow && conf < 0.85;
  const dot = isLow ? "bg-red-500" : isMed ? "bg-amber-400" : "bg-emerald-500";
  const label = isLow ? "Low" : isMed ? "Medium" : "High";
  const textColor = isLow ? "text-red-600" : isMed ? "text-amber-700" : "text-emerald-700";
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${textColor}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </span>
      {citation.inferred && (
        <span title="Inferred from context — no verbatim match found in document" className="text-violet-400">
          <Wand2 className="h-3 w-3" />
        </span>
      )}
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

type FieldType = "string" | "number" | "boolean" | "date" | "array" | "object" | "unknown";

function inferType(value: unknown): FieldType {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "date";
  return "string";
}

function EditableField({
  fieldName,
  value,
  onChange,
  autoFocus,
  onConfirm,
  onCancel,
}: {
  fieldName: string;
  value: unknown;
  onChange: (v: unknown) => void;
  autoFocus?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const type = inferType(value);
  const strVal = value === null || value === undefined ? "" : String(value);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onConfirm?.(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
  };

  if (type === "array" || type === "object") {
    return <DetailValue value={value} />;
  }
  if (type === "boolean") {
    return (
      <select
        className="text-xs border border-input rounded px-2 py-1 bg-background"
        value={strVal}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value === "true")}
        onKeyDown={handleKeyDown}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (type === "number") {
    return (
      <input
        type="number"
        className="text-xs border border-input rounded px-2 py-1 bg-background w-32 font-mono"
        value={strVal}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        onKeyDown={handleKeyDown}
      />
    );
  }
  if (type === "date") {
    return (
      <input
        type="date"
        className="text-xs border border-input rounded px-2 py-1 bg-background font-mono"
        value={strVal}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value || null)}
        onKeyDown={handleKeyDown}
      />
    );
  }
  return (
    <input
      type="text"
      className="text-xs border border-input rounded px-2 py-1 bg-background w-full"
      value={strVal}
      autoFocus={autoFocus}
      placeholder={`Edit ${fieldName}`}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}


function RecordDetailModal({
  record,
  columns,
  siftId,
  onClose,
  onRecordUpdated,
}: {
  record: SiftRecord | null;
  columns: string[];
  siftId?: string;
  onClose: () => void;
  onRecordUpdated?: (updated: SiftRecord) => void;
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!record) { setEditingField(null); setEditValue(null); }
  }, [record]);

  if (!record) return null;

  const copyId = () => {
    navigator.clipboard.writeText(record.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const hasCitations = record.citations && Object.keys(record.citations).length > 0;
  const correctedFields = (record as unknown as Record<string, unknown>).corrected_fields as
    Record<string, { value: unknown; corrected_by: string; corrected_at: string }> | undefined ?? {};

  const startFieldEdit = (col: string) => {
    setEditingField(col);
    setEditValue(record.extracted_data[col]);
  };

  const cancelFieldEdit = () => {
    setEditingField(null);
    setEditValue(null);
  };

  const confirmFieldEdit = async () => {
    if (!editingField || !siftId) return;
    setSaving(true);
    try {
      const updated = await patchRecord(siftId, record.id, {
        [editingField]: { value: editValue, scope: "local" },
      });
      onRecordUpdated?.(updated);
      setEditingField(null);
      setEditValue(null);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (field: string) => {
    if (!siftId) return;
    try {
      const updated = await patchRecord(siftId, record.id, { [field]: { value: null, scope: "reset" } });
      onRecordUpdated?.(updated);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-start justify-between gap-3 text-base pr-6">
              <span className="truncate">{record.filename || record.document_id}</span>
            </DialogTitle>
            {record.document_type && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Badge variant="secondary" className="text-[11px] font-mono">
                  {record.document_type}
                </Badge>
              </div>
            )}
          </DialogHeader>

          {!hasCitations && siftId && <ReindexBanner siftId={siftId} />}

          <div className="space-y-0 divide-y divide-border/50">
            {columns.map((col) => {
              const citation = record.citations?.[col];
              const isEdited = !!correctedFields[col];
              const correction = correctedFields[col];
              const type = inferType(record.extracted_data[col]);
              const isScalar = type !== "array" && type !== "object";
              const isEditing = editingField === col;
              const isDirtyField = isEditing && editValue !== record.extracted_data[col];

              return (
                <div
                  key={col}
                  className={`py-3 grid grid-cols-[160px_1fr] gap-4 items-start group ${isDirtyField ? "bg-amber-50/50 dark:bg-amber-950/10 -mx-1 px-1 rounded" : ""}`}
                >
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-0.5 truncate">
                    {col.replace(/_/g, " ")}
                  </span>
                  <div className="text-sm min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      {isEditing ? (
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <EditableField
                              fieldName={col}
                              value={editValue}
                              onChange={setEditValue}
                              autoFocus
                              onConfirm={confirmFieldEdit}
                              onCancel={cancelFieldEdit}
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0 pt-0.5">
                            <button
                              onClick={confirmFieldEdit}
                              title="Save"
                              disabled={saving}
                              className="text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-40"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelFieldEdit}
                              title="Cancel"
                              disabled={saving}
                              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <DetailValue value={record.extracted_data[col]} />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <CitationBadge
                              citation={citation}
                              isEdited={isEdited}
                              onReset={isEdited ? () => handleReset(col) : undefined}
                            />
                            {siftId && isScalar && !editingField && (
                              <button
                                onClick={() => startFieldEdit(col)}
                                title="Edit field"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    {!isEditing && isEdited && correction && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Corrected by {correction.corrected_by} · {new Date(correction.corrected_at).toLocaleDateString()}
                      </p>
                    )}
                    {!isEditing && !isEdited && citation?.source_text && <SnippetBlock citation={citation} />}
                  </div>
                </div>
              );
            })}
          </div>

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

    </>
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
  return record.extracted_data[col];
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function RecordsTable({ records: initialRecords, isLoading, siftId, showUncertainOnly, onFilterChange }: RecordsTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });
  const [selected, setSelected] = useState<SiftRecord | null>(null);
  const [records, setRecords] = useState<SiftRecord[]>(initialRecords);
  const [uncertainCount, setUncertainCount] = useState<number | null>(null);

  useEffect(() => { setRecords(initialRecords); }, [initialRecords]);

  useEffect(() => {
    if (!siftId) return;
    fetchRecordsCount(siftId, { hasUncertainFields: true })
      .then((r) => setUncertainCount(r.count))
      .catch(() => {});
  }, [siftId]);

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

  const handleRecordUpdated = (updated: SiftRecord) => {
    setRecords((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setSelected(updated);
    if (siftId) queryClient.invalidateQueries({ queryKey: ["sift-records", siftId] });
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
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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
        <div className="flex items-center gap-2 shrink-0">
          {uncertainCount != null && uncertainCount > 0 && (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
              {uncertainCount} uncertain
            </span>
          )}
          {onFilterChange && (
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showUncertainOnly ?? false}
                onChange={(e) => onFilterChange(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber-500"
              />
              Show uncertain only
            </label>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/70 shadow-[0_1px_4px_0_hsl(var(--foreground)/0.04)] bg-white dark:bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/60">
              {sortableTh("__filename", "Document")}
              {sortableTh("__type", "Type")}
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
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/documents/${record.document_id}`);
                        }}
                        title={`Open document — ${record.filename || record.document_id}`}
                        className="font-mono text-[11px] text-foreground/80 hover:text-primary hover:underline truncate text-left transition-colors"
                      >
                        {record.filename || record.document_id}
                      </button>
                      {record.has_uncertain_fields && (
                        <span
                          title="One or more fields have low confidence — click to review"
                          className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded shrink-0"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          uncertain
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                    {record.document_type || "—"}
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
        onRecordUpdated={handleRecordUpdated}
      />
    </div>
  );
}
