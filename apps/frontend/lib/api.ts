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
import {
  BalanceDto,
  Depth,
  mapBalance,
  mapMarket,
  mapOrder,
  mapPositon,
  PlaceOrder,
  PlaceOrderResult,
  WireBalance,
  WireMarket,
  WireOrder,
  WirePosition,
} from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

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

export async function signup(
  username: string,
  password: string,
): Promise<{ id: string }> {
  if (USE_MOCK) return (await wait(), { id: "mock-user" });
  return req("/api/v1/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function signin(
  username: string,
  password: string,
): Promise<{ token: string }> {
  if (USE_MOCK) return (await wait(), { token: "mock-token" });
  return req("/api/v1/signin", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function getBalance(): Promise<BalanceDto> {
  if (USE_MOCK) return (await wait(), BALANCE);
  return mapBalance(await req<WireBalance>("/api/v1/balance"));
}

export async function deposit(amount: number): Promise<void> {
  if (USE_MOCK) return void (await wait());
  await req("/api/v1/onramp", {
    method: "POST",
    body: JSON.stringify({ amount: String(amount) }),
  });
}

export async function withdraw(amount: number): Promise<void> {
  if (USE_MOCK) return void (await wait());
  await req("/api/v1/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount: String(amount) }),
  });
}

export async function getMarkets(): Promise<Market[]> {
  if (USE_MOCK) return (await wait(), MARKETS);
  return (await req<WireMarket[]>("/api/v1/markets")).map(mapMarket);
}

export async function getDepth(marketId: string): Promise<Depth> {
  if (USE_MOCK) {
    const b = makeOrderBook(
      MARKETS.find((m) => m.symbol === marketId)?.price ?? 100,
    );
    return {
      bids: b.bids.map(
        (l) => [String(l.price), String(l.size)] as [string, string],
      ),
      asks: b.asks.map(
        (l) => [String(l.price), String(l.size)] as [string, string],
      ),
    };
  }
  return req(`/api/v1/depth?marketId=${encodeURIComponent(marketId)}`, {
    method: "POST",
  });
}

export async function placeOrder(o: PlaceOrder): Promise<PlaceOrderResult> {
  if (USE_MOCK) return (await wait(), { orderId: "ODR-mock", status: "Open" });
  return req("/api/v1/order", { method: "POST", body: JSON.stringify(o) });
}

export async function cancelOrder(
  orderId: string,
  marketId: string,
): Promise<void> {
  if (USE_MOCK) return void (await wait());
  await req("/api/v1/order/cancel", {
    method: "POST",
    body: JSON.stringify({ orderId, marketId }),
  });
}

export async function getPositions(): Promise<Position[]> {
  if (USE_MOCK) return (await wait(), POSITIONS);
  const r = await req<{ positions: WirePosition[] }>("/api/v1/positions");
  return r.positions.map((p) => mapPositon(p));
}

export async function getOpenOrders(): Promise<OpenOrder[]> {
  if (USE_MOCK) return (await wait(), OPEN_ORDERS);
  const r = await req<WireOrder[]>("/api/v1/orders?open=true");
  return r.map((o) => mapOrder(o));
}
