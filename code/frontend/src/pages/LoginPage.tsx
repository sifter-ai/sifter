import { useState } from "react";
import { Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuthContext } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import logo from "@/assets/logo.svg";

function goToApp() {
  window.location.href = "/";
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuthContext();
  const { googleAuthEnabled } = useConfig();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      goToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex overflow-x-hidden">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[hsl(263,45%,14%)] text-white p-10">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="Sifter" className="h-7 w-7 brightness-0 invert" />
          <span className="font-semibold text-lg tracking-tight">Sifter</span>
        </div>
        <div className="space-y-3">
          <p className="text-2xl font-semibold leading-snug text-white/90">
            Turn unstructured documents into structured, queryable data.
          </p>
          <p className="text-sm text-white/50 leading-relaxed">
            Upload documents — Sifter extracts the fields you care about using AI, stores them in a database, and lets you query the results instantly.
          </p>
        </div>
        <p className="text-xs text-white/30">© {new Date().getFullYear()} Sifter</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-x-hidden">
        <div className="w-full max-w-sm space-y-7">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <img src={logo} alt="Sifter" className="h-6 w-6" />
            <span className="font-semibold text-base text-primary">Sifter</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
          </div>

          {googleAuthEnabled && (
            <div className="space-y-3">
              <div className="w-full overflow-hidden [&>div]:!w-full [&>div>div]:!w-full [&_iframe]:!w-full [&_iframe]:!max-w-none">
                <GoogleLogin
                  onSuccess={async (response) => {
                    if (!response.credential) return;
                    setError("");
                    setLoading(true);
                    try {
                      await loginWithGoogle(response.credential);
                      goToApp();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Google sign-in failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  onError={() => setError("Google sign-in failed")}
                  width="360"
                  text="signin_with"
                />
              </div>
              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t border-border" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-9 text-sm"
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-9 text-sm" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
