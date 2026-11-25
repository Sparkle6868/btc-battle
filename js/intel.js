// BTC 指挥室情报层：跨所三所报价与 Coinbase 溢价、多周期涨跌矩阵、恐慌贪婪指数、全球交易时段
import { fetchJson, binFetch } from './net.js?v=8fcf62d3';
import { lsGet, lsSet } from './storage.js?v=8fcf62d3';

const BIN_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const EX_STALE_MS = 30000;
const EX_POLL_MS = 4000;
const CB_STATS_MS = 60000;
const MTF_POLL_MS = 60000;
const FNG_KEY = 'cw_fng_v1';
const FNG_TTL = 3600e3;

// ---------- 跨所实时报价 + Coinbase 美盘溢价 ----------
export class CrossExchangeFeed {
  constructor({ onData } = {}) {
    this.onData = onData || null;
    this.state = {
      binance: { price: 0, chg: null, ts: 0 },
      okx: { price: 0, chg: null, ts: 0 },
      coinbase: { price: 0, chg: null, ts: 0 },
      activeSrc: null,
      cbPremUsd: null,
      cbPremPct: null,
      okxSpreadUsd: null,
      maxSpreadUsd: null,
      maxSpreadPct: null,
    };
    this.premHist = [];
    this.lastPremSampleAt = 0;
    this.cbOpen = 0;
    this.cbStatsAt = 0;
    this.pollT = null;
    this.emitT = null;
    this.dirty = false;
    this.running = false;
    this._onVis = () => {
      if (!document.hidden && this.running) this._poll();
    };
    document.addEventListener('visibilitychange', this._onVis);
  }

  start() {
    this.running = true;
    this._poll();
    clearInterval(this.pollT);
    this.pollT = setInterval(() => {
      if (!document.hidden && this.running) this._poll();
    }, EX_POLL_MS);
  }

  stop() {
    this.running = false;
    clearInterval(this.pollT); this.pollT = null;
    clearTimeout(this.emitT); this.emitT = null;
    document.removeEventListener('visibilitychange', this._onVis);
  }

  inject(src, price, open24h = 0) {
    if (!this.state[src] || !(price > 0) || !isFinite(price)) return;
    const slot = this.state[src];
    slot.price = price;
    slot.ts = Date.now();
    if (open24h > 0 && isFinite(open24h)) slot.chg = (price / open24h - 1) * 100;
    this.state.activeSrc = src;
    this._recompute();
    this._scheduleEmit();
  }

  _recompute() {
    const now = Date.now();
    const fresh = (s) => {
      const x = this.state[s];
      return x && x.price > 0 && now - x.ts < EX_STALE_MS ? x.price : 0;
    };
    const bn = fresh('binance'), okx = fresh('okx'), cb = fresh('coinbase');
    if (bn > 0 && cb > 0) {
      this.state.cbPremUsd = cb - bn;
      this.state.cbPremPct = (cb / bn - 1) * 100;
      if (now - this.lastPremSampleAt >= 30000 || !this.premHist.length) {
        this.lastPremSampleAt = now;
        this.premHist.push({ ts: now, v: this.state.cbPremUsd });
        if (this.premHist.length > 60) this.premHist.shift();
      }
    } else {
      this.state.cbPremUsd = null;
      this.state.cbPremPct = null;
    }
    this.state.okxSpreadUsd = (bn > 0 && okx > 0) ? (okx - bn) : null;
    const vals = [bn, okx, cb].filter((v) => v > 0);
    if (vals.length >= 2) {
      const mn = Math.min(...vals), mx = Math.max(...vals);
      this.state.maxSpreadUsd = mx - mn;
      this.state.maxSpreadPct = mn > 0 ? (mx / mn - 1) * 100 : null;
    } else {
      this.state.maxSpreadUsd = null;
      this.state.maxSpreadPct = null;
    }
  }

  _scheduleEmit() {
    this.dirty = true;
    if (this.emitT) return;
    this.emitT = setTimeout(() => {
      this.emitT = null;
      if (this.dirty && this.onData) {
        this.dirty = false;
        this.onData(this.snapshot());
      }
    }, 250);
  }

