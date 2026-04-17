import { useQuery, useMutation } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { fetchSubscription, openBillingPortal, startCheckout } from "@/api/cloud";
import { PlanCard } from "@/components/cloud/PlanCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const PLANS = [
  { code: "free", name: "Free", price: "$0", features: ["5 sifts", "100 docs/mo", "1 GB storage"] },
  { code: "pro", name: "Pro", price: "$49", features: ["Unlimited sifts", "2,000 docs/mo", "20 GB storage", "Advanced Chat", "Dashboards"] },
  { code: "business", name: "Business", price: "$149", features: ["Everything in Pro", "10,000 docs/mo", "100 GB storage", "Connectors (Gmail, Drive)", "Audit log", "Shares"] },
  { code: "scale", name: "Scale", price: "$399", features: ["Everything in Business", "Unlimited docs", "500 GB storage", "Priority support", "SSO"] },
];

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  past_due: "Past due",
  trial: "Trial",
  canceled: "Canceled",
};

export default function BillingPage() {
  const { data: sub, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
  });

  const portalMutation = useMutation({
    mutationFn: openBillingPortal,
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const checkoutMutation = useMutation({
    mutationFn: (plan_code: string) =>
      startCheckout(plan_code, window.location.href, window.location.href),
    onSuccess: ({ checkout_url }) => { window.location.href = checkout_url; },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Billing</h2>
          {sub && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              Current plan: <span className="font-medium">{sub.plan_name}</span>
              <Badge variant={sub.status === "active" ? "secondary" : "destructive"} className="text-xs">
                {STATUS_LABELS[sub.status] ?? sub.status}
              </Badge>
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
          <ExternalLink className="h-4 w-4 mr-1.5" />
          Manage billing
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.code}
            name={plan.name}
            price={plan.price}
            features={plan.features}
            isCurrent={sub?.plan_code === plan.code}
            onUpgrade={() => checkoutMutation.mutate(plan.code)}
            loading={checkoutMutation.isPending}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">Invoices are managed via Stripe.</p>
    </div>
  );
}
