import React, { lazy, Suspense, useState } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import {
  BookOpen,
  Bot,
  Building2,
  Check,
  ChevronUp,
  FileText,
  Folder,
  Key,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plug,
  Plus,
  Settings,
  User as UserIcon,
  Webhook,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listOrgs, switchOrg, createOrg, getMyOrg } from "@/api/orgs";
import { setToken } from "@/lib/apiFetch";
import { useDarkMode } from "@/hooks/useDarkMode";
import { SifterLogo } from "@/components/SifterLogo";
import { SiftsPage } from "@/pages/SiftsPage";
import { SiftDetailPage } from "@/pages/SiftDetailPage";
import MCPSetupPage from "@/pages/MCPSetupPage";
import { ChatPage } from "@/pages/ChatPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import SettingsPage from "@/pages/SettingsPage";
import ApiKeysPage from "@/pages/ApiKeysPage";
import AccountSettingsPage from "@/pages/AccountSettingsPage";
import AppearanceSettingsPage from "@/pages/AppearanceSettingsPage";
import WebhooksSettingsPage from "@/pages/WebhooksSettingsPage";
import FolderBrowserPage from "@/pages/FolderBrowserPage";
import DocumentDetailPage from "@/pages/DocumentDetailPage";
import LandingPage from "@/pages/LandingPage";
import AcceptInvitePage from "@/pages/AcceptInvitePage";
import EnterprisePage from "@/pages/EnterprisePage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsOfServicePage from "@/pages/TermsOfServicePage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { ConfigProvider, useConfig } from "@/context/ConfigContext";

const SidebarPlanWidget = lazy(() =>
  import("@/components/cloud/SidebarPlanWidget").then((m) => ({ default: m.SidebarPlanWidget }))
);
const PlanLimitDialog = lazy(() =>
  import("@/components/cloud/PlanLimitDialog").then((m) => ({ default: m.PlanLimitDialog }))
);

