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

type PositionCtx = {
  positions: Position[];
  loading: boolean;
  refresh: () => Promise<void>;
};
const Ctx = createContext<PositionCtx | null>(null);

const PositionProvider = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth();
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
    refresh();
  }, [refresh]);

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
