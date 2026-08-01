"use client";

import { useRouter } from "next/navigation";
import { makeCandles, fmtUsd, fmtCompact, priceDp, type Market } from "../../lib/mock";
import TokenIcon from "./TokenIcon";

// Grid template — kept identical (as a literal) in the page header so
// columns line up. If you change it, change it in app/page.tsx too.
const COLS =
  "grid items-center gap-x-4 px-5 grid-cols-[1.6fr_1fr_1fr] md:grid-cols-[2.1fr_1fr_1fr_1fr_1fr_1.3fr]";

export default function MarketRow({ m }: { m: Market }) {
  const router = useRouter();
  const up = m.change24h >= 0;
  const base = m.symbol.split("-")[0];

  return (
    <div
      onClick={() => router.push(`/trade/${m.symbol}`)}
      className={`${COLS} cursor-pointer py-4 transition hover:bg-panel-2`}
    >
      {/* market */}
      <div className="flex min-w-0 items-center gap-3">
        <TokenIcon symbol={m.symbol} size={36} className="ring-1 ring-border-soft" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-semibold">{base}</span>
            <span className="rounded-sm bg-primary px-1 py-0.5 text-[9px] font-medium tracking-wide text-subtle">PERP</span>
          </div>
          <div className="truncate text-[13px] text-muted">{m.name}</div>
        </div>
      </div>

      {/* price */}
      <div className="tnum text-right text-base font-semibold tracking-tight">{fmtUsd(m.price, priceDp(m.price))}</div>

      {/* 24h change pill */}
      <div className="flex justify-end">
        <span
          className={`tnum inline-flex items-center gap-1 rounded-md  text-base font-semibold ${
            up ? " text-long" : "text-short"
          }`}
        >
          {/* <span className="text-[10px]">{up ? "↗" : "↘"}</span> */}
          {up ? "+" : ""}{m.change24h.toFixed(2)}%
        </span>
      </div>

      {/* volume */}
      <div className="tnum hidden text-right md:block">${fmtCompact(m.volume24h)}</div>

      {/* funding */}
      <div className={`tnum hidden text-right md:block ${m.funding >= 0 ? "text-long" : "text-short"}`}>
        {(m.funding * 100).toFixed(4)}%
      </div>

      {/* sparkline */}
      <div className="hidden justify-end md:flex">
        <RowSpark mid={m.price} up={up} id={m.symbol} />
      </div>
    </div>
  );
}

function RowSpark({ mid, up, id }: { mid: number; up: boolean; id: string }) {
  const closes = makeCandles(mid, 40).map((c) => c.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 128, H = 40, pad = 4;
  const x = (i: number) => (i / (closes.length - 1)) * W;
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);
  const line = closes.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const area = `M0,${H} L${line.replaceAll(" ", " L")} L${W},${H} Z`;
  const color = up ? "var(--color-long)" : "var(--color-short)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-32">
      <defs>
        <linearGradient id={`rspark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#rspark-${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
