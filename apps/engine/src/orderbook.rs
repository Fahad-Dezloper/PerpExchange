use rust_decimal::Decimal;
use std::collections::{BTreeMap, VecDeque};

#[derive(Debug)]
pub struct RestingOrder {
    pub order_id: String,
    pub user_id: String,
    pub qty: Decimal,
    pub filled: Decimal,
}

impl RestingOrder {
    fn remaining(&self) -> Decimal {
        self.qty - self.filled
    }
}

#[derive(Debug)]
pub struct Fill {
    pub price: Decimal,
    pub qty: Decimal,
    pub maker_order_id: String,
    pub taker_order_id: String,
    pub maker_user_id: String,
    pub taker_user_id: String,
}

#[derive(Default, Debug)]
pub struct Orderbook {
    pub market_id: String,
    pub bids: BTreeMap<Decimal, VecDeque<RestingOrder>>, // buyers
    pub asks: BTreeMap<Decimal, VecDeque<RestingOrder>>, // sellers
    pub last_traded_price: Decimal,
}

#[derive(Debug)]
pub struct RestingOrder {
    pub order_id: String,
    pub user_id: String,
    pub qty: Decimal,
    pub filled: Decimal,
    pub leverage: u32,
    pub margin: Decimal,
}

impl Orderbook {
    pub fn new(market_id: String) -> Self {
        Orderbook {
            market_id,
            ..Default::default()
        }
    }

    /// limit order. is_buy = long. returns fills + remaining qty that rested.
    pub fn add_limit(
        &mut self,
        order_id: String,
        user_id: String,
        is_buy: bool,
        price: Decimal,
        qty: Decimal,
    ) -> (Vec<Fill>, Decimal) {
        let mut fills = Vec::new();
        let mut remaining = qty;

        loop {
            if remaining <= Decimal::ZERO {
                break;
            }

            // best opposite price level
            let best_price = if is_buy {
                self.asks.keys().next().cloned() // lowest ask
            } else {
                self.bids.keys().last().cloned() // highest bid
            };

            let best_price = match best_price {
                Some(p) => p,
                None => break, // empty other side
            };

            // price crosses?
            let crosses = if is_buy {
                price >= best_price
            } else {
                price <= best_price
            };
            if !crosses {
                break;
            }

            let book = if is_buy {
                &mut self.asks
            } else {
                &mut self.bids
            };
            let level = book.get_mut(&best_price).unwrap();

            while remaining > Decimal::ZERO {
                let maker = match level.front_mut() {
                    Some(m) => m,
                    None => break,
                };

                let trade_qty = remaining.min(maker.remaining());
                maker.filled += trade_qty;
                remaining -= trade_qty;

                fills.push(Fill {
                    price: best_price,
                    qty: trade_qty,
                    maker_order_id: maker.order_id.clone(),
                    taker_order_id: order_id.clone(),
                    maker_user_id: maker.user_id.clone(),
                    taker_user_id: user_id.clone(),
                });
                self.last_traded_price = best_price;

                if maker.remaining() <= Decimal::ZERO {
                    level.pop_front(); // maker done
                }
            }

            if level.is_empty() {
                book.remove(&best_price); // level emptied
            }
        }

        // rest remainder on own side
        if remaining > Decimal::ZERO {
            let side = if is_buy {
                &mut self.bids
            } else {
                &mut self.asks
            };
            side.entry(price).or_default().push_back(RestingOrder {
                order_id,
                user_id,
                qty: remaining,
                filled: Decimal::ZERO,
            });
        }

        (fills, remaining)
    }

    pub fn cancel(&mut self, order_id: &str, user_id: &str) -> bool {
        for book in [&mut self.bids, &mut self.asks] {
            for (_price, level) in book.iter_mut() {
                if let Some(i) = level
                    .iter()
                    .position(|o| o.order_id == order_id && o.user_id == user_id)
                {
                    let o = level.remove(i);
                    self.bids.retain(|_, l| !l.is_empty());
                    self.asks.retain(|_, l| !l.is_empty());
                }
            }
        }
        // cleanup empty levels
        None
    }

    /// aggreagated depth: [price, totalQty] per level
    pub fn depth(&self) -> (Vec<(String, String)>, Vec<(String, String)>) {
        let agg =
            |level: &VecDeque<RestingOrder>| level.iter().map(|o| o.remaining()).sum::<Decimal>();
        let bids = self
            .bids
            .iter()
            .rev() // highest first
            .map(|(p, l)| (p.to_string(), agg(l).to_string()))
            .collect();
        let asks = self
            .asks
            .iter() // lowest first
            .map(|(p, l)| (p.to_string(), agg(l).to_string()))
            .collect();
        (bids, asks)
    }
}
