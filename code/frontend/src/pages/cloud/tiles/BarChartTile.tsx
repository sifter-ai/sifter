import { BarChart2 } from "lucide-react";
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

// Gradient-ish palette: primary plus complementary warm accents. Cycles across bars.
const PALETTE = [
  "hsl(263 72% 58%)",
  "hsl(263 72% 66%)",
  "hsl(40 92% 58%)",
  "hsl(263 72% 74%)",
  "hsl(15 85% 62%)",
  "hsl(263 55% 80%)",
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
      <div className="flex items-end gap-2 h-full pb-2 px-1">
        {[0.4, 0.7, 0.55, 0.85, 0.5, 0.3].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-muted/60 animate-pulse rounded-sm"
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>
    );
  }

  // Empty data — or single row where yKey isn't a number
  const hasNumericY = data.some((r) => typeof (r as Record<string, unknown>)[yKey] === "number");
  if (data.length === 0 || !hasNumericY) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
        <BarChart2 className="h-6 w-6 text-muted-foreground/30" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground/70 max-w-[220px] leading-relaxed">
          {data.length === 0
            ? "No data returned for this pipeline."
            : "Result doesn't contain a numeric field to chart."}
        </p>
      </div>
    );
  }

  const handleClick = (entry: Record<string, unknown>) => {
    if (onBucketClick && xKey) {
      onBucketClick(xKey, String(entry[xKey] ?? ""));
    }
  };

  return (
    <div className="h-full w-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
        <BarChart
          data={data as Record<string, unknown>[]}
          margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
          barCategoryGap="25%"
        >
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="hsl(var(--border))"
            strokeOpacity={0.6}
            vertical={false}
          />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
              boxShadow: "0 8px 24px -10px rgba(70,30,120,0.2)",
              padding: "8px 10px",
            }}
            labelStyle={{
              color: "hsl(var(--foreground))",
              fontWeight: 600,
              marginBottom: 2,
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar
            dataKey={yKey}
            radius={[4, 4, 0, 0]}
            cursor={onBucketClick ? "pointer" : "default"}
            onClick={(entry) => handleClick(entry as unknown as Record<string, unknown>)}
          >
            {(data as Record<string, unknown>[]).map((_, index) => (
              <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
