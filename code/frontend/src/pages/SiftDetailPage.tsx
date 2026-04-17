import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle,
  Download,
  FolderLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { ChatInterface } from "@/components/ChatInterface";
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
import { fetchFolders } from "@/api/folders";
import type { Folder } from "@/api/types";
import type { Aggregation, AggregationResult, SiftDocument } from "@/api/types";

function AggregationStatusIcon({ status }: { status: string }) {
  if (status === "generating") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "ready" || status === "active") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  return null;
}

function AggregationResultTable({ result }: { result: AggregationResult }) {
  const { results } = result;
  if (!results.length) return <p className="text-sm text-muted-foreground mt-2">No results.</p>;
  const cols = Object.keys(results[0]);
  return (
    <div className="overflow-x-auto rounded-md border mt-3 text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.slice(0, 50).map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2">
                  {row[c] === null || row[c] === undefined ? "—" : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AggregationCard({
  agg,
  siftId,
}: {
  agg: Aggregation;
  siftId: string;
}) {
  const [result, setResult] = useState<AggregationResult | null>(null);
  const runMutation = useRunAggregation(siftId);
  const regenerateMutation = useRegenerateAggregation(siftId);
  const deleteMutation = useDeleteAggregation(siftId);

  const handleRun = () => {
    runMutation.mutate(agg.id, {
      onSuccess: (data) => setResult(data),
    });
  };

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <AggregationStatusIcon status={agg.status} />
          <span className="font-medium text-sm truncate">{agg.name}</span>
          {agg.status === "error" && (
            <Badge variant="destructive" className="text-xs">error</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRun}
            disabled={runMutation.isPending || agg.status === "generating"}
            className="text-xs h-7 px-2"
          >
            {runMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Run"
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerateMutation.mutate(agg.id)}
            disabled={regenerateMutation.isPending || agg.status === "generating"}
            className="h-7 px-2"
            title="Regenerate pipeline"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteMutation.mutate(agg.id)}
            disabled={deleteMutation.isPending}
            className="h-7 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {agg.description && (
        <p className="text-xs text-muted-foreground">{agg.description}</p>
      )}
      {agg.aggregation_error && agg.status === "error" && (
        <p className="text-xs text-destructive">{agg.aggregation_error}</p>
      )}
      {agg.last_run_at && (
        <p className="text-xs text-muted-foreground">
          Last run: {new Date(agg.last_run_at).toLocaleString()}
        </p>
      )}
      {result && <AggregationResultTable result={result} />}
    </div>
  );
}

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
  const { data, isLoading } = useSiftDocuments(siftId, {
    refetchInterval: isIndexing ? 3000 : false,
  });

  const docs = data?.items ?? [];

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
    </div>
  );
}

