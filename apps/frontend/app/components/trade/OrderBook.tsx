"use client";

import { useEffect, useMemo, useState } from "react";
import { makeOrderBook, fmtNum } from "../../../lib/mock";

// REAL: seed with GET /api/v1/depth, then apply ws depth.<symbol> deltas.
export default function OrderBook({ mid, dp }: { mid: number; dp: number }) {
  const [book, setBook] = useState(() => makeOrderBook(mid));

  useEffect(() => {
    const id = setInterval(() => setBook(makeOrderBook(mid)), 900);
    return () => clearInterval(id);
  }, [mid]);

  const maxTotal = useMemo(
    () => Math.max(...book.asks.map((l) => l.total), ...book.bids.map((l) => l.total), 1),
    [book],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted">
        <span className="font-medium text-fg">Order Book</span>
        <span>Size</span>
      </div>
      <div className="grid grid-cols-3 px-3 pb-1 text-[11px] text-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* asks */}
      <div className="flex flex-col-reverse">
        {book.asks.map((l, i) => (
          <Row key={"a" + i} l={l} dp={dp} tone="short" pct={(l.total / maxTotal) * 100} />
        ))}
      </div>

      {/* spread */}
      <div className="tnum my-1 flex items-center justify-between border-y border-border px-3 py-1.5 text-sm">
        <span className="font-semibold">{fmtNum(mid, dp)}</span>
        <span className="text-[11px] text-muted">spread {fmtNum(book.asks[book.asks.length - 1].price - book.bids[0].price, dp)}</span>
      </div>

      {/* bids */}
      <div className="flex flex-col">
        {book.bids.map((l, i) => (
          <Row key={"b" + i} l={l} dp={dp} tone="long" pct={(l.total / maxTotal) * 100} />
        ))}
      </div>
    </div>
  );
}

function Row({ l, dp, tone, pct }: { l: { price: number; size: number; total: number }; dp: number; tone: "long" | "short"; pct: number }) {
  return (
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-xs">
      <div
        className={`absolute inset-y-0 right-0 ${tone === "long" ? "bg-long/10" : "bg-short/10"}`}
        style={{ width: `${pct}%` }}
      />
      <span className={`tnum relative ${tone === "long" ? "text-long" : "text-short"}`}>{fmtNum(l.price, dp)}</span>
      <span className="tnum relative text-right">{fmtNum(l.size, 3)}</span>
      <span className="tnum relative text-right text-muted">{fmtNum(l.total, 3)}</span>
    </div>
  );
}
