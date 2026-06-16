import { createClient } from "redis";

const client = createClient();
await client.connect();

// fetch price from binance and push it to the queue for that market i guess
const MarkPrice: number = 120;

await client.xAdd("to-engine", "*", {
  task: "priceUpdate",
  markPrice: MarkPrice.toString(),
});
