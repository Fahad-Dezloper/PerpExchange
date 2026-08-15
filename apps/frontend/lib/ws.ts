"use client";
import { useEffect, useRef } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

export function useChannel<T = any>(
  channel: string | null,
  onMsg: (data: T) => void,
) {
  const cb = useRef(onMsg);
  cb.current = onMsg;

  useEffect(() => {
    if (!channel) return;
    const sock = getSocket();
    const handler = (raw: MessageEvent) => {
      try {
        const { channel: ch, data } = JSON.parse(raw.data);
        if (ch === channel || raw.data.includes(channel))
          cb.current(data ?? JSON.parse(raw.data));
        console.log("data from ws", data);
      } catch {}
    };
    sock.addEventListener("message", handler);
    sock.readyState === WebSocket.OPEN
      ? sock.send(JSON.stringify({ type: "subscribe", channel }))
      : sock.addEventListener(
          "open",
          () => sock.send(JSON.stringify({ type: "subscribe", channel })),
          { once: true },
        );

    return () => {
      sock.removeEventListener("message", handler);
      if (sock.readyState === WebSocket.OPEN)
        sock.send(JSON.stringify({ type: "unsubscribe", channel }));
    };
  }, [channel]);
}

// single shared socket (real mode)
let socket: WebSocket | null = null;
function getSocket(): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("bearer_token")
      : null;
  socket = new WebSocket(`${WS_URL}${token ? `?token=${token}` : ""}`);
  return socket;
}
