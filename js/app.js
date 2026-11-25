import { FeedManager, MultiSpotAggregator, SOURCES, BTC_MARKET, fetchBinance1s, fetchBinanceAggTrades, fetchOkxTrades, fetchCoinbaseTrades } from './feeds.js?v=3c4adee8';
import { Battle } from './battle.js?v=3c4adee8';
import { t as T, setLang, onLang, applyI18n, fmtUsd, fmtShort, fmtNum } from './i18n.js?v=3c4adee8';
import { AudioController } from './music.js?v=3c4adee8';
import { lsGet, lsSet } from './storage.js?v=3c4adee8';
import { FuturesFeed, computeRegime, estimateLiqZones } from './futures.js?v=3c4adee8';
import { KlineChart } from './chart.js?v=3c4adee8';
import { CrossExchangeFeed, MtfTracker, fetchFearGreed, getTradingSession } from './intel.js?v=3c4adee8';
import { initShare } from './share.js?v=3c4adee8';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

// ---------- BTC 专属配置 ----------
const M = BTC_MARKET;
const CF = {
  dp: 2,
  qdp: 4,
  th: { small: 4000, shell: 50000, heavy: 250000, whale: 1e6 },
  chips: [20000, 50000, 100000, 500000],
  defChip: 50000,
};
const cfg = () => CF;
const fmtPx = (p, dp = CF.dp) => p.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtP = (p) => fmtPx(p, CF.dp);
const fmtQ = (q) => q >= 1e5 ? fmtNum(q) : q >= 1000 ? q.toFixed(0) : q >= 100 ? q.toFixed(1) : q >= 10 ? q.toFixed(2) : q.toFixed(CF.qdp);
const wan = (v) => fmtShort(v);
applyI18n();
// 网页字体：先以 media=print 异步下载，加载完再启用（便于 CSP 禁止内联脚本）
{ const gf = document.getElementById('gfonts'); if (gf) { if (gf.sheet) gf.media = 'all'; else gf.addEventListener('load', () => { gf.media = 'all'; }, { once: true }); } }

// ---------- 开场 ----------
const intro = $('intro'), introBar = $('introBar'), introMsg = $('introMsg');
const introStart = performance.now(); let introDone = false;
intro.classList.add('js');
let introKey = ['introGather'];
function introStep(pct, key, ...a) { if (introDone) return; introBar.style.width = pct + '%'; if (key) { introKey = [key, ...a]; introMsg.textContent = T(key, ...a); } }
function finishIntro() {
  if (introDone) return;
  const wait = Math.max(0, 1800 - (performance.now() - introStart));
  introStep(100, 'introStart');
  introDone = true;
  setTimeout(() => {
    if (!audio.locked) return closeIntro();
    intro.classList.add('ready'); introKey = ['introClick']; introMsg.textContent = T('introClick');
  }, wait + 300);
}
function closeIntro() {
  if (!intro.isConnected || intro.classList.contains('done')) return;
  intro.classList.add('done'); setTimeout(() => intro.remove(), 900);
}
introStep(15, 'introGather');
setTimeout(finishIntro, 7000);

// ---------- 战场 ----------
const battle = new Battle($('battle'));
battle.setThresholds(CF.th);
battle.start();
window.__battle = battle;
window.__cw = () => S.dbg;
window.__big = () => ({ big: S.big, from: S.bigFrom, th: S.threshold });

