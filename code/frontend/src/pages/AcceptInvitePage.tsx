import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [email, setEmail] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMsg("Invalid invitation link.");
      return;
    }

    fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || "Invitation could not be accepted.");
        }
        return res.json();
      })
      .then((data) => {
        setEmail(data.email ?? "");
        setState("success");
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setState("error");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {state === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground text-sm">Accepting invitation…</p>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <h1 className="text-xl font-semibold">Invitation accepted</h1>
              <p className="text-muted-foreground text-sm mt-2">
                {email
                  ? `Sign in or create an account for ${email} to join your team.`
                  : "Sign in or create an account to join your team."}
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate(email ? `/register?email=${encodeURIComponent(email)}` : "/register")}
                className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Create account
              </button>
              <button
                onClick={() => navigate("/login")}
                className="border border-input px-5 py-2 rounded-md text-sm font-medium hover:bg-muted/60 transition-colors"
              >
                Sign in
              </button>
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-xl font-semibold">Invitation not valid</h1>
              <p className="text-muted-foreground text-sm mt-2">{errorMsg}</p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="border border-input px-5 py-2 rounded-md text-sm font-medium hover:bg-muted/60 transition-colors"
            >
              Go to homepage
            </button>
          </>
        )}
      </div>
    </div>
  );
}
