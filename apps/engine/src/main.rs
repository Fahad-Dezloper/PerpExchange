mod types;
use redis::AsyncCommands;
use redis::streams::{StreamReadOptions, StreamReadReply};
use std::collections::HashMap;
use types::ToEngine;

const STREAM: &str = "engine_stream";
const GROUP: &str = "engine_group";
const CONSUMER: &str = "engine_consumer";
const REPLY_CHANNEL: &str = "engine_replies";

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

    println!("engine running, consuming {STREAM}");

    let opts = StreamReadOptions::default()
        .group(GROUP, CONSUMER)
        .block(0)
        .count(1);

    loop {
        let reply: StreamReadReply = consumer.xread_options(&[STREAM], &[">"], &opts).await?;

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
                let payload = fields.get("payload").cloned().unwrap_or_default();

                let result = match serde_json::from_str::<ToEngine>(&payload) {
                    Ok(msg) => handle(msg),
                    Err(e) => serde_json::json!({"ok": false, "error": e.to_string()}),
                };

                // reply via pubsub
                let reply_payload = serde_json::json!({
                    "requestId": request_id,
                    "payload": result
                })
                .to_string();

                let _: () = publisher.publish(REPLY_CHANNEL, reply_payload).await?;

                // ack
                let _: () = consumer.xack(STREAM, GROUP, &[entry.id]).await?;
            }
        }
    }
}

fn handle(msg: ToEngine) -> serde_json::Value {
    println!("received: {msg:?}");
    match msg {
        ToEngine::CreateMarket { market_id } => {
            serde_json::json!({"ok": true, "marketId": market_id})
        }
        ToEngine::Onramp { user_id, amount } => {
            serde_json::json!({"ok": true, "userId": user_id, "amount": amount})
        }
        _ => serde_json::json!({"ok": true}),
    }
}
