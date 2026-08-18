import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { clearToken, getToken, login as loginRequest, setToken } from "../api/client";
import type { SessionUser } from "../api/client";

const USER_KEY = "delosur_user";

function loadStoredUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(loadStoredUser());
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getToken()));

  async function login(username: string, password: string) {
    const { token, user: sessionUser } = await loginRequest(username, password);
    setToken(token);
    localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    setIsAuthenticated(true);
    return sessionUser;
  }

  function logout() {
    clearToken();
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
