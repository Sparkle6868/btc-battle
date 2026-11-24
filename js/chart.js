// BTC 实时 K 线走势图（纯 Canvas 绘制，支持 1m / 5m / 15m / 1h 与鼠标十字光标）
import { fetchJson, binFetch } from './net.js?v=d48474ac';
import { lsGet, lsSet } from './storage.js?v=d48474ac';
import { t as T, fmtNum } from './i18n.js?v=d48474ac';

const TF_KEY = 'cw_tf';
const TF_MS = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3 };
const OKX_BAR = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H' };
const BIN_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const LIMIT = 60;
const RESYNC_MS = 60e3;

const pad = (n) => String(n).padStart(2, '0');
const fmtPx = (p) => p.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtPx2 = (p) => p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export class KlineChart {
  constructor({ canvas, infoEl, onTfChange } = {}) {
    this.canvas = canvas;
    this.infoEl = infoEl || null;
    this.onTfChange = onTfChange || null;
    const saved = lsGet(TF_KEY, '5m');
    this.tf = TF_MS[saved] ? saved : '5m';
    this.candles = [];
    this.gen = 0;
    this.loading = false;
    this.lastFetchAt = 0;
    this.hoverIdx = -1;
    this.drawScheduled = false;
    this.resyncT = null;
    this._bindEvents();
  }

  _bindEvents() {
    if (!this.canvas) return;
    this._onMove = (e) => {
      if (!this.candles.length) return;
      const r = this.canvas.getBoundingClientRect();
      const plotW = Math.max(1, r.width - 62);
      const x = e.clientX - r.left - 4;
      if (x < 0 || x > plotW) {
        if (this.hoverIdx !== -1) { this.hoverIdx = -1; this.draw(); }
        return;
      }
      const idx = Math.max(0, Math.min(this.candles.length - 1, Math.floor((x / plotW) * this.candles.length)));
      if (idx !== this.hoverIdx) { this.hoverIdx = idx; this.draw(); }
    };
    this._onLeave = () => {
      if (this.hoverIdx !== -1) { this.hoverIdx = -1; this.draw(); }
    };
    this._onVis = () => {
      if (!document.hidden && Date.now() - this.lastFetchAt >= RESYNC_MS) this.refresh();
    };
    this._onResize = () => this.scheduleDraw();

    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerleave', this._onLeave);
    document.addEventListener('visibilitychange', this._onVis);
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.scheduleDraw());
      this._ro.observe(this.canvas);
    }
  }

  start() {
    this.setTf(this.tf, { force: true });
    clearInterval(this.resyncT);
    this.resyncT = setInterval(() => {
      if (!document.hidden) this.refresh();
    }, RESYNC_MS);
  }

  stop() {
    this.gen++;
    clearInterval(this.resyncT);
    this.resyncT = null;
    if (this.canvas) {
      this.canvas.removeEventListener('pointermove', this._onMove);
      this.canvas.removeEventListener('pointerleave', this._onLeave);
    }
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('resize', this._onResize);
    if (this._ro) this._ro.disconnect();
  }

  setTf(tf, { force = false } = {}) {
    if (!TF_MS[tf]) return;
    if (!force && tf === this.tf && this.candles.length) return;
    this.tf = tf;
    lsSet(TF_KEY, tf);
    this.hoverIdx = -1;
    if (this.onTfChange) this.onTfChange(tf);
    this.refresh();
  }

  async refresh() {
    const gen = ++this.gen;
    const tf = this.tf;
    this.loading = true;
    if (!this.candles.length) this.scheduleDraw();
    const rows = await this._fetchCandles(tf);
    if (gen !== this.gen) return;
    this.loading = false;
    if (rows && rows.length) {
      this.candles = rows;
      this.lastFetchAt = Date.now();
    }
    this.draw();
  }

  async _fetchCandles(tf) {
    for (const host of BIN_HOSTS) {
      try {
        const d = await binFetch(`${host}/api/v3/klines?symbol=BTCUSDT&interval=${tf}&limit=${LIMIT}`, 2, 6000);
        if (Array.isArray(d) && d.length) {
          return d.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
        }
      } catch (e) { if (e.rate) break; }
    }
    try {
      const bar = OKX_BAR[tf] || '5m';
      const j = await fetchJson(`https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=${encodeURIComponent(bar)}&limit=${LIMIT}`, 6000);
      const d = j && Array.isArray(j.data) ? j.data : [];
      if (d.length) {
        return d.slice().reverse().map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
      }
    } catch {}
    return null;
  }

  onTrade({ price, qty, ts }) {
    if (!(price > 0) || !isFinite(price) || !this.candles.length) return;
    const tfMs = TF_MS[this.tf];
    const bucket = Math.floor((ts || Date.now()) / tfMs) * tfMs;
    const arr = this.candles;
    const last = arr[arr.length - 1];
    if (bucket === last.t) {
      if (price > last.h) last.h = price;
      if (price < last.l) last.l = price;
      last.c = price;
      last.v += qty > 0 ? qty : 0;
    } else if (bucket > last.t) {
      const o = last.c;
      arr.push({
        t: bucket,
        o,
        h: Math.max(o, price),
        l: Math.min(o, price),
        c: price,
        v: qty > 0 ? qty : 0,
      });
      if (arr.length > LIMIT) arr.splice(0, arr.length - LIMIT);
    }
    if (!document.hidden) this.scheduleDraw();
  }

  scheduleDraw() {
    if (this.drawScheduled) return;
    this.drawScheduled = true;
    setTimeout(() => {
      this.drawScheduled = false;
      if (!document.hidden) this.draw();
    }, 150);
  }

  _updateInfo() {
    if (!this.infoEl) return;
    const arr = this.candles;
    if (!arr.length) {
      this.infoEl.textContent = T('klineWait');
      this.infoEl.className = 'kline-info';
      return;
    }
    const c = this.hoverIdx >= 0 && arr[this.hoverIdx] ? arr[this.hoverIdx] : arr[arr.length - 1];
    const d = new Date(c.t);
    const tm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const up = c.c >= c.o;
    const pct = c.o ? ((c.c / c.o - 1) * 100) : 0;
    this.infoEl.className = 'kline-info ' + (up ? 'up' : 'down');
    this.infoEl.innerHTML =
      `<span>${tm}</span>` +
      `<span>O <b>${fmtPx(c.o)}</b></span>` +
      `<span>H <b>${fmtPx(c.h)}</b></span>` +
      `<span>L <b>${fmtPx(c.l)}</b></span>` +
      `<span>C <b>${fmtPx(c.c)}</b> (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span>` +
      `<span>V <b>${fmtNum(c.v)}</b></span>`;
  }

  draw() {
    this._updateInfo();
    const cv = this.canvas;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);

    const arr = this.candles;
    if (!arr.length) {
      ctx.fillStyle = 'rgba(230,235,255,0.5)';
      ctx.font = '12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(T('klineWait'), W / 2, H / 2);
      return;
    }

    const leftPad = 4, axisW = 58, plotW = Math.max(40, W - leftPad - axisW);
    const topPad = 10, candleBot = Math.round(H * 0.74), candleH = Math.max(30, candleBot - topPad);
    const volTop = candleBot + 5, volBot = H - 14, volH = Math.max(10, volBot - volTop);

    let minP = Infinity, maxP = -Infinity, maxV = 0, hiIdx = 0, loIdx = 0;
    for (let i = 0; i < arr.length; i++) {
      const k = arr[i];
      if (k.h > maxP) { maxP = k.h; hiIdx = i; }
      if (k.l < minP) { minP = k.l; loIdx = i; }
      if (k.v > maxV) maxV = k.v;
    }
    const span = Math.max(maxP - minP, maxP * 0.0008, 1);
    const pHi = maxP + span * 0.08, pLo = minP - span * 0.08, pRange = pHi - pLo;
    const yOf = (p) => topPad + ((pHi - p) / pRange) * candleH;

    // 网格线与右侧价格刻度
    ctx.strokeStyle = 'rgba(120,140,200,0.1)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(140,150,184,0.75)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    for (const frac of [0.22, 0.5, 0.78]) {
      const y = Math.round(topPad + candleH * frac) + 0.5;
      const p = pHi - pRange * frac;
      ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(leftPad + plotW, y); ctx.stroke();
      ctx.fillText(fmtPx(p), leftPad + plotW + 5, y + 3);
    }

    const step = plotW / arr.length;
    const bodyW = Math.max(2, Math.min(8, step * 0.64));

    // 成交量柱 + K 线
    for (let i = 0; i < arr.length; i++) {
      const k = arr[i];
      const cx = leftPad + (i + 0.5) * step;
      const up = k.c >= k.o;
      const bodyCol = up ? '#3b82f6' : '#ef4444';
      const wickCol = up ? '#93c5fd' : '#fca5a5';

      if (maxV > 0 && k.v > 0) {
        const vh = Math.max(1.5, (k.v / maxV) * volH);
        ctx.fillStyle = up ? 'rgba(59,130,246,0.35)' : 'rgba(239,68,68,0.35)';
        ctx.fillRect(cx - bodyW / 2, volBot - vh, bodyW, vh);
      }

      const yh = yOf(k.h), yl = yOf(k.l), yo = yOf(k.o), yc = yOf(k.c);
      ctx.strokeStyle = wickCol;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, yh); ctx.lineTo(cx, yl); ctx.stroke();

      const bt = Math.min(yo, yc), bh = Math.max(1.5, Math.abs(yc - yo));
      ctx.fillStyle = bodyCol;
      ctx.fillRect(cx - bodyW / 2, bt, bodyW, bh);
    }

    // 周期最高 / 最低价标注
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    const hiX = Math.max(leftPad + 24, Math.min(leftPad + plotW - 26, leftPad + (hiIdx + 0.5) * step));
    const loX = Math.max(leftPad + 24, Math.min(leftPad + plotW - 26, leftPad + (loIdx + 0.5) * step));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(fmtPx(maxP), hiX, Math.max(9, yOf(maxP) - 2));
    ctx.fillStyle = '#fca5a5';
    ctx.fillText(fmtPx(minP), loX, Math.min(candleBot + 2, yOf(minP) + 9));

    // 底部时间轴
    ctx.fillStyle = 'rgba(140,150,184,0.65)';
    ctx.font = '9.5px "JetBrains Mono", monospace';
    const ticks = [0, Math.floor(arr.length / 2), arr.length - 1];
    ticks.forEach((idx, ti) => {
      const k = arr[idx]; if (!k) return;
      const d = new Date(k.t), lbl = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const x = leftPad + (idx + 0.5) * step;
      ctx.textAlign = ti === 0 ? 'left' : ti === 2 ? 'right' : 'center';
      ctx.fillText(lbl, ti === 0 ? leftPad : ti === 2 ? leftPad + plotW : x, H - 2);
    });

    // 最新价虚线与右侧标签
    const last = arr[arr.length - 1];
    const lastY = Math.max(topPad, Math.min(candleBot, yOf(last.c)));
    const lastUp = last.c >= last.o;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = lastUp ? 'rgba(96,165,250,0.85)' : 'rgba(248,113,113,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(leftPad, lastY); ctx.lineTo(leftPad + plotW, lastY); ctx.stroke();
    ctx.restore();

    const tagX = leftPad + plotW + 3, tagY = Math.max(2, Math.min(candleBot - 14, lastY - 8));
    ctx.fillStyle = lastUp ? '#2563eb' : '#dc2626';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tagX, tagY, axisW - 4, 16, 4); else ctx.rect(tagX, tagY, axisW - 4, 16);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(fmtPx2(last.c), tagX + (axisW - 4) / 2, tagY + 11.5);

    // 悬停十字线
    if (this.hoverIdx >= 0 && arr[this.hoverIdx]) {
      const k = arr[this.hoverIdx];
      const hx = leftPad + (this.hoverIdx + 0.5) * step;
      const hy = yOf(k.c);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(253,230,138,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, topPad); ctx.lineTo(hx, volBot); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(leftPad, hy); ctx.lineTo(leftPad + plotW, hy); ctx.stroke();
      ctx.restore();
    }
  }
}
