// BTC 永续合约情报层：Binance USD-M 优先（资金费率 / 标记价 / OI / 大户持仓比 vs 散户人数比），OKX SWAP 兜底
// 爆仓流：Binance @forceOrder + OKX liquidation-orders 双所实时聚合 + 启动历史回填
import { fetchJson } from './net.js?v=d48474ac';

const BIN_FAPI = 'https://fapi.binance.com';
const BIN_FWS = 'wss://fstream.binance.com';
const OKX_API = 'https://www.okx.com';
const OKX_WS = 'wss://ws.okx.com/ws/v5/public';

const BIN_SYM = 'BTCUSDT';
const OKX_INST = 'BTC-USDT-SWAP';
const OKX_ULY = 'BTC-USDT';
const LIQ_WIN_MS = 5 * 60 * 1000;
const LIQ_FEED_MAX = 60;
const POLL_MS = 30 * 1000;

function emptyState() {
  return {
    available: false,
    src: null,
    symbol: null,
    funding: null,
    nextFunding: 0,
    mark: 0,
    oiUsd: 0,
    oiQty: 0,
    longRatio: null,
    shortRatio: null,
    lsRatio: null,
    topLongRatio: null,
    topShortRatio: null,
    topLsRatio: null,
    hasLiqStream: false,
    liqs: [],
    liqFeed: [],
    liqLong5m: 0,
    liqShort5m: 0,
    lastLiq: null,
  };
}

export class FuturesFeed {
  constructor({ onData, onLiq } = {}) {
    this.onData = onData;
    this.onLiq = onLiq;
    this.gen = 0;
    this.running = false;
    this.state = emptyState();
    this.pollT = null;
    this.ws = null;
    this.wsT = null;
    this.wsBackoff = 3000;
    this.binWsOpen = false;
    this.okxWs = null;
    this.okxWsT = null;
    this.okxPingT = null;
    this.okxWsBackoff = 3000;
    this.okxWsOpen = false;
    this.okxCtVal = 0.01;
    this.seenLiqIds = new Set();
    this.lastPollAt = 0;
    this._onVis = () => this._handleVis();
    document.addEventListener('visibilitychange', this._onVis);
  }

  start() {
    this.gen++;
    this._cleanupConn();
    this.running = true;
    this.state = emptyState();
    this.wsBackoff = 3000;
    this.okxWsBackoff = 3000;
    this.binWsOpen = false;
    this.okxWsOpen = false;
    this.seenLiqIds.clear();
    this.lastPollAt = 0;
    this._emit();

    const gen = this.gen;
    this._poll(gen);
    this._connectBinLiqWs(gen);
    this._initOkxLiq(gen);
    this.pollT = setInterval(() => {
      if (!document.hidden && gen === this.gen) this._poll(gen);
    }, POLL_MS);
  }

  stop() {
    this.gen++;
    this.running = false;
    this._cleanupConn();
    document.removeEventListener('visibilitychange', this._onVis);
  }

  _cleanupConn() {
    clearInterval(this.pollT); this.pollT = null;
    clearTimeout(this.wsT); this.wsT = null;
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    clearTimeout(this.okxWsT); this.okxWsT = null;
    clearInterval(this.okxPingT); this.okxPingT = null;
    if (this.okxWs) { try { this.okxWs.close(); } catch {} this.okxWs = null; }
  }

  _handleVis() {
    if (document.hidden || !this.running) return;
    const gen = this.gen;
    if (Date.now() - this.lastPollAt >= POLL_MS) this._poll(gen);
    if (!this.ws || this.ws.readyState > 1) this._connectBinLiqWs(gen);
    if (!this.okxWs || this.okxWs.readyState > 1) this._connectOkxLiqWs(gen);
  }

  _pruneLiqs(now = Date.now()) {
    const cut = now - LIQ_WIN_MS;
    const arr = this.state.liqs;
    while (arr.length && arr[0].ts < cut) arr.shift();
    let l = 0, s = 0;
    for (const x of arr) {
      if (x.side === 'long') l += x.usd;
      else s += x.usd;
    }
    this.state.liqLong5m = l;
    this.state.liqShort5m = s;
    if (this.state.lastLiq && this.state.lastLiq.ts < cut) this.state.lastLiq = null;
  }

