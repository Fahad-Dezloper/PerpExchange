"use client";

import { createContext, useContext, useEffect } from "react";
import { authClient } from "./auth-client";
import { setUnauthorizedHandler } from "./api";
import { notify } from "./toast";

type AuthState = {
  token: string | null;
  username: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  async function login(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error(error.message ?? "Sign in failed");
  }

  async function signup(email: string, password: string) {
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: email.split("@")[0],
    });
    if (error) throw new Error(error.message ?? "Sign up failed");
  }

  function logout() {
    authClient.signOut();
    localStorage.removeItem("bearer_token");
  }

  // surface expired/invalid sessions globally (any 401/403 from the API)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      notify.error("Session expired", "Please sign in again.");
      logout();
    });
  }, []);

  return (
    <Ctx.Provider
      value={{
        token: session ? (typeof window !== "undefined" ? localStorage.getItem("bearer_token") : null) : null,
        username: session?.user.email ?? null,
        loading: isPending,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}
