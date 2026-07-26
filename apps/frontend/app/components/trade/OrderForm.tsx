"use client";

import { useState } from "react";
import { BALANCE, fmtUsd, fmtNum } from "../../../lib/mock";

// REAL:
//   place  -> POST /api/v1/order   { marketId, side, type, price, qty, leverage, slippage }
//   cancel -> POST /api/v1/order/cancel
//   balance-> GET  /api/v1/balance
export default function OrderForm({
  symbol,
  price,
  dp,
  maxLeverage,
}: {
  symbol: string;
  price: number;
  dp: number;
  maxLeverage: number;
}) {
  const base = symbol.split("-")[0];
  const [side, setSide] = useState<"long" | "short">("long");
  const [type, setType] = useState<"limit" | "market" | "conditional">("limit");
  const [limitPrice, setLimitPrice] = useState<string>(price.toFixed(dp));
  const [qty, setQty] = useState<string>("");
  const [leverage, setLeverage] = useState(10);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);

  const px = type === "limit" ? Number(limitPrice) || price : price;
  const q = Number(qty) || 0;
  const notional = px * q;
  const margin = notional / leverage;
  const fee = notional * 0.0005;
  const canSubmit = q > 0 && margin <= BALANCE.available;

  return (
    <div className="flex h-full flex-col p-3">
      {/* side toggle */}
      <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-lg border border-border">
        <button
          onClick={() => setSide("long")}
          className={`py-2.5 text-[13px] font-semibold transition ${
            side === "long" ? "bg-long/15 text-long" : "text-muted hover:text-fg"
          }`}
        >
          Buy / Long
        </button>
        <button
          onClick={() => setSide("short")}
          className={`py-2.5 text-[13px] font-semibold transition ${
            side === "short" ? "bg-short/15 text-short" : "text-muted hover:text-fg"
          }`}
        >
          Sell / Short
        </button>
      </div>

      {/* order type */}
      <div className="mt-3 flex gap-4 border-b border-border text-[13px]">
        {(["limit", "market", "conditional"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`-mb-px border-b-2 pb-2 capitalize transition ${
              type === t ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>Available</span>
        <span className="tnum text-fg">{fmtUsd(BALANCE.available)}</span>
      </div>

      {/* price (limit) */}
      {type !== "market" && (
        <Field label="Price (USD)">
          <input
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            inputMode="decimal"
            className="tnum w-full bg-transparent text-right outline-none"
          />
        </Field>
      )}

      {/* size */}
      <Field label={`Size (${base})`}>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          className="tnum w-full bg-transparent text-right outline-none placeholder:text-subtle"
        />
      </Field>

      {/* total (readonly, derived) */}
      <Field label="Total (USD)">
        <span className="tnum w-full text-right text-muted">{notional > 0 ? fmtNum(notional, 2) : "0.00"}</span>
      </Field>

      {/* size % slider row */}
      <div className="mt-2 grid grid-cols-4 gap-1">
        {[25, 50, 75, 100].map((p) => (
          <button
            key={p}
            onClick={() => setQty(((BALANCE.available * leverage * (p / 100)) / px).toFixed(3))}
            className="rounded-md border border-border py-1 text-[11px] text-muted hover:text-fg"
          >
            {p}%
          </button>
        ))}
      </div>

      {/* leverage */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="text-muted">Leverage</span>
          <span className="tnum font-medium">{leverage}×</span>
        </div>
        <input
          type="range"
          min={1}
          max={maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full accent-[color:var(--color-long)]"
        />
      </div>

      {/* toggles */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
        <Check label="Reduce Only" on={reduceOnly} set={setReduceOnly} />
        <Check label="Post Only" on={postOnly} set={setPostOnly} />
        <Check label="TP/SL" on={tpsl} set={setTpsl} />
      </div>

      {/* summary */}
      <div className="mt-4 space-y-2 border-t border-border pt-3 text-[12px]">
        <Row k="Order Value" v={fmtUsd(notional)} />
        <Row k="Margin Required" v={fmtUsd(margin)} warn={margin > BALANCE.available} />
        <Row k="Est. Fee" v={fmtUsd(fee)} />
        <Row
          k="Est. Liquidation Price"
          v={q > 0 ? fmtUsd(side === "long" ? px * (1 - 1 / leverage + 0.005) : px * (1 + 1 / leverage - 0.005)) : "—"}
        />
      </div>

      {/* submit */}
      <button
        disabled={!canSubmit}
        className={`mt-3 rounded-lg py-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
          side === "long" ? "bg-long text-black" : "bg-short text-white"
        }`}
      >
        {q <= 0 ? `${side === "long" ? "Buy" : "Sell"} ${base}` : margin > BALANCE.available ? "Insufficient balance" : `${side === "long" ? "Buy / Long" : "Sell / Short"} ${base}`}
      </button>

      <p className="mt-3 text-[11px] text-subtle">
        Mock — wire submit to <code className="text-accent">POST /api/v1/order</code>.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-2.5 block">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2.5">
        <span className="whitespace-nowrap text-[11px] text-muted">{label}</span>
        {children}
      </div>
    </label>
  );
}

function Check({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex items-center gap-1.5 text-muted hover:text-fg">
      <span className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border ${on ? "border-long bg-long text-black" : "border-border"}`}>
        {on && <span className="text-[9px] leading-none">✓</span>}
      </span>
      {label}
    </button>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className={`tnum ${warn ? "text-short" : "text-fg"}`}>{v}</span>
    </div>
  );
}
