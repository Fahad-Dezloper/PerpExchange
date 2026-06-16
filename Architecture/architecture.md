# PerpExchange — Architecture

The improved architecture. Three principles drive it:

1. **One durable, ordered, replayable log** is the engine's only input — orders, mark-price updates, and funding ticks all enter through it.
2. **Snapshot + log = recovery.** Snapshots carry the log sequence ID; restart = load snapshot, replay the log from that ID.
3. **Per-market sharding** — one single-threaded orderbook per market; parallelism is *across* markets, never inside one.

```mermaid
flowchart LR
    %% ---------- Clients ----------
    subgraph Clients
        WEB[Website]
        MOB[Mobile App]
    end

    %% ---------- Edge / API ----------
    BE[Backend API<br/>stateless]

    WEB <--> BE
    MOB <--> BE

    %% ---------- Inputs to the log ----------
    MPP[Mark Price Poller<br/>staleness + median]
    ORC[(Binance / Oracle<br/>multi-source)]
    FND[Funding Ticker<br/>scheduled msgs]

    ORC -.-> MPP

    %% ---------- THE LOG (single source of input) ----------
    LOG{{"Command Log<br/>durable · ordered · replayable<br/>(Kafka / Redis Streams)<br/>seq-id per message"}}

    BE -- orders / deposits / withdrawals --> LOG
    MPP -- mark price updates --> LOG
    FND -- funding ticks --> LOG

    %% ---------- Engine ----------
    subgraph EngineCluster["Matching Engine  (per-market shards)"]
        ENG[Active Engine<br/>in-memory state =<br/>orderbooks · balances · positions]
        STBY[Standby Engine<br/>hot, consumes same log]
    end

    LOG --> ENG
    LOG -. lockstep replay .-> STBY
    ENG <-. failover .-> STBY

    %% ---------- Recovery: snapshot + log ----------
    SNAP[("Snapshots → Object Storage / S3<br/>orderbook + seq-id<br/>non-blocking write")]
    ENG -- periodic snapshot --> SNAP
    SNAP -. on restart: load .-> ENG
    LOG  -. replay from seq-id .-> ENG

    %% ---------- Outputs ----------
    EVT[[Event Stream<br/>fills · trades · funding]]
    ENG -- emits events --> EVT

    %% persistence path
    POLL[Poller]
    DB[(Database<br/>history · projections)]
    EVT --> POLL --> DB

    %% realtime path + response correlation
    PUB([PUB/SUB<br/>+ request-id correlation])
    ENG -- events / ack(request-id) --> PUB
    PUB --> BE
    BE -- live updates --> WEB

    %% reconnect resync
    SNAP -. WS resync: snapshot + seq cursor .-> BE

    %% ---------- styling ----------
    classDef log fill:#1f2937,stroke:#9ca3af,stroke-width:2px,color:#fff;
    classDef store fill:#111827,stroke:#6b7280,color:#fff;
    class LOG log
    class SNAP,DB,ORC store
```

## Why each change

| Element | Purpose |
|---|---|
| **Single Command Log** | Orders + price + funding share one ordered stream, so liquidations are deterministically ordered against the trades around them. This log *is* the write-ahead log. |
| **Seq-id on every message** | Lets a snapshot say "I am state as of seq N" so replay resumes exactly, with no double-apply or gap. |
| **Snapshot → S3, non-blocking** | Durable (survives disk loss) and doesn't stall matching while writing. |
| **Standby engine** | Consumes the same log in lockstep → fast failover instead of minutes of cold replay. v1 can skip it; the seam (state = snapshot + log) makes it addable later. |
| **Per-market shards** | Concurrency across markets, single-threaded per book → keeps matching deterministic. This is what "Rust multi-processing" should mean. |
| **Mark Price Poller (median + staleness)** | Multi-source price, halts liquidations on stale feed instead of liquidating on a frozen number. |
| **Funding Ticker as messages** | Funding enters the log as scheduled messages, not a wall-clock timer → survives replay deterministically. |
| **Event Stream → Poller → DB** | Persistence is a downstream projection; DB is never read for trading decisions. |
| **PUB/SUB + request-id** | Real-time fan-out *and* the correlation path that routes a specific engine ack back to the specific client request. |
| **WS resync from snapshot + seq** | Reconnecting clients rebuild from a snapshot + cursor instead of drifting from engine truth. |
| **Withdrawals through the log** | The real-money exit is a first-class command: lock in engine → external transfer → confirm. |
