import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSubscription, fetchUsage } from "@/api/cloud";
import { useSifts } from "@/hooks/useExtractions";
import { Zap } from "lucide-react";

const PLAN_STYLE: Record<string, { dot: string; badge: string }> = {
  free:       { dot: "bg-zinc-400",    badge: "text-zinc-500" },
  starter:    { dot: "bg-sky-500",     badge: "text-sky-600" },
  pro:        { dot: "bg-violet-500",  badge: "text-violet-600" },
  business:   { dot: "bg-amber-500",   badge: "text-amber-600" },
  scale:      { dot: "bg-emerald-500", badge: "text-emerald-600" },
  enterprise: { dot: "bg-yellow-500",  badge: "text-yellow-600" },
};

const UPGRADE_PLANS = new Set(["free", "starter"]);

export function SidebarPlanWidget() {
  const { data: sub } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
    staleTime: 60_000,
  });

  const { data: siftsData } = useSifts();
  const hasIndexing = siftsData?.items?.some((s) => s?.status === "indexing") ?? false;

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: fetchUsage,
    staleTime: 30_000,
    refetchInterval: hasIndexing ? 5_000 : false,
  });

  if (!sub || !usage) return null;

  const planCode = sub.plan_code ?? "free";
  const style = PLAN_STYLE[planCode] ?? PLAN_STYLE.free;
  const showUpgrade = UPGRADE_PLANS.has(planCode);

  const used = usage.docs_processed ?? 0;
  const limit = usage.docs_limit;
  const pct = limit ? Math.min(100, (used / limit) * 100) : null;

  const barColor =
    pct === null ? "bg-primary"
    : pct >= 100  ? "bg-destructive"
    : pct >= 80   ? "bg-amber-500"
    : "bg-primary";

  const usedFmt = used.toLocaleString();
  const limitFmt = limit ? limit.toLocaleString() : "∞";

  return (
    <Link
      to="/settings/billing"
      className="group mx-2 mb-1 block rounded-lg px-2.5 py-2.5 hover:bg-muted/60 transition-colors"
    >
      {/* Plan name + upgrade */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
          <span className={`text-[11px] font-semibold tracking-wide uppercase ${style.badge}`}>
            {sub.plan_name ?? planCode}
          </span>
        </div>
        {showUpgrade && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-primary opacity-70 group-hover:opacity-100 transition-opacity">
            <Zap className="h-2.5 w-2.5" />
            Upgrade
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-[3px] rounded-full bg-muted overflow-hidden mb-1.5">
        {pct !== null ? (
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-full bg-primary/20 rounded-full" />
        )}
      </div>

      {/* Doc count */}
      <p className="text-[11px] text-muted-foreground leading-none">
        <span className="text-foreground/80 font-medium tabular-nums">{usedFmt}</span>
        {" / "}
        <span className="tabular-nums">{limitFmt}</span>
        {" extractions"}
        {pct !== null && pct >= 80 && (
          <span className={`ml-1.5 font-semibold ${pct >= 100 ? "text-destructive" : "text-amber-500"}`}>
            {Math.round(pct)}%
          </span>
        )}
      </p>
    </Link>
  );
}
