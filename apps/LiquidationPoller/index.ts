import { createClient } from "redis";
import { prisma } from "db";

const producer = createClient();
producer.on("error", (e) => console.error("redis error", e));
const client = createClient();
await client.connect();

const STREAM = "to-engine";
const INTERVAL_MS = 5_000;

// "BTC-PERP" => "BTCUSDT"
function toBinanceSymbol(slug: string) {
  const base = slug.split("-")[0];
  return `${base}USDT`;
}

async function fetchPrice(symbol: string): Promise<string> {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
  );
  if (!res.ok) throw new Error(`binance ${symbol} -> ${res.status}`);
  const data = (await res.json()) as { price: string };
  if (!data.price) throw new Error(`no price for ${symbol}`);
  return data.price;
}

async function tick() {
  const markets = await prisma.market.findMany();

  for (const m of markets) {
    const symbol = toBinanceSymbol(m.slug);
    try {
      const price = await fetchPrice(symbol);

      // keeps liquidations ordered vs trades
      await producer.xAdd(STREAM, "*", {
        requestId: `mark-${m.id}-${Date.now()}`,
        payload: JSON.stringify({
          messageType: "mark_price_update",
          marketId: m.id,
          price,
        }),
      });

      console.log(`${m.slug} (${symbol}) -> ${price}`);
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
