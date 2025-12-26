const { Firestore } = require('@google-cloud/firestore');

class LiveCandleService {
  constructor() {
    this.enabled = String(process.env.LIVE_HISTORY_ENABLED || 'true') === 'true';
    this.collection = process.env.LIVE_HISTORY_COLLECTION || 'ig_live_1m';
    this.flushIntervalMs = parseInt(process.env.LIVE_HISTORY_FLUSH_MS) || 10000;
    this.maxHours = parseInt(process.env.LIVE_HISTORY_MAX_HOURS) || 168;

    this._db = null;
    this._flushTimer = null;

    this._current = new Map();

    this._pending = [];
  }

  _getDb() {
    if (!this._db) this._db = new Firestore();
    return this._db;
  }

  start() {
    if (!this.enabled) return;
    if (this._flushTimer) return;

    this._flushTimer = setInterval(() => {
      this.flush().catch((e) => {
        console.warn('[LiveHistory] Flush failed:', e.message);
      });
    }, this.flushIntervalMs);
  }

  stop() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  _midFromPrice(price) {
    const bid = Number(price?.bid);
    const offer = Number(price?.offer);
    if (Number.isFinite(bid) && Number.isFinite(offer)) return (bid + offer) / 2;

    const last = Number(price?.lastTraded);
    if (Number.isFinite(last)) return last;

    const v = Number(price?.price);
    if (Number.isFinite(v)) return v;

    return null;
  }

  _minuteStartMs(tsMs) {
    return Math.floor(tsMs / 60000) * 60000;
  }

  _hourStartMs(tsMs) {
    return Math.floor(tsMs / 3600000) * 3600000;
  }

  _finalizeIfNeeded(epic, nowMs) {
    const cur = this._current.get(epic);
    if (!cur) return;

    if (nowMs >= cur.minuteStartMs + 60000) {
      const candle = {
        time: Math.floor(cur.minuteStartMs / 1000),
        open: cur.open,
        high: cur.high,
        low: cur.low,
        close: cur.close,
        volume: 0,
      };

      const hourStartMs = this._hourStartMs(cur.minuteStartMs);
      const minuteKey = `m${Math.floor(cur.minuteStartMs / 1000)}`;

      this._pending.push({ epic, hourStartMs, minuteKey, candle });
      this._current.delete(epic);
    }
  }

  ingestPrice(price) {
    if (!this.enabled) return;
    if (!price || typeof price.epic !== 'string' || !price.epic) return;

    const epic = price.epic;
    const tsMs = Number(price.timestamp) || Date.now();
    const mid = this._midFromPrice(price);
    if (!Number.isFinite(mid) || mid <= 0) return;

    const minuteStartMs = this._minuteStartMs(tsMs);

    const existing = this._current.get(epic);
    if (!existing) {
      this._current.set(epic, {
        minuteStartMs,
        open: mid,
        high: mid,
        low: mid,
        close: mid,
        lastTickMs: tsMs,
      });
      return;
    }

    // If we moved to a new minute, finalize old candle and start new one.
    if (minuteStartMs !== existing.minuteStartMs) {
      const candle = {
        time: Math.floor(existing.minuteStartMs / 1000),
        open: existing.open,
        high: existing.high,
        low: existing.low,
        close: existing.close,
        volume: 0,
      };
      const hourStartMs = this._hourStartMs(existing.minuteStartMs);
      const minuteKey = `m${Math.floor(existing.minuteStartMs / 1000)}`;
      this._pending.push({ epic, hourStartMs, minuteKey, candle });

      this._current.set(epic, {
        minuteStartMs,
        open: mid,
        high: mid,
        low: mid,
        close: mid,
        lastTickMs: tsMs,
      });
      return;
    }

    existing.high = Math.max(existing.high, mid);
    existing.low = Math.min(existing.low, mid);
    existing.close = mid;
    existing.lastTickMs = tsMs;
  }

  async flush() {
    if (!this.enabled) return;

    const nowMs = Date.now();

    for (const epic of this._current.keys()) {
      this._finalizeIfNeeded(epic, nowMs);
    }

    if (this._pending.length === 0) return;

    const db = this._getDb();
    const batch = db.batch();

    const items = this._pending.splice(0, 400);

    for (const it of items) {
      const epicDoc = db.collection(this.collection).doc(it.epic);
      const hourDoc = epicDoc.collection('hours').doc(String(it.hourStartMs));

      batch.set(
        hourDoc,
        {
          hourStartMs: it.hourStartMs,
          updatedAt: nowMs,
          candles: {
            [it.minuteKey]: it.candle,
          },
        },
        { merge: true }
      );
    }

    await batch.commit();
  }

  async getDerivedHistory(epic, resolution, max) {
    if (!this.enabled) return null;

    const minutesPerCandle = {
      MINUTE: 1,
      MINUTE_5: 5,
      MINUTE_15: 15,
      HOUR: 60,
      HOUR_4: 240,
      DAY: 1440,
    }[String(resolution)] || 60;

    const maxN = Math.max(1, Math.min(2000, parseInt(max) || 100));
    const minutesNeeded = maxN * minutesPerCandle;
    const hoursNeeded = Math.min(this.maxHours, Math.ceil(minutesNeeded / 60) + 2);

    const db = this._getDb();
    const hoursCol = db.collection(this.collection).doc(epic).collection('hours');

    const snaps = await hoursCol.orderBy('hourStartMs', 'desc').limit(hoursNeeded).get();
    if (snaps.empty) return null;

    const oneMinute = [];
    snaps.forEach((doc) => {
      const d = doc.data();
      const candlesMap = d && d.candles ? d.candles : null;
      if (!candlesMap || typeof candlesMap !== 'object') return;
      for (const k of Object.keys(candlesMap)) {
        const c = candlesMap[k];
        if (!c) continue;
        const t = Number(c.time);
        const o = Number(c.open);
        const h = Number(c.high);
        const l = Number(c.low);
        const cl = Number(c.close);
        if (!Number.isFinite(t) || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(cl)) continue;
        oneMinute.push({ time: t, open: o, high: h, low: l, close: cl, volume: 0 });
      }
    });

    if (oneMinute.length === 0) return null;

    oneMinute.sort((a, b) => a.time - b.time);

    // Dedup by time
    const dedup = [];
    for (const c of oneMinute) {
      const prev = dedup[dedup.length - 1];
      if (prev && prev.time === c.time) dedup[dedup.length - 1] = c;
      else dedup.push(c);
    }

    const bucketSec = minutesPerCandle * 60;
    const grouped = new Map();

    for (const c of dedup) {
      const b = Math.floor(c.time / bucketSec) * bucketSec;
      const cur = grouped.get(b);
      if (!cur) {
        grouped.set(b, { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 });
      } else {
        cur.high = Math.max(cur.high, c.high);
        cur.low = Math.min(cur.low, c.low);
        cur.close = c.close;
      }
    }

    const out = Array.from(grouped.values()).sort((a, b) => a.time - b.time);
    const sliced = out.slice(Math.max(0, out.length - maxN));

    if (sliced.length === 0) return null;
    return sliced;
  }
}

module.exports = new LiveCandleService();
