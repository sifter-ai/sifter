import { useNavigate } from "react-router-dom";
import { Plus, FileText, AlertCircle, Loader2, PauseCircle, CheckCircle2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SiftForm } from "@/components/SiftForm";
import { useSifts } from "@/hooks/useExtractions";
import type { Sift } from "@/api/types";

// Parse "client_name (string), date (string), amount (number)" → ["client_name", "date", "amount"]
function parseSchemaFields(schema: string | null): { name: string; type: string }[] {
  if (!schema) return [];
  return schema
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.+?)\s*\((.+?)\)$/);
      return m ? { name: m[1].trim(), type: m[2].trim() } : { name: s, type: "string" };
    });
}

function typeColor(type: string) {
  switch (type) {
    case "number": return "text-blue-600 bg-blue-50 border-blue-100";
    case "boolean": return "text-violet-600 bg-violet-50 border-violet-100";
    case "array": return "text-orange-600 bg-orange-50 border-orange-100";
    case "object": return "text-pink-600 bg-pink-50 border-pink-100";
    default: return "text-slate-600 bg-slate-50 border-slate-200";
  }
}

function StatusDot({ status }: { status: string }) {
  switch (status) {
    case "active":
      return (
        <span className="relative flex shrink-0 w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
        </span>
      );
    case "indexing":
      return <Loader2 className="h-3 w-3 text-amber-500 animate-spin shrink-0" />;
    case "error":
      return <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />;
    case "paused":
      return <PauseCircle className="h-3 w-3 text-slate-300 shrink-0" />;
    default:
      return <CheckCircle2 className="h-3 w-3 text-muted-foreground/40 shrink-0" />;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "active": return "Active";
    case "indexing": return "Indexing";
    case "error": return "Error";
    case "paused": return "Paused";
    default: return status;
  }
}

function statusTextColor(status: string) {
  switch (status) {
    case "active": return "text-emerald-600";
    case "indexing": return "text-amber-600";
    case "error": return "text-red-500";
    case "paused": return "text-slate-400";
    default: return "text-muted-foreground";
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SiftCard({ sift, onClick }: { sift: Sift; onClick: () => void }) {
  const fields = parseSchemaFields(sift.schema);
  const isIndexing = sift.status === "indexing";
  const progress =
    sift.total_documents > 0
      ? Math.round((sift.processed_documents / sift.total_documents) * 100)
      : 0;

  return (
    <div
      onClick={onClick}
      className={`
        group relative bg-card border border-border/60 rounded-xl cursor-pointer
        shadow-[0_1px_4px_0_hsl(var(--foreground)/0.04)]
        hover:shadow-[0_4px_20px_0_hsl(var(--foreground)/0.08)]
        hover:border-border/90
        transition-all duration-200
        flex flex-col
        overflow-hidden
      `}
    >
      {/* Indexing shimmer */}
      {isIndexing && (
        <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-[shimmer_1.8s_ease-in-out_infinite]"
            style={{ width: "200%" }}
          />
        </div>
      )}

      {/* Main content */}
      <div className="px-4 pt-4 pb-3 flex-1 flex flex-col gap-2.5">
        {/* Header row: status dot + name + date */}
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={sift.status} />
          <h2 className="font-semibold text-sm leading-tight truncate group-hover:text-primary transition-colors flex-1 min-w-0">
            {sift.name}
          </h2>
          {sift.multi_record && (
            <span title="Multi-record extraction" className="shrink-0">
              <Layers className="h-3 w-3 text-muted-foreground/40" />
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums font-mono">
            {formatDate(sift.created_at)}
          </span>
        </div>

        {/* Instructions preview — single line */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
          {sift.instructions || sift.description || "No description"}
        </p>

        {/* Schema fields */}
        {fields.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {fields.slice(0, 6).map((f) => (
              <span
                key={f.name}
                className={`inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded border ${typeColor(f.type)}`}
              >
                {f.name}
              </span>
            ))}
            {fields.length > 6 && (
              <span className="inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground/50 bg-muted/40 border-dashed border-border/40">
                +{fields.length - 6}
              </span>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground/40 bg-muted/30 border-dashed border-border/30 w-fit">
            schema inferred after first document
          </span>
        )}

        {/* Error */}
        {sift.status === "error" && sift.error && (
          <div className="flex items-center gap-1.5 min-w-0" title={sift.error}>
            <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
            <span className="text-xs text-red-600 truncate">{sift.error}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/40 bg-muted/15 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {isIndexing && sift.total_documents > 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-amber-600 tabular-nums">
                {sift.processed_documents}/{sift.total_documents} docs
              </span>
            </div>
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {sift.processed_documents > 0
                ? `${sift.processed_documents} doc${sift.processed_documents !== 1 ? "s" : ""}`
                : "No documents yet"}
            </span>
          )}
          {fields.length > 0 && (
            <>
              <span className="text-muted-foreground/25">·</span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {fields.length} field{fields.length !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
        <span className={`text-[10px] font-medium ${statusTextColor(sift.status)}`}>
          {statusLabel(sift.status)}
        </span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-2 w-2 rounded-full shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-4/5" />
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-5 w-14 rounded" />
          ))}
        </div>
      </div>
      <div className="px-4 py-2.5 border-t border-border/40 bg-muted/15">
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function SiftsPage() {
  const navigate = useNavigate();
  const { data: sifts, isLoading, error } = useSifts();

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sifts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI extraction pipelines — define once, run on every document
          </p>
        </div>
        <SiftForm
          trigger={
            <Button size="sm" className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              New Sift
            </Button>
          }
          onCreated={(id) => navigate(`/sifts/${id}`)}
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load sifts: {(error as Error).message}
        </div>
      )}

      {/* Empty state */}
      {sifts && sifts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <FileText className="h-7 w-7 text-primary/50" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-100 border-2 border-background flex items-center justify-center">
              <Plus className="h-2.5 w-2.5 text-emerald-600" />
            </div>
          </div>
          <p className="text-base font-semibold">No sifts yet</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
            A sift is an extraction pipeline. Define what fields to extract from your documents and Sifter will process them automatically.
          </p>
          <SiftForm
            trigger={
              <Button size="sm" className="mt-6 gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Create your first sift
              </Button>
            }
            onCreated={(id) => navigate(`/sifts/${id}`)}
          />
        </div>
      )}

      {/* Sift grid */}
      {sifts && sifts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sifts.map((sift) => (
            <SiftCard
              key={sift.id}
              sift={sift}
              onClick={() => navigate(`/sifts/${sift.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
