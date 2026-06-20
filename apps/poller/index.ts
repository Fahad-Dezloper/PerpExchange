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
      break;

    case "order_update":
      await prisma.order.update({
        where: { id: event.orderId },
        data: { filledQty: event.filledQty, status: event.status },
      });
      break;

    case "fill":
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
      break;
  }
}

async function main() {
  await consumer.connect();
  //   await ensureGroup();

  while (true) {
    const res = await consumer.xReadGroup(
      GROUP,
      CONSUMER,
      [{ key: STREAM, id: ">" }],
      { BLOCK: 0, COUNT: 10 },
    );
    if (!res) continue;

    for (const stream of res) {
      for (const entry of stream.messages) {
        try {
          const event = JSON.parse(entry.message.payload) as EngineEvent;
          await handle(event);
          await consumer.xAck(STREAM, GROUP, entry.id);
        } catch (e) {
          console.error("Poller failed:", entry.id, e);
          // no ack -> stays pending -> retried later
        }
      }
    }
  }
}

main();
