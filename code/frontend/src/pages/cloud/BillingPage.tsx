import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowRight, CreditCard, ExternalLink, Zap } from "lucide-react";
import { fetchSubscription, fetchUsage, openBillingPortal, startCheckout, upgradeSubscription } from "@/api/cloud";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Plan catalogue (must match plans.py) ────────────────────────────────────

const PLANS = [
  { code: "free",     name: "Free",     price: 0,   docs: 10,     docsLabel: "10" },
  { code: "starter",  name: "Starter",  price: 19,  docs: 500,    docsLabel: "500" },
  { code: "pro",      name: "Pro",      price: 49,  docs: 3_000,  docsLabel: "3,000" },
  { code: "business", name: "Business", price: 149, docs: 15_000, docsLabel: "15,000" },
  { code: "scale",    name: "Scale",    price: 399, docs: 50_000, docsLabel: "50,000" },
] as const;

const PLAN_DOT: Record<string, string> = {
  free:     "bg-zinc-400",
  starter:  "bg-sky-500",
  pro:      "bg-violet-500",
  business: "bg-amber-500",
  scale:    "bg-emerald-500",
};

const PLAN_RING: Record<string, string> = {
  free:     "ring-zinc-200 dark:ring-zinc-700",
  starter:  "ring-sky-200 dark:ring-sky-900",
  pro:      "ring-violet-200 dark:ring-violet-900",
  business: "ring-amber-200 dark:ring-amber-900",
  scale:    "ring-emerald-200 dark:ring-emerald-900",
};

