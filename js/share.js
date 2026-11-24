// One-click Battle Report PNG generator (1200x675 Canvas 2D) & share modal controller
import { t as T, fmtUsd } from './i18n.js?v=6dd8875c';

const SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function drawRatioCard(ctx, x, y, w, h, title, valText, subText, blueFrac) {
  ctx.save();
  ctx.fillStyle = 'rgba(13, 18, 36, 0.92)';
  ctx.strokeStyle = 'rgba(150, 170, 230, 0.22)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#8c96b8';
  ctx.font = `700 15px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 16, y + 28);

  ctx.fillStyle = '#e6ebff';
  ctx.font = `800 22px ${MONO}`;
  ctx.fillText(valText, x + 16, y + 60);

  if (blueFrac != null) {
    const bx = x + 16, by = y + 73, bw = w - 32, bh = 8;
    const f = Math.max(0.05, Math.min(0.95, blueFrac));
    ctx.fillStyle = '#0b1020';
    roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
    ctx.fillStyle = '#3b82f6';
    roundRect(ctx, bx, by, bw * f - 1, bh, 4); ctx.fill();
    ctx.fillStyle = '#ef4444';
    roundRect(ctx, bx + bw * f + 1, by, bw * (1 - f) - 1, bh, 4); ctx.fill();
  }

  ctx.fillStyle = '#9aa6c8';
  ctx.font = `600 13px ${MONO}`;
  ctx.fillText(subText, x + 16, y + h - 15);
  ctx.restore();
}

export async function renderReportBlob(data) {
  const W = 1200, H = 675;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Background + corner battle glows
  ctx.fillStyle = '#060914';
  ctx.fillRect(0, 0, W, H);
  const bgL = ctx.createRadialGradient(0, 0, 10, 0, 0, 560);
  bgL.addColorStop(0, 'rgba(37, 99, 235, 0.28)'); bgL.addColorStop(1, 'rgba(37, 99, 235, 0)');
  ctx.fillStyle = bgL; ctx.fillRect(0, 0, W, H);
  const bgR = ctx.createRadialGradient(W, 0, 10, W, 0, 560);
  bgR.addColorStop(0, 'rgba(220, 38, 38, 0.28)'); bgR.addColorStop(1, 'rgba(220, 38, 38, 0)');
  ctx.fillStyle = bgR; ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(120, 140, 200, 0.08)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < W; gx += 48) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (let gy = 40; gy < H; gy += 48) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

  // Header left: brand & pair
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e6ebff';
  ctx.font = `900 28px ${SANS}`;
  ctx.fillText('⚔️ BTC WAR ROOM', 36, 48);

  ctx.fillStyle = '#fde68a';
  ctx.font = `700 15px ${SANS}`;
  ctx.fillText(`${T('repSub')} · ${data.pair}`, 38, 74);

  // Header center: Coinbase Premium & Fear/Greed pills
  const pills = [];
  if (data.cbPremUsd != null && isFinite(data.cbPremUsd)) {
    const sign = data.cbPremUsd >= 0 ? '+' : '-';
    pills.push({
      txt: `${T('repCbPrem')} ${sign}$${Math.abs(data.cbPremUsd).toFixed(0)}`,
      col: data.cbPremUsd >= 0 ? '#93c5fd' : '#fca5a5',
      bg: data.cbPremUsd >= 0 ? 'rgba(59,130,246,0.18)' : 'rgba(239,68,68,0.18)',
      bd: data.cbPremUsd >= 0 ? 'rgba(96,165,250,0.4)' : 'rgba(248,113,113,0.4)',
    });
  }
  if (data.fng && isFinite(data.fng.value)) {
    pills.push({
      txt: `${T('repFng')} ${data.fng.value} · ${T(data.fng.labelKey)}`,
      col: '#fde68a',
      bg: 'rgba(251,191,36,0.14)',
      bd: 'rgba(251,191,36,0.35)',
    });
  }
  if (pills.length) {
    ctx.font = `700 13px ${SANS}`;
    let px = 460;
    for (const p of pills) {
      const pw = Math.ceil(ctx.measureText(p.txt).width) + 22;
      ctx.fillStyle = p.bg;
      ctx.strokeStyle = p.bd;
      ctx.lineWidth = 1;
      roundRect(ctx, px, 26, pw, 28, 999); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.col;
      ctx.textAlign = 'left';
      ctx.fillText(p.txt, px + 11, 45);
      px += pw + 10;
    }
  }

  // Header right: price, change, timestamp
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 38px ${MONO}`;
  ctx.fillText(data.priceStr, W - 36, 48);

  const chgStr = data.chgPct == null ? '--' : `${data.chgPct >= 0 ? '+' : ''}${data.chgPct.toFixed(2)}%`;
  ctx.fillStyle = data.chgPct == null ? '#8c96b8' : data.chgPct >= 0 ? '#60a5fa' : '#f87171';
  ctx.font = `700 16px ${MONO}`;
  const nowStr = new Date().toLocaleString([], { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  ctx.fillText(`24h ${chgStr}  ·  ${nowStr}`, W - 36, 74);

  // Centerpiece: live battlefield viewport
  const vx = 36, vy = 94, vw = W - 72, vh = 326;
  ctx.save();
  roundRect(ctx, vx, vy, vw, vh, 16);
  ctx.clip();
  ctx.fillStyle = '#070a14';
  ctx.fillRect(vx, vy, vw, vh);
  if (data.battleCanvas && data.battleCanvas.width > 0 && data.battleCanvas.height > 0) {
    const srcW = data.battleCanvas.width, srcH = data.battleCanvas.height;
    const scale = Math.max(vw / srcW, vh / srcH);
    const dw = srcW * scale, dh = srcH * scale;
    ctx.drawImage(data.battleCanvas, vx + (vw - dw) / 2, vy + (vh - dh) / 2, dw, dh);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(150, 170, 230, 0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, vx, vy, vw, vh, 16);
  ctx.stroke();

  // HUD pills inside viewport
  ctx.save();
  ctx.fillStyle = 'rgba(5, 8, 18, 0.7)';
  roundRect(ctx, vx + 14, vy + 12, 165, 32, 9); ctx.fill();
  roundRect(ctx, vx + vw - 179, vy + 12, 165, 32, 9); ctx.fill();
  ctx.font = `800 14px ${SANS}`;
  ctx.textAlign = 'left'; ctx.fillStyle = '#93c5fd';
  ctx.fillText(`🔵 ${T('hudL')}`, vx + 26, vy + 33);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fca5a5';
  ctx.fillText(`${T('hudR')} 🔴`, vx + vw - 26, vy + 33);
  ctx.restore();

  // Power bar strip
  const py = 434, pw = W - 72, bp = Math.max(1, Math.min(99, data.bluePow));
  ctx.textAlign = 'left'; ctx.fillStyle = '#60a5fa'; ctx.font = `800 18px ${MONO}`;
  ctx.fillText(`${T('blue')} ${bp}%`, 36, py + 16);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fde68a'; ctx.font = `800 18px ${SANS}`;
  ctx.fillText(data.stateText, W / 2, py + 16);
  ctx.textAlign = 'right'; ctx.fillStyle = '#f87171'; ctx.font = `800 18px ${MONO}`;
  ctx.fillText(`${100 - bp}% ${T('red')}`, W - 36, py + 16);

  const barY = py + 26, barH = 14;
  ctx.fillStyle = '#0b1020';
  roundRect(ctx, 36, barY, pw, barH, 7); ctx.fill();
  const gB = ctx.createLinearGradient(36, 0, 36 + pw * bp / 100, 0);
  gB.addColorStop(0, '#1e3a8a'); gB.addColorStop(1, '#60a5fa');
  ctx.fillStyle = gB;
  roundRect(ctx, 36, barY, pw * bp / 100 - 1, barH, 7); ctx.fill();
  const gR = ctx.createLinearGradient(36 + pw * bp / 100, 0, 36 + pw, 0);
  gR.addColorStop(0, '#f87171'); gR.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = gR;
  roundRect(ctx, 36 + pw * bp / 100 + 1, barY, pw * (100 - bp) / 100 - 1, barH, 7); ctx.fill();

  // Bottom 4 metric cards
  const cy = 492, ch = 126, gap = 14, cw = (W - 72 - gap * 3) / 4;
  const tkTot = (data.tk1m.bu || 0) + (data.tk1m.su || 0);
  const tkFrac = tkTot > 0 ? data.tk1m.bu / tkTot : 0.5;
  const tkVal = tkTot > 0 ? `${Math.round(tkFrac * 100)}% : ${Math.round((1 - tkFrac) * 100)}%` : '--';
  drawRatioCard(ctx, 36, cy, cw, ch, T('repTk1m'), tkVal, `${fmtUsd(data.tk1m.bu || 0)} / ${fmtUsd(data.tk1m.su || 0)}`, tkTot > 0 ? tkFrac : null);

  const bkTot = data.bk05 ? data.bk05.b05 + data.bk05.a05 : 0;
  const bkFrac = bkTot > 0 ? data.bk05.b05 / bkTot : 0.5;
  const bkVal = bkTot > 0 ? `${Math.round(bkFrac * 100)}% : ${Math.round((1 - bkFrac) * 100)}%` : '--';
  drawRatioCard(ctx, 36 + cw + gap, cy, cw, ch, T('repBk05'), bkVal, data.bk05 ? `${fmtUsd(data.bk05.b05)} / ${fmtUsd(data.bk05.a05)}` : '--', bkTot > 0 ? bkFrac : null);

  const perp = data.perp;
  if (perp && perp.available) {
    const fStr = perp.funding != null ? `${perp.funding >= 0 ? '+' : ''}${(perp.funding * 100).toFixed(4)}%` : '--';
    const oiStr = perp.oiUsd > 0 ? `OI ${fmtUsd(perp.oiUsd)}` : '--';
    drawRatioCard(ctx, 36 + (cw + gap) * 2, cy, cw, ch, T('repPerp'), fStr, oiStr, perp.longRatio != null ? perp.longRatio : null);

    const lqTot = (perp.liqLong5m || 0) + (perp.liqShort5m || 0);
    const lqVal = perp.hasLiqStream ? fmtUsd(lqTot) : '--';
    const lqSub = perp.hasLiqStream ? T('perpLiqPair', fmtUsd(perp.liqLong5m || 0), fmtUsd(perp.liqShort5m || 0)) : T('perpLiqNa');
    drawRatioCard(ctx, 36 + (cw + gap) * 3, cy, cw, ch, T('repLiq'), lqVal, lqSub, lqTot > 0 ? perp.liqShort5m / lqTot : null);
  } else {
    const d5 = data.tk5mNet || 0;
    drawRatioCard(ctx, 36 + (cw + gap) * 2, cy, cw, ch, T('repDelta5m'), `${d5 >= 0 ? '+' : '-'}${fmtUsd(Math.abs(d5))}`, `${data.coin} Spot`, null);
    drawRatioCard(ctx, 36 + (cw + gap) * 3, cy, cw, ch, T('repHiLo'), data.hiStr, `L ${data.loStr}`, null);
  }

  // Footer
  ctx.textAlign = 'left'; ctx.fillStyle = '#64748b'; ctx.font = `600 13px ${SANS}`;
  ctx.fillText('BTC War Room · Binance / OKX / Coinbase Real-Time Command Center', 36, H - 22);
  ctx.textAlign = 'right';
  ctx.fillText(location.host + location.pathname, W - 36, H - 22);

  return new Promise((resolve, reject) => {
    cv.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png');
  });
}

export function initShare(getSnapshot) {
  const btn = document.getElementById('shareBtn');
  const modal = document.getElementById('shareModal');
  const img = document.getElementById('shareImg');
  const meta = document.getElementById('shareMeta');
  const dl = document.getElementById('shareDl');
  const copy = document.getElementById('shareCopy');
  const closeBtn = document.getElementById('shareClose');
  if (!btn || !modal) return;

  let curBlob = null, curUrl = '', curSnap = null, msgT = null;

  function revoke() {
    if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = ''; }
  }
  function close() {
    modal.hidden = true;
    revoke();
    curBlob = null;
  }
  function status(txt, bad = false) {
    meta.textContent = txt;
    meta.classList.toggle('bad', bad);
    clearTimeout(msgT);
    msgT = setTimeout(() => { meta.textContent = T('shareReady'); meta.classList.remove('bad'); }, 2600);
  }

  async function open() {
    modal.hidden = false;
    meta.textContent = T('shareMeta');
    meta.classList.remove('bad');
    curBlob = null;
    revoke();
    try {
      const snap = getSnapshot();
      curSnap = snap;
      const blob = await renderReportBlob(snap);
      if (modal.hidden) return;
      curBlob = blob;
      curUrl = URL.createObjectURL(blob);
      img.src = curUrl;
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      dl.href = curUrl;
      dl.download = `btc-war-room-${stamp}.png`;
      meta.textContent = T('shareReady');
    } catch (e) {
      meta.textContent = e.message || 'Render failed';
      meta.classList.add('bad');
    }
  }

  btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (!modal.hidden && e.key === 'Escape') close(); });

  copy.addEventListener('click', async () => {
    if (!curBlob) return;
    if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
      status(T('shareCopyFail'), true);
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': curBlob })]);
      status(T('shareCopied'), false);
    } catch {
      status(T('shareCopyFail'), true);
    }
  });
}