  _syncLiqStreamFlag() {
    this.state.hasLiqStream = this.binWsOpen || this.okxWsOpen || this.state.liqFeed.length > 0;
  }

  _ingestLiq(ev, { live = true } = {}) {
    if (!ev || !(ev.usd > 0) || !isFinite(ev.usd)) return false;
    if (this.seenLiqIds.has(ev.id)) return false;
    this.seenLiqIds.add(ev.id);
    if (this.seenLiqIds.size > 400) {
      const oldest = this.seenLiqIds.values().next().value;
      this.seenLiqIds.delete(oldest);
    }

    this.state.liqFeed.push(ev);
    this.state.liqFeed.sort((a, b) => b.ts - a.ts);
    if (this.state.liqFeed.length > LIQ_FEED_MAX) this.state.liqFeed.length = LIQ_FEED_MAX;

    const now = Date.now();
    if (ev.ts >= now - LIQ_WIN_MS) {
      this.state.liqs.push(ev);
      this.state.liqs.sort((a, b) => a.ts - b.ts);
      if (this.state.liqs.length > 300) this.state.liqs.splice(0, this.state.liqs.length - 300);
      if (!this.state.lastLiq || ev.ts >= this.state.lastLiq.ts) this.state.lastLiq = ev;
    }
    this._pruneLiqs(now);
    this._syncLiqStreamFlag();

    if (live && this.onLiq) this.onLiq(ev, { ...this.state });
    return true;
  }

  _emit() {
    if (this.onData) this.onData({ ...this.state });
  }

  _applyBinPrem(prem) {
    if (!prem || prem.lastFundingRate == null) return;
    this.state.available = true;
    this.state.src = 'binance';
    this.state.symbol = prem.symbol || BIN_SYM;
    this.state.funding = +prem.lastFundingRate;
    this.state.nextFunding = +prem.nextFundingTime || 0;
    this.state.mark = +prem.markPrice || 0;
  }

  async _pollBinance(gen) {
    const reqs = [
      fetchJson(`${BIN_FAPI}/fapi/v1/premiumIndex?symbol=${BIN_SYM}`, 6000),
      fetchJson(`${BIN_FAPI}/fapi/v1/openInterest?symbol=${BIN_SYM}`, 6000),
      fetchJson(`${BIN_FAPI}/futures/data/globalLongShortAccountRatio?symbol=${BIN_SYM}&period=5m&limit=1`, 6000),
      fetchJson(`${BIN_FAPI}/futures/data/topLongShortPositionRatio?symbol=${BIN_SYM}&period=5m&limit=1`, 6000),
    ];
    const [pRes, oRes, lsRes, topRes] = await Promise.allSettled(reqs);
    if (gen !== this.gen) return false;

    let ok = false;
    if (pRes.status === 'fulfilled' && pRes.value) {
      this._applyBinPrem(pRes.value);
      ok = true;
    }
    if (oRes.status === 'fulfilled' && oRes.value && oRes.value.openInterest != null) {
      const qty = +oRes.value.openInterest;
      if (isFinite(qty)) {
        this.state.oiQty = qty;
        if (this.state.mark > 0) this.state.oiUsd = qty * this.state.mark;
        ok = true;
      }
    }
    if (lsRes.status === 'fulfilled' && Array.isArray(lsRes.value) && lsRes.value[0]) {
      const row = lsRes.value[0];
      const lr = +row.longAccount, sr = +row.shortAccount, ratio = +row.longShortRatio;
      if (isFinite(lr) && isFinite(sr)) {
        this.state.longRatio = lr;
        this.state.shortRatio = sr;
        this.state.lsRatio = isFinite(ratio) ? ratio : null;
      }
    }
    if (topRes.status === 'fulfilled' && Array.isArray(topRes.value) && topRes.value[0]) {
      const row = topRes.value[0];
      const lr = +row.longAccount, sr = +row.shortAccount, ratio = +row.longShortRatio;
      if (isFinite(lr) && isFinite(sr)) {
        this.state.topLongRatio = lr;
        this.state.topShortRatio = sr;
        this.state.topLsRatio = isFinite(ratio) ? ratio : null;
      }
    }
    if (ok && (!this.ws || this.ws.readyState > 1)) {
      this._connectBinLiqWs(gen);
    }
    return ok;
  }

