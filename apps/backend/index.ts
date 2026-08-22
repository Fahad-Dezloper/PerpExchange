import express from "express";
import { prisma } from "db";
import { authMiddleware } from "./middleware";
import { initQueue, loopback } from "./loopback";
import { ulid } from "ulid";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import { error } from "better-auth/api";

const app = express();

app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Origin",
    process.env.FRONTEND_URL ?? "http://localhost:3002",
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT, DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "content-type, token, authorization",
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Expose-Headers", "set-auth-token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

const GRANULARITYL: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 21600,
  "1D": 86400,
};

function toCoinbaseProduct(slug: string) {
  return `${slug.split("-")[0]?.toUpperCase()}-USD`;
}

/// User
app.post("/api/v1/onramp", authMiddleware, async (req, res) => {
  const userId = req.userId!;

  try {
    const queueLoopbackResponse = await loopback({
      messageType: "onramp",
      userId: userId,
      amount: req.body.amount,
    });

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

app.get("/api/v1/markets", async (_req, res) => {
  const markets = await prisma.market.findMany();
  res.json(markets);
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
  const {
    marketId,
    side,
    type,
    price,
    qty,
    leverage,
    slippage,
    clientId,
    marginMode,
  } = req.body;

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

  const orderId = `ODR-${ulid()}`;

  // send to engine
  try {
    const result = await loopback({
      messageType: "create_order",
      orderId,
      clientId: clientId ?? orderId,
      userId,
      marketId,
      side,
      type,
      price: Number(price ?? 0),
      qty: qty.toString(),
      equity: initialMargin,
      slippage: slippage,
      leverage: leverage,
      marginMode: marginMode ?? "isolated",
    });
    res.status(200).json({ orderId, ...result });
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

app.get("/api/v1/orders", authMiddleware, async (req, res) => {
  try {
    const result = await loopback({
      messageType: "get_open_orders",
      userId: req.userId!,
    });
    res.status(200).json(result);
  } catch {
    res.status(504).json({ message: "Engine timeout" });
  }
});

app.get("/api/v1/klines", async (req, res) => {
  try {
    const marketId = String(req.query.marketId ?? "");
    const interval = String(req.query.interval ?? "5m");
    const market = await prisma.market.findUnique({ where: { id: marketId } });
    if (!market) return res.status(404).json({ error: "market not found" });

    const product = toCoinbaseProduct(market.slug);
    const granularity = GRANULARITYL[interval] ?? 300;

    const r = await fetch(
      `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularity}`,
      { headers: { "User-Agent": "perp-exchange" } },
    );
    if (!r.ok) return res.status(502).json({ error: `coinbase ${r.status}` });

    const rows = (await r.json()) as [number, number, number, number, number][];
    const candles = rows
      .map(([time, low, high, open, close]) => ({
        time,
        open,
        high,
        low,
        close,
      }))
      .sort((a, b) => a.time - b.time); // ascending order
    res.json({ candles });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

await initQueue();
app.listen(3000);
