import React, { createContext, useContext, useEffect, useState } from "react";

export type DeploymentMode = "oss" | "cloud";

interface ConfigContextValue {
  mode: DeploymentMode;
  isLoaded: boolean;
  googleAuthEnabled: boolean;
  googleClientId: string | null;
}

const ConfigContext = createContext<ConfigContextValue>({
  mode: "oss",
  isLoaded: false,
  googleAuthEnabled: false,
  googleClientId: null,
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DeploymentMode>("oss");
  const [isLoaded, setIsLoaded] = useState(false);
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.mode === "cloud") setMode("cloud");
        if (data.googleAuthEnabled) {
          setGoogleAuthEnabled(true);
          setGoogleClientId(data.googleClientId ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  return (
    <ConfigContext.Provider value={{ mode, isLoaded, googleAuthEnabled, googleClientId }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  return useContext(ConfigContext);
}
