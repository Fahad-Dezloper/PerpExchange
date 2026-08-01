"use client";

import { useState } from "react";

// Loads a real token logo from an open exchange URL, falls back to
// initials on error. Backpack serves them at /coins/<base>.png.
export default function TokenIcon({
  symbol,
  size = 32,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const base = symbol.split("-")[0].toLowerCase();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`grid place-items-center rounded-full bg-panel-2 font-semibold text-muted ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
      >
        {base.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://backpack.exchange/coins/${base}.png`}
      alt={base}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`rounded-full bg-panel-2 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