  snapshot() {
    return {
      binance: { ...this.state.binance },
      okx: { ...this.state.okx },
      coinbase: { ...this.state.coinbase },
      activeSrc: this.state.activeSrc,
      cbPremUsd: this.state.cbPremUsd,
      cbPremPct: this.state.cbPremPct,
      okxSpreadUsd: this.state.okxSpreadUsd,
      maxSpreadUsd: this.state.maxSpreadUsd,
      maxSpreadPct: this.state.maxSpreadPct,
      premHist: this.premHist.slice(),
    };
  }

  async _poll() {
    const now = Date.now();
    const need = (s) => s !== this.state.activeSrc || now - this.state[s].ts > 8000;
    const tasks = [];

    if (need('binance')) {
      tasks.push((async () => {
        for (const host of BIN_HOSTS) {
          try {
            const t = await binFetch(`${host}/api/v3/ticker/24hr?symbol=BTCUSDT&type=MINI`, 2, 5000);
            if (t && +t.lastPrice > 0) {
              this.state.binance = {
                price: +t.lastPrice,
                chg: +t.openPrice > 0 ? (+t.lastPrice / +t.openPrice - 1) * 100 : null,
                ts: Date.now(),
              };
              return;
            }
          } catch (e) { if (e.rate) return; }
        }
      })());
    }

    if (need('okx')) {
      tasks.push((async () => {
        try {
          const j = await fetchJson('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT', 5000);
          const d = j && j.data && j.data[0];
          if (d && +d.last > 0) {
            this.state.okx = {
              price: +d.last,
              chg: +d.open24h > 0 ? (+d.last / +d.open24h - 1) * 100 : null,
              ts: Date.now(),
            };
          }
        } catch {}
      })());
    }

    if (need('coinbase')) {
      tasks.push((async () => {
        try {
          const t = await fetchJson('https://api.exchange.coinbase.com/products/BTC-USD/ticker', 5000);
          if (t && +t.price > 0) {
            const px = +t.price;
            this.state.coinbase = {
              price: px,
              chg: this.cbOpen > 0 ? (px / this.cbOpen - 1) * 100 : this.state.coinbase.chg,
              ts: Date.now(),
            };
          }
        } catch {}
      })());
    }

    if (now - this.cbStatsAt >= CB_STATS_MS) {
      this.cbStatsAt = now;
      tasks.push((async () => {
        try {
          const st = await fetchJson('https://api.exchange.coinbase.com/products/BTC-USD/stats', 5000);
          if (st && +st.open > 0) {
            this.cbOpen = +st.open;
            if (this.state.coinbase.price > 0) {
              this.state.coinbase.chg = (this.state.coinbase.price / this.cbOpen - 1) * 100;
            }
          }
        } catch {}
      })());
    }

    if (!tasks.length) return;
    await Promise.allSettled(tasks);
    this._recompute();
    if (this.onData) this.onData(this.snapshot());
  }
}

// ---------- 多周期涨跌矩阵（5m / 15m / 1h / 4h / 24h / 7d） ----------
export class MtfTracker {
  constructor({ onData } = {}) {
    this.onData = onData || null;
    this.refs = { '5m': 0, '15m': 0, '1h': 0, '4h': 0, '24h': 0, '7d': 0 };
    this.dailyOpen = 0;
    this.dailyUtcDay = -1;
    this.cmeGap = null;
    this.candles1h = [];
    this.pollT = null;
    this.running = false;
    this.lastFetchAt = 0;
    this._onVis = () => {
      if (!document.hidden && this.running && Date.now() - this.lastFetchAt >= MTF_POLL_MS) this.refresh();
    };
    document.addEventListener('visibilitychange', this._onVis);
  }

  start() {
    this.running = true;
    this.refresh();
    clearInterval(this.pollT);
    this.pollT = setInterval(() => {
      if (!document.hidden && this.running) this.refresh();
    }, MTF_POLL_MS);
  }

  stop() {
    this.running = false;
    clearInterval(this.pollT); this.pollT = null;
    document.removeEventListener('visibilitychange', this._onVis);
  }

