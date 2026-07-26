"use client";

import { useEffect, useState } from "react";
import { makeTrades, fmtNum, type Trade } from "../../../lib/mock";

// REAL: ws trade.<symbol>
export default function TradesTape({ mid, dp }: { mid: number; dp: number }) {
  const [trades, setTrades] = useState<Trade[]>(() => makeTrades(mid));

  useEffect(() => {
    const id = setInterval(() => {
      const side = Math.random() > 0.5 ? "buy" : "sell";
      const t: Trade = {
        price: +(mid + (Math.random() - 0.5) * mid * 0.0008).toFixed(dp),
        size: +(Math.random() * 3 + 0.01).toFixed(3),
        side,
        time: new Date().toISOString().slice(11, 19),
      };
      setTrades((prev) => [t, ...prev].slice(0, 30));
    }, 1500);
    return () => clearInterval(id);
  }, [mid, dp]);

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
      <div className="overflow-y-auto">
        {trades.map((t, i) => (
          <div key={i} className="grid grid-cols-3 px-3 py-[3px] text-xs">
            <span className={`tnum ${t.side === "buy" ? "text-long" : "text-short"}`}>{fmtNum(t.price, dp)}</span>
            <span className="tnum text-right">{fmtNum(t.size, 3)}</span>
            <span className="tnum text-right text-muted">{t.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
