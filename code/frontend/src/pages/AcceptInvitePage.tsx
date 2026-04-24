import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { useAuthContext } from "@/context/AuthContext";

type State = "loading" | "preview" | "accepting" | "accepted" | "declined" | "error";

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthContext();
  const token = params.get("token");

  const [state, setState] = useState<State>("loading");
  const [inviteEmail, setInviteEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invalid invitation link.");
      setState("error");
      return;
    }
    fetch(`/api/invites/preview?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || "Invitation not found or expired.");
        }
        return res.json();
      })
      .then((data) => {
        setInviteEmail(data.email ?? "");
        setOrgName(data.org_name ?? "");
        setState("preview");
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setState("error");
      });
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setState("accepting");
    try {
      const res = await fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Could not accept invitation.");
      }
      setState("accepted");
      if (isAuthenticated) {
        setTimeout(() => navigate("/"), 1500);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  };

  const handleDecline = () => {
    setState("declined");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">

        {(state === "loading" || state === "accepting") && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground text-sm">
              {state === "accepting" ? "Accepting invitation…" : "Loading invitation…"}
            </p>
          </>
        )}

        {state === "preview" && (
          <>
            <div className="bg-primary/8 border border-primary/20 rounded-full p-4 w-fit mx-auto">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">You've been invited</h1>
              <p className="text-muted-foreground text-sm mt-2">
                Join <span className="font-medium text-foreground">{orgName}</span> on Sifter
                {inviteEmail && (
                  <> as <span className="font-medium text-foreground">{inviteEmail}</span></>
                )}
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleAccept}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Accept invitation
              </button>
              <button
                onClick={handleDecline}
                className="border border-input px-6 py-2.5 rounded-md text-sm font-medium hover:bg-muted/60 transition-colors"
              >
                Decline
              </button>
            </div>
          </>
        )}

        {state === "accepted" && (
          <>
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <h1 className="text-xl font-semibold">Invitation accepted</h1>
              <p className="text-muted-foreground text-sm mt-2">
                {isAuthenticated
                  ? "Redirecting you to the app…"
                  : inviteEmail
                  ? `Create an account or sign in with ${inviteEmail} to get started.`
                  : "Create an account or sign in to get started."}
              </p>
            </div>
            {!isAuthenticated && (
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => navigate(inviteEmail ? `/register?email=${encodeURIComponent(inviteEmail)}` : "/register")}
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
            )}
          </>
        )}

        {state === "declined" && (
          <>
            <div className="text-4xl">👋</div>
            <div>
              <h1 className="text-xl font-semibold">Invitation declined</h1>
              <p className="text-muted-foreground text-sm mt-2">
                No problem. The invitation has been ignored.
              </p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="border border-input px-5 py-2 rounded-md text-sm font-medium hover:bg-muted/60 transition-colors"
            >
              Go to homepage
            </button>
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
