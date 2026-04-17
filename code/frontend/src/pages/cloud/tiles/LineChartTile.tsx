import { LineChart as LineIcon } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
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
      <div className="h-full w-full flex items-center justify-center min-h-[200px]">
        <div className="w-full h-32 bg-muted/60 animate-pulse rounded" />
      </div>
    );
  }

  const hasNumericY = data.some((r) => typeof (r as Record<string, unknown>)[yKey] === "number");
  if (data.length === 0 || !hasNumericY) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
        <LineIcon className="h-6 w-6 text-muted-foreground/30" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground/70 max-w-[220px] leading-relaxed">
          {data.length === 0 ? "No data returned for this pipeline." : "No numeric trend values to plot."}
        </p>
      </div>
    );
  }

  // Single data point — render a LineChart without area, otherwise use filled area for nicer visual
  const useArea = data.length > 1;

  return (
    <div className="h-full w-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
        {useArea ? (
          <AreaChart
            data={data as Record<string, unknown>[]}
            margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
          >
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(263 72% 58%)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(263 72% 58%)" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "0 8px 24px -10px rgba(70,30,120,0.2)",
                padding: "8px 10px",
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey={yKey}
              stroke="hsl(263 72% 58%)"
              strokeWidth={2.25}
              fill="url(#areaFill)"
              dot={{ r: 2.5, fill: "hsl(263 72% 58%)", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            />
          </AreaChart>
        ) : (
          <LineChart
            data={data as Record<string, unknown>[]}
            margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Line type="monotone" dataKey={yKey} stroke="hsl(263 72% 58%)" strokeWidth={2.25} dot={{ r: 4, fill: "hsl(263 72% 58%)" }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
