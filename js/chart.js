// BTC 实时 K 线走势图（纯 Canvas 绘制，支持 1m / 5m / 15m / 1h 与鼠标十字光标）
import { fetchJson, binFetch } from './net.js?v=8fcf62d3';
import { lsGet, lsSet } from './storage.js?v=8fcf62d3';
import { t as T, fmtNum } from './i18n.js?v=8fcf62d3';

const TF_KEY = 'cw_tf';
const OV_KEY = 'cw_chart_ov';
const TF_MS = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3 };
const OKX_BAR = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1Dutc' };
const BIN_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const LIMIT = 120;
const RESYNC_MS = 60e3;

const pad = (n) => String(n).padStart(2, '0');
const fmtPx = (p) => p.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtPx2 = (p) => p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export class KlineChart {
  constructor({ canvas, infoEl, onTfChange, onOvChange } = {}) {
    this.canvas = canvas;
    this.infoEl = infoEl || null;
    this.onTfChange = onTfChange || null;
    this.onOvChange = onOvChange || null;
    const saved = lsGet(TF_KEY, '5m');
    this.tf = TF_MS[saved] ? saved : '5m';
    let ov0 = {};
    try { ov0 = JSON.parse(lsGet(OV_KEY, '{}') || '{}') || {}; } catch {}
    this.ov = Object.assign({ vwap: true, vpvr: true, lines: true }, ov0);
    this.candles = [];
    this.markers = [];
    this.overlays = { anchor: 0, step: 1, liqZones: [] };
    this.gen = 0;
    this.loading = false;
    this.lastFetchAt = 0;
    this.hoverIdx = -1;
    this.viewCount = 60;
    this.viewOffset = 0;
    this.dragging = false;
    this.dragX = 0;
    this.dragOff = 0;
    this.hlTs = 0;
    this.hlUntil = 0;
    this.drawScheduled = false;
    this.resyncT = null;
    this._bindEvents();
  }

  _visibleRange() {
    const n = this.candles.length;
    if (!n) return [0, 0];
    const cnt = Math.min(n, Math.max(20, this.viewCount));
    const maxOff = Math.max(0, n - cnt);
    const off = Math.max(0, Math.min(maxOff, this.viewOffset));
    this.viewOffset = off;
    const end = n - off;
    const start = Math.max(0, end - cnt);
    return [start, end];
  }

  _bindEvents() {
    if (!this.canvas) return;
    this._onDown = (e) => {
      if (e.button !== 0 || !this.candles.length) return;
      this.dragging = true;
      this.dragX = e.clientX;
      this.dragOff = this.viewOffset;
      this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
    };
    this._onUp = () => { this.dragging = false; };
    this._onMove = (e) => {
      if (!this.candles.length) return;
      const r = this.canvas.getBoundingClientRect();
      const plotW = Math.max(1, r.width - 62);
      const [start, end] = this._visibleRange();
      const cnt = Math.max(1, end - start);
      if (this.dragging) {
        const dx = e.clientX - this.dragX;
        const delta = Math.round((dx / plotW) * cnt);
        const nextOff = Math.max(0, Math.min(Math.max(0, this.candles.length - cnt), this.dragOff + delta));
        if (nextOff !== this.viewOffset) {
          this.viewOffset = nextOff;
          this.hoverIdx = -1;
          this.draw();
        }
        return;
      }
      const x = e.clientX - r.left - 4;
      if (x < 0 || x > plotW) {
        if (this.hoverIdx !== -1) { this.hoverIdx = -1; this.draw(); }
        return;
      }
      const local = Math.max(0, Math.min(cnt - 1, Math.floor((x / plotW) * cnt)));
      const idx = start + local;
      if (idx !== this.hoverIdx) { this.hoverIdx = idx; this.draw(); }
    };
    this._onWheel = (e) => {
      if (!this.candles.length) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? 8 : -8;
      this.viewCount = Math.max(24, Math.min(Math.max(24, this.candles.length), this.viewCount + step));
      this.hoverIdx = -1;
      this.draw();
    };
    this._onLeave = () => {
      this.dragging = false;
      if (this.hoverIdx !== -1) { this.hoverIdx = -1; this.draw(); }
    };
    this._onVis = () => {
      if (!document.hidden && Date.now() - this.lastFetchAt >= RESYNC_MS) this.refresh();
    };
    this._onResize = () => this.scheduleDraw();

    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerleave', this._onLeave);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('visibilitychange', this._onVis);
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.scheduleDraw());
      this._ro.observe(this.canvas);
    }
  }

  start() {
    this.setTf(this.tf, { force: true });
    if (this.onOvChange) this.onOvChange({ ...this.ov });
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
      this.canvas.removeEventListener('pointerdown', this._onDown);
      this.canvas.removeEventListener('pointermove', this._onMove);
      this.canvas.removeEventListener('pointerleave', this._onLeave);
      this.canvas.removeEventListener('wheel', this._onWheel);
    }
    window.removeEventListener('pointerup', this._onUp);
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('resize', this._onResize);
    if (this._ro) this._ro.disconnect();
  }

  toggleOverlay(key) {
    if (!(key in this.ov)) return;
    this.ov[key] = !this.ov[key];
    lsSet(OV_KEY, JSON.stringify(this.ov));
    if (this.onOvChange) this.onOvChange({ ...this.ov });
    this.draw();
  }

  setOverlays({ anchor, step, liqZones } = {}) {
    if (anchor != null) this.overlays.anchor = anchor;
    if (step != null) this.overlays.step = step;
    if (liqZones != null) this.overlays.liqZones = liqZones;
    if (!document.hidden) this.scheduleDraw();
  }

  addMarker({ ts, price, type, side, usd }) {
    if (!(ts > 0) || !(price > 0)) return;
    this.markers.push({ ts, price, type, side, usd });
    if (this.markers.length > 40) this.markers.shift();
    if (!document.hidden) this.scheduleDraw();
  }

  highlightTs(ts) {
    if (!(ts > 0)) return;
    this.hlTs = ts;
    this.hlUntil = Date.now() + 2600;
    this.draw();
    setTimeout(() => { if (!document.hidden) this.draw(); }, 2700);
  }

  setTf(tf, { force = false } = {}) {
    if (!TF_MS[tf]) return;
    if (!force && tf === this.tf && this.candles.length) return;
    this.tf = tf;
    lsSet(TF_KEY, tf);
    this.hoverIdx = -1;
    this.viewOffset = 0;
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

    const all = this.candles;
    if (!all.length) {
      ctx.fillStyle = 'rgba(230,235,255,0.5)';
      ctx.font = '12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(T('klineWait'), W / 2, H / 2);
      return;
    }

    const [vStart, vEnd] = this._visibleRange();
    const arr = all.slice(vStart, vEnd);
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

    // 图层 A：VPVR 筹码分布峰（右侧水平柱 + POC）
    if (this.ov.vpvr && arr.length >= 6 && maxP > minP) {
      const NB = 20, bins = new Float64Array(NB);
      const bSpan = (maxP - minP) / NB;
      for (const k of arr) {
        const i0 = Math.max(0, Math.min(NB - 1, Math.floor((k.l - minP) / bSpan)));
        const i1 = Math.max(0, Math.min(NB - 1, Math.floor((k.h - minP) / bSpan)));
        const share = (k.v || 0) / Math.max(1, i1 - i0 + 1);
        for (let b = i0; b <= i1; b++) bins[b] += share;
      }
      let pocIdx = 0, pocMax = 0;
      for (let b = 0; b < NB; b++) { if (bins[b] > pocMax) { pocMax = bins[b]; pocIdx = b; } }
      if (pocMax > 0) {
        const maxBarW = plotW * 0.24;
        for (let b = 0; b < NB; b++) {
          const w = (bins[b] / pocMax) * maxBarW;
          const y1 = yOf(minP + (b + 1) * bSpan), y2 = yOf(minP + b * bSpan);
          const bh = Math.max(1.5, y2 - y1 - 1);
          ctx.fillStyle = b === pocIdx ? 'rgba(251,191,36,0.28)' : 'rgba(147,197,253,0.14)';
          ctx.fillRect(leftPad + plotW - w, y1, w, bh);
        }
        const pocY = yOf(minP + (pocIdx + 0.5) * bSpan);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(251,191,36,0.52)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(leftPad, pocY); ctx.lineTo(leftPad + plotW, pocY); ctx.stroke();
        ctx.restore();
      }
    }

    // 图层 B：战场防线与清算磁吸区映射
    if (this.ov.lines && this.overlays.anchor > 0) {
      const { anchor, step, liqZones } = this.overlays;
      const drawLvl = (px, stroke, lbl, dash = [4, 4]) => {
        if (px < pLo || px > pHi) return;
        const y = yOf(px);
        ctx.save();
        ctx.setLineDash(dash);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(leftPad + plotW, y); ctx.stroke();
        ctx.restore();
        if (lbl) {
          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          ctx.fillStyle = stroke;
          ctx.textAlign = 'left';
          ctx.fillText(lbl, leftPad + 3, Math.max(topPad + 8, y - 2));
        }
      };
      drawLvl(anchor, 'rgba(253,230,138,0.45)', '0%', [5, 4]);
      for (const lvl of [-2, -1, 1, 2]) {
        const pct = +(lvl * (step || 1)).toFixed(1);
        const px = anchor * (1 + pct / 100);
        drawLvl(px, lvl > 0 ? 'rgba(248,113,113,0.34)' : 'rgba(96,165,250,0.34)', (pct > 0 ? '+' : '') + pct + '%', [3, 4]);
      }
      if (Array.isArray(liqZones)) {
        for (const z of liqZones) {
          drawLvl(z.price, 'rgba(192,132,252,0.42)', `⚡${z.leverage}`, [2, 3]);
        }
      }
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

    // 图层 C：VWAP（金线）与 EMA20（青蓝虚线）
    if (this.ov.vwap && all.length >= 3) {
      let ema = all[0].c;
      const emaK = 2 / 21;
      let cumPV = 0, cumV = 0, curDay = -1;
      const vwapVis = [], emaVis = [];
      for (let i = 0; i < all.length; i++) {
        const k = all[i];
        ema = i === 0 ? k.c : (k.c - ema) * emaK + ema;
        const day = Math.floor(k.t / 86400000);
        if ((this.tf === '1m' || this.tf === '5m' || this.tf === '15m' || this.tf === '1h') && day !== curDay) {
          curDay = day; cumPV = 0; cumV = 0;
        }
        const tp = (k.h + k.l + k.c) / 3;
        const vol = Math.max(0.0001, k.v || 0);
        cumPV += tp * vol; cumV += vol;
        const vw = cumV > 0 ? cumPV / cumV : tp;
        if (i >= vStart && i < vEnd) {
          vwapVis.push(vw);
          emaVis.push(ema);
        }
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftPad, topPad, plotW, candleH);
      ctx.clip();
      ctx.strokeStyle = 'rgba(56,189,248,0.72)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      emaVis.forEach((v, i) => {
        const x = leftPad + (i + 0.5) * step, y = yOf(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(251,191,36,0.9)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      vwapVis.forEach((v, i) => {
        const x = leftPad + (i + 0.5) * step, y = yOf(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 巨鲸与大额爆仓事件打点
    const tfMs = TF_MS[this.tf];
    for (const m of this.markers) {
      const idx = arr.findIndex(k => m.ts >= k.t && m.ts < k.t + tfMs);
      if (idx < 0) continue;
      const k = arr[idx], cx = leftPad + (idx + 0.5) * step;
      const isWhale = m.type === 'whale';
      const y = isWhale ? Math.max(topPad + 6, yOf(k.h) - 6) : Math.min(candleBot - 6, yOf(k.l) + 6);
      ctx.fillStyle = isWhale ? (m.side === 'blue' ? '#60a5fa' : '#f87171') : '#c084fc';
      ctx.beginPath();
      ctx.moveTo(cx, y - 4); ctx.lineTo(cx + 3.5, y); ctx.lineTo(cx, y + 4); ctx.lineTo(cx - 3.5, y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 0.8; ctx.stroke();
    }

    // 击杀播报点击高亮光柱
    if (this.hlTs > 0 && Date.now() < this.hlUntil) {
      const idx = arr.findIndex(k => this.hlTs >= k.t && this.hlTs < k.t + tfMs);
      const hi = idx >= 0 ? idx : arr.length - 1;
      const hx = leftPad + (hi + 0.5) * step;
      ctx.save();
      ctx.fillStyle = 'rgba(253,230,138,0.14)';
      ctx.fillRect(hx - Math.max(4, step * 0.5), topPad, Math.max(8, step), volBot - topPad);
      ctx.strokeStyle = 'rgba(253,230,138,0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(hx, topPad); ctx.lineTo(hx, volBot); ctx.stroke();
      ctx.restore();
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
      const d = new Date(k.t);
      const lbl = this.tf === '1d' ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

    // 悬停十字线（映射回可见索引）
    if (this.hoverIdx >= vStart && this.hoverIdx < vEnd && all[this.hoverIdx]) {
      const localIdx = this.hoverIdx - vStart;
      const k = arr[localIdx];
      const hx = leftPad + (localIdx + 0.5) * step;
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
