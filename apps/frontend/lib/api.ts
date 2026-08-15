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
let onUnauthorized: (() => void) | null = null;

function bearer(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("bearer_token");
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(bearer() ? { authorization: `Bearer ${bearer()}` } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401 || res.status === 403) {
    onUnauthorized?.();
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export async function getBalance(): Promise<BalanceDto> {
  return mapBalance(await req<WireBalance>("api/v1/balance"));
}

export async function deposit(amount: number): Promise<void> {
  try {
    await req("api/v1/onramp", {
      method: "POST",
      body: JSON.stringify({ amount: String(amount) }),
    });
  } catch (e) {
    console.log("Error while onramping", e);
  }
}

export async function withdraw(amount: number): Promise<void> {
  await req("api/v1/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount: String(amount) }),
  });
}

export async function getMarkets(): Promise<Market[]> {
  return (await req<WireMarket[]>("api/v1/markets")).map(mapMarket);
}

export async function getDepth(marketId: string): Promise<Depth> {
  return req(`api/v1/depth?marketId=${encodeURIComponent(marketId)}`, {
    method: "POST",
  });
}

export async function placeOrder(o: PlaceOrder): Promise<PlaceOrderResult> {
  return req("api/v1/order", { method: "POST", body: JSON.stringify(o) });
}

export async function cancelOrder(
  orderId: string,
  marketId: string,
): Promise<void> {
  await req("/api/v1/order/cancel", {
    method: "POST",
    body: JSON.stringify({ orderId, marketId }),
  });
}

export async function getPositions(): Promise<Position[]> {
  const r = await req<{ positions: WirePosition[] }>("api/v1/positions");
  return r.positions.map((p) => mapPositon(p));
}

export async function getOpenOrders(): Promise<OpenOrder[]> {
  if (USE_MOCK) return (await wait(), OPEN_ORDERS);
  const r = await req<WireOrder[]>("/api/v1/orders?open=true");
  return r.map((o) => mapOrder(o));
}
