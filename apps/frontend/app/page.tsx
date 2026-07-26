import Link from "next/link";
import { MARKETS, fmtUsd, priceDp } from "../lib/mock";

export default function MarketsPage() {
  const totalVol = MARKETS.reduce((s, m) => s + m.volume24h, 0);
  const totalOi = MARKETS.reduce((s, m) => s + m.openInterest, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* hero */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perpetual Markets</h1>
          <p className="mt-1 text-sm text-muted">Trade with up to 50× leverage. Deep liquidity, low fees.</p>
        </div>
        <div className="flex gap-6">
          <Stat label="24h Volume" value={fmtUsd(totalVol, 0)} />
          <Stat label="Open Interest" value={fmtUsd(totalOi, 0)} />
          <Stat label="Markets" value={String(MARKETS.length)} />
        </div>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Market</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">24h</th>
              <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">24h Volume</th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Open Interest</th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Funding</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {MARKETS.map((m) => {
              const up = m.change24h >= 0;
              return (
                <tr key={m.symbol} className="group border-b border-border/60 transition hover:bg-panel-2">
                  <td className="px-4 py-3.5">
                    <Link href={`/trade/${m.symbol}`} className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-panel-2 text-xs font-semibold text-muted">
                        {m.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium">{m.symbol}</div>
                        <div className="text-xs text-muted">{m.name}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="tnum px-4 py-3.5 text-right">{fmtUsd(m.price, priceDp(m.price))}</td>
                  <td className={`tnum px-4 py-3.5 text-right ${up ? "text-long" : "text-short"}`}>
                    {up ? "+" : ""}{m.change24h.toFixed(2)}%
                  </td>
                  <td className="tnum hidden px-4 py-3.5 text-right text-muted sm:table-cell">{fmtUsd(m.volume24h, 0)}</td>
                  <td className="tnum hidden px-4 py-3.5 text-right text-muted md:table-cell">{fmtUsd(m.openInterest, 0)}</td>
                  <td className={`tnum hidden px-4 py-3.5 text-right md:table-cell ${m.funding >= 0 ? "text-long" : "text-short"}`}>
                    {(m.funding * 100).toFixed(4)}%
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Link
                      href={`/trade/${m.symbol}`}
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-fg"
                    >
                      Trade
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Mock data — wire to <code className="text-accent">GET /api/v1/markets</code> + ws <code className="text-accent">ticker.&lt;symbol&gt;</code>.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
