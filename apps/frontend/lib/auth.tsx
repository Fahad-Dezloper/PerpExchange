"use client";

// Auth/session seam. Token persisted in localStorage, sent as the
// `token` header by lib/api.ts. Wrap the app in <AuthProvider>.

import { createContext, useContext, useEffect, useState } from "react";
import * as api from "./api";

type AuthState = {
  token: string | null;
  username: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("token"));
    setUsername(localStorage.getItem("username"));
  }, []);

  async function login(u: string, p: string) {
    setLoading(true);
    try {
      const { token } = await api.signin(u, p);
      localStorage.setItem("token", token);
      localStorage.setItem("username", u);
      setToken(token);
      setUsername(u);
    } finally {
      setLoading(false);
    }
  }

  async function signup(u: string, p: string) {
    setLoading(true);
    try {
      await api.signup(u, p);
      await login(u, p); // auto sign-in after signup
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken(null);
    setUsername(null);
  }

  return <Ctx.Provider value={{ token, username, loading, login, signup, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}
