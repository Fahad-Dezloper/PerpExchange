// unit tests vs integration tests
// unit test are single component test like orderbook
// integeration test are end to end test of user flow. dont care about the language very generic
import { beforeAll, describe, expect, it } from "bun:test";
import { BACKEND } from "./config";
import axios, { AxiosError } from "axios";

const ADMIN = process.env.ADMIN_SECRET!;
const rnd = () => Math.random().toString(36).slice(2);
const auth = (token: string) => ({ headers: { token } });

// helpers
async function makeUser(): Promise<string> {
  const username = "u_" + rnd();
  await axios.post(`${BACKEND}/api/v1/signup`, { username, password: "1" });
  const r = await axios.post(`${BACKEND}/api/v1/signin`, {
    username,
    password: "1",
  });
  return r.data.token as string;
}

async function onramp(token: string, amount: string) {
  return axios.post(`${BACKEND}/api/v1/onramp`, { amount }, auth(token));
}

async function balance(token: string) {
  const r = await axios.get(`${BACKEND}/api/v1/balance`, auth(token));
  return r.data;
}

async function createMarket(): Promise<string> {
  const r = await axios.post(
    `${BACKEND}/api/v1/market`,
    { symbol: "T-" + rnd(), imageUrl: "x" },
    { headers: { token: ADMIN } },
  );
  return r.data.id as string;
}

async function order(
  token: string,
  marketId: string,
  side: "long" | "short",
  price: number,
  qty: string,
  leverage: string,
) {
  const r = await axios.post(
    `${BACKEND}/api/v1/order`,
    { marketId, side, type: "limit", price, qty, leverage, slippage: "0" },
    auth(token),
  );
  return r.data as {
    ok: boolean;
    orderId: string;
    status: string;
    fills: any[];
  };
}

async function positions(token: string) {
  const r = await axios.get(`${BACKEND}/api/v1/positions`, auth(token));
  return r.data.positions as any[];
}

describe("auth", () => {
  it("signup rejects missing username", async () => {
    try {
      await axios.post(`${BACKEND}/api/v1/signup`, { password: "1" });
      expect(true).toBe(false);
    } catch (e) {
      expect((e as AxiosError).response?.status).toBe(411);
    }
  });

  it("signup + signin returns a token", async () => {
    const token = await makeUser();
    expect(token).toBeTruthy();
  });

  it("signin rejects bad creds", async () => {
    try {
      await axios.post(`${BACKEND}/api/v1/signin`, {
        username: "nope_" + rnd(),
        password: "x",
      });
      expect(true).toBe(false);
    } catch (e) {
      expect((e as AxiosError).response?.status).toBe(411);
    }
  });
});

describe("funds", () => {
  it("onramp credits available balance", async () => {
    const t = await makeUser();
    await onramp(t, "1000");
    const b = await balance(t);
    expect(Number(b.available)).toBe(1000);
    expect(Number(b.locked)).toBe(0);
  });

  it("withdraw debits available", async () => {
    const t = await makeUser();
    await onramp(t, "1000");
    await axios.post(`${BACKEND}/api/v1/withdraw`, { amount: "300" }, auth(t));
    const b = await balance(t);
    expect(Number(b.available)).toBe(700);
  });

  it("withdraw rejects over-balance", async () => {
    const t = await makeUser();
    await onramp(t, "100");
    const r = await axios.post(
      `${BACKEND}/api/v1/withdraw`,
      { amount: "9999" },
      auth(t),
    );
    expect(r.data.ok).toBe(false);
  });
});

describe("margin lock", () => {
  it("locks notional/leverage and rejects when broke", async () => {
    const t = await makeUser();
    const m = await createMarket();

    // no funds -> rejected
    const broke = await order(t, m, "long", 100, "1", "5");
    expect(broke.ok).toBe(false);

    // fund, place long 2@100 lev5 -> margin 40 locked
    await onramp(t, "1000");
    const o = await order(t, m, "long", 100, "2", "5");
    expect(o.status).toBe("Open");

    const b = await balance(t);
    expect(Number(b.available)).toBe(960);
    expect(Number(b.locked)).toBe(40);
  });

  it("cancel unlocks margin", async () => {
    const t = await makeUser();
    const m = await createMarket();
    await onramp(t, "1000");
    const o = await order(t, m, "long", 100, "2", "5");

    await axios.post(
      `${BACKEND}/api/v1/order/cancel`,
      { orderId: o.orderId, marketId: m },
      auth(t),
    );
    const b = await balance(t);
    expect(Number(b.available)).toBe(1000);
    expect(Number(b.locked)).toBe(0);
  });
});

describe("matching opens positions on both sides", () => {
  let A: string, B: string, m: string;

  beforeAll(async () => {
    A = await makeUser();
    B = await makeUser();
    m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");
  });

  it("fill creates long/short positions with correct liq prices", async () => {
    const resting = await order(A, m, "long", 100, "2", "5"); // rests
    expect(resting.status).toBe("Open");

    const taker = await order(B, m, "short", 100, "2", "5"); // fills
    expect(taker.status).toBe("Filled");
    expect(taker.fills.length).toBeGreaterThan(0);

    const pa = await positions(A);
    const pb = await positions(B);

    expect(pa.length).toBe(1);
    expect(pa[0].side).toBe("Long");
    expect(Number(pa[0].qty)).toBe(2);
    expect(Number(pa[0].entryPrice)).toBe(100);
    expect(Number(pa[0].liquidationPrice)).toBeCloseTo(80.5, 1);

    expect(pb[0].side).toBe("Short");
    expect(Number(pb[0].liquidationPrice)).toBeCloseTo(119.5, 1);
  });
});

describe("closing a position returns margin", () => {
  it("full close frees margin back to available", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    // open: A long, B short
    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");

    // close: A shorts (rests), B longs (fills) -> both flat
    await order(A, m, "short", 100, "2", "5");
    await order(B, m, "long", 100, "2", "5");

    const pa = await positions(A);
    expect(pa.length).toBe(0);

    const b = await balance(A);
    expect(Number(b.available)).toBe(1000);
    expect(Number(b.locked)).toBe(0);
  });
});