  async _fetchKlines(interval, okxBar, limit) {
    for (const host of BIN_HOSTS) {
      try {
        const d = await binFetch(`${host}/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`, 2, 6000);
        if (Array.isArray(d) && d.length) return d.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
      } catch (e) { if (e.rate) break; }
    }
    try {
      const j = await fetchJson(`https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=${encodeURIComponent(okxBar)}&limit=${limit}`, 6000);
      const d = j && Array.isArray(j.data) ? j.data : [];
      if (d.length) return d.slice().reverse().map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    } catch {}
    return null;
  }

  async refresh() {
    const [k1m, k1h] = await Promise.all([
      this._fetchKlines('1m', '1m', 61),
      this._fetchKlines('1h', '1H', 192),
    ]);
    this.lastFetchAt = Date.now();
    if (k1m && k1m.length > 5) {
      const n = k1m.length;
      if (n > 5) this.refs['5m'] = k1m[n - 1 - 5].o;
      if (n > 15) this.refs['15m'] = k1m[n - 1 - 15].o;
      if (n > 60) this.refs['1h'] = k1m[n - 1 - 60].o;
      else this.refs['1h'] = k1m[0].o;
    }
    if (k1h && k1h.length > 4) {
      const n = k1h.length;
      if (n > 4) this.refs['4h'] = k1h[n - 1 - 4].o;
      if (n > 24) this.refs['24h'] = k1h[n - 1 - 24].o;
      if (n > 168) this.refs['7d'] = k1h[n - 1 - 168].o;
      else this.refs['7d'] = k1h[0].o;
    }
    const utcDayStart = Math.floor(Date.now() / 86400000) * 86400000;
    const utcDay = Math.floor(utcDayStart / 86400000);
    const dayBar = k1h && k1h.find((bar) => bar.t === utcDayStart);
    if (dayBar && dayBar.o > 0) {
      this.dailyOpen = dayBar.o;
      this.dailyUtcDay = utcDay;
    } else if (this.dailyOpen <= 0) {
      const k1d = await this._fetchKlines('1d', '1Dutc', 1);
      if (k1d && k1d[0] && k1d[0].o > 0) {
        this.dailyOpen = k1d[0].o;
        this.dailyUtcDay = Math.floor(k1d[0].t / 86400000);
      } else if (k1h) {
        for (let i = k1h.length - 1; i >= 0; i--) {
          if (k1h[i].t >= utcDayStart - 86400000 && k1h[i].o > 0) {
            this.dailyOpen = k1h[i].o;
            this.dailyUtcDay = utcDay;
            break;
          }
        }
      }
    }
    if (k1h && k1h.length) {
      this.candles1h = k1h;
      this.cmeGap = this._computeCmeGap(k1h);
    }
    if (this.onData) this.onData(this.refs);
  }

  _computeCmeGap(k1h) {
    let fri = null, sun = null;
    for (let i = k1h.length - 1; i >= 0; i--) {
      const b = k1h[i];
      const d = new Date(b.t);
      if (d.getUTCDay() === 0 && d.getUTCHours() === 22 && !sun) {
        sun = { bar: b, idx: i };
      } else if (sun && d.getUTCDay() === 5 && d.getUTCHours() === 21 && sun.bar.t - b.t <= 54 * 3600000 && sun.bar.t - b.t >= 44 * 3600000) {
        fri = { bar: b, idx: i };
        break;
      }
    }
    if (!fri || !sun) return null;
    const close = fri.bar.c, open = sun.bar.o;
    if (!(close > 0) || !(open > 0)) return null;
    const ratio = Math.abs(open - close) / close;
    if (ratio < 0.0015) return null;
    const lo = Math.min(close, open), hi = Math.max(close, open);
    const dir = open > close ? 'up' : 'down';
    let minSeen = open, maxSeen = open;
    for (let i = sun.idx; i < k1h.length; i++) {
      if (k1h[i].l < minSeen) minSeen = k1h[i].l;
      if (k1h[i].h > maxSeen) maxSeen = k1h[i].h;
    }
    const span = Math.max(1, hi - lo);
    const fillPct = dir === 'up'
      ? Math.max(0, Math.min(100, ((hi - minSeen) / span) * 100))
      : Math.max(0, Math.min(100, ((maxSeen - lo) / span) * 100));
    const filled = dir === 'up' ? minSeen <= lo : maxSeen >= hi;
    return { close, open, lo, hi, dir, filled, fillPct, ts: sun.bar.t };
  }

