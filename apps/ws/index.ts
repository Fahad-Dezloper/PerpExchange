import { createClient } from "redis";

const redisSub = createClient();
redisSub.on("error", (e) => console.error("redis error", e));
await redisSub.connect();

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";
const RELAY = ["trade.", "depth.", "ticker.", "funding.", "user."];

async function userIdFromToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { id?: string } } | null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

const server = Bun.serve<{ userId: string | null }>({
  port: 3001,

  async fetch(req, server) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const userId = await userIdFromToken(token);
    if (server.upgrade(req, { data: { userId } })) return;
    return new Response("ws only", { status: 400 });
  },

  websocket: {
    open(ws) {
      ws.send(JSON.stringify({ type: "welcome" }));
    },

    message(ws, raw) {
      let msg: { type: string; channel: string };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const { type, channel } = msg;
      if (!channel) return;

      if (channel.startsWith("user.")) {
        const owner = channel.split(".")[1];
        if (!ws.data.userId || ws.data.userId !== owner) {
          ws.send(
            JSON.stringify({ type: "error", message: "unauthorized", channel }),
          );
          return;
        }
      }

      if (type === "subscribe") ws.subscribe(channel);
      if (type === "unsubscribe") ws.unsubscribe(channel);
    },

    close() {},
  },
});

// relay: any engine message on a redis channel → publish to matching ws topic
await redisSub.pSubscribe("*", (message, channel) => {
  if (!RELAY.some((p) => channel.startsWith(p))) return;
  let data: unknown;
  try {
    data = JSON.parse(message);
  } catch {
    data = message;
  }
  server.publish(channel, JSON.stringify({ channel, data }));
});

console.log("ws server on :3001");
