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
    #[serde(default)]
    pub margin_mode: String,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Engine {
    pub balances: HashMap<String, Balance>,
    pub orderbooks: HashMap<String, Orderbook>,
    pub positions: HashMap<String, HashMap<String, Position>>,
    #[serde(default)]
    pub insurance_fund: Decimal,
    #[serde(default)]
    pub seen_orders: HashMap<String, String>, // clientId -> orderId (idempotency)
    #[serde(skip)]
    pub out_db: Vec<serde_json::Value>, // durable events -> to-db
    #[serde(skip)]
    pub out_pub: Vec<(String, serde_json::Value)>, // (channel, payload) -> pubsub
    #[serde(skip)]
    pub replaying: bool, // true during boot replay -> suppress side effects
}

const MMR_SCALE: (i64, u32) = (5, 3); // 0.005 maintenance margin ratio

impl Engine {
    fn mmr() -> Decimal {
        Decimal::new(MMR_SCALE.0, MMR_SCALE.1)
    }

    fn taker_fee() -> Decimal {
        Decimal::new(5, 4) // 0.0005 = 0.05%
    }
    fn maker_fee() -> Decimal {
        Decimal::new(2, 4) // 0.0002 = 0.02%
    }

    fn charge_fee(&mut self, user_id: &str, fee: Decimal) {
        if fee <= Decimal::ZERO {
            return;
        }
        {
            let bal = self.balances.entry(user_id.to_string()).or_default();
            bal.available -= fee;
        }
        self.insurance_fund += fee;
    }

    fn emit_db(&mut self, e: serde_json::Value) {
        if self.replaying {
            return;
        }
        self.out_db.push(e);
    }

    fn check_cross_liquidations(&mut self, updated_market: &str) -> Vec<serde_json::Value> {
        let mut candidates: Vec<String> = Vec::new();
        for (uid, ups) in self.positions.iter() {
            let has = ups
                .get(updated_market)
                .map(|p| p.margin_mode == "cross")
                .unwrap_or(false);
            if has {
                candidates.push(uid.clone());
            }
        }

        let mut victims: Vec<String> = Vec::new();
        for uid in &candidates {
            let ups = match self.positions.get(uid) {
                Some(u) => u,
                None => continue,
            };

            let available = self.balances.get(uid).map(|b| b.available).unwrap_or(Decimal::ZERO);
            let mut margin = Decimal::ZERO;
            let mut upnl = Decimal::ZERO;
            let mut maint = Decimal::ZERO;
            for (m, p) in ups.iter() {
                if p.margin_mode != "cross" {
                    continue;
                }
                let mark = self.mark_of(m).unwrap_or(p.avg_entry_price);
                let pnl = if p.side == "Long" {
                    (mark - p.avg_entry_price) * p.qty
                } else {
                    (p.avg_entry_price - mark) * p.qty
                };
                margin += p.margin;
                upnl += pnl;
                maint += p.qty * p.avg_entry_price * Self::mmr();
            }
            if available + margin + upnl <= maint {
                victims.push(uid.clone());
            }
        }

                // liquidate all cross positions of each victim
        let mut events = Vec::new();
        for uid in victims {
            let available = self.balances.get(&uid).map(|b| b.available).unwrap_or(Decimal::ZERO);
            let mut margin = Decimal::ZERO;
            let mut upnl = Decimal::ZERO;
            let mut closed: Vec<(String, String, Decimal)> = Vec::new();
            if let Some(ups) = self.positions.get(&uid) {
                for (m, p) in ups.iter() {
                    if p.margin_mode != "cross" {
                        continue;
                    }
                    let mark = self.mark_of(m).unwrap_or(p.avg_entry_price);
                    let pnl = if p.side == "Long" {
                        (mark - p.avg_entry_price) * p.qty
                    } else {
                        (p.avg_entry_price - mark) * p.qty
                    };
                    margin += p.margin;
                    upnl += pnl;
                    closed.push((m.clone(), p.side.clone(), p.qty));
                }
            }

            // drop all cross positions, keep isolated ones
            if let Some(ups) = self.positions.get_mut(&uid) {
                ups.retain(|_, p| p.margin_mode != "cross");
                if ups.is_empty() {
                    self.positions.remove(&uid);
                }
            }

            let settled = available + margin + upnl;
            {
                let bal = self.balances.entry(uid.clone()).or_default();
                bal.locked -= margin;
                bal.available = settled.max(Decimal::ZERO);
            }
            let deficit = (-settled).max(Decimal::ZERO);
            if deficit > Decimal::ZERO {
                self.insurance_fund -= deficit;
            }

            for (m, side, qty) in &closed {
                events.push(serde_json::json!({
                    "userId": uid,
                    "marketId": m,
                    "side": side,
                    "qty": qty.to_string(),
                    "realizedPnl": upnl.to_string(),
                    "payout": settled.max(Decimal::ZERO).to_string(),
                    "crossLiquidation": true
                }));
            }
        }
        events
    }

