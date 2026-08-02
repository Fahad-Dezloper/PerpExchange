"use client";

import { useEffect, useState } from "react";
import { marketBySymbol, priceDp } from "../../../lib/mock";
import MarketHeader from "./MarketHeader";
import BookTrades from "./BookTrades";
import ChartTrades from "./ChartTrades";
import OrderForm from "./OrderForm";
import PositionsPanel from "./PositionsPanel";

export default function TradeView({ symbol }: { symbol: string }) {
  const market = marketBySymbol(symbol);
  const dp = priceDp(market.price);

  // live-ish last price (mock). REAL: ws ticker.<symbol>
  const [price, setPrice] = useState(market.price);
  const [dir, setDir] = useState<1 | -1>(1);

  useEffect(() => {
    setPrice(market.price);
    const id = setInterval(() => {
      setPrice((p) => {
        const next = p * (1 + (Math.random() - 0.5) * 0.0009);
        setDir(next >= p ? 1 : -1);
        return +next.toFixed(dp);
      });
    }, 1200);
    return () => clearInterval(id);
  }, [market.symbol, market.price, dp]);

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-2">
          <MarketHeader symbol={symbol} price={price} dir={dir} />
          <div className="grid min-w-0 grid-cols-[260px_minmax(0,1fr)] gap-2">
            <BookTrades mid={price} dp={dp} />
            <ChartTrades mid={market.price} live={price} dp={dp} />
          </div>
        </div>

        <OrderForm symbol={symbol} price={price} dp={dp} maxLeverage={market.maxLeverage} />
      </div>

      {/* full account panel — starts on a tab the compact panel doesn't show */}
      <div className="rounded-sm border border-border bg-panel">
        <PositionsPanel defaultTab="Fill History" />
      </div>
    </div>
  );
}
