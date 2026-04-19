import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, CornerDownLeft, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataResultsTable } from "@/components/DataResultsTable";
import { useQueryExtraction } from "@/hooks/useExtractions";

interface QueryPanelProps {
  siftId: string;
}

function PipelineToggle({ pipeline }: { pipeline: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        View pipeline
      </button>
      {open && (
        <pre className="mt-2 text-[11px] bg-muted/40 text-foreground/80 p-3 rounded-lg overflow-x-auto font-mono border border-border/50 leading-relaxed">
          {JSON.stringify(pipeline, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  onRun,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onRun();
        }
      }}
      placeholder={placeholder}
      rows={2}
      disabled={disabled}
      className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none max-h-[240px] disabled:opacity-60"
    />
  );
}

export function QueryPanel({ siftId }: QueryPanelProps) {
  const [query, setQuery] = useState("");
  const { mutate, data, isPending, error, reset } = useQueryExtraction();

  const runQuery = () => {
    if (!query.trim() || isPending) return;
    mutate({ id: siftId, query });
  };

  return (
    <div className="space-y-5">
      {/* Composer */}
      <div>
        <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm focus-within:border-amber-400/40 focus-within:shadow-[0_6px_22px_-10px_hsl(40_92%_50%/0.22)] transition-all">
          <AutoTextarea
            value={query}
            onChange={(v) => {
              setQuery(v);
              if (data) reset();
            }}
            onRun={runQuery}
            placeholder="Ask a question in natural language — e.g. 'Total revenue by client' or 'Top 10 invoices by value'"
            disabled={isPending}
          />
          <Button
            onClick={runQuery}
            disabled={isPending || !query.trim()}
            size="sm"
            className="h-8 shrink-0 gap-1.5 bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-white"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3 w-3" strokeWidth={2.5} />
            )}
            {isPending ? "Running…" : "Run"}
          </Button>
        </div>
        <p className="mt-2 flex items-center justify-end gap-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground/55">
          <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">
            ⌘
          </kbd>
          <span>+</span>
          <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">
            <CornerDownLeft className="h-2.5 w-2.5 inline" />
          </kbd>
          <span>to run</span>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="space-y-4">
          <DataResultsTable rows={data.results} />
          {data.pipeline && data.pipeline.length > 0 && (
            <PipelineToggle pipeline={data.pipeline} />
          )}
        </div>
      )}
    </div>
  );
}
