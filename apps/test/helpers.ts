// Shared integration-test helpers, current as of Better Auth + fees + margin modes.
import axios from "axios";
import { BACKEND } from "./config";

export const ADMIN = process.env.ADMIN_SECRET!;
export const rnd = () => Math.random().toString(36).slice(2);

// authenticated requests use the Better Auth bearer token
export const auth = (token: string) => ({
  headers: { authorization: `Bearer ${token}` },
});

// sign up + sign in via Better Auth; the bearer plugin returns the token in `set-auth-token`
export async function makeUser(): Promise<string> {
  const email = `u_${rnd()}@test.dev`;
  const password = "password123";
  await axios
    .post(`${BACKEND}/api/auth/sign-up/email`, { email, password, name: email })
    .catch(() => {}); // ignore "already exists" on retries
  const r = await axios.post(`${BACKEND}/api/auth/sign-in/email`, {
    email,
    password,
  });
  const token = r.headers["set-auth-token"];
  if (!token) throw new Error("no bearer token from sign-in");
  return token as string;
}

export async function getUserId(token: string): Promise<string> {
  const r = await axios.get(`${BACKEND}/api/auth/get-session`, auth(token));
  return r.data.user.id as string;
}

export const onramp = (t: string, amount: string) =>
  axios.post(`${BACKEND}/api/v1/onramp`, { amount }, auth(t));

export const withdraw = (t: string, amount: string) =>
  axios.post(`${BACKEND}/api/v1/withdraw`, { amount }, auth(t));

export const balance = async (t: string) =>
  (await axios.get(`${BACKEND}/api/v1/balance`, auth(t))).data;

export async function createMarket(): Promise<string> {
  const r = await axios.post(
    `${BACKEND}/api/v1/market`,
    { symbol: "T-" + rnd(), imageUrl: "x" },
    { headers: { token: ADMIN } },
  );
  return r.data.id as string;
}

type OrderOpts = {
  type?: "limit" | "market";
  clientId?: string;
  marginMode?: "cross" | "isolated";
};

export async function order(
  token: string,
  marketId: string,
  side: "long" | "short",
  price: number,
  qty: string,
  leverage: string,
  opts: OrderOpts = {},
) {
  const r = await axios.post(
    `${BACKEND}/api/v1/order`,
    {
      marketId,
      side,
      type: opts.type ?? "limit",
      price,
      qty,
      leverage,
      slippage: "0",
      clientId: opts.clientId ?? rnd(),
      marginMode: opts.marginMode ?? "isolated",
    },
    auth(token),
  );
  return r.data as {
    ok: boolean;
    orderId: string;
    status: string;
    fills: any[];
    duplicate?: boolean;
  };
}

export const cancel = (t: string, orderId: string, marketId: string) =>
  axios.post(`${BACKEND}/api/v1/order/cancel`, { orderId, marketId }, auth(t));

export const positions = async (t: string) =>
  (await axios.get(`${BACKEND}/api/v1/positions`, auth(t))).data
    .positions as any[];

export const openOrders = async (t: string) =>
  (await axios.get(`${BACKEND}/api/v1/orders`, auth(t))).data.orders as any[];

export const depth = async (marketId: string) =>
  (await axios.post(`${BACKEND}/api/v1/depth?marketId=${marketId}`)).data as {
    bids: [string, string][];
    asks: [string, string][];
  };

export async function waitFor<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  const start = Date.now();
  let last: T;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  return last!;
}