// Cloud pages — lazy loaded so they don't affect OSS bundle size
const BillingPage = lazy(() => import("@/pages/cloud/BillingPage"));
const AuditLogPage = lazy(() => import("@/pages/cloud/AuditLogPage"));
const ConnectorsPage = lazy(() => import("@/pages/cloud/ConnectorsPage"));
const ConnectorCallbackPage = lazy(() => import("@/pages/cloud/ConnectorCallbackPage"));
const SharesPage = lazy(() => import("@/pages/cloud/SharesPage"));
const OrganizationSettingsPage = lazy(() => import("@/pages/cloud/OrganizationSettingsPage"));
const PublicViewerPage = lazy(() => import("@/pages/cloud/PublicViewerPage"));
const DashboardListPage = lazy(() => import("@/pages/cloud/DashboardListPage"));
const DashboardPage = lazy(() => import("@/pages/cloud/DashboardPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const navItemBase =
  "flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-sm transition-all w-full relative";
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${navItemBase} ${
    isActive
      ? "bg-primary/10 font-medium text-foreground border-l-2 border-primary pl-[10px]"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-l-2 border-transparent pl-[10px]"
  }`;

function UserAvatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0 ring-1 ring-border" />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center font-semibold text-primary shrink-0 select-none"
    >
      {initials || <UserIcon style={{ width: size * 0.55, height: size * 0.55 }} />}
    </div>
  );
}

function OrgSwitcher() {
  const { user, logout } = useAuthContext();
  const { mode } = useConfig();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: myOrg } = useQuery({
    queryKey: ["my-org"],
    queryFn: getMyOrg,
    enabled: mode === "cloud",
    staleTime: 60_000,
  });

  const { data } = useQuery({
    queryKey: ["orgs"],
    queryFn: listOrgs,
    enabled: mode === "cloud" && open,
    staleTime: 30_000,
  });

  const orgs = data?.orgs ?? [];
  const currentOrgId = data?.current_org_id;

  async function handleSwitch(orgId: string) {
    if (orgId === currentOrgId) { setOpen(false); return; }
    try {
      const res = await switchOrg(orgId);
      setToken(res.access_token);
      setOpen(false);
      window.location.href = "/";
    } catch {}
  }

  async function handleCreate() {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const res = await createOrg(newOrgName.trim());
      setToken(res.access_token);
      setCreateOpen(false);
      setNewOrgName("");
      window.location.href = "/";
    } catch {} finally {
      setCreating(false);
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 w-full px-4 py-3 hover:bg-muted/70 transition-colors text-left">
            <UserAvatar src={user?.avatar_url ?? null} name={user?.full_name ?? user?.email ?? ""} size={27} />
            <div className="min-w-0 flex-1">
              {user?.full_name && (
                <p className="text-xs font-medium truncate leading-snug">{user.full_name}</p>
              )}
              <p className="text-[11px] text-muted-foreground truncate leading-snug">{user?.email}</p>
              {mode === "cloud" && myOrg?.name && (
                <p className="text-[10px] text-primary/70 truncate leading-snug font-medium">{myOrg.name}</p>
              )}
            </div>
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-64 mb-1">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {mode === "cloud" && orgs.length > 0 && (
            <>
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org.org_id}
                  onClick={() => handleSwitch(org.org_id)}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{org.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{org.role}</p>
                  </div>
                  {org.org_id === currentOrgId && (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          {mode === "cloud" && (
            <DropdownMenuItem
              onClick={() => { setOpen(false); setCreateOpen(true); }}
              className="cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              New organization
            </DropdownMenuItem>
          )}

          <DropdownMenuItem asChild>
            <Link to="/settings/account" className="cursor-pointer">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCreateOpen(false)}>
          <div className="bg-background rounded-lg shadow-xl p-6 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-base font-semibold">New organization</h2>
              <p className="text-sm text-muted-foreground mt-1">Create a separate workspace with its own data and billing.</p>
            </div>
            <input
              autoFocus
              className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Organization name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted"
                onClick={() => { setCreateOpen(false); setNewOrgName(""); }}
              >Cancel</button>
              <button
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={!newOrgName.trim() || creating}
                onClick={handleCreate}
              >{creating ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { isAuthenticated } = useAuthContext();
  const { mode } = useConfig();
  useDarkMode();

  if (!isAuthenticated) return null;

  return (
    <aside className="w-56 h-screen sticky top-0 flex flex-col border-r bg-card shrink-0">
      {/* Logo */}
      <div className="px-4 py-[14px] flex items-center justify-between">
        <Link
          to="/"
          onClick={onClose}
          className="font-bold text-[15px] tracking-tight flex items-center gap-2.5 group"
        >
          <div className="relative">
            <SifterLogo className="h-7 w-7 transition-transform group-hover:scale-105" />
          </div>
          <span className="text-primary">Sifter</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 rounded hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-3" />

      {/* Main nav */}
      <nav className="flex flex-col px-2 pt-3 flex-1">
        <p className="px-3 pb-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em]">
          Workspace
        </p>
        <div className="flex flex-col gap-0.5">
          <NavLink to="/" end className={navLinkClass} onClick={onClose}>
            <FileText className="h-4 w-4 shrink-0" />
            Sifts
          </NavLink>
          <NavLink to="/folders" className={navLinkClass} onClick={onClose}>
            <Folder className="h-4 w-4 shrink-0" />
            Folders
          </NavLink>
          <NavLink to="/chat" className={navLinkClass} onClick={onClose}>
            <MessageCircle className="h-4 w-4 shrink-0" />
            Chat
          </NavLink>
          <NavLink to="/dashboards" className={navLinkClass} onClick={onClose}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Dashboards
          </NavLink>
        </div>

        <p className="px-3 pt-5 pb-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em]">
          Build
        </p>
        <div className="flex flex-col gap-0.5">
          <NavLink to="/api-keys" className={navLinkClass} onClick={onClose}>
            <Key className="h-4 w-4 shrink-0" />
            API Keys
          </NavLink>
          <NavLink to="/webhooks" className={navLinkClass} onClick={onClose}>
            <Webhook className="h-4 w-4 shrink-0" />
            Webhooks
          </NavLink>
          <NavLink to="/mcp" className={navLinkClass} onClick={onClose}>
            <Bot className="h-4 w-4 shrink-0" />
            MCP
          </NavLink>
          <NavLink to="/connectors" className={navLinkClass} onClick={onClose}>
            <Plug className="h-4 w-4 shrink-0" />
            Connectors
          </NavLink>
        </div>

        {/* Secondary nav — pushed to bottom of the nav flex */}
        <div className="mt-auto pt-3 flex flex-col gap-0.5">
          <a
            href="https://sifterai.mintlify.app"
            target="_blank"
            rel="noopener noreferrer"
            className={`${navItemBase} text-muted-foreground hover:text-foreground hover:bg-muted/60 border-l-2 border-transparent pl-[10px]`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            Docs
            <span className="ml-auto text-[10px] text-muted-foreground/50">↗</span>
          </a>
          <NavLink to="/settings" end className={navLinkClass} onClick={onClose}>
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </NavLink>
        </div>
      </nav>

      {mode === "cloud" && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-3" />
          <Suspense fallback={null}>
            <SidebarPlanWidget />
          </Suspense>
        </>
      )}

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-3" />

      {/* User / org switcher */}
      <OrgSwitcher />
    </aside>
  );
}

function ConnectorsRoute() {
  const { mode } = useConfig();
  if (mode !== "cloud") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div className="max-w-md text-center space-y-3">
          <Plug className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Connectors require Sifter Cloud</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Google Drive sync and mail-to-upload run on managed infrastructure. Upgrade at{" "}
            <a href="https://sifter.run" className="underline text-primary" target="_blank" rel="noopener noreferrer">sifter.run</a>.
          </p>
        </div>
      </div>
    );
  }
  return <ConnectorsPage />;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuthContext();
  const { mode } = useConfig();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Mobile drawer overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 h-full z-50">
              <Sidebar onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {mode === "cloud" && (
          <Suspense fallback={null}>
            <PlanLimitDialog />
          </Suspense>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar */}
          <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-md hover:bg-muted"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="font-bold text-[15px] tracking-tight flex items-center gap-2 group">
              <SifterLogo className="h-6 w-6" />
              <span className="text-primary">Sifter</span>
            </Link>
          </header>

          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<ProtectedRoute><SiftsPage /></ProtectedRoute>} />
                <Route path="/sifts/:id" element={<ProtectedRoute><SiftDetailPage /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                <Route path="/dashboards" element={<ProtectedRoute><DashboardListPage /></ProtectedRoute>} />
                <Route path="/dashboards/:id" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/folders" element={<ProtectedRoute><FolderBrowserPage /></ProtectedRoute>} />
                <Route path="/folders/:id" element={<ProtectedRoute><FolderBrowserPage /></ProtectedRoute>} />
                <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetailPage /></ProtectedRoute>} />
                <Route path="/webhooks" element={<ProtectedRoute><WebhooksSettingsPage /></ProtectedRoute>} />
                <Route path="/connectors" element={<ProtectedRoute><ConnectorsRoute /></ProtectedRoute>} />
                <Route path="/mcp" element={<ProtectedRoute><MCPSetupPage /></ProtectedRoute>} />
                <Route path="/api-keys" element={<ProtectedRoute><ApiKeysPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}>
                  <Route index element={<Navigate to="/settings/account" replace />} />
                  <Route path="account" element={<AccountSettingsPage />} />
                  <Route path="appearance" element={<AppearanceSettingsPage />} />
                  {mode === "cloud" && (
                    <>
                      <Route path="billing" element={<BillingPage />} />
                      <Route path="audit" element={<AuditLogPage />} />
                      <Route path="shares" element={<SharesPage />} />
                      <Route path="organization" element={<OrganizationSettingsPage />} />
                    </>
                  )}
                </Route>
                {mode === "cloud" && (
                  <Route path="/connectors/callback" element={<ConnectorCallbackPage />} />
                )}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/invite/accept" element={<AcceptInvitePage />} />
                <Route path="/s/:slug" element={<PublicViewerPage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsOfServicePage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    );
  }

  // Unauthenticated
  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/enterprise" element={<EnterprisePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/accept" element={<AcceptInvitePage />} />
        {/* Public share viewer — no auth required */}
        <Route
          path="/s/:slug"
          element={
            <Suspense fallback={null}>
              <PublicViewerPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={<ProtectedRoute><SiftsPage /></ProtectedRoute>}
        />
      </Routes>
    </div>
  );
}

function GoogleWrapper({ children }: { children: React.ReactNode }) {
  const { googleAuthEnabled, googleClientId } = useConfig();
  if (googleAuthEnabled && googleClientId) {
    return <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfigProvider>
          <GoogleWrapper>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </GoogleWrapper>
        </ConfigProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
