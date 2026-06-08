import express from "express";

const app = express();

app.post("/api/v1/signup", async (req, res) => {
  const { username, password } = req.body();
});

app.listen(3000);
