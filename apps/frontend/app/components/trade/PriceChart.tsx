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
import { fmtNum } from "../../../lib/mock";
import { getKlines } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"] as const;
const GRANULARITY: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 21600,
  "1D": 86400,
};

// TradingView lightweight-charts (v5) candlestick chart.
// REAL: feed setData() from GET /api/v1/klines, then series.update() on ws trade.<symbol>.
export default function PriceChart({
  marketId,
  live,
  dp,
}: {
  marketId: string | null;
  live: number;
  dp: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<CandlestickData | null>(null);
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("5m");
  const [loading, setLoading] = useState(true);

  // build chart + seed real candles per (market, timeframe, precision)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !marketId) return;
    setLoading(true);

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
    seriesRef.current = series;

    let alive = true;
    getKlines(marketId, tf)
      .then((candles) => {
        if (!alive) return;
        const data: CandlestickData[] = candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        series.setData(data);
        chart.timeScale().fitContent();
        lastBarRef.current = data[data.length - 1] ?? null;
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      chart.remove();
    };
  }, [marketId, tf, dp]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !live) return;

    const g = GRANULARITY[tf];
    const bucket = (Math.floor(Date.now() / 1000 / g) * g) as UTCTimestamp;
    const last = lastBarRef.current;

    const bar: CandlestickData =
      !last || bucket > (last.time as number)
        ? { time: bucket, open: live, high: live, low: live, close: live }
        : {
            ...last,
            close: live,
            high: Math.max(last.high, live),
            low: Math.min(last.low, live),
          };

    series.update(bar);
    lastBarRef.current = bar;
  }, [live, tf]);

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

      <div className="relative h-[360px] w-full">
        <div ref={containerRef} className="h-full w-full" />
        {loading && (
          <div className="absolute inset-0 grid grid-cols-12 items-end gap-2 bg-panel p-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="w-full"
                style={{ height: `${30 + ((i * 37) % 60)}%` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