// ---------- 实时 K 线 ----------
const tfBtns = [...document.querySelectorAll('#tfTabs button[data-tf]')];
const ovBtns = [...document.querySelectorAll('#chartOvTabs button[data-ov]')];
const klineChart = new KlineChart({
  canvas: $('klineChart'),
  infoEl: $('klineInfo'),
  onTfChange(tf) {
    tfBtns.forEach((b) => {
      const on = b.dataset.tf === tf;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  },
  onOvChange(ov) {
    ovBtns.forEach((b) => {
      const on = !!ov[b.dataset.ov];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  },
});
tfBtns.forEach((b) => b.addEventListener('click', () => klineChart.setTf(b.dataset.tf)));
ovBtns.forEach((b) => b.addEventListener('click', () => klineChart.toggleOverlay(b.dataset.ov)));

// ---------- 状态 ----------
const EX_CODE = { binance: 'BN', okx: 'OKX', coinbase: 'CB' };
let flashT, lastShown = 0;
let flowScope = lsGet('cw_flow_scope', 'agg') === 'single' ? 'single' : 'agg';
let flowWin = lsGet('cw_flow_win', '2m') === '15m' ? '15m' : '2m';
let powMode = lsGet('cw_pow_mode', '5d') === 'fast' ? 'fast' : '5d';
let liqWin = ['5m', '1h', '24h'].includes(lsGet('cw_liq_win', '5m')) ? lsGet('cw_liq_win', '5m') : '5m';

const mkBuckets = () => new Array(300).fill(null).map(() => ({ sec: 0, b: 0, s: 0, bu: 0, su: 0, n: 0 }));
const S = {
  src: null, last: 0, shownStr: '', open24h: 0, hi: 0, lo: 0, vol: 0, tradesThisSec: 0,
  buckets: mkBuckets(),
  aggBuckets: mkBuckets(),
  agg10s: new Array(90).fill(null).map(() => ({ bin: 0, bu: 0, su: 0, p: 0 })),
  px: new Array(120).fill(null).map(() => ({ sec: 0, p: 0 })), tickDir: 0,
  book: null, threshold: 0, surge: null, surgeSince: 0, surgeHeld: 0, lastRefreshAt: 0, wonFor: null,
  big: [], bigFrom: 0, bigLoading: false, lastAggId: 0, lastTs: 0,
  since: 0, liveSec: null, bfGen: 0, nEma: 0, cvdDiv: null,
  recentTakers: [],
};
function resetStats() {
  for (const b of S.buckets) { b.sec = 0; b.b = b.s = b.bu = b.su = b.n = 0; }
  for (const x of S.px) { x.sec = 0; x.p = 0; } S.tickDir = 0;
  S.book = null; S.last = 0; S.shownStr = ''; lastShown = 0; S.open24h = 0; S.hi = 0; S.lo = 0; S.vol = 0;
  S.surge = null; S.surgeSince = 0; S.surgeHeld = 0; S.lastRefreshAt = 0; S.wonFor = null; smoothS = 0;
  S.since = 0; S.liveSec = null; S.bfGen++; S.nEma = 0;
  $('price').textContent = '--'; $('chg').textContent = '--'; $('chg').className = 'chg';
  ['hi', 'lo', 'vol'].forEach(id => $(id).textContent = '--');
  S.big = []; S.bigFrom = 0; S.bigLoading = false; S.lastAggId = 0; S.lastTs = 0; pend = null; clearTimeout(pendTimer);
  battle.resetDefense();
  renderTrades();
}
function bucket(sec, arr = S.buckets) {
  const b = arr[sec % 300];
  if (b.sec !== sec) { b.sec = sec; b.b = b.s = b.bu = b.su = b.n = 0; }
  return b;
}
function recordAgg10s(sec, side, usd, price) {
  const bin = Math.floor(sec / 10);
  const slot = S.agg10s[bin % 90];
  if (slot.bin !== bin) { slot.bin = bin; slot.bu = 0; slot.su = 0; slot.p = 0; }
  if (side === 'buy') slot.bu += usd; else slot.su += usd;
  if (price > 0) slot.p = price;
}
function priceChange(secs) {
  if (!S.last) return 0;
  const now = Math.floor(Date.now() / 1000);
  for (let k = secs; k < Math.min(secs + 30, 120); k++) {
    const x = S.px[(now - k) % 120];
    if (x.sec === now - k && x.p) return (S.last / x.p - 1) * 100;
  }
  for (let k = secs - 1; k >= Math.min(5, secs); k--) {
    const x = S.px[(now - k) % 120];
    if (x.sec === now - k && x.p) return (S.last / x.p - 1) * 100;
  }
  return 0;
}
function windowSum(secs, arr = S.buckets) {
  const now = Math.floor(Date.now() / 1000); let b = 0, s = 0, bu = 0, su = 0, n = 0;
  for (let i = 0; i < secs; i++) { const k = arr[(now - i) % 300]; if (k.sec === now - i) { b += k.b; s += k.s; bu += k.bu; su += k.su; n += k.n; } }
  return { b, s, bu, su, n };
}

// ---------- 成交合并与三所聚合 ----------
let pend = null, pendTimer = null;
function flushPend() { if (!pend) return; const t = pend; pend = null; clearTimeout(pendTimer); onMergedTrade(t); }
function pushRecentTaker(side, price, usd) {
  const now = Date.now();
  S.recentTakers.push({ ts: now, side, price, usd });
  while (S.recentTakers.length > 400 || (S.recentTakers.length && now - S.recentTakers[0].ts > 12000)) S.recentTakers.shift();
}
function ingestBigTrade(r, live = true) {
  const dupe = S.big.find((x) => x.ex === r.ex && x.side === r.side && Math.abs(x.ts - r.ts) < 120 && Math.abs(x.usd - r.usd) < 5);
  if (dupe) return;
  S.big.unshift(r);
  if (S.big.length > 500) S.big.length = 500;
  if (live && r.usd >= S.threshold) addTradeRow(r);
  if (live && r.usd >= cfg().th.whale) {
    klineChart.addMarker({ ts: r.ts || Date.now(), price: r.price, type: 'whale', side: r.side === 'buy' ? 'blue' : 'red', usd: r.usd });
  }
}
function onTrade(t, src) {
  S.tradesThisSec++;
  const sec = Math.floor(Date.now() / 1000), bk = bucket(sec, S.buckets), abk = bucket(sec, S.aggBuckets), usd = t.price * t.qty;
  const ex = EX_CODE[src] || 'BN';
  if (!S.since) S.since = sec;
  if (S.liveSec == null) {
    S.liveSec = sec; if (!S.bigFrom) S.bigFrom = Date.now();
    if (src === 'binance') {
      setTimeout(backfill, 1500, S.bfGen, t.ts, Date.now() - t.ts, sec);
      if (t.id) { S.bigLoading = !S.big.length; backfillBig(S.bfGen, t.id, S.lastAggId); if (S.bigLoading) renderTrades(); }
    } else if ((src === 'okx' || src === 'coinbase') && t.ts > 0) {
      S.bigLoading = !S.big.length; if (S.bigLoading) renderTrades();
      setTimeout(backfillTrades, 1200, S.bfGen, src, t.ts, Date.now() - t.ts, sec, S.lastTs);
    }
  }
  if (t.id) S.lastAggId = t.id;
  if (t.ts > 0) S.lastTs = t.ts;
  if (t.side === 'buy') { bk.b += t.qty; bk.bu += usd; abk.b += t.qty; abk.bu += usd; }
  else { bk.s += t.qty; bk.su += usd; abk.s += t.qty; abk.su += usd; }
  bk.n++; abk.n++;
  recordAgg10s(sec, t.side, usd, t.price);
  pushRecentTaker(t.side, t.price, usd);
  if (S.last && t.price !== S.last) { S.tickDir = t.price > S.last ? 1 : -1; audio.tick(S.tickDir); }
  S.last = t.price;
  const ph = S.px[sec % 120]; ph.sec = sec; ph.p = t.price;
  klineChart.onTrade(t);
  crossEx.inject(src, t.price, S.open24h);
  if (pend && pend.side === t.side && pend.ts === t.ts && pend.ex === ex) { pend.qty += t.qty; pend.usd += usd; pend.price = pend.usd / pend.qty; }
  else { flushPend(); pend = { ...t, usd, ex }; pendTimer = setTimeout(flushPend, 80); }
}
function onAggTrade(t) {
  const sec = Math.floor(Date.now() / 1000), abk = bucket(sec, S.aggBuckets), usd = t.price * t.qty;
  if (t.side === 'buy') { abk.b += t.qty; abk.bu += usd; } else { abk.s += t.qty; abk.su += usd; }
  abk.n++;
  recordAgg10s(sec, t.side, usd, 0);
  if (t.src) crossEx.inject(t.src, t.price, 0);
  if (usd >= cfg().chips[0]) {
    ingestBigTrade({ ts: t.ts || Date.now(), side: t.side, price: t.price, qty: t.qty, usd, ex: t.ex }, true);
  }
}
function onMergedTrade(t) {
  battle.fire(t.side, t.usd, t.qty);
  if (t.usd >= cfg().chips[0]) {
    ingestBigTrade({ ts: t.ts || Date.now(), side: t.side, price: t.price, qty: t.qty, usd: t.usd, ex: t.ex || EX_CODE[S.src] || 'BN' }, true);
  }
  if (t.usd >= cfg().th.shell) audio.impact(t.usd * 50000 / cfg().th.shell, t.side === 'buy' ? 'blue' : 'red');
}
function tradeLi(t, anim = true) {
  const li = document.createElement('li'), d = new Date(t.ts), whale = t.usd >= cfg().th.whale;
  if (!anim) li.style.animation = 'none';
  li.className = (t.side === 'buy' ? 'buy' : 'sell') + (whale ? ' whale' : '');
  li.style.setProperty('--a', Math.min(0.08 + Math.log10(t.usd / S.threshold + 1) * 0.25, 0.45).toFixed(2));
  const exTag = t.ex ? `<em class="tex">${t.ex}</em>` : '';
  li.innerHTML = `<span>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</span>` +
    `<span class="s">${t.side === 'buy' ? T('sideBuy') : T('sideSell')}${exTag}</span><span>${fmtP(t.price)}</span>` +
    `<span>${fmtQ(t.qty)}</span><span>${whale ? '🐋 ' : ''}${fmtUsd(t.usd)}</span>`;
  return li;
}
function addTradeRow(t) {
  const ul = $('trades');
  const empty = ul.querySelector('.empty'); if (empty) empty.remove();
  ul.prepend(tradeLi(t));
  while (ul.children.length > 60) ul.lastChild.remove();
  tradesNote();
}
const bigMins = () => Math.max(1, Math.round((Date.now() - S.bigFrom) / 60000));
function tradesNote() { $('tradesNote').textContent = S.bigFrom && !S.bigLoading ? T('bigSince', bigMins()) : ''; }
function renderTrades() {
  const ul = $('trades'), rows = S.big.filter(x => x.usd >= S.threshold).slice(0, 60);
  ul.innerHTML = '';
  if (!rows.length) {
    const msg = S.bigLoading ? T('loadingBig') : S.bigFrom ? T('noBig', bigMins(), fmtShort(S.threshold)) : T('waitBig');
    ul.innerHTML = `<li class="empty">${msg}</li>`;
  } else for (const r of rows) ul.appendChild(tradeLi(r, false));
  tradesNote();
}
async function backfillBig(gen, firstId, afterId) {
  const ms = 30 * 60000, since = Date.now() - ms;
  const raw = await fetchBinanceAggTrades(M, fm.binanceHost || 0, firstId, afterId ? 0 : since, afterId, 15, () => gen === S.bfGen);
  if (gen !== S.bfGen) return;
  S.bigLoading = false;
  if (!raw) { renderTrades(); return; }
  const out = []; let cur = null;
  for (const x of raw) {
    const side = x.m ? 'sell' : 'buy', usd = x.p * x.q;
    if (cur && cur.ts === x.T && cur.side === side) { cur.qty += x.q; cur.usd += usd; cur.price = cur.usd / cur.qty; }
    else { if (cur) out.push(cur); cur = { ts: x.T, side, price: x.p, qty: x.q, usd, ex: 'BN' }; }
  }
  if (cur) out.push(cur);
  const min = cfg().chips[0], old = out.filter(x => x.usd >= min).reverse();
  S.big = S.big.concat(old).sort((a, b) => b.ts - a.ts).slice(0, 500);
  if (!afterId && raw.length) S.bigFrom = Math.min(S.bigFrom || Infinity, raw[0].T);
  renderTrades();
}
async function backfill(gen, firstTs, skew, liveSec) {
  if (gen !== S.bfGen) return;
  const k = await fetchBinance1s(M, fm.binanceHost || 0, 300);
  if (!k || gen !== S.bfGen) return;
  const now = Math.floor(Date.now() / 1000);
  for (const x of k) {
    if (x.t + 1000 > firstTs) continue;
    const ls = Math.floor((x.t + skew) / 1000);
    if (ls >= liveSec || ls <= now - 300) continue;
    for (const arr of [S.buckets, S.aggBuckets]) {
      const b = arr[ls % 300];
      if (b.sec !== ls) { b.sec = ls; b.b = x.tb; b.s = x.v - x.tb; b.bu = x.tbq; b.su = x.q - x.tbq; b.n = x.n; }
    }
    recordAgg10s(ls, 'buy', x.tbq, x.c);
    recordAgg10s(ls, 'sell', Math.max(0, x.q - x.tbq), x.c);
    if (ls > now - 120 && x.v > 0) { const ph = S.px[ls % 120]; if (ph.sec !== ls) { ph.sec = ls; ph.p = x.c; } }
    if (!S.since || ls < S.since) S.since = ls;
  }
}
async function backfillTrades(gen, src, firstTs, skew, liveSec, prevTs) {
  if (gen !== S.bfGen) return;
  const since = Math.max(firstTs - 300000, prevTs || 0), alive = () => gen === S.bfGen;
  let r = null;
  try { r = src === 'okx' ? await fetchOkxTrades(M, since, 12, alive) : await fetchCoinbaseTrades(M, since, 3, alive); } catch { r = null; }
  if (gen !== S.bfGen) return;
  S.bigLoading = false;
  if (!r) { renderTrades(); return; }
  let tr = r.trades.filter(x => x.ts < firstTs && x.ts >= since && (!prevTs || x.ts > prevTs));
  if (!r.complete && tr.length) { const cut = (Math.floor(tr[0].ts / 1000) + 1) * 1000; tr = tr.filter(x => x.ts >= cut); }
  const now = Math.floor(Date.now() / 1000), agg = new Map();
  for (const x of tr) {
    const ls = Math.floor((x.ts + skew) / 1000);
    if (ls >= liveSec || ls <= now - 300) continue;
    let a = agg.get(ls); if (!a) agg.set(ls, a = { b: 0, s: 0, bu: 0, su: 0, n: 0, p: 0 });
    const usd = x.p * x.q;
    if (x.side === 'buy') { a.b += x.q; a.bu += usd; } else { a.s += x.q; a.su += usd; }
    a.n++; a.p = x.p;
  }
  for (const [ls, a] of agg) {
    for (const arr of [S.buckets, S.aggBuckets]) {
      const b = arr[ls % 300];
      if (b.sec !== ls) { b.sec = ls; b.b = a.b; b.s = a.s; b.bu = a.bu; b.su = a.su; b.n = a.n; }
    }
    recordAgg10s(ls, 'buy', a.bu, a.p);
    recordAgg10s(ls, 'sell', a.su, a.p);
    if (ls > now - 120) { const ph = S.px[ls % 120]; if (ph.sec !== ls) { ph.sec = ls; ph.p = a.p; } }
  }
  if (!prevTs) {
    const from = r.complete ? Math.floor((since + skew) / 1000) + 1 : tr.length ? Math.floor((tr[0].ts + skew) / 1000) : 0;
    if (from && from < liveSec && (!S.since || from < S.since)) S.since = Math.max(from, now - 299);
  }
  const out = []; let cur = null;
  const ex = EX_CODE[src] || 'OKX';
  for (const x of tr) {
    const usd = x.p * x.q;
    if (cur && cur.ts === x.ts && cur.side === x.side) { cur.qty += x.q; cur.usd += usd; cur.price = cur.usd / cur.qty; }
    else { if (cur) out.push(cur); cur = { ts: x.ts, side: x.side, price: x.p, qty: x.q, usd, ex }; }
  }
  if (cur) out.push(cur);
  const min = cfg().chips[0], old = out.filter(x => x.usd >= min);
  if (old.length) S.big = S.big.concat(old).sort((a, b) => b.ts - a.ts).slice(0, 500);
  if (!prevTs && (r.complete || tr.length)) S.bigFrom = Math.min(S.bigFrom || Infinity, r.complete ? since : tr[0].ts);
  renderTrades();
}

// ---------- 大单门槛切换 ----------
function renderChips() {
  const saved = +lsGet('cw_th_btc', 0);
  S.threshold = cfg().chips.includes(saved) ? saved : cfg().defChip;
  $('chips').innerHTML = cfg().chips.map(v => `<button data-v="${v}" class="${v === S.threshold ? 'on' : ''}">${wan(v)}</button>`).join('');
  for (const b of document.querySelectorAll('#chips button')) b.onclick = () => {
    S.threshold = +b.dataset.v; lsSet('cw_th_btc', S.threshold);
    document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b));
    renderTrades();
  };
  const th = cfg().th;
  $('legend').textContent = T('legend', wan(th.shell), wan(th.heavy), wan(th.whale));
}

// ---------- 数据源 & 跨所报价 ----------
const statusEl = $('status');
let lastStatus = null;
function statusText() {
  if (!lastStatus) return;
  const [state, label, src] = lastStatus;
  const lb = state === 'error' ? (T(label) || label) : label;
  const txt = state !== 'live' && navigator.onLine === false ? T('sOffline')
    : { connecting: T('sConnecting', lb), open: T('sOpen', lb), live: T('sLive', lb), error: T('sError', SOURCES[src].name, lb) }[state];
  $('statusText').textContent = txt; statusEl.title = txt;
}
function syncExActive() {
  const active = S.src || fm.source || 'binance';
  document.querySelectorAll('#exBar .ex-item').forEach((b) => {
    const on = b.dataset.ex === active;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}

let cxState = null;
const exPrev = {};
function renderCrossEx(cx = cxState) {
  if (!cx || document.hidden) return;
  cxState = cx;
  for (const s of ['binance', 'okx', 'coinbase']) {
    const slot = cx[s];
    const pxEl = $('exPx-' + s), chEl = $('exCh-' + s);
    if (slot && slot.price > 0) {
      pxEl.textContent = '$' + slot.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      if (exPrev[s] && slot.price !== exPrev[s]) {
        pxEl.className = 'ex-px ' + (slot.price > exPrev[s] ? 'up' : 'down');
      }
      exPrev[s] = slot.price;
      if (slot.chg != null && isFinite(slot.chg)) {
        chEl.textContent = (slot.chg >= 0 ? '+' : '') + slot.chg.toFixed(2) + '%';
        chEl.className = 'ex-ch ' + (slot.chg >= 0 ? 'pos' : 'neg');
      } else {
        chEl.textContent = ''; chEl.className = 'ex-ch';
      }
    } else {
      pxEl.textContent = '--'; pxEl.className = 'ex-px'; chEl.textContent = '';
    }
  }
  const premBox = $('cbPremTop'), premVal = $('cbPremTopVal'), premPct = $('cbPremTopPct');
  const radPrem = $('radCbPrem'), radPremPct = $('radCbPremPct');
  if (cx.cbPremUsd != null && isFinite(cx.cbPremUsd)) {
    const sign = cx.cbPremUsd >= 0 ? '+' : '-';
    const absUsd = Math.abs(cx.cbPremUsd).toFixed(0);
    const pctStr = `${cx.cbPremPct >= 0 ? '+' : ''}${cx.cbPremPct.toFixed(2)}%`;
    const cls = cx.cbPremUsd >= 0 ? 'pos' : 'neg';
    premVal.textContent = `${sign}$${absUsd}`;
    if (premPct) premPct.textContent = `(${pctStr})`;
    premBox.className = 'ex-prem ' + cls;
    radPrem.textContent = `${sign}$${absUsd}`;
    radPrem.className = cls;
    if (radPremPct) { radPremPct.textContent = pctStr; radPremPct.className = cls; }
  } else {
    premVal.textContent = '--'; if (premPct) premPct.textContent = ''; premBox.className = 'ex-prem';
    radPrem.textContent = '--'; radPrem.className = '';
    if (radPremPct) { radPremPct.textContent = '--'; radPremPct.className = ''; }
  }
  const sprEl = $('radSpread'), sprPct = $('radSpreadPct');
  sprEl.textContent = cx.maxSpreadUsd != null && isFinite(cx.maxSpreadUsd) ? `$${cx.maxSpreadUsd.toFixed(1)}` : '--';
  if (sprPct) sprPct.textContent = cx.maxSpreadPct != null && isFinite(cx.maxSpreadPct) ? `${cx.maxSpreadPct.toFixed(2)}%` : '--';
  drawPremSpark(cx.premHist);
  syncBattleAtmo();
}

const crossEx = new CrossExchangeFeed({
  onData(st) { cxState = st; renderCrossEx(st); },
});
const multiSpot = new MultiSpotAggregator({ onTrade: onAggTrade });

const fm = new FeedManager({
  onStatus(state, label, src) {
    statusEl.className = 'status ' + state;
    lastStatus = [state, label, src]; statusText();
    if (state === 'connecting' || state === 'open') S.liveSec = null;
    if (state === 'connecting') introStep(40, 'introConn', label);
    if (state === 'open') introStep(65, 'introScout');
    if (state === 'live') { introStep(90, 'introReady'); finishIntro(); }
    if (src !== S.src) { if (S.src) resetStats(); S.src = src; multiSpot.setPrimary(src); }
    $('pair').textContent = `${M.base}/${SOURCES[src].quote} · ${SOURCES[src].name}`;
    syncExActive();
  },
  onTrade,
  onTicker(t) {
    S.open24h = t.open24h; S.hi = t.high24h; S.lo = t.low24h; S.vol = t.vol24h;
    if (!S.last && t.last > 0) S.last = t.last;
    if (t.last > 0) crossEx.inject(S.src || fm.source, t.last, t.open24h);
  },
  onBook(b) { S.book = b; },
});
const srcBtn = $('sourceBtn'), srcLbl = $('sourceLbl'), srcPop = $('sourcePop');
const srcOpts = [...document.querySelectorAll('#sourcePop button[data-src]')];
let sourceMode = paramsSource();
function paramsSource() {
  const p = new URLSearchParams(location.search).get('source') || lsGet('bb_source') || 'auto';
  return SOURCES[p] || p === 'auto' ? p : 'auto';
}
function renderSourceUi() {
  if (srcLbl) srcLbl.textContent = sourceMode === 'auto' ? T('auto') : SOURCES[sourceMode].name;
  for (const b of srcOpts) {
    const on = b.dataset.src === sourceMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
  }
}
function closeSourcePop() {
  if (!srcPop || srcPop.hidden) return;
  srcPop.hidden = true;
  if (srcBtn) srcBtn.setAttribute('aria-expanded', 'false');
}
function setSourceMode(mode, { reconnect = true } = {}) {
  if (mode !== 'auto' && !SOURCES[mode]) mode = 'auto';
  sourceMode = mode;
  lsSet('bb_source', mode);
  renderSourceUi();
  if (reconnect) {
    resetStats();
    fm.start(mode, M);
    syncExActive();
  }
}
if (srcBtn) {
  srcBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = srcPop.hidden;
    srcPop.hidden = !open;
    srcBtn.setAttribute('aria-expanded', open);
  });
}
srcOpts.forEach((b) => {
  b.addEventListener('click', () => {
    const next = b.dataset.src;
    closeSourcePop();
    if (next !== sourceMode) setSourceMode(next);
  });
});
document.addEventListener('click', (e) => {
  if (srcPop && !srcPop.hidden && !e.target.closest('#srcWrap')) closeSourcePop();
  if (defPop && !defPop.hidden && !e.target.closest('#defWrap')) closeDefPop();
  if (demoPop && !demoPop.hidden && !e.target.closest('#demoWrap')) closeDemoPop();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ((srcPop && !srcPop.hidden) || (defPop && !defPop.hidden) || (demoPop && !demoPop.hidden)) {
    closeSourcePop(); closeDefPop(); closeDemoPop(); return;
  }
  if (document.body.classList.contains('theater')) setTheater(false);
});

// ---------- 战场演练菜单 & 沉浸全屏大屏 (Theater Mode) & 播报/侦察 ----------
const demoBtn = $('demoBtn'), demoPop = $('demoPop');
function closeDemoPop() {
  if (!demoPop || demoPop.hidden) return;
  demoPop.hidden = true;
  if (demoBtn) demoBtn.setAttribute('aria-expanded', 'false');
}
if (demoBtn) {
  demoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDefPop();
    const open = demoPop.hidden;
    demoPop.hidden = !open;
    demoBtn.setAttribute('aria-expanded', open);
  });
}
document.querySelectorAll('#demoPop button[data-demo]').forEach((b) => {
  b.addEventListener('click', () => {
    const kind = b.dataset.demo;
    closeDemoPop();
    battle.triggerDemo(kind);
  });
});
battle.onDemoSfx = (type, side, rec) => {
  if (type === 'whale') audio.whale(side);
  else if (type === 'liq') audio.impact(320000, side);
  else if (type === 'breach') audio.breach(side, rec);
  else if (type === 'surge') audio.surge(side);
};

