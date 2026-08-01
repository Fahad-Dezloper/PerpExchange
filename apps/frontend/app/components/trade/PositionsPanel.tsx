"use client";

import { useState } from "react";
import { POSITIONS, OPEN_ORDERS, fmtUsd, fmtNum } from "../../../lib/mock";

const PANEL_TABS = [
  "Positions",
  "Open Orders",
  "Fill History",
  "Order History",
  "Funding History",
  "Balances",
] as const;
type PanelTab = (typeof PANEL_TABS)[number];

// REAL: positions via ws position.<userId>; orders via GET /api/v1/orders
export default function PositionsPanel() {
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
          <div className="grid place-items-center py-14 text-sm text-muted">No {tab.toLowerCase()} yet.</div>
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
