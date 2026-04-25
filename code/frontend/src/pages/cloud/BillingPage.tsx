import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, CreditCard, ExternalLink, Zap } from "lucide-react";
import { fetchSubscription, fetchUsage, openBillingPortal, startCheckout, upgradeSubscription } from "@/api/cloud";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Notice =
  | { kind: "success"; title: string; message: string }
  | { kind: "error"; title: string; message: string };

type PlanEntry = { code: string; name: string; price: number; docsLabel: string };

type PendingAction =
  | { type: "upgrade"; plan: PlanEntry }
  | { type: "downgrade"; plan: PlanEntry; effectiveDate: string | null };

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

function planLabel(code: string | null | undefined): string {
  if (!code) return "";
  return code.charAt(0).toUpperCase() + code.slice(1);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [awaitingPlan, setAwaitingPlan] = useState<string | null>(null);

  // Show a notice when returning from Stripe Checkout or portal, then clean the URL.
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const portal = searchParams.get("portal");

    if (checkout === "success") {
      setNotice({
        kind: "success",
        title: "Subscription activated!",
        message: "Welcome aboard. Your plan is now active — it may take a few seconds to reflect here.",
      });
      const poll = () => queryClient.invalidateQueries({ queryKey: ["subscription"] });
      poll();
      setTimeout(poll, 2000);
      navigate(window.location.pathname, { replace: true });
    } else if (checkout === "canceled") {
      setNotice({
        kind: "error",
        title: "Checkout cancelled",
        message: "No charges were made. You can subscribe whenever you're ready.",
      });
      navigate(window.location.pathname, { replace: true });
    } else if (portal === "return") {
      // User returned from Stripe portal — poll a few times to catch webhook updates.
      const poll = () => queryClient.invalidateQueries({ queryKey: ["subscription"] });
      poll();
      const timers = [2000, 5000, 10000].map((ms) => setTimeout(poll, ms));
      navigate(window.location.pathname, { replace: true });
      return () => timers.forEach(clearTimeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
  });

  // When the subscription confirms the expected plan, replace the "in progress" notice.
  useEffect(() => {
    if (awaitingPlan && sub?.plan_code === awaitingPlan) {
      setNotice({
        kind: "success",
        title: `You're now on ${planLabel(awaitingPlan)}`,
        message: "Your plan has been updated and Stripe has confirmed the charge.",
      });
      setAwaitingPlan(null);
    }
  }, [sub?.plan_code, awaitingPlan]);

  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: fetchUsage,
    staleTime: 30_000,
  });

  const portalMutation = useMutation({
    mutationFn: () => {
      const base = window.location.origin + window.location.pathname;
      return openBillingPortal(`${base}?portal=return`);
    },
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err: Error) => setNotice({ kind: "error", title: "Couldn't open billing portal", message: err.message }),
  });

  const hasActiveSub = sub?.has_stripe_subscription === true;

  // New subscribers → Stripe Checkout (new session)
  const checkoutMutation = useMutation({
    mutationFn: (plan_code: string) => {
      const base = window.location.origin + window.location.pathname;
      return startCheckout(plan_code, `${base}?checkout=success`, `${base}?checkout=canceled`);
    },
    onSuccess: ({ checkout_url }) => { window.location.href = checkout_url; },
    onError: (err: Error) => setNotice({ kind: "error", title: "Couldn't start checkout", message: err.message }),
  });

  // Existing subscribers → upgrade (immediate via Stripe.modify) or downgrade (Stripe SubscriptionSchedule).
  // The local DB is updated by Stripe webhooks only — so we refetch a few times to catch the webhook landing.
  const upgradeMutation = useMutation({
    mutationFn: (plan_code: string) => upgradeSubscription(plan_code),
    onSuccess: (data, plan_code) => {
      // Webhook lands within 1-3s; invalidate now and again at 1.5s + 4s to pick up the synced state.
      const poll = () => queryClient.invalidateQueries({ queryKey: ["subscription"] });
      poll();
      setTimeout(poll, 1500);
      setTimeout(poll, 4000);

      if (data.pending_plan_code && data.pending_plan_at) {
        setNotice({
          kind: "success",
          title: "Downgrade scheduled",
          message: `Your plan will switch to ${planLabel(plan_code)} on ${formatDate(data.pending_plan_at)}. You keep your current plan and benefits until then.`,
        });
      } else {
        setAwaitingPlan(plan_code);
        setNotice({
          kind: "success",
          title: "Upgrade in progress…",
          message: `Stripe is processing the charge for ${planLabel(plan_code)}. This page will update automatically.`,
        });
      }
    },
    onError: (err: Error) => setNotice({
      kind: "error",
      title: "Upgrade failed",
      message: err.message || "Stripe couldn't process the change. Check your payment method in the billing portal.",
    }),
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

      {/* ── Notice (success or error from latest mutation) ─────────────────── */}
      {notice && (
        <Alert
          variant={notice.kind === "error" ? "destructive" : "default"}
          className={notice.kind === "success" ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400 [&>svg]:text-emerald-600" : ""}
        >
          {notice.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      )}

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
            <div className="space-y-1">
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
              {sub.current_period_end && sub.has_stripe_subscription && (
                <p className="text-[12px] text-muted-foreground pl-[18px]">
                  {sub.pending_plan_code === "free"
                    ? <>Cancels on <strong>{formatDate(sub.current_period_end)}</strong></>
                    : sub.pending_plan_code
                    ? <>Current period ends <strong>{formatDate(sub.current_period_end)}</strong></>
                    : <>Renews on <strong>{formatDate(sub.current_period_end)}</strong></>}
                </p>
              )}
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
            const isCurrent        = sub?.plan_code === plan.code;
            const isPendingDowngrade = sub?.pending_plan_code === plan.code;
            const isUpgrade        = idx > currentIdx;
            const isDowngrade      = idx < currentIdx;
            const loading          = hasActiveSub
              ? (upgradeMutation.isPending && upgradeMutation.variables === plan.code)
              : (checkoutMutation.isPending && checkoutMutation.variables === plan.code);

            const pendingDate = isPendingDowngrade && sub?.pending_plan_at
              ? new Date(sub.pending_plan_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : null;

            return (
              <div
                key={plan.code}
                className={`flex items-center gap-4 px-4 py-3.5 transition-colors ${
                  isCurrent || isPendingDowngrade
                    ? "bg-muted/60"
                    : "bg-card hover:bg-muted/30"
                }`}
              >
                {/* Dot + name */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PLAN_DOT[plan.code] ?? "bg-zinc-400"}`} />
                  <span className={`text-sm font-medium ${isCurrent || isPendingDowngrade ? "text-foreground" : "text-foreground/80"}`}>
                    {plan.name}
                  </span>
                  {isCurrent && (
                    <span className="inline-flex items-center leading-none rounded-full px-2 py-[3px] text-[10px] font-medium bg-muted text-muted-foreground">
                      Current
                    </span>
                  )}
                  {isPendingDowngrade && (
                    <span className="inline-flex items-center leading-none gap-1 rounded-full px-2 py-[3px] text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      <Clock className="h-2.5 w-2.5" />
                      {pendingDate ? `Starts ${pendingDate}` : "Scheduled"}
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
                  {isCurrent || isPendingDowngrade ? (
                    <div className="w-full" />
                  ) : isUpgrade ? (
                    <Button
                      size="sm"
                      className="w-full gap-1 text-xs h-7"
                      onClick={() => {
                        if (hasActiveSub) {
                          setPendingAction({ type: "upgrade", plan });
                        } else {
                          checkoutMutation.mutate(plan.code);
                        }
                      }}
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
                      onClick={() => {
                        if (hasActiveSub) {
                          setPendingAction({ type: "downgrade", plan, effectiveDate: sub?.current_period_end ?? null });
                        } else {
                          portalMutation.mutate();
                        }
                      }}
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

      {/* ── Confirmation dialog ─────────────────────────────────────────────── */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <AlertDialogContent>
          {pendingAction?.type === "upgrade" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Upgrade to {pendingAction.plan.name}?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      You'll be charged <strong>${pendingAction.plan.price}/month</strong> starting now.
                      Stripe will invoice the prorated difference for the current billing period immediately —
                      your card on file will be charged right away.
                    </p>
                    <p className="text-muted-foreground">
                      You can review all charges in the billing portal under "Invoices & payment".
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    upgradeMutation.mutate(pendingAction.plan.code);
                    setPendingAction(null);
                  }}
                >
                  Confirm upgrade
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {pendingAction?.type === "downgrade" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Downgrade to {pendingAction.plan.name}?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      Your plan will stay active until the end of your current billing period
                      {pendingAction.effectiveDate
                        ? <> (<strong>{formatDate(pendingAction.effectiveDate)}</strong>)</>
                        : null}
                      , then switch to <strong>{pendingAction.plan.name} (${pendingAction.plan.price}/month)</strong>.
                    </p>
                    <p className="text-muted-foreground">
                      No charge now. You keep all current plan features until the switch date.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    upgradeMutation.mutate(pendingAction.plan.code);
                    setPendingAction(null);
                  }}
                >
                  Schedule downgrade
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
