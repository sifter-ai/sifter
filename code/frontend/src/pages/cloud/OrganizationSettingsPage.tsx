import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Mail, Trash2, UserPlus, Clock } from "lucide-react";
import { getMyOrg, listMembers, removeMember, type OrgMember } from "@/api/orgs";
import { listInvites, sendInvite, revokeInvite, type Invite } from "@/api/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthContext } from "@/context/AuthContext";

const ROLE_BADGE: Record<string, string> = {
  owner:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  admin:  "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  member: "bg-muted text-muted-foreground",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_BADGE[role] ?? ROLE_BADGE.member}`}>
      {role}
    </span>
  );
}

function initials(name: string, email: string): string {
  const src = name || email;
  return src.split(/[\s@]/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function Avatar({ name, email }: { name: string; email: string }) {
  return (
    <div className="h-7 w-7 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0 select-none">
      {initials(name, email)}
    </div>
  );
}

export default function OrganizationSettingsPage() {
  const { user } = useAuthContext();
  const qc = useQueryClient();

  const { data: org } = useQuery({ queryKey: ["org"], queryFn: getMyOrg });
  const { data: membersData } = useQuery({ queryKey: ["org-members"], queryFn: listMembers });
  const { data: invitesData } = useQuery({ queryKey: ["org-invites"], queryFn: listInvites });

  const members = membersData?.members ?? [];
  const invites = invitesData?.invites ?? [];

  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => sendInvite(email.trim()),
    onSuccess: () => {
      setEmail("");
      setInviteError(null);
      qc.invalidateQueries({ queryKey: ["org-invites"] });
    },
    onError: (err: Error) => {
      setInviteError(err.message || "Failed to send invite.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeMember,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members"] }),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-invites"] }),
  });

  return (
    <div className="space-y-8">
      {/* Org header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{org?.name ?? "My workspace"}</h2>
          <p className="text-xs text-muted-foreground font-mono">{org?.org_id}</p>
        </div>
      </div>

      {/* Members */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Team members</h3>
        <div className="rounded-xl border divide-y">
          {members.map((m: OrgMember) => (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.full_name} email={m.email} />
              <div className="flex-1 min-w-0">
                {m.full_name && <p className="text-sm font-medium truncate">{m.full_name}</p>}
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>
              <RoleBadge role={m.role} />
              {m.role !== "owner" && m.user_id !== user?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(m.user_id)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No members yet.</div>
          )}
        </div>
      </section>

      {/* Invite */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Invite a member</h3>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="colleague@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setInviteError(null); }}
            onKeyDown={e => e.key === "Enter" && email && inviteMutation.mutate()}
            className="max-w-xs"
          />
          <Button
            size="sm"
            onClick={() => inviteMutation.mutate()}
            disabled={!email.trim() || inviteMutation.isPending}
            className="gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Send invite
          </Button>
        </div>
        {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
        {inviteMutation.isSuccess && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Invitation sent.</p>
        )}
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Pending invitations</h3>
          <div className="rounded-xl border divide-y">
            {invites.map((inv: Invite) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-full px-2 py-0.5">
                  Pending
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => revokeMutation.mutate(inv.id)}
                  disabled={revokeMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
