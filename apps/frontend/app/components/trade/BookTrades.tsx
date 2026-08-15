"use client";

import { useState } from "react";
import OrderBook from "./OrderBook";
import TradesTape from "./TradesTape";

// Left column panel: toggle between the order book and recent trades.
export default function BookTrades({
  marketId,
  mid,
  dp,
}: {
  marketId: string | null;
  mid: number;
  dp: number;
}) {
  const [tab, setTab] = useState<"book" | "trades">("book");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-panel">
      {/* toggle */}
      <div className="flex items-center gap-1 border-b border-border p-1">
        <TabBtn active={tab === "book"} onClick={() => setTab("book")}>
          Book
        </TabBtn>
        <TabBtn active={tab === "trades"} onClick={() => setTab("trades")}>
          Trades
        </TabBtn>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "book" ? (
          <OrderBook marketId={marketId} mid={dp} dp={dp} />
        ) : (
          <TradesTape marketId={marketId} dp={dp} />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
        active ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
