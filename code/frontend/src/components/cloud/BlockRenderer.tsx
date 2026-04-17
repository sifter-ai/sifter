import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown } from "lucide-react";
import type { ChatBlock } from "@/api/cloud";

const COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

function TextBlock({ block }: { block: ChatBlock }) {
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{block.content}</p>;
}

function BigNumberBlock({ block }: { block: ChatBlock }) {
  return (
    <div className="rounded-lg border p-6 text-center space-y-1">
      {block.title && <p className="text-sm text-muted-foreground">{block.title}</p>}
      <p className="text-4xl font-bold tabular-nums">{block.value}</p>
      {block.label && <p className="text-xs text-muted-foreground">{block.label}</p>}
    </div>
  );
}

function TableBlock({ block }: { block: ChatBlock }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns: ColumnDef<Record<string, unknown>>[] =
    (block.columns ?? []).map((col) => ({
      accessorKey: col,
      header: ({ column }: any) => (
        <button
          className="flex items-center gap-1 text-left font-medium"
          onClick={() => column.toggleSorting()}
        >
          {col}
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        </button>
      ),
    }));

  const table = useReactTable({
    data: block.rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-md border overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2 text-left">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t hover:bg-muted/30">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartBlock({ block }: { block: ChatBlock }) {
  const data = block.chart_data ?? [];
  const type = block.chart_type ?? "bar";

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        {type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : type === "line" ? (
          <LineChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke={COLORS[0]} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function RecordsListBlock({ block }: { block: ChatBlock }) {
  const ids = block.record_ids ?? [];
  return (
    <div className="space-y-1">
      {block.title && <p className="text-sm font-medium">{block.title}</p>}
      <ul className="space-y-0.5">
        {ids.slice(0, 20).map((id) => (
          <li key={id}>
            <Link
              to={`/records/${id}`}
              className="text-sm text-primary hover:underline font-mono"
            >
              {id}
            </Link>
          </li>
        ))}
        {ids.length > 20 && (
          <li className="text-xs text-muted-foreground">+{ids.length - 20} more</li>
        )}
      </ul>
    </div>
  );
}

export function BlockRenderer({ block }: { block: ChatBlock }) {
  switch (block.type) {
    case "text": return <TextBlock block={block} />;
    case "big_number": return <BigNumberBlock block={block} />;
    case "table": return <TableBlock block={block} />;
    case "chart": return <ChartBlock block={block} />;
    case "records_list": return <RecordsListBlock block={block} />;
    default: return null;
  }
}
