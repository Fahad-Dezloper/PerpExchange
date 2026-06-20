import { createClient } from "redis";
import jwt, { type JwtPayload } from "jsonwebtoken";

const redisSub = createClient();
redisSub.on("error", (e) => console.error("redis error", e));
await redisSub.connect();

const server = Bun.serve<{ userId: string | null }>({
  port: 3001,

  fetch(req, server) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    let userId: string | null = null;
    if (token) {
      try {
        userId: jwt.verify(token, process.env.JWT_SECRET!);
      } catch {
        userId = null;
      }
    }
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

      if (channel.startsWith("balance.") || channel.startsWith("position.")) {
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
  server.publish(channel, message);
});

console.log("ws server on :3001");
