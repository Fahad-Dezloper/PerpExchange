use crate::orderbook::Orderbook;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Balance {
    pub available: Decimal,
    pub locked: Decimal,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Position {
    pub side: String, // "Long" / "Short"
    pub qty: Decimal,
    pub avg_entry_price: Decimal,
    pub margin: Decimal,
    pub leverage: u32,
    pub liquidation_price: Decimal,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Engine {
    pub balances: HashMap<String, Balance>,
    pub orderbooks: HashMap<String, Orderbook>,
    pub positions: HashMap<String, HashMap<String, Position>>,
    #[serde(skip)]
    pub out_db: Vec<serde_json::Value>, // durable events -> to-db
    #[serde(skip)]
    pub out_pub: Vec<(String, serde_json::Value)>, // (channel, payload) -> pubsub
}

const MMR_SCALE: (i64, u32) = (5, 3); // 0.005 maintenance margin ratio

impl Engine {
    fn mmr() -> Decimal {
        Decimal::new(MMR_SCALE.0, MMR_SCALE.1)
    }
    fn emit_db(&mut self, e: serde_json::Value) {
        self.out_db.push(e);
    }

    fn emit_pub(&mut self, ch: String, e: serde_json::Value) {
        self.out_pub.push((ch, e));
    }

    /// main drains after each command and flushes to redis
    pub fn drain(&mut self) -> (Vec<serde_json::Value>, Vec<(String, serde_json::Value)>) {
        (
            std::mem::take(&mut self.out_db),
            std::mem::take(&mut self.out_pub),
        )
    }

    fn liq_price(side: &str, entry: Decimal, qty: Decimal, margin: Decimal) -> Decimal {
        if qty.is_zero() {
            return Decimal::ZERO;
        }
        let maint = qty * entry * Self::mmr();
        let buffer = (margin - maint) / qty;
        if side == "Long" {
            entry - buffer
        } else {
            entry + buffer
        }
    }

    // one fill applied to ONE user. margin = collateral this user posted for this fill
    fn apply_fill(
        &mut self,
        user_id: &str,
        market_id: &str,
        is_long: bool,
        price: Decimal,
        qty: Decimal,
        margin: Decimal,
        leverage: u32,
    ) {
        let side = if is_long { "Long" } else { "Short" };
        let mut freed = Decimal::ZERO;
        let mut realized = Decimal::ZERO;

        let ups = self.positions.entry(user_id.to_string()).or_default();
        // snapshot to dodge borrow conflicts
        let existing = ups
            .get(market_id)
            .map(|p| (p.side.clone(), p.qty, p.avg_entry_price, p.margin));

        match existing {
            // no postion -> open
            None => {
                let liq = Self::liq_price(side, price, qty, margin);
                ups.insert(
                    market_id.to_string(),
                    Position {
                        side: side.to_string(),
                        qty,
                        avg_entry_price: price,
                        margin,
                        leverage,
                        liquidation_price: liq,
                    },
                );
            }

            // same side -> increase, weighted avg entry
            Some((ex_side, ex_qty, ex_entry, ex_margin)) if ex_side == side => {
                let new_qty = ex_qty + qty;
                let new_entry = (ex_qty * ex_entry + qty * price) / new_qty;
                let new_margin = ex_margin + margin;
                let liq = Self::liq_price(side, new_entry, new_qty, new_margin);
                ups.insert(
                    market_id.to_string(),
                    Position {
                        side: side.to_string(),
                        qty: new_qty,
                        avg_entry_price: new_entry,
                        margin: new_margin,
                        leverage,
                        liquidation_price: liq,
                    },
                );
            }

            // opposite side -> close / flip
            Some((ex_side, ex_qty, ex_entry, ex_margin)) => {
                let close_qty = qty.min(ex_qty);

                realized = if ex_side == "Long" {
                    (price - ex_entry) * close_qty
                } else {
                    (ex_entry - price) * close_qty
                };

                // free the closed postions amrgin + the incoming order's margin for that slice
                let released_pos = ex_margin * close_qty / ex_qty;
                let released_incoming = margin * close_qty / qty;
                freed = released_pos + released_incoming;

                let rem_qty = ex_qty - close_qty;
                let leftover = qty - close_qty;

                ups.remove(market_id);

                if rem_qty > Decimal::ZERO {
                    // partially clsed old pstn shrinks
                    let m = ex_margin - released_pos;
                    let liq = Self::liq_price(&ex_side, ex_entry, rem_qty, m);
                    ups.insert(
                        market_id.to_string(),
                        Position {
                            side: ex_side,
                            qty: rem_qty,
                            avg_entry_price: ex_entry,
                            margin: m,
                            leverage,
                            liquidation_price: liq,
                        },
                    );
                } else if leftover > Decimal::ZERO {
                    //  flipped - new positon other way
                    let m = margin * leftover / qty;
                    let liq = Self::liq_price(side, price, leftover, m);
                    ups.insert(
                        market_id.to_string(),
                        Position {
                            side: side.to_string(),
                            qty: leftover,
                            avg_entry_price: price,
                            margin: m,
                            leverage,
                            liquidation_price: liq,
                        },
                    );
                }
            }
        }

        // settle monehy ( borrow of positions dropped now)
        if !freed.is_zero() || !realized.is_zero() {
            let bal = self.balances.entry(user_id.to_string()).or_default();
            bal.locked -= freed;
            bal.available += freed + realized;
        }
    }

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

    pub fn get_positions(&self, user_id: &str) -> serde_json::Value {
        let list: Vec<_> = self
            .positions
            .get(user_id)
            .map(|ps| {
                ps.iter()
                    .map(|(m, p)| {
                        let mark = self.mark_of(m).unwrap_or(p.avg_entry_price);

                        let upnl = if p.side == "Long" {
                            (mark - p.avg_entry_price) * p.qty
                        } else {
                            (p.avg_entry_price - mark) * p.qty
                        };
                        let equity = p.margin + upnl;

                        serde_json::json!({
                            "marketId": m,
                            "side": p.side,
                            "qty": p.qty.to_string(),
                            "entryPrice": p.avg_entry_price.to_string(),
                            "markPrice": mark.to_string(),
                            "margin": p.margin.to_string(),
                            "leverage": p.leverage,
                            "liquidationPrice": p.liquidation_price.to_string(),
                            "unrealizedPnl": upnl.to_string(),
                            "equity": equity.to_string()
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        serde_json::json!({ "ok": true, "positions": list })
    }

    pub fn create_order(
        &mut self,
        order_id: String,
        user_id: String,
        market_id: String,
        side: String, // "long" | "short"
        price: f64,
        qty: String,
        leverage: u32,
    ) -> serde_json::Value {
        let qty = match Decimal::from_str(&qty) {
            Ok(q) if q > Decimal::ZERO => q,
            _ => return serde_json::json!({ "ok": false, "error": "bad qty" }),
        };

        let price = match Decimal::from_f64(price) {
            Some(p) if p > Decimal::ZERO => p,
            _ => return serde_json::json!({ "ok": false, "error": "bad price" }),
        };

        if !self.orderbooks.contains_key(&market_id) {
            return serde_json::json!({ "ok": false, "error": "no market" });
        };

        let is_buy = side == "long";

        let notional = price * qty;
        let margin = notional / Decimal::from(leverage.max(1));

        // lock funds first - reject if broke
        if !self.lock_margin(&user_id, margin) {
            return serde_json::json!({ "ok": false, "error": "insufficient balance" });
        }

        let (fills, remaining) = {
            let book = self.orderbooks.get_mut(&market_id).unwrap();
            book.add_limit(
                order_id.clone(),
                user_id.clone(),
                is_buy,
                price,
                qty,
                leverage,
                margin,
            )
        };

        let filled = qty - remaining;

        // postions for both sides of every fill
        let mut taker_margin_used = Decimal::ZERO;
        for f in &fills {
            let t_margin = f.qty * f.price / Decimal::from(leverage.max(1));
            let m_margin = f.qty * f.price / Decimal::from(f.maker_leverage.max(1));
            taker_margin_used += t_margin;

            // taker takes the side it ordered; makes takes the oppostite
            self.apply_fill(
                &user_id, &market_id, is_buy, f.price, f.qty, t_margin, leverage,
            );
            self.apply_fill(
                &f.maker_user_id,
                &market_id,
                !is_buy,
                f.price,
                f.qty,
                m_margin,
                f.maker_leverage,
            );
        }

        // taker locked margin at its limit price; fills may be cheaper -> refund the diffrence
        let rest_margin = if qty.is_zero() {
            Decimal::ZERO
        } else {
            margin * remaining / qty
        };
        let excess = margin - taker_margin_used - rest_margin;
        if excess > Decimal::ZERO {
            self.unlock_margin(&user_id, excess)
        }

        let status = if remaining == Decimal::ZERO {
            "Filled"
        } else if filled > Decimal::ZERO {
            "PartiallyFilled"
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

        let side_ba = if is_buy { "Bid" } else { "Ask" };

        // ORDER CREATED (DURABLE, FOR POLLER)
        self.emit_db(serde_json::json!({
            "type": "order_created",
            "orderId": order_id,
            "userId": user_id,
            "marketId": market_id,
            "side": side_ba,
            "orderType": "Limit",
            "price": price.to_string(),
            "qty": qty.to_string(),
            "status": status
        }));

        for (i, f) in fills.iter().enumerate() {
            let fill_id = format!("{}-{}", f.taker_order_id, i);

            self.emit_db(serde_json::json!({
                "type": "fill",
                "fillId": fill_id,
                "marketId": market_id,
                "price": f.price.to_string(),
                "qty": f.qty.to_string(),
                "makerOrderId": f.maker_order_id,
                "takerOrderId": f.taker_order_id,
                "makerId": f.maker_user_id,
                "takerId": f.taker_user_id
            }));

            self.emit_pub(
                format!("trade.{market_id}"),
                serde_json::json!({
                    "price": f.price.to_string(),
                    "qty": f.qty.to_string(),
                }),
            );
        }

        // live depth snapshot
        if let Some(b) = self.orderbooks.get(&market_id) {
            let (bids, asks) = b.depth();
            self.emit_pub(
                format!("depth.{market_id}"),
                serde_json::json!({
                    "bids": bids,
                    "asks": asks
                }),
            )
        }

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
        let book = match self.orderbooks.get_mut(market_id) {
            Some(b) => b,
            None => return serde_json::json!({"ok": false, "error": "no market"}),
        };
        match book.cancel(order_id, user_id) {
            Some(o) => {
                self.unlock_margin(user_id, o.margin);
                serde_json::json!({ "ok": true, "status": "Cancelled" })
            }
            None => serde_json::json!({ "ok": false, "error": "order not found" }),
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

    pub fn lock_margin(&mut self, user_id: &str, amount: Decimal) -> bool {
        let bal = self.balances.entry(user_id.to_string()).or_default();
        if bal.available < amount {
            return false;
        }
        bal.available -= amount;
        bal.locked += amount;
        true
    }

    fn unlock_margin(&mut self, user_id: &str, amount: Decimal) {
        let bal = self.balances.entry(user_id.to_string()).or_default();
        bal.locked -= amount;
        bal.available += amount;
    }

    pub fn withdraw(&mut self, user_id: String, amount: String) -> serde_json::Value {
        let amt = match Decimal::from_str(&amount) {
            Ok(a) if a > Decimal::ZERO => a,
            _ => return serde_json::json!({ "ok": false, "error": "insufficient balance" }),
        };
        let bal = self.balances.entry(user_id).or_default();
        if bal.available < amt {
            return serde_json::json!({ "ok": false, "error": "insufficient balance" });
        }
        bal.available -= amt;
        serde_json::json!({
            "ok": true,
            "available": bal.available.to_string(),
            "locked": bal.locked.to_string()
        })
    }

    /// fetch oracle price else fallback to last traded price
    fn mark_of(&self, market_id: &str) -> Option<Decimal> {
        let b = self.orderbooks.get(market_id)?;
        if b.mark_price > Decimal::ZERO {
            Some(b.mark_price)
        } else if b.last_traded_price > Decimal::ZERO {
            Some(b.last_traded_price)
        } else {
            None
        }
    }

    pub fn mark_price_update(&mut self, market_id: String, price: String) -> serde_json::Value {
        let p = match Decimal::from_str(&price) {
            Ok(p) if p > Decimal::ZERO => p,
            _ => return serde_json::json!({ "ok": false, "error": "bad price" }),
        };
        match self.orderbooks.get_mut(&market_id) {
            Some(b) => b.mark_price = p,
            None => return serde_json::json!({ "ok": false, "error": "no market" }),
        }

        self.emit_pub(
            format!("ticker.{market_id}"),
            serde_json::json!({
                "markPrice": p.to_string(),
            }),
        );

        let liquidated = self.check_liquidations(&market_id, p);
        for ev in &liquidated {
            let mut e = ev.clone();
            e["type"] = serde_json::json!("liquidation");
            self.emit_db(e);
        }

        serde_json::json!({ "ok": true, "marketId": market_id, "markPrice": p.to_string(), "liquidated": liquidated })
    }

    fn check_liquidations(&mut self, market_id: &str, mark: Decimal) -> Vec<serde_json::Value> {
        // collect first - can't mutate while iterating
        let mut victims: Vec<(String, String, Decimal, Decimal, Decimal)> = Vec::new();
        for (user_id, ups) in self.positions.iter() {
            if let Some(p) = ups.get(market_id) {
                let upnl = if p.side == "Long" {
                    (mark - p.avg_entry_price) * p.qty
                } else {
                    (p.avg_entry_price - mark) * p.qty
                };
                let equity = p.margin + upnl;
                // maint = maintenance
                let maint = p.qty * p.avg_entry_price * Self::mmr();

                if equity <= maint {
                    victims.push((user_id.clone(), p.side.clone(), p.qty, upnl, p.margin));
                }
            }
        }

        let mut events = Vec::new();
        for (user_id, side, qty, realized, margin) in victims {
            // wipe the positions
            if let Some(ups) = self.positions.get_mut(&user_id) {
                ups.remove(market_id);
                if ups.is_empty() {
                    self.positions.remove(&user_id);
                }
            }

            let payout = (margin + realized).max(Decimal::ZERO);
            let bal = self.balances.entry(user_id.clone()).or_default();
            bal.locked -= margin;
            bal.available += payout;

            events.push(serde_json::json!({
                "userId": user_id,
                "marketId": market_id,
                "side": side,
                "qty": qty.to_string(),
                "markPrice": mark.to_string(),
                "realizedPnl": realized.to_string(),
                "payout": payout.to_string()
            }));
        }
        events
    }

    pub fn funding_tick(&mut self, market_id: String) -> serde_json::Value {
        let (mark, last) = match self.orderbooks.get(&market_id) {
            Some(b) => (b.mark_price, b.last_traded_price),
            None => return serde_json::json!({ "ok": false, "error": "no market" }),
        };
        if mark <= Decimal::ZERO {
            return serde_json::json!({ "ok": true, "rate": "0", "note": "no mark price" });
        }

        let cap = Decimal::new(75, 4);
        /// 0.0075
        let rate = ((last - mark) / mark).clamp(-cap, cap);

        // users holding a position in this market
        let users: Vec<String> = self
            .positions
            .iter()
            .filter(|(_, ups)| ups.contains_key(&market_id))
            .map(|(u, _)| u.clone())
            .collect();

        let mut payments = Vec::new();
        for user in users {
            let (side, qty) = {
                let p = &self.positions[&user][&market_id];
                (p.side.clone(), p.qty)
            };
            let notional = qty * mark;
            let pay = rate * notional;
            let delta = if side == "Long" { -pay } else { pay }; // long payes the rate ? 0

            let bal = self.balances.entry(user.clone()).or_default();
            bal.available += delta;

            payments.push(serde_json::json!({ "userId": user, "delta": delta.to_string() }));
        }

        self.emit_pub(
            format!("funding.{market_id}"),
            serde_json::json!({
                "rate": rate.to_string()
            }),
        );

        serde_json::json!({
            "ok": true,
            "marketId": market_id,
            "rate": rate.to_string(),
            "payments": payments
        })
    }
}
