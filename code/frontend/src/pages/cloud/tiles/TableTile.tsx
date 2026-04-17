import { useState } from "react";
import { ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import type { TileSnapshot } from "@/api/cloud";

interface TableTileProps {
  title: string;
  snapshot: TileSnapshot | undefined;
}

const PAGE_SIZE = 10;

function formatCell(v: unknown): { text: string; numeric: boolean } {
  if (v === null || v === undefined) return { text: "—", numeric: false };
  if (typeof v === "number") {
    const text = Number.isInteger(v)
      ? v.toLocaleString("en-US")
      : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return { text, numeric: true };
  }
  if (typeof v === "boolean") return { text: v ? "true" : "false", numeric: false };
  return { text: String(v), numeric: false };
}

export function TableTile({ snapshot }: TableTileProps) {
  const [page, setPage] = useState(0);
  const rows = snapshot?.result ?? [];

  if (!snapshot) {
    return (
      <div className="flex flex-col h-full py-2">
        <div className="flex gap-4 pb-2 border-b border-border/60">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 flex-1 bg-muted/60 animate-pulse rounded-sm" />
          ))}
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-4 py-2.5 border-b border-border/40 last:border-0">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-3 flex-1 bg-muted/40 animate-pulse rounded-sm" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
        <Table2 className="h-6 w-6 text-muted-foreground/30" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground/70">No records returned.</p>
      </div>
    );
  }

  const cols = Object.keys(rows[0]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full -mx-2">
      <div className="flex-1 overflow-auto px-2">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className="px-3 py-2.5 text-left font-mono text-[10px] font-medium tracking-[0.1em] text-muted-foreground/70 uppercase whitespace-nowrap border-b border-border"
                >
                  {c.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={i}
                className="group border-b border-border/40 last:border-0 transition-colors hover:bg-primary/[0.03]"
              >
                {cols.map((c) => {
                  const cell = formatCell(row[c]);
                  return (
                    <td
                      key={c}
                      className={`px-3 py-2.5 max-w-[260px] truncate text-foreground/85 ${
                        cell.numeric ? "font-mono tabular-nums text-right" : ""
                      }`}
                      title={cell.text}
                    >
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2.5 mt-1 text-xs shrink-0 border-t border-border/60">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </button>
          <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground/70 uppercase tabular-nums">
            Page {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
          >
            Next <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
