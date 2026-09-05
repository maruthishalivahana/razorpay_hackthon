"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getCurrentUser, login as apiLogin, logout as apiLogout } from "@/lib/api/auth";
import type { User, UserRole, LoginRequest } from "@/types/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  merchantId: string | null;
  buyerId: string | null;
  login: (data: LoginRequest) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getCurrentUser();
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      // 401 or unauthenticated error
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const handleLogin = async (data: LoginRequest): Promise<User> => {
    const res = await apiLogin(data);
    if (res.success && res.data) {
      setUser(res.data);
      return res.data;
    }
    throw new Error(res.message || "Login failed");
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await apiLogout();
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    role: user?.role || null,
    merchantId: user?.merchantId || null,
    buyerId: user?.buyerId || null,
    login: handleLogin,
    logout: handleLogout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
