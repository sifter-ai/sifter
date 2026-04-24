import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder as FolderIcon,
  Layers,
  Link,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { RecordsTable } from "@/components/RecordsTable";
import { QueryPanel } from "@/components/QueryPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataResultsTable } from "@/components/DataResultsTable";
import {
  useAggregations,
  useCreateAggregation,
  useDeleteAggregation,
  useDeleteSift,
  useExportCsv,
  useLinkFolderToSift,
  useSift,
  useSiftDocuments,
  useSiftFolders,
  useSiftRecords,
  useReindexSift,
  useRegenerateAggregation,
  useRunAggregation,
  useUpdateSift,
  useUploadDocuments,
} from "@/hooks/useExtractions";
import {
  fetchCorrectionRules,
  deleteCorrectionRule,
  backfillCorrectionRule,
  type CorrectionRule,
} from "@/api/extractions";
import { useQueryClient } from "@tanstack/react-query";
import { fetchFolders } from "@/api/folders";
import type { Folder } from "@/api/types";
import type { SiftDocument } from "@/api/types";

function docStatusVariant(status: string) {
  switch (status) {
    case "done": return "success";
    case "processing": return "info";
    case "pending": return "pending";
    case "error": return "destructive";
    case "discarded": return "pending";
    default: return "outline";
  }
}

function docStatusDot(status: string) {
  switch (status) {
    case "done": return "bg-emerald-500";
    case "error": return "bg-red-500";
    case "pending": case "discarded": return "bg-slate-400";
    default: return null;
  }
}

function docStatusLabel(status: string) {
  switch (status) {
    case "done": return "Extracted";
    case "processing": return "Processing";
    case "pending": return "Pending";
    case "error": return "Error";
    case "discarded": return "Discarded";
    default: return status;
  }
}

