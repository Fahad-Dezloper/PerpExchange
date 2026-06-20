export type ToEngine =
  | {
      messageType: "onramp";
      userId: string;
      amount: string;
    }
  | {
      messageType: "create_order";
      price: string;
      qty: string;
      side: "short" | "long";
      marketId: string;
      type: "limit" | "market";
      userId: string;
      equity: string;
      orderId: string;
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
