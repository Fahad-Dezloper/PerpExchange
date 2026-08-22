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
import { onReconnect, useChannel } from "./ws";
import { notify } from "./toast";

type OrdersCtx = {
  orders: OpenOrder[];
  loading: boolean;
  refresh: () => Promise<void>;
};
const Ctx = createContext<OrdersCtx | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { token, userId } = useAuth();
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

  useChannel<any>(userId ? `user.${userId}` : null, (m) => {
    if (!m?.type) return;
    if (
      m.type === "order" &&
      (m.status === "Filled" || m.status === "Cancelled")
    ) {
      setRaw((prev) => prev.filter((o) => o.orderId !== m.orderId));
    }

    if (m.type === "order" || m.type === "fill") refresh();

    if (m.type === "fill") {
      const sym = byId[m.marketId] ?? m.marketId;
      notify.success(
        "Order filled",
        `${String(m.side).toUpperCase()} ${+m.qty} ${sym} @ ${+m.price}`,
      );
    }
  });
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
