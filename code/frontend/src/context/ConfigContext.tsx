import React, { createContext, useContext, useEffect, useState } from "react";
import { apiUrl } from "@/lib/apiFetch";

export type DeploymentMode = "oss" | "cloud";

const DEFAULT_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp", ".heic", ".heif", ".docx", ".txt", ".md", ".html", ".htm", ".csv"];

interface ConfigContextValue {
  mode: DeploymentMode;
  isLoaded: boolean;
  googleAuthEnabled: boolean;
  googleClientId: string | null;
  supportedExtensions: string[];
}

const ConfigContext = createContext<ConfigContextValue>({
  mode: "oss",
  isLoaded: false,
  googleAuthEnabled: false,
  googleClientId: null,
  supportedExtensions: DEFAULT_EXTENSIONS,
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DeploymentMode>("oss");
  const [isLoaded, setIsLoaded] = useState(false);
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [supportedExtensions, setSupportedExtensions] = useState<string[]>(DEFAULT_EXTENSIONS);

  useEffect(() => {
    fetch(apiUrl("/api/config"))
      .then((r) => r.json())
      .then((data) => {
        if (data.mode === "cloud") setMode("cloud");
        if (data.googleAuthEnabled) {
          setGoogleAuthEnabled(true);
          setGoogleClientId(data.googleClientId ?? null);
        }
        if (data.supportedExtensions) setSupportedExtensions(data.supportedExtensions);
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  return (
    <ConfigContext.Provider value={{ mode, isLoaded, googleAuthEnabled, googleClientId, supportedExtensions }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  return useContext(ConfigContext);
}
