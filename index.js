import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = 4000;
const CACHE_TTL = 15000;
const cache = {};
const MAPPINGS = {
  DJI: '^DJI',
  SPX: '^GSPC',
  NASDAQ: '^IXIC',
  DAX: '^GDAXI',
  FCHI: '^FCHI'
};

function now() {
  return Date.now();
}

async function fetchFromYahoo(symbols) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const payload = await res.json();
  return payload.quoteResponse.result;
}

app.get('/quotes', async (req, res) => {
  const requested = (req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
  const symbols = requested.length ? requested : Object.keys(MAPPINGS);
  try {
    const cacheKey = symbols.join(',');
    if (cache[cacheKey] && now() - cache[cacheKey].ts < CACHE_TTL) {
      return res.json(cache[cacheKey].data);
    }
    const yahooSymbols = symbols.map(sym => MAPPINGS[sym] || sym);
    const result = await fetchFromYahoo(yahooSymbols);
    const payload = result.map(item => ({
      symbol: item.symbol,
      price: item.regularMarketPrice,
      change: item.regularMarketChange,
      changePercent: item.regularMarketChangePercent,
      timestamp: item.regularMarketTime
    }));
    cache[cacheKey] = { ts: now(), data: payload };
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend prêt sur http://localhost:${PORT}`);
});
