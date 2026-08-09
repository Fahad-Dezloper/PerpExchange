"use client";
import Link from "next/link";
import { BALANCE, POSITIONS, OPEN_ORDERS, fmtUsd } from "../../lib/mock";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";

const HISTORY = [
  {
    symbol: "BTC-PERP",
    side: "Long",
    action: "Open",
    price: 65200,
    size: 0.35,
    time: "Jul 18 14:22",
    pnl: null as number | null,
  },
  {
    symbol: "SOL-PERP",
    side: "Short",
    action: "Open",
    price: 172.4,
    size: 40,
    time: "Jul 18 11:05",
    pnl: null,
  },
  {
    symbol: "ARB-PERP",
    side: "Long",
    action: "Close",
    price: 0.91,
    size: 1200,
    time: "Jul 17 19:48",
    pnl: 214.6,
  },
  {
    symbol: "ETH-PERP",
    side: "Short",
    action: "Liquidated",
    price: 3720,
    size: 0.9,
    time: "Jul 16 08:31",
    pnl: -412.0,
  },
];

export default function PortfolioPage() {
  const totalPnl = POSITIONS.reduce((s, p) => s + p.pnl, 0);
  const { token } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (token === null) router.replace("/login");
  }, [token, router]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Portfolio</h1>

      {/* balance tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Account Equity" value={fmtUsd(BALANCE.equity)} accent />
        <Tile label="Available" value={fmtUsd(BALANCE.available)} />
        <Tile label="Margin Used" value={fmtUsd(BALANCE.locked)} />
        <Tile
          label="Unrealized PnL"
          value={`${BALANCE.unrealized >= 0 ? "+" : ""}${fmtUsd(BALANCE.unrealized)}`}
          tone={BALANCE.unrealized >= 0 ? "long" : "short"}
        />
      </div>

      {/* positions */}
      <Section title="Open Positions" hint="ws position.<userId>">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {[
                "Market",
                "Side",
                "Size",
                "Entry",
                "Mark",
                "Liq.",
                "Margin",
                "PnL (ROE)",
              ].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((p) => (
              <tr key={p.symbol} className="border-t border-border/60">
                <td className="px-4 py-3">
                  <Link
                    href={`/trade/${p.symbol}`}
                    className="font-medium hover:text-accent"
                  >
                    {p.symbol}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${p.side === "Long" ? "bg-long/15 text-long" : "bg-short/15 text-short"}`}
                  >
                    {p.side} {p.leverage}×
                  </span>
                </td>
                <td className="tnum px-4 py-3">{p.size}</td>
                <td className="tnum px-4 py-3">{fmtUsd(p.entry)}</td>
                <td className="tnum px-4 py-3">{fmtUsd(p.mark)}</td>
                <td className="tnum px-4 py-3 text-warn">{fmtUsd(p.liq)}</td>
                <td className="tnum px-4 py-3">{fmtUsd(p.margin)}</td>
                <td
                  className={`tnum px-4 py-3 ${p.pnl >= 0 ? "text-long" : "text-short"}`}
                >
                  {p.pnl >= 0 ? "+" : ""}
                  {fmtUsd(p.pnl)} ({p.pnlPct.toFixed(1)}%)
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-sm">
              <td className="px-4 py-3 text-muted" colSpan={7}>
                Total unrealized PnL
              </td>
              <td
                className={`tnum px-4 py-3 font-semibold ${totalPnl >= 0 ? "text-long" : "text-short"}`}
              >
                {totalPnl >= 0 ? "+" : ""}
                {fmtUsd(totalPnl)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {/* open orders */}
      <Section title="Open Orders" hint="GET /api/v1/orders?open=true">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {["Market", "Side", "Price", "Size", "Filled", "Time"].map(
                (h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {OPEN_ORDERS.map((o, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{o.symbol}</td>
                <td
                  className={`px-4 py-3 ${o.side === "long" ? "text-long" : "text-short"}`}
                >
                  {o.side}
                </td>
                <td className="tnum px-4 py-3">{fmtUsd(o.price)}</td>
                <td className="tnum px-4 py-3">{o.size}</td>
                <td className="tnum px-4 py-3 text-muted">
                  {Math.round((o.filled / o.size) * 100)}%
                </td>
                <td className="tnum px-4 py-3 text-muted">{o.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* history */}
      <Section title="Trade History" hint="GET /api/v1/fills">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {[
                "Market",
                "Action",
                "Side",
                "Price",
                "Size",
                "Realized PnL",
                "Time",
              ].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HISTORY.map((h, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{h.symbol}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      h.action === "Liquidated" ? "text-short" : "text-muted"
                    }
                  >
                    {h.action}
                  </span>
                </td>
                <td
                  className={`px-4 py-3 ${h.side === "Long" ? "text-long" : "text-short"}`}
                >
                  {h.side}
                </td>
                <td className="tnum px-4 py-3">{fmtUsd(h.price)}</td>
                <td className="tnum px-4 py-3">{h.size}</td>
                <td
                  className={`tnum px-4 py-3 ${h.pnl == null ? "text-muted" : h.pnl >= 0 ? "text-long" : "text-short"}`}
                >
                  {h.pnl == null
                    ? "—"
                    : `${h.pnl >= 0 ? "+" : ""}${fmtUsd(h.pnl)}`}
                </td>
                <td className="tnum px-4 py-3 text-muted">{h.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: string;
  tone?: "long" | "short";
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${accent ? "border-accent/40 bg-accent/5" : "border-border bg-panel"}`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`tnum mt-1 text-xl font-semibold ${tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-fg"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <code className="text-[11px] text-accent">{hint}</code>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-panel">
        {children}
      </div>
    </div>
  );
}
