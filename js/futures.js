// Perpetual Futures telemetry: Binance USD-M Futures (Funding Rate, OI, L/S Ratio, forceOrder liquidations)
// with OKX USDT-SWAP REST fallback
import { fetchJson } from './net.js?v=965311c0';
import { lsGet, lsSet } from './storage.js?v=965311c0';

const BIN_FAPI = 'https://fapi.binance.com';
const BIN_FWS = 'wss://fstream.binance.com';
const OKX_API = 'https://www.okx.com';
const LIQ_WIN_MS = 5 * 60 * 1000;
const POLL_MS = 30 * 1000;
const FSYM_KEY = 'cw_fapi_syms_v1';
const FSYM_TTL = 12 * 3600e3;

let binPerpSet = null;
let binPerpPromise = null;
async function getBinPerpSymbols() {
  if (binPerpSet) return binPerpSet;
  if (binPerpPromise) return binPerpPromise;
  binPerpPromise = (async () => {
    try {
      const c = JSON.parse(lsGet(FSYM_KEY, 'null') || 'null');
      if (c && Date.now() - c.t < FSYM_TTL && Array.isArray(c.d) && c.d.length > 50) {
        binPerpSet = new Set(c.d);
        return binPerpSet;
      }
    } catch {}
    try {
      const list = await fetchJson(`${BIN_FAPI}/fapi/v1/premiumIndex`, 8000);
      if (Array.isArray(list) && list.length > 50) {
        const syms = list.map((x) => x && x.symbol).filter(Boolean);
        binPerpSet = new Set(syms);
        lsSet(FSYM_KEY, JSON.stringify({ t: Date.now(), d: syms }));
        return binPerpSet;
      }
    } catch {}
    return null;
  })();
  try { return await binPerpPromise; }
  finally { binPerpPromise = null; }
}

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
    hasLiqStream: false,
    liqs: [],
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
    this.market = null;
    this.state = emptyState();
    this.binSym = null;
    this.binUnsupported = false;
    this.pollT = null;
    this.ws = null;
    this.wsT = null;
    this.wsBackoff = 3000;
    this.lastPollAt = 0;
    this._onVis = () => this._handleVis();
    document.addEventListener('visibilitychange', this._onVis);
  }

  start(market) {
    this.gen++;
    this._cleanupConn();
    this.market = market;
    this.state = emptyState();
    this.binSym = null;
    this.binUnsupported = false;
    this.wsBackoff = 3000;
    this.lastPollAt = 0;
    this._emit();
    if (!market) return;
    const gen = this.gen;
    this._poll(gen);
    this.pollT = setInterval(() => {
      if (!document.hidden && gen === this.gen) this._poll(gen);
    }, POLL_MS);
  }

  stop() {
    this.gen++;
    this._cleanupConn();
    document.removeEventListener('visibilitychange', this._onVis);
  }

  _cleanupConn() {
    clearInterval(this.pollT); this.pollT = null;
    clearTimeout(this.wsT); this.wsT = null;
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
  }

  _handleVis() {
    if (document.hidden || !this.market) return;
    const gen = this.gen;
    if (Date.now() - this.lastPollAt >= POLL_MS) this._poll(gen);
    if (this.binSym && !this.binUnsupported && (!this.ws || this.ws.readyState > 1)) {
      this._connectLiqWs(gen, this.binSym);
    }
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

  _emit() {
    if (this.onData) this.onData({ ...this.state });
  }

  async _resolveBinanceSymbol(gen, baseSym) {
    if (this.binSym) return this.binSym;
    if (this.binUnsupported || !baseSym) return null;
    const set = await getBinPerpSymbols();
    if (gen !== this.gen) return null;
    let candidates;
    if (set) {
      const hit = set.has(baseSym) ? baseSym : set.has('1000' + baseSym) ? '1000' + baseSym : null;
      if (!hit) { this.binUnsupported = true; return null; }
      candidates = [hit];
    } else {
      candidates = [baseSym, '1000' + baseSym];
    }
    for (const sym of candidates) {
      try {
        const prem = await fetchJson(`${BIN_FAPI}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(sym)}`, 6000);
        if (gen !== this.gen) return null;
        if (prem && prem.symbol) {
          this.binSym = prem.symbol;
          this._applyBinPrem(prem);
          return this.binSym;
        }
      } catch (e) {
        if (gen !== this.gen) return null;
        if (e.status !== 400) break;
      }
    }
    this.binUnsupported = true;
    return null;
  }

  _applyBinPrem(prem) {
    if (!prem || prem.lastFundingRate == null) return;
    this.state.available = true;
    this.state.src = 'binance';
    this.state.symbol = prem.symbol;
    this.state.funding = +prem.lastFundingRate;
    this.state.nextFunding = +prem.nextFundingTime || 0;
    this.state.mark = +prem.markPrice || 0;
  }

  async _pollBinance(gen) {
    const m = this.market;
    if (!m || !m.binance || this.binUnsupported) return false;
    const hadSym = !!this.binSym;
    const sym = await this._resolveBinanceSymbol(gen, m.binance);
    if (!sym || gen !== this.gen) return false;

    const reqs = [
      hadSym ? fetchJson(`${BIN_FAPI}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(sym)}`, 6000) : Promise.resolve(null),
      fetchJson(`${BIN_FAPI}/fapi/v1/openInterest?symbol=${encodeURIComponent(sym)}`, 6000),
      fetchJson(`${BIN_FAPI}/futures/data/globalLongShortAccountRatio?symbol=${encodeURIComponent(sym)}&period=5m&limit=1`, 6000),
    ];
    const [pRes, oRes, lsRes] = await Promise.allSettled(reqs);
    if (gen !== this.gen) return false;

    let ok = hadSym ? false : true;
    if (hadSym && pRes.status === 'fulfilled' && pRes.value) {
      this._applyBinPrem(pRes.value);
      ok = true;
    }
    if (oRes.status === 'fulfilled' && oRes.value && oRes.value.openInterest != null) {
      const qty = +oRes.value.openInterest;
      if (isFinite(qty)) {
        const scale = (sym.startsWith('1000') && !m.binance.startsWith('1000')) ? 1000 : 1;
        this.state.oiQty = qty * scale;
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
    if (ok && (!this.ws || this.ws.readyState > 1)) {
      this._connectLiqWs(gen, sym);
    }
    return ok;
  }

  async _pollOkx(gen) {
    const m = this.market;
    if (!m || !m.okx) return false;
    const instId = `${m.okx}-SWAP`;
    const [fRes, oRes] = await Promise.allSettled([
      fetchJson(`${OKX_API}/api/v5/public/funding-rate?instId=${encodeURIComponent(instId)}`, 6000),
      fetchJson(`${OKX_API}/api/v5/public/open-interest?instType=SWAP&instId=${encodeURIComponent(instId)}`, 6000),
    ]);
    if (gen !== this.gen) return false;

    let ok = false;
    if (fRes.status === 'fulfilled' && fRes.value && Array.isArray(fRes.value.data) && fRes.value.data[0]) {
      const f = fRes.value.data[0];
      this.state.available = true;
      this.state.src = 'okx';
      this.state.symbol = instId;
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
      this.state.symbol = instId;
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
    this._emit();
  }

  _connectLiqWs(gen, sym) {
    if (gen !== this.gen || document.hidden) return;
    clearTimeout(this.wsT);
    if (this.ws) { try { this.ws.close(); } catch {} }
    let sock;
    try {
      sock = new WebSocket(`${BIN_FWS}/market/ws/${sym.toLowerCase()}@forceOrder`);
    } catch { return; }
    this.ws = sock;
    sock.onopen = () => {
      if (gen !== this.gen || sock !== this.ws) { try { sock.close(); } catch {} return; }
      this.wsBackoff = 3000;
      this.state.hasLiqStream = true;
      this._emit();
    };
    sock.onmessage = (e) => {
      if (gen !== this.gen || sock !== this.ws) return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const o = msg && msg.e === 'forceOrder' && msg.o;
      if (!o) return;
      const px = +o.ap || +o.p, qty = +o.z || +o.q, usd = px * qty;
      if (!(usd > 0) || !isFinite(usd)) return;
      const ev = {
        side: o.S === 'SELL' ? 'long' : 'short',
        price: px,
        qty,
        usd,
        ts: +o.T || Date.now(),
      };
      this.state.liqs.push(ev);
      if (this.state.liqs.length > 200) this.state.liqs.splice(0, this.state.liqs.length - 200);
      this.state.lastLiq = ev;
      this._pruneLiqs();
      if (this.onLiq) this.onLiq(ev, { ...this.state });
      this._emit();
    };
    sock.onerror = () => {};
    sock.onclose = () => {
      if (gen !== this.gen || sock !== this.ws) return;
      this.ws = null;
      if (document.hidden) return;
      const d = this.wsBackoff;
      this.wsBackoff = Math.min(30000, this.wsBackoff * 2);
      this.wsT = setTimeout(() => {
        if (gen === this.gen && !document.hidden) this._connectLiqWs(gen, sym);
      }, d);
    };
  }
}
