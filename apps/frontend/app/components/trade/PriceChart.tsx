"use client";

import { useMemo } from "react";
import { makeCandles, fmtNum } from "../../../lib/mock";

// Lightweight SVG candlestick chart on mock candles.
// REAL: swap for TradingView `lightweight-charts` fed by GET /api/v1/klines + ws trade.<symbol>.
export default function PriceChart({ mid, live, dp }: { mid: number; live: number; dp: number }) {
  const candles = useMemo(() => {
    const c = makeCandles(mid, 64);
    // pin the last close to the live price so the chart tracks the header
    c[c.length - 1] = { ...c[c.length - 1], c: live, h: Math.max(c[c.length - 1].h, live), l: Math.min(c[c.length - 1].l, live) };
    return c;
  }, [mid, live]);

  const W = 800, H = 320, padY = 16;
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const max = Math.max(...highs), min = Math.min(...lows);
  const range = max - min || 1;
  const cw = W / candles.length;
  const y = (v: number) => padY + (1 - (v - min) / range) * (H - padY * 2);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
        {["1m", "5m", "15m", "1h", "4h", "1D"].map((tf, i) => (
          <button key={tf} className={`rounded px-2 py-0.5 ${i === 1 ? "bg-panel-2 text-fg" : "hover:text-fg"}`}>
            {tf}
          </button>
        ))}
        <span className="ml-auto tnum text-fg">{fmtNum(live, dp)}</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[320px] w-full" preserveAspectRatio="none">
          {/* grid */}
          {[0.2, 0.4, 0.6, 0.8].map((g) => (
            <line key={g} x1="0" x2={W} y1={padY + g * (H - padY * 2)} y2={padY + g * (H - padY * 2)} stroke="#1b2130" strokeWidth="1" />
          ))}
          {candles.map((c, i) => {
            const x = i * cw + cw / 2;
            const upC = c.c >= c.o;
            const col = upC ? "#0ecb81" : "#f6465d";
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" />
                <rect
                  x={i * cw + cw * 0.2}
                  width={cw * 0.6}
                  y={y(Math.max(c.o, c.c))}
                  height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
                  fill={col}
                />
              </g>
            );
          })}
          {/* last price line */}
          <line x1="0" x2={W} y1={y(live)} y2={y(live)} stroke="#5b8cff" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
        </svg>
      </div>
    </div>
  );
}
