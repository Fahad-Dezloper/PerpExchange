"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtNum } from "../../../lib/mock";
import * as api from "@/lib/api";
import { useChannel } from "@/lib/ws";
import { Skeleton } from "@/components/ui/skeleton";

type Lvl = { price: number; size: number; total: number };
const cum = (rows: [string, string][], desc: boolean): Lvl[] => {
  let total = 0;
  const mapped = rows.map(([p, s]) => ({ price: +p, size: +s }));
  mapped.sort((a, b) => (desc ? b.price - a.price : a.price - b.price));
  return mapped.map((l) => ({ ...l, total: (total += l.size) }));
};

export default function OrderBook({
  marketId,
  dp,
  mid,
}: {
  marketId: string | null;
  dp: number;
  mid: number;
}) {
  const [book, setBook] = useState<{ bids: Lvl[]; asks: Lvl[] }>({
    bids: [],
    asks: [],
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!marketId) return;
    setLoaded(false);
    api
      .getDepth(marketId.toString())
      .then((d) =>
        setBook({ bids: cum(d.bids, true), asks: cum(d.asks, false) }),
      )
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [marketId]);

  useChannel<{ bids: [string, string][]; asks: [string, string][] }>(
    marketId ? `depth.${marketId}` : null,
    (d) => {
      setBook({ bids: cum(d.bids, true), asks: cum(d.asks, false) });
      setLoaded(true);
    },
  );
  // show only the best 10 levels nearest the spread on each side
  const asks = book.asks.slice(-11);
  const bids = book.bids.slice(0, 12);

  const maxTotal = useMemo(
    () => Math.max(...asks.map((l) => l.total), ...bids.map((l) => l.total), 1),
    [asks, bids],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 px-3 pt-2 pb-1 text-[11px] text-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {!loaded ? (
        <BookSkeleton dp={dp} mid={mid} />
      ) : (
        <>
          {/* asks (top 10) */}
          <div className="flex flex-col-reverse">
            {asks.map((l, i) => (
              <Row
                key={"a" + i}
                l={l}
                dp={dp}
                tone="short"
                pct={(l.total / maxTotal) * 100}
              />
            ))}
          </div>

          {/* spread */}
          <div className="tnum my-1 flex items-center justify-between border-y border-border px-3 py-1.5 text-sm">
            <span className="font-semibold text-2xl">{fmtNum(mid, dp)}</span>
          </div>

          {/* bids (top 10) */}
          <div className="flex flex-col">
            {bids.map((l, i) => (
              <Row
                key={"b" + i}
                l={l}
                dp={dp}
                tone="long"
                pct={(l.total / maxTotal) * 100}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BookSkeleton({ dp, mid }: { dp: number; mid: number }) {
  return (
    <>
      <div className="flex flex-col-reverse gap-1.5 px-3 py-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={"sa" + i} className="h-3.5 w-full" />
        ))}
      </div>
      <div className="tnum my-1 flex items-center justify-between border-y border-border px-3 py-1.5 text-sm">
        <span className="text-2xl font-semibold text-muted">
          {mid ? fmtNum(mid, dp) : <Skeleton className="h-6 w-24" />}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={"sb" + i} className="h-3.5 w-full" />
        ))}
      </div>
    </>
  );
}

function Row({
  l,
  dp,
  tone,
  pct,
}: {
  l: { price: number; size: number; total: number };
  dp: number;
  tone: "long" | "short";
  pct: number;
}) {
  return (
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-xs">
      <div
        className={`absolute inset-y-0 right-0 ${tone === "long" ? "bg-long/10" : "bg-short/10"}`}
        style={{ width: `${pct}%` }}
      />
      <span
        className={`tnum relative ${tone === "long" ? "text-long" : "text-short"}`}
      >
        {fmtNum(l.price, dp)}
      </span>
      <span className="tnum relative text-right">{fmtNum(l.size, 3)}</span>
      <span className="tnum relative text-right text-muted">
        {fmtNum(l.total, 3)}
      </span>
    </div>
  );
}
