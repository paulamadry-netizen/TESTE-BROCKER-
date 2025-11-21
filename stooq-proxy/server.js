import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

app.get("/price", async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    const line = text.split("\n")[1];
    const parts = line.split(",");
    const last = parseFloat(parts[6]);

    if (!isNaN(last)) res.json({ price: last });
    else res.status(500).json({ error: "Invalid price" });

  } catch (err) {
    res.status(500).json({ error: "Failed to fetch price" });
  }
});

app.get("/", (req, res) => {
  res.send("Stooq Proxy OK");
});

app.listen(10000, () => {
  console.log("Proxy running on port 10000");
});
