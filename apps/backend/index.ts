import express from "express";
import { prisma } from "db";
import Jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware";
import { createClient } from "redis";
import { loopback } from "./loopback";

const client = createClient();

const app = express();
app.use(express.json());

/// Auth
app.post("/api/v1/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(411).json({});
    return;
  }

  const response = await prisma.user.create({
    data: {
      username,
      password,
    },
  });

  res.status(200).json({
    id: response.id,
    message: "You are IN",
  });
});

app.post("/api/v1/signin", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(411).json({
      message: "Invalid credentials",
    });
  }

  const user = await prisma.user.findFirst({
    where: {
      username,
      password,
    },
  });

  if (!user) {
    return res.status(411).json({
      message: "Invalid credentials",
    });
  }

  res.status(200).json({
    token: Jwt.sign(
      {
        userId: user.id,
      },
      process.env.JWT_SECRET!,
    ),
  });
});

/// User
app.post("/api/v1/onramp", authMiddleware, async (req, res) => {
  const userId = req.userId!;

  try {
    // publish and wait for the pubsub to return the response
    const queueLoopbackResponse = await loopback({
      messageType: "onramp",
      userId: userId,
      amount: req.body.amount,
    });
    console.log(queueLoopbackResponse);

    /// create unread notification add it there.
    // update it in frontend either directly via pubsub or push from backend
    res.status(200).json({
      message: queueLoopbackResponse,
    });
  } catch (error) {
    console.log("Error while onramping", error);
    res.status(500).json({
      message: "Error while onramping",
    });
  }
});

app.get("/api/v1/balance", authMiddleware, async (req, res) => {
  const userId = req.userId!;

  try {
    const result = await loopback({
      messageType: "balance",
      userId,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(504).json({ message: "Engine timeout" });
  }
});

app.post("/api/v1/withdraw", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const { amount } = req.body();

  try {
    const result = await loopback({
      messageType: "withdraw",
      userId,
      amount,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(504).json({ message: "Engine timeout" });
  }
});

/// Market
app.post("/api/v1/market", async (req, res) => {
  const { symbol, imageUrl } = req.body;
  const token = req.headers.token;
  if (token != process.env.ADMIN_SECRET) {
    res.status(403).json({
      message: "Unauthorized",
    });
    return;
  }

  const response = await prisma.market.create({
    data: {
      slug: symbol,
      imageUrl,
    },
  });

  // publish and wait for the other queue to return the response
  const LoopbackResponse = await loopback({
    messageType: "create_market",
    marketId: response.id.toString(),
  });

  res.json({
    id: response.id,
  });
});

app.post("/api/v1/order", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const { marketId, side, type, price, qty, leverage, slippage } = req.body;

  // validate
  if (!marketId || !side || !type || !qty) {
    return res.status(411).json({ message: "Missing fields" });
  }
  if (side !== "long" && side !== "short") {
    return res.status(411).json({ message: "Invalid side" });
  }
  if (type !== "limit" && type !== "market") {
    return res.status(411).json({ message: "Invalid type" });
  }
  if (type === "limit" && !price) {
    return res.status(411).json({ message: "Limit needs price" });
  }
  if (Number(qty) <= 0) {
    return res.status(411).json({ message: "Invalid qty" });
  }

  // leverage
  const notional = Number(qty) * Number(price ?? 0);
  const initialMargin = (notional / Number(leverage || 1)).toString();

  // first db save and get orderID
  const order = await prisma.order.create({
    data: {
      userId,
      market_id: marketId,
      orderType: type === "limit" ? "Limit" : "Market",
      side: side === "long" ? "Bid" : "Ask",
      price: price,
      slippage: Number(slippage ?? 0),
      qty: qty.toString(),
      initialMargin,
      filledQty: "0",
      status: "Open",
    },
  });

  // send to engine
  try {
    const result = await loopback({
      messageType: "create_order",
      orderId: order.id,
      userId,
      marketId,
      side,
      type,
      price: Number(price ?? 0),
      qty: qty.toString(),
      equity: initialMargin,
      slippage: slippage,
      leverage: leverage,
    });
    res.status(200).json({ orderId: order.id, ...result });
  } catch (e) {
    res.status(504).json({ message: "Engine Timeout" });
  }
});

app.listen(3000);