  async _pollOkx(gen) {
    const [fRes, oRes] = await Promise.allSettled([
      fetchJson(`${OKX_API}/api/v5/public/funding-rate?instId=${OKX_INST}`, 6000),
      fetchJson(`${OKX_API}/api/v5/public/open-interest?instType=SWAP&instId=${OKX_INST}`, 6000),
    ]);
    if (gen !== this.gen) return false;

    let ok = false;
    if (fRes.status === 'fulfilled' && fRes.value && Array.isArray(fRes.value.data) && fRes.value.data[0]) {
      const f = fRes.value.data[0];
      this.state.available = true;
      this.state.src = 'okx';
      this.state.symbol = OKX_INST;
      this.state.funding = +f.fundingRate;
      this.state.nextFunding = +f.fundingTime || 0;
      ok = true;
    }
    if (oRes.status === 'fulfilled' && oRes.value && Array.isArray(oRes.value.data) && oRes.value.data[0]) {
      const o = oRes.value.data[0];
      const usd = +o.oiUsd, qty = +o.oiCcy;
      if (isFinite(usd)) this.state.oiUsd = usd;
      if (isFinite(qty)) this.state.oiQty = qty;
      this.state.available = true;
      this.state.src = 'okx';
      this.state.symbol = OKX_INST;
      ok = true;
    }
    return ok;
  }

  async _poll(gen) {
    if (gen !== this.gen) return;
    this.lastPollAt = Date.now();
    this._pruneLiqs();
    let ok = await this._pollBinance(gen);
    if (!ok && gen === this.gen) ok = await this._pollOkx(gen);
    if (gen !== this.gen) return;
    if (!ok && !this.state.available) {
      this.state.available = false;
      this.state.src = null;
    }
    this._syncLiqStreamFlag();
    this._emit();
  }

  _connectBinLiqWs(gen) {
    if (gen !== this.gen || document.hidden) return;
    clearTimeout(this.wsT);
    if (this.ws) { try { this.ws.close(); } catch {} }
    let sock;
    try {
      sock = new WebSocket(`${BIN_FWS}/market/ws/${BIN_SYM.toLowerCase()}@forceOrder`);
    } catch { return; }
    this.ws = sock;
    sock.onopen = () => {
      if (gen !== this.gen || sock !== this.ws) { try { sock.close(); } catch {} return; }
      this.wsBackoff = 3000;
      this.binWsOpen = true;
      this._syncLiqStreamFlag();
      this._emit();
    };
    sock.onmessage = (e) => {
      if (gen !== this.gen || sock !== this.ws) return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const o = msg && msg.e === 'forceOrder' && msg.o;
      if (!o) return;
      const px = +o.ap || +o.p, qty = +o.z || +o.q, usd = px * qty;
      const ts = +o.T || Date.now();
      const side = o.S === 'SELL' ? 'long' : 'short';
      const ev = {
        id: `BN-${ts}-${side}-${px.toFixed(2)}-${qty}`,
        ex: 'BN',
        side,
        price: px,
        qty,
        usd,
        ts,
      };
      if (this._ingestLiq(ev, { live: true })) this._emit();
    };
    sock.onerror = () => {};
    sock.onclose = () => {
      if (gen !== this.gen || sock !== this.ws) return;
      this.ws = null;
      this.binWsOpen = false;
      this._syncLiqStreamFlag();
      if (document.hidden) return;
      const d = this.wsBackoff;
      this.wsBackoff = Math.min(30000, this.wsBackoff * 2);
      this.wsT = setTimeout(() => {
        if (gen === this.gen && !document.hidden) this._connectBinLiqWs(gen);
      }, d);
    };
  }

