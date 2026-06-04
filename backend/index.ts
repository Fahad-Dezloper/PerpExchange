import express from "express";

const app = express();
app.use(express.json());

const users = [
  {
    userId: 1,
    username: "harkirat",
    password: 123123,
    collateral: {
      availabe: 2000,
      locked: 1000,
    },
    positions: [
      {
        postionId: 1,
        market: "SOL",
        type: "LONG",
        qty: 10,
        margin: 500,
        liquidationPrice: 80,
        averagePrice: 90,
      },
      {
        positionId: 2,
        market: "ETH",
        type: "SHORT",
        qty: 1,
        margin: 500,
        liquidationPrice: 2000,
        averagePrice: 1900,
      },
    ],
    orders: [
      {
        orderId: 1,
        market: "SOL",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 90,
        status: "filled",
      },
      {
        orderId: 2,
        market: "ETH",
        type: "SHORT",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "filled",
      },
      {
        orderId: 3,
        market: "BTC",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "cancelled",
      },
    ],
  },
  {
    userId: 2,
    username: "raman",
    password: 123123,
    collateral: {
      availabe: 2000,
      locked: 2000,
    },
    positions: [
      {
        market: "SOL",
        type: "SHORT",
        qty: 10,
        margin: 1000,
        liquidationPrice: 80,
        pnL: 200,
        averagePrice: 90,
      },
      {
        market: "ETH",
        type: "LONG",
        qty: 1,
        margin: 1000,
        liquidationPrice: 2000,
        pnL: -100,
        averagePrice: 1900,
      },
    ],
    orders: [
      {
        orderId: 10,
        market: "SOL",
        type: "SHORT",
        qty: 10,
        margin: 500,
        orderType: "market",
        price: 90,
        status: "filled",
      },
      {
        orderId: 11,
        market: "ETH",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "market",
        price: 1900,
        status: "filled",
      },
      {
        orderId: 12,
        market: "ZEC",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "open",
      },
    ],
  },
];

function isExistingUser(username: String) {
  const existingUser = users.find((user) => user.username === username);
  return existingUser;
}

function liquidationPrice(
  type: string,
  averagePrice: number,
  margin: number,
  qty: number,
): number {
  if (type === "LONG") {
    return averagePrice - margin / qty;
  } else {
    return averagePrice + margin / qty;
  }
}

// User signup
app.post("/signup", (req, res) => {
  const { username, password } = req.body;

  if (isExistingUser(username)) {
    return res.status(400).json({
      message: "User already exists",
    });
  }

  const userDets = {
    userId: users.length + 1,
    username,
    password,
    collateral: {
      availabe: 0,
      locked: 0,
    },
    positions: [],
    orders: [],
  };

  users.push(userDets);

  res.status(200).json({
    message: "User created successfully",
    userDets: userDets,
  });
});

app.post("/signin", (req, res) => {
  const { username, password } = req.body;

  if (!isExistingUser(username)) {
    res.status(401).json({
      message: "User dont exist",
    });
  } else {
    res.status(200).json({
      message: "Welcome Home",
      token: "123456789",
    });
  }
});

app.post("/onramp", (req, res) => {
  const { amount, userId } = req.body;

  const user = users.find((user) => user.userId === userId);

  if (!user) {
    return res.status(401).json({
      message: "Provide correct user id",
    });
  }

  user.collateral.availabe += amount;
  res.status(200).json({
    message: "User on-ramped successfully",
    user: user,
  });
});

app.post("/order", (req, res) => {
  const { userId, market, type, qty, margin, orderType, price } = req.body;

  const user = users.find((user) => user.userId === userId);

  if (!user) {
    return res.status(401).json({
      message: "Provide correct user id",
    });
  } else {
    // considering orderType is always gonna be limit
    const createOrder = {
      orderId: user.orders.length + 1,
      market,
      type,
      qty,
      margin,
      orderType,
      price,
      status: "open",
    };

    const createPosition = {
      positionId: user.positions.length + 1,
      market,
      type,
      qty,
      margin,
      liquidationPrice: liquidationPrice(type, price, margin, qty),
      pnL: 0,
      averagePrice: price,
    };

    user.orders.push(createOrder);
    user.positions.push(createPosition);
    user.collateral.availabe -= margin;
    user.collateral.locked += margin;

    res.status(200).json({
      message: "Order placed successfully",
      order: createOrder,
    });
  }
});
app.delete("/order", (req, res) => {
  const { orderId, username } = req.body;

  const user = isExistingUser(username);

  if (!isExistingUser(username)) {
    return res.status(401).json({
      message: "Provide correct username",
    });
  } else {
    const userOrder = user?.orders.find((order) => order.orderId === orderId);
    if (!userOrder) {
      return res.status(401).json({
        message: "Provide correct order id",
      });
    }

    console.log("order is this", userOrder);

    userOrder.status = "cancelled";

    if (user?.collateral) {
      user.collateral.availabe += userOrder.margin;
      user.collateral.locked -= userOrder.margin;
    }

    // user?.positions.filter((pos) => pos.positionId === userOrder);
  }
});
app.get("/equity/available", (req, res) => {});
app.get("/positions/open/:marketId", (req, res) => {});
app.get("/positions/closed/:marketId", (req, res) => {});
app.get("/orders/open/:marketId", (req, res) => {});
app.get("/orders/:marketId", (req, res) => {});
app.get("/fills", (req, res) => {});

const server = app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

server.on("error", (error) => {
  console.error("Server error:", error);
});

async function liqudationChecks(asset: string, price: number) {}

async function onPriceUpdateFromBinance(asset: string, price: number) {
  liqudationChecks(asset, price);
}
