"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { fmtUsd } from "../../lib/mock";

import { useAuth } from "../../lib/auth";
import DepositModal from "./DepositModal";
import { useBalance } from "@/lib/balance";
import { notify } from "@/lib/toast";

export default function Nav() {
  const path = usePathname();
  const { username, logout } = useAuth();
  const { balance } = useBalance();
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <div className="w-full sticky top-2 flex justify-center">
      <header className="z-30 max-w-3xl rounded-2xl min-w-3xl flex h-14 items-center gap-7 border-b border-border bg-secondary px-5 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-lg font-black tracking-tight">ORB</span>
        </Link>

        <div className="ml-auto flex items-center gap-4">
          {username ? (
            <button
              onClick={() => {
                logout();
                notify.info("Signed out");
              }}
              className="text-[13px] text-muted transition hover:text-fg"
            >
              <div className="tnum text-base font-medium">
                equity - {fmtUsd(balance.equity)} | available -{" "}
                {fmtUsd(balance.available)}
              </div>
              · {username} · Sign out
            </button>
          ) : (
            <Link
              href="/login"
              className="text-[13px] text-muted transition hover:text-fg"
            >
              Sign in
            </Link>
          )}

          <button
            onClick={() => setWalletOpen(true)}
            className="rounded-lg bg-fg px-3.5 py-1.5 text-[13px] font-semibold text-bg transition hover:opacity-90"
          >
            Deposit
          </button>
        </div>
      </header>
      <DepositModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
