// unit tests vs integration tests
// unit test are single component test like orderbook
// integeration test are end to end test of user flow. dont care about the language very generic
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { BACKEND } from "./config";
import axios, { AxiosError } from "axios";
import { createClient } from "redis";
import { prisma } from "db";

const ADMIN = process.env.ADMIN_SECRET!;
const rnd = () => Math.random().toString(36).slice(2);
const auth = (token: string) => ({ headers: { token } });

const redis = createClient();
let redisReady = false;

async function ensureRedis() {
  if (!redisReady) {
    await redis.connect();
    redisReady = true;
  }
}

async function setMarkPrice(marketId: string, price: string) {
  await ensureRedis();
  await redis.xAdd("to-engine", "*", {
    requestId: "test-" + rnd(),
    payload: JSON.stringify({
      messageType: "mark_price_update",
      marketId,
      price,
    }),
  });
}

async function waitFor<T>(
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

afterAll(async () => {
  if (redisReady) await redis.quit();
});

describe("mark price drives unrealized pnl", () => {
  let A: string, B: string, m: string;

  beforeAll(async () => {
    A = await makeUser();
    B = await makeUser();
    m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");
  });

  it("uses oracle mark price, not last traded", async () => {
    await setMarkPrice(m, "110");

    const pa = await waitFor(
      () => positions(A),
      (p) => p[0]?.markPrice === "110",
    );

    expect(pa[0].markPrice).toBe("110");
    expect(Number(pa[0].unrealizedPnl)).toBe(20); // (110-100)*2
    expect(Number(pa[0].equity)).toBe(60); // margin 40 + 20
  }, 15_000);

  it("short side mirrors the long", async () => {
    const pb = await waitFor(
      () => positions(B),
      (p) => p[0]?.markPrice === "110",
    );

    expect(pb[0].side).toBe("Short");
    expect(Number(pb[0].unrealizedPnl)).toBe(-20); // (100-110)*2
    expect(Number(pb[0].equity)).toBe(20); // margin 40 - 20
  });

  it("price drop flips pnl signs", async () => {
    await setMarkPrice(m, "90");

    const pa = await waitFor(
      () => positions(A),
      (p) => p[0]?.markPrice === "90",
    );

    expect(Number(pa[0].unrealizedPnl)).toBe(-20); // long loses
    expect(Number(pa[0].equity)).toBe(20);
  });
});

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

async function depth(marketId: string) {
  const r = await axios.post(`${BACKEND}/api/v1/depth?marketId=${marketId}`);
  return r.data as { bids: [string, string][]; asks: [string, string][] };
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

describe("liquidation", () => {
  let A: string, B: string, m: string;

  beforeAll(async () => {
    A = await makeUser();
    B = await makeUser();
    m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");
    // A long 2@100 lev5 -> margin 40, liq price 80.5
    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");
  });

  it("does not liquidate above the liq price", async () => {
    await setMarkPrice(m, "85");
    const pa = await waitFor(
      () => positions(A),
      (p) => p[0]?.markPrice === "85",
    );
    expect(pa.length).toBe(1); // still alive
  }, 15_000);

  it("liquidates the long when mark crosses liq price", async () => {
    await setMarkPrice(m, "80");
    const pa = await waitFor(
      () => positions(A),
      (p) => p.length === 0,
    );
    expect(pa.length).toBe(0); // position wiped
  }, 15_000);

  it("liquidated trader loses the margin", async () => {
    const b = await balance(A);
    expect(Number(b.locked)).toBe(0); // margin released
    expect(Number(b.available)).toBe(960); // 1000 - 40 margin, payout 0
  }, 15_000);

  it("short side survives (it profited)", async () => {
    const pb = await positions(B);
    expect(pb.length).toBe(1);
    expect(Number(pb[0].unrealizedPnl)).toBe(40); // (100-80)*2
  }, 15_000);
});

describe("engine emits trade events on fill", () => {
  it("broadcasts a trade on the market channel", async () => {
    await ensureRedis();
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    // dedicated subscriber connection
    const sub = redis.duplicate();
    await sub.connect();

    const trade = new Promise<any>(async (resolve) => {
      await sub.subscribe(`trade.${m}`, (raw) => resolve(JSON.parse(raw)));
    });

    await order(A, m, "long", 100, "1", "5"); // rests
    await order(B, m, "short", 100, "1", "5"); // fills -> trade fires

    const t = await Promise.race([
      trade,
      new Promise((_, r) =>
        setTimeout(() => r(new Error("no trade event")), 5000),
      ),
    ]);

    expect(Number((t as any).price)).toBe(100);
    expect(Number((t as any).qty)).toBe(1);

    await sub.quit();
  }, 20_000);

  it("writes a fill event to the to-db stream", async () => {
    await ensureRedis();
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "1", "5");
    await order(B, m, "short", 100, "1", "5");

    // read recent to-db entries, find a fill for this market
    const found = await waitFor(
      async () => {
        const entries = await redis.xRevRange("to-db", "+", "-", { COUNT: 50 });
        return entries.some((e: any) => {
          const p = JSON.parse(e.message.payload);
          return p.type === "fill" && p.marketId === m;
        });
      },
      (ok) => ok === true,
      5000,
    );
    expect(found).toBe(true);
  }, 20_000);
});

describe("realized pnl on close", () => {
  it("winner gains and loser loses the exact pnl", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    // open: A long 2@100, B short 2@100
    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");

    // close at 110: A sells (rests), B buys (fills)
    await order(A, m, "short", 110, "2", "5");
    await order(B, m, "long", 110, "2", "5");

    const ba = await balance(A);
    const bb = await balance(B);

    // A long, price 100->110 => +20 ; B short => -20
    expect(Number(ba.available)).toBe(1020);
    expect(Number(ba.locked)).toBe(0);
    expect(Number(bb.available)).toBe(980);
    expect(Number(bb.locked)).toBe(0);

    expect((await positions(A)).length).toBe(0);
    expect((await positions(B)).length).toBe(0);
  }, 20_000);
});

