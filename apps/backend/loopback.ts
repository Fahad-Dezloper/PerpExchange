/// backend to queue to engine to pubsub to backend

import type { ToEngine } from "commons";
import { createClient } from "redis";

const producer = createClient();

const subscriber = createClient();

const REPLY_CHANNEL = "engine-replies";

const pending = new Map<
  string,
  {
    resolve: (v: any) => void;
    reject: (e?: any) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

let counter = 0;
const newRequesId = () => `${process.pid}-${Date.now()} - ${counter++}`;

export async function initQueue() {
  await producer.connect();
  await subscriber.connect();

  await subscriber.subscribe(REPLY_CHANNEL, (raw) => {
    const { requestId, payload } = JSON.parse(raw);
    const waiter = pending.get(requestId);
    if (!waiter) {
      console.log("reply with no waiter (late or unknown):", requestId);
      return;
    }
    clearTimeout(waiter.timer);
    pending.delete(requestId);
    waiter.resolve(payload);
  });
}

export function loopback(message: ToEngine, timeoutMs = 10_000): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const requestId = newRequesId();

    const timer = setTimeout(() => {
      if (pending.delete(requestId)) reject(new Error("engine timeout"));
    }, timeoutMs);

    pending.set(requestId, { resolve, reject, timer });

    try {
      await producer.xAdd("to-engine", "*", {
        requestId,
        payload: JSON.stringify(message),
      });
    } catch (e) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(e);
    }
  });
}

initQueue();
