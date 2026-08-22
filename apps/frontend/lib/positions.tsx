"use client";

import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./auth";
import { useMarkets } from "./market";
import * as api from "@/lib/api";
import { Position } from "./types";
import { onReconnect, useChannel } from "./ws";
import { notify } from "./toast";

type PositionCtx = {
  positions: Position[];
  loading: boolean;
  refresh: () => Promise<void>;
};
const Ctx = createContext<PositionCtx | null>(null);

const PositionProvider = ({ children }: { children: React.ReactNode }) => {
  const { token, userId } = useAuth();
  const { markets } = useMarkets();
  const [raw, setRaw] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setRaw([]);
      return;
    }
    setLoading(true);
    try {
      setRaw(await api.getPositions());
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    onReconnect(refresh);
  }, [refresh]);

  useChannel<any>(userId ? `user.${userId}` : null, (m) => {
    if (m?.type === "position") {
      const entry = +m.entryPrice;
      const margin = +m.margin;
      const pos: Position = {
        symbol: m.marketId,
        side: m.side,
        size: +m.qty,
        entry,
        mark: entry,
        leverage: m.leverage,
        margin,
        liq: +m.liquidationPrice,
        pnl: 0,
        pnlPct: 0,
      };
      setRaw((prev) => [...prev.filter((p) => p.symbol !== m.marketId), pos]);
    } else if (m?.type === "position_closed" || m?.type === "liquidation") {
      setRaw((prev) => prev.filter((p) => p.symbol !== m.marketId));
      if (m.type === "liquidation") {
        const sym =
          markets.find((x) => x.id === m.marketId)?.symbol ?? m.marketId;
        notify.error("Position liquidated", `${sym} · ${m.side}`);
      }
    }
  });

  const byId = Object.fromEntries(markets.map((m) => [m.id, m.symbol]));
  const positions = raw.map((p) => ({
    ...p,
    symbol: byId[p.symbol] ?? p.symbol,
  }));
  return (
    <Ctx.Provider value={{ positions, loading, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export function usePositons() {
  const c = useContext(Ctx);
  if (!c)
    throw new Error("usePositions must be used inside <PositioinProvider>");
  return c;
}

export default PositionProvider;
