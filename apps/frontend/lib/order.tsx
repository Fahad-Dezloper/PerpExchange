"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { OpenOrder } from "./mock";
import { useAuth } from "./auth";
import { useMarkets } from "./market";
import * as api from "@/lib/api";
import { onReconnect } from "./ws";

type OrdersCtx = {
  orders: OpenOrder[];
  loading: boolean;
  refresh: () => Promise<void>;
};
const Ctx = createContext<OrdersCtx | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { markets } = useMarkets();
  const [raw, setRaw] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setRaw([]);
      return;
    }
    setLoading(true);
    try {
      setRaw(await api.getOpenOrders());
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    onReconnect(refresh);
  }, [refresh]);

  const byId = Object.fromEntries(markets.map((m) => [m.id, m.symbol]));

  const orders = raw.map((o) => ({
    ...o,
    symbol: byId[o.marketId] ?? o.symbol,
  }));

  return (
    <Ctx.Provider value={{ orders, loading, refresh }}>{children}</Ctx.Provider>
  );
}

export function useOrders() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrders must be used inside <OrdersProvider>");
  return c;
}
