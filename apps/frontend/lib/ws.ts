"use client";

// ─────────────────────────────────────────────────────────────
// WEBSOCKET SEAM. useChannel(channel, onMsg) subscribes to a
// market-data channel. MOCK mode emits fake data on a timer.
// Real mode: one shared socket to the ws server (:3001), send
// { type:"subscribe", channel }, dispatch incoming by channel.
//
// Channels: trade.<sym> | depth.<sym> | ticker.<sym> | funding.<sym>
//           position.<userId> | balance.<userId>   (private)
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { USE_MOCK } from "./api";
import { makeOrderBook, makeTrades } from "./mock";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

export function useChannel<T = any>(channel: string | null, onMsg: (data: T) => void) {
  const cb = useRef(onMsg);
  cb.current = onMsg;

  useEffect(() => {
    if (!channel) return;

    if (USE_MOCK) {
      const [kind, sym] = channel.split(".");
      const mid = 100 + (sym?.charCodeAt(0) ?? 0);
      const id = setInterval(() => {
        if (kind === "trade") {
          cb.current({ price: +(mid + (Math.random() - 0.5) * 2).toFixed(2), qty: +(Math.random() * 2).toFixed(3), side: Math.random() > 0.5 ? "buy" : "sell" } as T);
        } else if (kind === "depth") {
          cb.current(makeOrderBook(mid) as T);
        } else if (kind === "ticker") {
          cb.current({ markPrice: +(mid + (Math.random() - 0.5)).toFixed(2) } as T);
        }
      }, 1200);
      return () => clearInterval(id);
    }

    // ── REAL ──────────────────────────────────────────────────
    const sock = getSocket();
    const handler = (raw: MessageEvent) => {
      try {
        const { channel: ch, data } = JSON.parse(raw.data);
        if (ch === channel || raw.data.includes(channel)) cb.current(data ?? JSON.parse(raw.data));
      } catch {}
    };
    sock.addEventListener("message", handler);
    sock.readyState === WebSocket.OPEN
      ? sock.send(JSON.stringify({ type: "subscribe", channel }))
      : sock.addEventListener("open", () => sock.send(JSON.stringify({ type: "subscribe", channel })), { once: true });

    return () => {
      sock.removeEventListener("message", handler);
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "unsubscribe", channel }));
    };
  }, [channel]);
}

// single shared socket (real mode)
let socket: WebSocket | null = null;
function getSocket(): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  const token = typeof window !== "undefined" ? window.localStorage.getItem("bearer_token") : null;
  socket = new WebSocket(`${WS_URL}${token ? `?token=${token}` : ""}`);
  return socket;
}
