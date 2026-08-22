// Integration tests — end-to-end user flows over HTTP through the full stack
// (backend -> redis -> engine -> poller -> postgres). Language-agnostic.
//
// Requires the stack running: redis, engine, backend, poller.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { BACKEND } from "./config";
import axios, { AxiosError } from "axios";
import { createClient } from "redis";
import { prisma } from "db";
import { readFile } from "fs/promises";
import {
  ADMIN,
  auth,
  balance,
  cancel,
  createMarket,
  depth,
  getUserId,
  makeUser,
  onramp,
  openOrders,
  order,
  positions,
  rnd,
  waitFor,
  withdraw,
} from "./helpers";

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
    payload: JSON.stringify({ messageType: "mark_price_update", marketId, price }),
  });
}

async function applyFunding(marketId: string) {
  await ensureRedis();
  await redis.xAdd("to-engine", "*", {
    requestId: "test-" + rnd(),
    payload: JSON.stringify({ messageType: "funding", marketId }),
  });
}

async function readSnapshot(): Promise<any | null> {
  try {
    const raw = await readFile(
      new URL("../engine/snapshots/latest.json", import.meta.url),
      "utf8",
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

afterAll(async () => {
  if (redisReady) await redis.quit();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------- auth
describe("auth (Better Auth)", () => {
  it("sign-up rejects a missing password", async () => {
    try {
      await axios.post(`${BACKEND}/api/auth/sign-up/email`, {
        email: `u_${rnd()}@test.dev`,
      });
      expect(true).toBe(false);
    } catch (e) {
      expect((e as AxiosError).response!.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("sign-up + sign-in returns a bearer token", async () => {
    const token = await makeUser();
    expect(token).toBeTruthy();
    const uid = await getUserId(token);
    expect(uid).toBeTruthy();
  });

  it("sign-in rejects bad credentials", async () => {
    try {
      await axios.post(`${BACKEND}/api/auth/sign-in/email`, {
        email: `nope_${rnd()}@test.dev`,
        password: "wrongpassword",
      });
      expect(true).toBe(false);
    } catch (e) {
      expect((e as AxiosError).response!.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("rejects unauthenticated protected calls", async () => {
    try {
      await axios.get(`${BACKEND}/api/v1/balance`);
      expect(true).toBe(false);
    } catch (e) {
      expect((e as AxiosError).response!.status).toBeGreaterThanOrEqual(400);
    }
  });
});

// ---------------------------------------------------------------- funds
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
    await withdraw(t, "300");
    const b = await balance(t);
    expect(Number(b.available)).toBe(700);
  });

  it("withdraw rejects over-balance", async () => {
    const t = await makeUser();
    await onramp(t, "100");
    const r = await withdraw(t, "9999");
    expect(r.data.ok).toBe(false);
  });
});

// ---------------------------------------------------------------- margin lock
describe("margin lock", () => {
  it("locks notional/leverage and rejects when broke", async () => {
    const t = await makeUser();
    const m = await createMarket();

    const broke = await order(t, m, "long", 100, "1", "5"); // no funds
    expect(broke.ok).toBe(false);

    await onramp(t, "1000");
    const o = await order(t, m, "long", 100, "2", "5"); // rests, margin 40
    expect(o.status).toBe("Open");

    const b = await balance(t);
    expect(Number(b.available)).toBe(960); // no fill yet -> no fee
    expect(Number(b.locked)).toBe(40);
  });

  it("cancel unlocks margin", async () => {
    const t = await makeUser();
    const m = await createMarket();
    await onramp(t, "1000");
    const o = await order(t, m, "long", 100, "2", "5");

    await cancel(t, o.orderId, m);
    const b = await balance(t);
    expect(Number(b.available)).toBe(1000);
    expect(Number(b.locked)).toBe(0);
  });
});

// ---------------------------------------------------------------- matching
describe("matching opens positions on both sides", () => {
  it("fill creates long/short positions with correct liq prices", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    const resting = await order(A, m, "long", 100, "2", "5");
    expect(resting.status).toBe("Open");

    const taker = await order(B, m, "short", 100, "2", "5");
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

// ---------------------------------------------------------------- fees (phase 12)
describe("trading fees", () => {
  it("charges taker more than maker and reduces available", async () => {
    const A = await makeUser(); // maker (rests)
    const B = await makeUser(); // taker (fills)
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "1", "5"); // rests
    await order(B, m, "short", 100, "1", "5"); // fills -> fees charged

    const ba = await balance(A);
    const bb = await balance(B);

    // notional 100, margin 20 each. taker fee 0.05, maker fee 0.02
    expect(Number(ba.available)).toBeCloseTo(979.98, 2); // 1000 - 20 - 0.02
    expect(Number(bb.available)).toBeCloseTo(979.95, 2); // 1000 - 20 - 0.05
    expect(Number(bb.available)).toBeLessThan(Number(ba.available));
  });
});

// ---------------------------------------------------------------- close
describe("closing a position returns margin", () => {
  it("full close frees margin back to available (minus fees)", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");
    await order(A, m, "short", 100, "2", "5");
    await order(B, m, "long", 100, "2", "5");

    const pa = await positions(A);
    expect(pa.length).toBe(0);

    const b = await balance(A);
    expect(Number(b.available)).toBeCloseTo(1000, 0); // ~1000 minus small fees
    expect(Number(b.locked)).toBe(0);
  });
});

// ---------------------------------------------------------------- mark price / pnl
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
    expect(Number(pa[0].unrealizedPnl)).toBe(20); // (110-100)*2
    expect(Number(pa[0].equity)).toBe(60); // margin 40 + 20
  }, 15_000);

  it("short side mirrors the long", async () => {
    const pb = await waitFor(
      () => positions(B),
      (p) => p[0]?.markPrice === "110",
    );
    expect(pb[0].side).toBe("Short");
    expect(Number(pb[0].unrealizedPnl)).toBe(-20);
  });

  it("price drop flips pnl signs", async () => {
    await setMarkPrice(m, "90");
    const pa = await waitFor(
      () => positions(A),
      (p) => p[0]?.markPrice === "90",
    );
    expect(Number(pa[0].unrealizedPnl)).toBe(-20);
  });
});

// ---------------------------------------------------------------- liquidation
describe("liquidation", () => {
  let A: string, B: string, m: string;

  beforeAll(async () => {
    A = await makeUser();
    B = await makeUser();
    m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");
    await order(A, m, "long", 100, "2", "5"); // margin 40, liq 80.5
    await order(B, m, "short", 100, "2", "5");
  });

  it("does not liquidate above the liq price", async () => {
    await setMarkPrice(m, "85");
    const pa = await waitFor(
      () => positions(A),
      (p) => p[0]?.markPrice === "85",
    );
    expect(pa.length).toBe(1);
  }, 15_000);

  it("liquidates the long when mark crosses liq price", async () => {
    await setMarkPrice(m, "80");
    const pa = await waitFor(
      () => positions(A),
      (p) => p.length === 0,
    );
    expect(pa.length).toBe(0);
  }, 15_000);

  it("liquidated trader loses the margin", async () => {
    const b = await balance(A);
    expect(Number(b.locked)).toBe(0);
    expect(Number(b.available)).toBeCloseTo(960, 0); // 1000 - 40, payout 0 (minus fee)
  }, 15_000);

  it("short side survives (it profited)", async () => {
    const pb = await positions(B);
    expect(pb.length).toBe(1);
    expect(Number(pb[0].unrealizedPnl)).toBe(40); // (100-80)*2
  }, 15_000);
});

// ---------------------------------------------------------------- realized pnl
describe("realized pnl on close", () => {
  it("winner gains and loser loses the pnl (minus fees)", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");
    await order(A, m, "short", 110, "2", "5");
    await order(B, m, "long", 110, "2", "5");

    const ba = await balance(A);
    const bb = await balance(B);
    expect(Number(ba.available)).toBeCloseTo(1020, 0); // long +20
    expect(Number(bb.available)).toBeCloseTo(980, 0); // short -20
    expect((await positions(A)).length).toBe(0);
    expect((await positions(B)).length).toBe(0);
  }, 20_000);
});

// ---------------------------------------------------------------- increase / flip
describe("position increase and flip", () => {
  it("same-side fill increases size with weighted avg entry", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");
    await order(A, m, "long", 110, "1", "5");
    await order(B, m, "short", 110, "1", "5");

    const pa = await positions(A);
    expect(Number(pa[0].qty)).toBe(3);
    expect(Number(pa[0].entryPrice)).toBeCloseTo(103.333, 2);
  }, 20_000);

  it("opposite fill larger than position flips the side", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");
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

// ---------------------------------------------------------------- partial fill
describe("partial fill", () => {
  it("taker partially fills, remainder rests, status PartiallyFilled", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "2", "5");
    const b = await order(B, m, "short", 100, "5", "5"); // fills 2, rests 3
    expect(b.status).toBe("PartiallyFilled");

    const pb = await positions(B);
    expect(Number(pb[0].qty)).toBe(2);

    const d = await depth(m);
    const askAt100 = d.asks.find(([p]) => Number(p) === 100);
    expect(Number(askAt100![1])).toBe(3);
  }, 20_000);
});

// ---------------------------------------------------------------- market orders (IOC)
describe("market orders", () => {
  it("fills against resting liquidity", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "short", 100, "1", "5"); // rests ask
    const r = await order(B, m, "long", 100, "1", "5", { type: "market" });
    expect(r.status).toBe("Filled");

    const pb = await positions(B);
    expect(pb.length).toBe(1);
    expect(pb[0].side).toBe("Long");
  }, 20_000);

  it("cancels and refunds when there is no liquidity (IOC)", async () => {
    const A = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");

    const r = await order(A, m, "long", 100, "1", "5", { type: "market" });
    expect(r.status).toBe("Cancelled");

    const b = await balance(A);
    expect(Number(b.available)).toBe(1000); // fully refunded, nothing stuck
    expect(Number(b.locked)).toBe(0);
    expect((await positions(A)).length).toBe(0);
  }, 20_000);
});

// ---------------------------------------------------------------- idempotency (phase 13)
describe("clientId idempotency", () => {
  it("a duplicate clientId does not create a second order", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(B, m, "short", 100, "2", "5"); // resting liquidity
    const cid = rnd();
    await order(A, m, "long", 100, "1", "5", { clientId: cid });
    const r2 = await order(A, m, "long", 100, "1", "5", { clientId: cid });

    expect(r2.status).toBe("Duplicate");
    const pa = await positions(A);
    expect(Number(pa[0].qty)).toBe(1); // not 2
  }, 20_000);
});

// ---------------------------------------------------------------- margin mode (phase 12)
describe("margin modes", () => {
  it("persists the chosen margin mode on the position", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(B, m, "short", 100, "1", "5", { marginMode: "isolated" });
    await order(A, m, "long", 100, "1", "5", { marginMode: "cross" });

    const pa = await positions(A);
    expect(pa[0].marginMode).toBe("cross");
  }, 20_000);
});

// ---------------------------------------------------------------- open orders endpoint
describe("open orders", () => {
  it("lists a resting order", async () => {
    const A = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    const o = await order(A, m, "long", 100, "2", "5"); // rests

    const oo = await openOrders(A);
    expect(oo.find((x: any) => x.orderId === o.orderId)).toBeDefined();
  }, 20_000);
});

// ---------------------------------------------------------------- events
describe("engine emits trade events on fill", () => {
  it("broadcasts a trade on the market channel", async () => {
    await ensureRedis();
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    const sub = redis.duplicate();
    await sub.connect();
    const trade = new Promise<any>(async (resolve) => {
      await sub.subscribe(`trade.${m}`, (raw) => resolve(JSON.parse(raw)));
    });

    await order(A, m, "long", 100, "1", "5");
    await order(B, m, "short", 100, "1", "5");

    const t = await Promise.race([
      trade,
      new Promise((_, r) => setTimeout(() => r(new Error("no trade event")), 5000)),
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

// ---------------------------------------------------------------- poller -> postgres
describe("poller persists to postgres", () => {
  it("writes order + fill rows to the DB", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "1", "5");
    const taker = await order(B, m, "short", 100, "1", "5");

    const fill = await waitFor(
      () => prisma.fill.findFirst({ where: { market_id: m } }),
      (f) => f !== null,
      10_000,
    );
    expect(fill).not.toBeNull();
    expect(Number(fill!.price)).toBe(100);

    const ord = await waitFor(
      () => prisma.order.findUnique({ where: { id: taker.orderId } }),
      (o) => o !== null,
      10_000,
    );
    expect(ord).not.toBeNull();
    expect(ord!.market_id).toBe(m);
  }, 30_000);
});

// ---------------------------------------------------------------- snapshot (phase 10)
describe("snapshot persistence", () => {
  it("writes engine state + last_id to the snapshot file", async () => {
    const A = await makeUser();
    const uid = await getUserId(A);
    await onramp(A, "1234");

    for (let i = 0; i < 25; i++) await balance(A); // cross a snapshot boundary

    const snap = await waitFor(
      readSnapshot,
      (s) => s?.engine?.balances?.[uid]?.available === "1234",
      10_000,
    );
    expect(snap.last_id).toBeTruthy();
    expect(snap.engine.balances[uid].available).toBe("1234");
    expect(snap.engine.balances[uid].locked).toBe("0");
  }, 30_000);
});

// ---------------------------------------------------------------- funding (clamped)
describe("funding rate transfers between longs and shorts (clamped)", () => {
  it("longs pay shorts, capped at +0.75%", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");

    // index (mark) below perp -> positive funding; raw rate 0.111 clamps to 0.0075
    await setMarkPrice(m, "90");
    await waitFor(
      () => positions(A),
      (p) => p[0]?.markPrice === "90",
    );

    const aBefore = Number((await balance(A)).available);
    const bBefore = Number((await balance(B)).available);
    await applyFunding(m);

    const aAfter = await waitFor(
      () => balance(A),
      (b) => Number(b.available) !== aBefore,
    );
    const bAfter = await balance(B);

    // notional = 2*90 = 180, clamped rate 0.0075 -> payment 1.35
    expect(aBefore - Number(aAfter.available)).toBeCloseTo(1.35, 1); // long pays
    expect(Number(bAfter.available) - bBefore).toBeCloseTo(1.35, 1); // short receives
  }, 20_000);
});
