import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PlanCardProps {
  name: string;
  price: string;
  features: string[];
  isCurrent: boolean;
  onUpgrade?: () => void;
  loading?: boolean;
}

export function PlanCard({ name, price, features, isCurrent, onUpgrade, loading }: PlanCardProps) {
  return (
    <div className={`rounded-lg border p-5 space-y-4 ${isCurrent ? "border-primary bg-primary/5" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-2xl font-bold mt-0.5">{price}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
        </div>
        {isCurrent && <Badge variant="secondary">Current</Badge>}
      </div>
      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {!isCurrent && onUpgrade && (
        <Button className="w-full" size="sm" onClick={onUpgrade} disabled={loading}>
          {loading ? "Redirecting…" : "Upgrade"}
        </Button>
      )}
    </div>
  );
}
