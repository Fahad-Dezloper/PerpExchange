"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { marketBySymbol, MARKETS, fmtNum, fmtCompact, priceDp } from "../../../lib/mock";
import TokenIcon from "../TokenIcon";
import { ChevronDown, ChevronLeft, ChevronRight, Search, Star, X } from "lucide-react";

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
    <div className="flex items-stretch border-b border-border bg-panel">
      {/* switcher lives OUTSIDE the scroll container so its dropdown isn't clipped */}
      <div className="flex shrink-0 items-center pl-4 pr-2">
        <MarketSwitcher symbol={symbol} leverage={market.maxLeverage} />
      </div>

      <div className="relative min-w-0 flex-1">
        {!atStart && (
          <button
            onClick={() => scrollBy(-280)}
            className="absolute left-0 top-0 z-10 flex h-full w-16 items-center justify-start bg-linear-to-r from-panel to-transparent pl-1"
          >
            <ChevronLeft className="h-6 w-6 text-muted" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex items-center gap-6 overflow-x-auto py-2.5 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
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
            className="absolute right-0 top-0 z-10 flex h-full w-16 items-center justify-end bg-linear-to-l from-panel to-transparent pr-1"
          >
            <ChevronRight className="h-6 w-6 text-muted" />
          </button>
        )}
      </div>
    </div>
  );
}

const CATEGORIES = ["Futures"] as const;

function MarketSwitcher({ symbol, leverage }: { symbol: string; leverage: number }) {
  const router = useRouter();
  const m = marketBySymbol(symbol);
  const base = m.symbol.split("-")[0];

  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Futures");
  const [q, setQ] = useState("");
  const [favs, setFavs] = useState<Set<string>>(new Set(["BTC-PERP", "ETH-PERP"]));

  // only Futures has data in our mock
  const rows = (cat === "Futures" ? [...MARKETS] : [])
    .filter(
      (mk) =>
        mk.symbol.toLowerCase().includes(q.toLowerCase()) || mk.name.toLowerCase().includes(q.toLowerCase()),
    )
    .sort((a, b) => b.volume24h - a.volume24h);

  const toggleFav = (e: React.MouseEvent, sym: string) => {
    e.stopPropagation();
    setFavs((prev) => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  const go = (sym: string) => {
    router.push(`/trade/${sym}`);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-panel-2"
      >
        <TokenIcon symbol={m.symbol} size={28} />
        <span className="text-base font-semibold">{base}-PERP</span>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">{leverage}x</span>
        <ChevronDown className={`h-5 w-5 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-2 w-[440px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
            {/* category tabs */}
            <div className="flex items-center gap-1 border-b border-border px-2 py-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                    cat === c ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {c}
                </button>
              ))}
              <button className="ml-1 rounded-md p-1.5 text-muted hover:text-warn">
                <Star className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen(false)} className="ml-auto rounded-md p-1.5 text-muted hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* search */}
            <div className="p-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-2 focus-within:border-accent">
                <Search className="h-4 w-4 text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search markets"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </div>
            </div>

            {/* column header */}
            <div className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2 px-3 py-1.5 text-[11px] text-muted">
              <span>Market / Volume</span>
              <span className="text-right">Price / Change</span>
              <span className="text-right">Funding / OI</span>
              <span className="w-6" />
            </div>

            {/* rows */}
            <div className="max-h-[440px] overflow-y-auto pb-1">
              {rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                  {cat === "Futures" ? "No markets found" : `${cat} coming soon`}
                </div>
              ) : (
                rows.map((mk) => {
                  const up = mk.change24h >= 0;
                  const b = mk.symbol.split("-")[0];
                  const active = mk.symbol === symbol;
                  const fav = favs.has(mk.symbol);
                  return (
                    <div
                      key={mk.symbol}
                      onClick={() => go(mk.symbol)}
                      className={`grid cursor-pointer grid-cols-[1.6fr_1fr_1fr_auto] items-center gap-2 px-3 py-2 transition hover:bg-panel-2 ${
                        active ? "bg-panel-2" : ""
                      }`}
                    >
                      {/* market / volume */}
                      <div className="flex min-w-0 items-center gap-2">
                        <TokenIcon symbol={mk.symbol} size={28} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium">{b}-PERP</span>
                            <span className="rounded bg-accent/15 px-1 py-0.5 text-[9px] font-semibold text-accent">
                              {mk.maxLeverage}x
                            </span>
                          </div>
                          <div className="tnum text-[11px] text-muted">${fmtCompact(mk.volume24h)}</div>
                        </div>
                      </div>

                      {/* price / change */}
                      <div className="text-right">
                        <div className="tnum text-[13px]">{fmtNum(mk.price, priceDp(mk.price))}</div>
                        <div className={`tnum text-[11px] ${up ? "text-long" : "text-short"}`}>
                          {up ? "+" : ""}{mk.change24h.toFixed(2)}%
                        </div>
                      </div>

                      {/* funding / OI */}
                      <div className="text-right">
                        <div className={`tnum text-[13px] ${mk.funding >= 0 ? "text-fg" : "text-short"}`}>
                          {(mk.funding * 100).toFixed(4)}%
                        </div>
                        <div className="tnum text-[11px] text-muted">${fmtCompact(mk.openInterest)}</div>
                      </div>

                      {/* favorite */}
                      <button onClick={(e) => toggleFav(e, mk.symbol)} className="p-1">
                        <Star className={`h-4 w-4 ${fav ? "fill-accent text-accent" : "text-muted hover:text-fg"}`} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
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
