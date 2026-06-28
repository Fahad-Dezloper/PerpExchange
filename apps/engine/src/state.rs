use rust_decimal::Decimal;
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Debug, Default)]
pub struct Balance {
    pub available: Decimal,
    pub locked: Decimal,
}

#[derive(Debug, Default)]
pub struct Orderbook {
    pub market_id: String,
    pub last_traded_price: Decimal,
    // bids/asks added when matching lands
}

#[derive(Debug)]
pub struct Position {
    pub side: String, // "Long" / "Short"
    pub qty: Decimal,
    pub avg_entry_price: Decimal,
    pub margin: Decimal,
    pub leverage: u32,
    pub liquidation_price: Decimal,
}

#[derive(Default)]
pub struct Engine {
    pub balances: HashMap<String, Balance>,
    pub orderbooks: HashMap<String, Orderbook>,
    pub positions: HashMap<String, HashMap<String, Position>>,
}

impl Engine {
    pub fn new() -> Self {
        Engine::default()
    }

    pub fn create_market(&mut self, market_id: String) -> serde_json::Value {
        if self.orderbooks.contains_key(&market_id) {
            return serde_json::json!({ "ok": false, "error": "market exists" });
        }

        self.orderbooks.insert(
            market_id.clone(),
            Orderbook {
                market_id: market_id.clone(),
                ..Default::default()
            },
        );
        serde_json::json!({ "ok": true, "marketId": market_id })
    }

    pub fn onramp(&mut self, user_id: String, amount: String) -> serde_json::Value {
        let amt = match Decimal::from_str(&amount) {
            Ok(a) if a > Decimal::ZERO => a,
            _ => return serde_json::json!({"ok": false, "error": "invalid amount"}),
        };
        let bal = self.balances.entry(user_id).or_default();
        bal.available += amt; // real add
        serde_json::json!({
            "ok": true,
            "available": bal.available.to_string(),
            "locked": bal.locked.to_string()
        })
    }

    pub fn balance(&self, user_id: &str) -> serde_json::Value {
        match self.balances.get(user_id) {
            Some(b) => serde_json::json!({
                "ok": true,
                "available": b.available.to_string(),
                "locked": b.locked.to_string()
            }),
            None => serde_json::json!({
                "ok": true,
                "available": "0",
                "locked": "0"
            }),
        }
    }
}
