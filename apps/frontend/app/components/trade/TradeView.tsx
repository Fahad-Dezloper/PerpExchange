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
    <div className="flex flex-col">
      {/* <MarketHeader symbol={symbol} price={price} dir={dir} /> */}

      {/* orderbook | chart + trades | order form 260px_1fr_320px */}
      <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col">
          <MarketHeader symbol={symbol} price={price} dir={dir} />
          <div className="grid min-w-0 grid-cols-[260px_minmax(0,1fr)]">
            <div className="min-w-0">
              <BookTrades mid={price} dp={dp} />
            </div>

            <ChartTrades mid={market.price} live={price} dp={dp} />
          </div>
        </div>
        <div className="bg-bg">
          <OrderForm symbol={symbol} price={price} dp={dp} maxLeverage={market.maxLeverage} />
        </div>
      </div>

      <PositionsPanel />
    </div>
  );
}
