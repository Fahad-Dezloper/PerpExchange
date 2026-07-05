use crate::orderbook::Orderbook;
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Debug, Default)]
pub struct Balance {
    pub available: Decimal,
    pub locked: Decimal,
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

        self.orderbooks
            .insert(market_id.clone(), Orderbook::new(market_id.clone()));
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

    pub fn create_order(
        &mut self,
        order_id: String,
        user_id: String,
        market_id: String,
        side: String, // "long" | "short"
        price: f64,
        qty: String,
    ) -> serde_json::Value {
        let book = match self.orderbooks.get_mut(&market_id) {
            Some(b) => b,
            None => return serde_json::json!({ "ok": false, "error": "no market" }),
        };
        let qty = match Decimal::from_str(&qty) {
            Ok(q) if q > Decimal::ZERO => q,
            _ => return serde_json::json!({ "ok": false, "error": "bad qty" }),
        };
        let price = match Decimal::from_f64(price) {
            Some(p) => p,
            None => return serde_json::json!({ "ok": false, "error": "bad price" }),
        };
        let is_buy = side == "long";
        let (fills, remaining) = book.add_limit(order_id.clone(), user_id, is_buy, price, qty);

        let filled = qty - remaining;
        let status = if remaining == Decimal::ZERO {
            "Filled"
        } else if filled > Decimal::ZERO {
            "partiallyFilled"
        } else {
            "Open"
        };

        let fills_json: Vec<_> = fills
            .iter()
            .map(|f| {
                serde_json::json!({
                    "price": f.price.to_string(),
                    "qty": f.qty.to_string(),
                    "makerOrderId": f.maker_order_id,
                    "takerOrderId": f.taker_order_id,
                })
            })
            .collect();

        serde_json::json!({
            "ok": true,
            "orderId": order_id,
            "status": status,
            "filledQty": filled.to_string(),
            "fills": fills_json,
        })
    }

    pub fn cancel_order(
        &mut self,
        order_id: &str,
        user_id: &str,
        market_id: &str,
    ) -> serde_json::Value {
        println!("market ids: {:?}", self.orderbooks.keys());

        if let Some(b) = self.orderbooks.get_mut(market_id) {
            if b.cancel(order_id, user_id) {
                serde_json::json!({ "ok": true, "status": "Cancelled" })
            } else {
                serde_json::json!({ "ok": false, "error": "order not found" })
            }
        } else {
            serde_json::json!({ "ok": false, "error": "no market" })
        }
    }

    pub fn get_depth(&self, market_id: &str) -> serde_json::Value {
        match self.orderbooks.get(market_id) {
            Some(b) => {
                let (bids, asks) = b.depth();
                serde_json::json!({ "ok": true, "bids": bids, "asks": asks, "lastPrice": b.last_traded_price.to_string() })
            }
            None => serde_json::json!({ "ok": false, "error": "no market" }),
        }
    }
}