const theaterBtn = $('theaterBtn'), theaterLbl = $('theaterLbl'), hudTogBtn = $('hudTogBtn');
let hudHidden = false;
function renderTheaterUi() {
  const on = document.body.classList.contains('theater');
  if (theaterLbl) theaterLbl.textContent = T(on ? 'theaterExit' : 'theaterBtn');
  if (theaterBtn) theaterBtn.setAttribute('aria-pressed', on);
  if (hudTogBtn) {
    hudTogBtn.hidden = !on;
    hudTogBtn.textContent = T(hudHidden ? 'hudShow' : 'hudHide');
  }
}
function setTheater(on) {
  document.body.classList.toggle('theater', !!on);
  if (!on) { hudHidden = false; document.body.classList.remove('hud-hidden'); }
  renderTheaterUi();
  if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (!on && document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  requestAnimationFrame(() => { battle.resize(); klineChart.scheduleDraw(); });
  setTimeout(() => { battle.resize(); klineChart.scheduleDraw(); }, 180);
}
if (theaterBtn) theaterBtn.addEventListener('click', () => setTheater(!document.body.classList.contains('theater')));
if (hudTogBtn) hudTogBtn.addEventListener('click', () => {
  hudHidden = !hudHidden;
  document.body.classList.toggle('hud-hidden', hudHidden);
  renderTheaterUi();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('theater')) {
    // 用户按浏览器原生 ESC 退出了全屏，同步退出大屏布局
    document.body.classList.remove('theater', 'hud-hidden');
    hudHidden = false;
    renderTheaterUi();
    requestAnimationFrame(() => { battle.resize(); klineChart.scheduleDraw(); });
  }
});

function renderKillFeed(list = battle.killFeed) {
  const box = $('killFeed');
  if (!box) return;
  box.innerHTML = '';
  for (const ev of (list || []).slice(0, 4)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const cls = ev.type === 'liq' ? 'liq' : (ev.type === 'spoof' || ev.type === 'iceberg') ? `wall ${ev.side || ''}` : ev.side;
    btn.className = 'kf-pill ' + cls;
    const d = new Date(ev.ts);
    const tm = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    btn.textContent = `${tm} · ${ev.label}`;
    btn.title = ev.price > 0 ? `${ev.label} · $${Math.round(ev.price).toLocaleString('en-US')}` : ev.label;
    btn.addEventListener('click', () => {
      battle.replayEvent(ev);
      if (ev.ts) klineChart.highlightTs(ev.ts);
    });
    box.appendChild(btn);
  }
}
battle.onFeedUpdate = (list) => renderKillFeed(list);

battle.onHover = (info) => {
  const tip = $('battleTip'), card = $('battleCard');
  if (!tip || !card) return;
  if (!info) { tip.hidden = true; return; }
  let title = '', sub = '';
  if (info.kind === 'shield') {
    title = T('tipShield', info.side);
    sub = T('tipShieldSub', Math.round((info.str || 0) * 100), info.usd > 0 ? fmtUsd(info.usd) : '--', info.alert || 0);
  } else if (info.kind === 'wall') {
    title = T('tipWall', info.side, '$' + Math.round(info.price).toLocaleString('en-US'));
    sub = T('tipWallSub', fmtUsd(info.usd), `${info.distPct >= 0 ? '+' : ''}${info.distPct.toFixed(2)}%`);
  } else if (info.kind === 'line') {
    const pctStr = `${info.pct > 0 ? '+' : ''}${info.pct}%`;
    const pxStr = '$' + Math.round(info.price).toLocaleString('en-US');
    title = T('tipLine', pctStr, pxStr);
    sub = T('tipLineSub', T(info.state === 'captured' ? 'lineCaptured' : 'lineIntact'), info.wallUsd > 0 ? fmtUsd(info.wallUsd) : '--', info.breachCount || 0);
  }
  tip.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  tip.hidden = false;
  const cw = card.clientWidth || 800, ch = card.clientHeight || 400;
  const tw = tip.offsetWidth || 180, th = tip.offsetHeight || 54;
  tip.style.left = Math.max(8, Math.min(cw - tw - 8, info.x + 14)) + 'px';
  tip.style.top = Math.max(8, Math.min(ch - th - 8, info.y - th - 10)) + 'px';
};

