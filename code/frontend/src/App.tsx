import React, { lazy, Suspense } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import {
  FileText,
  Folder,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Settings,
} from "lucide-react";
import logo from "@/assets/logo.svg";
import { SiftsPage } from "@/pages/SiftsPage";
import { SiftDetailPage } from "@/pages/SiftDetailPage";
import { ChatPage } from "@/pages/ChatPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import SettingsPage, { SettingsIndex } from "@/pages/SettingsPage";
import FolderBrowserPage from "@/pages/FolderBrowserPage";
import DocumentDetailPage from "@/pages/DocumentDetailPage";
import LandingPage from "@/pages/LandingPage";
import EnterprisePage from "@/pages/EnterprisePage";
import GitHubCallbackPage from "@/pages/GitHubCallbackPage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { ConfigProvider, useConfig } from "@/context/ConfigContext";

// Cloud pages — lazy loaded so they don't affect OSS bundle size
const BillingPage = lazy(() => import("@/pages/cloud/BillingPage"));
const UsagePage = lazy(() => import("@/pages/cloud/UsagePage"));
const AuditLogPage = lazy(() => import("@/pages/cloud/AuditLogPage"));
const ConnectorsPage = lazy(() => import("@/pages/cloud/ConnectorsPage"));
const ConnectorCallbackPage = lazy(() => import("@/pages/cloud/ConnectorCallbackPage"));
const SharesPage = lazy(() => import("@/pages/cloud/SharesPage"));
const PublicViewerPage = lazy(() => import("@/pages/cloud/PublicViewerPage"));
const CloudChatPage = lazy(() => import("@/pages/cloud/CloudChatPage"));
const DashboardListPage = lazy(() => import("@/pages/cloud/DashboardListPage"));
const DashboardPage = lazy(() => import("@/pages/cloud/DashboardPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all w-full ${
    isActive
      ? "bg-primary/10 font-medium text-foreground border-l-2 border-primary pl-[10px]"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-l-2 border-transparent pl-[10px]"
  }`;

function Sidebar() {
  const { isAuthenticated, user, logout } = useAuthContext();
  const { mode } = useConfig();

  if (!isAuthenticated) return null;

  return (
    <aside className="w-56 h-screen sticky top-0 flex flex-col border-r bg-card shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border/50">
        <Link
          to="/"
          className="font-bold text-lg tracking-tight flex items-center gap-2.5"
        >
          <img src={logo} alt="Sifter" className="h-7 w-7" />
          <span className="text-primary">Sifter</span>
        </Link>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 px-2 pt-3">
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
        {mode === "cloud" && (
          <NavLink to="/dashboards" className={navLinkClass}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Dashboards
          </NavLink>
        )}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col gap-0.5 px-2 pb-4 border-t border-border/50 pt-3">
        {user?.email && (
          <p className="px-3 py-1 text-xs text-muted-foreground truncate">
            {user.email}
          </p>
        )}
        <NavLink to="/settings" className={navLinkClass}>
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </NavLink>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all w-full text-left border-l-2 border-transparent pl-[10px]"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function CloudRoutes() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <Route path="/settings/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
      <Route path="/settings/usage" element={<ProtectedRoute><UsagePage /></ProtectedRoute>} />
      <Route path="/settings/audit" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
      <Route path="/settings/connectors" element={<ProtectedRoute><ConnectorsPage /></ProtectedRoute>} />
      <Route path="/settings/shares" element={<ProtectedRoute><SharesPage /></ProtectedRoute>} />
      <Route path="/connectors/callback" element={<ConnectorCallbackPage />} />
      <Route path="/dashboards" element={<ProtectedRoute><DashboardListPage /></ProtectedRoute>} />
      <Route path="/dashboards/:id" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    </Suspense>
  );
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
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<ProtectedRoute><SiftsPage /></ProtectedRoute>} />
              <Route path="/sifts/:id" element={<ProtectedRoute><SiftDetailPage /></ProtectedRoute>} />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    {mode === "cloud" ? <CloudChatPage /> : <ChatPage />}
                  </ProtectedRoute>
                }
              />
              <Route path="/folders" element={<ProtectedRoute><FolderBrowserPage /></ProtectedRoute>} />
              <Route path="/folders/:id" element={<ProtectedRoute><FolderBrowserPage /></ProtectedRoute>} />
              <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetailPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}>
                <Route index element={<SettingsIndex />} />
                {mode === "cloud" && (
                  <>
                    <Route path="billing" element={<BillingPage />} />
                    <Route path="usage" element={<UsagePage />} />
                    <Route path="audit" element={<AuditLogPage />} />
                    <Route path="connectors" element={<ConnectorsPage />} />
                    <Route path="shares" element={<SharesPage />} />
                  </>
                )}
              </Route>
              {/* Cloud-only top-level routes */}
              {mode === "cloud" && (
                <>
                  <Route path="/connectors/callback" element={<ConnectorCallbackPage />} />
                  <Route path="/dashboards" element={<ProtectedRoute><DashboardListPage /></ProtectedRoute>} />
                  <Route path="/dashboards/:id" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                </>
              )}
              {/* Public / auth callbacks */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
              <Route path="/s/:slug" element={<PublicViewerPage />} />
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
