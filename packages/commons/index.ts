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
      slippage: string;
      leverage: string;
    }
  | {
      messageType: "cancel_order";
      orderId: string;
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
    };

// order types
export type OpenOrder = {
  userId: string;
  originlaOrderId: string;
  qty: string;
  filledQty: string;
};

export type Bid = {
  availableQty: number;
  openOrders: OpenOrder[];
};

export type Ask = {
  availableQty: number;
  openOrders: OpenOrder[];
};

export interface Orderbook {
  bids: Map<string, Bid>;
  asks: Map<string, Ask>;
  marketId: string;
  lastTradedPrice: number;
}

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
    };
