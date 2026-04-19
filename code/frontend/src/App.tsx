import React, { lazy, Suspense } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import {
  BookOpen,
  Bot,
  FileText,
  Folder,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Plug,
  Settings,
  User as UserIcon,
  Webhook,
} from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";
import logo from "@/assets/logo.svg";
import { SiftsPage } from "@/pages/SiftsPage";
import { SiftDetailPage } from "@/pages/SiftDetailPage";
import MCPSetupPage from "@/pages/MCPSetupPage";
import { ChatPage } from "@/pages/ChatPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import SettingsPage, { SettingsIndex } from "@/pages/SettingsPage";
import AccountSettingsPage from "@/pages/AccountSettingsPage";
import AppearanceSettingsPage from "@/pages/AppearanceSettingsPage";
import WebhooksSettingsPage from "@/pages/WebhooksSettingsPage";
import FolderBrowserPage from "@/pages/FolderBrowserPage";
import DocumentDetailPage from "@/pages/DocumentDetailPage";
import LandingPage from "@/pages/LandingPage";
import EnterprisePage from "@/pages/EnterprisePage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsOfServicePage from "@/pages/TermsOfServicePage";
import GitHubCallbackPage from "@/pages/GitHubCallbackPage";
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

function Sidebar() {
  const { isAuthenticated, user, logout } = useAuthContext();
  const { mode } = useConfig();
  useDarkMode();

  if (!isAuthenticated) return null;

  return (
    <aside className="w-56 h-screen sticky top-0 flex flex-col border-r bg-card shrink-0">
      {/* Logo */}
      <div className="px-4 py-[14px]">
        <Link
          to="/"
          className="font-bold text-[15px] tracking-tight flex items-center gap-2.5 group"
        >
          <div className="relative">
            <img src={logo} alt="Sifter" className="h-7 w-7 transition-transform group-hover:scale-105" />
          </div>
          <span className="text-primary">Sifter</span>
        </Link>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-3" />

      {/* Main nav */}
      <nav className="flex flex-col px-2 pt-3 flex-1">
        <p className="px-3 pb-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em]">
          Workspace
        </p>
        <div className="flex flex-col gap-0.5">
          <NavLink to="/" end className={navLinkClass}>
            <FileText className="h-4 w-4 shrink-0" />
            Sifts
          </NavLink>
          <NavLink to="/folders" className={navLinkClass}>
            <Folder className="h-4 w-4 shrink-0" />
            Folders
          </NavLink>
          <NavLink to="/chat" className={navLinkClass}>
            <MessageCircle className="h-4 w-4 shrink-0" />
            Chat
          </NavLink>
          <NavLink to="/dashboards" className={navLinkClass}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Dashboards
          </NavLink>
        </div>

        <p className="px-3 pt-5 pb-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.14em]">
          Build
        </p>
        <div className="flex flex-col gap-0.5">
          <NavLink to="/connectors" className={navLinkClass}>
            <Plug className="h-4 w-4 shrink-0" />
            Connectors
          </NavLink>
          <NavLink to="/webhooks" className={navLinkClass}>
            <Webhook className="h-4 w-4 shrink-0" />
            Webhooks
          </NavLink>
          <NavLink to="/mcp" className={navLinkClass}>
            <Bot className="h-4 w-4 shrink-0" />
            MCP
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
          <NavLink to="/settings" end className={navLinkClass}>
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </NavLink>
          <button
            onClick={logout}
            className={`${navItemBase} text-muted-foreground hover:text-foreground hover:bg-muted/60 border-l-2 border-transparent pl-[10px]`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
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

      {/* User identity — clean, no actions */}
      <div className="px-2 py-3">
        <Link
          to="/settings/account"
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/70 transition-colors"
        >
          <UserAvatar src={user?.avatar_url ?? null} name={user?.full_name ?? user?.email ?? ""} size={27} />
          <div className="min-w-0 flex-1">
            {user?.full_name && (
              <p className="text-xs font-medium truncate leading-snug">{user.full_name}</p>
            )}
            <p className="text-[11px] text-muted-foreground truncate leading-snug">{user?.email}</p>
          </div>
        </Link>
      </div>
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
        <Sidebar />
        {mode === "cloud" && (
          <Suspense fallback={null}>
            <PlanLimitDialog />
          </Suspense>
        )}
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<ProtectedRoute><SiftsPage /></ProtectedRoute>} />
              <Route path="/sifts/:id" element={<ProtectedRoute><SiftDetailPage /></ProtectedRoute>} />
              <Route
                path="/chat"
                element={<ProtectedRoute><ChatPage /></ProtectedRoute>}
              />
              {/* Dashboards — available in both OSS and cloud */}
              <Route path="/dashboards" element={<ProtectedRoute><DashboardListPage /></ProtectedRoute>} />
              <Route path="/dashboards/:id" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/folders" element={<ProtectedRoute><FolderBrowserPage /></ProtectedRoute>} />
              <Route path="/folders/:id" element={<ProtectedRoute><FolderBrowserPage /></ProtectedRoute>} />
              <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetailPage /></ProtectedRoute>} />
              {/* Top-level Build surface — OSS + Cloud */}
              <Route path="/webhooks" element={<ProtectedRoute><WebhooksSettingsPage /></ProtectedRoute>} />
              <Route path="/connectors" element={<ProtectedRoute><ConnectorsRoute /></ProtectedRoute>} />
              <Route path="/mcp" element={<ProtectedRoute><MCPSetupPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}>
                <Route index element={<SettingsIndex />} />
                <Route path="account" element={<AccountSettingsPage />} />
                <Route path="appearance" element={<AppearanceSettingsPage />} />
                {mode === "cloud" && (
                  <>
                    <Route path="billing" element={<BillingPage />} />
                    <Route path="audit" element={<AuditLogPage />} />
                    <Route path="shares" element={<SharesPage />} />
                  </>
                )}
              </Route>
              {/* Cloud-only top-level routes */}
              {mode === "cloud" && (
                <>
                  <Route path="/connectors/callback" element={<ConnectorCallbackPage />} />
                </>
              )}
              {/* Public / auth callbacks */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
              <Route path="/s/:slug" element={<PublicViewerPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />
            </Routes>
          </Suspense>
        </main>
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
        <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
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
