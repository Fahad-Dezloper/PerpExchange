"use client";
import { useEffect, useRef } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

type Listener = (data: any) => void;

const listeners = new Map<string, Set<Listener>>();
const wanted = new Set<string>();
const openHandlers = new Set<() => void>();
const closeHandlers = new Set<() => void>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 500;

function connect() {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("bearer_token")
      : null;
  const sock = new WebSocket(`${WS_URL}${token ? `?token=${token}` : ""}`);
  socket = sock;

  sock.addEventListener("open", () => {
    backoff = 500;
    for (const ch of wanted) {
      sock.send(JSON.stringify({ type: "subscribe", channel: ch }));
    }
    openHandlers.forEach((h) => h());
  });

  sock.addEventListener("message", (raw) => {
    try {
      const { channel, data } = JSON.parse(raw.data);
      listeners.get(channel)?.forEach((l) => l(data));
    } catch {}
  });

  sock.addEventListener("close", () => {
    socket = null;
    closeHandlers.forEach((h) => h());
    scheduleReconnect();
  });
  sock.addEventListener("error", () => sock.close());
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoff = Math.min(backoff * 2, 10000);
    connect();
  }, backoff);
}

function ensureSocket() {
  if (typeof window !== "undefined" && !socket) connect();
}

function send(msg: object) {
  if (socket && socket.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(msg));
}

export function useChannel<T = any>(
  channel: string | null,
  onMsg: (data: T) => void,
) {
  const cb = useRef(onMsg);
  cb.current = onMsg;

  useEffect(() => {
    if (!channel) return;
    ensureSocket();

    const listener: Listener = (data) => cb.current(data);
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
    }
    set.add(listener);

    if (!wanted.has(channel)) {
      wanted.add(channel);
      send({ type: "subscribe", channel });
    }

    return () => {
      const s = listeners.get(channel);
      s?.delete(listener);
      if (s && s.size === 0) {
        listeners.delete(channel);
        wanted.delete(channel);
        send({ type: "unsubscribe", channel });
      }
    };
  }, [channel]);
}

// run fn on every (re)connect — use to refetch REST state after a gap
export function onReconnect(fn: () => void) {
  openHandlers.add(fn);
  return () => openHandlers.delete(fn);
}
export function onDisconnect(fn: () => void) {
  closeHandlers.add(fn);
  return () => closeHandlers.delete(fn);
}