  getCmeGap(livePrice) {
    if (!this.cmeGap) return null;
    const g = { ...this.cmeGap };
    if (livePrice > 0 && !g.filled) {
      const span = Math.max(1, g.hi - g.lo);
      if (g.dir === 'up') {
        if (livePrice <= g.lo) { g.filled = true; g.fillPct = 100; }
        else g.fillPct = Math.max(g.fillPct, Math.min(100, ((g.hi - livePrice) / span) * 100));
      } else {
        if (livePrice >= g.hi) { g.filled = true; g.fillPct = 100; }
        else g.fillPct = Math.max(g.fillPct, Math.min(100, ((livePrice - g.lo) / span) * 100));
      }
    }
    g.distPct = livePrice > 0 ? ((g.close - livePrice) / livePrice) * 100 : null;
    return g;
  }

  compute(livePrice) {
    const out = {};
    for (const k of ['5m', '15m', '1h', '4h', '24h', '7d']) {
      const ref = this.refs[k];
      out[k] = (livePrice > 0 && ref > 0) ? (livePrice / ref - 1) * 100 : null;
    }
    return out;
  }
}

// ---------- 恐慌与贪婪指数（alternative.me，本地缓存 1 小时） ----------
function fngLabelKey(v) {
  if (v <= 24) return 'fngExFear';
  if (v <= 44) return 'fngFear';
  if (v <= 55) return 'fngNeu';
  if (v <= 74) return 'fngGreed';
  return 'fngExGreed';
}

export async function fetchFearGreed(force = false) {
  if (!force) {
    try {
      const c = JSON.parse(lsGet(FNG_KEY, 'null') || 'null');
      if (c && Date.now() - c.fetchedAt < FNG_TTL && isFinite(c.value)) {
        return { ...c, labelKey: fngLabelKey(c.value) };
      }
    } catch {}
  }
  try {
    const j = await fetchJson('https://api.alternative.me/fng/?limit=2', 6000);
    const arr = j && Array.isArray(j.data) ? j.data : [];
    const cur = arr[0] ? +arr[0].value : NaN;
    const prev = arr[1] ? +arr[1].value : NaN;
    if (isFinite(cur)) {
      const data = {
        value: Math.round(cur),
        prev: isFinite(prev) ? Math.round(prev) : null,
        delta: isFinite(prev) ? Math.round(cur - prev) : null,
        labelKey: fngLabelKey(cur),
        ts: arr[0].timestamp ? +arr[0].timestamp * 1000 : Date.now(),
        fetchedAt: Date.now(),
      };
      lsSet(FNG_KEY, JSON.stringify(data));
      return data;
    }
  } catch {}
  try {
    const c = JSON.parse(lsGet(FNG_KEY, 'null') || 'null');
    if (c && isFinite(c.value)) return { ...c, labelKey: fngLabelKey(c.value) };
  } catch {}
  return null;
}

// ---------- 全球交易时段与 CME 休市判定（纯 UTC 本地计算） ----------
const pad = (n) => String(n).padStart(2, '0');
export function getTradingSession(now = new Date()) {
  const utcDay = now.getUTCDay();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const asia = utcH >= 0 && utcH < 9;
  const eu = utcH >= 7 && utcH < 16;
  const us = utcH >= 13 && utcH < 22;
  const overlap = utcH >= 13 && utcH < 16;
  const cmeClosed = (utcDay === 5 && utcH >= 22) || utcDay === 6 || (utcDay === 0 && utcH < 22);
  return {
    asia,
    eu,
    us,
    overlap,
    cmeOpen: !cmeClosed,
    utcStr: `${pad(utcH)}:${pad(utcM)} UTC`,
  };
}
