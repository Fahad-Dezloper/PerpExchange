"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { BalanceDto } from "./types";
import { useAuth } from "./auth";
import * as api from "./api";
import { onReconnect } from "./ws";

const ZERO: BalanceDto = { available: 0, locked: 0, equity: 0, unrealized: 0 };

type BalanceCtx = {
  balance: BalanceDto;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<BalanceCtx | null>(null);

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [balance, setBalance] = useState<BalanceDto>(ZERO);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setBalance(ZERO);
      return;
    }
    setLoading(true);
    try {
      setBalance(await api.getBalance());
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    onReconnect(refresh);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ balance, loading, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBalance() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBalance must be used inside <BalanceProvider>");
  return c;
}
