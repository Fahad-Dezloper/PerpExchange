import express from "express";
import { prisma } from "db";

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

app.listen(3000);
