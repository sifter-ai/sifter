import { useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

interface TrialBannerProps {
  trialEndAt: string;
}

function daysRemaining(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export function TrialBanner({ trialEndAt }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const days = daysRemaining(trialEndAt);

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 text-sm">
      <p className="text-amber-800">
        Your Pro trial ends in <strong>{days} day{days !== 1 ? "s" : ""}</strong> —{" "}
        <Link to="/settings/billing" className="underline font-medium">upgrade to keep access</Link>.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-600 hover:text-amber-800"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
