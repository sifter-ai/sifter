import { useState } from "react";
import type { TileSnapshot } from "@/api/cloud";

interface TableTileProps {
  title: string;
  snapshot: TileSnapshot | undefined;
}

const PAGE_SIZE = 10;

export function TableTile({ snapshot }: TableTileProps) {
  const [page, setPage] = useState(0);
  const rows = snapshot?.result ?? [];

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="space-y-2 w-full px-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No records yet.
      </div>
    );
  }

  const cols = Object.keys(rows[0]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b">
              {cols.map((c) => (
                <th key={c} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1.5 max-w-[200px] truncate">
                    {row[c] === null || row[c] === undefined ? "—" : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1 border-t text-xs text-muted-foreground shrink-0">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-0.5 rounded hover:bg-muted disabled:opacity-40"
          >
            Prev
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-0.5 rounded hover:bg-muted disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