function DocumentsPanel({ siftId, isIndexing }: { siftId: string; isIndexing: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [docsOffset, setDocsOffset] = useState(0);
  const DOCS_PAGE_SIZE = 50;
  const { data, isLoading } = useSiftDocuments(siftId, { limit: DOCS_PAGE_SIZE, offset: docsOffset });

  const hasActive = data?.items?.some((d: any) => d.status === "pending" || d.status === "processing");
  const shouldPoll = isIndexing || !!hasActive;

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setInterval(() => {
      qc.refetchQueries({ queryKey: ["sift-documents", siftId] });
    }, 3000);
    return () => clearInterval(timer);
  }, [shouldPoll, siftId, qc]);

  const docs = data?.items ?? [];
  const total = data?.total ?? 0;

  if (isLoading) {
    return <div className="space-y-2"><div className="h-8 bg-muted animate-pulse rounded" /><div className="h-8 bg-muted animate-pulse rounded" /></div>;
  }

  if (!docs.length) {
    return <p className="text-sm text-muted-foreground">No documents indexed yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Filename</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Completed</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc: SiftDocument) => (
            <tr key={doc.document_id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2">
                {doc.filename ? (
                  <button
                    className="text-primary hover:underline text-left"
                    onClick={() => navigate(`/documents/${doc.document_id}`)}
                  >
                    {doc.filename}
                  </button>
                ) : (
                  <span className="text-muted-foreground italic">(deleted)</span>
                )}
              </td>
              <td className="px-3 py-2">
                <Badge variant={docStatusVariant(doc.status) as any}>
                  {doc.status === "processing" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : docStatusDot(doc.status) ? (
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${docStatusDot(doc.status)}`} />
                  ) : null}
                  {docStatusLabel(doc.status)}
                </Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs">
                {doc.completed_at ? new Date(doc.completed_at).toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {doc.error_message ?? doc.filter_reason ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > DOCS_PAGE_SIZE && (
        <div className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground border-t">
          <span>{docsOffset + 1}–{Math.min(docsOffset + DOCS_PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={docsOffset === 0} onClick={() => setDocsOffset(Math.max(0, docsOffset - DOCS_PAGE_SIZE))}>Prev</Button>
            <Button variant="ghost" size="sm" disabled={docsOffset + DOCS_PAGE_SIZE >= total} onClick={() => setDocsOffset(docsOffset + DOCS_PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}


function LinkFolderDialog({
  siftId,
  open,
  onOpenChange,
}: {
  siftId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Folder | null>(null);
  const linkMutation = useLinkFolderToSift(siftId);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(null);
    setLoading(true);
    fetchFolders()
      .then((page) => setFolders(page.items))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = folders.filter((f) => {
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.path ?? "").toLowerCase().includes(q)
    );
  });

  const handleLink = () => {
    if (!selected) return;
    linkMutation.mutate(selected.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a Folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8"
              placeholder="Search by name or path…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No folders found.</p>
            ) : (
              filtered.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelected(f)}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors border-b last:border-0 ${
                    selected?.id === f.id ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  <span className="block truncate">{f.name}</span>
                  {f.path && (
                    <span className="text-xs text-muted-foreground font-mono">{f.path}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLink}
              disabled={!selected || linkMutation.isPending}
            >
              {linkMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Linking…</>
              ) : (
                "Link Folder"
              )}
            </Button>
          </div>
          {linkMutation.isError && (
            <p className="text-xs text-destructive">
              {(linkMutation.error as Error).message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- helpers for the editorial redesign ----------

type SchemaField = { name: string; type: string };

function parseSchema(schema: string | null | undefined): SchemaField[] {
  if (!schema) return [];
  const re = /([A-Za-z_][\w\s-]*?)\s*\(([^)]+)\)/g;
  const out: SchemaField[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    out.push({ name: m[1].trim(), type: m[2].trim() });
  }
  if (!out.length) {
    // Fall back to comma-split if the string has no parens
    for (const part of schema.split(",").map((s) => s.trim()).filter(Boolean)) {
      out.push({ name: part, type: "text" });
    }
  }
  return out;
}

function typeChipClass(type: string): string {
  const t = type.toLowerCase();
  if (/\b(int|integer|number|float|decimal|numeric|long|double)\b/.test(t))
    return "text-blue-700 bg-blue-50 border-blue-100 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-900/60";
  if (/\b(bool|boolean)\b/.test(t))
    return "text-violet-700 bg-violet-50 border-violet-100 dark:text-violet-300 dark:bg-violet-950/40 dark:border-violet-900/60";
  if (/\b(date|datetime|time|timestamp)\b/.test(t))
    return "text-amber-700 bg-amber-50 border-amber-100 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900/60";
  if (/\b(array|list)\b/.test(t))
    return "text-orange-700 bg-orange-50 border-orange-100 dark:text-orange-300 dark:bg-orange-950/40 dark:border-orange-900/60";
  if (/\b(object|json|dict|map)\b/.test(t))
    return "text-pink-700 bg-pink-50 border-pink-100 dark:text-pink-300 dark:bg-pink-950/40 dark:border-pink-900/60";
  return "text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-900/40 dark:border-slate-800";
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return new Date(iso).toLocaleDateString();
}

type FieldStat = {
  name: string;
  type: string;
  filled: number;
  total: number;
  unique: number;
  top: Array<{ value: string; count: number }>;
};

function computeFieldQuality(
  fields: SchemaField[],
  records: Array<{ extracted_data: Record<string, unknown> }>,
): FieldStat[] {
  if (!records.length) {
    return fields.map((f) => ({ ...f, filled: 0, total: 0, unique: 0, top: [] }));
  }
  // If schema is empty, derive fields from the first record's keys.
  const effectiveFields: SchemaField[] = fields.length
    ? fields
    : Object.keys(records[0]?.extracted_data ?? {}).map((k) => ({ name: k, type: "text" }));

  return effectiveFields.map((f) => {
    const values: string[] = [];
    let filled = 0;
    for (const r of records) {
      const v = r.extracted_data?.[f.name];
      if (v === null || v === undefined || v === "") continue;
      filled += 1;
      values.push(typeof v === "string" ? v : JSON.stringify(v));
    }
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
    return {
      name: f.name,
      type: f.type,
      filled,
      total: records.length,
      unique: counts.size,
      top,
    };
  });
}

function FieldQualityPanel({
  fields,
  records,
}: {
  fields: SchemaField[];
  records: Array<{ extracted_data: Record<string, unknown> }>;
}) {
  const stats = useMemo(() => computeFieldQuality(fields, records), [fields, records]);
  if (!records.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 py-16 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
          No records yet
        </p>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Upload documents to see per-field quality distributions.
        </p>
      </div>
    );
  }
  if (!stats.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 py-16 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
          Schema-less sift
        </p>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Define a schema to unlock per-field quality reports.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {stats.map((s) => {
        const pct = s.total ? Math.round((s.filled / s.total) * 100) : 0;
        const uniqueRatio = s.filled ? s.unique / s.filled : 0;
        return (
          <div
            key={s.name}
            className="rounded-xl border bg-card px-4 py-3.5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{s.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                  {s.type}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {pct}
                  <span className="text-muted-foreground/50 text-[10px] ml-0.5">%</span>
                </p>
                <p className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                  {s.filled}/{s.total} filled
                </p>
              </div>
            </div>

            <div className="mt-2.5 h-1 rounded-full bg-muted/80 overflow-hidden">
              <div
                className={`h-full ${
                  pct >= 95 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                {s.unique} unique
                {s.filled > 0 && uniqueRatio > 0.9 && (
                  <span className="ml-1.5 text-amber-600/80">· likely ID</span>
                )}
              </p>
            </div>

            {s.top.length > 0 && s.unique < s.filled && (
              <div className="mt-2.5 space-y-1">
                {s.top.slice(0, 3).map((t) => {
                  const barW = s.filled ? (t.count / s.filled) * 100 : 0;
                  return (
                    <div key={t.value} className="flex items-center gap-2 text-xs">
                      <span className="truncate flex-1 text-foreground/80" title={t.value}>
                        {t.value}
                      </span>
                      <div className="w-16 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                        <div className="h-full bg-amber-500/70" style={{ width: `${barW}%` }} />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums w-6 text-right shrink-0">
                        {t.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CorrectionRulesPanel({ siftId }: { siftId: string }) {
  const qc = useQueryClient();
  const [backfillMsg, setBackfillMsg] = useState<{ ruleId: string; count: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["correction-rules", siftId],
    queryFn: () => fetchCorrectionRules(siftId),
  });
  const rules = data?.rules ?? [];

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteCorrectionRule(siftId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correction-rules", siftId] }),
  });

  const backfillMutation = useMutation({
    mutationFn: (ruleId: string) => backfillCorrectionRule(siftId, ruleId),
    onSuccess: (result, ruleId) => {
      setBackfillMsg({ ruleId, count: result.applied_count });
      qc.invalidateQueries({ queryKey: ["correction-rules", siftId] });
      setTimeout(() => setBackfillMsg(null), 4000);
    },
  });

  if (isLoading) {
    return <div className="space-y-2"><div className="h-8 bg-muted animate-pulse rounded" /><div className="h-8 bg-muted animate-pulse rounded" /></div>;
  }

  if (!rules.length) {
    return (
      <p className="text-sm text-muted-foreground italic">No correction rules yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Field</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Match → Replace</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Created by</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Created at</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Applied</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule: CorrectionRule) => (
            <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 font-mono text-xs">{rule.field_name}</td>
              <td className="px-3 py-2 text-xs">
                <span className="font-mono text-muted-foreground">{String(rule.match_value)}</span>
                <span className="mx-1.5 text-muted-foreground/50">→</span>
                <span className="font-mono">{String(rule.replace_value)}</span>
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs">{rule.created_by ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground text-xs">
                {new Date(rule.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {rule.applied_count}
                {backfillMsg?.ruleId === rule.id && (
                  <span className="ml-1.5 text-emerald-600">+{backfillMsg.count}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={backfillMutation.isPending}
                    onClick={() => backfillMutation.mutate(rule.id)}
                  >
                    {backfillMutation.isPending && backfillMutation.variables === rule.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Backfill"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(rule.id)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- main component ----------

export function SiftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editMultiRecord, setEditMultiRecord] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLinkFolder, setShowLinkFolder] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const updateMutation = useUpdateSift(id!);

  const isIndexing = (status: string | undefined) => status === "indexing";
  const qc = useQueryClient();

  const { data: extraction, isLoading, error } = useSift(id!);

  const [recordsOffset, setRecordsOffset] = useState(0);
  const [recordsUncertainOnly, setRecordsUncertainOnly] = useState(false);
  const RECORDS_PAGE_SIZE = 50;
  const { data: recordsPage, isLoading: recordsLoading } = useSiftRecords(id!, {
    limit: RECORDS_PAGE_SIZE,
    offset: recordsOffset,
    hasUncertainFields: recordsUncertainOnly || undefined,
  });
  const records = recordsPage?.items ?? [];

  const { data: correctionRulesData } = useQuery({
    queryKey: ["correction-rules", id],
    queryFn: () => fetchCorrectionRules(id!),
    enabled: !!id,
  });
  const correctionRulesCount = correctionRulesData?.rules?.length ?? 0;

  const uploadMutation = useUploadDocuments(id!);

  // Poll during indexing — runs independently of React Query's staleTime/refetchInterval.
  // We also poll while the upload HTTP request is in flight: large uploads can take
  // several seconds, and we want the document list and progress to update live rather
  // than only after the request resolves.
  const currentlyIndexing = extraction?.status === "indexing";
  const shouldPoll = currentlyIndexing || uploadMutation.isPending;
  useEffect(() => {
    if (!id || !shouldPoll) return;
    const timer = setInterval(() => {
      qc.refetchQueries({ queryKey: ["sift", id] });
      qc.refetchQueries({ queryKey: ["sift-records", id] });
      qc.refetchQueries({ queryKey: ["sift-documents", id] });
    }, 2000);
    return () => clearInterval(timer);
  }, [id, shouldPoll, qc]);

  const prevStatusRef = useRef<string | undefined>();
  useEffect(() => {
    if (prevStatusRef.current === "indexing" && !isIndexing(extraction?.status)) {
      qc.refetchQueries({ queryKey: ["sift-records", id] });
    }
    prevStatusRef.current = extraction?.status;
  }, [extraction?.status]);
  const reindexMutation = useReindexSift(id!);
  const deleteMutation = useDeleteSift();
  const exportMutation = useExportCsv();
  const { data: siftFolders, isLoading: foldersLoading } = useSiftFolders(id!);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    uploadMutation.mutate(formData);
    e.target.value = "";
  };

  const handleDelete = () => setShowDeleteDialog(true);

  const confirmDelete = () => {
    deleteMutation.mutate(id!, { onSuccess: () => navigate("/") });
  };

  const handleEditOpen = () => {
    setEditName(extraction?.name ?? "");
    setEditInstructions(extraction?.instructions ?? "");
    setEditMultiRecord(extraction?.multi_record ?? false);
    setShowEdit(true);
  };

  const handleEditSave = () => {
    updateMutation.mutate(
      { name: editName, instructions: editInstructions, multi_record: editMultiRecord },
      { onSuccess: () => setShowEdit(false) }
    );
  };

  if (isLoading) {
    return (
      <div className="px-6 py-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !extraction) {
    return (
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <Alert variant="destructive">
          <AlertDescription>
            {error ? (error as Error).message : "Sift not found"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const effectiveTotal = Math.max(extraction.total_documents, extraction.processed_documents);
  const progress = effectiveTotal > 0
    ? (extraction.processed_documents / effectiveTotal) * 100
    : 0;

  const schemaFields = parseSchema(extraction.schema);
  const recordCount = recordsPage?.total ?? 0;

  const tabTriggerClass =
    "rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-foreground data-[state=active]:text-foreground transition-colors";

  return (
    <div className="flex flex-col min-h-full bg-background">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
        className="hidden"
        onChange={handleUpload}
      />

      {/* Breadcrumb rail — matches Folders/Chat top-rail typography */}
      <header className="h-14 shrink-0 border-b flex items-center gap-3 px-6 bg-background/80 backdrop-blur sticky top-0 z-10">
        <nav className="flex items-center gap-2 min-w-0 flex-1">
          <RouterLink
            to="/"
            className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
          >
            Sifts
          </RouterLink>
          <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" strokeWidth={1.75} />
          <span className="text-sm font-semibold tracking-tight text-foreground truncate">
            {extraction.name}
          </span>
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={extraction.status} />
        </div>
      </header>

      <div className="relative flex-1">
        {/* Soft atmospheric wash behind the hero */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
          style={{
            background:
              "radial-gradient(900px 260px at 18% -20%, hsl(40 92% 58% / 0.07), transparent 60%), radial-gradient(520px 220px at 88% -25%, hsl(263 72% 52% / 0.05), transparent 55%)",
          }}
          aria-hidden
        />

        <div className="relative px-6 md:px-10 py-10 max-w-6xl mx-auto space-y-10">
          {/* Editorial hero */}
          <section>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              {extraction.multi_record ? "Multi-record sift" : "Single-record sift"}
              {schemaFields.length > 0 && (
                <span className="ml-2 text-muted-foreground/40">
                  · {schemaFields.length} field{schemaFields.length !== 1 ? "s" : ""}
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="min-w-0 flex-1">
                <h1 className="text-[30px] md:text-[36px] font-semibold tracking-[-0.02em] leading-[1.1] text-foreground">
                  {extraction.name}
                </h1>
                {extraction.description &&
                  extraction.description.trim().toLowerCase() !==
                    extraction.name.trim().toLowerCase() && (
                    <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                      {extraction.description}
                    </p>
                  )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="h-9 gap-1.5 bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-white shadow-sm hover:shadow-md transition-all"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" strokeWidth={2.25} />
                  )}
                  <span className="text-sm">
                    {uploadMutation.isPending ? "Uploading…" : "Upload"}
                  </span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9" title="More actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handleEditOpen}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit sift
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowLinkFolder(true)}>
                      <Link className="h-4 w-4 mr-2" />
                      Link folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => reindexMutation.mutate()}
                      disabled={reindexMutation.isPending || isIndexing(extraction.status)}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reindex
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => exportMutation.mutate({ id: id!, name: extraction.name })}
                      disabled={exportMutation.isPending || !records?.length}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete sift
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </section>

          {/* Details strip — records hero + compact vitals, click to expand full spec */}
          {(() => {
            const indexing = isIndexing(extraction.status);
            const errored = extraction.status === "error";
            const paused = extraction.status === "paused";
            const statusDot = indexing
              ? "bg-amber-500 animate-pulse"
              : errored
                ? "bg-red-500"
                : paused
                  ? "bg-muted-foreground/50"
                  : "bg-emerald-500";
            const statusLabel = indexing
              ? "Indexing"
              : errored
                ? "Error"
                : paused
                  ? "Paused"
                  : "Active";
            const folderCount = siftFolders?.items.length ?? 0;
            return (
              <section className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-[0_1px_4px_0_hsl(var(--foreground)/0.04)]">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                  className="w-full flex items-center gap-4 md:gap-5 px-5 py-3 text-left hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-baseline gap-2 shrink-0">
                    <span className="text-[26px] md:text-[28px] font-bold tabular-nums tracking-tight leading-none text-foreground">
                      {recordCount.toLocaleString()}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                      record{recordCount !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <span className="h-6 w-px bg-border/60 shrink-0" aria-hidden />

                  <div className="flex items-center gap-2.5 md:gap-3 min-w-0 flex-1 flex-wrap text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${statusDot}`} aria-hidden />
                      <span className="text-sm font-medium text-foreground">{statusLabel}</span>
                    </span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {extraction.processed_documents}
                        <span className="text-muted-foreground/40">
                          /{Math.max(extraction.total_documents, extraction.processed_documents)}
                        </span>{" "}
                        docs
                      </span>
                      {Math.max(extraction.total_documents, extraction.processed_documents) > 0 && (
                        <span className="h-1 w-14 rounded-full bg-muted overflow-hidden inline-block">
                          <span
                            className={`block h-full ${
                              progress >= 100
                                ? "bg-emerald-500"
                                : indexing
                                  ? "bg-amber-500"
                                  : errored
                                    ? "bg-red-400"
                                    : "bg-amber-500/60"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="font-mono text-muted-foreground">
                      {schemaFields.length} field{schemaFields.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="font-mono text-muted-foreground">
                      {folderCount} folder{folderCount !== 1 ? "s" : ""}
                    </span>
                    <span className="text-muted-foreground/30 hidden lg:inline">·</span>
                    <span className="font-mono text-muted-foreground/70 hidden lg:inline">
                      Updated {formatRelativeTime(extraction.updated_at)}
                    </span>
                  </div>

                  <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    Details
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`}
                      strokeWidth={2}
                    />
                  </span>
                </button>

                {showDetails && (
                  <div className="border-t border-border/40 bg-muted/10 px-5 py-5 space-y-5">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                        <FileText className="h-3 w-3" />
                        Instructions
                      </p>
                      <p className="text-[14px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {extraction.instructions}
                      </p>
                    </div>

                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                        <Layers className="h-3 w-3" />
                        Schema
                        <span className="text-muted-foreground/40 normal-case tracking-normal">
                          · {extraction.multi_record ? "multi-record" : "single-record"}
                        </span>
                      </p>
                      {schemaFields.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {schemaFields.map((f, i) => (
                            <span
                              key={`${f.name}-${i}`}
                              className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 rounded-md border ${typeChipClass(
                                f.type,
                              )}`}
                              title={`${f.name} · ${f.type}`}
                            >
                              <span className="font-semibold">{f.name}</span>
                              <span className="opacity-55 text-[9px] uppercase tracking-[0.08em]">
                                {f.type}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/80 italic">
                          No schema defined — the agent infers structure from document content.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                        <FolderIcon className="h-3 w-3" />
                        Applied to
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {foldersLoading ? (
                          <Skeleton className="h-6 w-28" />
                        ) : folderCount > 0 ? (
                          siftFolders!.items.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => navigate(`/folders/${f.id}`)}
                              className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-xs hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors"
                              title={f.path ?? f.name}
                            >
                              <FolderIcon
                                className="h-3 w-3 text-muted-foreground/60 group-hover:text-amber-600/90"
                                strokeWidth={1.75}
                              />
                              <span className="font-medium truncate max-w-[160px]">{f.name}</span>
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground/60 italic">
                            No folders linked
                          </span>
                        )}
                        <button
                          onClick={() => setShowLinkFolder(true)}
                          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-foreground px-2 py-1"
                        >
                          <Link className="h-3 w-3" />
                          Link
                        </button>
                      </div>
                    </div>

                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/45 pt-1 border-t border-border/30">
                      Created {formatRelativeTime(extraction.created_at)}
                    </p>
                  </div>
                )}
              </section>
            );
          })()}

          {/* Error state */}
          {extraction.error && (
            <Alert variant="destructive">
              <AlertDescription className="break-all">{extraction.error}</AlertDescription>
            </Alert>
          )}
          {uploadMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                Upload failed: {(uploadMutation.error as Error).message}
              </AlertDescription>
            </Alert>
          )}
          {reindexMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                Reindex failed: {(reindexMutation.error as Error).message}
              </AlertDescription>
            </Alert>
          )}

          {/* Ask — persistent query composer (the primary product gesture) */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] font-semibold text-foreground/85">
                <Sparkles className="h-3 w-3 text-amber-500" strokeWidth={2.25} />
                Ask
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55 hidden sm:block">
                Natural-language query
              </p>
            </div>
            <QueryPanel siftId={id!} />
          </section>

          {/* Records & data workspace */}
          <section>
            <Tabs defaultValue="records">
              <TabsList className="bg-transparent border-b rounded-none h-auto p-0 w-full justify-start gap-1">
                <TabsTrigger value="records" className={tabTriggerClass}>
                  Records
                  {recordCount > 0 && (
                    <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                      {recordCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="documents" className={tabTriggerClass}>
                  Documents
                  {effectiveTotal > 0 && (
                    <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                      {effectiveTotal}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="quality" className={tabTriggerClass}>
                  Quality
                </TabsTrigger>
                {correctionRulesCount > 0 && (
                  <TabsTrigger value="correction-rules" className={tabTriggerClass}>
                    Correction rules
                    <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                      {correctionRulesCount}
                    </span>
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="records" className="mt-6 space-y-3">
                <RecordsTable
                  records={records}
                  isLoading={recordsLoading}
                  siftId={id!}
                  showUncertainOnly={recordsUncertainOnly}
                  onFilterChange={setRecordsUncertainOnly}
                />
                {recordsPage && recordsPage.total > RECORDS_PAGE_SIZE && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                    <span>
                      {recordsOffset + 1}–{Math.min(recordsOffset + RECORDS_PAGE_SIZE, recordsPage.total)} of {recordsPage.total}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={recordsOffset === 0}
                        onClick={() => setRecordsOffset(Math.max(0, recordsOffset - RECORDS_PAGE_SIZE))}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={recordsOffset + RECORDS_PAGE_SIZE >= recordsPage.total}
                        onClick={() => setRecordsOffset(recordsOffset + RECORDS_PAGE_SIZE)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="documents" className="mt-6">
                <DocumentsPanel siftId={id!} isIndexing={isIndexing(extraction.status)} />
              </TabsContent>
              <TabsContent value="quality" className="mt-6">
                <FieldQualityPanel fields={schemaFields} records={records ?? []} />
              </TabsContent>
              <TabsContent value="correction-rules" className="mt-6">
                <CorrectionRulesPanel siftId={id!} />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>

      {/* ---- Dialogs ---- */}

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex items-start gap-3">
              <input
                id="edit-multi-record"
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                checked={editMultiRecord}
                onChange={(e) => setEditMultiRecord(e.target.checked)}
              />
              <div>
                <Label htmlFor="edit-multi-record" className="cursor-pointer font-medium">
                  Extract multiple records per document
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable when a single document can contain several records.
                </p>
              </div>
            </div>
            <Button
              onClick={handleEditSave}
              disabled={!editName.trim() || !editInstructions.trim() || updateMutation.isPending}
              className="w-full"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LinkFolderDialog
        siftId={id!}
        open={showLinkFolder}
        onOpenChange={setShowLinkFolder}
      />

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{extraction?.name}"?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All records and documents processed by this sift will be permanently deleted.
            </p>
            {siftFolders && siftFolders.items.length > 0 ? (
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-sm font-medium">Linked folders that will be unlinked:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                  {siftFolders.items.map((f) => (
                    <li key={f.id}>{f.path ?? f.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
