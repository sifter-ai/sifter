import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuthContext } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import logo from "@/assets/logo.svg";

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuthContext();
  const { googleAuthEnabled } = useConfig();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, password, fullName);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[hsl(263,45%,14%)] text-white p-10">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="Sifter" className="h-7 w-7 brightness-0 invert" />
          <span className="font-semibold text-lg tracking-tight">Sifter</span>
        </div>
        <div className="space-y-3">
          <p className="text-2xl font-semibold leading-snug text-white/90">
            Set up your extraction pipeline in minutes.
          </p>
          <p className="text-sm text-white/50 leading-relaxed">
            Define what to extract, upload your documents, and get structured data — no coding required.
          </p>
        </div>
        <p className="text-xs text-white/30">© {new Date().getFullYear()} Sifter</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-7">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <img src={logo} alt="Sifter" className="h-6 w-6" />
            <span className="font-semibold text-base text-primary">Sifter</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
            <p className="text-sm text-muted-foreground">Sign up to get started with Sifter</p>
          </div>

          {googleAuthEnabled && (
            <div className="space-y-3">
              <GoogleLogin
                onSuccess={async (response) => {
                  if (!response.credential) return;
                  setError("");
                  setLoading(true);
                  try {
                    await loginWithGoogle(response.credential);
                    navigate("/");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Google sign-up failed");
                  } finally {
                    setLoading(false);
                  }
                }}
                onError={() => setError("Google sign-up failed")}
                width="100%"
                text="signup_with"
              />
              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t border-border" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Full name
              </Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Jane Smith"
                className="h-9 text-sm"
              />
            </div>
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
                minLength={8}
                placeholder="Min. 8 characters"
                className="h-9 text-sm"
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-9 text-sm" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