    fn emit_pub(&mut self, ch: String, e: serde_json::Value) {
        if self.replaying {
            return;
        }
        self.out_pub.push((ch, e));
    }

    fn push_balance(&mut self, user_id: &str) {
        let (available, locked) = self
            .balances
            .get(user_id)
            .map(|b| (b.available, b.locked))
            .unwrap_or((Decimal::ZERO, Decimal::ZERO));
        self.emit_pub(
            format!("user.{user_id}"),
            serde_json::json!({
                "type": "balance",
                "available": available.to_string(),
                "locked": locked.to_string()
            }),
        )
    }

    fn push_positions(&mut self, user_id: &str, market_id: &str) {
        let snap = self
            .positions
            .get(user_id)
            .and_then(|ups| ups.get(market_id))
            .map(|p| {
                (
                    p.side.clone(),
                    p.qty,
                    p.avg_entry_price,
                    p.margin,
                    p.leverage,
                    p.liquidation_price,
                    p.margin_mode.clone(),
                )
            });
        let payload = match snap {
            Some((side, qty, entry, margin, leverage, liq, mode)) => serde_json::json!({
                "type": "position",
                "marketId": market_id,
                "side": side,
                "qty": qty.to_string(),
                "entryPrice": entry.to_string(),
                "margin": margin.to_string(),
                "leverage": leverage,
                "liquidationPrice": liq.to_string(),
                "marginMode": mode
            }),
            None => serde_json::json!({
                "type": "position_closed",
                "marketId": market_id,
            }),
        };
        self.emit_pub(format!("user.{user_id}"), payload);
    }

