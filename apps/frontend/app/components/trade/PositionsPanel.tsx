"use client";

import { useState } from "react";
import { Plus, Settings2, X } from "lucide-react";
import { fmtUsd, fmtNum } from "../../../lib/mock";
import TokenIcon from "../TokenIcon";
import Button from "../ui/Button";
import { usePositons } from "@/lib/positions";
import { useMarkets } from "@/lib/market";
import { useBalance } from "@/lib/balance";
import * as api from "@/lib/api";
import { useOrders } from "@/lib/order";
import { useLivePrices } from "@/lib/price";
import { notify } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";

const ALL_TABS = [
  "Positions",
  "Open Orders",
  "Fill History",
  "Order History",
  "Funding History",
  "Balances",
] as const;
type PanelTab = (typeof ALL_TABS)[number];

const POS_COLUMNS = [
  { key: "side", label: "Side", right: false },
  { key: "size", label: "Size", right: true },
  { key: "entry", label: "Entry", right: true },
  { key: "mark", label: "Mark", right: true },
  { key: "liq", label: "Liq. Price", right: true },
  { key: "margin", label: "Margin", right: true },
] as const;
type ColKey = (typeof POS_COLUMNS)[number]["key"];

export default function PositionsPanel({
  initialTabs = [...ALL_TABS],
  editableTabs = false,
  compact = false,
  defaultTab,
}: {
  initialTabs?: PanelTab[];
  editableTabs?: boolean;
  compact?: boolean;
  defaultTab?: PanelTab;
}) {
  const prices = useLivePrices();
  const {
    positions,
    loading: positionsLoading,
    refresh: refreshPositions,
  } = usePositons();
  const { bySymbol } = useMarkets();
  const { refresh: refreshBalance } = useBalance();
  const [closing, setClosing] = useState<string | null>(null);
  const {
    orders,
    loading: ordersLoading,
    refresh: refreshOrders,
  } = useOrders();

  const [tabs, setTabs] = useState<PanelTab[]>(initialTabs);
  const [tab, setTab] = useState<PanelTab>(
    defaultTab && initialTabs.includes(defaultTab)
      ? defaultTab
      : initialTabs[0],
  );
  const [addOpen, setAddOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [cols, setCols] = useState<Set<ColKey>>(
    new Set(
      compact ? (["side", "size"] as ColKey[]) : POS_COLUMNS.map((c) => c.key),
    ),
  );

  // const mark = prices[p.symbol] ?? p.mark;

  const available = ALL_TABS.filter((t) => !tabs.includes(t));

  async function closePosition(p: (typeof positions)[number]) {
    const marketId = bySymbol[p.symbol]?.id;
    if (!marketId) return;
    setClosing(p.symbol);
    try {
      await api.placeOrder({
        marketId,
        side: p.side === "Long" ? "short" : "long",
        type: "market",
        price: p.mark,
        qty: p.size.toString(),
        leverage: String(p.leverage),
        slippage: "0.5",
      });
      notify.success("Position closed", p.symbol);
      await Promise.all([
        refreshOrders(),
        refreshPositions(),
        refreshBalance(),
      ]);
    } catch {
      notify.error("Close failed");
    } finally {
      setClosing(null);
    }
  }

  async function cancel(o: (typeof orders)[number]) {
    try {
      await api.cancelOrder(o.orderId, o.marketId);
      notify.success("Order cancelled");
      await Promise.all([
        refreshOrders(),
        refreshBalance(),
        refreshPositions(),
      ]);
    } catch {
      notify.error("Cancel failed");
    }
  }

  const addTab = (t: PanelTab) => {
    setTabs((p) => [...p, t]);
    setAddOpen(false);
  };
  const removeTab = (t: PanelTab) => {
    setTabs((p) => {
      const next = p.filter((x) => x !== t);
      if (!next.length) return p; // keep at least one
      if (tab === t) setTab(next[0]);
      return next;
    });
  };
  const toggleCol = (k: ColKey) =>
    setCols((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const shownCols = POS_COLUMNS.filter((c) => cols.has(c.key));

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {/* tab bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3">
        <div className="flex items-center gap-3 overflow-x-auto py-2 text-[13px]">
          {tabs.map((t) => {
            const count =
              t === "Positions"
                ? positions.length
                : t === "Open Orders"
                  ? orders.length
                  : null;
            const active = tab === t;
            return (
              <div key={t} className="group flex shrink-0 items-center">
                <button
                  onClick={() => setTab(t)}
                  className={`-mb-px whitespace-nowrap border-b-2 py-1 transition ${
                    active
                      ? "border-fg text-fg"
                      : "border-transparent text-muted hover:text-fg"
                  }`}
                >
                  {t}
                  {count != null && (
                    <span className="text-muted"> ({count})</span>
                  )}
                </button>
                {editableTabs && tabs.length > 1 && (
                  <button
                    onClick={() => removeTab(t)}
                    className="ml-1 text-muted opacity-0 transition hover:text-short group-hover:opacity-100"
                    title="Remove tab"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* add tab — outside the scrolling tabs container so its menu isn't clipped */}
        {editableTabs && available.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setAddOpen((o) => !o)}
              className="text-muted p-2 rounded-lg hover:text-fg hover:bg-primary"
              title="Add tab"
            >
              <Plus className="h-4 w-4" />
            </button>
            {addOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setAddOpen(false)}
                />
                <div className="absolute left-0 top-7 z-20 w-44 rounded-lg border border-border bg-panel p-1 shadow-xl">
                  {available.map((t) => (
                    <button
                      key={t}
                      onClick={() => addTab(t)}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] text-muted hover:bg-panel-2 hover:text-fg"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* column manager (positions tab) */}
        {tab === "Positions" && (
          <div className="relative ml-auto shrink-0">
            <button
              onClick={() => setColsOpen((o) => !o)}
              className="text-muted hover:text-fg"
              title="Columns"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            {colsOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setColsOpen(false)}
                />
                <div className="absolute right-0 top-6 z-20 w-40 rounded-lg border border-border bg-panel p-1 shadow-xl">
                  <div className="px-2 py-1 text-[11px] text-subtle">
                    Columns
                  </div>
                  {POS_COLUMNS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => toggleCol(c.key)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-panel-2"
                    >
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border ${
                          cols.has(c.key)
                            ? "border-accent bg-accent text-white"
                            : "border-border"
                        }`}
                      >
                        {cols.has(c.key) && (
                          <span className="text-[9px] leading-none">✓</span>
                        )}
                      </span>
                      <span
                        className={cols.has(c.key) ? "text-fg" : "text-muted"}
                      >
                        {c.label}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* body */}
      <div
        className={`overflow-x-auto ${compact ? "min-h-0 flex-1 overflow-y-auto" : ""}`}
      >
        {tab === "Positions" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">Market</th>
                {shownCols.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2.5 font-medium ${c.right ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">
                  PnL (ROE)
                </th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {positionsLoading && positions.length === 0 ? (
                <SkeletonRows rows={3} cols={shownCols.length + 3} />
              ) : positions.length === 0 ? (
                <tr>
                  <td
                    colSpan={shownCols.length + 3}
                    className="px-3 py-10 text-center text-sm text-muted"
                  >
                    No open positions.
                  </td>
                </tr>
              ) : (
                positions.map((p) => {
                const mark = prices[p.symbol] ?? p.mark;
                const pnl =
                  p.side === "Long"
                    ? (mark - p.entry) * p.size
                    : (p.entry - mark) * p.size;
                const pnlPct = p.margin > 0 ? (pnl / p.margin) * 100 : 0;
                return (
                  <tr key={p.symbol} className="border-t border-border/60">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={p.symbol} size={22} />
                        <span className="font-medium">
                          {p.symbol.split("-")[0]}
                        </span>
                      </div>
                    </td>
                    {cols.has("side") && (
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            p.side === "Long"
                              ? "bg-long/15 text-long"
                              : "bg-short/15 text-short"
                          }`}
                        >
                          {p.side} {p.leverage}×
                        </span>
                      </td>
                    )}
                    {cols.has("size") && (
                      <td className="tnum px-3 py-2.5 text-right">{p.size}</td>
                    )}
                    {cols.has("entry") && (
                      <td className="tnum px-3 py-2.5 text-right">
                        {fmtUsd(p.entry)}
                      </td>
                    )}
                    {cols.has("mark") && (
                      <td className="tnum px-3 py-2.5 text-right">
                        {fmtUsd(mark)}
                      </td>
                    )}
                    {cols.has("liq") && (
                      <td className="tnum px-3 py-2.5 text-right text-warn">
                        {fmtUsd(p.liq)}
                      </td>
                    )}
                    {cols.has("margin") && (
                      <td className="tnum px-3 py-2.5 text-right">
                        {fmtUsd(p.margin)}
                      </td>
                    )}
                    <td
                      className={`tnum px-3 py-2.5 text-right ${pnl >= 0 ? "text-long" : "text-short"}`}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {fmtUsd(pnl)}{" "}
                      <span className="text-xs">({pnlPct.toFixed(1)}%)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="short"
                        size="sm"
                        disabled={closing === p.symbol}
                        onClick={() => closePosition(p)}
                      >
                        {closing === p.symbol ? "Closing…" : "Close"}
                      </Button>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        ) : tab === "Open Orders" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">Market</th>
                <th className="px-3 py-2.5 font-medium">Side</th>
                {!compact && <th className="px-3 py-2.5 font-medium">Type</th>}
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 text-right font-medium">Size</th>
                {!compact && (
                  <th className="px-3 py-2.5 text-right font-medium">Filled</th>
                )}
                {!compact && (
                  <th className="px-3 py-2.5 text-right font-medium">Time</th>
                )}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {ordersLoading && orders.length === 0 ? (
                <SkeletonRows rows={3} cols={compact ? 5 : 8} />
              ) : orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={compact ? 5 : 8}
                    className="px-3 py-10 text-center text-sm text-muted"
                  >
                    No open orders.
                  </td>
                </tr>
              ) : (
                orders.map((o, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="px-3 py-2.5 font-medium">
                    {o.symbol.split("-")[0]}
                  </td>
                  <td
                    className={`px-3 py-2.5 capitalize ${o.side === "long" ? "text-long" : "text-short"}`}
                  >
                    {o.side}
                  </td>
                  {!compact && (
                    <td className="px-3 py-2.5 text-muted">{o.type}</td>
                  )}
                  <td className="tnum px-3 py-2.5 text-right">
                    {fmtUsd(o.price)}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right">{o.size}</td>
                  {!compact && (
                    <td className="tnum px-3 py-2.5 text-right text-muted">
                      {fmtNum((o.filled / o.size) * 100, 0)}%
                    </td>
                  )}
                  {!compact && (
                    <td className="tnum px-3 py-2.5 text-right text-muted">
                      {o.time}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      onClick={() => cancel(o)}
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <div className="grid place-items-center py-14 text-sm text-muted">
            No {tab.toLowerCase()} yet.
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-border/60">
          <td colSpan={cols} className="px-3 py-2.5">
            <Skeleton className="h-6 w-full" />
          </td>
        </tr>
      ))}
    </>
  );
}
