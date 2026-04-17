import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TileSnapshot } from "@/api/cloud";

interface LineChartTileProps {
  title: string;
  snapshot: TileSnapshot | undefined;
  chartX: string | null;
  chartY: string | null;
}

export function LineChartTile({ snapshot, chartX, chartY }: LineChartTileProps) {
  const data = snapshot?.result ?? [];
  const xKey = chartX ?? (data[0] ? Object.keys(data[0])[0] : "_id");
  const yKey = chartY ?? (data[0] ? Object.keys(data[0]).find((k) => k !== xKey) ?? "count" : "count");

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-full h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No data yet.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data as Record<string, unknown>[]}
          margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--primary))" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
