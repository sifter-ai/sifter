import { useState } from "react";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQueryExtraction } from "@/hooks/useExtractions";

interface QueryPanelProps {
  siftId: string;
}

function ResultsTable({ results }: { results: Record<string, unknown>[] }) {
  if (!results.length) return <p className="text-muted-foreground text-sm">No results returned.</p>;
  const cols = Object.keys(results[0]);
  return (
    <div className="overflow-x-auto rounded-md border mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {cols.map((c) => (
              <th key={c} className="px-4 py-2 text-left font-medium text-muted-foreground">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              {cols.map((c) => (
                <td key={c} className="px-4 py-2">{formatValue(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function PipelineToggle({ pipeline }: { pipeline: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        View pipeline
      </button>
      {open && (
        <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-x-auto">
          {JSON.stringify(pipeline, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function QueryPanel({ siftId }: QueryPanelProps) {
  const [query, setQuery] = useState("");
  const { mutate, data, isPending, error } = useQueryExtraction();

  const runQuery = () => {
    if (!query.trim()) return;
    mutate({ id: siftId, query });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Textarea
          placeholder="Ask a question about your data... e.g. 'Total amount by client' or 'Show top 10 invoices by value'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="resize-none"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runQuery();
          }}
        />
      </div>
      <Button onClick={runQuery} disabled={isPending || !query.trim()}>
        <Play className="h-4 w-4 mr-2" />
        {isPending ? "Running..." : "Run Query"}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}
      {data && (
        <>
          <ResultsTable results={data.results} />
          {data.pipeline && data.pipeline.length > 0 && (
            <PipelineToggle pipeline={data.pipeline} />
          )}
        </>
      )}
    </div>
  );
}