  async _initOkxLiq(gen) {
    const [instRes, histRes] = await Promise.allSettled([
      fetchJson(`${OKX_API}/api/v5/public/instruments?instType=SWAP&instId=${OKX_INST}`, 6000),
      fetchJson(`${OKX_API}/api/v5/public/liquidation-orders?instType=SWAP&uly=${OKX_ULY}&state=filled&limit=20`, 6000),
    ]);
    if (gen !== this.gen) return;
    if (instRes.status === 'fulfilled' && instRes.value && Array.isArray(instRes.value.data) && instRes.value.data[0]) {
      const cv = +instRes.value.data[0].ctVal;
      if (cv > 0 && isFinite(cv)) this.okxCtVal = cv;
    }
    if (histRes.status === 'fulfilled' && histRes.value && Array.isArray(histRes.value.data)) {
      let added = false;
      for (const grp of histRes.value.data) {
        if (grp.instId && grp.instId !== OKX_INST) continue;
        for (const d of grp.details || []) {
          const ev = this._parseOkxDetail(d);
          if (ev && this._ingestLiq(ev, { live: false })) added = true;
        }
      }
      if (added) this._emit();
    }
    this._connectOkxLiqWs(gen);
  }

  _parseOkxDetail(d) {
    if (!d) return null;
    const px = +d.bkPx, sz = +d.sz;
    if (!(px > 0) || !(sz > 0) || !isFinite(px) || !isFinite(sz)) return null;
    const qty = sz * this.okxCtVal;
    const usd = qty * px;
    const ts = +d.ts || Date.now();
    const side = (d.posSide === 'long' || (d.posSide !== 'short' && d.side === 'sell')) ? 'long' : 'short';
    return {
      id: `OKX-${ts}-${side}-${px.toFixed(2)}-${sz}`,
      ex: 'OKX',
      side,
      price: px,
      qty,
      usd,
      ts,
    };
  }

  _connectOkxLiqWs(gen) {
    if (gen !== this.gen || document.hidden) return;
    clearTimeout(this.okxWsT);
    clearInterval(this.okxPingT);
    if (this.okxWs) { try { this.okxWs.close(); } catch {} }
    let sock;
    try {
      sock = new WebSocket(OKX_WS);
    } catch { return; }
    this.okxWs = sock;
    sock.onopen = () => {
      if (gen !== this.gen || sock !== this.okxWs) { try { sock.close(); } catch {} return; }
      this.okxWsBackoff = 3000;
      this.okxWsOpen = true;
      this._syncLiqStreamFlag();
      try {
        sock.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'liquidation-orders', instType: 'SWAP' }] }));
      } catch {}
      this.okxPingT = setInterval(() => {
        if (sock.readyState === 1) { try { sock.send('ping'); } catch {} }
      }, 20000);
      this._emit();
    };
    sock.onmessage = (e) => {
      if (gen !== this.gen || sock !== this.okxWs || e.data === 'pong') return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (!msg || !Array.isArray(msg.data) || !msg.arg || msg.arg.channel !== 'liquidation-orders') return;
      let changed = false;
      for (const grp of msg.data) {
        if (grp.instId !== OKX_INST) continue;
        for (const d of grp.details || []) {
          const ev = this._parseOkxDetail(d);
          if (ev && this._ingestLiq(ev, { live: true })) changed = true;
        }
      }
      if (changed) this._emit();
    };
    sock.onerror = () => {};
    sock.onclose = () => {
      if (gen !== this.gen || sock !== this.okxWs) return;
      this.okxWs = null;
      this.okxWsOpen = false;
      clearInterval(this.okxPingT); this.okxPingT = null;
      this._syncLiqStreamFlag();
      if (document.hidden) return;
      const d = this.okxWsBackoff;
      this.okxWsBackoff = Math.min(30000, this.okxWsBackoff * 2);
      this.okxWsT = setTimeout(() => {
        if (gen === this.gen && !document.hidden) this._connectOkxLiqWs(gen);
      }, d);
    };
  }
}
