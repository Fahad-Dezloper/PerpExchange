import express from "express";
import { prisma } from "db";
import Jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware";
import { initQueue, loopback } from "./loopback";
import { ulid } from "ulid";

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
  const { amount } = req.body;

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

  console.log("reached here", response);

  // publish and wait for the other queue to return the response
  const LoopbackResponse = await loopback({
    messageType: "create_market",
    marketId: response.id.toString(),
  });

  console.log("loop back response", LoopbackResponse);

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
  const orderId = `ODR-${ulid()}`;
  console.log("order id", orderId);

  // send to engine
  try {
    const result = await loopback({
      messageType: "create_order",
      orderId,
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
    res.status(200).json({ orderId: orderId, ...result });
  } catch (e) {
    res.status(504).json({ message: "Engine Timeout" });
  }
});

app.post("/api/v1/order/cancel", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const { orderId, marketId } = req.body;

  if (!orderId || !marketId) {
    return res.status(411).json({ message: "Missing orderId" });
  }

  try {
    const result = await loopback({
      messageType: "cancel_order",
      orderId,
      marketId,
      userId,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(504).json({ message: "Engine timeout" });
  }
});

app.post("/api/v1/depth", async (req, res) => {
  const marketId = req.query.marketId as string;

  if (!marketId) {
    return res.status(411).json({ message: "Missing Market ID" });
  }

  try {
    const result = await loopback({
      messageType: "get_depth",
      marketId,
    });
    // { bids: [...], asks: [...] }
    res.status(200).json(result);
  } catch (e) {
    res.status(504).json({ message: "Engine timeout" });
  }
});

app.get("/api/v1/positions", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  try {
    const result = await loopback({ messageType: "get_positions", userId });
    res.status(200).json(result);
  } catch (e) {
    res.status(504).json({ message: "Engine timeout" });
  }
});

await initQueue();
app.listen(3000);
