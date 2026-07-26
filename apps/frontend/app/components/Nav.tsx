"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { fmtUsd, BALANCE } from "../../lib/mock";
import { useAuth } from "../../lib/auth";
import DepositModal from "./DepositModal";

const links = [
  { href: "/", label: "Markets" },
  { href: "/trade/BTC-PERP", label: "Trade" },
  { href: "/portfolio", label: "Portfolio" },
];

export default function Nav() {
  const path = usePathname();
  const { username, logout } = useAuth();
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-7 border-b border-border bg-bg/85 px-5 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-fg text-[13px] font-bold text-bg">◗</div>
          <span className="text-[15px] font-semibold tracking-tight">Backpack</span>
        </Link>

        <nav className="flex items-center gap-6 text-[13px]">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href.split("/").slice(0, 2).join("/"));
            return (
              <Link key={l.href} href={l.href} className={`transition ${active ? "text-fg" : "text-muted hover:text-fg"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="text-[11px] text-muted">Equity</div>
            {/* REAL: GET /api/v1/balance */}
            <div className="tnum text-[13px] font-medium">{fmtUsd(BALANCE.equity)}</div>
          </div>

          {username ? (
            <button onClick={logout} className="text-[13px] text-muted transition hover:text-fg">
              {username} · Sign out
            </button>
          ) : (
            <Link href="/login" className="text-[13px] text-muted transition hover:text-fg">
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
    </>
  );
}
