import { useRef, useState } from "react";
import { Camera, User as UserIcon } from "lucide-react";
import { changePassword, updateProfile, uploadAvatar } from "../api/auth";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuthContext } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function AvatarPreview({ src, name, size = 64 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      className="rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary select-none"
    >
      {initials(name) || <UserIcon className="h-5 w-5 text-muted-foreground" />}
    </div>
  );
}

export default function AccountSettingsPage() {
  const { user, updateUser } = useAuthContext();
  const { mode } = useConfig();

  return (
    <div className="space-y-6">
      <ProfileSection user={user} updateUser={updateUser} />
      <AvatarSection user={user} updateUser={updateUser} />
      {user?.auth_provider === "email" && <PasswordSection />}
      {mode === "cloud" && <OrgCard />}
    </div>
  );
}

function ProfileSection({
  user,
  updateUser,
}: {
  user: ReturnType<typeof useAuthContext>["user"];
  updateUser: ReturnType<typeof useAuthContext>["updateUser"];
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const isGoogle = user?.auth_provider === "google";

  async function handleSave() {
    setStatus("saving");
    setErrorMsg("");
    try {
      const updated = await updateProfile({ full_name: fullName, ...(!isGoogle && { email }) });
      updateUser(updated);
      setStatus("success");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full-name">Full name</Label>
          <Input
            id="full-name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setStatus("idle"); }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              value={email}
              disabled={isGoogle}
              onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
            />
          </div>
          {isGoogle && (
            <p className="text-xs text-muted-foreground">Managed by Google — cannot be changed here.</p>
          )}
        </div>
        {status === "success" && (
          <Alert className="border-green-500 text-green-700 bg-green-50">
            <AlertDescription>Profile updated.</AlertDescription>
          </Alert>
        )}
        {status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}
        <Button onClick={handleSave} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AvatarSection({
  user,
  updateUser,
}: {
  user: ReturnType<typeof useAuthContext>["user"];
  updateUser: ReturnType<typeof useAuthContext>["updateUser"];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(file);
    setPreview(URL.createObjectURL(file));
    setStatus("idle");
  }

  async function handleSave() {
    if (!pending) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      const updated = await uploadAvatar(pending);
      updateUser(updated);
      setPreview(null);
      setPending(null);
      setStatus("success");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  const displaySrc = preview ?? user?.avatar_url ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avatar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <AvatarPreview src={displaySrc} name={user?.full_name ?? ""} size={72} />
          <div className="space-y-1">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="flex items-center gap-1">
              <Camera className="h-4 w-4" /> Upload photo
            </Button>
            <p className="text-xs text-muted-foreground">JPEG, PNG or WebP · max 2 MB</p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        {status === "success" && (
          <Alert className="border-green-500 text-green-700 bg-green-50">
            <AlertDescription>Avatar updated.</AlertDescription>
          </Alert>
        )}
        {status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}
        {pending && (
          <Button onClick={handleSave} disabled={status === "saving"}>
            {status === "saving" ? "Uploading…" : "Save avatar"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const validationError =
    next.length > 0 && next.length < 8
      ? "New password must be at least 8 characters."
      : next !== confirm && confirm.length > 0
      ? "Passwords do not match."
      : null;

  async function handleSave() {
    if (validationError || !current || !next) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus("success");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-pw">Current password</Label>
          <Input
            id="current-pw"
            type="password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setStatus("idle"); }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-pw">New password</Label>
          <Input
            id="new-pw"
            type="password"
            value={next}
            onChange={(e) => { setNext(e.target.value); setStatus("idle"); }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-pw">Confirm new password</Label>
          <Input
            id="confirm-pw"
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setStatus("idle"); }}
          />
        </div>
        {validationError && (
          <p className="text-sm text-destructive">{validationError}</p>
        )}
        {status === "success" && (
          <Alert className="border-green-500 text-green-700 bg-green-50">
            <AlertDescription>Password changed.</AlertDescription>
          </Alert>
        )}
        {status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}
        <Button
          onClick={handleSave}
          disabled={!current || !next || !confirm || !!validationError || status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Change password"}
        </Button>
      </CardContent>
    </Card>
  );
}

function OrgCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Organisation details and seat usage are managed in billing.
        </p>
        <Button variant="outline" size="sm" asChild>
          <a href="/settings/billing">Manage billing →</a>
        </Button>
      </CardContent>
    </Card>
  );
}
