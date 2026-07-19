import { createClient } from "redis";
import { prisma } from "db";

const producer = createClient();
producer.on("error", (e) => console.error("redis error", e));

const STREAM = "to-engine";
const INTERVAL_MS = 8 * 60 * 60 * 1000; // 8h real; drop to seconds for testing

async function tick() {
  const markets = await prisma.market.findMany();
  for (const m of markets) {
    await producer.xAdd(STREAM, "*", {
      requestId: `funding-${m.id}-${Date.now()}`,
      payload: JSON.stringify({ messageType: "funding_tick", marketId: m.id }),
    });
    console.log(`funding tick -> ${m.slug}`);
  }
}

async function main() {
  await producer.connect();
  console.log("funding ticker running");
  setInterval(tick, INTERVAL_MS);
}

main();