describe("position increase and flip", () => {
  it("same-side fill increases size with weighted avg entry", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    // A long 2@100
    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");

    // A adds long 1@110
    await order(A, m, "long", 110, "1", "5");
    await order(B, m, "short", 110, "1", "5");

    const pa = await positions(A);
    expect(pa[0].side).toBe("Long");
    expect(Number(pa[0].qty)).toBe(3);
    expect(Number(pa[0].entryPrice)).toBeCloseTo(103.333, 2); // (2*100+1*110)/3
  }, 20_000);

  it("opposite fill larger than position flips the side", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    // A long 2, B short 2
    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");

    // A shorts 3 (rests), B longs 3 (fills) -> both flip to size 1
    await order(A, m, "short", 100, "3", "5");
    await order(B, m, "long", 100, "3", "5");

    const pa = await positions(A);
    const pb = await positions(B);
    expect(pa[0].side).toBe("Short");
    expect(Number(pa[0].qty)).toBe(1);
    expect(pb[0].side).toBe("Long");
    expect(Number(pb[0].qty)).toBe(1);
  }, 20_000);
});

describe("partial fill", () => {
  it("taker partially fills, remainder rests, status PartiallyFilled", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    // A rests long 2@100
    await order(A, m, "long", 100, "2", "5");

    // B shorts 5@100 -> fills 2, 3 rests
    const b = await order(B, m, "short", 100, "5", "5");
    expect(b.status).toBe("PartiallyFilled");

    // B holds a Short 2 from the filled slice
    const pb = await positions(B);
    expect(Number(pb[0].qty)).toBe(2);
    expect(pb[0].side).toBe("Short");

    // 3 remaining rests on the ask side
    const d = await depth(m);
    const askAt100 = d.asks.find(([p]) => Number(p) === 100);
    expect(askAt100).toBeDefined();
    expect(Number(askAt100![1])).toBe(3);
  }, 20_000);
});

describe("poller persists fills to postgres", () => {
  it("writes a Fill row for a matched trade", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "1", "5");
    await order(B, m, "short", 100, "1", "5");

    // poller consumes to-db async -> retry until the row lands
    const found = await waitFor(
      async () => {
        const fills = await prisma.fill.findMany({ where: { market_id: m } });
        return fills.length;
      },
      (n) => n > 0,
      8000,
    );
    expect(found).toBeGreaterThan(0);
  }, 25_000);
});

afterAll(async () => {
  await prisma.$disconnect();
});
