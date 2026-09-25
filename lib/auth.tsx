"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Me, api, getToken, setRole, setToken } from "./api";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<Me | null>;
  signOut: () => void;
  refresh: () => Promise<Me | null>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(async (): Promise<Me | null> => {
    const token = getToken();
    let clearedRejectedSession = false;
    setLoading(true);
    setError(null);
    try {
      if (!token) {
        setMe(null);
        return null;
      }
      // Handle rejected sessions here; a temporary outage is not a logout.
      const m = await api<Me>("/api/auth/me", {}, { background: true });
      if (getToken() !== token) return null;
      // Cached so api() can route a 402 by role, not just by path.
      setRole(m.role);
      setMe(m);
      return m;
    } catch (err: any) {
      // An old request cannot invalidate a newer sign-in (or undo sign-out).
      if (getToken() !== token) return null;
      setMe(null);
      if (err?.status === 401) {
        setToken(null);
        clearedRejectedSession = true;
      }
      else setError("We couldn't check your account connection. Please retry.");
      return null;
    } finally {
      if (getToken() === token || clearedRejectedSession) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const body = new URLSearchParams({ username: email, password }).toString();
      const r = await api<{ access_token: string }>("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      setToken(r.access_token);
      const m = await refresh();
      if (!m) throw new Error("Sign-in could not finish checking your account. Please try again.");
      return m;
    },
    [refresh],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setLoading(false);
    setMe(null);
    setError(null);
    router.push("/sign-in");
  }, [router]);

  return <Ctx.Provider value={{ me, loading, error, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
