mod orderbook;
mod state;
mod types;
use redis::AsyncCommands;
use redis::streams::{StreamReadOptions, StreamReadReply};
use state::Engine;
use std::collections::HashMap;
use types::ToEngine;
mod snapshot;

const STREAM: &str = "to-engine";
const GROUP: &str = "engine-group";
const CONSUMER: &str = "engine_consumer";
const REPLY_CHANNEL: &str = "engine-replies";
const SNAPSHOT_EVERY: u64 = 20;

#[tokio::main]
async fn main() -> redis::RedisResult<()> {
    let client = redis::Client::open("redis://127.0.0.1:6379")?;

    // dedicated connection for blocking reads
    let mut consumer = client.get_multiplexed_async_connection().await?;
    // seperate connection for replies and events
    let mut publisher = client.get_multiplexed_async_connection().await?;

    // create group ( ignore BUSYGROUP )
    let created: redis::RedisResult<()> = consumer.xgroup_create_mkstream(STREAM, GROUP, "0").await;
    if let Err(e) = created {
        if !e.to_string().contains("BUSYGROUP") {
            return Err(e);
        }
    }

    // recovery snapshot
    let (mut engine, start_id) = match snapshot::load() {
        Some((e, id)) => { println!("recovered snapshot @ {id}"); (e, id) }
        None => { println!("no snapshot, fresh start"); (Engine::new(), "0".to_string()) }
    };
    // resume group right after the snapshot point - replays the gap
    let _: () = redis::cmd("XGROUP").arg("SETID").arg(STREAM).arg(GROUP).arg(&start_id)
        .query_async(&mut consumer).await?;

    println!("engine running, consuming {STREAM}");

    // messages applied since the last snapshot
    let mut applied: u64 = 0;

    let opts = StreamReadOptions::default()
        .group(GROUP, CONSUMER)
        .block(0)
        .count(1);

    loop {
        let reply: StreamReadReply = consumer.xread_options(&[STREAM], &[">"], &opts).await?;
        println!("reply here recieved {reply:?}");

        for key in reply.keys {
            for entry in key.ids {
                let fields: HashMap<String, String> = entry
                    .map
                    .iter()
                    .filter_map(|(k, v)| {
                        redis::from_redis_value::<String>(v)
                            .ok()
                            .map(|s| (k.clone(), s))
                    })
                    .collect();

                let request_id = fields.get("requestId").cloned().unwrap_or_default();
                println!("request id recieved here {request_id:?}");
                let payload = fields.get("payload").cloned().unwrap_or_default();
                println!("payload recieved here {payload:?}");

                let result = match serde_json::from_str::<ToEngine>(&payload) {
                    Ok(msg) => handle(&mut engine, msg),
                    Err(e) => serde_json::json!({"ok": false, "error": e.to_string()}),
                };

                // flush emitted events
                let (db_events, broadcasts) = engine.drain();
                for e in db_events {
                    let _: () = publisher
                        .xadd("to-db", "*", &[("payload", e.to_string())])
                        .await?;
                }
                for (ch, payload) in broadcasts {
                    let _: () = publisher.publish(ch, payload.to_string()).await?;
                }

                

                // reply via pubsub
                let reply_payload = serde_json::json!({
                    "requestId": request_id,
                    "payload": result
                })
                .to_string();

                let _: () = publisher.publish(REPLY_CHANNEL, reply_payload).await?;

                // ack
                let entry_id = entry.id.clone();
                let _: () = consumer.xack(STREAM, GROUP, &[entry.id]).await?;

                // priodic snapshot: state + this id
                applied += 1;
                if applied % SNAPSHOT_EVERY == 0 {
                    snapshot::save(&engine, &entry_id);
                    println!("snapshot saved @ {entry_id}");
                }
            }
        }
    }
}

fn handle(engine: &mut Engine, msg: ToEngine) -> serde_json::Value {
    println!("received: {msg:?}");
    match msg {
        ToEngine::CreateMarket { market_id } => engine.create_market(market_id),
        ToEngine::CreateOrder {
            order_id,
            user_id,
            market_id,
            side,
            price,
            qty,
            leverage,
            ..
        } => {
            let lev = leverage.parse::<u32>().unwrap_or(1);
            engine.create_order(order_id, user_id, market_id, side, price, qty, lev)
        }
        ToEngine::CancelOrder {
            order_id,
            market_id,
            user_id,
        } => engine.cancel_order(&order_id, &user_id, &market_id),
        ToEngine::Onramp { user_id, amount } => engine.onramp(user_id, amount),
        ToEngine::Balance { user_id } => engine.balance(&user_id),
        ToEngine::GetPositions { user_id } => engine.get_positions(&user_id),
        ToEngine::GetDepth { market_id } => engine.get_depth(&market_id),
        ToEngine::Withdraw { user_id, amount } => engine.withdraw(user_id, amount),
        ToEngine::MarkPriceUpdate { market_id, price } => engine.mark_price_update(market_id, price),
        _ => serde_json::json!({"ok": true, "note": "note implemented"}),
    }
}
