"use client";

import PriceChart from "./PriceChart";
import PositionsPanel from "./PositionsPanel";

// center column: chart card on top, a compact (customizable) positions/orders card
// below that grows to fill the column (matching the order book height).
export default function ChartTrades({
  marketId,
  mid,
  live,
  dp,
}: {
  marketId: string | null;
  mid: number;
  live: number;
  dp: number;
}) {
  return (
    <div className="flex h-full min-w-0  flex-col gap-2">
      <div className="overflow-hidden rounded-sm border border-border bg-panel">
        <PriceChart marketId={marketId} mid={mid} live={live} dp={dp} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-sm border border-border bg-panel">
        <PositionsPanel
          compact
          editableTabs
          initialTabs={["Positions", "Open Orders"]}
          defaultTab="Positions"
        />
      </div>
    </div>
  );
}