// ---------- 多层价格防线间距切换 ----------
const DEF_KEY = 'cw_def_step';
const DEF_MODES = ['auto', '0.5', '1', '2'];
let defStepMode = lsGet(DEF_KEY, 'auto');
if (!DEF_MODES.includes(defStepMode)) defStepMode = 'auto';
const defBtn = $('defBtn'), defLbl = $('defLbl'), defPop = $('defPop');
const defOpts = [...document.querySelectorAll('#defPop button[data-step]')];
function renderDefUi() {
  const activeStep = battle.def.step || (defStepMode === 'auto' ? 1 : +defStepMode);
  if (defLbl) defLbl.textContent = defStepMode === 'auto' ? T('defLblAuto', activeStep) : T('defLblFixed', activeStep);
  for (const b of defOpts) {
    const st = b.dataset.step;
    b.textContent = st === 'auto' ? T('defOptAuto', activeStep) : T('defOptStep', st);
    const on = st === defStepMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
  }
}
function closeDefPop() {
  if (!defPop || defPop.hidden) return;
  defPop.hidden = true;
  if (defBtn) defBtn.setAttribute('aria-expanded', 'false');
}
if (defBtn) {
  defBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDemoPop();
    const open = defPop.hidden;
    defPop.hidden = !open;
    defBtn.setAttribute('aria-expanded', open);
  });
}
defOpts.forEach((b) => {
  b.addEventListener('click', () => {
    const next = b.dataset.step;
    closeDefPop();
    if (next !== defStepMode && DEF_MODES.includes(next)) {
      defStepMode = next;
      lsSet(DEF_KEY, next);
      syncDefense(computeDepth());
      renderDefUi();
    }
  });
});
window.addEventListener('offline', statusText);
window.addEventListener('online', () => { if (!lastStatus || lastStatus[0] !== 'live') fm.start(sourceMode, M); });
document.querySelectorAll('#exBar .ex-item').forEach((b) => {
  b.addEventListener('click', () => {
    const ex = b.dataset.ex;
    setSourceMode(sourceMode === ex ? 'auto' : ex);
  });
});

// ---------- 价格（逐位滚动） ----------
const priceEl = $('price');
function renderPrice(str, prevStr) {
  let html = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i], changed = prevStr.length !== str.length || prevStr[i] !== ch;
    html += /\d/.test(ch) ? `<span class="dg${changed ? ' ch' : ''}">${ch}</span>` : ch;
  }
  priceEl.innerHTML = html;
}
setInterval(() => {
  if (document.hidden || !S.last || S.last === lastShown) return;
  const up = S.last > lastShown, str = '$' + fmtP(S.last);
  if (lastShown) {
    priceEl.classList.remove('up', 'down'); void priceEl.offsetWidth; priceEl.classList.add(up ? 'up' : 'down');
    clearTimeout(flashT); flashT = setTimeout(() => priceEl.classList.remove('up', 'down'), 650);
  }
  renderPrice(str, S.shownStr); S.shownStr = str; lastShown = S.last;
  document.title = T('title', `${str} BTC`);
  updateMeta();
  renderBasisMetric();
  renderMtf();
}, 100);
function updateMeta() {
  if (document.hidden) return;
  if (S.last && S.open24h) {
    const ch = (S.last / S.open24h - 1) * 100, el = $('chg');
    el.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'; el.className = 'chg ' + (ch >= 0 ? 'pos' : 'neg');
  }
  if (S.hi) { $('hi').textContent = fmtP(S.hi); $('lo').textContent = fmtP(S.lo); $('vol').textContent = (S.vol >= 1e6 ? fmtNum(S.vol) : Math.round(S.vol).toLocaleString()) + ' BTC'; }
}
setInterval(updateMeta, 1000);
setInterval(() => {
  const n = S.tradesThisSec; S.tradesThisSec = 0;
  if (document.hidden) return;
  $('tps').textContent = T('tps', n);
  if ($('trades').querySelector('.empty')) renderTrades(); else tradesNote();
}, 1000);

