import type { AxiosError } from "axios";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import api from "../api/axios";

type AuthUser = {
  id: number | string;
  username: string;
  displayName: string;
};

type LoginResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: AuthUser;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
};

const TOKEN_STORAGE_KEY = "auth_token";
const USER_STORAGE_KEY = "auth_user";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } 
  catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await api.post<LoginResponse>("/api/auth/login", {
        username,
        password,
      });

      const nextToken = response.data.accessToken;
      const nextUser = response.data.user;

      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));

      setToken(nextToken);
      setUser(nextUser);

      return { ok: true };
    } 
    catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const message =
        axiosError.response?.data?.message || "Unable to login. Please check your credentials.";

      return { ok: false, message };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
