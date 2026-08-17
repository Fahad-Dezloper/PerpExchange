"use client";
import Link from "next/link";
import { makeCandles, fmtUsd, priceDp, type Market } from "../lib/mock";
import TokenIcon from "./components/TokenIcon";
import MarketRow from "./components/MarketRow";
import { useMarkets } from "@/lib/market";
import { Skeleton } from "@/components/ui/skeleton";

// keep identical to COLS in components/MarketRow.tsx
const HEADER_COLS =
  "grid items-center gap-x-4 px-5 grid-cols-[1.6fr_1fr_1fr] md:grid-cols-[2.1fr_1fr_1fr_1fr_1fr_1.3fr]";

export default function MarketsPage() {
  const { markets, loading } = useMarkets();

  if (loading) {
    return <MarketsSkeleton />;
  }
  if (!markets.length) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted">
        No markets yet.
      </div>
    );
  }
  const movers = [...markets].sort((a, b) => b.change24h - a.change24h);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* featured / movers cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MoverCard m={movers[0]} />
        <MoverCard m={movers[movers.length - 1]} />
        <MoverCard
          m={[...markets].sort((a, b) => b.volume24h - a.volume24h)[0]}
        />
      </div>

      {/* markets list */}
      <div className="mt-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-panel">
          {/* header */}
          <div
            className={`${HEADER_COLS} border-b border-border-soft py-3 text-sm font-medium tracking-wide text-muted`}
          >
            <span>Market</span>
            <span className="text-right">Price</span>
            <span className="text-right">24h</span>
            <span className="hidden text-right md:block">Volume</span>
            <span className="hidden text-right md:block">Funding</span>
            <span className="hidden text-right md:block">Last 7 Days</span>
          </div>

          {/* rows */}
          <div className="divide-y divide-border-soft">
            {markets.map((m) => (
              <MarketRow key={m.symbol} m={m} />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 px-1 text-xs text-subtle">
        Mock data — wire to{" "}
        <code className="text-accent">GET /api/v1/markets</code> + ws{" "}
        <code className="text-accent">ticker.&lt;symbol&gt;</code>.
      </p>
    </div>
  );
}

function MarketsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* mover cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-5"
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-6 w-16 rounded-lg" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>

      {/* table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-panel">
        <div
          className={`${HEADER_COLS} border-b border-border-soft py-3.5`}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
        <div className="divide-y divide-border-soft">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`${HEADER_COLS} py-4`}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
              <Skeleton className="h-4 w-16 justify-self-end" />
              <Skeleton className="h-4 w-12 justify-self-end" />
              <Skeleton className="hidden h-4 w-16 justify-self-end md:block" />
              <Skeleton className="hidden h-4 w-14 justify-self-end md:block" />
              <Skeleton className="hidden h-8 w-24 justify-self-end md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoverCard({ m }: { m: Market }) {
  const up = m.change24h >= 0;
  const base = m.symbol.split("-")[0];
  return (
    <Link
      href={`/trade/${m.symbol}`}
      className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-panel p-5 transition hover:border-border-soft hover:bg-panel-2"
    >
      <div className="flex items-center gap-2.5">
        <TokenIcon symbol={m.symbol} size={28} />
        <span className="text-lg font-semibold tracking-tight">{m.name}</span>
        <span className="text-sm text-muted">{base}</span>
      </div>

      <div className="tnum text-3xl font-semibold tracking-tight">
        {fmtUsd(m.price, priceDp(m.price))}
      </div>

      <div>
        <span
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium ${
            up ? "bg-long/12 text-long" : "bg-short/12 text-short"
          }`}
        >
          <span className="text-xs">{up ? "↗" : "↘"}</span>
          {up ? "+" : ""}
          {m.change24h.toFixed(2)}%
        </span>
      </div>

      <AreaSparkline mid={m.price} up={up} id={m.symbol} />
    </Link>
  );
}

// filled area chart with a dashed baseline (server-safe, deterministic)
function AreaSparkline({
  mid,
  up,
  id,
}: {
  mid: number;
  up: boolean;
  id: string;
}) {
  const closes = makeCandles(mid, 44).map((c) => c.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 300,
    H = 84,
    pad = 6;
  const x = (i: number) => (i / (closes.length - 1)) * W;
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);

  const line = closes
    .map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`)
    .join(" ");
  const area = `M0,${H} L${line.replaceAll(" ", " L")} L${W},${H} Z`;
  const color = up ? "var(--color-long)" : "var(--color-short)";
  const baseY = y(closes[0]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-20 w-full"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        x2={W}
        y1={baseY}
        y2={baseY}
        stroke="#4a4a4a"
        strokeWidth="1"
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill={`url(#spark-${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