// ---------- 多周期涨跌矩阵 & CME 缺口 ----------
const mtf = new MtfTracker({ onData: () => { renderMtf(); renderCmeGap(); syncDefense(computeDepth()); } });
function renderCmeGap() {
  const valEl = $('cmeGapVal'), subEl = $('cmeGapSub');
  if (!valEl || !subEl) return;
  const g = mtf.getCmeGap(S.last);
  if (!g) {
    valEl.textContent = T('cmeGapNone');
    subEl.textContent = ''; subEl.className = 'cme-s';
    return;
  }
  valEl.textContent = `$${Math.round(g.lo).toLocaleString('en-US')}–$${Math.round(g.hi).toLocaleString('en-US')}`;
  if (g.filled) {
    subEl.textContent = T('cmeGapFilled');
    subEl.className = 'cme-s filled';
  } else {
    const dp = g.distPct != null ? `${g.distPct >= 0 ? '+' : ''}${g.distPct.toFixed(2)}%` : '--';
    subEl.textContent = T('cmeGapOpen', dp, Math.round(g.fillPct));
    subEl.className = 'cme-s';
  }
}
function renderMtf() {
  if (document.hidden) return;
  const res = mtf.compute(S.last);
  for (const k of ['5m', '15m', '1h', '4h', '24h', '7d']) {
    const el = $('mtf-' + k), cell = el && el.parentElement;
    if (!el || !cell) continue;
    const v = res[k];
    if (v != null && isFinite(v)) {
      el.textContent = (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
      cell.className = 'mtf-cell ' + (v >= 0 ? 'pos' : 'neg');
    } else {
      el.textContent = '--';
      cell.className = 'mtf-cell';
    }
  }
  renderCmeGap();
}

// ---------- 恐慌与贪婪指数 + 全球交易时段 ----------
let fngState = null;
function syncBattleAtmo(depth = null) {
  const sess = getTradingSession();
  battle.setAtmosphere({
    fng: fngState ? fngState.value : null,
    storm: !!(sess.us || sess.overlap),
    overlap: !!sess.overlap,
    cbPremUsd: cxState ? cxState.cbPremUsd : null,
    wallBlue: depth ? depth.b05 : null,
    wallRed: depth ? depth.a05 : null,
  });
}
function renderFng() {
  if (!fngState) return;
  const v = fngState.value;
  $('fngVal').textContent = String(v);
  $('fngLabel').textContent = T(fngState.labelKey);
  $('fngPin').style.left = Math.max(2, Math.min(98, v)) + '%';
  const dEl = $('fngDelta');
  if (fngState.delta != null && isFinite(fngState.delta)) {
    dEl.textContent = T('fngDelta', fngState.delta);
    dEl.className = 'fng-d ' + (fngState.delta > 0 ? 'pos' : fngState.delta < 0 ? 'neg' : '');
  } else {
    dEl.textContent = ''; dEl.className = 'fng-d';
  }
  syncBattleAtmo();
}
async function loadFng(force = false) {
  const d = await fetchFearGreed(force);
  if (d) { fngState = d; renderFng(); }
}
loadFng();
setInterval(() => { if (!document.hidden) loadFng(true); }, 30 * 60e3);

function renderSession() {
  const s = getTradingSession();
  $('sessUtc').textContent = s.utcStr;
  $('sessAsia').classList.toggle('on', s.asia);
  $('sessEu').classList.toggle('on', s.eu);
  $('sessUs').classList.toggle('on', s.us);
  const cme = $('sessCme');
  cme.textContent = T(s.cmeOpen ? 'cmeOpen' : 'cmeClosed');
  cme.className = 'sess-pill cme ' + (s.cmeOpen ? 'on' : 'off');

  const pill = $('sessionPill');
  if (s.overlap) {
    pill.textContent = '🔥 ' + T('sessOverlap');
    pill.className = 'session-pill overlap';
  } else {
    const active = [];
    if (s.asia) active.push('🌏 ' + T('sessAsia'));
    if (s.eu) active.push('🌍 ' + T('sessEu'));
    if (s.us) active.push('🗽 ' + T('sessUs'));
    pill.textContent = active.length ? active.join(' / ') : '🌙 ' + T('sessQuiet');
    pill.className = 'session-pill';
  }
  syncBattleAtmo();
}
renderSession();
setInterval(() => { if (!document.hidden) renderSession(); }, 15000);

// ---------- 数字补间 & 比例条 ----------
const tweens = new Map();
function tweenNum(el, to, fmt = (v) => Math.round(v)) {
  const cur = tweens.get(el) ?? to; tweens.set(el, cur);
  const t0 = performance.now(), from = cur;
  el._tw = t0;
  const step = (now) => {
    if (el._tw !== t0) return;
    const k = Math.min((now - t0) / 500, 1), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
    tweens.set(el, v); el.textContent = fmt(v);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function setRatio(prefix, a, b, la, lb, fmtA, fmtB, note = '') {
  const tot = a + b, pa = tot ? a / tot : 0.5;
  $(prefix + 'b').style.width = (pa * 100).toFixed(1) + '%';
  $(prefix + 'r').style.width = ((1 - pa) * 100).toFixed(1) + '%';
  $(prefix + 'pct').innerHTML = (note ? `<small class="rb-note">${note}</small> ` : '') + (tot ? `<span class="c-blue">${(pa * 100).toFixed(0)}%</span> : <span class="c-red">${((1 - pa) * 100).toFixed(0)}%</span>` : '--');
  $(prefix + la).textContent = fmtA; $(prefix + lb).textContent = fmtB;
  return tot ? pa * 2 - 1 : 0;
}

// ---------- 盘口深度 & 巨鲸墙微操取证 ----------
const prevBigWalls = new Map();
const wallCooldown = new Map();
function checkWallForensics(mid, bidBuckets, askBuckets) {
  if (!(mid > 0)) return;
  const now = Date.now();
  const curMap = new Map();
  for (const [bp, usd] of bidBuckets) if (usd >= 300000) curMap.set('blue-' + bp, { side: 'blue', price: bp, usd });
  for (const [ap, usd] of askBuckets) if (usd >= 300000) curMap.set('red-' + ap, { side: 'red', price: ap, usd });

  // 1. 虚晃撤单检测 (Spoofing Pull)
  for (const [key, prev] of prevBigWalls) {
    if (prev.usd < 1500000 || now - prev.ts > 2500) continue;
    const bMap = prev.side === 'blue' ? bidBuckets : askBuckets;
    const curUsd = (bMap.get(prev.price) || 0) + (bMap.get(prev.price - 100) || 0) + (bMap.get(prev.price + 100) || 0);
    if (curUsd < prev.usd * 0.35) {
      const crossed = prev.side === 'blue' ? mid < prev.price : mid > prev.price;
      let oppVol = 0;
      for (const t of S.recentTakers) {
        if (now - t.ts <= 3000 && t.side === (prev.side === 'blue' ? 'sell' : 'buy') && Math.abs(t.price - prev.price) / prev.price < 0.0012) oppVol += t.usd;
      }
      const lastCd = wallCooldown.get('sp-' + key) || 0;
      if (!crossed && oppVol < prev.usd * 0.25 && now - lastCd > 12000) {
        wallCooldown.set('sp-' + key, now);
        battle.triggerWallEvent('spoof', { side: prev.side, price: prev.price, usd: prev.usd });
      }
    }
  }

  // 2. 冰山护盾吸收检测 (Iceberg Absorption)
  for (const [key, cur] of curMap) {
    if (Math.abs(cur.price - mid) / mid > 0.0018) continue;
    let oppVol = 0;
    for (const t of S.recentTakers) {
      if (now - t.ts <= 10000 && t.side === (cur.side === 'blue' ? 'sell' : 'buy') && Math.abs(t.price - cur.price) / cur.price < 0.0008) oppVol += t.usd;
    }
    const prev = prevBigWalls.get(key);
    const held = prev ? cur.usd >= prev.usd * 0.85 : cur.usd >= 300000;
    const notBroken = cur.side === 'blue' ? mid >= cur.price - 50 : mid <= cur.price + 50;
    const lastCd = wallCooldown.get('ib-' + key) || 0;
    if (oppVol >= 600000 && held && notBroken && now - lastCd > 15000) {
      wallCooldown.set('ib-' + key, now);
      battle.triggerWallEvent('iceberg', { side: cur.side, price: cur.price, usd: oppVol });
    }
  }

  prevBigWalls.clear();
  for (const [k, v] of curMap) prevBigWalls.set(k, { ...v, ts: now });
}

function renderWallList(wallsB, wallsA) {
  const el = $('wallList');
  if (!el) return;
  const col = (arr, cls) => {
    if (!arr.length) return `<div class="wall-col"><div class="wall-item ${cls}"><small>${T('wallEmpty')}</small></div></div>`;
    return '<div class="wall-col">' + arr.map(w =>
      `<div class="wall-item ${cls}"><span>$${Math.round(w.price).toLocaleString('en-US')}</span><b>${fmtUsd(w.usd)}</b><small>${w.distPct >= 0 ? '+' : ''}${w.distPct.toFixed(2)}%</small></div>`
    ).join('') + '</div>';
  };
  el.innerHTML = col(wallsB, 'b') + col(wallsA, 'a');
}

function computeDepth() {
  const b = S.book; if (!b || !b.ready) return null;
  const bb = b.bestBid(), ba = b.bestAsk(); if (!isFinite(bb) || !isFinite(ba) || bb >= ba * 1.01) return null;
  const mid = (bb + ba) / 2, NB = 50, bins = { bid: new Float64Array(NB), ask: new Float64Array(NB) };
  let b05 = 0, a05 = 0, b1 = 0, a1 = 0, b2 = 0, a2 = 0, minB = Infinity, maxA = 0;
  const bidBuckets = new Map(), askBuckets = new Map();
  for (const [p, q] of b.bids) {
    if (p < minB) minB = p;
    const d = (mid - p) / mid; if (d < 0 || d > 0.035) continue;
    const u = p * q;
    if (d <= 0.02) b2 += u;
    if (d <= 0.01) { b1 += u; bins.bid[Math.min(NB - 1, (d / 0.01 * NB) | 0)] += u; }
    if (d <= 0.005) b05 += u;
    const bk = Math.round(p / 100) * 100;
    bidBuckets.set(bk, (bidBuckets.get(bk) || 0) + u);
  }
  for (const [p, q] of b.asks) {
    if (p > maxA) maxA = p;
    const d = (p - mid) / mid; if (d < 0 || d > 0.035) continue;
    const u = p * q;
    if (d <= 0.02) a2 += u;
    if (d <= 0.01) { a1 += u; bins.ask[Math.min(NB - 1, (d / 0.01 * NB) | 0)] += u; }
    if (d <= 0.005) a05 += u;
    const bk = Math.round(p / 100) * 100;
    askBuckets.set(bk, (askBuckets.get(bk) || 0) + u);
  }
  const top = (mp, side) => [...mp.entries()]
    .filter(([, usd]) => usd >= 300000)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([price, usd]) => ({ side, price, usd, distPct: ((price - mid) / mid) * 100 }));
  const wallsB = top(bidBuckets, 'blue'), wallsA = top(askBuckets, 'red');
  checkWallForensics(mid, bidBuckets, askBuckets);
  return { bb, ba, mid, b05, a05, b1, a1, b2, a2, wallsB, wallsA, cover: Math.min((mid - minB) / mid, (maxA - mid) / mid), bins };
}

// ---------- 小图表 ----------
function prepCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
  return [x, r.width, r.height];
}
function drawPremSpark(hist) {
  const cv = $('premSpark'); if (!cv) return;
  const [x, W, H] = prepCanvas(cv);
  if (!hist || hist.length < 2) return;
  let mx = 5;
  for (const pt of hist) mx = Math.max(mx, Math.abs(pt.v));
  const mid = H / 2;
  x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, mid); x.lineTo(W, mid); x.stroke();
  const last = hist[hist.length - 1].v;
  x.strokeStyle = last >= 0 ? '#60a5fa' : '#f87171';
  x.lineWidth = 1.5; x.beginPath();
  hist.forEach((pt, i) => {
    const px = (i / (hist.length - 1)) * W;
    const py = mid - (pt.v / mx) * (mid - 3);
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  });
  x.stroke();
}
function drawFlow() {
  const [x, W, H] = prepCanvas($('flowChart'));
  const srcArr = flowScope === 'agg' ? S.aggBuckets : S.buckets;
  const bars = [], pPts = [];
  let mx = 1;
  if (flowWin === '15m') {
    const nowBin = Math.floor(Date.now() / 10000), N = 90;
    for (let i = N - 1; i >= 0; i--) {
      const bin = nowBin - i, slot = S.agg10s[((bin % 90) + 90) % 90];
      const bu = slot.bin === bin ? slot.bu : 0, su = slot.bin === bin ? slot.su : 0;
      const p = slot.bin === bin && slot.p > 0 ? slot.p : 0;
      bars.push([bu, su]); pPts.push(p); mx = Math.max(mx, bu, su);
    }
  } else {
    const now = Math.floor(Date.now() / 1000), N = 60, step = 2;
    for (let i = N - 1; i >= 0; i--) {
      let bu = 0, su = 0, p = 0;
      for (let j = 0; j < step; j++) {
        const s = now - i * step - j, k = srcArr[((s % 300) + 300) % 300];
        if (k.sec === s) { bu += k.bu; su += k.su; }
        const ph = S.px[((s % 120) + 120) % 120];
        if (ph.sec === s && ph.p > 0) p = ph.p;
      }
      bars.push([bu, su]); pPts.push(p); mx = Math.max(mx, bu, su);
    }
  }
  const N = bars.length, mid = H / 2, bw = W / N;
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, mid, W, 1);
  let cum = 0; const cumPts = [];
  bars.forEach(([bu, su], i) => {
    const hb = Math.sqrt(bu / mx) * (mid - 4), hs = Math.sqrt(su / mx) * (mid - 4);
    let g = x.createLinearGradient(0, mid - hb, 0, mid); g.addColorStop(0, '#93c5fd'); g.addColorStop(1, '#1d4ed8');
    x.fillStyle = g; x.fillRect(i * bw + 0.5, mid - hb, Math.max(1, bw - 1.5), hb);
    g = x.createLinearGradient(0, mid, 0, mid + hs); g.addColorStop(0, '#b91c1c'); g.addColorStop(1, '#fca5a5');
    x.fillStyle = g; x.fillRect(i * bw + 0.5, mid + 1, Math.max(1, bw - 1.5), hs);
    cum += bu - su; cumPts.push(cum);
  });
  const cm = Math.max(1, ...cumPts.map(Math.abs));
  x.strokeStyle = '#fbbf24'; x.lineWidth = 1.8; x.shadowColor = '#fbbf24'; x.shadowBlur = 5; x.beginPath();
  cumPts.forEach((c, i) => { const y = mid - (c / cm) * (mid - 6); i ? x.lineTo(i * bw + bw / 2, y) : x.moveTo(bw / 2, y); });
  x.stroke(); x.shadowBlur = 0;
  // 叠加价格线用于背离对照
  const validP = pPts.filter(v => v > 0);
  if (validP.length >= 2) {
    const pMin = Math.min(...validP), pMax = Math.max(...validP), pSpan = Math.max(1, pMax - pMin);
    x.strokeStyle = 'rgba(255,255,255,0.68)'; x.lineWidth = 1.15; x.beginPath();
    let started = false;
    pPts.forEach((p, i) => {
      if (!(p > 0)) return;
      const y = (H - 6) - ((p - pMin) / pSpan) * (H - 12);
      const px = i * bw + bw / 2;
      if (!started) { x.moveTo(px, y); started = true; } else x.lineTo(px, y);
    });
    x.stroke();
  }
}
function drawDepth(d) {
  const [x, W, H] = prepCanvas($('depthChart'));
  if (!d) { x.fillStyle = 'rgba(230,235,255,.5)'; x.font = '12px -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'; x.fillText(T('depthWait'), 10, 20); return; }
  const NB = d.bins.bid.length; let cb = 0, ca = 0; const cbA = [], caA = [];
  for (let i = 0; i < NB; i++) { cb += d.bins.bid[i]; ca += d.bins.ask[i]; cbA.push(cb); caA.push(ca); }
  const mx = Math.max(cb, ca, 1), mid = W / 2, base = H - 14;
  const area = (arr, dir, c1, c2, stroke) => {
    const g = x.createLinearGradient(0, 0, 0, base); g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.beginPath(); x.moveTo(mid, base);
    arr.forEach((v, i) => x.lineTo(mid + dir * (i + 1) / NB * (mid - 2), base - v / mx * (base - 16)));
    x.lineTo(mid + dir * (mid - 2), base); x.closePath(); x.fill();
    x.strokeStyle = stroke; x.lineWidth = 1.5; x.beginPath(); x.moveTo(mid, base);
    arr.forEach((v, i) => x.lineTo(mid + dir * (i + 1) / NB * (mid - 2), base - v / mx * (base - 16))); x.stroke();
  };
  area(cbA, -1, 'rgba(59,130,246,.7)', 'rgba(59,130,246,.05)', '#93c5fd');
  area(caA, 1, 'rgba(239,68,68,.7)', 'rgba(239,68,68,.05)', '#fca5a5');
  x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(mid, 10, 1, base - 10);
  x.fillStyle = 'rgba(230,235,255,.55)'; x.font = '10px "JetBrains Mono", monospace';
  x.textAlign = 'left'; x.fillText('-1%', 2, H - 3); x.textAlign = 'right'; x.fillText('+1%', W - 2, H - 3);
  x.textAlign = 'center'; x.fillText(fmtP(d.mid), mid, H - 3);
  x.textAlign = 'left'; x.fillText(T('wallB') + fmtUsd(cb), 4, 11); x.textAlign = 'right'; x.fillText(T('wallA') + fmtUsd(ca), W - 4, 11);
  if (d.cover < 0.0099) { x.textAlign = 'center'; x.fillStyle = 'rgba(251,191,36,.7)'; x.fillText(T('depthCover', (d.cover * 100).toFixed(2)), mid, 24); }
}