const PLAN_BG: Record<string, string> = {
  free:     "bg-zinc-50 dark:bg-zinc-900/40",
  starter:  "bg-sky-50 dark:bg-sky-950/40",
  pro:      "bg-violet-50 dark:bg-violet-950/40",
  business: "bg-amber-50 dark:bg-amber-950/30",
  scale:    "bg-emerald-50 dark:bg-emerald-950/30",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:   { label: "Active",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" },
  trial:    { label: "Trial",    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-400" },
  past_due: { label: "Past due", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400" },
  canceled: { label: "Canceled", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

// ─── UsageRow ────────────────────────────────────────────────────────────────

function UsageRow({
  label,
  display,
  bar,
}: {
  label: string;
  value: number;
  limit: number | null;
  display: string;
  bar: { pct: number | null; color: string };
}) {
  const { pct, color } = bar;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-foreground/60 font-medium">{label}</span>
        <span className="text-foreground/70 tabular-nums">
          {display}
          {pct !== null && pct >= 80 && (
            <span className={`ml-2 font-semibold ${pct >= 100 ? "text-destructive" : "text-amber-500"}`}>
              {Math.round(pct)}%
            </span>
          )}
        </span>
      </div>
      <div className="h-[3px] rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        {pct !== null ? (
          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-full bg-primary/15 rounded-full" />
        )}
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
  });

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: fetchUsage,
    staleTime: 30_000,
  });

  const portalMutation = useMutation({
    mutationFn: openBillingPortal,
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const hasActiveSub = sub?.status === "active" || sub?.status === "trial";

  // New subscribers → Stripe Checkout (new session)
  const checkoutMutation = useMutation({
    mutationFn: (plan_code: string) =>
      startCheckout(plan_code, window.location.href, window.location.href),
    onSuccess: ({ checkout_url }) => { window.location.href = checkout_url; },
  });

  // Existing subscribers → modify subscription, pay only the prorated difference
  const upgradeMutation = useMutation({
    mutationFn: (plan_code: string) => upgradeSubscription(plan_code),
  });

  const currentPlan = PLANS.find((p) => p.code === sub?.plan_code) ?? PLANS[0];
  const currentIdx  = PLANS.indexOf(currentPlan);

  // Usage helpers
  function usageBar(value: number, limit: number | null) {
    const pct = limit ? Math.min(100, (value / limit) * 100) : null;
    const color =
      pct === null  ? "bg-primary"
      : pct >= 100  ? "bg-destructive"
      : pct >= 80   ? "bg-amber-500"
      : "bg-primary";
    return { pct, color };
  }

  const docsBar  = usageBar(usage?.docs_processed ?? 0, usage?.docs_limit ?? null);
  const siftsBar = usageBar(usage?.sifts_count ?? 0,    usage?.sifts_limit ?? null);

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-3 ring-1 ring-primary/10">
          <CreditCard className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">Cloud</p>
          <h2 className="text-2xl font-semibold tracking-tight leading-none">Billing</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Manage your plan, monitor usage, and access invoices.
          </p>
        </div>
      </header>

      {/* ── Current plan card ───────────────────────────────────────────────── */}
      {subLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : sub ? (
        <div className={`rounded-xl ring-2 p-5 space-y-4 ${PLAN_BG[currentPlan.code]} ${PLAN_RING[currentPlan.code]}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${PLAN_DOT[currentPlan.code] ?? "bg-zinc-400"}`} />
              <span className="text-lg font-semibold tracking-tight">{sub.plan_name}</span>
              {(() => {
                const s = STATUS_BADGE[sub.status];
                return s ? (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
                    {s.label}
                  </span>
                ) : null;
              })()}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="shrink-0 gap-1.5 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {portalMutation.isPending ? "Opening…" : "Invoices & payment"}
            </Button>
          </div>

          {/* Usage metrics */}
          {usage && (
            <div className="space-y-3 pt-1">
              <UsageRow
                label="Documents"
                value={usage.docs_processed}
                limit={usage.docs_limit}
                display={`${usage.docs_processed.toLocaleString()} / ${usage.docs_limit?.toLocaleString() ?? "∞"} this month`}
                bar={docsBar}
              />
              <UsageRow
                label="Sifts"
                value={usage.sifts_count}
                limit={usage.sifts_limit}
                display={`${usage.sifts_count} / ${usage.sifts_limit ?? "∞"}`}
                bar={siftsBar}
              />
            </div>
          )}
        </div>
      ) : null}

      {/* ── Plan list ───────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium px-0.5">
          Plans
        </p>
        <div className="rounded-xl border overflow-hidden divide-y">
          {PLANS.map((plan, idx) => {
            const isCurrent   = sub?.plan_code === plan.code;
            const isUpgrade   = idx > currentIdx;
            const isDowngrade = idx < currentIdx;
            const loading     = hasActiveSub
              ? (upgradeMutation.isPending && upgradeMutation.variables === plan.code)
              : (checkoutMutation.isPending && checkoutMutation.variables === plan.code);

            return (
              <div
                key={plan.code}
                className={`flex items-center gap-4 px-4 py-3.5 transition-colors ${
                  isCurrent
                    ? "bg-muted/60"
                    : "bg-card hover:bg-muted/30"
                }`}
              >
                {/* Dot + name */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PLAN_DOT[plan.code] ?? "bg-zinc-400"}`} />
                  <span className={`text-sm font-medium ${isCurrent ? "text-foreground" : "text-foreground/80"}`}>
                    {plan.name}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      current
                    </span>
                  )}
                </div>

                {/* Docs */}
                <span className="text-sm tabular-nums text-muted-foreground w-20 text-right shrink-0">
                  {plan.docsLabel} <span className="text-xs">docs/mo</span>
                </span>

                {/* Price */}
                <span className="text-sm font-semibold tabular-nums w-14 text-right shrink-0">
                  {plan.price === 0 ? (
                    <span className="text-muted-foreground font-normal">Free</span>
                  ) : (
                    <>${plan.price}<span className="text-xs font-normal text-muted-foreground">/mo</span></>
                  )}
                </span>

                {/* CTA */}
                <div className="w-28 flex justify-end shrink-0">
                  {isCurrent ? (
                    <div className="w-full" />
                  ) : isUpgrade ? (
                    <Button
                      size="sm"
                      className="w-full gap-1 text-xs h-7"
                      onClick={() =>
                        hasActiveSub
                          ? upgradeMutation.mutate(plan.code)
                          : checkoutMutation.mutate(plan.code)
                      }
                      disabled={upgradeMutation.isPending || checkoutMutation.isPending}
                    >
                      {loading ? (
                        "…"
                      ) : (
                        <>
                          <Zap className="h-3 w-3" />
                          Upgrade
                        </>
                      )}
                    </Button>
                  ) : isDowngrade ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-xs h-7 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        hasActiveSub ? upgradeMutation.mutate(plan.code) : portalMutation.mutate()
                      }
                      disabled={upgradeMutation.isPending || portalMutation.isPending}
                    >
                      Downgrade
                      <ArrowRight className="h-3 w-3 ml-1 opacity-50" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Enterprise row */}
          <div className="flex items-center gap-4 px-4 py-3.5 bg-card hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-yellow-500" />
              <span className="text-sm font-medium text-foreground/80">Enterprise</span>
            </div>
            <span className="text-sm text-muted-foreground w-20 text-right shrink-0">
              Custom
            </span>
            <span className="text-sm text-muted-foreground w-14 text-right shrink-0">
              —
            </span>
            <div className="w-28 flex justify-end shrink-0">
              <a
                href="/enterprise"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Contact us <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground px-0.5">
          All plans include a 10-page / document cap. Enterprise removes the cap and adds custom volume, SSO, BYOK, and SLA.
        </p>
      </div>

    </div>
  );
}
