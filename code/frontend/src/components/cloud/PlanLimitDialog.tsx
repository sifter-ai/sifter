import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const LIMIT_LABELS: Record<string, string> = {
  docs_per_month:       "monthly document quota",
  sifts_max:            "sift limit",
  attachment_too_large: "file size limit",
  api_access:           "API access",
  export_csv:           "CSV export",
  export_pdf_report:    "PDF report export",
  chat_advanced:        "advanced chat",
  dashboard_autorefresh:"dashboard auto-refresh",
  dashboard_widgets_max:"widget limit",
  connector_gmail:      "Gmail connector",
  connector_gdrive:     "Google Drive connector",
  inbound_email:        "inbound email",
  shares:               "share creation",
  shares_max:           "share limit",
  share_pdf:            "PDF share",
  share_email:          "share via email",
};

interface PlanLimitDetail {
  code: string;
  plan: string;
  upgrade_url: string;
}

export function PlanLimitDialog() {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PlanLimitDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      setDetail((e as CustomEvent<PlanLimitDetail>).detail);
    };
    window.addEventListener("sifter:plan-limit", handler);
    return () => window.removeEventListener("sifter:plan-limit", handler);
  }, []);

  const featureLabel = detail ? (LIMIT_LABELS[detail.code] ?? detail.code.replace(/_/g, " ")) : "";

  return (
    <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/50">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
            </span>
            Plan limit reached
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your <span className="font-medium text-foreground capitalize">{detail?.plan}</span> plan
            doesn't include the <span className="font-medium text-foreground">{featureLabel}</span>.
            Upgrade to unlock this feature and more.
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1 gap-1.5"
              onClick={() => {
                setDetail(null);
                navigate("/settings/billing");
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              View plans
            </Button>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
