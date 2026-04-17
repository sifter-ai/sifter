interface UsageBarProps {
  label: string;
  value: number;
  limit: number | null;
  unit?: string;
}

function formatValue(v: number, unit?: string) {
  if (unit === "bytes") {
    if (v >= 1_073_741_824) return `${(v / 1_073_741_824).toFixed(1)} GB`;
    if (v >= 1_048_576) return `${(v / 1_048_576).toFixed(1)} MB`;
    return `${(v / 1024).toFixed(0)} KB`;
  }
  return String(v);
}

export function UsageBar({ label, value, limit, unit }: UsageBarProps) {
  if (limit === null) return null;

  const pct = Math.min(100, (value / limit) * 100);
  const barColor =
    pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";

  const limitLabel = unit === "bytes" ? formatValue(limit * 1_048_576, "bytes") : String(limit);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatValue(value, unit)} / {limitLabel}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
