import type { TileSnapshot } from "@/api/cloud";

interface KpiTileProps {
  title: string;
  snapshot: TileSnapshot | undefined;
}

function extractValue(result: Record<string, unknown>[]): string {
  if (!result || result.length === 0) return "—";
  const row = result[0];
  // Look for common numeric value keys
  for (const key of ["value", "count", "total", "sum", "avg"]) {
    if (row[key] !== undefined && row[key] !== null) {
      const v = row[key];
      if (typeof v === "number") {
        // Format large numbers
        if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
        if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
        return Number.isInteger(v) ? String(v) : v.toFixed(2);
      }
      return String(v);
    }
  }
  // Fall back to first numeric value in the row
  for (const val of Object.values(row)) {
    if (typeof val === "number") {
      if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(1) + "M";
      if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(1) + "K";
      return Number.isInteger(val) ? String(val) : val.toFixed(2);
    }
  }
  return "—";
}

export function KpiTile({ title, snapshot }: KpiTileProps) {
  const value = snapshot ? extractValue(snapshot.result) : null;

  return (
    <div className="flex flex-col items-center justify-center h-full py-4 select-none">
      {value === null ? (
        <div className="h-10 w-20 bg-muted animate-pulse rounded" />
      ) : (
        <p className="text-4xl font-bold tracking-tight text-foreground">{value}</p>
      )}
      <p className="mt-2 text-sm text-muted-foreground text-center leading-snug">{title}</p>
    </div>
  );
}
