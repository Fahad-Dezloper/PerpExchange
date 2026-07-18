import { createClient } from "redis";
import { prisma } from "db";
import type { EngineEvent } from "commons";

const consumer = createClient();

const STREAM = "to-db";
const GROUP = "poller";
const CONSUMER = "poller-1";

consumer.on("error", (e) => console.error("redis error", e));

async function ensureGroup() {
  try {
    await consumer.xGroupCreate(STREAM, GROUP, "0", { MKSTREAM: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes("BUSYGROUP")) {
      // GROUP EXITS FINE
    } else {
      throw e;
    }
  }
}

async function handle(event: EngineEvent) {
  switch (event.type) {
    case "order_created":
      try {
        await prisma.order.upsert({
          where: { id: event.orderId },
          update: {},
          create: {
            id: event.orderId,
            userId: event.userId,
            market_id: event.marketId,
            orderType: event.orderType,
            side: event.side,
            price: event.price,
            slippage: 0,
            qty: event.qty,
            initialMargin: "0",
            filledQty: "0",
            status: event.status,
          },
        });
      } catch (e) {
        console.log("error here", e);
      }
      break;

    case "order_update":
      await prisma.order.update({
        where: { id: event.orderId },
        data: { filledQty: event.filledQty, status: event.status },
      });
      break;

    case "fill":
      try {
        await prisma.fill.upsert({
          where: { id: event.fillId },
          update: {},
          create: {
            id: event.fillId,
            market_id: event.marketId,
            price: event.price,
            qty: event.qty,
            maker_order_id: event.makerOrderId,
            taker_order_id: event.takerOrderId,
            maker_id: event.makerId,
            taker_id: event.takerId,
          },
        });
      } catch (e) {
        console.log("error here", e);
      }
      break;
  }
}

// process one entry: apply it, then ack on success. failures stay pending.
async function processEntry(entry: {
  id: string;
  message: { payload: string };
}) {
  try {
    const event = JSON.parse(entry.message.payload) as EngineEvent;
    await handle(event);
    await consumer.xAck(STREAM, GROUP, entry.id);
  } catch (e) {
    console.error("Poller failed:", entry.id, e);
    // no ack -> stays pending -> retried later
  }
}

async function main() {
  await consumer.connect();
  await ensureGroup();

  while (true) {
    const res = await consumer.xReadGroup(
      GROUP,
      CONSUMER,
      [{ key: STREAM, id: ">" }],
      { BLOCK: 0, COUNT: 50 },
    );
    if (!res) continue;

    for (const stream of res) {
      // fills reference order rows (FK), so persist parent orders first,
      // then dependents. each wave runs concurrently to keep up with bursts.
      const parents: typeof stream.messages = [];
      const dependents: typeof stream.messages = [];
      for (const entry of stream.messages) {
        let type: string | undefined;
        try {
          type = (JSON.parse(entry.message.payload) as EngineEvent).type;
        } catch {}
        (type === "order_created" ? parents : dependents).push(entry);
      }

      await Promise.all(parents.map(processEntry));
      await Promise.all(dependents.map(processEntry));
    }
  }
}

main();
