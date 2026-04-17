import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { TileSnapshot } from "@/api/cloud";

interface BarChartTileProps {
  title: string;
  snapshot: TileSnapshot | undefined;
  chartX: string | null;
  chartY: string | null;
  onBucketClick?: (bucketKey: string, bucketValue: string) => void;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.8)",
  "hsl(var(--primary) / 0.65)",
  "hsl(var(--primary) / 0.5)",
  "hsl(var(--primary) / 0.35)",
];

export function BarChartTile({
  snapshot,
  chartX,
  chartY,
  onBucketClick,
}: BarChartTileProps) {
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

  const handleClick = (entry: Record<string, unknown>) => {
    if (onBucketClick && xKey) {
      onBucketClick(xKey, String(entry[xKey] ?? ""));
    }
  };

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
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
          <Bar
            dataKey={yKey}
            radius={[3, 3, 0, 0]}
            cursor={onBucketClick ? "pointer" : "default"}
            onClick={(entry) => handleClick(entry as unknown as Record<string, unknown>)}
          >
            {(data as Record<string, unknown>[]).map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
