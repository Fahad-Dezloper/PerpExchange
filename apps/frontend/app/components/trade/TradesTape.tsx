"use client";

import { useRef, useState } from "react";
import { fmtNum } from "../../../lib/mock";
import { useChannel } from "@/lib/ws";

type Trade = { price: number; qty: number; up: boolean; time: string };

export default function TradesTape({
  marketId,
  dp,
}: {
  marketId: string | null;
  dp: number;
}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const lastPrice = useRef<number | null>(null);

  useChannel<{ price: string | number; qty: string | number }>(
    marketId ? `trade.${marketId}` : null,
    (t) => {
      const price = Number(t.price);
      const qty = Number(t.qty);
      if (!price) return;
      const up = lastPrice.current == null ? true : price >= lastPrice.current;
      lastPrice.current = price;
      const time = new Date().toISOString().slice(11, 19);
      setTrades((prev) => [{ price, qty, up, time }, ...prev].slice(0, 40));
    },
  );

  return (
    <div className="flex max-h-64 flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="font-medium">Recent Trades</span>
      </div>
      <div className="grid grid-cols-3 px-3 pb-1 text-[11px] text-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="grid place-items-center py-10 text-xs text-muted">
            No trades yet
          </div>
        ) : (
          trades.map((t, i) => (
            <div key={i} className="grid grid-cols-3 px-3 py-[3px] text-xs">
              <span className={`tnum ${t.up ? "text-long" : "text-short"}`}>
                {fmtNum(t.price, dp)}
              </span>
              <span className="tnum text-right">{fmtNum(t.qty, 4)}</span>
              <span className="tnum text-right text-muted">{t.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
