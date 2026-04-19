import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface DataResultsTableProps {
  rows: Record<string, unknown>[];
  /** Optional column order — defaults to keys of first row */
  columns?: string[];
  /** Hide the search box (useful for tiny result sets) */
  hideSearch?: boolean;
  /** Cap visible rows and show a "+N more" footer instead of scrolling */
  maxRows?: number;
  /** Custom empty-state message */
  emptyMessage?: string;
}

type SortDir = "asc" | "desc" | null;
interface SortState { key: string; dir: SortDir }

function isNumericValue(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground/40 select-none">—</span>;
  if (typeof value === "boolean")
    return (
      <span className={value ? "text-emerald-600 font-medium" : "text-slate-400"}>
        {value ? "true" : "false"}
      </span>
    );
  if (isNumericValue(value))
    return <span className="tabular-nums font-mono">{value.toLocaleString()}</span>;
  if (typeof value === "object")
    return (
      <span
        className="text-muted-foreground italic text-[11px] truncate block"
        title={JSON.stringify(value)}
      >
        {JSON.stringify(value)}
      </span>
    );
  const str = String(value);
  return <span title={str}>{str}</span>;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function nextDir(current: SortDir): SortDir {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || dir === null)
    return <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60 transition-opacity" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-primary" />
  ) : (
    <ArrowDown className="h-3 w-3 text-primary" />
  );
}

export function DataResultsTable({
  rows,
  columns,
  hideSearch = false,
  maxRows,
  emptyMessage = "No results returned.",
}: DataResultsTableProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });

  const cols = useMemo(() => {
    if (columns && columns.length) return columns;
    if (!rows.length) return [];
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [columns, rows]);

  const numericCols = useMemo(() => {
    const s = new Set<string>();
    for (const c of cols) {
      for (const r of rows) {
        if (r[c] === null || r[c] === undefined) continue;
        if (isNumericValue(r[c])) s.add(c);
        else {
          s.delete(c);
          break;
        }
      }
    }
    return s;
  }, [cols, rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      cols.some((c) => {
        const v = r[c];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, cols, search]);

  const sorted = useMemo(() => {
    if (!sort.key || sort.dir === null) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = compareValues(a[sort.key], b[sort.key]);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const visible = maxRows ? sorted.slice(0, maxRows) : sorted;
  const truncated = maxRows ? Math.max(0, sorted.length - maxRows) : 0;

  const toggleSort = (col: string) => {
    setSort((prev) => {
      if (prev.key !== col) return { key: col, dir: "asc" };
      const dir = nextDir(prev.dir);
      return dir === null ? { key: "", dir: null } : { key: col, dir };
    });
  };

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground/80">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hideSearch && rows.length > 5 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter results…"
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
      )}

      <div className="overflow-x-auto rounded-lg border border-border/70 shadow-[0_1px_4px_0_hsl(var(--foreground)/0.04)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/60">
              {cols.map((c) => {
                const active = sort.key === c;
                const isNum = numericCols.has(c);
                return (
                  <th
                    key={c}
                    className={`px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wide text-[10px] whitespace-nowrap ${
                      isNum ? "text-right" : "text-left"
                    }`}
                  >
                    <button
                      className={`flex items-center gap-1 group hover:text-foreground transition-colors ${
                        isNum ? "ml-auto" : ""
                      }`}
                      onClick={() => toggleSort(c)}
                    >
                      {c}
                      <SortIcon active={active} dir={sort.dir} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={cols.length}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  No rows match your filter.{" "}
                  <button
                    onClick={() => setSearch("")}
                    className="text-primary hover:underline"
                  >
                    Clear
                  </button>
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b last:border-0 transition-colors hover:bg-primary/[0.03] ${
                    i % 2 === 1 ? "bg-muted/20" : ""
                  }`}
                >
                  {cols.map((c) => {
                    const isNum = numericCols.has(c);
                    return (
                      <td
                        key={c}
                        className={`px-3 py-2 font-mono text-[11px] text-foreground/85 max-w-[220px] truncate ${
                          isNum ? "text-right" : ""
                        }`}
                      >
                        <CellValue value={row[c]} />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-mono">
            {search && sorted.length !== rows.length ? (
              <>
                <span className="text-foreground">{sorted.length}</span> of {rows.length} rows
              </>
            ) : (
              <>
                {rows.length} row{rows.length !== 1 ? "s" : ""} · {cols.length} field
                {cols.length !== 1 ? "s" : ""}
              </>
            )}
            {truncated > 0 && (
              <span className="text-muted-foreground/60"> · showing first {maxRows}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
