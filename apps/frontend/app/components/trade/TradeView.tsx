"use client";

import { useEffect, useState } from "react";

import MarketHeader from "./MarketHeader";
import BookTrades from "./BookTrades";
import ChartTrades from "./ChartTrades";
import OrderForm from "./OrderForm";
import PositionsPanel from "./PositionsPanel";
import { useMarkets } from "@/lib/market";
import { priceDp } from "@/lib/mock";
import { useChannel } from "@/lib/ws";
import * as api from "@/lib/api";

export default function TradeView({ symbol }: { symbol: string }) {
  const { bySymbol, loading } = useMarkets();
  const market = bySymbol[symbol];
  const marketId = market?.id ?? null;

  const [price, setPrice] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  useEffect(() => {
    if (!marketId) return;
    api
      .getDepth(marketId)
      .then((d: any) => {
        if (d?.lastPrice) setPrice(Number(d.lastPrice));
      })
      .catch(() => {});
  }, [marketId]);

  useChannel<{ markPrice?: string; price?: string }>(
    marketId ? `ticker.${marketId}` : null,
    (d) => {
      console.log("what is p", d);
      const p = Number(d.markPrice ?? d.price);
      if (!p) return;
      setDir(p >= price ? 1 : -1);
      setPrice(Number(d.markPrice));
    },
  );

  const dp = priceDp(price || 100);

  if (loading || !market) {
    return <div className="p-6 text-sm text-muted">Loading market…</div>;
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-2">
          <MarketHeader symbol={symbol} price={price} dir={dir} />
          <div className="grid min-w-0 grid-cols-[260px_minmax(0,1fr)] gap-2">
            <BookTrades marketId={marketId} mid={price} dp={dp} />
            <ChartTrades mid={price} live={price} dp={dp} />
          </div>
        </div>

        <OrderForm
          symbol={symbol}
          price={price}
          dp={dp}
          maxLeverage={market.maxLeverage}
        />
      </div>

      <div className="rounded-sm border border-border bg-panel">
        <PositionsPanel defaultTab="Fill History" />
      </div>
    </div>
  );
}
