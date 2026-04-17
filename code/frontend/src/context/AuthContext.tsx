import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { fetchMe, googleAuth as apiGoogleAuth, login as apiLogin, register as apiRegister } from "../api/auth";
import { User } from "../api/types";
import { clearToken, getToken, setToken } from "../lib/apiFetch";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    navigate("/login");
  }, [navigate]);

  // On mount: restore session from localStorage
  useEffect(() => {
    const token = getToken();
    if (token) {
      fetchMe()
        .then((me) => setUser(me))
        .catch(() => {
          clearToken();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Listen for auth-expired events dispatched by apiFetch
  useEffect(() => {
    const handler = () => {
      setUser(null);
      navigate("/login");
    };
    window.addEventListener("sifter:auth-expired", handler);
    return () => window.removeEventListener("sifter:auth-expired", handler);
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      const data = await apiRegister(email, password, fullName);
      setToken(data.access_token);
      setUser(data.user);
    },
    []
  );

  const loginWithGoogle = useCallback(async (credential: string) => {
    const data = await apiGoogleAuth(credential);
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        loginWithGoogle,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
  return ctx;
}
