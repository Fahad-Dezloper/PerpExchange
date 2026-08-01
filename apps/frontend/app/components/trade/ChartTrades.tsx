"use client";

import PriceChart from "./PriceChart";
import PositionsPanel from "./PositionsPanel";

// center column: price chart on top, quick positions / open orders below
export default function ChartTrades({ mid, live, dp }: { mid: number; live: number; dp: number }) {
  return (
    <div className="flex min-w-0 flex-col bg-bg">
      <PriceChart mid={mid} live={live} dp={dp} />
      <div className="border-t border-border">
        <PositionsPanel tabs={["Positions", "Open Orders"]} />
      </div>
    </div>
  );
}