function AggregationsPanel({ siftId }: { siftId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQuery, setNewQuery] = useState("");

  const { data: aggregations = [] } = useAggregations(siftId, {
    refetchInterval: (query: any) => {
      const hasGenerating = (query.state.data as Aggregation[] | undefined)?.some((a: Aggregation) => a.status === "generating");
      return hasGenerating ? 2000 : false;
    },
  });

  const createMutation = useCreateAggregation(siftId);

  const handleCreate = () => {
    if (!newName.trim() || !newQuery.trim()) return;
    createMutation.mutate(
      { name: newName, description: "", sift_id: siftId, aggregation_query: newQuery },
      {
        onSuccess: () => {
          setShowCreate(false);
          setNewName("");
          setNewQuery("");
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Named Aggregations</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 h-7 text-xs"
        >
          <Plus className="h-3 w-3" /> New Aggregation
        </Button>
      </div>

      {aggregations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No aggregations yet. Create one to build reusable queries.
        </p>
      ) : (
        <div className="space-y-3">
          {aggregations.map((agg) => (
            <AggregationCard key={agg.id} agg={agg} siftId={siftId} />
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Aggregation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Revenue by Client"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Query</Label>
              <Textarea
                placeholder="e.g. Total invoice amount grouped by client name"
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || !newQuery.trim() || createMutation.isPending}
              className="w-full"
            >
              {createMutation.isPending ? "Creating..." : "Create Aggregation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

  const loadFolders = async () => {
    setLoading(true);
    try {
      const data = await fetchFolders();
      setFolders(data);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (v) {
      setSearch("");
      setSelected(null);
      loadFolders();
    }
  };

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
  const updateMutation = useUpdateSift(id!);

  const isIndexing = (status: string) => status === "indexing";

  const { data: extraction, isLoading, error } = useSift(id!);

  useSift(id!, {
    refetchInterval: extraction && isIndexing(extraction.status) ? 2000 : false,
  });

  const { data: records, isLoading: recordsLoading } = useSiftRecords(id!, {
    refetchInterval: extraction && isIndexing(extraction.status) ? 3000 : false,
  });
  const uploadMutation = useUploadDocuments(id!);
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

  const progress =
    extraction.total_documents > 0
      ? (extraction.processed_documents / extraction.total_documents) * 100
      : 0;

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight truncate">{extraction.name}</h1>
            <StatusBadge status={extraction.status} />
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleEditOpen} title="Edit">
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
          {extraction.description && (
            <p className="text-muted-foreground text-sm mt-0.5 leading-relaxed">{extraction.description}</p>
          )}
        </div>
      </div>

      {/* Info card */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm items-start">
            <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-0.5 whitespace-nowrap">
              Instructions
            </dt>
            <dd className="text-foreground leading-relaxed">{extraction.instructions}</dd>

            {extraction.schema && (
              <>
                <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-0.5 whitespace-nowrap">
                  Schema
                </dt>
                <dd>
                  <code className="text-[11px] font-mono bg-muted/80 border border-border/60 px-2 py-1 rounded-md leading-none inline-block text-foreground/80">
                    {extraction.schema}
                  </code>
                </dd>
              </>
            )}

            <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-0.5 whitespace-nowrap">
              Mode
            </dt>
            <dd className="text-foreground/80">
              {extraction.multi_record
                ? "Multi-record — one document → multiple rows"
                : "Single record per document"}
            </dd>

            <dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-0.5 whitespace-nowrap">
              Folders
            </dt>
            <dd className="flex flex-wrap items-center gap-1.5 min-h-[22px]">
              {foldersLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : siftFolders && siftFolders.items.length > 0 ? (
                siftFolders.items.map((f) => (
                  <button
                    key={f.id}
                    className="text-primary hover:underline text-sm font-mono"
                    onClick={() => navigate(`/folders?folder=${f.id}`)}
                    title={f.name}
                  >
                    {f.path ?? f.name}
                  </button>
                ))
              ) : (
                <span className="text-muted-foreground text-sm">None</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                onClick={() => setShowLinkFolder(true)}
              >
                <FolderLink className="h-3 w-3" />
                Link
              </Button>
            </dd>
          </dl>

          {extraction.error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription className="break-all">{extraction.error}</AlertDescription>
            </Alert>
          )}

          {isIndexing(extraction.status) && extraction.total_documents > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="font-medium text-amber-600">Processing documents…</span>
                <span className="font-mono tabular-nums">
                  {extraction.processed_documents}
                  <span className="text-muted-foreground/60">/{extraction.total_documents}</span>
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
          ) : (
            <><Upload className="h-4 w-4 mr-2" />Upload Documents</>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => reindexMutation.mutate()}
          disabled={reindexMutation.isPending || isIndexing(extraction.status)}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Reindex
        </Button>
        <Button
          variant="outline"
          onClick={() => exportMutation.mutate({ id: id!, name: extraction.name })}
          disabled={exportMutation.isPending || !records?.length}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
        <Button variant="outline" onClick={handleDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>

      {/* Mutation errors */}
      {uploadMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>Upload failed: {(uploadMutation.error as Error).message}</AlertDescription>
        </Alert>
      )}
      {reindexMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>Reindex failed: {(reindexMutation.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Edit Dialog */}
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

      {/* Link Folder Dialog */}
      <LinkFolderDialog
        siftId={id!}
        open={showLinkFolder}
        onOpenChange={setShowLinkFolder}
      />

      {/* Delete Confirmation Dialog */}
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

      {/* Tabs */}
      <Tabs defaultValue="records">
        <TabsList>
          <TabsTrigger value="records">
            Records {records && records.length > 0 && `(${records.length})`}
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents {extraction.total_documents > 0 && `(${extraction.total_documents})`}
          </TabsTrigger>
          <TabsTrigger value="query">Query</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>
        <TabsContent value="records" className="mt-4">
          <RecordsTable records={records ?? []} isLoading={recordsLoading} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsPanel siftId={id!} isIndexing={isIndexing(extraction.status)} />
        </TabsContent>
        <TabsContent value="query" className="mt-4 space-y-8">
          <AggregationsPanel siftId={id!} />
          <div>
            <h3 className="font-medium text-sm mb-4">Ad-hoc Query</h3>
            <QueryPanel siftId={id!} />
          </div>
        </TabsContent>
        <TabsContent value="chat" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ChatInterface siftId={id!} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
