import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { gmailOAuthCallback, gdriveOAuthCallback } from "@/api/cloud";

export default function ConnectorCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) { navigate("/connectors"); return; }

    let type = "gmail";
    try {
      const payload = state.split(".")[1] ?? "";
      const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
      const decoded = JSON.parse(atob(padded));
      type = decoded.connector_type ?? "gmail";
    } catch {}

    const fn = type === "gdrive" ? gdriveOAuthCallback : gmailOAuthCallback;
    fn(code, state)
      .finally(() => navigate("/connectors"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Connecting…</p>
    </div>
  );
}