// ---------- 横幅 ----------
const banner = $('banner'); let bannerT, bannerBusyUntil = 0;
function showBanner(html, cls, ms = 2200, force = false) {
  const now = Date.now(); if (!force && now < bannerBusyUntil) return;
  bannerBusyUntil = now + ms;
  banner.innerHTML = html; banner.className = 'banner ' + cls;
  void banner.offsetWidth; banner.classList.add('show');
  clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), ms);
}
battle.onWhale = (side, usd) => (audio.whale(side), showBanner(T('whale', side === 'blue', fmtUsd(usd)), side, 2600, true));
battle.onStepChange = () => renderDefUi();
battle.onBreach = (ev) => {
  audio.breach(ev.side, ev.recaptured);
  const pctStr = (ev.pct > 0 ? '+' : '') + ev.pct + '%';
  const pxStr = '$' + fmtPx(ev.price, 0);
  showBanner(
    ev.recaptured
      ? T('defRecapBanner', ev.side === 'blue', pctStr, pxStr)
      : T('defBreachBanner', ev.side === 'blue', pctStr, pxStr),
    ev.side,
    ev.recaptured ? 2000 : 2500,
    !ev.recaptured
  );
};

function computeDefenseWalls(book, anchor, step) {
  if (!book || !book.ready || !(anchor > 0) || !(step > 0)) return null;
  let minB = Infinity, maxA = 0;
  for (const p of book.bids.keys()) if (p < minB) minB = p;
  for (const p of book.asks.keys()) if (p > maxA) maxA = p;
  const walls = new Map();
  const targets = [-3, -2, -1, 1, 2, 3].map((lvl) => {
    const px = anchor * (1 + (lvl * step) / 100);
    const halfBand = px * 0.0018;
    return { lvl, lo: px - halfBand, hi: px + halfBand, covered: px >= minB && px <= maxA, usd: 0 };
  });
  for (const [p, q] of book.bids) {
    for (const t of targets) {
      if (t.lvl < 0 && p >= t.lo && p <= t.hi) t.usd += p * q;
    }
  }
  for (const [p, q] of book.asks) {
    for (const t of targets) {
      if (t.lvl > 0 && p >= t.lo && p <= t.hi) t.usd += p * q;
    }
  }
  for (const t of targets) walls.set(t.lvl, { usd: t.usd, covered: t.covered });
  return walls;
}

function syncDefense(depth = null) {
  const anchor = mtf.dailyOpen > 0 ? mtf.dailyOpen : S.open24h;
  if (!(anchor > 0) || !(S.last > 0)) return;
  const anchorType = mtf.dailyOpen > 0 ? 'daily' : '24h';
  const absPct = Math.abs(S.last / anchor - 1) * 100;
  const previewStep = defStepMode === 'auto'
    ? (battle.def.initialized ? battle.def.step : (absPct >= 7 ? 3 : absPct >= 3.4 ? 2 : 1))
    : (+defStepMode || 1);
  const wallMap = depth && S.book ? computeDefenseWalls(S.book, anchor, previewStep) : null;
  battle.setDefenseState({ anchor, anchorType, price: S.last, stepMode: defStepMode, wallMap });
  const zones = estimateLiqZones(klineChart.candles, S.last);
  battle.setLiqZones(zones);
  klineChart.setOverlays({ anchor, step: battle.def.step || previewStep, liqZones: zones });
}

// ---------- 吃单范围/窗口 & 战力模式切换 ----------
const flowScopeBtn = $('flowScope'), flowWinBtn = $('flowWin'), powModeBtn = $('powModeBtn');
function renderFlowControls() {
  if (flowScopeBtn) {
    flowScopeBtn.textContent = T(flowScope === 'agg' ? 'flowAgg' : 'flowSingle');
    flowScopeBtn.classList.toggle('on', flowScope === 'agg');
  }
  if (flowWinBtn) {
    flowWinBtn.textContent = flowWin;
    flowWinBtn.classList.toggle('on', flowWin === '15m');
  }
  const cap = $('flowCap');
  if (cap) cap.textContent = T(flowWin === '15m' ? 'flowCap15' : 'flowCap');
}
if (flowScopeBtn) flowScopeBtn.addEventListener('click', () => {
  flowScope = flowScope === 'agg' ? 'single' : 'agg';
  lsSet('cw_flow_scope', flowScope);
  renderFlowControls();
  refresh();
});
if (flowWinBtn) flowWinBtn.addEventListener('click', () => {
  flowWin = flowWin === '2m' ? '15m' : '2m';
  lsSet('cw_flow_win', flowWin);
  renderFlowControls();
  drawFlow();
});
function renderPowModeUi() {
  if (!powModeBtn) return;
  powModeBtn.textContent = T(powMode === '5d' ? 'pow5d' : 'powFast');
  powModeBtn.classList.toggle('fast', powMode === 'fast');
}
if (powModeBtn) powModeBtn.addEventListener('click', () => {
  powMode = powMode === '5d' ? 'fast' : '5d';
  lsSet('cw_pow_mode', powMode);
  renderPowModeUi();
  refresh();
});

// ---------- 战力 & 刷新 ----------
let smoothS = 0, musicI = 0.15, musicBpm = 80, musicMood = 0;
const VICTORY_SEC = 20;
function refresh() {
  if (document.hidden) return;
  const now = Date.now();
  const dt = S.lastRefreshAt ? Math.min((now - S.lastRefreshAt) / 1000, 1) : 0;
  S.lastRefreshAt = now;
  const C = M.base;
  const srcBuckets = flowScope === 'agg' ? S.aggBuckets : S.buckets;
  const w10 = windowSum(10, srcBuckets), w60 = windowSum(60, srcBuckets), w300 = windowSum(300, srcBuckets);
  const f = (q, u) => `${fmtQ(q)} ${C} · ${fmtUsd(u)}`;
  const cov = S.since ? Math.floor(Date.now() / 1000) - S.since + 1 : 0;
  const nt = (n) => cov < n ? T('only', cov) : '';
  const i10 = setRatio('tk10', w10.bu, w10.su, 'buy', 'sell', T('buy') + ' ' + f(w10.b, w10.bu), T('sell') + ' ' + f(w10.s, w10.su), nt(10));
  const i60 = setRatio('tk60', w60.bu, w60.su, 'buy', 'sell', T('buy') + ' ' + f(w60.b, w60.bu), T('sell') + ' ' + f(w60.s, w60.su), nt(60));
  setRatio('tk300', w300.bu, w300.su, 'buy', 'sell', T('buy') + ' ' + f(w300.b, w300.bu), T('sell') + ' ' + f(w300.s, w300.su), nt(300));
  const dl = w300.bu - w300.su, de = $('delta');
  const dq = w300.b - w300.s;
  de.textContent = (dl >= 0 ? '+' : '-') + fmtUsd(Math.abs(dl)) + ` (${dq >= 0 ? '+' : '-'}${fmtQ(Math.abs(dq))} ${C})`;
  de.className = dl >= 0 ? 'c-blue' : 'c-red';

  // 价格 vs 现货 CVD 5 分钟背离检测
  const w300Agg = windowSum(300, S.aggBuckets);
  const ch5m = mtf.compute(S.last)['5m'];
  const aggCvd = w300Agg.bu - w300Agg.su, aggTot = w300Agg.bu + w300Agg.su;
  const aggShare = aggTot > 0 ? w300Agg.bu / aggTot : 0.5;
  if (ch5m != null && ch5m <= -0.12 && aggCvd >= 1200000 && aggShare >= 0.54) S.cvdDiv = 'bull';
  else if (ch5m != null && ch5m >= 0.12 && aggCvd <= -1200000 && aggShare <= 0.46) S.cvdDiv = 'bear';
  else S.cvdDiv = null;
  const divEl = $('cvdDiv');
  if (divEl) {
    if (S.cvdDiv) {
      divEl.hidden = false;
      divEl.className = 'cvd-div ' + S.cvdDiv;
      divEl.textContent = T(S.cvdDiv === 'bull' ? 'cvdDivBull' : 'cvdDivBear');
    } else {
      divEl.hidden = true;
    }
  }

  const d = computeDepth(); let ib = 0;
  if (d) {
    const cv = (r) => d.cover < r ? T('cover', (d.cover * 100).toFixed(2)) : '';
    ib = setRatio('bk05', d.b05, d.a05, 'bid', 'ask', T('bid') + ' ' + fmtUsd(d.b05), T('ask') + ' ' + fmtUsd(d.a05), cv(0.0049));
    setRatio('bk1', d.b1, d.a1, 'bid', 'ask', T('bid') + ' ' + fmtUsd(d.b1), T('ask') + ' ' + fmtUsd(d.a1), cv(0.0099));
    setRatio('bk2', d.b2, d.a2, 'bid', 'ask', T('bid') + ' ' + fmtUsd(d.b2), T('ask') + ' ' + fmtUsd(d.a2), cv(0.0199));
    $('bb').textContent = fmtP(d.bb); $('ba').textContent = fmtP(d.ba); $('spr').textContent = fmtP(d.ba - d.bb);
    renderWallList(d.wallsB, d.wallsA);
    battle.setOrderWalls([...d.wallsB, ...d.wallsA]);
  }
  drawDepth(d); drawFlow();
  syncBattleAtmo(d);

  // ===== BTC 五维战力模型（全部来自实时行情，无随机）=====
  const ch10 = priceChange(10), ch60 = priceChange(60);
  const p10 = Math.tanh(ch10 / 0.03), p60 = Math.tanh(ch60 / 0.10);
  const cPrice = 0.5 * p10 + 0.5 * p60;
  const cTaker = 0.5 * i10 + 0.5 * i60;
  const cBook = ib;

  let cPerp = null;
  if (perpState.available) {
    const tkBias = perpState.perpTakerRatio != null ? Math.tanh((perpState.perpTakerRatio - 1) * 3) : null;
    const liqBias = perpState.hasLiqStream ? Math.tanh(((perpState.liqShort5m || 0) - (perpState.liqLong5m || 0)) / 250000) : null;
    if (tkBias != null && liqBias != null) cPerp = 0.55 * tkBias + 0.45 * liqBias;
    else if (tkBias != null) cPerp = tkBias;
    else if (liqBias != null) cPerp = liqBias;
  }
  const cPrem = (cxState && cxState.cbPremUsd != null && isFinite(cxState.cbPremUsd)) ? Math.tanh(cxState.cbPremUsd / 60) : null;

  let wPrice = 0.50, wTaker = 0.30, wBook = 0.20, wPerp = 0, wPrem = 0;
  if (powMode === '5d') {
    wPrice = 0.34; wTaker = 0.24; wBook = 0.16;
    wPerp = cPerp != null ? 0.16 : 0;
    wPrem = cPrem != null ? 0.10 : 0;
  }
  const wSum = wPrice + wTaker + wBook + wPerp + wPrem || 1;
  const raw = (wPrice * cPrice + wTaker * cTaker + wBook * cBook + wPerp * (cPerp || 0) + wPrem * (cPrem || 0)) / wSum;
  smoothS = smoothS * 0.6 + raw * 0.4;

  const ref = cfg().th.shell * 4;
  battle.setActivity(w10.bu / ref, w10.su / ref);

  const actUsd = Math.tanh((w10.bu + w10.su) / ref / 1.5);
  if (S.liveSec && Date.now() / 1000 - S.liveSec >= 10) S.nEma = S.nEma ? S.nEma * 0.995 + w10.n * 0.005 : Math.max(w10.n, 3);
  const actN = Math.tanh(w10.n / (2 * Math.max(3, S.nEma || 10)));
  const act = 0.6 * actUsd + 0.4 * actN;
  musicI = musicI * 0.7 + Math.min(1, 0.15 + 0.4 * act + 0.45 * Math.abs(smoothS)) * 0.3;
  musicBpm = musicBpm * 0.75 + (70 + 56 * act + 14 * Math.abs(smoothS)) * 0.25;
  musicMood = 0.7 * (0.5 * p10 + 0.5 * p60) + 0.3 * smoothS;
  audio.update({ intensity: S.surge ? Math.max(musicI, 0.85) : musicI, bias: musicMood, surge: S.surge, bpm: S.surge ? Math.max(124, musicBpm) : musicBpm });
  updateMusicInd();
  S.dbg = { src: S.src, since: S.since, musicI, musicBpm, musicMood, t: Date.now(), price: S.last, ch10, ch60, p10, p60, i10, i60, ib, cPerp, cPrem, raw, s: smoothS, front: battle.front, target: battle.frontTarget, actB: w10.bu / ref, actR: w10.su / ref, w10, w60, w300, th: CF.th };

  const chip = (label, v, txt) => {
    const cls = v == null ? '' : v > 0.06 ? 'pos' : v < -0.06 ? 'neg' : '';
    const vCls = v == null ? '' : v >= 0 ? 'c-blue' : 'c-red';
    return `<span class="b-chip ${cls}">${label} <b class="${vCls}">${txt}</b></span>`;
  };
  const ratioStr = (v) => { const b = Math.round((v + 1) * 50); return `${b}:${100 - b}`; };
  const premTxt = cxState && cxState.cbPremUsd != null ? `${cxState.cbPremUsd >= 0 ? '+' : '-'}$${Math.abs(cxState.cbPremUsd).toFixed(0)}` : '--';
  const perpTxt = cPerp != null ? `${cPerp >= 0 ? '+' : ''}${Math.round(cPerp * 100)}` : '--';
  $('basis').innerHTML = [
    chip(T('bPrice'), cPrice, `${ch60 >= 0 ? '+' : ''}${ch60.toFixed(2)}%`),
    chip(T('bCvd'), cTaker, ratioStr(i60)),
    chip(T('bBook'), cBook, ratioStr(ib)),
    powMode === '5d' ? chip(T('bPerp'), cPerp, perpTxt) : '',
    powMode === '5d' ? chip(T('bPrem'), cPrem, premTxt) : '',
  ].filter(Boolean).join('');

  const s = smoothS, blueShare = 0.5 + 0.5 * s;
  battle.setMomentum(s);
  syncDefense(d);
  if (!battle.def.initialized) battle.setFront(0.5 + Math.tanh(s * 1.6) * 0.5);
  const bp = Math.round(blueShare * 100);
  tweenNum($('bluePow'), bp); tweenNum($('redPow'), 100 - bp);
  $('pbBlue').style.width = bp + '%'; $('pbRed').style.width = (100 - bp) + '%';
  $('pbClash').style.left = bp + '%';

  let surge = S.surge;
  if (!surge && s > 0.3) surge = 'blue'; else if (!surge && s < -0.3) surge = 'red';
  else if (surge === 'blue' && s < 0.2) surge = null; else if (surge === 'red' && s > -0.2) surge = null;
  if (surge !== S.surge) {
    S.surge = surge; S.surgeSince = now; S.surgeHeld = 0; S.wonFor = null; battle.setSurge(surge);
    if (surge) audio.surge(surge);
    if (surge) showBanner(surge === 'blue' ? T('surgeB') : T('surgeR'), surge, 2400, true);
  }
  if (surge) S.surgeHeld += dt;
  const held = surge ? S.surgeHeld : 0;
  if (surge && held >= VICTORY_SEC && S.wonFor !== surge) {
    S.wonFor = surge; battle.celebrate(surge); audio.fanfare(surge);
    showBanner(surge === 'blue' ? T('winB', VICTORY_SEC) : T('winR', VICTORY_SEC), surge + ' victory', 3200, true);
  }
  $('streak').textContent = surge ? T('streak', surge === 'blue', Math.floor(held), held >= VICTORY_SEC) : '';
  const st = $('battleState');
  if (surge) { st.textContent = surge === 'blue' ? T('stSurgeB') : T('stSurgeR'); st.className = 'state surge ' + surge; }
  else if (s > 0.08) { st.textContent = T('stBlue'); st.className = 'state blue'; }
  else if (s < -0.08) { st.textContent = T('stRed'); st.className = 'state red'; }
  else { st.textContent = T('stTie'); st.className = 'state'; }
}
setInterval(refresh, 400);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    S.lastRefreshAt = Date.now();
    refresh(); updateMeta(); renderPerp(); renderCrossEx(); renderMtf(); renderSession(); klineChart.draw();
  }
});

