"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { marketBySymbol, MARKETS, fmtNum, priceDp } from "../../../lib/mock";
import TokenIcon from "../TokenIcon";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export default function MarketHeader({
  symbol,
  price,
  dir,
}: {
  symbol: string;
  price: number;
  dir: 1 | -1;
}) {
  const market = marketBySymbol(symbol);
  const dp = priceDp(market.price);
  const up = market.change24h >= 0;

  // derived header stats (mock)
  const mark = market.price;
  const index = market.price * 0.9998;
  const changeAbs = (market.price * market.change24h) / 100;
  const high = market.price * 1.014;
  const low = market.price * 0.985;
  const funding1h = market.funding / 8;
  const oiBase = market.openInterest / market.price;
  const profitApy = Math.abs(market.funding) * 3 * 100;
  const base = market.symbol.split("-")[0];

  // horizontal scroll affordance
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  };

  useEffect(() => {
    updateScroll();
    const el = scrollRef.current;
    el?.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);
    return () => {
      el?.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
    };
  }, []);

  const scrollBy = (dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="relative border-b border-border bg-panel">
      {!atStart && (
        <button
          onClick={() => scrollBy(-280)}
          className="absolute left-0 top-0 z-10 flex h-full w-42 items-center justify-start bg-linear-to-r from-panel to-transparent pl-1"
        >
          <ChevronLeft className="h-8 w-8 text-muted" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex items-center gap-6 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <MarketSwitcher symbol={symbol} leverage={market.maxLeverage} />

      <div className="h-9 w-px shrink-0 bg-border" />

      {/* last / mark price */}
      <div className="shrink-0">
        <div className={`tnum text-lg font-semibold leading-tight ${dir > 0 ? "text-long" : "text-short"}`}>
          {fmtNum(price, dp)}
        </div>
        <div className="tnum text-[13px] leading-tight text-muted">{fmtNum(mark, dp)}</div>
      </div>

      <HeaderStat label="Index Price">{fmtNum(index, dp)}</HeaderStat>
      <HeaderStat label="24H Change" tone={up ? "long" : "short"}>
        {changeAbs >= 0 ? "+" : ""}{fmtNum(changeAbs, 1)} {up ? "+" : ""}{market.change24h.toFixed(2)}%
      </HeaderStat>
      <HeaderStat label="1H Funding / Countdown">
        <span className="text-warn">{(funding1h * 100).toFixed(4)}%</span>
        <span className="text-muted"> / <Countdown /></span>
      </HeaderStat>
      <HeaderStat label="24H High">{fmtNum(high, dp)}</HeaderStat>
      <HeaderStat label="24H Low">{fmtNum(low, dp)}</HeaderStat>
      <HeaderStat label="24H Volume (USD)">{fmtNum(market.volume24h, 2)}</HeaderStat>
      <HeaderStat label={`Open Interest (${base})`}>{fmtNum(oiBase, 5)}</HeaderStat>
      <HeaderStat label="Profit APY" tone="long">
        <span className="inline-flex items-center gap-1">{profitApy.toFixed(2)}% ⚡</span>
      </HeaderStat>
      </div>

      {!atEnd && (
        <button
          onClick={() => scrollBy(280)}
          className="absolute right-0 top-0 z-10 flex h-full w-42 items-center justify-end bg-linear-to-l from-panel to-transparent pr-1"
        >
          <ChevronRight className="h-8 w-8 text-muted" />
        </button>
      )}
    </div>
  );
}

function MarketSwitcher({ symbol, leverage }: { symbol: string; leverage: number }) {
  const [open, setOpen] = useState(false);
  const m = marketBySymbol(symbol);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-panel-2"
      >
        <TokenIcon symbol={m.symbol} size={28} />
        <span className="text-base font-semibold">{m.symbol}</span>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">{leverage}x</span>
        <span className="text-xl text-muted">
          <ChevronDown />
        </span>
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
              <span className="flex items-center gap-2">
                <TokenIcon symbol={mk.symbol} size={20} />
                {mk.symbol}
              </span>
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

function HeaderStat({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "long" | "short" | "warn";
}) {
  const color =
    tone === "long" ? "text-long" : tone === "short" ? "text-short" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <div className="shrink-0 whitespace-nowrap">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`tnum text-[13px] ${color}`}>{children}</div>
    </div>
  );
}

// live-ticking countdown to the next funding (mock)
function Countdown() {
  const [s, setS] = useState(17 * 60 + 1);
  useEffect(() => {
    const id = setInterval(() => setS((x) => (x <= 0 ? 3600 : x - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return <>{p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}</>;
}
