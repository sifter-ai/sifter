import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { type Theme, useDarkMode } from "../hooks/useDarkMode";

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useDarkMode();

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-3 ring-1 ring-primary/10">
          <Palette className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Preferences
          </p>
          <h2 className="text-2xl font-semibold tracking-tight leading-none">Appearance</h2>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Tune Sifter to your environment. Your choice lives in this browser and
            follows you across every page.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <ThemeOption
          label="Light"
          tagline="Bright · daylight"
          active={theme === "light"}
          onSelect={() => setTheme("light")}
          icon={<Sun className="h-4 w-4 text-amber-500" strokeWidth={1.75} />}
          preview="light"
        />
        <ThemeOption
          label="Dark"
          tagline="Calm · low-light"
          active={theme === "dark"}
          onSelect={() => setTheme("dark")}
          icon={<Moon className="h-4 w-4 text-indigo-400" strokeWidth={1.75} />}
          preview="dark"
        />
        <ThemeOption
          label="System"
          tagline="Follows OS setting"
          active={theme === "system"}
          onSelect={() => setTheme("system")}
          icon={<Monitor className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
          preview="system"
        />
      </div>
    </div>
  );
}

function ThemeOption({
  label,
  tagline,
  active,
  onSelect,
  icon,
  preview,
}: {
  label: string;
  tagline: string;
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  preview: Theme;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all ${
        active
          ? "border-primary/60 ring-2 ring-primary/20 shadow-sm"
          : "border-border hover:border-foreground/20"
      }`}
    >
      <ThemePreview variant={preview} />
      <div className="flex items-center gap-2.5 px-4 py-3 border-t bg-card">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-[11px] text-muted-foreground tracking-wide truncate">{tagline}</p>
        </div>
        {active && (
          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary shrink-0">
            Active
          </span>
        )}
      </div>
    </button>
  );
}

const lightColors = {
  bg: "#ffffff",
  sidebar: "#f4f4f5",
  muted: "#e4e4e7",
  accent: "#18181b",
  subtle: "#a1a1aa",
};

const darkColors = {
  bg: "#0a0a0a",
  sidebar: "#171717",
  muted: "#27272a",
  accent: "#fafafa",
  subtle: "#52525b",
};

function PreviewInner({ colors }: { colors: typeof lightColors }) {
  return (
    <div className="absolute inset-0" style={{ backgroundColor: colors.bg }}>
      <div
        className="absolute left-0 top-0 bottom-0 w-[28%] p-2 space-y-1.5"
        style={{ backgroundColor: colors.sidebar }}
      >
        <div className="h-1.5 rounded-full" style={{ backgroundColor: colors.accent, width: "60%" }} />
        <div className="h-1 rounded-full" style={{ backgroundColor: colors.muted, width: "85%" }} />
        <div className="h-1 rounded-full" style={{ backgroundColor: colors.muted, width: "70%" }} />
        <div className="h-1 rounded-full" style={{ backgroundColor: colors.muted, width: "80%" }} />
      </div>
      <div className="absolute left-[28%] top-0 right-0 bottom-0 p-3 space-y-2">
        <div className="h-2 rounded-full" style={{ backgroundColor: colors.accent, width: "45%" }} />
        <div className="h-1.5 rounded-full" style={{ backgroundColor: colors.subtle, width: "70%" }} />
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <div className="aspect-[2/1] rounded" style={{ backgroundColor: colors.muted }} />
          <div className="aspect-[2/1] rounded" style={{ backgroundColor: colors.muted }} />
        </div>
      </div>
    </div>
  );
}

function ThemePreview({ variant }: { variant: Theme }) {
  if (variant === "system") {
    return (
      <div className="aspect-[16/10] w-full relative overflow-hidden">
        <div className="absolute inset-0" style={{ clipPath: "polygon(0 0, 50% 0, 50% 100%, 0 100%)" }}>
          <PreviewInner colors={lightColors} />
        </div>
        <div className="absolute inset-0" style={{ clipPath: "polygon(50% 0, 100% 0, 100% 100%, 50% 100%)" }}>
          <PreviewInner colors={darkColors} />
        </div>
        <div className="absolute inset-y-0 left-[50%] w-px bg-zinc-400/40" />
      </div>
    );
  }

  const colors = variant === "light" ? lightColors : darkColors;
  return (
    <div className="aspect-[16/10] w-full relative overflow-hidden">
      <PreviewInner colors={colors} />
    </div>
  );
}