    fn run_adl(&mut self, market_id: &str, mark: Decimal) -> Vec<serde_json::Value> {
        let mut events = Vec::new();

        while self.insurance_fund < Decimal::ZERO {
            // PICK THE SINGLE MOST PROFITABLE POSITION IN THIS MARKET
            let mut best: Option<(String, String, Decimal, Decimal, Decimal)> = None;
            // (user_id, side, qty, margin, upnl)
            for (uid, ups) in self.positions.iter() {
                if let Some(p) = ups.get(market_id) {
                    let upnl = if p.side == "Long" {
                        (mark - p.avg_entry_price) * p.qty
                    } else {
                        (p.avg_entry_price - mark) * p.qty
                    };
                    if upnl > Decimal::ZERO {
                        let better = match &best {
                            Some((_, _, _, _, b)) => upnl > *b,
                            None => true,
                        };
                        if better {
                            best = Some((uid.clone(), p.side.clone(), p.qty, p.margin, upnl));
                        }
                    }
                }
            }

            let (uid, side, qty, margin, upnl) = match best {
                Some(x) => x,
                None => break,
            };

            if let Some(ups) = self.positions.get_mut(&uid) {
                ups.remove(market_id);
                if ups.is_empty() {
                    self.positions.remove(&uid);
                }
            }
            {
                let bal = self.balances.entry(uid.clone()).or_default();
                bal.locked -= margin;
                bal.available += margin;
            }
            self.insurance_fund += upnl;

            events.push(serde_json::json!({
                "type": "adl",
                "userId": uid,
                "marketId": market_id,
                "side": side,
                "qty": qty.to_string(),
                "markPrice": mark.to_string(),
                "clawedProfit": upnl.to_string()
            }));
        }
        events
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
        margin_mode: &str,
    ) {
        let side = if is_long { "Long" } else { "Short" };
        let mut freed = Decimal::ZERO;
        let mut realized = Decimal::ZERO;

        let ups = self.positions.entry(user_id.to_string()).or_default();
        // snapshot to dodge borrow conflicts
        let existing = ups.get(market_id).map(|p| {
            (
                p.side.clone(),
                p.qty,
                p.avg_entry_price,
                p.margin,
                p.margin_mode.clone(),
            )
        });

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
                        margin_mode: margin_mode.to_string(),
                    },
                );
            }

            // same side -> increase, weighted avg entry
            Some((ex_side, ex_qty, ex_entry, ex_margin, ex_mode)) if ex_side == side => {
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
                        margin_mode: ex_mode,
                    },
                );
            }

            // opposite side -> close / flip
            Some((ex_side, ex_qty, ex_entry, ex_margin, ex_mode)) => {
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
                            margin_mode: ex_mode,
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
                            margin_mode: margin_mode.to_string(),
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

        let (available, locked) = {
            let bal = self.balances.entry(user_id.clone()).or_default();
            bal.available += amt;
            (bal.available, bal.locked)
        };

        self.emit_db(serde_json::json!({
            "type": "balance_update",
            "userId": user_id,
            "available": available.to_string(),
            "locked": locked.to_string(),
        }));

        self.push_balance(&user_id);

        serde_json::json!({
            "ok": true,
            "available": available.to_string(),
            "locked": locked.to_string()
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
                            "equity": equity.to_string(),
                            "marginMode": p.margin_mode
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
        order_type: String,
        client_id: String,
        margin_mode: String,
    ) -> serde_json::Value {
        if !client_id.is_empty() {
            if let Some(existing) = self.seen_orders.get(&client_id) {
                return serde_json::json!({
                    "ok": true,
                    "orderId": existing,
                    "status": "Duplicate",
                    "duplicate": true
                });
            }
        }

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
        let is_market = order_type == "market";

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
                is_market,
                margin_mode.clone(),
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
                &user_id, &market_id, is_buy, f.price, f.qty, t_margin, leverage, &margin_mode,
            );
            self.apply_fill(
                &f.maker_user_id,
                &market_id,
                !is_buy,
                f.price,
                f.qty,
                m_margin,
                f.maker_leverage,
                &f.maker_margin_mode,
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
        } else if is_market {
            if filled > Decimal::ZERO {
                "Filled"
            } else {
                "Cancelled"
            }
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
            "orderType": if is_market { "Market" } else { "Limit" },
            "price": price.to_string(),
            "qty": qty.to_string(),
            "status": status
        }));

        for (i, f) in fills.iter().enumerate() {
            let fill_id = format!("{}-{}", f.taker_order_id, i);

            let notional = f.qty * f.price;
            let taker_fee = notional * Self::taker_fee();
            let maker_fee = notional * Self::maker_fee();
            self.charge_fee(&user_id, taker_fee);
            self.charge_fee(&f.maker_user_id, maker_fee);

            self.emit_db(serde_json::json!({
                "type": "fill",
                "fillId": fill_id,
                "marketId": market_id,
                "price": f.price.to_string(),
                "qty": f.qty.to_string(),
                "makerOrderId": f.maker_order_id,
                "takerOrderId": f.taker_order_id,
                "makerId": f.maker_user_id,
                "takerId": f.taker_user_id,
                "takerFee": taker_fee.to_string(),
                "makerFee": maker_fee.to_string()
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

        {
            let taker_side = side.as_str();
            let maker_side = if is_buy { "short" } else { "long" };
            for f in &fills {
                self.emit_pub(
                    format!("user.{user_id}"),
                    serde_json::json!({
                        "type": "fill",
                        "marketId": market_id,
                        "price": f.price.to_string(),
                        "qty": f.qty.to_string(),
                        "side": taker_side,
                    }),
                );
                self.emit_pub(
                    format!("user.{}", f.maker_user_id),
                    serde_json::json!({
                        "type": "fill",
                        "marketId": market_id,
                        "price": f.price.to_string(),
                        "qty": f.qty.to_string(),
                        "side": maker_side
                    }),
                );
            }

            self.emit_pub(
                format!("user.{user_id}"),
                serde_json::json!({
                    "type": "order",
                    "orderId": order_id,
                    "status": status,
                    "filledQty": filled.to_string(),
                }),
            );

            let mut affected: std::collections::HashSet<String> = std::collections::HashSet::new();
            affected.insert(user_id.clone());
            for f in &fills {
                affected.insert(f.maker_user_id.clone());
            }
            for uid in affected {
                self.push_balance(&uid);
                self.push_positions(&uid, &market_id);

                let (available, locked) = self
                    .balances
                    .get(&uid)
                    .map(|b| (b.available, b.locked))
                    .unwrap_or((Decimal::ZERO, Decimal::ZERO));
                self.emit_db(serde_json::json!({
                    "type": "balance_update",
                    "userId": uid,
                    "available": available.to_string(),
                    "locked": locked.to_string()
                }))
            }
        }

        if !client_id.is_empty() {
            self.seen_orders.insert(client_id, order_id.clone());
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
        println!("cancel market id: {:?}", self.orderbooks.keys());
        let book = match self.orderbooks.get_mut(market_id) {
            Some(b) => b,
            None => return serde_json::json!({"ok": false, "error": "no market"}),
        };
        match book.cancel(order_id, user_id) {
            Some(o) => {
                self.unlock_margin(user_id, o.margin);
                self.push_balance(user_id);
                self.emit_pub(
                    format!("user.{user_id}"),
                    serde_json::json!({
                        "type": "order",
                        "orderId": order_id,
                        "status": "Cancelled",
                    }),
                );
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

        let (available, locked) = {
            let bal = self.balances.entry(user_id.clone()).or_default();
            if bal.available < amt {
                return serde_json::json!({ "ok": false, "error": "insufficient balance" });
            }
            bal.available -= amt;
            (bal.available, bal.locked)
        };

        self.emit_db(serde_json::json!({
            "type": "balance_update",
            "userId": user_id,
            "available": available.to_string(),
            "locked": locked.to_string(),
        }));

        self.push_balance(&user_id);

        serde_json::json!({
            "ok": true,
            "available": available.to_string(),
            "locked": locked.to_string()
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
            self.emit_db(e.clone());
            if let Some(uid) = ev.get("userId").and_then(|v| v.as_str()) {
                let uid = uid.to_string();
                self.emit_pub(format!("user.{uid}"), e);
                self.push_balance(&uid);
                self.push_positions(&uid, &market_id); // position gone -> position_closed
            }
        }

        let cross = self.check_cross_liquidations(&market_id);
            for ev in &cross {
                let mut e = ev.clone();
                e["type"] = serde_json::json!("liquidation");
                self.emit_db(e.clone());
                if let (Some(uid), Some(m)) = (
                    ev.get("userId").and_then(|v| v.as_str()),
                    ev.get("marketId").and_then(|v| v.as_str()),
                ) {
                    let uid = uid.to_string();
                    let m = m.to_string();
                    self.emit_pub(format!("user.{uid}"), e);
                    self.push_balance(&uid);
                    self.push_positions(&uid, &m);
                }
            }

        if self.insurance_fund < Decimal::ZERO {
            let adl = self.run_adl(&market_id, p);
            for ev in &adl {
                self.emit_db(ev.clone());
                if let Some(uid) = ev.get("userId").and_then(|v| v.as_str()) {
                    let uid = uid.to_string();
                    self.emit_pub(format!("user.{uid}"), ev.clone());
                    self.push_balance(&uid);
                    self.push_positions(&uid, &market_id); // -> position_closed
                }
            }
        }

        serde_json::json!({ "ok": true, "marketId": market_id, "markPrice": p.to_string(), "liquidated": liquidated })
    }

    fn check_liquidations(&mut self, market_id: &str, mark: Decimal) -> Vec<serde_json::Value> {
        // collect first - can't mutate while iterating
        let mut victims: Vec<(String, String, Decimal, Decimal, Decimal)> = Vec::new();
        for (user_id, ups) in self.positions.iter() {
            if let Some(p) = ups.get(market_id) {
                if p.margin_mode == "cross" {
                    continue; // cross positions liquidate at the account level, not here
                }
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

            let equity = margin + realized;
            let payout = equity.max(Decimal::ZERO);
            let deficit = (-equity).max(Decimal::ZERO);

            {
                let bal = self.balances.entry(user_id.clone()).or_default();
                bal.locked -= margin;
                bal.available += payout;
            }

            // insurance fund eats the shortfall on a bankrupt liquidation
            if deficit > Decimal::ZERO {
                self.insurance_fund -= deficit;
            }

            events.push(serde_json::json!({
                "userId": user_id,
                "marketId": market_id,
                "side": side,
                "qty": qty.to_string(),
                "markPrice": mark.to_string(),
                "realizedPnl": realized.to_string(),
                "payout": payout.to_string(),
                "deficit": deficit.to_string()
            }));
        }
        events
    }

    pub fn apply_funding(&mut self, market_id: String) -> serde_json::Value {
        let (mark, last) = match self.orderbooks.get(&market_id) {
            Some(b) => (b.mark_price, b.last_traded_price),
            None => return serde_json::json!({ "ok": false, "error": "no market" }),
        };

        if mark <= Decimal::ZERO {
            return serde_json::json!({ "ok": false, "error": "no mark price" });
        }

        let cap = Decimal::new(75, 4); // 0.0075 = 0.75%
        let rate = ((last - mark) / mark).clamp(-cap, cap);

        // collect first - can't mutate balances while borrowing positions
        let mut payments: Vec<(String, Decimal)> = Vec::new();
        for (user_id, ups) in self.positions.iter() {
            if let Some(p) = ups.get(&market_id) {
                let notional = p.qty * mark;
                let pay = notional * rate; // amount a long pays
                let delta = if p.side == "Long" { -pay } else { pay };
                payments.push((user_id.clone(), delta));
            }
        }

        let mut events = Vec::new();
        for (user_id, delta) in &payments {
            let bal = self.balances.entry(user_id.clone()).or_default();
            bal.available += *delta;
            events.push(serde_json::json!({
                "userId": user_id,
                "marketId": market_id,
                "delta": delta.to_string()
            }));
            self.emit_pub(
                format!("user.{user_id}"),
                serde_json::json!({
                    "type": "funding",
                    "marketId": market_id,
                    "delta": delta.to_string(),
                }),
            );
            self.push_balance(user_id);
        }

        self.emit_pub(
            format!("funding.{market_id}"),
            serde_json::json!({
                "rate": rate.to_string(),
                "markPrice": mark.to_string(),
                "lastPrice": last.to_string()
            }),
        );

        serde_json::json!({
            "ok": true,
            "marketId": market_id,
            "rate": rate.to_string(),
            "payments": events
        })
    }

    pub fn get_open_orders(&self, user_id: &str) -> serde_json::Value {
        let orders: Vec<_> = self
            .orderbooks
            .values()
            .flat_map(|b| b.open_orders_for(user_id))
            .collect();
        serde_json::json!({ "ok": true, "orders": orders })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // maker rests, taker crosses -> both end up with a position
    fn cross_open(
        e: &mut Engine,
        m: &str,
        oid_maker: &str,
        oid_taker: &str,
        maker: &str,
        taker: &str,
        taker_long: bool,
        price: f64,
        qty: &str,
        lev: u32,
        taker_mode: &str,
        maker_mode: &str,
    ) {
        let (ms, ts) = if taker_long {
            ("short", "long")
        } else {
            ("long", "short")
        };
        e.create_order(
            oid_maker.into(), maker.into(), m.into(), ms.into(), price, qty.into(),
            lev, "limit".into(), "".into(), maker_mode.into(),
        );
        e.create_order(
            oid_taker.into(), taker.into(), m.into(), ts.into(), price, qty.into(),
            lev, "limit".into(), "".into(), taker_mode.into(),
        );
    }

    fn has_pos(e: &Engine, user: &str, market: &str) -> bool {
        e.positions
            .get(user)
            .map(|ps| ps.contains_key(market))
            .unwrap_or(false)
    }

    #[test]
    fn isolated_liquidation_closes_only_the_losing_position() {
        let mut e = Engine::new();
        e.create_market("M".into());
        e.onramp("A".into(), "1000".into());
        e.onramp("B".into(), "1000".into());

        // A long 1@100 x10 isolated ; B short is the maker
        cross_open(&mut e, "M", "b1", "a1", "B", "A", true, 100.0, "1", 10, "isolated", "isolated");
        assert!(has_pos(&e, "A", "M"), "A should have opened a long");
        assert!(has_pos(&e, "B", "M"), "B should have opened a short");

        // mark down to 90 -> A long liquidates (equity 0 <= maint 0.5), B short survives
        e.mark_price_update("M".into(), "90".into());
        assert!(!has_pos(&e, "A", "M"), "A long must be liquidated");
        assert!(has_pos(&e, "B", "M"), "B short must survive");
    }

    #[test]
    fn cross_liquidation_spares_isolated_position() {
        let mut e = Engine::new();
        e.create_market("M1".into());
        e.create_market("M2".into());
        e.onramp("A".into(), "25".into()); // just enough for two 10-margin positions + fees
        e.onramp("B".into(), "1000".into());
        e.onramp("C".into(), "1000".into());

        // A: cross long M1 (vs B) AND isolated long M2 (vs C)
        cross_open(&mut e, "M1", "b1", "a1", "B", "A", true, 100.0, "1", 10, "cross", "isolated");
        cross_open(&mut e, "M2", "c1", "a2", "C", "A", true, 100.0, "1", 10, "isolated", "isolated");
        assert!(has_pos(&e, "A", "M1"), "A cross M1 should open");
        assert!(has_pos(&e, "A", "M2"), "A isolated M2 should open");

        // push M1 down -> A's cross account underwater -> cross liq closes M1 ONLY
        e.mark_price_update("M1".into(), "85".into());
        assert!(!has_pos(&e, "A", "M1"), "cross M1 must be liquidated");
        assert!(has_pos(&e, "A", "M2"), "isolated M2 must be untouched");
    }

    #[test]
    fn fees_accrue_to_insurance_fund() {
        let mut e = Engine::new();
        e.create_market("M".into());
        e.onramp("A".into(), "1000".into());
        e.onramp("B".into(), "1000".into());
        cross_open(&mut e, "M", "b1", "a1", "B", "A", true, 100.0, "1", 10, "isolated", "isolated");
        // taker 0.05% + maker 0.02% of notional 100 = 0.05 + 0.02 = 0.07
        assert!(e.insurance_fund > Decimal::ZERO, "fees should fill the insurance fund");
    }
}
