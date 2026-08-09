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

export type Level = { price: number; size: number; total: number };

// REAL: ws depth.<symbol>  (seed with GET /api/v1/depth)
export function makeOrderBook(mid: number, tick = mid * 0.0002) {
  const rnd = seeded(Math.floor(mid));
  const build = (dir: 1 | -1): Level[] => {
    let total = 0;
    return Array.from({ length: 14 }, (_, i) => {
      const price = mid + dir * tick * (i + 1);
      const size = +(rnd() * 8 + 0.2).toFixed(3);
      total += size;
      return { price: +price.toFixed(2), size, total: +total.toFixed(3) };
    });
  };
  return { asks: build(1).reverse(), bids: build(-1) };
}

export type Trade = {
  price: number;
  size: number;
  side: "buy" | "sell";
  time: string;
};

// REAL: ws trade.<symbol>
export function makeTrades(mid: number, n = 30): Trade[] {
  const rnd = seeded(Math.floor(mid * 7));
  return Array.from({ length: n }, (_, i) => {
    const side = rnd() > 0.5 ? "buy" : "sell";
    return {
      price: +(mid + (rnd() - 0.5) * mid * 0.001).toFixed(2),
      size: +(rnd() * 3 + 0.01).toFixed(3),
      side,
      time: clock(i),
    };
  });
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
  symbol: string;
  side: "long" | "short";
  type: "Limit";
  price: number;
  size: number;
  filled: number;
  time: string;
};

// REAL: GET /api/v1/orders?open=true
export const OPEN_ORDERS: OpenOrder[] = [
  {
    symbol: "BTC-PERP",
    side: "long",
    type: "Limit",
    price: 66000,
    size: 0.2,
    filled: 0,
    time: "09:41:02",
  },
  {
    symbol: "ETH-PERP",
    side: "short",
    type: "Limit",
    price: 3600,
    size: 0.8,
    filled: 0.3,
    time: "09:38:55",
  },
];

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
function clock(i: number) {
  const d = new Date(Date.UTC(2026, 6, 19, 9, 42, 0) - i * 3137);
  return d.toISOString().slice(11, 19);
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
