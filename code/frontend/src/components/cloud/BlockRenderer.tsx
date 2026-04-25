import {
  BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
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

const PALETTE = [
  "hsl(263 72% 58%)",
  "hsl(263 72% 66%)",
  "hsl(40 92% 58%)",
  "hsl(263 72% 74%)",
  "hsl(15 85% 62%)",
  "hsl(263 55% 80%)",
];

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 8px 24px -10px rgba(70,30,120,0.2)",
  padding: "8px 10px",
};
const LABEL_STYLE = { color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: 2 };
const TICK_STYLE = { fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" };

function formatKpiValue(v: number): { display: string; suffix?: string } {
  if (Math.abs(v) >= 1_000_000_000) return { display: (v / 1_000_000_000).toFixed(1).replace(/\.0$/, ""), suffix: "B" };
  if (Math.abs(v) >= 1_000_000)     return { display: (v / 1_000_000).toFixed(1).replace(/\.0$/, ""), suffix: "M" };
  if (Math.abs(v) >= 10_000)        return { display: (v / 1_000).toFixed(1).replace(/\.0$/, ""), suffix: "K" };
  if (Math.abs(v) >= 1_000)         return { display: v.toLocaleString("en-US", { maximumFractionDigits: 0 }) };
  return { display: Number.isInteger(v) ? String(v) : v.toFixed(2) };
}

function extractKpiValue(result: Record<string, unknown>[]): { display: string; suffix?: string } | null {
  if (!result?.length) return null;
  const row = result[0];
  for (const key of ["value", "count", "total", "sum", "avg"]) {
    if (row[key] != null) {
      const v = row[key];
      if (typeof v === "number") return formatKpiValue(v);
      return { display: String(v) };
    }
  }
  for (const val of Object.values(row)) {
    if (typeof val === "number") return formatKpiValue(val);
  }
  return null;
}

function TextBlock({ block }: { block: ChatBlock }) {
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{block.content}</p>;
}

function BigNumberBlock({ block }: { block: ChatBlock }) {
  const result = (block as any).result as Record<string, unknown>[] | undefined;
  const formatted = result ? extractKpiValue(result) : null;
  const rawValue = block.value;

  return (
    <div className="relative flex flex-col justify-center py-6 px-4 select-none">
      {block.title && (
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70 mb-3">
          {block.title}
        </p>
      )}
      {formatted ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[56px] leading-none font-bold tracking-[-0.03em] tabular-nums bg-gradient-to-br from-foreground to-foreground/75 bg-clip-text text-transparent">
            {formatted.display}
          </span>
          {formatted.suffix && (
            <span className="text-2xl font-semibold tracking-tight text-muted-foreground/80">
              {formatted.suffix}
            </span>
          )}
        </div>
      ) : (
        <p className="text-4xl font-bold tabular-nums">{rawValue ?? "—"}</p>
      )}
      {block.label && <p className="text-xs text-muted-foreground mt-1">{block.label}</p>}
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
  const data: Record<string, unknown>[] = (block.chart_data as Record<string, unknown>[]) ?? [];
  const type = block.chart_type ?? "bar";
  const xKey: string = (block as any).x_key ?? (data[0] ? Object.keys(data[0])[0] : "name");
  const yKey: string = (block as any).y_key ?? (data[0] ? (Object.keys(data[0]).find((k) => k !== xKey) ?? "value") : "value");

  const useArea = type === "line" && data.length > 1;

  return (
    <div className="w-full min-h-[200px] h-64">
      <ResponsiveContainer width="100%" height="100%">
        {type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} label>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
          </PieChart>
        ) : useArea ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(263 72% 58%)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(263 72% 58%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey={xKey} tick={TICK_STYLE} tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} tickMargin={4} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
            <Area type="monotone" dataKey={yKey} stroke="hsl(263 72% 58%)" strokeWidth={2.25} fill="url(#areaFill)"
              dot={{ r: 2.5, fill: "hsl(263 72% 58%)", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} />
          </AreaChart>
        ) : type === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey={xKey} tick={TICK_STYLE} tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} tickMargin={4} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
            <Line type="monotone" dataKey={yKey} stroke="hsl(263 72% 58%)" strokeWidth={2.25} dot={{ r: 4, fill: "hsl(263 72% 58%)" }} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 4 }} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey={xKey} tick={TICK_STYLE} tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} tickMargin={4} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} itemStyle={{ color: "hsl(var(--foreground))" }} />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
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
