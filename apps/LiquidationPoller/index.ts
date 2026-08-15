import { createClient } from "redis";
import { prisma } from "db";

const producer = createClient();
producer.on("error", (e) => console.error("redis error", e));
const client = createClient();
await client.connect();

const STREAM = "to-engine";
const INTERVAL_MS = 5_000;

// "BTC-PERP" => "BTCUSDT"
function toPair(slug: string) {
  return `${slug.split("-")[0]}-USD`;
}

async function fetchPrice(pair: string): Promise<string> {
  const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  // console.log("res", res);
  if (!res.ok) throw new Error(`coinbase ${pair} -> ${res.status}`);
  const data = (await res.json()) as { data?: { amount?: string } };
  if (!data.data?.amount) throw new Error(`no price for ${pair}`);
  return data.data.amount;
}

async function tick() {
  const markets = await prisma.market.findMany();

  for (const m of markets) {
    const pair = toPair(m.slug);
    try {
      const price = await fetchPrice(pair);

      // keeps liquidations ordered vs trades
      await producer.xAdd(STREAM, "*", {
        requestId: `mark-${m.id}-${Date.now()}`,
        payload: JSON.stringify({
          messageType: "mark_price_update",
          marketId: m.id,
          price,
        }),
      });

      console.log(`${m.slug} (${pair}) -> ${price}`);
    } catch (e) {
      // feed failed -> push nothing, engine keeps last known mark
      // never liquidate on a bad/stale price
      console.error(`skip ${m.slug}:`, (e as Error).message);
    }
  }
}

async function main() {
  await producer.connect();
  console.log("mark price poller running");
  await tick();
  setInterval(tick, INTERVAL_MS);
}

main();
