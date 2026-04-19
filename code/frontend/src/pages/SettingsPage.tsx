import { Outlet, NavLink } from "react-router-dom";
import {
  ClipboardList,
  CreditCard,
  Palette,
  Share2,
  UserCircle,
} from "lucide-react";
import { useAuthContext } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";

const settingsNavClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
    isActive
      ? "bg-primary/10 text-foreground font-medium"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
  }`;

export default function SettingsPage() {
  const { user } = useAuthContext();
  const { mode } = useConfig();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-card/60 min-h-[48px]">
        <h1 className="text-sm font-semibold">Settings</h1>
        {user?.email && (
          <span className="text-xs text-muted-foreground">{user.email}</span>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        <nav className="w-44 shrink-0 space-y-0.5 px-3 py-4 border-r bg-card/40">
          <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">General</p>
          <NavLink to="/settings/account" className={settingsNavClass}>
            <UserCircle className="h-4 w-4 shrink-0" />Account
          </NavLink>
          <NavLink to="/settings/appearance" className={settingsNavClass}>
            <Palette className="h-4 w-4 shrink-0" />Appearance
          </NavLink>

          {mode === "cloud" && (
            <>
              <p className="px-3 py-1 mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cloud</p>
              <NavLink to="/settings/billing" className={settingsNavClass}>
                <CreditCard className="h-4 w-4 shrink-0" />Billing
              </NavLink>
              <NavLink to="/settings/audit" className={settingsNavClass}>
                <ClipboardList className="h-4 w-4 shrink-0" />Audit log
              </NavLink>
              <NavLink to="/settings/shares" className={settingsNavClass}>
                <Share2 className="h-4 w-4 shrink-0" />Shares
              </NavLink>
            </>
          )}
        </nav>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
