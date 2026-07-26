// ─────────────────────────────────────────────────────────────
// API CLIENT — the single seam between UI and backend.
// Every screen imports from here. Right now every call returns
// MOCK data. To go live: set USE_MOCK = false and the real fetch
// implementations below take over. Fix response shapes per your
// backend as needed (noted inline).
// ─────────────────────────────────────────────────────────────

import {
  MARKETS,
  POSITIONS,
  OPEN_ORDERS,
  BALANCE,
  makeOrderBook,
  type Market,
  type Position,
  type OpenOrder,
} from "./mock";

export const USE_MOCK = true;

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function token(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("token");
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(token() ? { token: token()! } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// ── auth ─────────────────────────────────────────────────────
export async function signup(username: string, password: string): Promise<{ id: string }> {
  if (USE_MOCK) return (await wait(), { id: "mock-user" });
  return req("/api/v1/signup", { method: "POST", body: JSON.stringify({ username, password }) });
}

export async function signin(username: string, password: string): Promise<{ token: string }> {
  if (USE_MOCK) return (await wait(), { token: "mock-token" });
  return req("/api/v1/signin", { method: "POST", body: JSON.stringify({ username, password }) });
}

// ── funds ────────────────────────────────────────────────────
export type BalanceDto = { available: number; locked: number; equity: number; unrealized: number };

export async function getBalance(): Promise<BalanceDto> {
  if (USE_MOCK) return (await wait(), BALANCE);
  // NOTE: backend returns { available, locked } as strings -> map here.
  const b = await req<{ available: string; locked: string }>("/api/v1/balance");
  return { available: +b.available, locked: +b.locked, equity: +b.available + +b.locked, unrealized: 0 };
}

export async function deposit(amount: number): Promise<void> {
  if (USE_MOCK) return void (await wait());
  await req("/api/v1/onramp", { method: "POST", body: JSON.stringify({ amount: String(amount) }) });
}

export async function withdraw(amount: number): Promise<void> {
  if (USE_MOCK) return void (await wait());
  await req("/api/v1/withdraw", { method: "POST", body: JSON.stringify({ amount: String(amount) }) });
}

// ── markets ──────────────────────────────────────────────────
export async function getMarkets(): Promise<Market[]> {
  if (USE_MOCK) return (await wait(), MARKETS);
  // NOTE: no /markets endpoint yet — add one (list Market rows + live price).
  return req("/api/v1/markets");
}

export type Depth = { bids: [string, string][]; asks: [string, string][] };
export async function getDepth(marketId: string): Promise<Depth> {
  if (USE_MOCK) {
    const b = makeOrderBook(MARKETS.find((m) => m.symbol === marketId)?.price ?? 100);
    return {
      bids: b.bids.map((l) => [String(l.price), String(l.size)] as [string, string]),
      asks: b.asks.map((l) => [String(l.price), String(l.size)] as [string, string]),
    };
  }
  return req(`/api/v1/depth?marketId=${encodeURIComponent(marketId)}`, { method: "POST" });
}

// ── trading ──────────────────────────────────────────────────
export type PlaceOrder = {
  marketId: string;
  side: "long" | "short";
  type: "limit" | "market";
  price: number;
  qty: string;
  leverage: string;
  slippage: string;
};

export async function placeOrder(o: PlaceOrder): Promise<{ orderId: string; status: string }> {
  if (USE_MOCK) return (await wait(), { orderId: "ODR-mock", status: "Open" });
  return req("/api/v1/order", { method: "POST", body: JSON.stringify(o) });
}

export async function cancelOrder(orderId: string, marketId: string): Promise<void> {
  if (USE_MOCK) return void (await wait());
  await req("/api/v1/order/cancel", { method: "POST", body: JSON.stringify({ orderId, marketId }) });
}

export async function getPositions(): Promise<Position[]> {
  if (USE_MOCK) return (await wait(), POSITIONS);
  // NOTE: backend returns { positions: [...] } with string fields -> map to numbers.
  const r = await req<{ positions: any[] }>("/api/v1/positions");
  return r.positions as Position[];
}

export async function getOpenOrders(): Promise<OpenOrder[]> {
  if (USE_MOCK) return (await wait(), OPEN_ORDERS);
  return req("/api/v1/orders?open=true"); // NOTE: add this endpoint
}
