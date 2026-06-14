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
const positions: Map<
  string,
  Map<
    string,
    {
      side: "long" | "short";
      averagePrice: number;
      qty: string;
      liquidationPrice: string;
      stopLoss: string;
      takeProfit: string;
      equity: string;
    }
  >
> = new Map();

async function matching() {
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
    } & ToEngine = response[0]!.messages[0].message;

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
      balances.get(message.userId)!.available += message.amount;
      await publisher.xAdd("to-backend", "*", {
        loopBackId: message.loopBackId,
      });
    }

    if (message.messageType === "create_order") {
      // create a new order, match if possible
    }

    if (message.messageType === "cancel_order") {
      //  cancel an open order
    }

    if (message.messageType === "get_depth") {
      //  get the depth for a market
    }

    if (message.messageType === "spot_price_update") {
      // do liquidation checks, stop loss and take profit
    }

    if (message.messageType === "get_funding_rate") {
      // get the funding rate based on the diff b/w mark price and last traded price
    }
  }
}

function fundingRateDespersal() {
  // check the mark price, calculate how far it is from the last traded price
  // longs pay shortts or vice versa
  // liquidation price changes for all positions
  positions.forEach((userPositions, userId) => {
    userPositions.forEach((position, marketId) => {
      const orderbook = orderbooks.get(marketId);
      if (!orderbook) return;

      const inflationRate =
        (Number(orderbook.lastTradedPrice) - Number(orderbook.markPrice)) /
        Number(orderbook.markPrice);

      if (position.side === "long") {
        const notionalValue =
          Number(position.qty) * Number(orderbook.lastTradedPrice);
        position.equity = (
          Number(position.equity) -
          notionalValue * inflationRate
        ).toString();
        // recalculate liquidation price
      } else {
        const notionalValue =
          Number(position.qty) * Number(orderbook.lastTradedPrice);
        position.equity += (
          Number(position.equity) +
          notionalValue * inflationRate
        ).toString();
        // recalculate liquidation price
      }
    });
  });
}

matching();
setInterval(
  () => {
    fundingRateDespersal();
  },
  8 * 60 * 60 * 1000,
);
