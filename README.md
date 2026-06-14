# PerpExchange

A **perpetual futures exchange** — a crypto-style trading platform for leveraged perpetual contracts ("perps"), built from scratch.

This is a learning-driven project that recreates the core architecture behind real-world exchanges: an in-memory matching engine, a queue-based command pipeline, and a thin API layer in front. The goal is to understand and implement how a high-performance trading system actually works end to end — order matching, leverage, positions, liquidations, and funding rates.

## What it does

- **Trade perpetual futures** with leverage (long or short positions).
- **Live orderbooks** kept in memory for fast matching.
- **Margin & positions** tracking with liquidation prices, stop-loss, and take-profit.
- **Funding rate** mechanism that periodically settles the gap between mark price and traded price (longs pay shorts, or vice versa).
- **Liquidations** are left open for external bots to trigger and earn from — the same incentive model used by decentralized perp exchanges.

## How it's structured

A [Turborepo](https://turborepo.dev/) monorepo running on [Bun](https://bun.sh/) and TypeScript.

```
Client → Backend (API) → Redis queue → Engine (matching) → Redis queue → Backend → Client
```

### Apps

- **`apps/backend`** — REST API. Handles auth, market creation, deposits, and order requests. Owns the database.
- **`apps/engine`** — The in-memory matching engine. Holds all live state (orderbooks, balances, positions) and processes commands off a queue.
- **`apps/test`** — Integration tests that exercise the API end to end.

### Packages

- **`packages/db`** — Database schema and client (Prisma + Postgres).
- **`packages/commons`** — Shared types and the message contract between backend and engine.
- **`packages/ui`** — Shared UI components.
- **`packages/eslint-config`, `packages/typescript-config`** — Shared tooling config.

## How it works

The backend and engine are decoupled through a **Redis queue**. The backend pushes a command (place order, deposit, create market) onto the queue, the engine processes it against its in-memory state, and sends the result back on a return queue. This keeps the engine fast and single-purpose while the API layer stays stateless.

## Roadmap

**v1 — Foundations**

- In-memory engine, leverage, single system, liquidations

**v2 — Real exchange mechanics**

- Funding rate
- Cross margin vs isolated margin
- Insurance fund and auto-deleveraging (ADL)
- Trading fees
- Better in-memory data structures

**v3 — Performance**

- Multithreaded orderbooks

## Getting started

```sh
bun install
bun run dev
```

> Requires Redis and Postgres running locally.
