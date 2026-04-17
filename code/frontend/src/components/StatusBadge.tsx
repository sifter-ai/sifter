import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SiftStatus } from "@/api/types";

const STATUS_CONFIG: Record<
  SiftStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "pending" | "outline"; dot?: string }
> = {
  active:   { label: "Active",   variant: "success",     dot: "bg-emerald-500" },
  indexing: { label: "Indexing", variant: "warning" },
  paused:   { label: "Paused",   variant: "pending",     dot: "bg-slate-400" },
  error:    { label: "Error",    variant: "destructive", dot: "bg-red-500" },
};

interface StatusBadgeProps {
  status: SiftStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, variant, dot } = STATUS_CONFIG[status] ?? { label: status, variant: "outline" };
  return (
    <Badge variant={variant as any}>
      {status === "indexing" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : dot ? (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      ) : null}
      {label}
    </Badge>
  );
}
