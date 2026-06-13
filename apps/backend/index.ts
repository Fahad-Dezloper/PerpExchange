import express from "express";
import { prisma } from "db";
import Jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware";
import { createClient } from "redis";
import { loopback } from "./loopback";

const client = createClient();

const app = express();
app.use(express.json());

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
        id: user.id,
      },
      process.env.JWT_SECRET!,
    ),
  });
});

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
  const queueLoopbackResponse = await loopback({
    messageType: "create_market",
    marketId: response.id,
  });

  res.json({
    id: response.id,
  });
});

app.post("/api/v1/onramp", authMiddleware, async (req, res) => {
  const userId = req.userId!;

  // publish and wait for the other queue to return the response
  const queueLoopbackResponse = await loopback({
    messageType: "onramp",
    userId: userId,
    amount: req.body.amount.toString(),
  });
});

app.post("api/v1/order", authMiddleware, (req, res) => {
  const userId = req.userId;
});

app.listen(3000);
