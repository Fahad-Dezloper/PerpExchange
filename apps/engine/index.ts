import { createClient } from "redis";
import type { ToEngine } from "commons";

// consume data from redis
const consumer = createClient();

// send data via pubsub
const publisher = createClient();

const GROUP = "engine";
const CONSUMER = "engine-1";
const REPLY_CHANNEL = "engine-replies";

async function main() {
  await consumer.connect();
  await publisher.connect();

  try {
    await consumer.xGroupCreate("to-engine", GROUP, "0", { MKSTREAM: true });
  } catch (e: any) {
    if (!String(e?.message).includes("BUSYGROUPS")) throw e;
  }

  while (true) {
    const res = await consumer.xReadGroup(
      GROUP,
      CONSUMER,
      [{ key: "to-engine", id: ">" }],
      { BLOCK: 0, COUNT: 1 },
    );
    if (!res) continue;

    for (const stream of res) {
      for (const entry of stream.messages) {
        const { requestId, payload } = entry.message;
        const message = JSON.parse(payload) as ToEngine;

        // do something — just log for now
        console.log("received:", requestId, message);

        switch (message.messageType) {
          case "create_market":
            console.log("create market called", message);
            break;

          case "onramp":
            console.log("On ramp money brother", message);
            break;

          case "balance":
            console.log("return the users balance", message);
            break;

          case "withdraw":
            console.log("return money back to there wallet", message);
            break;

          case "create_order":
            console.log("create order - create order in the market", message);
            break;

          default:
            console.log("not correct message type");
            break;
        }

        // send back via pubsub
        await publisher.publish(
          REPLY_CHANNEL,
          JSON.stringify({
            requestId,
            payload: { ok: true, messageType: message.messageType },
          }),
        );

        // ack so it isn't redelivered
        await consumer.xAck("to-engine", GROUP, entry.id);
      }
    }
  }
}

main();
