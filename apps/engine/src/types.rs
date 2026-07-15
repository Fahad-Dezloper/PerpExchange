use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(tag = "messageType", rename_all = "snake_case")]
pub enum ToEngine {
    Onramp {
        #[serde(rename = "userId")]
        user_id: String,
        amount: String,
    },

    CreateOrder {
        #[serde(rename = "orderId")]
        order_id: String,
        #[serde(rename = "userId")]
        user_id: String,
        #[serde(rename = "marketId")]
        market_id: String,
        side: String,
        #[serde(rename = "type")]
        order_type: String,
        price: f64,
        qty: String,
        slippage: String,
        leverage: String,
    },

    CancelOrder {
        #[serde(rename = "orderId")]
        order_id: String,
        #[serde(rename = "marketId")]
        market_id: String,
        #[serde(rename = "userId")]
        user_id: String,
    },

    CreateMarket {
        #[serde(rename = "marketId")]
        market_id: String,
    },

    Balance {
        #[serde(rename = "userId")]
        user_id: String,
    },

    Withdraw {
        #[serde(rename = "userId")]
        user_id: String,
        amount: String,
    },

    GetDepth {
        #[serde(rename = "marketId")]
        market_id: String,
    },

    GetPositions {
        #[serde(rename = "userId")]
        user_id: String,
    },
}
