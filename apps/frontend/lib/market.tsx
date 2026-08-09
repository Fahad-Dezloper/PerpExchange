"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Market } from "./mock";
import * as api from "./api";

type MarketCtx = {
  markets: Market[];
  bySymbol: Record<string, Market>;
  loading: boolean;
};

const Ctx = createContext<MarketCtx | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getMarkets()
      .then(setMarkets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const bySymbol = Object.fromEntries(markets.map((m) => [m.symbol, m]));
  return (
    <Ctx.Provider value={{ markets, bySymbol, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMarkets() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMarkets must be used insde MarketProvider");
  return c;
}
