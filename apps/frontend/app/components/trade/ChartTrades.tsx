"use client";

import PriceChart from "./PriceChart";
import TradesTape from "./TradesTape";

// center column: price chart on top, recent trades below
export default function ChartTrades({ mid, live, dp }: { mid: number; live: number; dp: number }) {
  return (
    <div className="flex min-w-0 flex-col bg-bg">
      <PriceChart mid={mid} live={live} dp={dp} />
      <div className="border-t border-border">
        <TradesTape mid={live} dp={dp} />
      </div>
    </div>
  );
}
