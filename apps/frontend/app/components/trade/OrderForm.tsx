"use client";

import { useState } from "react";
import { ArrowUpDown, ChevronDown, Settings2 } from "lucide-react";
import { fmtUsd } from "../../../lib/mock";
import Button from "../ui/Button";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth";
import { useMarkets } from "@/lib/market";
import { useBalance } from "@/lib/balance";
import * as api from "@/lib/api";

const QUOTE = "USDT";

// REAL: place -> POST /api/v1/order { marketId, side, type, price, qty, leverage, slippage }
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
  const { bySymbol } = useMarkets();
  const { refresh, balance } = useBalance();
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const base = symbol.split("-")[0];

  const [side, setSide] = useState<"long" | "short">("long");
  const [type, setType] = useState<"market" | "limit">("market");
  const [typeOpen, setTypeOpen] = useState(false);
  const [limitPrice, setLimitPrice] = useState(price.toFixed(dp));
  const [mode, setMode] = useState<"collateral" | "size">("collateral");
  const [val, setVal] = useState("");
  const [leverage, setLeverage] = useState(10);
  const [slippage] = useState("0.5");
  const router = useRouter();
  const { token } = useAuth();

  const px = type === "limit" ? Number(limitPrice) || price : price;
  const n = Number(val) || 0;

  // collateral (USDT margin) <-> estimated size (base)
  let collateral = 0;
  let size = 0;
  if (mode === "collateral") {
    collateral = n;
    size = px > 0 ? (collateral * leverage) / px : 0;
  } else {
    size = n;
    collateral = (size * px) / leverage;
  }
  const notional = collateral * leverage;
  const fee = notional * 0.0005;
  const liq =
    side === "long"
      ? px * (1 - 1 / leverage + 0.005)
      : px * (1 + 1 / leverage - 0.005);
  const canSubmit = collateral > 0 && collateral <= balance.available;

  async function submit() {
    const marketId = bySymbol[symbol]?.id;
    if (!marketId) {
      setMsg("Unknown Market");
      return;
    }
    if (size <= 0) return;

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await api.placeOrder({
        marketId,
        side,
        type,
        price: px,
        qty: size.toString(),
        leverage: String(leverage),
        slippage: String(slippage),
      });
      console.log("responsse", res);
      setMsg(`Order ${res.status}`);
      setVal("");
      await refresh();
    } catch (e) {
      setMsg((e as Error).message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  const swap = () => {
    if (mode === "collateral") {
      setVal(size ? size.toFixed(6) : "");
      setMode("size");
    } else {
      setVal(collateral ? collateral.toFixed(2) : "");
      setMode("collateral");
    }
  };

  const marks = [1, 10, 20, 50, 100].filter((m) => m <= maxLeverage);
  if (marks[marks.length - 1] !== maxLeverage) marks.push(maxLeverage);

  return (
    <div className="flex h-full flex-col gap-3 rounded-sm border border-border bg-panel p-3">
      {/* side */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-panel-2 p-1">
        {(["long", "short"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`rounded-lg py-2.5 text-[14px] font-semibold capitalize transition ${
              side === s
                ? "bg-panel text-fg shadow-sm"
                : "text-muted hover:text-fg"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {/* market price + order type */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-panel-2 px-3 py-2.5">
          <div className="text-[12px] text-muted">
            {type === "market" ? "Market price" : "Price"}
          </div>
          {type === "market" ? (
            <div className="tnum text-[15px] font-medium">
              {fmtUsd(price, dp)}
            </div>
          ) : (
            <input
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              inputMode="decimal"
              className="tnum w-full bg-transparent text-[15px] font-medium outline-none"
            />
          )}
        </div>

        <div className="relative rounded-xl bg-panel-2 px-3 py-2.5">
          <button
            onClick={() => setTypeOpen((o) => !o)}
            className="flex w-full items-center justify-between"
          >
            <span className="text-left">
              <span className="block text-[12px] text-muted">Order type</span>
              <span className="block text-[15px] font-medium capitalize">
                {type}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted transition ${typeOpen ? "rotate-180" : ""}`}
            />
          </button>
          {typeOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setTypeOpen(false)}
              />
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-panel p-1 shadow-xl">
                {(["market", "limit"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setType(t);
                      setTypeOpen(false);
                    }}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-sm capitalize hover:bg-panel-2 ${
                      type === t ? "text-fg" : "text-muted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {/* collateral <-> estimated size */}
      <div className="relative rounded-xl bg-panel-2">
        <AmountRow
          label="Collateral"
          hint={`Avail ${fmtUsd(balance.available)}`}
          unit={QUOTE}
          value={
            mode === "collateral"
              ? val
              : collateral
                ? collateral.toFixed(2)
                : ""
          }
          onChange={(v) => {
            setMode("collateral");
            setVal(v);
          }}
        />
        <div className="mx-4 border-t border-border" />
        <AmountRow
          label="Estimated size"
          unit={base}
          value={mode === "size" ? val : size ? size.toFixed(8) : ""}
          onChange={(v) => {
            setMode("size");
            setVal(v);
          }}
        />
        <button
          onClick={swap}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-panel p-1.5 text-muted transition hover:text-fg"
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
      </div>
      {/* leverage */}
      <div className="rounded-xl bg-panel-2 px-4 py-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted">Leverage</span>
          <span className="tnum font-semibold">{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mt-2 w-full accent-[color:var(--color-fg)]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          {marks.map((m) => (
            <button
              key={m}
              onClick={() => setLeverage(m)}
              className="tnum hover:text-fg"
            >
              {m}x
            </button>
          ))}
        </div>
      </div>
      {/* summary */}
      <div className="space-y-1.5 px-1 text-[12px]">
        <SummaryRow k="Order Value" v={fmtUsd(notional)} />
        <SummaryRow k="Fee (0.05%)" v={fmtUsd(fee)} />
        <SummaryRow
          k="Est. Liquidation Price"
          v={collateral > 0 ? fmtUsd(liq) : "—"}
        />
      </div>
      {/* slippage */}
      <div className="flex items-center justify-between px-1 text-[13px]">
        <span className="text-muted">Slippage</span>
        <div className="flex items-center gap-2">
          <span className="tnum">{slippage}%</span>
          <button className="text-muted hover:text-fg">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {!token ? (
        <Button
          variant="primary"
          size="lg"
          className="mt-auto w-full py-3.5"
          onClick={() => router.push("/login")}
        >
          Log in to trade
        </Button>
      ) : (
        <Button
          variant="primary"
          size="lg"
          disabled={!canSubmit || submitting}
          className="mt-auto w-full py-3.5"
          onClick={submit}
        >
          {submitting
            ? "Placing..."
            : collateral <= 0
              ? "Enter amount"
              : collateral > balance.available
                ? "Insufficient balance"
                : `Open ${side === "long" ? "Long" : "Short"}`}
        </Button>
      )}
      {msg && (
        <p className="mt-2 text-center text-[12px] text-muted">{msg}</p>
      )}{" "}
    </div>
  );
}

function AmountRow({
  label,
  hint,
  unit,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        {hint && <span className="tnum text-[11px] text-subtle">{hint}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          className="tnum w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-subtle"
        />
        <span className="text-[15px] text-muted">{unit}</span>
      </div>
    </div>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className="tnum text-fg">{v}</span>
    </div>
  );
}
