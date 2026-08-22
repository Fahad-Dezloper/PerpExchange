// ─────────────────────────────────────────────────────────────
// MOCK DATA — replace with real API/WS wiring later.
// Every export below marks where real data should come from.
// ─────────────────────────────────────────────────────────────

export type Market = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number; // percent
  volume24h: number; // quote volume
  funding: number; // percent (8h)
  openInterest: number;
  maxLeverage: number;
};

// REAL: GET /api/v1/markets  (+ live price via ws ticker.<symbol>)
export const MARKETS: Market[] = [
  {
    id: "BTC-PERP",
    symbol: "BTC-PERP",
    name: "Bitcoin",
    price: 67432.5,
    change24h: 2.34,
    volume24h: 1.82e9,
    funding: 0.0089,
    openInterest: 4.2e8,
    maxLeverage: 50,
  },
];

export function marketBySymbol(symbol: string): Market {
  return MARKETS.find((m) => m.symbol === symbol) ?? MARKETS[0];
}

export type Candle = { o: number; h: number; l: number; c: number };

// REAL: GET /api/v1/klines?symbol=  (or aggregate trades)
export function makeCandles(mid: number, n = 60): Candle[] {
  const rnd = seeded(Math.floor(mid * 3));
  let price = mid * 0.96;
  return Array.from({ length: n }, () => {
    const o = price;
    const c = o * (1 + (rnd() - 0.48) * 0.02);
    const h = Math.max(o, c) * (1 + rnd() * 0.006);
    const l = Math.min(o, c) * (1 - rnd() * 0.006);
    price = c;
    return { o, h, l, c };
  });
}

export type Position = {
  symbol: string;
  side: "Long" | "Short";
  size: number;
  entry: number;
  mark: number;
  leverage: number;
  margin: number;
  liq: number;
  pnl: number;
  pnlPct: number;
};

// REAL: ws position.<userId>  (seed GET /api/v1/positions)
export const POSITIONS: Position[] = [
  {
    symbol: "BTC-PERP",
    side: "Long",
    size: 0.35,
    entry: 65200,
    mark: 67432.5,
    leverage: 10,
    margin: 2282,
    liq: 59100,
    pnl: 781.4,
    pnlPct: 34.2,
  },
  {
    symbol: "SOL-PERP",
    side: "Short",
    size: 40,
    entry: 172.4,
    mark: 168.42,
    leverage: 5,
    margin: 1379,
    liq: 198.6,
    pnl: 159.2,
    pnlPct: 11.5,
  },
  {
    symbol: "ETH-PERP",
    side: "Long",
    size: 1.2,
    entry: 3580,
    mark: 3521.18,
    leverage: 8,
    margin: 537,
    liq: 3190,
    pnl: -70.6,
    pnlPct: -13.1,
  },
];

export type OpenOrder = {
  orderId: string;
  marketId: string;
  symbol: string;
  side: "long" | "short";
  type: "Limit";
  price: number;
  size: number;
  filled: number;
  time: string;
};

// REAL: GET /api/v1/balance
export const BALANCE = {
  available: 8421.55,
  locked: 4198.0,
  equity: 13489.35,
  unrealized: 869.8,
};

// ── helpers ──────────────────────────────────────────────────
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export function fmtUsd(n: number, dp = 2) {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    })
  );
}
export function fmtNum(n: number, dp = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}
export function fmtCompact(n: number) {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}
export function priceDp(price: number) {
  return price >= 100 ? 2 : price >= 1 ? 3 : 4;
}
