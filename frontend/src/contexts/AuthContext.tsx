"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { desktop } from "@/lib/desktop";

/**
 * Desktop app: one local data owner per installation (backend
 * middleware/requireAuth.ts). The signed-in CapScreen account comes from the
 * shell and is shown for attribution only; sign-in itself happens in the
 * shell before this UI loads.
 */
export const LOCAL_USER = { id: "local-user", email: "you@capscreen.local" };

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(LOCAL_USER);

  useEffect(() => {
    const account = desktop()?.user;
    if (account) setUser({ id: LOCAL_USER.id, email: account.email });
  }, []);

  // The desktop shell revokes the session and shows its sign-in screen.
  const signOut = async () => {
    await desktop()?.signOut();
  };

  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