// ---------- 战争配乐 / 音效 ----------
const audio = new AudioController();
window.__audio = audio;
const AKEY = 'cw_audio2';
let AP0 = {}; try { AP0 = JSON.parse(lsGet(AKEY, '{}') || '{}') || {}; } catch {}
const AP = Object.assign({ music: true, sfx: true, vol: 75 }, AP0);
const audioBtn = $('audioBtn'), pop = $('audioPop'), mInd = $('musicInd');
$('musicTog').checked = AP.music; $('sfxTog').checked = AP.sfx; $('volRange').value = AP.vol;
function moodLabel() {
  if (S.surge) return S.surge === 'blue' ? T('mSurgeB') : T('mSurgeR');
  return musicMood > 0.15 ? T('mUp') : musicMood < -0.15 ? T('mDown') : T('mTie');
}
function updateMusicInd() {
  const want = AP.music || AP.sfx, locked = audio.locked;
  audioBtn.textContent = !want ? '🔇' : AP.music ? '🎵' : '🔊';
  audioBtn.classList.toggle('on', want && audio.running);
  audioBtn.classList.toggle('pending', locked);
  mInd.className = 'music-ind' + (locked ? ' locked' : !want ? ' off' : '') + (!locked && want ? ' ' + (S.surge || (musicMood > 0.15 ? 'blue' : musicMood < -0.15 ? 'red' : '')) : '');
  mInd.textContent = locked ? T('mLocked') : !want ? T('mOff') : AP.music ? `♪ ${audio.bpm()} BPM · ${moodLabel()}` : `${T('mSfx')} · ${moodLabel()}`;
}
function saveAudio() {
  lsSet(AKEY, JSON.stringify(AP));
  audio.apply({ music: AP.music, sfx: AP.sfx, volume: AP.vol / 100 });
  if ((AP.music || AP.sfx) && !audio.running) audio.unlock().then(updateMusicInd);
  updateMusicInd();
}
audio.onstate = updateMusicInd;
audio.apply({ music: AP.music, sfx: AP.sfx, volume: AP.vol / 100 });
const GEST = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
function onGesture() {
  if (!(AP.music || AP.sfx)) return;
  if (!audio.running) audio.unlock().then((ok) => { updateMusicInd(); if (ok) GEST.forEach(ev => document.removeEventListener(ev, onGesture, true)); });
  else GEST.forEach(ev => document.removeEventListener(ev, onGesture, true));
}
GEST.forEach(ev => document.addEventListener(ev, onGesture, true));
if (AP.music || AP.sfx) audio.tryAutoStart().then(updateMusicInd);
$('introGo').onclick = (e) => { e.stopPropagation(); onGesture(); closeIntro(); };
intro.addEventListener('click', () => { if (intro.classList.contains('ready')) { onGesture(); closeIntro(); } });
document.addEventListener('keydown', (e) => { if (intro.classList.contains('ready') && (e.key === 'Enter' || e.key === ' ')) closeIntro(); });
mInd.onclick = (e) => { e.stopPropagation(); if (audio.locked) onGesture(); else pop.hidden = !pop.hidden; };
audioBtn.onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; };
document.addEventListener('click', (e) => { if (!pop.hidden && !e.target.closest('.audio-wrap')) pop.hidden = true; });
$('musicTog').onchange = (e) => { AP.music = e.target.checked; saveAudio(); };
$('sfxTog').onchange = (e) => { AP.sfx = e.target.checked; saveAudio(); };
$('volRange').oninput = (e) => { AP.vol = +e.target.value; saveAudio(); };
updateMusicInd();

// ---------- 顶栏自适应 ----------
const topbar = document.querySelector('.topbar');
function fitHeader() {
  const bw = document.querySelector('.brand-wrap'), ct = document.querySelector('.controls'), eb = $('exBar');
  if (!topbar || !bw || !ct || !eb) return;
  topbar.classList.remove('stack', 'stack2', 'stack3', 'stack4');
  if (window.innerWidth <= 640) return;
  const cs = getComputedStyle(topbar), inner = topbar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const gap = parseFloat(cs.columnGap) || 14;
  if (bw.scrollWidth + eb.scrollWidth + ct.scrollWidth + gap * 2 + 8 > inner) {
    topbar.classList.add('stack');
    if (bw.scrollWidth + ct.scrollWidth + gap + 8 > inner) topbar.classList.add('stack2');
    if (eb.scrollWidth > inner) topbar.classList.add('stack3');
    if (eb.scrollWidth > inner) topbar.classList.add('stack4');
  }
}
window.addEventListener('resize', fitHeader);
document.fonts && document.fonts.ready.then(fitHeader);
let fitSig = '';
setTimeout(fitHeader, 0);
setInterval(() => {
  if (document.hidden) return;
  const sig = $('statusText').textContent + '|' + mInd.textContent + '|' + $('cbPremTopVal').textContent + '|' + innerWidth;
  if (sig !== fitSig) { fitSig = sig; fitHeader(); }
}, 500);

