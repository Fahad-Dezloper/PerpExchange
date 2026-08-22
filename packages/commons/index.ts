export type ToEngine =
  | {
      messageType: "onramp";
      userId: string;
      amount: string;
    }
  | {
      messageType: "create_order";
      price: number;
      qty: string;
      side: "short" | "long";
      marketId: string;
      type: "limit" | "market";
      userId: string;
      equity: string;
      orderId: string;
      clientId: string;
      slippage: string;
      leverage: string;
      marginMode: "cross" | "isolated";
    }
  | {
      messageType: "cancel_order";
      orderId: string;
      marketId: string;
      userId: string;
    }
  | {
      messageType: "create_market";
      marketId: string;
    }
  | {
      messageType: "balance";
      userId: string;
    }
  | {
      messageType: "withdraw";
      amount: string;
      userId: string;
    }
  | {
      messageType: "get_depth";
      marketId: string;
    }
  | {
      messageType: "get_positions";
      userId: string;
    }
  | {
      messageType: "mark_price_update";
      userId: string;
      price: string;
    }
  | {
      messageType: "funding_tick";
      marketId: string;
    }
  | {
      messageType: "funding";
      marketId: string;
    }
  | { messageType: "get_open_orders"; userId: string };

export type EngineEvent =
  | {
      type: "order_created";
      orderId: string;
      userId: string;
      marketId: string;
      side: "Bid" | "Ask";
      orderType: "Limit" | "Market";
      price: string | null;
      qty: string;
      status: "Open" | "Filled" | "PartiallyFilled" | "Cancelled";
    }
  | {
      type: "order_update";
      orderId: string;
      filledQty: string;
      status: "Open" | "Filled" | "PartiallyFilled" | "Cancelled";
    }
  | {
      type: "fill";
      fillId: string;
      marketId: string;
      price: string;
      qty: string;
      makerOrderId: string;
      takerOrderId: string;
      makerId: string;
      takerId: string;
    }
  | {
      type: "balance_update";
      userId: string;
      available: string;
      locked: string;
    };

export type UserEvents = {
  type: "adl";
  userId: string;
  marketId: string;
  side: "Long" | "Short";
  qty: string;
  markPrice: string;
  clawedProfit: string;
};
