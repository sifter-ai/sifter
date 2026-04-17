import { useConfig } from "@/context/ConfigContext";

export function CloudOnly({ children }: { children: React.ReactNode }) {
  const { mode } = useConfig();
  return mode === "cloud" ? <>{children}</> : null;
}
