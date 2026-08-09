"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";
import { makeCandles, fmtNum } from "../../../lib/mock";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"] as const;

// TradingView lightweight-charts (v5) candlestick chart.
// REAL: feed setData() from GET /api/v1/klines, then series.update() on ws trade.<symbol>.
export default function PriceChart({
  mid,
  live,
  dp,
}: {
  mid: number;
  live: number;
  dp: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<CandlestickData | null>(null);
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("5m");

  // build chart once per market (mid) / precision (dp)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#797979",
        fontFamily: "inherit",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#1c1c1c" },
        horzLines: { color: "#1c1c1c" },
      },
      rightPriceScale: { borderColor: "#2a2a2a" },
      timeScale: {
        borderColor: "#2a2a2a",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00c278",
      downColor: "#fd4b4e",
      wickUpColor: "#00c278",
      wickDownColor: "#fd4b4e",
      borderVisible: false,
      priceFormat: { type: "price", precision: dp, minMove: Math.pow(10, -dp) },
    });

    // seed candles (deterministic mock)
    const raw = makeCandles(mid, 120);
    const now = Math.floor(Date.now() / 1000);
    const step = 60; // 1m bars
    const data: CandlestickData[] = raw.map((c, i) => ({
      time: (now - (raw.length - 1 - i) * step) as UTCTimestamp,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));

    series.setData(data);
    chart.timeScale().fitContent();

    seriesRef.current = series;
    lastBarRef.current = data[data.length - 1];

    return () => chart.remove();
  }, [mid, dp]);

  // stream the live price into the last candle
  useEffect(() => {
    const series = seriesRef.current;
    const last = lastBarRef.current;
    if (!series || !last) return;
    const updated: CandlestickData = {
      ...last,
      close: live,
      high: Math.max(last.high, live),
      low: Math.min(last.low, live),
    };
    series.update(updated);
    lastBarRef.current = updated;
  }, [live]);

  return (
    <div className="flex flex-col ">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs text-muted">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={`rounded px-2 py-0.5 transition ${tf === t ? "bg-panel-2 text-fg" : "hover:text-fg"}`}
          >
            {t}
          </button>
        ))}
        <span className="tnum ml-auto text-fg">{fmtNum(live, dp)}</span>
      </div>

      {/* lightweight-charts mounts its canvas here */}
      <div ref={containerRef} className="h-[360px] w-full" />
    </div>
  );
}
