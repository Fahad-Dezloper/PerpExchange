import { type Market, type Position, type OpenOrder } from "./mock";
import {
  BalanceDto,
  Candle,
  Depth,
  mapBalance,
  mapMarket,
  mapOpenOrder,
  mapPositon,
  PlaceOrder,
  PlaceOrderResult,
  WireBalance,
  WireMarket,
  WireOpenOrder,
  WirePosition,
} from "./types";

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
    const err = new Error("unauthorized") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(
      (await res.text()) || `HTTP ${res.status}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export async function getBalance(): Promise<BalanceDto> {
  return mapBalance(await req<WireBalance>("api/v1/balance"));
}

export async function deposit(amount: number): Promise<void> {
  await req("api/v1/onramp", {
    method: "POST",
    body: JSON.stringify({ amount: String(amount) }),
  });
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

function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (status == null) return true; // fetch threw -> network/timeout
  return status >= 500;
}

export async function placeOrder(o: PlaceOrder): Promise<PlaceOrderResult> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // same o.clientId on every attempt -> engine returns the original on a dupe
      return await req<PlaceOrderResult>("api/v1/order", {
        method: "POST",
        body: JSON.stringify(o),
      });
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e; // definitive rejection -> surface immediately
      if (attempt < MAX_ATTEMPTS - 1) await wait(200 * (attempt + 1)); // 200ms, 400ms
    }
  }
  throw lastErr;
}

export async function cancelOrder(
  orderId: string,
  marketId: string,
): Promise<void> {
  await req("api/v1/order/cancel", {
    method: "POST",
    body: JSON.stringify({ orderId, marketId }),
  });
}

export async function getPositions(): Promise<Position[]> {
  const r = await req<{ positions: WirePosition[] }>("api/v1/positions");
  return r.positions.map((p) => mapPositon(p));
}

export async function getOpenOrders(): Promise<OpenOrder[]> {
  const r = await req<{ orders: WireOpenOrder[] }>("api/v1/orders");
  return r.orders.map(mapOpenOrder);
}

export async function getKlines(
  marketId: string,
  interval: string,
): Promise<Candle[]> {
  const r = await req<{ candles: Candle[] }>(
    `api/v1/klines?marketId=${encodeURIComponent(marketId)}&interval=${encodeURIComponent(interval)}`,
  );
  return r.candles;
}
