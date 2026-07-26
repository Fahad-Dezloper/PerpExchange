import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import { createClient } from "redis";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { BACKEND } from "./config";

const ADMIN = process.env.ADMIN_SECRET!;
const rnd = () => Math.random().toString(36).slice(2);
const authH = (t: string) => ({ headers: { token: t } });
const ENGINE_DIR = join(import.meta.dir, "../engine");

// ---------- backend helpers ----------
async function makeUser() {
  const username = "u_" + rnd();
  await axios.post(`${BACKEND}/api/v1/signup`, { username, password: "1" });
  const r = await axios.post(`${BACKEND}/api/v1/signin`, {
    username,
    password: "1",
  });
  return r.data.token as string;
}
const onramp = (t: string, amount: string) =>
  axios.post(`${BACKEND}/api/v1/onramp`, { amount }, authH(t));
const balance = async (t: string) =>
  (await axios.get(`${BACKEND}/api/v1/balance`, authH(t))).data;
async function createMarket() {
  const r = await axios.post(
    `${BACKEND}/api/v1/market`,
    { symbol: "T-" + rnd(), imageUrl: "x" },
    { headers: { token: ADMIN } },
  );
  return r.data.id as string;
}
const order = (
  t: string,
  marketId: string,
  side: string,
  price: number,
  qty: string,
  leverage: string,
) =>
  axios.post(
    `${BACKEND}/api/v1/order`,
    { marketId, side, type: "limit", price, qty, leverage, slippage: "0" },
    authH(t),
  );
const positions = async (t: string) =>
  (await axios.get(`${BACKEND}/api/v1/positions`, authH(t))).data
    .positions as any[];

async function waitFor<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  ms = 8000,
): Promise<T> {
  const end = Date.now() + ms;
  let last: T;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (ok(last)) return last;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return last!;
}

// ---------- engine process control ----------
let engineProc: ReturnType<typeof Bun.spawn> | null = null;

function spawnEngine(): Promise<void> {
  const proc = Bun.spawn(["cargo", "run"], {
    cwd: ENGINE_DIR,
    stdout: "pipe",
    stderr: "inherit",
    env: { ...process.env },
  });
  engineProc = proc;

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));

  // drain stdout forever (or the engine blocks on a full pipe); resolve on marker
  (async () => {
    const reader = proc.stdout.getReader();
    const dec = new TextDecoder();
    let buf = "",
      done = false;
    while (true) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += dec.decode(value);
      if (!done && buf.includes("resuming at")) {
        done = true;
        resolveReady();
      }
      if (buf.length > 8000) buf = buf.slice(-2000);
    }
  })();

  return ready;
}

async function killEngine() {
  if (engineProc) {
    engineProc.kill("SIGKILL");
    await engineProc.exited;
    engineProc = null;
  }
}

// ---------- suite ----------
describe("engine recovers state after a crash", () => {
  beforeAll(async () => {
    // clean slate: empty stream + no old snapshot -> forces replay-from-scratch
    const redis = createClient();
    await redis.connect();
    await redis.flushAll();
    await redis.quit();
    await rm(join(ENGINE_DIR, "snapshot.json"), { force: true });
    await rm(join(ENGINE_DIR, "snapshot.json.tmp"), { force: true });

    await spawnEngine(); // first boot
  });

  afterAll(async () => {
    await killEngine();
  });

  it("rebuilds positions and balances from snapshot + replay", async () => {
    const A = await makeUser();
    const B = await makeUser();
    const m = await createMarket();
    await onramp(A, "1000");
    await onramp(B, "1000");

    // A long 2@100 (rests), B short 2@100 (fills) -> A Long 2
    await order(A, m, "long", 100, "2", "5");
    await order(B, m, "short", 100, "2", "5");

    const before = await positions(A);
    expect(before[0].side).toBe("Long");
    expect(Number(before[0].qty)).toBe(2);
    const balBefore = await balance(A);
    expect(Number(balBefore.locked)).toBe(40);

    // 💥 crash
    await killEngine();

    // 🔁 restart -> loads snapshot / replays the log
    await spawnEngine();

    // state must be identical, rebuilt from memory (not the DB)
    const after = await waitFor(
      () => positions(A),
      (p) => p.length > 0,
      10_000,
    );
    expect(after[0].side).toBe("Long");
    expect(Number(after[0].qty)).toBe(2);
    expect(Number(after[0].entryPrice)).toBe(100);

    const balAfter = await balance(A);
    expect(Number(balAfter.locked)).toBe(40);
    expect(Number(balAfter.available)).toBe(960);
  }, 180_000); // cargo build + two boots
});
