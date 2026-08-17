"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { useChannel } from "./ws";
import { useMarkets } from "./market";

const Ctx = createContext<Record<string, number>>({});

function Sub({
  symbol,
  id,
  set,
}: {
  symbol: string;
  id: string;
  set: (s: string, p: number) => void;
}) {
  useChannel<{ markPrice?: string; price?: string }>(`ticker.${id}`, (d) => {
    const p = Number(d.markPrice ?? d.price);
    if (p) set(symbol, p);
  });
  return null;
}

export function PricesProvider({ children }: { children: React.ReactNode }) {
  const { markets } = useMarkets();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const set = useCallback(
    (s: string, p: number) =>
      setPrices((prev) => (prev[s] === p ? prev : { ...prev, [s]: p })),
    [],
  );
  return (
    <Ctx.Provider value={prices}>
      {markets.map((m) => (
        <Sub key={m.id} symbol={m.symbol} id={m.id} set={set} />
      ))}
      {children}
    </Ctx.Provider>
  );
}

export function useLivePrices() {
  return useContext(Ctx);
}
