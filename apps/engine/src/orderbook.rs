use rust_decimal::Decimal;
use std::collections::{BTreeMap, VecDecque};

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
    pub bids: BTreeMap<Decimal, VecDecque<RestingOrder>>, // buyers
    pub asks: BTreeMap<Decimal, VecDecque<RestingOrder>>, // sellers
    pub last_traded_price: Decimal,
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
            }

            // have to write from here. understand this add limit function
        }
    }
}
