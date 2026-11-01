"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  profileImage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (name: string, username: string, email: string, password: string, profileImage?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwtPayload(token: string): { exp?: number; userId?: string } | null {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadStr = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payloadStr);
  } catch {
    return null;
  }
}

function isTokenValid(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string" || token === "undefined" || token === "null" || token.trim() === "") {
    return false;
  }
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) {
    return false;
  }
  // Grace buffer: if token expires in <= 15s, treat as expired
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp > nowInSeconds + 15;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Save tokens to localStorage
  const saveTokens = (access: string, refresh: string) => {
    if (!access || access === "undefined" || access === "null") return;
    setAccessToken(access);
    try {
      localStorage.setItem("chat_access_token", access);
      if (refresh && refresh !== "undefined" && refresh !== "null") {
        localStorage.setItem("chat_refresh_token", refresh);
      }
    } catch (e) {
      console.error("Failed to persist tokens in localStorage", e);
    }
  };

  // Clear tokens from state & localStorage
  const clearTokens = () => {
    setUser(null);
    setAccessToken(null);
    disconnectSocket();
    try {
      localStorage.removeItem("chat_access_token");
      localStorage.removeItem("chat_refresh_token");
    } catch (e) {
      console.error("Failed to remove tokens from localStorage", e);
    }
  };

  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);

  // Refresh session using refresh token with concurrency deduplication
  const refreshSession = useCallback(async (): Promise<boolean> => {
    // If a refresh request is already in-flight, return the active promise to avoid duplicate rotation
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const executeRefresh = async (): Promise<boolean> => {
      let refreshToken: string | null = null;
      try {
        refreshToken = localStorage.getItem("chat_refresh_token");
      } catch {
        // localStorage unavailable
      }

      if (!refreshToken || refreshToken === "undefined" || refreshToken === "null" || refreshToken.trim() === "") {
        clearTokens();
        return false;
      }

      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          clearTokens();
          return false;
        }

        const json = await res.json();
        if (json.success && json.data?.accessToken) {
          saveTokens(json.data.accessToken, json.data.refreshToken || refreshToken);

          // Fetch user profile with new access token
          const meRes = await fetch(`${apiBase}/auth/me`, {
            headers: { Authorization: `Bearer ${json.data.accessToken}` },
            credentials: "include",
          });

          if (meRes.ok) {
            const meJson = await meRes.json();
            if (meJson.success && meJson.data?.user) {
              setUser(meJson.data.user);
              return true;
            }
          }
        }
        clearTokens();
        return false;
      } catch {
        clearTokens();
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    };

    const promise = executeRefresh();
    refreshPromiseRef.current = promise;
    return promise;
  }, []);

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      let storedAccessToken: string | null = null;
      let storedRefreshToken: string | null = null;

      try {
        storedAccessToken = localStorage.getItem("chat_access_token");
        storedRefreshToken = localStorage.getItem("chat_refresh_token");
      } catch {
        // Ignored
      }

      if (storedAccessToken === "undefined" || storedAccessToken === "null" || storedAccessToken?.trim() === "") {
        storedAccessToken = null;
      }
      if (storedRefreshToken === "undefined" || storedRefreshToken === "null" || storedRefreshToken?.trim() === "") {
        storedRefreshToken = null;
      }

      // If user is completely logged out (no tokens in storage), finish immediately without any API call
      if (!storedAccessToken && !storedRefreshToken) {
        if (isMounted) {
          clearTokens();
          setIsLoading(false);
        }
        return;
      }

      const apiBase = getApiBaseUrl();

      // 1. If stored access token is present AND valid (not expired), verify with /api/auth/me
      if (storedAccessToken && isTokenValid(storedAccessToken)) {
        try {
          const res = await fetch(`${apiBase}/auth/me`, {
            headers: { Authorization: `Bearer ${storedAccessToken}` },
            credentials: "include",
          });

          if (res.ok) {
            const json = await res.json();
            if (isMounted && json.success && json.data?.user) {
              setUser(json.data.user);
              setAccessToken(storedAccessToken);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          // If verification threw network or auth error, fallback to refresh
        }
      }

      // 2. If access token was expired/missing but refresh token exists, attempt refresh
      if (storedRefreshToken) {
        const refreshed = await refreshSession();
        if (isMounted) {
          if (!refreshed) {
            clearTokens();
          }
          setIsLoading(false);
          return;
        }
      }

      if (isMounted) {
        clearTokens();
        setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [refreshSession]);

  // Proactive background refresh before token expiration
  useEffect(() => {
    if (!accessToken) return;
    const payload = parseJwtPayload(accessToken);
    if (!payload?.exp) return;

    const expiresInMs = payload.exp * 1000 - Date.now();
    // Refresh 60 seconds before expiration, minimum 10 seconds
    const refreshDelayMs = Math.max(expiresInMs - 60000, 10000);

    const timer = setTimeout(() => {
      refreshSession();
    }, refreshDelayMs);

    return () => clearTimeout(timer);
  }, [accessToken, refreshSession]);

  // Login handler
  const login = async (identifier: string, password: string) => {
    const apiBase = getApiBaseUrl();
    let res: Response;

    try {
      res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
    } catch {
      throw new Error("Unable to connect to server. Please check your network connection.");
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Server returned status ${res.status}. Please try again later.`);
    }

    if (!res.ok || !json.success) {
      const errorMsg = json?.error?.message || "Invalid email/username or password";
      throw new Error(errorMsg);
    }

    saveTokens(json.data.accessToken, json.data.refreshToken);
    setUser(json.data.user);
    router.push("/");
  };

  // Register handler
  const register = async (
    name: string,
    username: string,
    email: string,
    password: string,
    profileImage?: string
  ) => {
    const apiBase = getApiBaseUrl();
    let res: Response;

    try {
      res = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          profileImage: profileImage?.trim() || undefined,
        }),
      });
    } catch {
      throw new Error("Unable to connect to server. Please check your network connection.");
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Server returned status ${res.status}. Please try again later.`);
    }

    if (!res.ok || !json.success) {
      const errorMsg = json?.error?.message || "Registration failed. Please check your inputs.";
      throw new Error(errorMsg);
    }

    saveTokens(json.data.accessToken, json.data.refreshToken);
    setUser(json.data.user);
    router.push("/");
  };

  // Logout handler
  const logout = async () => {
    let refreshToken: string | null = null;
    try {
      refreshToken = localStorage.getItem("chat_refresh_token");
    } catch {
      // Ignored
    }

    try {
      if (refreshToken) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // Best-effort logout notification
    } finally {
      clearTokens();
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
