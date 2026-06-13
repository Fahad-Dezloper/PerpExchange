import { createClient } from "redis";
import type { ToEngine } from "commons";

// pushing to the engine queue from backend
const client = createClient();
client.connect();

// engine pushing to the queue from where backend is picking up
const publisher = createClient();
publisher.connect();

type OpenOrder = {
  userId: string;
  originlaOrderId: string;
  qty: string;
  filledQty: string;
};

type Bid = {
  availableQty: number;
  openOrders: OpenOrder[];
};

type Ask = {
  availableQty: number;
  openOrders: OpenOrder[];
};

interface Orderbook {
  bids: Map<string, Bid>;
  asks: Map<string, Ask>;
  marketId: string;
  lastTradedPrice: number;
}

const orderbooks: Orderbook[] = [];
const balances: Map<string, { available: string; locked: string }> = new Map();

function matching() {
  while (1) {
    const response = await client.xReadGroup(
      "engine",
      "engine",
      [
        {
          key: "engine",
          id: ">",
        },
      ],
      {
        BLOCK: 100,
        COUNT: 1,
      },
    );

    if (!response) {
      continue;
    }

    const message: {
      loopBackId: string;
    } & ToEngine = response[0].messages[0].message;

    if (message.messageType == "create_market") {
      orderbooks.push({
        bids: new Map(),
        asks: new Map(),
        lastTradedPrice: -1,
        marketId: message.marketId,
      });

      await publisher.xAdd("to-backend", "*", {
        loopBackId: message.loopBackId,
      });
    }

    if (message.messageType === "onramp") {
      balances[message.userId].available += message.amount;
      await publisher.xAdd("to-backend", "*", {
        loopBackId: message.loopBackId,
      });
    }

    if (message.messageType === "create_order") {
    }

    if (message.messageType === "cancel_order") {
    }
  }
}

function liquidationChecks() {}

matching();
liquidationChecks();
