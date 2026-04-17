import type { TileSnapshot } from "@/api/cloud";

interface KpiTileProps {
  title: string;
  snapshot: TileSnapshot | undefined;
}

interface FormattedValue {
  display: string;
  suffix?: string;
}

function formatNumber(v: number): FormattedValue {
  if (Math.abs(v) >= 1_000_000_000) return { display: (v / 1_000_000_000).toFixed(1).replace(/\.0$/, ""), suffix: "B" };
  if (Math.abs(v) >= 1_000_000)     return { display: (v / 1_000_000).toFixed(1).replace(/\.0$/, ""), suffix: "M" };
  if (Math.abs(v) >= 10_000)        return { display: (v / 1_000).toFixed(1).replace(/\.0$/, ""), suffix: "K" };
  if (Math.abs(v) >= 1_000)         return { display: v.toLocaleString("en-US", { maximumFractionDigits: 0 }) };
  return { display: Number.isInteger(v) ? String(v) : v.toFixed(2) };
}

function extractValue(result: Record<string, unknown>[]): FormattedValue | null {
  if (!result || result.length === 0) return null;
  const row = result[0];
  for (const key of ["value", "count", "total", "sum", "avg"]) {
    if (row[key] !== undefined && row[key] !== null) {
      const v = row[key];
      if (typeof v === "number") return formatNumber(v);
      return { display: String(v) };
    }
  }
  for (const val of Object.values(row)) {
    if (typeof val === "number") return formatNumber(val);
  }
  return null;
}

export function KpiTile({ snapshot }: KpiTileProps) {
  const formatted = snapshot ? extractValue(snapshot.result) : null;

  return (
    <div className="relative flex flex-col justify-center h-full py-3 select-none">
      {/* Decorative grid lines — subtle atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />
      {formatted === null ? (
        <div className="space-y-2">
          <div className="h-14 w-28 bg-muted/60 animate-pulse rounded-md" />
          <div className="h-3 w-16 bg-muted/40 animate-pulse rounded-sm" />
        </div>
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[56px] leading-none font-bold tracking-[-0.03em] tabular-nums bg-gradient-to-br from-foreground to-foreground/75 bg-clip-text text-transparent">
            {formatted.display}
          </span>
          {formatted.suffix && (
            <span className="text-2xl font-semibold tracking-tight text-muted-foreground/80 tabular-nums">
              {formatted.suffix}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
