import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { gmailOAuthCallback, gdriveOAuthCallback } from "@/api/cloud";

export default function ConnectorCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) { navigate("/settings/connectors"); return; }

    let type = "gmail";
    try {
      const decoded = JSON.parse(atob(state.split(".")[1] ?? "{}"));
      type = decoded.connector_type ?? "gmail";
    } catch {}

    const fn = type === "gdrive" ? gdriveOAuthCallback : gmailOAuthCallback;
    fn(code, state)
      .finally(() => navigate("/settings/connectors"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Connecting…</p>
    </div>
  );
}
