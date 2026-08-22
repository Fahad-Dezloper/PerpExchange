export type Side = "long" | "short";
export type OrderType = "limit" | "market";
export type OrderStatus = "Open" | "PartiallyFilled" | "Filled" | "Cancelled";

export type BalanceDto = {
  available: number;
  locked: number;
  equity: number;
  unrealized: number;
};

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
  marginMode?: "cross" | "isolated";
};

export type Market = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  funding: number;
  openInterest: number;
  maxLeverage: number;
};

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

export type Depth = { bids: [string, string][]; asks: [string, string][] };

export type PlaceOrder = {
  marketId: string;
  side: Side;
  type: OrderType;
  price: number;
  qty: string;
  leverage: string;
  slippage: string;
  clientId: string;
  marginMode: "cross" | "isolated";
};

export type PlaceOrderResult = { orderId: string; status: OrderStatus };

export type WireBalance = { available: string; locked: string };

export type WireMarket = {
  id: string;
  slug: string;
  imageUrl: string;
  maxLeverage: number;
  maintenanceMargin: string;
  tickSize: string;
};

export type WirePosition = {
  marketId: string;
  side: "Long" | "Short";
  qty: string;
  entryPrice: string;
  markPrice?: string;
  margin: string;
  leverage: number;
  liquidationPrice: string;
  unrealizedPnl?: string;
  equity?: string;
  marginMode?: "cross" | "isolated";
};

export type WireOrder = {
  id: string;
  market_id: string;
  side: "Bid" | "Ask";
  orderType: "Limit" | "Market";
  price: string | null;
  qty: string;
  filledQty: string;
  status: OrderStatus;
  createdAt: string;
};

export type WireOpenOrder = {
  orderId: string;
  marketId: string;
  side: "Bid" | "Ask";
  price: string;
  qty: string;
  filled: string;
};

export function mapOpenOrder(o: WireOpenOrder): OpenOrder {
  return {
    orderId: o.orderId,
    marketId: o.marketId,
    symbol: o.marketId,
    side: o.side === "Bid" ? "long" : "short",
    type: "Limit",
    price: +o.price,
    size: +o.qty,
    filled: +o.filled,
    time: "",
  };
}

export function mapBalance(b: WireBalance): BalanceDto {
  const available = +b.available;
  const locked = +b.locked;
  return { available, locked, equity: available + locked, unrealized: 0 };
}

export function mapMarket(m: WireMarket): Market {
  return {
    id: m.id,
    symbol: m.slug,
    name: m.slug.split("-")[0],
    price: 0,
    change24h: 0,
    volume24h: 0,
    funding: 0,
    openInterest: 0,
    maxLeverage: m.maxLeverage,
  };
}

export function mapPositon(
  p: WirePosition,
  resolveSymbol: (marketId: string) => string = (id) => id,
): Position {
  const margin = +p.margin;
  const pnl = +(p.unrealizedPnl ?? "0");
  return {
    symbol: resolveSymbol(p.marketId),
    side: p.side,
    size: +p.qty,
    entry: +p.entryPrice,
    mark: +(p.markPrice ?? p.entryPrice),
    leverage: p.leverage,
    margin,
    liq: +p.liquidationPrice,
    pnl,
    pnlPct: margin > 0 ? (pnl / margin) * 100 : 0,
    marginMode: p.marginMode ?? "isolated",
  };
}

export function mapOrder(
  o: WireOrder,
  resolveSymbol: (marketId: string) => string = (id) => id,
): OpenOrder {
  return {
    orderId: o.id,
    marketId: o.market_id,
    symbol: resolveSymbol(o.market_id),
    side: o.side === "Bid" ? "long" : "short",
    type: "Limit",
    price: +(o.price ?? "0"),
    size: +o.qty,
    filled: +o.filledQty,
    time: new Date(o.createdAt).toISOString().slice(11, 19),
  };
}

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