// ---------- 永续合约全景 & 双所爆仓流 ----------
let perpState = { available: false, liqFeed: [] };
function fmtCountdown(ts) {
  const sec = Math.max(0, Math.floor((ts - Date.now()) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function renderBasisMetric() {
  const bEl = $('perpBasis'), mEl = $('perpMark'), radEl = $('radBasis'), radPct = $('radBasisPct');
  if (!bEl || !mEl || !radEl) return;
  if (perpState.available && perpState.mark > 0 && S.last > 0) {
    const diff = perpState.mark - S.last;
    const pct = (perpState.mark / S.last - 1) * 100;
    const sign = diff >= 0 ? '+' : '-';
    const cls = diff >= 0 ? 'pos' : 'neg';
    const usdStr = `${sign}$${Math.abs(diff).toFixed(1)}`;
    const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    bEl.textContent = `${usdStr} (${pctStr})`;
    bEl.className = 'perp-v ' + cls;
    mEl.textContent = T('perpMark', fmtPx(perpState.mark, 2));
    radEl.textContent = usdStr;
    radEl.className = cls;
    if (radPct) { radPct.textContent = pctStr; radPct.className = cls; }
  } else {
    bEl.textContent = '--'; bEl.className = 'perp-v';
    mEl.textContent = perpState.mark > 0 ? T('perpMark', fmtPx(perpState.mark, 2)) : '--';
    radEl.textContent = '--'; radEl.className = '';
    if (radPct) { radPct.textContent = '--'; radPct.className = ''; }
  }
}
function renderLiqFeed() {
  const ul = $('liqList'), mini = $('liqMini');
  if (!ul) return;
  const arr = perpState.liqFeed || [];
  if (mini) {
    const tot = (perpState.liqLong5m || 0) + (perpState.liqShort5m || 0);
    mini.textContent = tot > 0 ? T('perpLiqPair', fmtUsd(perpState.liqLong5m || 0), fmtUsd(perpState.liqShort5m || 0)) : '';
  }
  if (!arr.length) {
    ul.innerHTML = `<li class="liq-empty">${T('liqEmpty')}</li>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const x of arr.slice(0, 40)) {
    const d = new Date(x.ts);
    const li = document.createElement('li');
    li.className = 'liq-row ' + x.side + (x.usd >= 50000 ? ' big' : '');
    li.innerHTML =
      `<span>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</span>` +
      `<span class="ls">${T(x.side === 'long' ? 'liqSideL' : 'liqSideS')}</span>` +
      `<span>$${fmtPx(x.price, 1)}</span>` +
      `<span>${x.usd >= 100000 ? '🔥 ' : ''}${fmtUsd(x.usd)}</span>` +
      `<span class="lex">${x.ex || 'BN'}</span>`;
    frag.appendChild(li);
  }
  ul.replaceChildren(frag);
}
function renderLsBar(lr, sr, ratio, txtId, bId, rId) {
  if (lr != null && sr != null) {
    const lp = Math.round(lr * 100), sp = 100 - lp;
    $(txtId).textContent = `${lp}:${sp}` + (ratio != null ? ` (${ratio.toFixed(2)})` : '');
    $(bId).style.width = lp + '%';
    $(rId).style.width = sp + '%';
  } else {
    $(txtId).textContent = '--';
    $(bId).style.width = '50%';
    $(rId).style.width = '50%';
  }
}
const liqWinBtns = [...document.querySelectorAll('#liqWinTabs button[data-lwin]')];
function renderLiqWinTabs() {
  liqWinBtns.forEach((b) => {
    const on = b.dataset.lwin === liqWin;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  const tEl = $('perpLiqTitle');
  if (tEl) tEl.textContent = T('perpLiqW', liqWin);
}
liqWinBtns.forEach((b) => b.addEventListener('click', () => {
  liqWin = b.dataset.lwin;
  lsSet('cw_liq_win', liqWin);
  renderLiqWinTabs();
  renderPerp();
}));

function renderPerp() {
  const card = $('perpCard'); if (!card) return;
  const st = perpState;
  card.classList.toggle('na', !st.available);
  const srcEl = $('perpSrc');
  srcEl.textContent = st.available ? `${SOURCES[st.src]?.name || st.src} · ${st.symbol}` : T('perpNone');
  srcEl.classList.toggle('on', !!st.available);

  const reg = computeRegime(mtf.compute(S.last)['5m'], st.oiChg5m);
  st.regime = reg;
  const regEl = $('perpRegime');
  if (regEl) {
    if (reg) {
      regEl.hidden = false;
      regEl.className = 'regime-pill ' + reg;
      regEl.textContent = T('reg_' + reg);
    } else {
      regEl.hidden = true;
    }
  }

  const fEl = $('perpFund'), aprEl = $('perpApr');
  if (st.available && st.funding != null && isFinite(st.funding)) {
    const pct = st.funding * 100;
    fEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(4)}%`;
    fEl.className = 'perp-v ' + (pct > 0 ? 'pos' : pct < 0 ? 'neg' : '');
    $('perpNext').textContent = st.nextFunding > Date.now() ? T('perpNext', fmtCountdown(st.nextFunding)) : '--';
    if (aprEl) {
      aprEl.textContent = st.fundingApr != null ? T('perpApr', st.fundingApr) : '';
      aprEl.className = 'perp-s ' + (pct > 0 ? 'pos' : pct < 0 ? 'neg' : '');
    }
  } else {
    fEl.textContent = '--'; fEl.className = 'perp-v'; $('perpNext').textContent = '--';
    if (aprEl) { aprEl.textContent = ''; aprEl.className = 'perp-s'; }
  }

  renderBasisMetric();

  const oiDelEl = $('perpOiDelta');
  if (st.available && st.oiUsd > 0) {
    $('perpOi').textContent = fmtUsd(st.oiUsd);
    $('perpOiQty').textContent = st.oiQty > 0 ? `${fmtQ(st.oiQty)} BTC` : '--';
    if (oiDelEl) {
      const fCh = (v) => v != null && isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '--';
      oiDelEl.textContent = T('perpOiDelta', fCh(st.oiChg5m), fCh(st.oiChg1h));
      oiDelEl.className = 'perp-s ' + (st.oiChg1h > 0 ? 'pos' : st.oiChg1h < 0 ? 'neg' : '');
    }
  } else {
    $('perpOi').textContent = '--'; $('perpOiQty').textContent = '--';
    if (oiDelEl) { oiDelEl.textContent = ''; oiDelEl.className = 'perp-s'; }
  }

  renderLsBar(st.topLongRatio, st.topShortRatio, st.topLsRatio, 'perpTopLs', 'perpTopLsB', 'perpTopLsR');
  renderLsBar(st.longRatio, st.shortRatio, st.lsRatio, 'perpLs', 'perpLsB', 'perpLsR');
  renderLsBar(st.perpTakerBuyRatio, st.perpTakerSellRatio, st.perpTakerRatio, 'perpTkLs', 'perpTkLsB', 'perpTkLsR');

  const lqEl = $('perpLiq'), lqSub = $('perpLiqSub'), lastEl = $('perpLastLiq');
  const wStat = (st.liqStats && st.liqStats[liqWin]) || { l: st.liqLong5m || 0, s: st.liqShort5m || 0 };
  if (st.hasLiqStream) {
    const tot = (wStat.l || 0) + (wStat.s || 0);
    lqEl.textContent = fmtUsd(tot);
    lqSub.textContent = tot > 0 ? T('perpLiqPair', fmtUsd(wStat.l || 0), fmtUsd(wStat.s || 0)) : T('perpLiqWait');
  } else {
    lqEl.textContent = '--';
    lqSub.textContent = st.available ? T('perpLiqNa') : '--';
  }
  if (st.lastLiq) {
    lastEl.textContent = T(st.lastLiq.side === 'long' ? 'perpLastL' : 'perpLastS', fmtUsd(st.lastLiq.usd));
    lastEl.className = 'perp-last show ' + st.lastLiq.side;
  } else {
    lastEl.textContent = ''; lastEl.className = 'perp-last';
  }

  const h = st.wsHealth || {};
  document.querySelectorAll('#liqSrc .ex-dot').forEach((el) => {
    const ex = el.dataset.ex;
    const on = !!h[ex];
    el.classList.toggle('on', on);
    el.classList.toggle('idle', !on && st.available);
  });
  renderLiqFeed();
}

let lastLiqFx = 0, lastLiqBanner = 0;
const futures = new FuturesFeed({
  onData(st) { perpState = st; if (!document.hidden) renderPerp(); },
  onLiq(ev) {
    if (document.hidden || !ev || !(ev.usd > 0)) return;
    const th = cfg().th, now = Date.now();
    const minFx = Math.max(500, th.shell * 0.04);
    const minSfx = Math.max(2000, th.shell * 0.2);
    const minBanner = Math.max(10000, th.shell);
    if (ev.usd >= minFx && (now - lastLiqFx >= 180 || ev.usd >= th.heavy)) {
      lastLiqFx = now;
      battle.liquidate(ev.side, ev.usd);
    }
    if (ev.usd >= th.shell) {
      klineChart.addMarker({ ts: ev.ts || now, price: ev.price || S.last, type: 'liq', side: ev.side === 'long' ? 'blue' : 'red', usd: ev.usd });
    }
    if (ev.usd >= minSfx) {
      audio.impact(ev.usd * 50000 / th.shell, ev.side === 'long' ? 'red' : 'blue');
    }
    if (ev.usd >= minBanner && now - lastLiqBanner >= 2500) {
      lastLiqBanner = now;
      showBanner(T('liqBanner', ev.side === 'long', fmtUsd(ev.usd)), 'liq', 2400, false);
    }
  },
});
setInterval(() => {
  if (!document.hidden && perpState.available && perpState.nextFunding > Date.now()) {
    $('perpNext').textContent = T('perpNext', fmtCountdown(perpState.nextFunding));
  }
}, 1000);

// ---------- 一键战报分享 ----------
initShare(() => {
  const srcBuckets = flowScope === 'agg' ? S.aggBuckets : S.buckets;
  const w60 = windowSum(60, srcBuckets), w300 = windowSum(300, srcBuckets);
  const bp = Math.round((0.5 + 0.5 * smoothS) * 100);
  const s1h = perpState.liqStats && perpState.liqStats['1h'];
  return {
    coin: M.base,
    pair: $('pair').textContent,
    priceStr: S.last ? '$' + fmtP(S.last) : '--',
    chgPct: S.open24h && S.last ? (S.last / S.open24h - 1) * 100 : null,
    hiStr: S.hi ? fmtP(S.hi) : '--',
    loStr: S.lo ? fmtP(S.lo) : '--',
    bluePow: bp,
    stateText: $('battleState').textContent,
    surge: S.surge,
    battleCanvas: $('battle'),
    tk1m: w60,
    tk5mNet: w300.bu - w300.su,
    bk05: computeDepth(),
    perp: perpState,
    regime: perpState.regime || computeRegime(mtf.compute(S.last)['5m'], perpState.oiChg5m),
    oiChg1h: perpState.oiChg1h,
    cvdDiv: S.cvdDiv,
    liq1h: s1h ? (s1h.l + s1h.s) : 0,
    cmeGap: mtf.getCmeGap(S.last),
    cbPremUsd: cxState ? cxState.cbPremUsd : null,
    cbPremPct: cxState ? cxState.cbPremPct : null,
    fng: fngState,
  };
});

// ---------- 语言切换 ----------
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = (e) => { e.stopPropagation(); setLang(b.dataset.lang); });
onLang(() => {
  renderChips(); renderTrades(); statusText(); updateMusicInd();
  renderFlowControls(); renderPowModeUi(); renderLiqWinTabs(); renderTheaterUi();
  refresh(); renderPerp(); renderCrossEx(); renderFng(); renderSession(); renderCmeGap();
  renderSourceUi(); renderDefUi(); renderKillFeed(); klineChart.draw();
  if (intro.isConnected) introMsg.textContent = T(...introKey);
  document.title = T('title', S.last ? `$${fmtP(S.last)} BTC` : 'BTC');
  requestAnimationFrame(fitHeader);
});
document.title = T('title');

// ---------- 启动 ----------
renderChips();
renderTrades();
renderSourceUi();
renderDefUi();
renderFlowControls();
renderPowModeUi();
renderLiqWinTabs();
renderTheaterUi();
$('pair').textContent = `${M.base}/USDT`;
syncExActive();
fm.start(sourceMode, M);
multiSpot.start(sourceMode === 'auto' ? 'binance' : sourceMode);
futures.start();
klineChart.start();
crossEx.start();
mtf.start();

// ---------- PWA Service Worker 静默注册 ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
