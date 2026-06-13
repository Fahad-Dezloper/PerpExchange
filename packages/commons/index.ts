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
    };
