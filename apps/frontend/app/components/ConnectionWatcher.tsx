"use client";

import { useEffect, useRef } from "react";
import { onReconnect, onDisconnect } from "@/lib/ws";
import { notify } from "@/lib/toast";

export default function ConnectionWatcher() {
  const wasDown = useRef(false);

  useEffect(() => {
    const off1 = onDisconnect(() => {
      wasDown.current = true;
      notify.warning("Disconnected", "Reconnecting…");
    });
    const off2 = onReconnect(() => {
      if (wasDown.current) {
        notify.success("Reconnected");
        wasDown.current = false;
      }
    });
    return () => {
      off1();
      off2();
    };
  }, []);

  return null;
}
