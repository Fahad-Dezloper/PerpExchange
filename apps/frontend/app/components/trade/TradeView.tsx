"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  marketBySymbol,
  MARKETS,
  POSITIONS,
  OPEN_ORDERS,
  fmtUsd,
  fmtNum,
  fmtCompact,
  priceDp,
} from "../../../lib/mock";
import OrderBook from "./OrderBook";
import TradesTape from "./TradesTape";
import PriceChart from "./PriceChart";
import OrderForm from "./OrderForm";

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

  const up = market.change24h >= 0;

  return (
    <div className="flex flex-col">
      {/* market header bar */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border bg-panel px-4 py-3">
        <MarketSwitcher symbol={symbol} />
        <div className="flex items-baseline gap-2">
          <span className={`tnum text-xl font-semibold ${dir > 0 ? "text-long" : "text-short"}`}>
            {fmtUsd(price, dp)}
          </span>
        </div>
        <HeaderStat label="24h Change" value={`${up ? "+" : ""}${market.change24h.toFixed(2)}%`} tone={up ? "long" : "short"} />
        <HeaderStat label="Mark" value={fmtUsd(market.price, dp)} />
        <HeaderStat label="Index Price" value={fmtUsd(market.price * 0.9998, dp)} />
        <HeaderStat label="Funding / 1h" value={`${(market.funding / 8 * 100).toFixed(4)}%`} tone={market.funding >= 0 ? "long" : "short"} />
        <HeaderStat label="24h Volume" value={fmtUsd(market.volume24h, 0)} />
        <HeaderStat label="Open Interest" value={fmtUsd(market.openInterest, 0)} />
      </div>

      {/* main grid: orderbook | chart+trades | order form */}
      <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-[260px_1fr_320px]">
        <div className="bg-bg">
          <OrderBook mid={price} dp={dp} />
        </div>

        <div className="flex min-w-0 flex-col bg-bg">
          <PriceChart mid={market.price} live={price} dp={dp} />
          <div className="border-t border-border">
            <TradesTape mid={price} dp={dp} />
          </div>
        </div>

        <div className="bg-bg">
          <OrderForm symbol={symbol} price={price} dp={dp} maxLeverage={market.maxLeverage} />
        </div>
      </div>

      {/* positions / orders */}
      <PositionsPanel />
    </div>
  );
}

function MarketSwitcher({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);
  const m = marketBySymbol(symbol);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-panel-2"
      >
        <div className="grid h-7 w-7 place-items-center rounded-full bg-panel-2 text-[11px] font-semibold text-muted">
          {m.symbol.slice(0, 2)}
        </div>
        <span className="text-base font-semibold">{m.symbol}</span>
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-20 w-56 rounded-lg border border-border bg-panel p-1 shadow-xl">
          {MARKETS.map((mk) => (
            <Link
              key={mk.symbol}
              href={`/trade/${mk.symbol}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-panel-2"
            >
              <span>{mk.symbol}</span>
              <span className={`tnum text-xs ${mk.change24h >= 0 ? "text-long" : "text-short"}`}>
                {mk.change24h >= 0 ? "+" : ""}{mk.change24h.toFixed(2)}%
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function HeaderStat({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  return (
    <div className="hidden md:block">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`tnum text-sm ${tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-fg"}`}>
        {value}
      </div>
    </div>
  );
}

// ── positions / open orders (mock) ───────────────────────────
const PANEL_TABS = [
  "Positions",
  "Open Orders",
  "Fill History",
  "Order History",
  "Funding History",
  "Balances",
] as const;
type PanelTab = (typeof PANEL_TABS)[number];

function PositionsPanel() {
  const [tab, setTab] = useState<PanelTab>("Positions");
  return (
    <div className="border-t border-border bg-panel">
      <div className="flex items-center gap-4 overflow-x-auto border-b border-border px-4 pt-2 text-[13px]">
        {PANEL_TABS.map((t) => {
          const count = t === "Positions" ? POSITIONS.length : t === "Open Orders" ? OPEN_ORDERS.length : null;
          return (
            <Tab key={t} active={tab === t} onClick={() => setTab(t)}>
              {t}{count != null && <span className="text-muted"> ({count})</span>}
            </Tab>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        {tab === "Positions" ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Market", "Side", "Size", "Entry", "Mark", "Liq. Price", "Margin", "PnL (ROE)", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POSITIONS.map((p) => (
                <tr key={p.symbol} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{p.symbol}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${p.side === "Long" ? "bg-long/15 text-long" : "bg-short/15 text-short"}`}>
                      {p.side} {p.leverage}×
                    </span>
                  </td>
                  <td className="tnum px-4 py-3">{p.size}</td>
                  <td className="tnum px-4 py-3">{fmtUsd(p.entry)}</td>
                  <td className="tnum px-4 py-3">{fmtUsd(p.mark)}</td>
                  <td className="tnum px-4 py-3 text-warn">{fmtUsd(p.liq)}</td>
                  <td className="tnum px-4 py-3">{fmtUsd(p.margin)}</td>
                  <td className={`tnum px-4 py-3 ${p.pnl >= 0 ? "text-long" : "text-short"}`}>
                    {p.pnl >= 0 ? "+" : ""}{fmtUsd(p.pnl)} ({p.pnl >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)}%)
                  </td>
                  <td className="px-4 py-3">
                    <button className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-short">Close</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === "Open Orders" ? (
          <table className="w-full min-w-160 text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Market", "Side", "Type", "Price", "Size", "Filled", "Time", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OPEN_ORDERS.map((o, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{o.symbol}</td>
                  <td className={`px-4 py-3 ${o.side === "long" ? "text-long" : "text-short"}`}>{o.side}</td>
                  <td className="px-4 py-3 text-muted">{o.type}</td>
                  <td className="tnum px-4 py-3">{fmtUsd(o.price)}</td>
                  <td className="tnum px-4 py-3">{o.size}</td>
                  <td className="tnum px-4 py-3 text-muted">{fmtNum((o.filled / o.size) * 100, 0)}%</td>
                  <td className="tnum px-4 py-3 text-muted">{o.time}</td>
                  <td className="px-4 py-3">
                    <button className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-short">Cancel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid place-items-center py-14 text-sm text-muted">
            No {tab.toLowerCase()} yet.
          </div>
        )}
      </div>
      <p className="px-4 py-2 text-[11px] text-subtle">
        Mock — positions via ws <code className="text-accent">position.&lt;userId&gt;</code>, orders via <code className="text-accent">GET /api/v1/orders</code>.
      </p>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px whitespace-nowrap border-b-2 py-2 text-[13px] transition ${
        active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
