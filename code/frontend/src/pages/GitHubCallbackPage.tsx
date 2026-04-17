import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { githubCallback } from "@/api/cloud";

export default function GitHubCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      navigate("/login?error=github_auth_failed");
      return;
    }
    githubCallback(code)
      .then(({ access_token }) => {
        localStorage.setItem("access_token", access_token);
        navigate("/");
      })
      .catch(() => navigate("/login?error=github_auth_failed"));
  }, []);

  if (error) return <p className="p-8 text-destructive">{error}</p>;
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Completing GitHub sign-in…</p>
    </div>
  );
}
