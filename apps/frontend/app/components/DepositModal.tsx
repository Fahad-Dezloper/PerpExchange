"use client";

import { useEffect, useState } from "react";
import * as api from "../../lib/api";
import { fmtUsd } from "../../lib/mock";

// REAL: deposit -> POST /api/v1/onramp ; withdraw -> POST /api/v1/withdraw
export default function DepositModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [avail, setAvail] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) api.getBalance().then((b) => setAvail(b.available)).catch(() => setAvail(null));
  }, [open, busy]);

  if (!open) return null;

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      if (tab === "deposit") await api.deposit(n);
      else await api.withdraw(n);
      setMsg(`${tab === "deposit" ? "Deposited" : "Withdrew"} ${fmtUsd(n)}`);
      setAmount("");
    } catch (e) {
      setMsg((e as Error).message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-panel p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Wallet</h2>
          <button onClick={onClose} className="text-muted hover:text-fg">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-panel-2 p-1 text-[13px]">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md py-1.5 capitalize transition ${tab === t ? "bg-panel text-fg" : "text-muted hover:text-fg"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Amount (USD)</span>
            <span className="tnum">Available: {avail == null ? "—" : fmtUsd(avail)}</span>
          </div>
          <div className="flex items-center rounded-lg border border-border bg-panel-2 px-3 py-2.5">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="tnum w-full bg-transparent outline-none placeholder:text-subtle"
            />
            <span className="text-xs text-muted">USDC</span>
          </div>
          {tab === "withdraw" && avail != null && (
            <button onClick={() => setAmount(String(avail))} className="mt-1.5 text-[11px] text-accent">Max</button>
          )}
        </div>

        {msg && <p className="mt-3 text-[12px] text-muted">{msg}</p>}

        <button
          onClick={submit}
          disabled={busy || !Number(amount)}
          className="btn-primary mt-4 w-full rounded-lg py-2.5 text-[13px] font-semibold transition disabled:opacity-40"
        >
          {busy ? "Processing…" : tab === "deposit" ? "Deposit" : "Withdraw"}
        </button>
        <p className="mt-3 text-[11px] text-subtle">
          Mock — wire to <code className="text-accent">/api/v1/{tab === "deposit" ? "onramp" : "withdraw"}</code>.
        </p>
      </div>
    </div>
  );
}
