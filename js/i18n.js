// 中英文切换：?lang=zh|en > localStorage > 浏览器语言（zh* → 中文，其它 → 英文）
import { lsGet, lsSet } from './storage.js?v=8fcf62d3';
const KEY = 'cw_lang';
export const escH = (x) => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function detect() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && /^(zh|en)/i.test(q)) return q.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const s = lsGet(KEY); if (s === 'zh' || s === 'en') return s;
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  return /^zh/i.test(nav) ? 'zh' : 'en';
}
export let lang = detect();
const subs = [];
export function onLang(fn) { subs.push(fn); }
export function setLang(l) {
  if (l !== 'zh' && l !== 'en') return;
  lang = l; lsSet(KEY, l);
  const u = new URL(location.href); u.searchParams.set('lang', l); history.replaceState(null, '', u);
  applyI18n(); subs.forEach(f => f(l));
}

// 金额：中文 万/亿，英文 K/M/B
export function fmtUsd(v) {
  if (lang === 'en') {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 2) + 'M';
    if (v >= 1e4) return '$' + (+(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)) + 'K';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  if (v >= 1e8) return '$' + (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return '$' + (+(v / 1e4).toFixed(v >= 1e6 ? 0 : 1)) + '万';
  return '$' + Math.round(v).toLocaleString('en-US');
}
// 数量（不带 $）：中文 万/亿，英文 K/M/B
export function fmtNum(v) {
  if (lang === 'en') return v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(+v.toFixed(2));
  return v >= 1e12 ? (v / 1e12).toFixed(2) + '万亿' : v >= 1e8 ? (v / 1e8).toFixed(2) + '亿' : v >= 1e4 ? (v / 1e4).toFixed(1) + '万' : String(+v.toFixed(2));
}
// 门槛筹码（不带 $）
export function fmtShort(v) {
  if (lang === 'en') return v >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'K' : String(Math.round(v));
  return v >= 1e4 ? +(v / 1e4).toFixed(1) + '万' : Math.round(v).toLocaleString();
}

const D = {
  zh: {
    title: (p) => `${p ? p + ' · ' : ''}BTC War Room · 比特币多空指挥室`,
    metaDesc: 'BTC War Room · 比特币多空作战指挥室：BTC 实时多空战场动画、Binance / OKX / Coinbase 三所报价与美盘溢价、实时 K 线、永续大户散户比与双所爆仓流。',
    battleAria: '实时多空战场动画：蓝军代表买方（多），红军代表卖方（空）',
    introSub: '比 特 币 · 多 空 指 挥 室', introGo: '⚔️ 点击进入指挥室 🔊', introHint: 'BTC 实时行情驱动 · 战鼓随多空节奏变化',
    introGather: '集结部队中…', introConn: (l) => `连接指挥室情报 · ${l}…`, introScout: '侦察盘口与合约数据…', introReady: '部队就位',
    introStart: '⚔️ 战斗开始！', introClick: '战鼓已备好 · 点击开战',
    home: 'BTC War Room 首页', wmCn: '比特币多空指挥室',
    byTitle: '关注 Sparkle @Sparkle6868', followX: '关注 @Sparkle6868',
    auSub: 'BTC War Room · 比特币多空指挥室 维护者', ghSrc: 'GitHub 源码',
    exBarAria: '三所 BTC 实时报价与美盘溢价', exClickT: '点击切换主数据源（再次点击恢复自动）',
    cbPremShort: '美盘溢价', cbPremT: 'Coinbase BTC-USD 与 Binance BTCUSDT 的实时价差（美盘买压/抛压风向标）',
    connecting: '连接中…', source: '数据源', auto: '自动', music: '♪ 配乐',
    audioTitle: '战争配乐 / 音效', audioAria: '战争配乐与音效', apTitle: '⚔️ 战争配乐 <small>随实时战况变化</small>',
    apMusic: '🎵 音乐', apSfx: '💥 音效', apVol: '🔊 音量',
    apNote: '太鼓 + 铜管实时合成，全部由行情驱动：成交越快鼓点越快（BPM）；价格每跳一下弹一个音，涨则上行、跌则下行；1 分钟涨跌决定明暗调；每笔大单一声炮响；总攻、胜利、巨鲸各有专属音效。切到后台自动暂停。',
    langTitle: '切换语言 / Language',
    tps: (n) => `${n} 笔/秒`, hi: '高', lo: '低', vol24: '24h 量',
    flagL: '多', flagS: '空', blue: '蓝军', red: '红军', power: '战力',
    stTie: '⚖️ 两军对峙', stBlue: '🔵 蓝军推进', stRed: '🔴 红军压制', stSurgeB: '🔥 蓝军总攻', stSurgeR: '🔥 红军总攻',
    basisTitle: '战力 = 价格涨跌 50%（10秒 + 1分钟）+ 吃单 30%（10秒 + 1分钟）+ ±0.5% 挂单 20%',
    basisWait: '战况依据：等待数据…', basis: '战况依据：', b10: '10秒', b60: '1分钟', bOnly: (n) => `(仅${n}秒)`, bLast: '最新', bTk: '吃单买:卖', bBk: '挂单买:卖',
    hudL: '蓝军 · 买方', hudR: '卖方 · 红军',
    legend: (a, b, c) => `小兵 = 成交 · 骑兵/炮 ≥ $${a} · 攻城/重炮 ≥ $${b} · 🐋 泰坦空袭 ≥ $${c}`,
    defBtnT: '防线间距：以当日 UTC 00:00 开盘价为 0% 基准，每层对应真实价格防线（含盘口厚度护甲）',
    defLblAuto: (s) => `防线 ${s}%`,
    defLblFixed: (s) => `防线 ${s}%`,
    defOptAuto: (s) => `自动 (${s}%/层)`,
    defOptStep: (s) => `每 ${s}% 一层`,
    defBase: '日开',
    defBase24: '24h基准',
    defBreachTag: (p) => `⚔️ 攻破 ${p}`,
    defRecapTag: (p) => `🛡️ 夺回 ${p}`,
    defBreachBanner: (b, p, px) => `⚔️ ${b ? '蓝军' : '红军'}攻破 ${p} 防线！<small>${b ? '突破空军防线' : '击穿多军防线'} · ${px}</small>`,
    defRecapBanner: (b, p, px) => `🛡️ ${b ? '蓝军' : '红军'}夺回 ${p} 防线<small>防线重筑 · ${px}</small>`,
    taker: '吃单', takerSub: '主动成交 · 谁在冲锋', w10: '10 秒', w60: '1 分钟', w300: '5 分钟', delta: '5 分钟净主动买入',
    only: (n) => `仅${n}秒`, cover: (p) => `仅覆盖±${p}%`, buy: '买', sell: '卖', bid: '买盘', ask: '卖盘',
    book: '挂单', bookSub: '盘口深度 · 谁的城墙厚', bb: '买一', ba: '卖一', spr: '价差',
    trades: '大单战报', thTitle: '大单门槛（单笔主动成交金额）', hTime: '时间', hSide: '方向', hPx: '价格', hQty: '数量', hUsd: '金额',
    sideBuy: '多 买', sideSell: '空 卖',
    waitBig: '等待大单出现…', loadingBig: '正在加载最近的大单…',
    noBig: (m, th) => `近 ${m} 分钟没有 ≥ $${th} 的大单<br><small>行情清淡，可点上方调低门槛</small>`,
    bigSince: (m) => `已载入近 ${m} 分钟 · 同一毫秒同方向的成交合并为一笔主动单`,
    disclaimer: '行情来自 Binance / OKX / Coinbase / Bybit，情绪指数来自 alternative.me 公共接口（无需 API Key），仅供娱乐参考，不构成投资建议 · 蓝 = 多 / 买方，红 = 空 / 卖方',
    credit: '本项目基于原作者大橙子（<a href="https://x.com/0xVeryBigOrange" target="_blank" rel="noopener noreferrer">@0xVeryBigOrange</a>）的开源项目「Crypto War · 多空战场」二次修改',
    flowCap: '近 2 分钟 主动买(上) / 卖(下) · 黄线=累计净额 · 白线=价格',
    flowCap15: '近 15 分钟 主动买(上) / 卖(下) · 黄线=累计净额 · 白线=价格',
    depthWait: '等待盘口数据…', wallB: '买盘城墙 ', wallA: '卖盘城墙 ',
    depthCover: (p) => `该数据源深度覆盖约 ±${p}%`,
    sConnecting: (l) => `正在连接 ${l}…`, sOpen: (l) => `已连接 ${l}，等待数据…`, sLive: (l) => `实时 · ${l}`, sError: (n, r) => `${n} ${r}，重试/切换中…`,
    eClosed: '连接断开', eTimeout: '超时无数据', eStall: '数据中断', sOffline: '网络已断开，恢复后自动重连…',
    whale: (b, u) => `🐋 ${b ? '蓝军' : '红军'}巨鲸空袭<small>${b ? '主动买入' : '主动卖出'} ${u}</small>`,
    surgeB: '⚔️ 蓝军发起总攻！<small>多头主动出击</small>', surgeR: '⚔️ 红军发起总攻！<small>空头主动出击</small>',
    winB: (s) => `🏆 蓝军大获全胜！<small>多头压制 ${s} 秒 · 红军溃退</small>`, winR: (s) => `🏆 红军大获全胜！<small>空头压制 ${s} 秒 · 蓝军溃退</small>`,
    streak: (b, s, w) => `${b ? '蓝军' : '红军'}已压制 ${s} 秒${w ? ' 🏆' : ''}`,
    mSurgeB: '蓝军总攻', mSurgeR: '红军总攻', mUp: '蓝军上扬', mDown: '红军下压', mTie: '两军对峙',
    mLocked: '🔊 点击开启战歌', mOff: '配乐已关', mSfx: '💥 音效', crit: '暴击 ', combo: (n, u) => `🔥 ${n}x 连击 · ${u}`,
    chartTitle: 'BTC 实时走势', klineWait: '正在加载 K 线数据…',
    radarTitle: '市场情绪与时段', fngTitle: '恐慌与贪婪指数',
    fngExFear: '极度恐慌', fngFear: '恐慌', fngNeu: '中性', fngGreed: '贪婪', fngExGreed: '极度贪婪',
    fngDelta: (d) => `较昨日 ${d >= 0 ? '+' : ''}${d}`,
    sessAsia: '亚盘', sessEu: '欧盘', sessUs: '美盘', sessOverlap: '欧美重叠', sessQuiet: '盘间时段',
    cmeOpen: 'CME 交易中', cmeClosed: 'CME 休市',
    cbPrem: 'Coinbase 溢价', basisLbl: '永续基差', exSpread: '三所最大价差',
    perpTitle: '永续合约全景', perpNone: '暂不可用', perpFund: '资金费率', perpNext: (t) => `结算 ${t}`,
    perpBasis: '期现基差', perpMark: (m) => `标记 $${m}`,
    perpOi: '未平仓量 (OI)', perpLs: '多空人数比', perpLsDual: '大户持仓 vs 散户人数',
    perpWhale: '大户', perpRetail: '散户',
    perpLiq: '5 分钟爆仓', perpLiqPair: (l, s) => `多 ${l} · 空 ${s}`, perpLiqLive: '实时爆仓流',
    perpLiqWait: '等待强平事件…', perpLiqNa: '当前源暂无爆仓流',
    perpLastL: (u) => `💥 多单爆仓 ${u}`, perpLastS: (u) => `💥 空单爆仓 ${u}`,
    liqTagL: '永续多爆', liqTagS: '永续空爆',
    liqBanner: (isLong, u) => `⚡ 永续${isLong ? '多头' : '空头'}大额爆仓<small>强平 ${u} · 永续合约联动</small>`,
    liqTitle: '实时爆仓流', liqPx: '强平价', liqEx: '所', liqSideL: '多爆', liqSideS: '空爆', liqEmpty: '等待永续强平事件…',
    shareBtn: '战报', shareBtnT: '生成并分享战报截图', shareTitle: '生成实时战场战报',
    shareMeta: '正在生成高清战报…', shareReady: '1200×675 高清战报已就绪',
    shareDl: '下载 PNG', shareCopy: '复制图片', shareCopied: '已复制到剪贴板',
    shareCopyFail: '当前浏览器不支持复制图片，请直接下载', shareClose: '关闭',
    repSub: 'BTC 实时多空作战战报', repTk1m: '1 分钟吃单', repBk05: '±0.5% 盘口',
    repPerp: '资金费率 / OI', repLiq: '5 分钟爆仓', repDelta5m: '5 分钟净主动买', repHiLo: '24h 高 / 低',
    repCbPrem: 'CB 美盘溢价', repFng: '恐慌贪婪',
    pow5d: '五维综合', powFast: '短线冲杀',
    powModeT: '切换战力模型：五维综合（价格/吃单/盘口/合约/美盘溢价） vs 短线冲杀（1分钟高频）',
    bPrice: '价格', bCvd: '吃单', bBook: '盘口', bPerp: '合约', bPrem: '美盘',
    demoBtn: '演练', demoBtnT: '触发模拟战况演练（仅视听效果，不影响实时行情）',
    demoWhaleB: '🐋 蓝军巨鲸空袭', demoWhaleR: '🐋 红军巨鲸空袭', demoLiq: '⚡ 连环爆仓天雷', demoSiege: '⚔️ 骑兵攻城总攻',
    theaterBtn: '大屏', theaterExit: '退出', theaterBtnT: '沉浸全屏作战大屏模式 (ESC 退出)',
    hudHide: '隐藏HUD', hudShow: '显示HUD',
    flowAgg: '三所聚合', flowSingle: '单所现货',
    cvdDivBull: '🟢 多头吸筹背离', cvdDivBear: '🔴 空头派发背离',
    wallTopTitle: '巨鲸挂单墙 Top 3（±3.5%）', wallEmpty: '盘口暂无 ≥ $30万 集中墙',
    wallSpoofTag: (side) => `${side === 'blue' ? '多军' : '空军'}虚晃撤单`,
    wallIcebergTag: (side) => `${side === 'blue' ? '多军' : '空军'}冰山承接`,
    ovLines: '防线',
    cmeGapTitle: 'CME 周末缺口', cmeGapNone: '近期无明显缺口', cmeGapFilled: '已回补 100%',
    cmeGapOpen: (pct, fill) => `未回补 · 距 ${pct} (填${fill}%)`,
    perpTaker: '主动', perpApr: (v) => `年化 ${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
    perpOiDelta: (d5, d1h) => `5m ${d5} · 1h ${d1h}`,
    perpLiqW: (w) => `${w} 爆仓`,
    reg_long_build: '🟢 多头增仓强攻', reg_short_squeeze: '⚡ 空头逼空平仓', reg_short_build: '🔴 空头增仓砸盘', reg_long_unwind: '🟠 多头踩踏平仓',
    kfWhale: (side, u) => `🐋 ${side}巨鲸 ${u}`,
    kfLiq: (side, u) => `⚡ ${side} ${u}`,
    kfBreach: (p) => `⚔️ 攻破 ${p}`,
    kfRecap: (p) => `🛡️ 夺回 ${p}`,
    kfSpoof: (side, u) => `💨 ${side === 'blue' ? '多军' : '空军'}虚晃撤单 ${u}`,
    kfIceberg: (side, u) => `🛡️ ${side === 'blue' ? '多军' : '空军'}冰山承接 ${u}`,
    tipShield: (side) => `${side === 'blue' ? '蓝军' : '红军'}要塞符文护盾`,
    tipShieldSub: (pct, usd, alert) => `深度强度 ${pct}% · ±0.5% 墙 ${usd}${alert > 0.2 ? ' · ⚠️ 主堡被围' : ''}`,
    tipWall: (side, px) => `🧱 ${side === 'blue' ? '买盘' : '卖盘'}巨鲸墙 ${px}`,
    tipWallSub: (usd, dist) => `集中挂单 ${usd} · 距现价 ${dist}`,
    tipLine: (pct, px) => `防线 ${pct} · ${px}`,
    tipLineSub: (st, usd, cnt) => `${st} · 附近挂单 ${usd} · 易手 ${cnt} 次`,
    lineIntact: '固守中', lineCaptured: '已失守',
    repCme: 'CME 缺口', repOi1h: (v) => `1h ΔOI ${v}`, repLiq1h: (v) => `1h 爆仓 ${v}`,
  },
  en: {
    title: (p) => `${p ? p + ' · ' : ''}BTC War Room | Live Bitcoin Battle Command`,
    metaDesc: 'BTC War Room: live Bitcoin bulls vs bears animated battle, Binance / OKX / Coinbase quotes & Coinbase Premium, live candlesticks, whale vs retail positioning, and dual-exchange liquidations.',
    battleAria: 'Live battle animation: the blue army is buyers (bulls), the red army is sellers (bears)',
    introSub: 'BTC · WAR · ROOM', introGo: '⚔️ Enter the War Room 🔊', introHint: 'Driven by live BTC market data · drums follow bulls and bears',
    introGather: 'Mustering the troops…', introConn: (l) => `Connecting to ${l}…`, introScout: 'Scouting order flow & futures…', introReady: 'Troops in position',
    introStart: '⚔️ Battle begins!', introClick: 'War drums ready · click to fight',
    home: 'BTC War Room home', wmCn: 'Bitcoin War Room',
    byTitle: 'Follow Sparkle @Sparkle6868', followX: 'Follow @Sparkle6868',
    auSub: 'Maintainer of BTC War Room', ghSrc: 'GitHub Source',
    exBarAria: 'Live BTC quotes across 3 exchanges & Coinbase premium', exClickT: 'Click to switch primary feed (click again for Auto)',
    cbPremShort: 'CB Prem', cbPremT: 'Coinbase BTC-USD vs Binance BTCUSDT spread (US spot demand gauge)',
    connecting: 'Connecting…', source: 'Data source', auto: 'Auto', music: '♪ Music',
    audioTitle: 'War music / SFX', audioAria: 'War music and sound effects', apTitle: '⚔️ War music <small>follows the live battle</small>',
    apMusic: '🎵 Music', apSfx: '💥 SFX', apVol: '🔊 Volume',
    apNote: 'Taiko drums + brass synthesized live, all driven by the market: faster trading → faster drums (BPM); every price tick plays a note, up when price rises, down when it falls; the 1-minute change sets major/minor mood; every big trade fires a cannon; surges, victories and whales have their own sounds. Pauses automatically in the background.',
    langTitle: 'Language / 切换语言',
    tps: (n) => `${n} trades/s`, hi: 'H', lo: 'L', vol24: '24h Vol',
    flagL: 'L', flagS: 'S', blue: 'Blue', red: 'Red', power: ' power',
    stTie: '⚖️ Standoff', stBlue: '🔵 Blue advances', stRed: '🔴 Red presses', stSurgeB: '🔥 Blue charge', stSurgeR: '🔥 Red charge',
    basisTitle: 'Power = price change 50% (10s + 1m) + taker flow 30% (10s + 1m) + order book within ±0.5% 20%',
    basisWait: 'Why: waiting for data…', basis: 'Why: ', b10: '10s', b60: '1m', bOnly: (n) => `(only ${n}s)`, bLast: 'Last', bTk: 'Taker buy:sell', bBk: 'Book bid:ask',
    hudL: 'Blue Army · Buyers', hudR: 'Sellers · Red Army',
    legend: (a, b, c) => `Soldiers = trades · Cavalry/Shell ≥ $${a} · Siege/Heavy ≥ $${b} · 🐋 Titan Strike ≥ $${c}`,
    defBtnT: 'Defense line spacing anchored to UTC 00:00 daily open (reinforced by real order-book depth)',
    defLblAuto: (s) => `Lines ${s}%`,
    defLblFixed: (s) => `Lines ${s}%`,
    defOptAuto: (s) => `Auto (${s}%/layer)`,
    defOptStep: (s) => `${s}% / layer`,
    defBase: 'Open',
    defBase24: '24h Ref',
    defBreachTag: (p) => `⚔️ ${p} BREACHED`,
    defRecapTag: (p) => `🛡️ ${p} HELD`,
    defBreachBanner: (b, p, px) => `⚔️ ${b ? 'Blue' : 'Red'} breaches ${p} line!<small>${b ? 'Bulls break bear defense' : 'Bears break bull defense'} · ${px}</small>`,
    defRecapBanner: (b, p, px) => `🛡️ ${b ? 'Blue' : 'Red'} reclaims ${p} line<small>Defense rebuilt · ${px}</small>`,
    taker: 'Takers', takerSub: 'Market orders · who is charging', w10: '10s', w60: '1 min', w300: '5 min', delta: '5-min net taker buy',
    only: (n) => `only ${n}s`, cover: (p) => `covers only ±${p}%`, buy: 'Buy', sell: 'Sell', bid: 'Bids', ask: 'Asks',
    book: 'Order Book', bookSub: 'Depth · whose wall is thicker', bb: 'Bid', ba: 'Ask', spr: 'Spread',
    trades: 'Big Trades', thTitle: 'Big-trade threshold (taker order value)', hTime: 'Time', hSide: 'Side', hPx: 'Price', hQty: 'Size', hUsd: 'Value',
    sideBuy: 'BUY', sideSell: 'SELL',
    waitBig: 'Waiting for big trades…', loadingBig: 'Loading recent big trades…',
    noBig: (m, th) => `No trades ≥ $${th} in the last ${m} min<br><small>Quiet market — lower the threshold above</small>`,
    bigSince: (m) => `Last ${m} min loaded · fills in the same millisecond and side are merged into one taker order`,
    disclaimer: 'Market data from Binance / OKX / Coinbase / Bybit and sentiment from alternative.me public feeds (no API key). For entertainment only, not investment advice · Blue = bulls / buyers, Red = bears / sellers',
    credit: 'Modified from the open-source project "Crypto War" by <a href="https://x.com/0xVeryBigOrange" target="_blank" rel="noopener noreferrer">@0xVeryBigOrange</a>',
    flowCap: 'Last 2m · Taker Buys/Sells · Yellow=CVD · White=Price',
    flowCap15: 'Last 15m · Taker Buys/Sells · Yellow=CVD · White=Price',
    depthWait: 'Waiting for order book…', wallB: 'Bid wall ', wallA: 'Ask wall ',
    depthCover: (p) => `This source covers about ±${p}% depth`,
    sConnecting: (l) => `Connecting to ${l}…`, sOpen: (l) => `Connected to ${l}, waiting for data…`, sLive: (l) => `Live · ${l}`, sError: (n, r) => `${n} ${r}, retrying / switching…`,
    eClosed: 'connection lost', eTimeout: 'no data (timeout)', eStall: 'data stalled', sOffline: 'You are offline, will reconnect automatically…',
    whale: (b, u) => `🐋 ${b ? 'Blue' : 'Red'} whale air strike<small>${b ? 'Taker buy' : 'Taker sell'} ${u}</small>`,
    surgeB: '⚔️ Blue launches an all-out attack!<small>Bulls on the offensive</small>', surgeR: '⚔️ Red launches an all-out attack!<small>Bears on the offensive</small>',
    winB: (s) => `🏆 Blue Army wins!<small>Bulls held the field for ${s}s · Red retreats</small>`, winR: (s) => `🏆 Red Army wins!<small>Bears held the field for ${s}s · Blue retreats</small>`,
    streak: (b, s, w) => `${b ? 'Blue' : 'Red'} dominating for ${s}s${w ? ' 🏆' : ''}`,
    mSurgeB: 'Blue charge', mSurgeR: 'Red charge', mUp: 'Blue rising', mDown: 'Red pressing', mTie: 'Standoff',
    mLocked: '🔊 Tap to start war music', mOff: 'Music off', mSfx: '💥 SFX', crit: 'CRIT ', combo: (n, u) => `🔥 ${n}x COMBO · ${u}`,
    chartTitle: 'BTC Price Action', klineWait: 'Loading candle data…',
    radarTitle: 'Sentiment & Sessions', fngTitle: 'Fear & Greed Index',
    fngExFear: 'Extreme Fear', fngFear: 'Fear', fngNeu: 'Neutral', fngGreed: 'Greed', fngExGreed: 'Extreme Greed',
    fngDelta: (d) => `vs yday ${d >= 0 ? '+' : ''}${d}`,
    sessAsia: 'Asia', sessEu: 'London', sessUs: 'NY', sessOverlap: 'EU/NY Overlap', sessQuiet: 'Off-Hours',
    cmeOpen: 'CME Open', cmeClosed: 'CME Closed',
    cbPrem: 'CB Premium', basisLbl: 'Perp Basis', exSpread: '3-Ex Spread',
    perpTitle: 'Perp Futures', perpNone: 'Unavailable', perpFund: 'Funding Rate', perpNext: (t) => `Next ${t}`,
    perpBasis: 'Perp Basis', perpMark: (m) => `Mark $${m}`,
    perpOi: 'Open Interest', perpLs: 'Long/Short Ratio', perpLsDual: 'Whale vs Retail L/S',
    perpWhale: 'Whale', perpRetail: 'Retail',
    perpLiq: '5m Liquidations', perpLiqPair: (l, s) => `L ${l} · S ${s}`, perpLiqLive: 'Live liq feed',
    perpLiqWait: 'Watching liquidations…', perpLiqNa: 'No liq feed on source',
    perpLastL: (u) => `💥 Long liq ${u}`, perpLastS: (u) => `💥 Short liq ${u}`,
    liqTagL: 'LONG LIQ', liqTagS: 'SHORT LIQ',
    liqBanner: (isLong, u) => `⚡ Perp ${isLong ? 'Long' : 'Short'} Liquidation<small>Forced ${u} · Futures FX</small>`,
    liqTitle: 'Live Liquidations', liqPx: 'Liq Price', liqEx: 'Ex', liqSideL: 'LONG', liqSideS: 'SHORT', liqEmpty: 'Watching perp liquidations…',
    shareBtn: 'Report', shareBtnT: 'Generate & share battle report', shareTitle: 'Share Battle Report',
    shareMeta: 'Rendering snapshot…', shareReady: '1200×675 PNG ready',
    shareDl: 'Download PNG', shareCopy: 'Copy Image', shareCopied: 'Copied to clipboard',
    shareCopyFail: 'Image copy unsupported — download instead', shareClose: 'Close',
    repSub: 'LIVE BTC WAR ROOM REPORT', repTk1m: '1m Taker Flow', repBk05: '±0.5% Order Book',
    repPerp: 'Funding / OI', repLiq: '5m Liquidations', repDelta5m: '5m Net Taker Buy', repHiLo: '24h High / Low',
    repCbPrem: 'CB Premium', repFng: 'Fear & Greed',
    pow5d: '5D Tactical', powFast: '1m Scalper',
    powModeT: 'Switch power model: 5D Tactical (Price/CVD/Book/Perp/CB Prem) vs 1m Scalper',
    bPrice: 'Price', bCvd: 'CVD', bBook: 'Book', bPerp: 'Perp', bPrem: 'CB Prem',
    demoBtn: 'Demo', demoBtnT: 'Trigger sandbox combat simulation (visual/audio only)',
    demoWhaleB: '🐋 Blue Whale Strike', demoWhaleR: '🐋 Red Whale Strike', demoLiq: '⚡ Liquidation Cascade', demoSiege: '⚔️ Cavalry & Siege Surge',
    theaterBtn: 'Theater', theaterExit: 'Exit', theaterBtnT: 'Toggle fullscreen Theater Mode (ESC to exit)',
    hudHide: 'Hide HUD', hudShow: 'Show HUD',
    flowAgg: '3-Ex Agg', flowSingle: 'Single Ex',
    cvdDivBull: '🟢 Bull Absorption', cvdDivBear: '🔴 Bear Distribution',
    wallTopTitle: 'Top 3 Order-Book Walls (±3.5%)', wallEmpty: 'No resting walls ≥ $300K',
    wallSpoofTag: (side) => `${side === 'blue' ? 'BULL' : 'BEAR'} SPOOF PULL`,
    wallIcebergTag: (side) => `${side === 'blue' ? 'BULL' : 'BEAR'} ICEBERG HOLD`,
    ovLines: 'Lines',
    cmeGapTitle: 'CME Weekend Gap', cmeGapNone: 'No recent gap', cmeGapFilled: 'Filled 100%',
    cmeGapOpen: (pct, fill) => `Open · ${pct} away (${fill}% filled)`,
    perpTaker: 'Taker', perpApr: (v) => `APR ${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
    perpOiDelta: (d5, d1h) => `5m ${d5} · 1h ${d1h}`,
    perpLiqW: (w) => `${w} Liq`,
    reg_long_build: '🟢 Long Buildup', reg_short_squeeze: '⚡ Short Squeeze', reg_short_build: '🔴 Short Buildup', reg_long_unwind: '🟠 Long Unwind',
    kfWhale: (side, u) => `🐋 ${side} Whale ${u}`,
    kfLiq: (side, u) => `⚡ ${side} ${u}`,
    kfBreach: (p) => `⚔️ Breached ${p}`,
    kfRecap: (p) => `🛡️ Reclaimed ${p}`,
    kfSpoof: (side, u) => `💨 ${side === 'blue' ? 'Bull' : 'Bear'} Spoof ${u}`,
    kfIceberg: (side, u) => `🛡️ ${side === 'blue' ? 'Bull' : 'Bear'} Iceberg ${u}`,
    tipShield: (side) => `${side === 'blue' ? 'Blue' : 'Red'} Bastion Shield`,
    tipShieldSub: (pct, usd, alert) => `Strength ${pct}% · ±0.5% Wall ${usd}${alert > 0.2 ? ' · ⚠️ Besieged' : ''}`,
    tipWall: (side, px) => `🧱 ${side === 'blue' ? 'Bid' : 'Ask'} Whale Wall ${px}`,
    tipWallSub: (usd, dist) => `Resting ${usd} · ${dist} from spot`,
    tipLine: (pct, px) => `Line ${pct} · ${px}`,
    tipLineSub: (st, usd, cnt) => `${st} · Near Wall ${usd} · Flips ${cnt}`,
    lineIntact: 'Intact', lineCaptured: 'Breached',
    repCme: 'CME Gap', repOi1h: (v) => `1h ΔOI ${v}`, repLiq1h: (v) => `1h Liq ${v}`,
  },
};
export function t(key, ...a) {
  const v = D[lang][key] ?? D.zh[key];
  return typeof v === 'function' ? v(...a) : v;
}
// HTML 标记：data-i18n=文本 / data-i18n-html / data-i18n-title / data-i18n-aria
export function applyI18n(root = document) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  const md = document.querySelector('meta[name="description"]'); if (md) md.content = t('metaDesc');
  document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
}
