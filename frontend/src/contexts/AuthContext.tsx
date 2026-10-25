"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { PREVIEW_USER, UI_PREVIEW_MODE } from "@/lib/uiPreview";
import { desktop } from "@/lib/desktop";
import {
  getCurrentUser,
  signOut as apiSignOut,
} from "@/lib/authApi";

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(
    UI_PREVIEW_MODE ? PREVIEW_USER : null,
  );
  const [authLoading, setAuthLoading] = useState(!UI_PREVIEW_MODE);

  const refreshUser = async () => {
    if (UI_PREVIEW_MODE) {
      // Desktop: the signed-in account's email; data stays owned by the local user.
      const account = desktop()?.user;
      setUser(account ? { id: PREVIEW_USER.id, email: account.email } : PREVIEW_USER);
      setAuthLoading(false);
      return;
    }

    const current = await getCurrentUser();
    if (current) {
      setUser({ id: current.id, email: current.email });
    } else {
      setUser(null);
    }
    setAuthLoading(false);
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const signOut = async () => {
    const bridge = desktop();
    if (bridge) {
      // The desktop shell revokes the session and shows the sign-in screen.
      await bridge.signOut();
      return;
    }
    if (UI_PREVIEW_MODE) return;
    await apiSignOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        authLoading,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
