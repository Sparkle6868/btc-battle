// 战场动画：Canvas 2D，蓝军（多）在左，红军（空）在右
// 一期暗黑奇幻升级：数据天象与符文护盾 / 天基裁决光柱与顿帧 / 前线对波漩涡与总攻齐射 / 大单连击计数
import { t as tr, fmtUsd } from './i18n.js?v=9b14533c';
import { makeUnitSprites, drawStandard, Fortress, UNIT, UNIT_SPEC } from './units.js?v=9b14533c';
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const COL = {
  blue: { main: '#3b82f6', light: '#93c5fd', dark: '#1e3a8a', armor: '#1d4ed8', glow: [80, 150, 255],
    steelHi: '#9db4e6', cape: '#1d3a8a', capeDk: '#0b1638', gold: '#e8c56e', visor: '#bfe0ff',
    stoneHi: '#2b3450', stoneLo: '#0f1322', rim: '#7fb0ff', roof: '#1c2c5c' },
  red: { main: '#ef4444', light: '#fca5a5', dark: '#7f1d1d', armor: '#b91c1c', glow: [255, 80, 70],
    steelHi: '#e6a4a4', cape: '#7a1717', capeDk: '#2e0808', gold: '#e8b45a', visor: '#ffd0c4',
    stoneHi: '#3a2a35', stoneLo: '#150e14', rim: '#ff8f84', roof: '#5a1c22' },
};

const colOf = (side) => COL[side] || COL.blue;

function makeGlow(r, g, b, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); const h = size / 2;
  const gr = x.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, `rgba(255,255,255,1)`);
  gr.addColorStop(0.18, `rgba(${r},${g},${b},0.9)`);
  gr.addColorStop(0.5, `rgba(${r},${g},${b},0.25)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, size, size); return c;
}
function makeCloud() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const cx = rand(40, 216), cy = rand(26, 40), r = rand(14, 30);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(120,110,170,0.35)'); g.addColorStop(1, 'rgba(120,110,170,0)');
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  return c;
}
function makeSmoke(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); const h = size / 2;
  const gr = x.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, 'rgba(70,70,85,0.55)'); gr.addColorStop(0.6, 'rgba(50,50,65,0.25)'); gr.addColorStop(1, 'rgba(40,40,50,0)');
  x.fillStyle = gr; x.fillRect(0, 0, size, size); return c;
}

const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const QUALITY = [
  { dpr: 2, parts: 1400, smoke: 220, pk: 1, fog: true },
  { dpr: 1.5, parts: 800, smoke: 130, pk: 0.65, fog: true },
  { dpr: 1, parts: 420, smoke: 70, pk: 0.4, fog: false },
];
function initialQuality() {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'high') return 0; if (q === 'medium') return 1; if (q === 'low') return 2;
  } catch {}
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  return (coarse && Math.min(screen.width, screen.height) < 820) || cores <= 4 || mem <= 4 ? 1 : 0;
}

export class Battle {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.front = 0.5; this.frontTarget = 0.5; this.surge = null; this.surgeT = 0;
    this.momentumS = 0; this.frontU = 0; this.frontTargetU = 0; this.camShift = 0;
    this.onBreach = null; this.onStepChange = null;
    this.onFeedUpdate = null; this.onHover = null; this.onDemoSfx = null;
    this.def = {
      anchor: 0, anchorType: 'daily', price: 0, pct: 0,
      stepMode: 'auto', step: 1, initialized: false,
      lines: this._makeDefenseLines(),
    };
    this.soldiers = []; this.bullets = []; this.shells = [];
    this.strikes = []; this.fissures = []; this.parts = []; this.smoke = [];
    this.rings = []; this.texts = []; this.scorch = []; this.streaks = []; this.embers = [];
    this.orderWalls = []; this.liqZones = []; this.killFeed = [];
    this._siegeAutoT = { blue: 0, red: 0 }; this._ballistaT = { blue: 0, red: 0 };
    this._hoverPos = null; this._lastHoverKey = '';
    this.shake = 0; this.flash = 0; this.flashCol = '255,255,255'; this.t = 0;
    this.pending = { blue: 0, red: 0 }; this.intensity = 0; this.queue = [];
    this.q = initialQuality(); this.Q = QUALITY[this.q]; this.fpsN = 0; this.fpsT = 0; this.slowWins = 0;
    this.th = { small: 4000, shell: 50000, heavy: 250000, whale: 1e6 };
    this.activity = { blue: 0, red: 0 }; this.popAcc = { blue: 0, red: 0 };
    this.zoom = 1; this.zoomX = 0.5; this.zoomY = 0.65; this.hitstop = 0;
    this.celebrateT = 0; this.volleyT = 0;
    this.atmo = { fng: 50, storm: false, overlap: false, cbPremUsd: 0 };
    this.shields = {
      blue: { str: 0.45, target: 0.45, hit: 0, breakT: 0, prevUsd: 0 },
      red: { str: 0.45, target: 0.45, hit: 0, breakT: 0, prevUsd: 0 },
    };
    this.combo = {
      blue: { count: 0, usd: 0, lastAt: -99, pop: 0 },
      red: { count: 0, usd: 0, lastAt: -99, pop: 0 },
    };
    this.sprites = {
      blue: makeGlow(...COL.blue.glow), red: makeGlow(...COL.red.glow),
      fire: makeGlow(255, 160, 50), white: makeGlow(255, 240, 220), liq: makeGlow(192, 132, 252),
      gold: makeGlow(253, 224, 71), smoke: makeSmoke(), cloud: makeCloud(),
    };
    this.units = makeUnitSprites(COL);
    this.forts = { blue: new Fortress('blue', COL.blue), red: new Fortress('red', COL.red) };
    this._rzQ = 0; const rz = () => { if (!this._rzQ) this._rzQ = requestAnimationFrame(() => { this._rzQ = 0; this.resize(); }); };
    window.addEventListener('resize', rz);
    if (window.ResizeObserver) new ResizeObserver(rz).observe(canvas);
    this._watchDpr = () => {
      if (typeof matchMedia !== 'function') return;
      const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      const on = () => { mq.removeEventListener('change', on); rz(); this._watchDpr(); };
      mq.addEventListener && mq.addEventListener('change', on);
    };
    this._watchDpr();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.queue = []; this.pending = { blue: 0, red: 0 }; } });
    if (this.cv && this.cv.addEventListener) {
      this.cv.addEventListener('pointermove', (e) => {
        const r = this.cv.getBoundingClientRect();
        this._hoverPos = { x: e.clientX - r.left, y: e.clientY - r.top };
        this._emitHover();
      });
      this.cv.addEventListener('pointerleave', () => {
        this._hoverPos = null;
        this._lastHoverKey = '';
        this.onHover && this.onHover(null);
      });
    }
    this.resize(true);
    this._initWeather();
    for (let i = 0; i < 48; i++) this.embers.push(this._ember(true));
  }

  // ---------- 布局 ----------
  resize(force) {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.Q.dpr);
    if (!r.width || !r.height) return;
    if (force !== true && r.width === this.W && r.height === this.H && dpr === this.dpr) return;
    this.W = r.width; this.H = r.height; this.dpr = dpr;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    const oT = this.laneTop, oB = this.laneBot, oW = this.W0;
    this.horizon = this.H * 0.4; this.laneTop = this.H * 0.52; this.laneBot = this.H * 0.93;
    if (oT != null && oB > oT) {
      for (const s of this.soldiers) { s.y = this.laneTop + (s.y - oT) / (oB - oT) * (this.laneBot - this.laneTop); if (oW) s.x *= this.W / oW; }
    }
    this.W0 = this.W;
    this.baseL = Math.max(34, this.W * 0.055, 50 * clamp(this.H / 500, 0.5, 1.15)); this.baseR = this.W - this.baseL;
    this.N = Math.round(clamp(this.W / 16, 22, 70));
    this.forts.blue.build(this.W, this.H, dpr, this.baseL, this.H * 0.66, this.baseL);
    this.forts.red.build(this.W, this.H, dpr, this.baseR, this.H * 0.66, this.W - this.baseR);
    const shieldPad = Math.max(this.baseL + 58 * this.forts.blue.k, this.W * 0.12);
    this.defHalfSpan = Math.max(this.W * 0.26, this.W * 0.5 - Math.min(shieldPad, this.W * 0.21));
    this._bg = this._renderBg();
    const strip = (c0, c1) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 1; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, 0, 128, 1); return c;
    };
    this._tintB = strip('rgba(37,99,235,0.28)', 'rgba(37,99,235,0.05)');
    this._tintR = strip('rgba(220,38,38,0.05)', 'rgba(220,38,38,0.28)');
    {
      const c = document.createElement('canvas'); const W = this.W, H = this.H; c.width = Math.ceil(W / 2); c.height = Math.ceil(H / 2);
      const x = c.getContext('2d'); x.scale(0.5, 0.5);
      const v = x.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.4, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
      this._vig = c;
    }
  }
  scaleAt(y) { return 0.55 + 0.75 * clamp((y - this.horizon) / (this.H - this.horizon), 0, 1.2); }
  defenseX(u, y = this.H * 0.72, bowDir = 0) {
    const p = clamp((y - this.horizon) / Math.max(1, this.H - this.horizon), 0, 1);
    const persp = 0.85 + 0.22 * p;
    const bow = bowDir ? Math.sin(p * Math.PI) * 5.5 * bowDir : 0;
    const shift = (this.camShift || 0) * (0.75 + 0.25 * p);
    return clamp(this.W * 0.5 + shift + u * (this.defHalfSpan || this.W * 0.35) * persp + bow, this.baseL + 22, this.baseR - 22);
  }
  frontX(y = this.H * 0.72) {
    const f = this.def && this.def.anchor > 0
      ? this.defenseX(this.frontU, y, 0)
      : this.W * clamp(0.5 + (this.front - 0.5) * 1.5, 0.15, 0.85);
    return clamp(f + Math.sin(y * 0.045 + this.t * 2.2) * 5 + Math.sin(y * 0.11 - this.t * 3.1) * 3, this.baseL + 18, this.baseR - 18);
  }

  _renderBg() {
    const { W, H } = this; const c = document.createElement('canvas');
    c.width = Math.round(W * this.dpr); c.height = Math.round(H * this.dpr);
    const x = c.getContext('2d'); x.scale(this.dpr, this.dpr);
    const sky = x.createLinearGradient(0, 0, 0, this.horizon);
    sky.addColorStop(0, '#05070f'); sky.addColorStop(0.6, '#0d1230'); sky.addColorStop(1, '#2a1838');
    x.fillStyle = sky; x.fillRect(0, 0, W, this.horizon + 2);
    // 星空
    for (let i = 0; i < W * 0.12; i++) {
      x.fillStyle = `rgba(255,255,255,${rand(0.15, 0.7)})`;
      const s = Math.random() < 0.1 ? 1.6 : 0.9;
      x.fillRect(Math.random() * W, Math.random() * this.horizon * 0.85, s, s);
    }
    // 远山两层（独立图层，用于视差）
    const PAD = this.PAD = 90;
    const mtn = (base, amp, col, seed, rim) => {
      const m = document.createElement('canvas');
      m.width = Math.round((W + PAD * 2) * this.dpr); m.height = Math.round((this.horizon + 4) * this.dpr);
      const y2 = m.getContext('2d'); y2.scale(this.dpr, this.dpr);
      y2.fillStyle = col; y2.beginPath(); y2.moveTo(0, this.horizon + 4);
      const pts = [];
      for (let px = 0; px <= W + PAD * 2 + 10; px += 8) {
        const y = base - amp * (0.5 + 0.3 * Math.sin(px * 0.008 + seed) + 0.2 * Math.sin(px * 0.023 + seed * 2) + 0.1 * Math.sin(px * 0.07 + seed));
        y2.lineTo(px, y); pts.push([px, y]);
      }
      y2.lineTo(W + PAD * 2 + 10, this.horizon + 4); y2.closePath(); y2.fill();
      y2.strokeStyle = rim; y2.lineWidth = 1; y2.beginPath(); pts.forEach(([a, b], i) => i ? y2.lineTo(a, b) : y2.moveTo(a, b)); y2.stroke();
      return m;
    };
    this._mtnFar = mtn(this.horizon, H * 0.17, '#15163a', 1.3, 'rgba(160,140,255,0.18)');
    this._mtnNear = mtn(this.horizon + 2, H * 0.09, '#0b0c1e', 4.1, 'rgba(255,150,170,0.12)');
    // 地面
    const g = x.createLinearGradient(0, this.horizon, 0, H);
    g.addColorStop(0, '#1a1426'); g.addColorStop(0.35, '#121522'); g.addColorStop(1, '#07080f');
    x.fillStyle = g; x.fillRect(0, this.horizon, W, H - this.horizon);
    // 透视网格
    x.strokeStyle = 'rgba(140,160,255,0.06)'; x.lineWidth = 1;
    for (let i = -20; i <= 20; i++) {
      x.beginPath(); x.moveTo(W / 2 + i * W * 0.02, this.horizon); x.lineTo(W / 2 + i * W * 0.14, H); x.stroke();
    }
    for (let i = 1; i < 9; i++) {
      const yy = this.horizon + (H - this.horizon) * Math.pow(i / 9, 1.8);
      x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke();
    }
    return c;
  }

  _initWeather() {
    const W = this.W || 800;
    this.clouds = Array.from({ length: 7 }, () => ({ x: rand(-100, W + 100), y: rand(0.04, 0.26), w: rand(140, 320), h: rand(30, 60), v: rand(4, 12), a: rand(0.18, 0.4) }));
    this.fog = Array.from({ length: 9 }, () => ({ x: rand(-100, W + 100), w: rand(180, 380), h: rand(40, 80), v: rand(-8, 8), a: rand(0.25, 0.5) }));
    this.bolts = [];
  }

  _drawCelestial(cam) {
    const { ctx, W, H } = this;
    const fng = this.atmo.fng;
    const mx = W * 0.5 - cam * 0.12, my = H * 0.135;
    const mr = clamp(H * 0.045, 13, 24);

    if (fng <= 35) {
      // 恐慌血月 + 低空猩红月蚀氛围
      const fearK = clamp((35 - fng) / 35, 0.35, 1);
      const hg = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 4.8);
      hg.addColorStop(0, `rgba(252,165,165,${0.85 * fearK})`);
      hg.addColorStop(0.26, `rgba(220,38,38,${0.48 * fearK})`);
      hg.addColorStop(0.6, `rgba(127,29,29,${0.18 * fearK})`);
      hg.addColorStop(1, 'rgba(127,29,29,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(mx, my, mr * 4.8, 0, TAU); ctx.fill();

      const dg = ctx.createRadialGradient(mx - mr * 0.25, my - mr * 0.25, 0, mx, my, mr);
      dg.addColorStop(0, '#fecaca');
      dg.addColorStop(0.45, '#ef4444');
      dg.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();

      // 地平线猩红雾霭
      const mist = ctx.createLinearGradient(0, this.horizon * 0.6, 0, this.horizon + 20);
      mist.addColorStop(0, 'rgba(185,28,28,0)');
      mist.addColorStop(1, `rgba(185,28,28,${0.18 * fearK})`);
      ctx.fillStyle = mist;
      ctx.fillRect(0, this.horizon * 0.6, W, this.horizon * 0.4 + 20);
    } else {
      // 经典冷月
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4.4);
      mg.addColorStop(0, 'rgba(255,240,210,0.92)');
      mg.addColorStop(0.22, 'rgba(255,220,170,0.6)');
      mg.addColorStop(0.32, 'rgba(255,200,140,0.12)');
      mg.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, mr * 4.4, 0, TAU); ctx.fill();

      // 贪婪极光（高贪婪 + 非低画质）
      if (fng >= 65 && this.q < 2) this._drawAurora(clamp((fng - 65) / 35, 0.3, 1));
    }
  }

  _drawAurora(k) {
    const { ctx, W, H, t } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 2; b++) {
      const y0 = H * (0.06 + b * 0.08);
      const amp = H * (0.045 + b * 0.02);
      const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + amp * 2.2);
      if (b === 0) {
        g.addColorStop(0, 'rgba(56,189,248,0)');
        g.addColorStop(0.5, `rgba(59,130,246,${0.18 * k})`);
        g.addColorStop(1, 'rgba(251,191,36,0)');
      } else {
        g.addColorStop(0, 'rgba(251,191,36,0)');
        g.addColorStop(0.5, `rgba(56,189,248,${0.14 * k})`);
        g.addColorStop(1, 'rgba(59,130,246,0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, y0 + amp * 2);
      for (let x = 0; x <= W; x += 28) {
        const y = y0 + Math.sin(x * 0.008 + t * (0.6 + b * 0.3) + b * 2) * amp * 0.6 + Math.cos(x * 0.019 - t * 0.4) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, y0 + amp * 2.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawClouds(off) {
    const { ctx, H } = this;
    const boost = this.atmo.storm ? 1.3 : 1;
    for (const c of this.clouds) {
      ctx.globalAlpha = Math.min(0.65, c.a * boost);
      ctx.drawImage(this.sprites.cloud, c.x - c.w / 2 - off, c.y * H - c.h / 2, c.w, c.h);
    }
    ctx.globalAlpha = 1;
  }

  _drawLightning(fg = false) {
    const { ctx } = this;
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bolts) {
      if (!!b.fg !== fg) continue;
      const k = b.life / b.max;
      const passes = fg ? [[10, 0.18], [4, 0.55], [1.6, 0.95]] : [[6, 0.15], [2, 0.9]];
      for (const [w, a] of passes) {
        ctx.strokeStyle = `rgba(${b.col},${a * k})`; ctx.lineWidth = w; ctx.beginPath();
        b.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      }
      if (fg) {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`; ctx.lineWidth = 1.2; ctx.beginPath();
        b.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }

  _bolt(side, quiet = false) {
    let x = rand(this.W * 0.12, this.W * 0.88), y = 0; const pts = [[x, y]];
    while (y < this.horizon - 10) { y += rand(10, 26); x += rand(-22, 22); pts.push([x, y]); }
    const col = side === 'red' ? '255,190,180' : '190,215,255';
    this.bolts.push({ pts, life: quiet ? 0.18 : 0.24, max: quiet ? 0.18 : 0.24, col });
    this.flash = Math.max(this.flash, quiet ? 0.06 : 0.16); this.flashCol = col;
  }

  // ---------- 数据驱动环境接口 ----------
  setAtmosphere({ fng, storm, overlap, cbPremUsd, wallBlue, wallRed } = {}) {
    if (fng != null && isFinite(fng)) this.atmo.fng = clamp(+fng, 0, 100);
    if (storm !== undefined) this.atmo.storm = !!storm;
    if (overlap !== undefined) this.atmo.overlap = !!overlap;
    if (cbPremUsd != null && isFinite(cbPremUsd)) this.atmo.cbPremUsd = +cbPremUsd;

    if ((wallBlue > 0 || wallRed > 0) && isFinite(wallBlue || 0) && isFinite(wallRed || 0)) {
      const tot = Math.max(1, (wallBlue || 0) + (wallRed || 0));
      for (const side of ['blue', 'red']) {
        const usd = side === 'blue' ? wallBlue : wallRed;
        if (!(usd > 0) || !isFinite(usd)) continue;
        const sh = this.shields[side];
        if (sh.prevUsd > 0 && usd < sh.prevUsd * 0.72 && sh.breakT <= 0.1) {
          this._triggerShieldBreak(side);
        }
        sh.prevUsd = usd;
        const absScore = clamp((Math.log10(usd + 1) - 5.5) / 2.2, 0.1, 1);
        const relScore = usd / tot;
        sh.target = clamp(absScore * 0.6 + relScore * 0.6, 0.15, 1);
      }
    }
  }

  _triggerShieldBreak(side) {
    const sh = this.shields[side];
    sh.breakT = 0.85;
    sh.hit = 1;
    const f = this.forts[side];
    if (!f || !this.W) return;
    const sx = f.X(52 * f.k), sy = f.gy - 52 * f.k;
    for (let i = 0; i < Math.round(14 * this.Q.pk); i++) {
      const a = rand(-1.2, 1.2) + (f.dir > 0 ? 0 : Math.PI);
      const sp = rand(60, 180);
      this.parts.push({
        type: 'spark', x: sx, y: sy + rand(-35, 35) * f.k,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: rand(0.45, 0.85), max: 0.85,
        col: Math.random() < 0.4 ? '#fde68a' : colOf(side).light, w: rand(1.5, 2.8),
      });
    }
  }

  _makeDefenseLines() {
    const m = new Map();
    for (const lvl of [-3, -2, -1, 1, 2, 3]) {
      m.set(lvl, {
        lvl,
        owner: lvl < 0 ? 'blue' : 'red',
        state: 'intact',
        wallUsd: 0,
        wallStr: 0,
        wallTarget: 0,
        covered: false,
        hit: 0,
        siege: 0,
        breakT: 0,
        rebuildT: 0,
        lastEventAt: -99,
        breachCount: 0,
      });
    }
    return m;
  }

  _activeWallLine(side) {
    const order = side === 'red' ? [1, 2, 3] : [-1, -2, -3];
    for (const lvl of order) {
      const ln = this.def.lines.get(lvl);
      if (ln && ln.state === 'intact') return ln;
    }
    return null;
  }

  _nearestIntactBehind(side, y, fx) {
    const order = side === 'blue' ? [-1, -2, -3] : [1, 2, 3];
    const bowDir = side === 'blue' ? 1 : -1;
    for (const lvl of order) {
      const ln = this.def.lines.get(lvl);
      if (!ln || ln.state !== 'intact') continue;
      const wx = this.defenseX(lvl * 0.25, y, bowDir);
      if ((side === 'blue' && wx < fx - 18) || (side === 'red' && wx > fx + 18)) return wx;
    }
    return null;
  }

  setMomentum(s) {
    this.momentumS = clamp(+s || 0, -1, 1);
  }

  resetDefense() {
    this.def.anchor = 0;
    this.def.anchorType = 'daily';
    this.def.price = 0;
    this.def.pct = 0;
    this.def.initialized = false;
    this.frontU = 0;
    this.frontTargetU = 0;
    for (const [, ln] of this.def.lines) {
      ln.state = 'intact';
      ln.wallUsd = 0;
      ln.wallStr = 0;
      ln.wallTarget = 0;
      ln.covered = false;
      ln.hit = 0;
      ln.siege = 0;
      ln.breakT = 0;
      ln.rebuildT = 0;
      ln.lastEventAt = -99;
      ln.breachCount = 0;
    }
    this.camShift = 0;
  }

  setDefenseState({ anchor, anchorType = 'daily', price, stepMode, wallMap } = {}) {
    if (!(anchor > 0) || !isFinite(anchor) || !(price > 0) || !isFinite(price)) return;
    const pct = (price / anchor - 1) * 100;
    const mode = stepMode || this.def.stepMode || 'auto';
    const anchorChanged = !(this.def.anchor > 0) || anchorType !== this.def.anchorType || Math.abs(anchor - this.def.anchor) / this.def.anchor > 0.0005;
    const modeChanged = mode !== this.def.stepMode;
    let silentSync = !this.def.initialized || anchorChanged || modeChanged;

    const absPct = Math.abs(pct);
    let nextStep = this.def.step || 1;
    if (mode === 'auto') {
      if (silentSync) {
        nextStep = absPct >= 7 ? 3 : absPct >= 3.4 ? 2 : 1;
      } else {
        if (nextStep === 1 && absPct >= 3.4) nextStep = 2;
        else if (nextStep === 2 && absPct <= 2.6) nextStep = 1;
        else if (nextStep === 2 && absPct >= 7.0) nextStep = 3;
        else if (nextStep === 3 && absPct <= 5.6) nextStep = 2;
      }
    } else {
      nextStep = clamp(+mode || 1, 0.25, 5);
    }

    const stepChanged = nextStep !== this.def.step;
    if (stepChanged) silentSync = true;

    const wasInit = this.def.initialized;
    this.def.anchor = anchor;
    this.def.anchorType = anchorType;
    this.def.price = price;
    this.def.pct = pct;
    this.def.step = nextStep;
    this.def.stepMode = mode;

    if (wallMap) {
      for (const [lvl, ln] of this.def.lines) {
        const w = wallMap instanceof Map ? wallMap.get(lvl) : wallMap[lvl];
        if (!w) continue;
        ln.covered = !!w.covered;
        ln.wallUsd = w.usd > 0 && isFinite(w.usd) ? w.usd : 0;
        ln.wallTarget = ln.covered && ln.wallUsd > 0
          ? clamp((Math.log10(ln.wallUsd + 1) - 5.0) / 2.2, 0.12, 1)
          : 0;
      }
    }

    if (silentSync) {
      for (const [lvl, ln] of this.def.lines) {
        const linePct = lvl * nextStep;
        ln.state = lvl > 0 ? (pct >= linePct ? 'captured' : 'intact') : (pct <= linePct ? 'captured' : 'intact');
        ln.hit = 0;
        ln.breakT = 0;
        ln.rebuildT = 0;
        ln.siege = 0;
      }
      if (!wasInit || stepChanged) {
        const rightLn = this._activeWallLine('red');
        const leftLn = this._activeWallLine('blue');
        const rightWall = rightLn ? rightLn.lvl * 0.25 : 0.94;
        const leftWall = leftLn ? leftLn.lvl * 0.25 : -0.94;
        const macroU = clamp(pct / (nextStep * 4), -0.94, 0.94);
        const initU = clamp(macroU, leftWall + 0.02, rightWall - 0.02);
        this.frontU = this.frontTargetU = initU;
        this.front = this.frontTarget = clamp(0.5 + initU * 0.5, 0.04, 0.96);
      }
      this.def.initialized = true;
    } else {
      const hyst = Math.max(0.03, nextStep * 0.04);
      const events = [];
      for (const lvl of [1, 2, 3, -1, -2, -3]) {
        const ln = this.def.lines.get(lvl);
        if (!ln) continue;
        const linePct = lvl * nextStep;
        if (this.t - ln.lastEventAt < 15) continue;
        if (lvl > 0) {
          if (ln.state === 'intact' && pct >= linePct + hyst * 0.35) {
            ln.state = 'captured'; ln.breakT = 0.95; ln.hit = 1; ln.lastEventAt = this.t;
            events.push({ ln, attacker: 'blue', recaptured: false });
          } else if (ln.state === 'captured' && pct <= linePct - hyst * 1.1) {
            ln.state = 'intact'; ln.rebuildT = 0.85; ln.hit = 0.7; ln.lastEventAt = this.t;
            events.push({ ln, attacker: 'red', recaptured: true });
          }
        } else {
          if (ln.state === 'intact' && pct <= linePct - hyst * 0.35) {
            ln.state = 'captured'; ln.breakT = 0.95; ln.hit = 1; ln.lastEventAt = this.t;
            events.push({ ln, attacker: 'red', recaptured: false });
          } else if (ln.state === 'captured' && pct >= linePct + hyst * 1.1) {
            ln.state = 'intact'; ln.rebuildT = 0.85; ln.hit = 0.7; ln.lastEventAt = this.t;
            events.push({ ln, attacker: 'blue', recaptured: true });
          }
        }
      }
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        this._triggerLineEvent(ev.ln, ev.attacker, ev.recaptured, i === events.length - 1);
      }
    }

    if (stepChanged && this.onStepChange) this.onStepChange(nextStep);
  }

  _triggerLineEvent(line, attackerSide, recaptured, notify = true) {
    if (!this.W) return;
    const u = line.lvl * 0.25;
    const bowDir = line.owner === 'blue' ? 1 : -1;
    const midY = (this.laneTop + this.laneBot) * 0.5;
    const mx = this.defenseX(u, midY, bowDir);
    const col = colOf(attackerSide);
    const defenderSide = attackerSide === 'blue' ? 'red' : 'blue';
    const nSparks = Math.round((recaptured ? 14 : 26) * this.Q.pk);
    for (let i = 0; i < nSparks; i++) {
      const py = rand(this.laneTop, this.laneBot);
      const px = this.defenseX(u, py, bowDir);
      const a = rand(-1.3, 1.3) + (attackerSide === 'blue' ? 0 : Math.PI);
      const sp = rand(70, recaptured ? 170 : 240);
      this.parts.push({
        type: 'spark', x: px, y: py,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 35,
        life: rand(0.45, 0.95), max: 0.95,
        col: Math.random() < 0.35 ? '#fde68a' : col.light, w: rand(1.5, 2.8),
      });
    }
    for (let i = 0; i < 2; i++) {
      const ry = lerp(this.laneTop + 20, this.laneBot - 20, i === 0 ? 0.35 : 0.72);
      const rx = this.defenseX(u, ry, bowDir);
      this.rings.push({ x: rx, y: ry, r: 6, max: recaptured ? 46 : 72, life: 0.55, t: 0, col: col.glow });
    }
    this.parts.push({ type: 'glow', spr: attackerSide, x: mx, y: midY, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 110, add: true, grow: 1.2 });
    if (!recaptured) {
      for (const s of this.soldiers) {
        if (s.dead || s.side !== defenderSide) continue;
        const sx = this.defenseX(u, s.y, bowDir);
        if (Math.abs(s.x - sx) < 48) {
          s.dead = true; s.dieT = 0;
          s.vx = (attackerSide === 'blue' ? 1 : -1) * rand(40, 110);
          s.vy = -rand(40, 100);
        }
      }
    }
    this.shake = Math.max(this.shake, recaptured ? 3.5 : 7.5);
    this.flash = Math.max(this.flash, recaptured ? 0.08 : 0.16);
    this.flashCol = attackerSide === 'blue' ? '147,197,253' : '252,165,165';

    const pctVal = +(line.lvl * this.def.step).toFixed(1);
    const pctStr = (pctVal > 0 ? '+' : '') + pctVal + '%';
    line.breachCount = (line.breachCount || 0) + 1;
    const tag = tr(recaptured ? 'defRecapTag' : 'defBreachTag', pctStr);
    this.texts.push({
      x: mx, y: this.laneTop + 14, vx: 0,
      txt: tag, side: attackerSide,
      col: recaptured ? '#fde68a' : col.light,
      lvl: 2, life: 2.1, max: 2.1,
    });

    const linePrice = this.def.anchor * (1 + pctVal / 100);
    if (notify) {
      this._pushFeed({
        side: attackerSide,
        type: recaptured ? 'recap' : 'breach',
        lvl: line.lvl,
        pct: pctVal,
        price: linePrice,
        recaptured,
        label: tr(recaptured ? 'kfRecap' : 'kfBreach', pctStr),
      });
    }
    if (notify && this.onBreach) {
      this.onBreach({ side: attackerSide, lvl: line.lvl, pct: pctVal, price: linePrice, recaptured });
    }
  }

  setActivity(blue, red) { this.activity.blue = clamp(blue, 0, 2); this.activity.red = clamp(red, 0, 2); }
  setThresholds(th) { Object.assign(this.th, th); }

  reset() {
    this.bullets = []; this.shells = []; this.strikes = []; this.fissures = [];
    this.parts = []; this.texts = []; this.queue = []; this.rings = []; this.bolts = [];
    this.pending = { blue: 0, red: 0 }; this.front = this.frontTarget = 0.5; this.surge = null; this.surgeT = 0; this.lastSurge = null;
    this.smoke = []; this.scorch = []; this.celebrateT = 0; this.shake = 0; this.flash = 0; this.intensity = 0;
    this.hitstop = 0; this.zoom = 1; this.zoomX = 0.5; this.zoomY = 0.65; this.volleyT = 0;
    this.camShift = 0; this.killFeed = []; this.orderWalls = []; this.liqZones = [];
    this.soldiers = this.soldiers.filter(s => (s.kind || 'infantry') === 'infantry');
    this.combo.blue = { count: 0, usd: 0, lastAt: -99, pop: 0 };
    this.combo.red = { count: 0, usd: 0, lastAt: -99, pop: 0 };
    this.resetDefense();
    for (const f of Object.values(this.forts)) { f.dmg = 0; f.glow = 0.6; f.siegeMode = false; f.alert = 0; }
    this.onFeedUpdate && this.onFeedUpdate(this.killFeed);
  }

  celebrate(side) {
    this.celebrateT = 4; this.celebrateSide = side;
  }
  _firework(side) {
    const x = rand(this.W * 0.1, this.W * 0.9), y = rand(this.H * 0.06, this.horizon * 0.85);
    const c = side === 'blue' ? ['#93c5fd', '#60a5fa', '#e0f2fe', '#fbbf24'] : ['#fca5a5', '#f87171', '#fee2e2', '#fbbf24'];
    this.parts.push({ type: 'glow', spr: side, x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 90, add: true, grow: 1 });
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU, sp = rand(90, 190);
      this.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.8, 1.4), max: 1.4, col: c[i % c.length], w: 2, light: true });
    }
  }

  // ---------- 对外接口 ----------
  setFront(v) { if (!this.def.initialized) this.frontTarget = clamp(v, 0.04, 0.96); }
  setSurge(side) { this.surge = side; }
  fire(side, usd, qty) {
    if (document.hidden) return;
    if (this.queue.length > 300) this.queue.shift();
    this.queue.push({ side: side === 'buy' ? 'blue' : 'red', usd, qty });
  }

  /** 永续强平独立天雷特效 + 地面紫纹裂隙 */
  liquidate(side, usd, opts = {}) {
    if ((document.hidden && !opts.replay) || !this.W || !(usd > 0)) return;
    const isLong = side === 'long', victim = isLong ? 'blue' : 'red', winner = isLong ? 'red' : 'blue';
    const ty = rand(this.laneTop, this.laneBot), fx = this.frontX(ty), base = victim === 'blue' ? this.baseL : this.baseR;
    const tx = lerp(fx + (victim === 'blue' ? -24 : 24), base, rand(0.12, 0.78));
    const lvl = usd >= this.th.heavy ? 3 : usd >= this.th.shell ? 2 : 1;

    const segs = 10 + lvl * 2, sx0 = tx + rand(-45, 45);
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const q = i / segs, j = (i === 0 || i === segs) ? 0 : rand(-16, 16) * (1 - q * 0.4);
      pts.push([lerp(sx0, tx, q) + j, ty * q]);
    }
    this.bolts.push({ pts, life: 0.36, max: 0.36, col: '216,180,254', fg: true });
    if (lvl >= 2) {
      const mi = (segs * 0.45) | 0, mp = pts[mi];
      const bx0 = mp[0], by0 = mp[1], bx1 = bx0 + rand(-55, 55), by1 = lerp(by0, ty, rand(0.45, 0.8));
      const fpts = [mp];
      for (let i = 1; i <= 4; i++) {
        const q = i / 4;
        fpts.push([lerp(bx0, bx1, q) + (i < 4 ? rand(-10, 10) : 0), lerp(by0, by1, q)]);
      }
      this.bolts.push({ pts: fpts, life: 0.3, max: 0.3, col: '253,230,138', fg: true });
    }

    // 地面紫纹裂隙
    const fLen = 22 + lvl * 14;
    const fPts = [[tx - fLen, ty + rand(-4, 4)]];
    for (let i = 1; i <= 4; i++) {
      fPts.push([lerp(tx - fLen, tx + fLen, i / 4), ty + rand(-8, 8)]);
    }
    if (this.fissures.length >= 12) this.fissures.shift();
    this.fissures.push({ pts: fPts, x: tx, y: ty, lvl, life: 3.2, max: 3.2 });

    const R = 16 + lvl * 12;
    this.parts.push({ type: 'glow', spr: 'white', x: tx, y: ty, vx: 0, vy: 0, life: 0.25, max: 0.25, size: R * 2.1, add: true });
    this.parts.push({ type: 'glow', spr: 'liq', x: tx, y: ty, vx: 0, vy: 0, life: 0.7, max: 0.7, size: R * 3.4, add: true, grow: 1.3 });
    const spN = Math.round((12 + lvl * 10) * this.Q.pk);
    for (let i = 0; i < spN; i++) {
      const a = rand(Math.PI, TAU) + rand(-0.3, 0.3), sp = rand(70, 160 + lvl * 35);
      this.parts.push({ type: 'spark', x: tx, y: ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 0.9), max: 0.9, col: Math.random() < 0.4 ? '#fde68a' : '#e9d5ff', w: rand(1.2, 2.4) });
    }
    this.rings.push({ x: tx, y: ty, r: 6, max: R * 2.4, life: 0.6 + lvl * 0.12, t: 0, col: [192, 132, 252] });
    if (this.scorch.length > 40) this.scorch.shift();
    this.scorch.push({ x: tx, y: ty, r: R * 0.85, life: 12 });
    for (let i = 0; i < Math.round((3 + lvl * 2) * this.Q.pk); i++) {
      this._smoke(tx + rand(-R * 0.4, R * 0.4), ty - rand(0, R * 0.3), rand(R * 0.4, R * 0.8), rand(-16, 16), rand(-34, -10), rand(1.4, 2.6));
    }
    this._killNear(victim, tx, ty, 24 + lvl * 14);
    this.shake = Math.max(this.shake, 3 + lvl * 2.5);
    this.flash = Math.max(this.flash, 0.12 + lvl * 0.05); this.flashCol = '192,132,252';
    if (lvl >= 2 && !(RM && RM.matches)) {
      this.hitstop = Math.max(this.hitstop, 0.025);
      this.zoom = Math.max(this.zoom, 1.035);
      this.zoomX = clamp(tx / this.W, 0.15, 0.85);
      this.zoomY = clamp(ty / this.H, 0.35, 0.85);
    }
    this.texts.push({ x: tx, y: ty - 26, txt: `⚡ ${tr(isLong ? 'liqTagL' : 'liqTagS')} ${fmtUsd(usd)}`, side: victim, col: '#e9d5ff', lvl, life: 1.85, max: 1.85 });
    if (usd >= this.th.heavy) this._spawnUnit(winner, 'titan', false);
    if (!opts.noFeed && usd >= this.th.shell) {
      this._pushFeed({
        side: victim,
        liqSide: side,
        type: 'liq',
        usd,
        price: this.def.price,
        label: tr('kfLiq', tr(isLong ? 'liqSideL' : 'liqSideS'), fmtUsd(usd)),
      });
    }
  }

  // ---------- 士兵与多兵种 ----------
  _spawnSoldier(side, atBase = true) {
    this._spawnUnit(side, 'infantry', atBase);
  }

  _spawnUnit(side, kind = 'infantry', atBase = true) {
    if (!this.W) return null;
    const base = side === 'blue' ? this.baseL : this.baseR;
    const dir = side === 'blue' ? 1 : -1;
    if (kind === 'cavalry') {
      const n = this.soldiers.filter(s => !s.dead && s.side === side && s.kind === 'cavalry').length;
      if (n >= 6) return null;
      const y = rand(this.laneTop + 8, this.laneBot - 8);
      const u = {
        side, kind: 'cavalry', x: base + dir * rand(8, 22), y, d: rand(0.05, 0.25),
        phase: rand(0, TAU), speed: rand(76, 98), cool: 0.5, ttl: 14, charged: false,
        dead: false, dieT: 0, hit: 0, rot: 0, meleeT: 0, knockVx: 0,
      };
      this.soldiers.push(u);
      return u;
    }
    if (kind === 'siege') {
      const n = this.soldiers.filter(s => !s.dead && s.side === side && s.kind === 'siege').length;
      if (n >= 2) return null;
      const y = lerp(this.laneTop + 14, this.laneBot - 14, rand(0.2, 0.8));
      const u = {
        side, kind: 'siege', x: base + dir * rand(10, 24), y, d: 0.08,
        phase: rand(0, TAU), speed: rand(26, 34), cool: 1.2, ramCool: 0.45, ramT: 0, ttl: 18,
        dead: false, dieT: 0, hit: 0, rot: 0, meleeT: 0, knockVx: 0,
      };
      this.soldiers.push(u);
      return u;
    }
    if (kind === 'titan') {
      const cur = this.soldiers.find(s => !s.dead && s.side === side && s.kind === 'titan');
      if (cur) {
        cur.ttl = 15; cur.hit = 1;
        this.rings.push({ x: cur.x, y: cur.y, r: 8, max: 46, life: 0.55, t: 0, col: colOf(side).glow });
        return cur;
      }
      const y = lerp(this.laneTop, this.laneBot, rand(0.32, 0.68));
      const fx = this.frontX(y);
      const x = atBase ? base + dir * 24 : lerp(fx, base, 0.35);
      const u = {
        side, kind: 'titan', x, y, d: 0.14,
        phase: rand(0, TAU), speed: rand(22, 28), cool: 0.9, ttl: 15,
        dead: false, dieT: 0, hit: 0, rot: 0, meleeT: 0, knockVx: 0,
      };
      this.rings.push({ x: u.x, y: u.y, r: 10, max: 58, life: 0.7, t: 0, col: [253, 230, 138] });
      this.soldiers.push(u);
      return u;
    }
    const y = rand(this.laneTop, this.laneBot);
    const fx = this.frontX(y);
    const d = Math.pow(Math.random(), 1.7);
    const x = atBase ? base + (side === 'blue' ? rand(-10, 20) : rand(-20, 10)) : lerp(fx, base, d * 0.8 + 0.1);
    const u = {
      side, kind: 'infantry', x, y, d, phase: rand(0, TAU), speed: rand(28, 48), cool: rand(0.3, 2.5),
      ttl: Infinity, dead: false, dieT: 0, hit: 0, rot: 0, meleeT: 0, knockVx: 0,
      banner: Math.random() < 0.09, garrison: Math.random() < 0.25,
    };
    this.soldiers.push(u);
    return u;
  }

  _killNear(side, x, y, r) {
    let k = 0;
    for (const s of this.soldiers) {
      if (s.dead || s.side !== side) continue;
      if ((s.kind === 'titan' || s.kind === 'siege') && r < 26) continue;
      const dx = s.x - x, dy = (s.y - y) * 1.6;
      if (dx * dx + dy * dy < r * r) { s.dead = true; s.dieT = 0; s.vx = Math.sign(dx || 1) * rand(30, 90); s.vy = -rand(40, 120); k++; }
    }
    return k;
  }

  // ---------- 弹药 & 符文裁决光柱 & 连击 ----------
  _bullet(side, sx, sy, tx, ty, big = false) {
    const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1, sp = big ? 960 : rand(650, 900);
    this.bullets.push({ side, x: sx, y: sy, vx: dx / d * sp, vy: dy / d * sp, life: d / sp, big });
  }

  _shell(side, usd, kind) {
    const blue = side === 'blue';
    const [sx, sy] = this.forts[side].cannonPos();
    const ty = rand(this.laneTop, this.laneBot);
    const fx = this.frontX(ty);
    const ebase = blue ? this.baseR : this.baseL;
    const tx = lerp(fx + (blue ? 20 : -20), ebase, Math.pow(Math.random(), 1.3) * 0.85);
    const T = rand(0.85, 1.35);
    const s = { side, usd, kind, sx, sy, tx, ty, t: 0, T, x: sx, y: sy, h: this.H * rand(0.25, 0.42) };
    this._muzzle(sx, sy, side, kind === 'heavy' ? 1.6 : 1);
    this.shells.push(s);
  }

  _skyStrike(side, usd, tier = 1) {
    if (!this.W) return;
    const blue = side === 'blue';
    const ty = rand(this.laneTop + 6, this.laneBot - 6);
    const fx = this.frontX(ty);
    const ebase = blue ? this.baseR : this.baseL;
    const tx = lerp(fx + (blue ? 24 : -24), ebase, Math.pow(Math.random(), 1.2) * 0.85);
    this.strikes.push({
      side,
      usd,
      tier,
      tx,
      ty,
      phase: 'lock',
      t: 0,
      lockDur: tier === 2 ? 0.38 : 0.25,
      beamDur: tier === 2 ? 0.58 : 0.38,
    });
  }

  _recordCombo(side, usd) {
    const cb = this.combo[side];
    if (this.t - cb.lastAt <= 5) {
      cb.count++;
      cb.usd += usd;
    } else {
      cb.count = 1;
      cb.usd = usd;
    }
    cb.lastAt = this.t;
    cb.pop = 1;
    if (cb.count >= 3 && cb.count % 2 === 1) this._spawnUnit(side, 'cavalry', true);
  }

  _volley(side) {
    const cands = this.soldiers.filter((s) => !s.dead && s.side === side);
    if (!cands.length) return;
    cands.sort((a, b) => Math.abs(a.x - this.frontX(a.y)) - Math.abs(b.x - this.frontX(b.y)));
    const frontRow = cands.slice(0, Math.min(8, cands.length));
    for (const s of frontRow) {
      const sc = this.scaleAt(s.y), dir = side === 'blue' ? 1 : -1;
      const sx = s.x + dir * 12 * sc, sy = s.y - 13 * sc;
      const ty = clamp(s.y + rand(-18, 18), this.laneTop, this.laneBot);
      const tx = this.frontX(ty) + dir * rand(50, 160);
      this._bullet(side, sx, sy, tx, ty - 10 * this.scaleAt(ty), true);
      this.parts.push({ type: 'glow', spr: 'fire', x: sx, y: sy, vx: 0, vy: 0, life: 0.09, max: 0.09, size: 18 * sc, add: true });
      s.recoil = 0.16;
    }
    const [cx, cy] = this.forts[side].cannonPos();
    this._muzzle(cx, cy, side, 1.3);
  }

  _muzzle(x, y, side, k = 1) {
    this.parts.push({ type: 'glow', spr: 'fire', x, y, vx: 0, vy: 0, life: 0.18, max: 0.18, size: 34 * k, add: true });
    for (let i = 0; i < 6 * k; i++) this._smoke(x, y, rand(6, 12) * k, rand(-20, 20), rand(-30, -10));
  }
  _smoke(x, y, size, vx = rand(-12, 12), vy = rand(-26, -8), life = rand(1.4, 2.6)) {
    if (this.smoke.length > this.Q.smoke) this.smoke.shift();
    this.smoke.push({ x, y, vx, vy, size, life, max: life, rot: rand(0, TAU) });
  }
  explode(x, y, side, power, opts = {}) {
    const enemy = side === 'blue' ? 'red' : 'blue';
    const R = 14 + power * 9;
    this.parts.push({ type: 'glow', spr: 'white', x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: R * 2.2, add: true });
    this.parts.push({ type: 'glow', spr: 'fire', x, y, vx: 0, vy: 0, life: 0.55, max: 0.55, size: R * 3, add: true, grow: 1.5 });
    this.parts.push({ type: 'glow', spr: side, x, y, vx: 0, vy: 0, life: 0.8, max: 0.8, size: R * 3.4, add: true, grow: 1.2 });
    const n = Math.round(Math.min(14 + power * 10, 90) * this.Q.pk);
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI, TAU) + rand(-0.3, 0.3), sp = rand(60, 160) * (0.6 + power * 0.25);
      this.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 1.0), max: 1, col: Math.random() < 0.5 ? '#ffd27a' : colOf(side).light, w: rand(1, 2.4) });
    }
    for (let i = 0; i < Math.min(4 + power * 2, 20) * this.Q.pk; i++) {
      const a = rand(Math.PI * 1.1, Math.PI * 1.9), sp = rand(80, 220);
      this.parts.push({ type: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.8, 1.6), max: 1.6, s: rand(1.5, 3.5), rot: rand(0, TAU), vr: rand(-10, 10) });
    }
    for (let i = 0; i < Math.min(5 + power * 3, 28) * this.Q.pk; i++) this._smoke(x + rand(-R, R) * 0.6, y - rand(0, R * 0.6), rand(R * 0.5, R * 1.1), rand(-20, 20), rand(-40, -12), rand(1.6, 3.4));
    this.rings.push({ x, y, r: 4, max: R * (opts.whale ? 6 : 2.6), life: opts.whale ? 0.9 : 0.5, t: 0, col: colOf(side).glow });
    if (this.scorch.length > 40) this.scorch.shift();
    this.scorch.push({ x, y, r: R * 0.9, life: 14 });
    this.shake = Math.max(this.shake, Math.min(2 + power * 1.5, 18));
    if (power >= 6) { this.flash = Math.min(0.55, 0.15 + power * 0.04); this.flashCol = side === 'blue' ? '150,190,255' : '255,160,150'; }
    this._killNear(enemy, x, y, R * 1.1);
    const enemyBase = enemy === 'blue' ? this.baseL : this.baseR;
    if (Math.abs(x - enemyBase) < this.W * 0.24) {
      this.shields[enemy].hit = 1;
      if (opts.whale) this.shields[enemy].breakT = Math.max(this.shields[enemy].breakT, 0.55);
    }
    if (this.def.anchor > 0) {
      const targetWall = this._activeWallLine(enemy);
      if (targetWall) {
        const wx = this.defenseX(targetWall.lvl * 0.25, clamp(y, this.laneTop, this.laneBot), enemy === 'blue' ? 1 : -1);
        if (Math.abs(x - wx) < 28) targetWall.hit = Math.min(1, targetWall.hit + clamp(0.35 + power * 0.12, 0.35, 1));
      }
    }
  }
  _ember(init) {
    return { x: rand(0, this.W || 800), y: init ? rand(0, this.H || 400) : (this.H || 400) + 5, vy: rand(-12, -30), vx: rand(-6, 6), s: rand(0.6, 1.8), a: rand(0.2, 0.7), ph: rand(0, TAU) };
  }

  // ---------- 主循环 ----------
  start() {
    let last = performance.now();
    const loop = (now) => {
      const raw = now - last, dt = Math.min(raw / 1000, 0.05); last = now;
      if (this.W) { this.update(dt); this.draw(); this._fps(raw); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _fps(ms) {
    if (this.q >= QUALITY.length - 1 || document.hidden) return;
    if (ms > 1000) { this.fpsN = 0; this.fpsT = 0; return; }
    this.fpsN++; this.fpsT += ms;
    if (this.fpsT < 3000) return;
    const fps = this.fpsN * 1000 / this.fpsT; this.fpsN = 0; this.fpsT = 0;
    this.lastFps = Math.round(fps);
    if (fps < 40) { if (++this.slowWins >= 2) { this.slowWins = 0; this.setQuality(this.q + 1); } }
    else this.slowWins = 0;
  }
  setQuality(q) {
    q = clamp(q | 0, 0, QUALITY.length - 1); if (q === this.q) return;
    this.q = q; this.Q = QUALITY[q];
    if (this.parts.length > this.Q.parts) this.parts.splice(0, this.parts.length - this.Q.parts);
    if (this.smoke.length > this.Q.smoke) this.smoke.splice(0, this.smoke.length - this.Q.smoke);
    if (q >= 2 && this.embers.length > 18) this.embers.length = 18;
    this.resize();
    this.onQuality && this.onQuality(q);
  }

  _processQueue() {
    let budget = 40;
    while (this.queue.length && budget-- > 0) {
      const { side, usd } = this.queue.shift();
      this.intensity = Math.min(this.intensity + Math.log10(usd + 10) * 0.08, 6);
      if (usd >= this.th.whale) {
        this._skyStrike(side, usd, 2);
        this._recordCombo(side, usd);
        this._spawnUnit(side, 'titan', false);
        this._pushFeed({
          side, type: 'whale', usd, price: this.def.price,
          label: tr('kfWhale', tr(side === 'blue' ? 'blue' : 'red'), fmtUsd(usd)),
        });
        this.onWhale && this.onWhale(side, usd);
      } else if (usd >= this.th.heavy) {
        this._shell(side, usd, 'heavy');
        this._skyStrike(side, usd, 1);
        this._recordCombo(side, usd);
        this._spawnUnit(side, 'siege', true);
      } else if (usd >= this.th.shell) {
        this._shell(side, usd, 'shell');
        this._recordCombo(side, usd);
        this._spawnUnit(side, 'cavalry', true);
      } else {
        this.pending[side] += usd;
        if (usd >= this.th.small * 2) this._reinforce(side);
      }
    }
    for (const side of ['blue', 'red']) {
      let shots = 0;
      while (this.pending[side] > this.th.small && shots < 3) {
        this.pending[side] -= this.th.small; shots++;
        this._rifle(side);
      }
      this.pending[side] = Math.min(this.pending[side], 60000);
    }
  }
  _reinforce(side) {
    const alive = this.soldiers.filter(s => !s.dead && s.side === side && (s.kind || 'infantry') === 'infantry').length;
    if (alive < this.N * 1.15) this._spawnUnit(side, 'infantry', true);
  }
  _rifle(side) {
    const cands = this.soldiers.filter(s => !s.dead && s.side === side);
    if (!cands.length) return;
    let best = cands[(Math.random() * cands.length) | 0];
    for (let i = 0; i < 3; i++) {
      const c = cands[(Math.random() * cands.length) | 0];
      if (Math.abs(c.x - this.frontX(c.y)) < Math.abs(best.x - this.frontX(best.y))) best = c;
    }
    this._shoot(best);
  }
  _shoot(s) {
    const sc = this.scaleAt(s.y), dir = s.side === 'blue' ? 1 : -1;
    const sx = s.x + dir * 12 * sc, sy = s.y - 13 * sc;
    const ty = clamp(s.y + rand(-30, 30), this.laneTop, this.laneBot);
    const tx = this.frontX(ty) + dir * rand(15, 120);
    this._bullet(s.side, sx, sy, tx, ty - 10 * this.scaleAt(ty));
    this.parts.push({ type: 'glow', spr: 'fire', x: sx, y: sy, vx: 0, vy: 0, life: 0.07, max: 0.07, size: 14 * sc, add: true });
    s.recoil = 0.12;
  }

  update(rawDt) {
    const rm = !!(RM && RM.matches);
    let dt = rawDt;
    if (this.hitstop > 0 && !rm) {
      this.hitstop = Math.max(0, this.hitstop - rawDt);
      dt = rawDt * 0.12;
    }
    this.t += dt;
    let rightLine = null, leftLine = null;
    if (this.def.anchor > 0 && this.def.initialized) {
      const maxPct = this.def.step * 4;
      const macroU = clamp(this.def.pct / maxPct, -0.94, 0.94);
      const microU = Math.tanh(this.momentumS * 1.5) * 0.085;
      rightLine = this._activeWallLine('red');
      leftLine = this._activeWallLine('blue');
      const rightWall = rightLine ? rightLine.lvl * 0.25 : 0.94;
      const leftWall = leftLine ? leftLine.lvl * 0.25 : -0.94;
      const targetU = clamp(macroU + microU, leftWall + 0.02, rightWall - 0.02);
      this.frontTargetU = targetU;
      this.frontU = clamp(lerp(this.frontU, targetU, 1 - Math.exp(-dt * 2.2)), leftWall + 0.015, rightWall - 0.015);
      this.frontTarget = clamp(0.5 + targetU * 0.5, 0.04, 0.96);
      this.front = clamp(0.5 + this.frontU * 0.5, 0.04, 0.96);
      // 弹性战术运镜：价格偏离单边时把激战防线区拉向视野中心
      const targetCam = clamp(-this.frontU * this.W * 0.16, -this.W * 0.16, this.W * 0.16);
      this.camShift = lerp(this.camShift, targetCam, 1 - Math.exp(-dt * 1.8));

      for (const [, ln] of this.def.lines) {
        ln.wallStr = lerp(ln.wallStr, ln.wallTarget, 1 - Math.exp(-dt * 2.5));
        ln.hit = Math.max(0, ln.hit - dt * 2.4);
        ln.breakT = Math.max(0, ln.breakT - dt);
        ln.rebuildT = Math.max(0, ln.rebuildT - dt);
        let siegeT = 0;
        if (ln === rightLine) {
          const dist = rightWall - this.frontU;
          if (dist < 0.18) siegeT = clamp(1 - dist / 0.18, 0, 1) * (this.momentumS > 0 ? 1.15 : 0.75);
        } else if (ln === leftLine) {
          const dist = this.frontU - leftWall;
          if (dist < 0.18) siegeT = clamp(1 - dist / 0.18, 0, 1) * (this.momentumS < 0 ? 1.15 : 0.75);
        }
        ln.siege = lerp(ln.siege, clamp(siegeT, 0, 1), 1 - Math.exp(-dt * 4));
      }
      // 持续围攻防线时自动派遣攻城车
      for (const [att, ln] of [['blue', rightLine], ['red', leftLine]]) {
        if (ln && ln.siege > 0.65) {
          this._siegeAutoT[att] += dt;
          if (this._siegeAutoT[att] >= 3.2) {
            this._siegeAutoT[att] = 0;
            const has = this.soldiers.some(s => !s.dead && s.side === att && s.kind === 'siege');
            if (!has) this._spawnUnit(att, 'siege', true);
          }
        } else {
          this._siegeAutoT[att] = Math.max(0, this._siegeAutoT[att] - dt);
        }
      }
    } else {
      this.front = lerp(this.front, this.frontTarget, 1 - Math.exp(-dt * 1.4));
      this.camShift = lerp(this.camShift, 0, 1 - Math.exp(-dt * 2));
    }
    this.intensity *= Math.exp(-dt * 0.8);
    this.surgeT = this.surge ? Math.min(this.surgeT + dt * 2, 1) : Math.max(this.surgeT - dt * 1.5, 0);

    // 护盾与连击衰减
    for (const side of ['blue', 'red']) {
      const sh = this.shields[side];
      sh.str = lerp(sh.str, sh.target, 1 - Math.exp(-dt * 2.4));
      sh.hit = Math.max(0, sh.hit - dt * 2.5);
      sh.breakT = Math.max(0, sh.breakT - dt);
      const cb = this.combo[side];
      cb.pop = Math.max(0, cb.pop - dt * 4);
      if (cb.count > 0 && this.t - cb.lastAt > 5) { cb.count = 0; cb.usd = 0; }
    }

    // 城堡状态 & 三关破尽进入主堡攻城决战态
    const blueBesieged = !!(this.def.anchor > 0 && this.def.lines.get(-3)?.state === 'captured');
    const redBesieged = !!(this.def.anchor > 0 && this.def.lines.get(3)?.state === 'captured');
    const besiegedMap = { blue: blueBesieged, red: redBesieged };
    for (const side of ['blue', 'red']) {
      const f = this.forts[side], share = side === 'blue' ? this.front : 1 - this.front;
      const bes = besiegedMap[side];
      f.update(dt, share, this.surge === side, bes);
      if (f.dmg > 0.3 && Math.random() < dt * f.dmg * 2.5 * this.Q.pk) { const [x, y] = f.smokeSpot(); this._smoke(x, y, rand(6, 12) * f.k, rand(-6, 6), rand(-22, -10), rand(2, 3.5)); }
      if (bes) {
        this._ballistaT[side] += dt;
        if (this._ballistaT[side] >= 1.6) {
          this._ballistaT[side] = 0;
          const [bx, by] = f.ballistaPos();
          const enemy = side === 'blue' ? 'red' : 'blue';
          const targets = this.soldiers.filter(s => !s.dead && s.side === enemy);
          for (let b = 0; b < 2; b++) {
            const tgt = targets.length ? targets[(Math.random() * targets.length) | 0] : null;
            const ty = tgt ? tgt.y : rand(this.laneTop, this.laneBot);
            const tx = tgt ? tgt.x : this.frontX(ty);
            this._bullet(side, bx, by, tx, ty - 8 * this.scaleAt(ty), true);
          }
          this.parts.push({ type: 'glow', spr: 'gold', x: bx, y: by, vx: 0, vy: 0, life: 0.14, max: 0.14, size: 22 * f.k, add: true });
        }
      } else {
        this._ballistaT[side] = 0;
      }
    }
    if (this.surge) {
      this.lastSurge = this.surge;
      this.volleyT += dt;
      if (this.volleyT >= 1.5) { this.volleyT = 0; this._volley(this.surge); }
    } else {
      this.volleyT = 0;
    }
    this._processQueue();

    // 兵力目标（仅统计常规步兵）
    const share = { blue: this.front, red: 1 - this.front };
    for (const side of ['blue', 'red']) {
      const alive = this.soldiers.filter(s => !s.dead && s.side === side && (s.kind || 'infantry') === 'infantry');
      const target = Math.round(this.N * (0.3 + 0.9 * share[side]));
      this.popAcc[side] += dt;
      if (alive.length < target && this.popAcc[side] >= 0.16) { this.popAcc[side] = 0; this._spawnUnit(side, 'infantry', this.soldiers.length > 0); }
      if (alive.length > target + 3 && this.popAcc[side] >= 0.5) {
        this.popAcc[side] = 0;
        let f = alive[0];
        for (const s of alive) if (Math.abs(s.x - this.frontX(s.y)) < Math.abs(f.x - this.frontX(f.y))) f = s;
        f.dead = true; f.dieT = 0; f.vx = (side === 'blue' ? -1 : 1) * rand(20, 60); f.vy = -rand(30, 80);
        this.parts.push({ type: 'glow', spr: side === 'blue' ? 'red' : 'blue', x: f.x, y: f.y - 12, vx: 0, vy: 0, life: 0.2, max: 0.2, size: 26, add: true });
      }
    }

    // 轻量 Boids 同阵营邻近排斥（消除单边堆叠）
    for (const side of ['blue', 'red']) {
      const inf = this.soldiers.filter(s => !s.dead && s.side === side && (s.kind || 'infantry') === 'infantry');
      for (let i = 0; i < inf.length; i++) {
        const a = inf[i];
        for (let j = i + 1; j < inf.length; j++) {
          const b = inf[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) < 15 && Math.abs(dy) < 9) {
            const sx = (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx)) * (15 - Math.abs(dx)) * 1.15 * dt;
            const sy = (dy === 0 ? (j % 2 ? 1 : -1) : Math.sign(dy)) * (9 - Math.abs(dy)) * 1.35 * dt;
            a.x = clamp(a.x + sx, this.baseL + 10, this.baseR - 10);
            b.x = clamp(b.x - sx, this.baseL + 10, this.baseR - 10);
            a.y = clamp(a.y + sy, this.laneTop, this.laneBot);
            b.y = clamp(b.y - sy, this.laneTop, this.laneBot);
          }
        }
      }
    }

    // 多兵种移动 / 冲锋 / 撞墙 / 肉搏 / 射击
    for (const s of this.soldiers) {
      if (s.dead) {
        s.dieT += dt;
        s.x += (s.vx || 0) * dt * Math.max(0, 1 - s.dieT * 2);
        if ((s.kind || 'infantry') === 'infantry') s.rot = Math.min(s.dieT * 4, Math.PI / 2) * (s.side === 'blue' ? -1 : 1);
        continue;
      }
      if (isFinite(s.ttl)) {
        s.ttl -= dt;
        if (s.ttl <= 0) {
          s.dead = true; s.dieT = 1.4;
          this.parts.push({ type: 'glow', spr: s.kind === 'titan' ? 'gold' : s.side, x: s.x, y: s.y - 24, vx: 0, vy: 0, life: 0.35, max: 0.35, size: s.kind === 'titan' ? 68 : 34, add: true });
          continue;
        }
      }
      if (s.knockVx) {
        s.x = clamp(s.x + s.knockVx * dt, this.baseL + 12, this.baseR - 12);
        s.knockVx *= Math.exp(-dt * 7);
        if (Math.abs(s.knockVx) < 4) s.knockVx = 0;
      }
      if (s.meleeT > 0) s.meleeT = Math.max(0, s.meleeT - dt);
      if (s.ramT > 0) s.ramT = Math.max(0, s.ramT - dt);
      if (s.recoil) s.recoil = Math.max(0, s.recoil - dt);

      const kind = s.kind || 'infantry';
      const blue = s.side === 'blue', dir = blue ? 1 : -1;
      const fx = this.frontX(s.y), base = blue ? this.baseL : this.baseR;
      const surging = this.surge === s.side;
      const enemyLine = s.side === 'blue' ? rightLine : leftLine;

      if (kind === 'cavalry') {
        const tx = fx + dir * 24;
        const dx = tx - s.x, sp = s.speed * (surging ? 1.45 : 1.15);
        s.moving = Math.abs(dx) > 4;
        s.x += clamp(dx, -sp * dt, sp * dt);
        s.phase += dt * 15;
        s.facing = s.moving ? Math.sign(dx) : dir;
        if (s.moving && Math.random() < dt * 8 * this.Q.pk) {
          this._smoke(s.x - dir * 12, s.y - 2, 5, -dir * rand(14, 30), rand(-12, -4), 0.55);
        }
        if (!s.charged && (s.x - fx) * dir >= -8) {
          s.charged = true;
          this.rings.push({ x: s.x, y: s.y, r: 5, max: 32, life: 0.4, t: 0, col: colOf(s.side).glow });
          for (let i = 0; i < Math.round(7 * this.Q.pk); i++) {
            this.parts.push({ type: 'spark', x: s.x + dir * 8, y: s.y - 12, vx: dir * rand(40, 140), vy: rand(-90, -10), life: 0.35, max: 0.35, col: '#fde68a', w: 1.6 });
          }
          if (enemyLine) enemyLine.hit = Math.min(1, enemyLine.hit + 0.35);
          for (const e of this.soldiers) {
            if (!e.dead && e.side !== s.side && (e.kind || 'infantry') === 'infantry' && Math.abs(e.x - s.x) < 42 && Math.abs(e.y - s.y) < 28) {
              e.knockVx = dir * rand(90, 150);
            }
          }
        }
        continue;
      }

      if (kind === 'siege') {
        let tx = fx - dir * 6;
        if (enemyLine) {
          const wx = this.defenseX(enemyLine.lvl * 0.25, s.y, enemyLine.owner === 'blue' ? 1 : -1);
          if ((blue && wx < fx + 65) || (!blue && wx > fx - 65)) tx = wx - dir * 18;
        }
        const dx = tx - s.x;
        s.moving = Math.abs(dx) > 6;
        s.x += clamp(dx, -s.speed * dt, s.speed * dt);
        s.phase += dt * (s.moving ? 6.5 : 8.5);
        s.facing = dir;
        if (!s.moving) {
          s.ramCool -= dt;
          if (s.ramCool <= 0) {
            s.ramCool = 1.35;
            s.ramT = 0.28;
            if (enemyLine) enemyLine.hit = Math.min(1, enemyLine.hit + 0.55);
            const hitX = s.x + dir * 24 * this.scaleAt(s.y);
            this.rings.push({ x: hitX, y: s.y - 8, r: 4, max: 28, life: 0.38, t: 0, col: [253, 230, 138] });
            for (let i = 0; i < Math.round(6 * this.Q.pk); i++) {
              this.parts.push({ type: 'spark', x: hitX, y: s.y - 12, vx: -dir * rand(30, 100), vy: rand(-110, -20), life: 0.38, max: 0.38, col: '#fde68a', w: 1.7 });
            }
            this.shake = Math.max(this.shake, 2.2);
          }
        }
        continue;
      }

      if (kind === 'titan') {
        const tx = fx - dir * 34;
        const dx = tx - s.x;
        s.moving = Math.abs(dx) > 5;
        s.x += clamp(dx, -s.speed * dt, s.speed * dt);
        s.phase += dt * (s.moving ? 5.5 : 3);
        s.facing = dir;
        s.cool -= dt;
        if (s.cool <= 0) {
          s.cool = 1.1;
          const sc = this.scaleAt(s.y);
          const bx = s.x + dir * 24 * sc, by = s.y - 46 * sc;
          const ty = clamp(s.y + rand(-24, 24), this.laneTop, this.laneBot);
          this._bullet(s.side, bx, by, fx + dir * rand(40, 140), ty - 10 * this.scaleAt(ty), true);
          this.parts.push({ type: 'glow', spr: 'gold', x: bx, y: by, vx: 0, vy: 0, life: 0.14, max: 0.14, size: 22 * sc, add: true });
        }
        continue;
      }

      const depth = surging ? s.d * 0.35 : s.d;
      let tx = fx - dir * (12 + depth * Math.abs(fx - base) * 0.82);
      if (!surging && s.garrison && this.def.anchor > 0) {
        const friendlyWall = this._nearestIntactBehind(s.side, s.y, fx);
        if (friendlyWall != null) tx = friendlyWall - dir * (10 + s.d * 22);
      }
      if (surging) tx += dir * 10 * Math.sin(this.t * 3 + s.phase);
      const behind = (s.x - fx) * dir > 8;
      const dx = tx - s.x, sp = s.speed * (surging ? 2.2 : 1) * (behind ? 2.8 : Math.abs(dx) > 80 ? 1.6 : 1);
      s.moving = Math.abs(dx) > 3;
      s.x += clamp(dx, -sp * dt, sp * dt);
      s.phase += dt * (s.moving ? 11 : 2.5) * (surging ? 1.4 : 1);
      s.facing = s.moving ? Math.sign(dx) : dir;
      const nearFront = Math.abs(s.x - fx) < 70;
      s.cool -= dt * (this.activity[s.side] || 0);
      if (!nearFront && s.cool < 0) s.cool = 0;
      if (nearFront && s.cool <= 0) { this._shoot(s); s.cool = rand(0.9, 1.8); }
      // 最前线近战盾击火花
      if (Math.abs(s.x - fx) < 26 && s.meleeT <= 0 && Math.random() < dt * (0.35 + (this.activity[s.side] || 0) * 1.4)) {
        s.meleeT = 0.24;
        const sc = this.scaleAt(s.y);
        for (let i = 0; i < 2; i++) {
          this.parts.push({ type: 'spark', x: fx, y: s.y - 13 * sc, vx: rand(-70, 70), vy: rand(-90, -15), life: 0.22, max: 0.22, col: Math.random() < 0.6 ? '#fef3c7' : '#ffffff', w: 1.5 });
        }
      }
    }
    this.soldiers = this.soldiers.filter(s => !s.dead || s.dieT < 2.2);

    // 子弹
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (this.def.anchor > 0 && b.life > 0) {
        const wall = b.side === 'blue' ? rightLine : leftLine;
        if (wall) {
          const wy = clamp(b.y, this.laneTop, this.laneBot);
          const wx = this.defenseX(wall.lvl * 0.25, wy, wall.owner === 'blue' ? 1 : -1);
          if ((b.side === 'blue' && b.x >= wx - 4) || (b.side === 'red' && b.x <= wx + 4)) {
            b.x = wx; b.life = 0;
            wall.hit = Math.min(1, wall.hit + 0.22);
            for (let i = 0; i < 2; i++) this.parts.push({ type: 'spark', x: b.x, y: b.y, vx: rand(-60, 60), vy: rand(-90, -15), life: rand(0.14, 0.28), max: 0.28, col: colOf(wall.owner).light, w: 1.3 });
          }
        }
      }
      if (b.life <= 0) {
        for (let i = 0; i < 4; i++) this.parts.push({ type: 'spark', x: b.x, y: b.y, vx: rand(-80, 80), vy: rand(-110, -20), life: rand(0.15, 0.35), max: 0.35, col: colOf(b.side).light, w: 1.2 });
        if (Math.random() < 0.06) this._killNear(b.side === 'blue' ? 'red' : 'blue', b.x, b.y + 10, 9);
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    if (this.bullets.length > 400) this.bullets.splice(0, this.bullets.length - 400);

    // 炮弹
    for (const s of this.shells) {
      s.t += dt; const k = Math.min(s.t / s.T, 1);
      const px = s.x, py = s.y;
      s.x = lerp(s.sx, s.tx, k); s.y = lerp(s.sy, s.ty, k) - s.h * 4 * k * (1 - k);
      s.ang = Math.atan2(s.y - py, s.x - px);
      const trailN = s.kind === 'heavy' ? 2 : 1;
      for (let i = 0; i < trailN; i++) {
        this.parts.push({ type: 'glow', spr: s.side, x: s.x + rand(-2, 2), y: s.y + rand(-2, 2), vx: rand(-10, 10), vy: rand(-10, 10), life: 0.35, max: 0.35, size: s.kind === 'heavy' ? 18 : 12, add: true });
        if (s.kind !== 'shell' && Math.random() < 0.6) this._smoke(s.x, s.y, 7, rand(-8, 8), rand(-8, 4), 1.2);
      }
      if (k >= 1) {
        s.done = true;
        const power = s.kind === 'heavy' ? clamp(3 + Math.log10(s.usd / this.th.heavy) * 3, 3, 5.5) : clamp(1 + Math.log10(s.usd / this.th.shell) * 2, 1, 2.8);
        this.explode(s.x, s.y, s.side, power);
        const lvl = s.kind === 'heavy' ? 2 : 1;
        this.texts.push({ x: s.x + rand(-10, 10), y: s.y - 24, vx: rand(-14, 14), txt: '-' + fmtUsd(s.usd), side: s.side, life: 1.4 + lvl * 0.3, max: 1.4 + lvl * 0.3, lvl });
      }
    }
    this.shells = this.shells.filter(s => !s.done);

    // 符文天基裁决光柱
    for (const st of this.strikes) {
      st.t += dt;
      if (st.phase === 'lock' && st.t >= st.lockDur) {
        st.phase = 'beam';
        st.t = 0;
        const power = st.tier === 2 ? clamp(6 + Math.log10(st.usd / this.th.whale) * 4, 6, 10) : clamp(3.2 + Math.log10(st.usd / this.th.heavy) * 2.5, 3.2, 5.8);
        this.explode(st.tx, st.ty, st.side, power, { whale: st.tier === 2 });
        if (st.tier === 2) {
          this.texts.push({ x: st.tx, y: st.ty - 28, vx: rand(-10, 10), txt: tr('crit') + fmtUsd(st.usd), side: st.side, life: 2.3, max: 2.3, lvl: 3 });
          if (!rm) {
            this.hitstop = Math.max(this.hitstop, 0.035);
            this.zoom = Math.max(this.zoom, 1.06);
            this.zoomX = clamp(st.tx / this.W, 0.15, 0.85);
            this.zoomY = clamp(st.ty / this.H, 0.35, 0.85);
          }
          this.shake = Math.max(this.shake, 22);
        }
      }
    }
    this.strikes = this.strikes.filter((st) => st.phase === 'lock' || st.t < st.beamDur);

    // 爆仓紫纹裂隙冒火花
    for (const f of this.fissures) {
      f.life -= dt;
      if (Math.random() < dt * 4 * this.Q.pk) {
        this.parts.push({ type: 'spark', x: f.x + rand(-18, 18), y: f.y + rand(-3, 3), vx: rand(-24, 24), vy: rand(-60, -20), life: rand(0.25, 0.5), max: 0.5, col: '#e9d5ff', w: 1.3 });
      }
    }
    this.fissures = this.fissures.filter((f) => f.life > 0);

    // 前线火花
    const rate = this.intensity * 14;
    if (Math.random() < rate * dt) {
      const y = rand(this.laneTop, this.laneBot), x = this.frontX(y);
      for (let i = 0; i < 3; i++) this.parts.push({ type: 'spark', x, y: y - rand(0, 20), vx: rand(-90, 90), vy: rand(-140, -30), life: rand(0.3, 0.6), max: 0.6, col: Math.random() < 0.5 ? '#bcd4ff' : '#ffc0b8', w: 1.4 });
      if (Math.random() < 0.3) this._smoke(x, y - 10, rand(8, 16));
    }

    // 粒子、烟雾、涟漪、云雾、闪电
    for (const p of this.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'spark' || p.type === 'debris') { p.vy += 320 * dt; p.vx *= 0.985; }
      if (p.type === 'debris') { p.rot += p.vr * dt; if (p.y > this.H) p.life = 0; }
    }
    this.parts = this.parts.filter(p => p.life > 0);
    if (this.parts.length > this.Q.parts) this.parts.splice(0, this.parts.length - this.Q.parts);
    for (const s of this.smoke) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.99; s.size += dt * 10; }
    this.smoke = this.smoke.filter(s => s.life > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter(r => r.t < r.life);
    for (const t of this.texts) { t.life -= dt; t.y -= dt * (22 + t.lvl * 6); t.x += (t.vx || 0) * dt; }
    const cloudMul = this.atmo.storm ? 1.45 : 1;
    for (const c of this.clouds) { c.x += c.v * cloudMul * dt; if (c.x - c.w / 2 > this.W + 120) c.x = -c.w / 2 - 120; }
    for (const f of this.fog) { f.x += f.v * dt; if (f.x > this.W + 250) f.x = -250; if (f.x < -250) f.x = this.W + 250; }
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter(b => b.life > 0);
    if (this.surgeT > 0.5 && Math.random() < dt * 0.35) this._bolt(this.lastSurge, false);
    else if (this.atmo.storm && Math.random() < dt * (this.atmo.overlap ? 0.24 : 0.11)) this._bolt(Math.random() < 0.5 ? 'blue' : 'red', true);
    if (this.celebrateT > 0) { this.celebrateT -= dt; if (Math.random() < dt * 4) this._firework(this.celebrateSide); }
    this.zoom = 1 + (this.zoom - 1) * Math.exp(-dt * 4);
    this.zoomX = lerp(this.zoomX, 0.5, 1 - Math.exp(-dt * 3));
    this.zoomY = lerp(this.zoomY, 0.65, 1 - Math.exp(-dt * 3));
    this.texts = this.texts.filter(t => t.life > 0);
    for (const s of this.scorch) s.life -= dt;
    this.scorch = this.scorch.filter(s => s.life > 0);
    const emberSp = this.atmo.fng <= 35 ? 1.45 : 1;
    for (const e of this.embers) { e.x += (e.vx + Math.sin(this.t + e.ph) * 6) * dt; e.y += e.vy * emberSp * dt; if (e.y < -5) Object.assign(e, this._ember(false)); }

    if (this.surgeT > 0.2 && Math.random() < dt * 30 * this.surgeT) {
      const side = this.lastSurge || this.surge || 'blue', dir = side === 'blue' ? 1 : -1;
      this.streaks.push({ x: dir > 0 ? -100 : this.W + 100, y: rand(this.H * 0.15, this.H * 0.95), v: dir * rand(900, 1500), len: rand(60, 180), side, life: 1.5 });
    }
    for (const s of this.streaks) { s.x += s.v * dt; s.life -= dt; }
    this.streaks = this.streaks.filter(s => s.life > 0);

    this.shake *= Math.exp(-dt * 7); this.flash *= Math.exp(-dt * 5);
    if (rm) { this.shake = 0; this.zoom = 1; this.flash = Math.min(this.flash, 0.12); }
  }

  // ---------- 绘制 ----------
  draw() {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.save(); ctx.translate(sx, sy);
    if (this.zoom > 1.001) {
      const zx = W * this.zoomX, zy = H * this.zoomY;
      ctx.translate(zx, zy); ctx.scale(this.zoom, this.zoom); ctx.translate(-zx, -zy);
    }
    ctx.drawImage(this._bg, -6, -6, W + 12, H + 12);

    const cam = (this.front - 0.5) * 120;
    this._drawCelestial(cam);
    this._drawClouds(cam * 0.15);
    ctx.drawImage(this._mtnFar, -this.PAD - cam * 0.25, 0, W + this.PAD * 2, this.horizon + 4);
    ctx.drawImage(this._mtnNear, -this.PAD - cam * 0.5, 0, W + this.PAD * 2, this.horizon + 4);
    this._drawLightning(false);
    if (this.Q.fog) for (const f of this.fog) {
      ctx.globalAlpha = f.a; ctx.drawImage(this.sprites.smoke, f.x - f.w / 2 - cam * 0.6, this.horizon - f.h * 0.45, f.w, f.h);
    }
    ctx.globalAlpha = 1;

    // 领地色调
    const fx = this.frontX(this.H * 0.7);
    ctx.drawImage(this._tintB, 0, this.horizon - 40, fx, H);
    ctx.drawImage(this._tintR, fx, this.horizon - 40, W - fx, H);

    // 弹坑与爆仓紫纹裂隙
    for (const s of this.scorch) {
      const a = Math.min(1, s.life / 4) * 0.55;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, s.r, s.r * 0.32, 0, 0, TAU); ctx.fill();
    }
    this._drawFissures();
    this._drawLiqZones();
    this._drawDefenseLinesGround();

    const rm = !!(RM && RM.matches);
    this._drawPremiumBeacon();
    this.forts.blue.label = tr('flagL'); this.forts.red.label = tr('flagS');
    this.forts.blue.draw(ctx, this.t, this.sprites, this.q, rm);
    this.forts.red.draw(ctx, this.t, this.sprites, this.q, rm);
    this._drawRuneShield('blue');
    this._drawRuneShield('red');
    this._drawFrontLine();

    // 士兵按 y 排序（远小近大）
    this.soldiers.sort((a, b) => a.y - b.y);
    for (const s of this.soldiers) this._drawSoldier(s);
    this._drawDefenseLinesOverlay();
    this._drawOrderWalls();

    // 烟雾
    for (const s of this.smoke) {
      const a = Math.min(1, s.life / s.max * 1.4) * 0.8;
      ctx.globalAlpha = a; ctx.drawImage(this.sprites.smoke, s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
    }
    ctx.globalAlpha = 1;

    // 发光层（叠加混合）
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bullets) {
      const len = b.big ? 0.045 : 0.03;
      ctx.strokeStyle = b.side === 'blue' ? 'rgba(147,197,253,0.95)' : 'rgba(252,165,165,0.95)';
      ctx.lineWidth = b.big ? 2.8 : 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * len, b.y - b.vy * len); ctx.stroke();
      ctx.drawImage((this.sprites[b.side] || this.sprites.blue), b.x - (b.big ? 9 : 6), b.y - (b.big ? 9 : 6), b.big ? 18 : 12, b.big ? 18 : 12);
    }
    for (const p of this.parts) {
      const k = clamp(p.life / p.max, 0, 1);
      if (p.type === 'glow') {
        const sz = p.size * (p.grow ? 1 + (1 - k) * p.grow : 1);
        ctx.globalAlpha = k; ctx.drawImage((this.sprites[p.spr] || this.sprites.white), p.x - sz / 2, p.y - sz / 2, sz, sz);
      } else if (p.type === 'spark') {
        ctx.globalAlpha = k; ctx.strokeStyle = p.col; ctx.lineWidth = p.w;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      }
    }
    for (const s of this.shells) {
      const big = s.kind === 'heavy' ? 2 : 1.3;
      ctx.globalAlpha = 1;
      ctx.drawImage(this.sprites.white, s.x - 8 * big, s.y - 8 * big, 16 * big, 16 * big);
      ctx.drawImage((this.sprites[s.side] || this.sprites.blue), s.x - 16 * big, s.y - 16 * big, 32 * big, 32 * big);
    }
    this._drawStrikes();
    for (const r of this.rings) {
      const k = r.t / r.life, rad = lerp(r.r, r.max, 1 - Math.pow(1 - k, 3));
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = `rgb(${r.col.join(',')})`; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.4, 0, 0, TAU); ctx.stroke();
    }
    this._drawLightning(true);
    for (const s of this.streaks) {
      const c = colOf(s.side).glow;
      const gr = ctx.createLinearGradient(s.x, 0, s.x - Math.sign(s.v) * s.len, 0);
      gr.addColorStop(0, `rgba(${c.join(',')},${0.55 * this.surgeT})`); gr.addColorStop(1, `rgba(${c.join(',')},0)`);
      ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.sign(s.v) * s.len, s.y); ctx.stroke();
    }
    for (const e of this.embers) {
      ctx.globalAlpha = e.a * (0.6 + 0.4 * Math.sin(this.t * 3 + e.ph));
      ctx.fillStyle = this.atmo.fng <= 35 && Math.random() < 0.35 ? '#f87171' : e.x < fx ? '#93c5fd' : '#fca5a5';
      ctx.fillRect(e.x, e.y, e.s, e.s);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a2a35';
    for (const p of this.parts) if (p.type === 'debris') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); ctx.restore();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const age = t.max - t.life, pop = age < 0.18 ? 0.6 + (age / 0.18) * 0.7 : age < 0.3 ? 1.3 - (age - 0.18) / 0.12 * 0.3 : 1;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      const fs = [0, 13, 17, 26][t.lvl || 1] * pop;
      ctx.font = `900 ${fs}px "JetBrains Mono", monospace`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.col || (t.lvl === 3 ? '#fde68a' : t.side === 'blue' ? '#bfdbfe' : '#fecaca'); ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 冲锋氛围、闪光、暗角、屏幕空间连击徽章
    if (this.surgeT > 0) {
      const c = COL[this.lastSurge || 'blue'].glow, pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(${c.join(',')},${(0.22 + 0.12 * pulse) * this.surgeT})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (this.flash > 0.01) { ctx.fillStyle = `rgba(${this.flashCol},${this.flash})`; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(this._vig, 0, 0, W, H);
    this._drawCombos();
  }

  _drawPremiumBeacon() {
    const prem = this.atmo.cbPremUsd;
    if (Math.abs(prem) < 30) return;
    const { ctx, t } = this;
    const side = prem > 0 ? 'blue' : 'red';
    const f = this.forts[side];
    if (!f || !f.flagAt) return;
    const [fx0] = f.flagAt;
    const px = f.X(fx0), py = f.gy - 190 * f.k;
    const k = clamp((Math.abs(prem) - 30) / 140, 0.25, 1) * (0.75 + 0.25 * Math.sin(t * 2.6));
    const g = ctx.createLinearGradient(0, 0, 0, py + 40);
    const col = side === 'blue' ? '96,165,250' : '248,113,113';
    g.addColorStop(0, `rgba(${col},0)`);
    g.addColorStop(0.6, `rgba(${col},${0.16 * k})`);
    g.addColorStop(1, `rgba(253,230,138,${0.32 * k})`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(px - 18 * f.k, 0, 36 * f.k, py + 40);
    ctx.restore();
  }

  _drawRuneShield(side) {
    const { ctx, t } = this;
    const f = this.forts[side], sh = this.shields[side];
    if (!f || !f.body) return;
    const k = f.k, dir = f.dir, c = colOf(side);
    const sx = f.X(52 * k);
    const yTop = f.gy - 115 * k, yBot = f.gy + 8 * k, yMid = (yTop + yBot) * 0.5;
    const arcX = sx + dir * 24 * k;
    const alpha = clamp(sh.str * 0.7 + sh.hit * 0.35, 0.14, 0.95);
    const pulse = 0.85 + 0.15 * Math.sin(t * 3 + (side === 'blue' ? 0 : 2));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 外层符文光晕弧
    ctx.strokeStyle = `rgba(${c.glow.join(',')},${0.22 * alpha * pulse})`;
    ctx.lineWidth = (7 + sh.str * 6) * k;
    ctx.beginPath(); ctx.moveTo(sx - dir * 6 * k, yTop); ctx.quadraticCurveTo(arcX, yMid, sx - dir * 4 * k, yBot); ctx.stroke();

    // 内层锐利能量弧
    ctx.strokeStyle = sh.hit > 0.2 ? `rgba(255,255,255,${0.85 * alpha})` : `rgba(${c.glow.join(',')},${0.78 * alpha * pulse})`;
    ctx.lineWidth = (1.6 + sh.str * 1.2) * k;
    ctx.beginPath(); ctx.moveTo(sx - dir * 6 * k, yTop); ctx.quadraticCurveTo(arcX, yMid, sx - dir * 4 * k, yBot); ctx.stroke();

    // 弧面符文菱形节点
    for (let i = 1; i <= 5; i++) {
      const q = i / 6, u = 1 - q;
      const rx = u * u * (sx - dir * 6 * k) + 2 * u * q * arcX + q * q * (sx - dir * 4 * k);
      const ry = u * u * yTop + 2 * u * q * yMid + q * q * yBot;
      const rs = (2.2 + 1.2 * Math.sin(t * 4 + i)) * k;
      ctx.fillStyle = `rgba(253,230,138,${0.55 * alpha})`;
      ctx.beginPath(); ctx.moveTo(rx, ry - rs); ctx.lineTo(rx + rs * 0.7, ry); ctx.lineTo(rx, ry + rs); ctx.lineTo(rx - rs * 0.7, ry); ctx.closePath(); ctx.fill();
    }

    // 护盾受击或崩裂裂纹
    if (sh.breakT > 0) {
      const bk = sh.breakT / 0.85;
      ctx.strokeStyle = `rgba(253,230,138,${0.9 * bk})`;
      ctx.lineWidth = 2.2 * k;
      ctx.beginPath();
      ctx.moveTo(arcX - dir * 6 * k, yMid - 28 * k);
      ctx.lineTo(arcX + dir * 4 * k, yMid - 8 * k);
      ctx.lineTo(arcX - dir * 8 * k, yMid + 10 * k);
      ctx.lineTo(arcX + dir * 3 * k, yMid + 28 * k);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawFissures() {
    const { ctx } = this;
    if (!this.fissures.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.fissures) {
      const k = clamp(f.life / f.max, 0, 1);
      for (const [w, col] of [[6, `rgba(168,85,247,${0.35 * k})`], [2.2, `rgba(216,180,254,${0.8 * k})`], [0.9, `rgba(255,255,255,${0.85 * k})`]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        f.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawStrikes() {
    const { ctx, t } = this;
    for (const st of this.strikes) {
      const c = colOf(st.side);
      if (st.phase === 'lock') {
        const k = clamp(st.t / st.lockDur, 0, 1);
        const rad = (st.tier === 2 ? 46 : 30) * (1.5 - 0.65 * k);
        ctx.save();
        ctx.translate(st.tx, st.ty);
        ctx.scale(1, 0.38);
        ctx.globalAlpha = 0.45 + 0.55 * k;
        // 外环旋转
        ctx.save();
        ctx.rotate(t * 4.5);
        ctx.strokeStyle = st.tier === 2 ? '#fde68a' : c.light;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([10, 7]);
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.stroke();
        ctx.restore();
        // 内环逆向旋转 + 十字刻度
        ctx.save();
        ctx.rotate(-t * 6);
        ctx.strokeStyle = c.light;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, rad * 0.62, 0, TAU); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI * 0.5;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * rad * 0.3, Math.sin(a) * rad * 0.3); ctx.lineTo(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 1.15); ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
      } else {
        const k = clamp(st.t / st.beamDur, 0, 1);
        const fade = Math.pow(1 - k, 1.4);
        const bw = (st.tier === 2 ? 42 : 22) * (1 - k * 0.45);
        const g = ctx.createLinearGradient(st.tx - bw, 0, st.tx + bw, 0);
        g.addColorStop(0, `rgba(${c.glow.join(',')},0)`);
        g.addColorStop(0.32, `rgba(${c.glow.join(',')},${0.65 * fade})`);
        g.addColorStop(0.5, `rgba(255,255,255,${0.95 * fade})`);
        g.addColorStop(0.68, `rgba(${c.glow.join(',')},${0.65 * fade})`);
        g.addColorStop(1, `rgba(${c.glow.join(',')},0)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(st.tx - bw, 0, bw * 2, st.ty + 6);
        ctx.drawImage(this.sprites.white, st.tx - bw * 1.4, st.ty - bw * 0.8, bw * 2.8, bw * 1.6);
        ctx.drawImage(this.sprites[st.side], st.tx - bw * 2.1, st.ty - bw * 1.2, bw * 4.2, bw * 2.4);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawFrontLine() {
    const { ctx, t } = this; const top = this.horizon - 10, bot = this.H;
    const pts = [];
    for (let y = top; y <= bot; y += 6) pts.push([this.frontX(y), y]);
    const fy = this.H * 0.72, x0 = this.frontX(fy);
    const push = clamp((this.front - 0.5) * 2.4, -1, 1);
    const energy = clamp(0.45 + this.intensity * 0.12 + this.surgeT * 0.4, 0.45, 1.3);

    ctx.globalCompositeOperation = 'lighter';
    const passes = [[22, 0.1], [6, 0.46], [1.6, 0.92]];
    for (const [w, a] of passes) {
      const g = ctx.createLinearGradient(x0 - 24, 0, x0 + 24, 0);
      g.addColorStop(0, `rgba(80,150,255,${a})`); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, `rgba(255,80,70,${a})`);
      ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }

    // 交锋闪电电弧（随战况活跃度剧烈跳动）
    const arcAmp = 4 + this.intensity * 1.4 + this.surgeT * 5;
    for (let a = 0; a < 2; a++) {
      ctx.strokeStyle = a === 0 ? `rgba(147,197,253,${0.48 * energy})` : `rgba(252,165,165,${0.48 * energy})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const [bx, by] = pts[i];
        const j = Math.sin(by * 0.14 + t * (16 + a * 7) + a * 3) * arcAmp + push * 4;
        if (i === 0) ctx.moveTo(bx + j, by); else ctx.lineTo(bx + j, by);
      }
      ctx.stroke();
    }

    // 前线能量对波漩涡
    const vr = (26 + this.intensity * 3 + this.surgeT * 10);
    ctx.save();
    ctx.translate(x0, fy);
    ctx.drawImage(this.sprites.blue, -vr * 1.7 + push * 8, -vr * 1.5, vr * 2.5, vr * 3);
    ctx.drawImage(this.sprites.red, -vr * 0.8 + push * 8, -vr * 1.5, vr * 2.5, vr * 3);
    ctx.drawImage(this.sprites.white, -vr * 0.85, -vr * 0.85, vr * 1.7, vr * 1.7);
    ctx.scale(0.65, 1.15);
    for (let ring = 0; ring < 2; ring++) {
      ctx.save();
      ctx.rotate(t * (ring === 0 ? 4.5 : -6.2));
      ctx.strokeStyle = ring === 0 ? 'rgba(147,197,253,0.75)' : 'rgba(252,165,165,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, vr * (0.55 + ring * 0.28), 0, Math.PI * 1.25); ctx.stroke();
      ctx.strokeStyle = 'rgba(253,230,138,0.65)';
      ctx.beginPath(); ctx.arc(0, 0, vr * (0.55 + ring * 0.28), Math.PI, Math.PI * 2.15); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  _drawSoldier(s) {
    const { ctx } = this; const c = colOf(s.side); const sc = this.scaleAt(s.y);
    const kind = s.kind || 'infantry';
    const spec = UNIT_SPEC[kind] || UNIT;
    const fade = s.dead ? clamp(1 - (s.dieT - 1.2), 0, 1) : 1;
    if (fade <= 0) return;
    const face = s.facing || (s.side === 'blue' ? 1 : -1);
    const sidePack = this.units[s.side] || this.units.blue;
    const set = sidePack[kind] || sidePack;
    const moving = s.moving && !s.dead;
    const frames = spec.FRAMES || UNIT.FRAMES;
    const spr = moving ? set.walk[((Math.floor(s.phase / TAU * frames) % frames) + frames) % frames] : set.idle;

    if (kind === 'titan' && !s.dead) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.72 + 0.28 * Math.sin(this.t * 4);
      ctx.globalAlpha = fade * 0.42 * pulse;
      ctx.drawImage(this.sprites.gold, s.x - 44 * sc, s.y - 24 * sc, 88 * sc, 48 * sc);
      ctx.strokeStyle = `rgba(253,230,138,${0.55 * fade * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 26 * sc, 8 * sc, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    ctx.save(); ctx.globalAlpha = fade;
    ctx.translate(s.x, s.y);
    const shW = kind === 'titan' ? 24 : kind === 'siege' ? 22 : kind === 'cavalry' ? 18 : 9;
    ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.beginPath(); ctx.ellipse(0, 0, shW * sc, Math.max(2.8, shW * 0.3) * sc, 0, 0, TAU); ctx.fill();
    ctx.scale(sc * face, sc);
    if (s.dead) { ctx.rotate(-Math.abs(s.rot)); ctx.globalAlpha = fade * 0.85; }
    const bob = s.dead ? 0 : (moving ? 0 : Math.sin(s.phase) * 0.45);
    const rc = (s.recoil ? s.recoil * 10 : 0) - (s.meleeT ? Math.sin(s.meleeT / 0.24 * Math.PI) * 5 : 0) - (s.ramT ? Math.sin(s.ramT / 0.28 * Math.PI) * 8 : 0);
    ctx.translate(-rc * 0.25, -bob);
    if (s.banner && !s.dead && kind === 'infantry') drawStandard(ctx, c, this.t, s.phase * 0.3, s.side === 'blue');
    ctx.drawImage(spr, -spec.OX, -spec.OY, spec.W, spec.H);
    ctx.restore();
    if (this.surge === s.side && !s.dead && kind === 'infantry') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 * this.surgeT;
      ctx.drawImage(this.sprites[s.side], s.x - 15 * sc, s.y - 36 * sc, 30 * sc, 42 * sc);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  _drawCombos() {
    const { ctx, W } = this;
    for (const side of ['blue', 'red']) {
      const cb = this.combo[side];
      if (cb.count < 2) continue;
      const age = this.t - cb.lastAt;
      const fade = clamp(1 - Math.max(0, age - 3.6) / 1.4, 0, 1);
      if (fade <= 0.01) continue;
      const txt = tr('combo', cb.count, fmtUsd(cb.usd));
      const pop = 1 + cb.pop * 0.25;
      const isBlue = side === 'blue';
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = `800 12px "JetBrains Mono", -apple-system, sans-serif`;
      const tw = ctx.measureText(txt).width;
      const pw = tw + 18, ph = 24;
      const ax = isBlue ? 14 : W - 14;
      const ay = 54;
      ctx.translate(ax, ay);
      ctx.scale(pop, pop);
      const bx = isBlue ? 0 : -pw;
      ctx.fillStyle = isBlue ? 'rgba(15,28,60,0.82)' : 'rgba(55,15,20,0.82)';
      ctx.strokeStyle = isBlue ? 'rgba(96,165,250,0.7)' : 'rgba(248,113,113,0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, 0, pw, ph, 8); else ctx.rect(bx, 0, pw, ph);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isBlue ? '#bfdbfe' : '#fecaca';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + pw / 2, ph / 2 + 0.5);
      ctx.restore();
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  _lineCurve(u, bowDir, y0, y1, steps = 10) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const y = lerp(y0, y1, i / steps);
      pts.push([this.defenseX(u, y, bowDir), y]);
    }
    return pts;
  }

  _drawDefenseLinesGround() {
    if (!(this.def.anchor > 0)) return;
    const { ctx } = this;
    const y0 = this.horizon + 2, y1 = this.H - 2;
    const activeRed = this._activeWallLine('red');
    const activeBlue = this._activeWallLine('blue');

    ctx.save();
    // 0% 中轴基准线（随弹性镜头同步透视偏移）
    const midPts = this._lineCurve(0, 0, y0, y1, 8);
    ctx.strokeStyle = 'rgba(4,6,14,0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath(); midPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = 'rgba(253,230,138,0.28)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); midPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.setLineDash([]);

    for (const lvl of [-3, -2, -1, 1, 2, 3]) {
      const ln = this.def.lines.get(lvl);
      if (!ln) continue;
      const bowDir = ln.owner === 'blue' ? 1 : -1;
      const pts = this._lineCurve(lvl * 0.25, bowDir, y0, y1, 10);
      const isContested = (activeRed && lvl === activeRed.lvl) || (activeBlue && lvl === activeBlue.lvl);
      if (ln.state === 'intact') {
        const c = colOf(ln.owner);
        ctx.strokeStyle = 'rgba(4,6,14,0.68)';
        ctx.lineWidth = 4.5 + ln.wallStr * 4.5;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();

        ctx.strokeStyle = `rgba(${c.glow.join(',')},${isContested ? 0.44 : 0.18})`;
        ctx.lineWidth = 1.4 + ln.wallStr * 1.1;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();

        // 地面符文石桩（3 枚按透视缩放）
        for (const p of [0.24, 0.56, 0.86]) {
          const py = lerp(this.laneTop, this.laneBot, p);
          const px = this.defenseX(lvl * 0.25, py, bowDir);
          const sc = this.scaleAt(py);
          ctx.fillStyle = '#0c101d';
          ctx.beginPath();
          ctx.ellipse(px, py + 1.5 * sc, (4 + ln.wallStr * 2) * sc, 2 * sc, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = ln.wallStr > 0.25 ? '#fde68a' : c.light;
          ctx.globalAlpha = isContested ? 0.85 : 0.45;
          ctx.beginPath();
          ctx.arc(px, py - 2 * sc, (1.7 + ln.wallStr * 0.8) * sc, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        const att = ln.owner === 'blue' ? 'red' : 'blue';
        const ac = colOf(att);
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = 'rgba(8,10,18,0.58)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.strokeStyle = `rgba(${ac.glow.join(',')},0.22)`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  _drawDefenseLinesOverlay() {
    if (!(this.def.anchor > 0)) return;
    const { ctx, t } = this;
    const rm = !!(RM && RM.matches);
    const activeRed = this._activeWallLine('red');
    const activeBlue = this._activeWallLine('blue');
    const targetLvl = this.def.pct >= 0 ? (activeRed ? activeRed.lvl : 3) : (activeBlue ? activeBlue.lvl : -3);
    const yTop = this.laneTop - 10, yBot = this.laneBot + 8;

    ctx.save();
    for (const lvl of [-3, -2, -1, 1, 2, 3]) {
      const ln = this.def.lines.get(lvl);
      if (!ln) continue;
      const u = lvl * 0.25;
      const bowDir = ln.owner === 'blue' ? 1 : -1;
      const c = colOf(ln.owner);

      if (ln.state === 'intact') {
        const isContested = (activeRed && lvl === activeRed.lvl) || (activeBlue && lvl === activeBlue.lvl);
        const pts = this._lineCurve(u, bowDir, yTop, yBot, 10);
        const rebuildK = ln.rebuildT > 0 ? clamp(1 - ln.rebuildT / 0.85, 0.25, 1) : 1;

        if (!isContested && ln.rebuildT <= 0) {
          // 纵深预备防线：低矮淡光栏，保持画面通透
          const alpha = 0.16 + ln.wallStr * 0.14;
          ctx.strokeStyle = `rgba(${c.glow.join(',')},${alpha})`;
          ctx.lineWidth = 1.2 + ln.wallStr * 0.8;
          ctx.beginPath();
          pts.forEach(([x, y], i) => {
            const yy = y - 8 * this.scaleAt(y);
            if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
          });
          ctx.stroke();
        } else {
          // 当前正面交锋防线：完整升起半透明符文护盾墙 + 盘口厚甲加固纹
          const hBase = 24 * rebuildK;
          const alpha = clamp(0.28 + ln.siege * 0.44 + ln.wallStr * 0.26 + ln.hit * 0.38, 0.24, 0.95);
          const pulse = rm ? 1 : (0.88 + 0.12 * Math.sin(t * (3.2 + ln.siege * 6) + lvl));

          // 能量光幕填充
          const midX = this.defenseX(u, (yTop + yBot) * 0.5, bowDir);
          const cg = ctx.createLinearGradient(midX - 18, 0, midX + 18, 0);
          cg.addColorStop(0, `rgba(${c.glow.join(',')},0)`);
          cg.addColorStop(0.5, `rgba(${c.glow.join(',')},${0.22 * alpha * pulse})`);
          cg.addColorStop(1, `rgba(${c.glow.join(',')},0)`);
          ctx.fillStyle = cg;
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          for (let i = pts.length - 1; i >= 0; i--) {
            const [x, y] = pts[i];
            ctx.lineTo(x, y - hBase * this.scaleAt(y));
          }
          ctx.closePath();
          ctx.fill();

          if (this.q < 2) ctx.globalCompositeOperation = 'lighter';
          // 顶部能量脊线（受击闪白）
          if (this.q < 2) {
            ctx.strokeStyle = `rgba(${c.glow.join(',')},${0.22 * alpha * pulse})`;
            ctx.lineWidth = (5 + ln.wallStr * 4) * rebuildK;
            ctx.beginPath();
            pts.forEach(([x, y], i) => {
              const yy = y - hBase * this.scaleAt(y);
              if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
            });
            ctx.stroke();
          }
          ctx.strokeStyle = ln.hit > 0.25
            ? `rgba(255,255,255,${0.88 * alpha})`
            : `rgba(${c.glow.join(',')},${0.72 * alpha * pulse})`;
          ctx.lineWidth = (1.5 + ln.wallStr * 1.3) * rebuildK;
          ctx.beginPath();
          pts.forEach(([x, y], i) => {
            const yy = y - hBase * this.scaleAt(y);
            if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
          });
          ctx.stroke();

          // 符文菱形节点（真实盘口厚时变为金色加固盾纹）
          for (const q of [0.18, 0.42, 0.66, 0.88]) {
            const py = lerp(yTop, yBot, q);
            const px = this.defenseX(u, py, bowDir);
            const sc = this.scaleAt(py);
            const cy = py - hBase * sc * 0.55;
            const rs = (2.3 + ln.wallStr * 1.8) * sc;
            ctx.fillStyle = ln.wallStr > 0.25
              ? `rgba(253,230,138,${0.85 * alpha})`
              : `rgba(${c.glow.join(',')},${0.75 * alpha})`;
            ctx.beginPath();
            ctx.moveTo(px, cy - rs); ctx.lineTo(px + rs * 0.72, cy);
            ctx.lineTo(px, cy + rs); ctx.lineTo(px - rs * 0.72, cy);
            ctx.closePath(); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        // 已攻破：瞬间金白裂纹 + 持续插上进攻方占领战旗
        const att = ln.owner === 'blue' ? 'red' : 'blue';
        const ac = colOf(att);
        if (ln.breakT > 0) {
          const bk = ln.breakT / 0.95;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(253,230,138,${0.9 * bk})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          for (let i = 0; i <= 6; i++) {
            const py = lerp(yTop, yBot, i / 6);
            const px = this.defenseX(u, py, bowDir) + (i % 2 ? 7 : -7) * bk;
            if (i === 0) ctx.moveTo(px, py - 12); else ctx.lineTo(px, py - 12);
          }
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
        const fDir = att === 'blue' ? 1 : -1;
        for (const q of [0.34, 0.72]) {
          const py = lerp(this.laneTop, this.laneBot, q);
          const px = this.defenseX(u, py, bowDir);
          const sc = this.scaleAt(py);
          const h = 19 * sc;
          const wave = rm ? 0 : Math.sin(t * 5.5 + lvl + q * 4) * 1.6 * sc;
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.2 * sc;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - h); ctx.stroke();
          ctx.fillStyle = ac.main;
          ctx.beginPath();
          ctx.moveTo(px, py - h);
          ctx.lineTo(px + fDir * 10 * sc, py - h + 3.2 * sc + wave);
          ctx.lineTo(px, py - h + 7 * sc);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#fde68a';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    // 地平线战术界碑标牌（% + 真实价格刻度）
    const narrow = this.W < 780;
    const ultraNarrow = this.W < 480;
    const badgeY = narrow ? this.horizon + 8 : this.horizon + 15;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const lvl of [-3, -2, -1, 1, 2, 3]) {
      const ln = this.def.lines.get(lvl);
      if (!ln) continue;
      const bowDir = ln.owner === 'blue' ? 1 : -1;
      const tx = this.defenseX(lvl * 0.25, this.horizon, bowDir);
      const pctVal = +(lvl * this.def.step).toFixed(1);
      const pctStr = (pctVal > 0 ? '+' : '') + pctVal + '%';
      const pxStr = '$' + Math.round(this.def.anchor * (1 + pctVal / 100)).toLocaleString('en-US');
      const captured = ln.state === 'captured';
      const att = ln.owner === 'blue' ? 'red' : 'blue';
      const col = colOf(captured ? att : ln.owner);
      const isTarget = lvl === targetLvl;
      const titleTxt = captured && !narrow ? '✓ ' + pctStr : pctStr;

      // 界碑连线到底下战壕
      ctx.strokeStyle = isTarget ? 'rgba(253,230,138,0.68)' : `rgba(${col.glow.join(',')},0.35)`;
      ctx.lineWidth = isTarget ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(tx, this.horizon + 2);
      ctx.lineTo(tx, isTarget ? this.laneTop - 3 : badgeY + 5);
      ctx.stroke();

      if (narrow) {
        if (isTarget) {
          // 窄屏/平板：将当前争夺的目标防线价格标牌单独下沉到第 3 层，彻底避开 ±% 刻度行与 0% 基准碑
          const targetY = clamp(this.horizon + 25, badgeY + 16, this.laneTop - 9);
          const lbl = `${captured ? '✓ ' : ''}${pctStr} · ${pxStr}`;
          ctx.font = `800 ${ultraNarrow ? 9 : 10}px "JetBrains Mono", monospace`;
          const tw = ctx.measureText(lbl).width;
          const bw = tw + 12, bh = ultraNarrow ? 15 : 17;
          const bx = clamp(tx - bw / 2, 6, this.W - bw - 6);
          const by = targetY - bh / 2;
          ctx.fillStyle = 'rgba(14,18,34,0.92)';
          ctx.strokeStyle = 'rgba(253,230,138,0.85)';
          ctx.lineWidth = 1.2;
          this._roundRect(ctx, bx, by, bw, bh, 5);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fde68a';
          ctx.fillText(lbl, bx + bw / 2, targetY + 0.5);
        } else {
          // 其余 5 条刻度：紧凑 % 文本 + 占领方顶部小星点（不加宽字符串）
          ctx.font = `800 ${ultraNarrow ? 8.5 : 9.5}px "JetBrains Mono", monospace`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(4,6,14,0.92)';
          ctx.strokeText(pctStr, tx, badgeY);
          ctx.fillStyle = col.light;
          ctx.fillText(pctStr, tx, badgeY);
          if (captured) {
            ctx.fillStyle = col.light;
            ctx.beginPath();
            ctx.arc(tx, badgeY - 6, 1.5, 0, TAU);
            ctx.fill();
          }
        }
        continue;
      }

      ctx.font = '800 10.5px "JetBrains Mono", monospace';
      const w1 = ctx.measureText(titleTxt).width;
      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      const w2 = ctx.measureText(pxStr).width;
      const bw = Math.max(w1, w2) + 14;
      const bh = 26;
      const bx = clamp(tx - bw / 2, 6, this.W - bw - 6);
      const by = badgeY - bh / 2;

      ctx.fillStyle = isTarget ? 'rgba(14,18,34,0.9)' : 'rgba(7,10,20,0.78)';
      ctx.strokeStyle = isTarget ? 'rgba(253,230,138,0.82)' : `rgba(${col.glow.join(',')},${captured ? 0.55 : 0.38})`;
      ctx.lineWidth = isTarget ? 1.3 : 1;
      this._roundRect(ctx, bx, by, bw, bh, 6);
      ctx.fill(); ctx.stroke();

      ctx.font = '800 10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = isTarget ? '#fde68a' : col.light;
      ctx.fillText(titleTxt, bx + bw / 2, by + 8);
      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(230,235,255,0.86)';
      ctx.fillText(pxStr, bx + bw / 2, by + bh - 6.5);
    }

    // 0% 基准中轴碑（随弹性镜头同步平移，错层置于地平线上方）
    const cx = this.defenseX(0, this.horizon, 0);
    const cy = this.horizon - (ultraNarrow ? 15 : 13);
    const baseTxt = this.W >= 520 ? `0% · ${tr(this.def.anchorType === 'daily' ? 'defBase' : 'defBase24')}` : '0%';
    const basePx = '$' + Math.round(this.def.anchor).toLocaleString('en-US');
    ctx.font = `800 ${ultraNarrow ? 9 : 10.5}px "JetBrains Mono", -apple-system, sans-serif`;
    const bw1 = ctx.measureText(baseTxt).width;
    ctx.font = `700 ${ultraNarrow ? 8.5 : 10}px "JetBrains Mono", monospace`;
    const bw2 = ctx.measureText(basePx).width;
    const cbw = Math.max(bw1, bw2) + (ultraNarrow ? 10 : 14);
    const cbh = ultraNarrow ? 22 : 27;

    ctx.strokeStyle = 'rgba(253,230,138,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy + cbh / 2); ctx.lineTo(cx, this.horizon + 2); ctx.stroke();

    ctx.fillStyle = 'rgba(16,14,24,0.88)';
    ctx.strokeStyle = 'rgba(253,230,138,0.65)';
    ctx.lineWidth = 1.2;
    this._roundRect(ctx, cx - cbw / 2, cy - cbh / 2, cbw, cbh, 7);
    ctx.fill(); ctx.stroke();

    ctx.font = `800 ${ultraNarrow ? 9 : 10.5}px "JetBrains Mono", -apple-system, sans-serif`;
    ctx.fillStyle = '#fde68a';
    ctx.fillText(baseTxt, cx, cy - (ultraNarrow ? 4 : 5));
    ctx.font = `700 ${ultraNarrow ? 8.5 : 10}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#e6ebff';
    ctx.fillText(basePx, cx, cy + (ultraNarrow ? 5 : 6));
    ctx.restore();
  }

  // ---------- Phase 3: 盘口巨鲸墙、清算磁吸带、微操特效与互动回放 ----------
  _priceToU(price) {
    if (!(this.def.anchor > 0) || !(this.def.step > 0) || !(price > 0)) return null;
    const pct = (price / this.def.anchor - 1) * 100;
    return pct / (this.def.step * 4);
  }

  setOrderWalls(walls = []) {
    this.orderWalls = Array.isArray(walls) ? walls.slice(0, 6) : [];
  }

  setLiqZones(zones = []) {
    this.liqZones = Array.isArray(zones) ? zones.slice(0, 6) : [];
  }

  _drawLiqZones() {
    if (!this.liqZones.length || !(this.def.anchor > 0)) return;
    const { ctx } = this;
    const y0 = this.laneTop - 6, y1 = this.laneBot + 4;
    ctx.save();
    for (const z of this.liqZones) {
      const u = this._priceToU(z.price);
      if (u == null || Math.abs(u) > 0.92) continue;
      const pts = this._lineCurve(u, 0, y0, y1, 8);
      const a = clamp(0.18 + (z.strength || 0.5) * 0.24, 0.16, 0.45);
      ctx.strokeStyle = z.side === 'long' ? `rgba(192,132,252,${a})` : `rgba(244,114,182,${a})`;
      ctx.lineWidth = z.leverage === '50x' ? 7 : 4.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
      const [bx, by] = pts[1] || pts[0];
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(233,213,255,0.82)';
      ctx.fillText(`⚡${z.leverage}`, bx, by + 6);
    }
    ctx.restore();
  }

  _drawOrderWalls() {
    if (!this.orderWalls.length || !(this.def.anchor > 0)) return;
    const { ctx, t } = this;
    const y0 = this.laneTop + 4, y1 = this.laneBot - 4;
    const placedTags = [];
    ctx.save();
    for (const w of this.orderWalls) {
      const u = this._priceToU(w.price);
      if (u == null || Math.abs(u) > 0.9) continue;
      const bowDir = w.side === 'blue' ? 1 : -1;
      const pts = this._lineCurve(u, bowDir, y0, y1, 8);
      const str = clamp((Math.log10((w.usd || 300000) + 1) - 5.3) / 1.7, 0.25, 1);
      const h = (14 + str * 14);
      const col = w.side === 'blue' ? '96,165,250' : '248,113,113';
      const pulse = 0.8 + 0.2 * Math.sin(t * 3 + w.price * 0.01);

      // 金晶壁垒棱柱体
      ctx.fillStyle = `rgba(251,191,36,${0.12 + str * 0.14})`;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = pts.length - 1; i >= 0; i--) {
        const [x, y] = pts[i];
        ctx.lineTo(x, y - h * this.scaleAt(y));
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = `rgba(253,230,138,${(0.45 + str * 0.4) * pulse})`;
      ctx.lineWidth = 1.3 + str * 1.4;
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const yy = y - h * this.scaleAt(y);
        if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      });
      ctx.stroke();

      ctx.strokeStyle = `rgba(${col},${0.45 + str * 0.3})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();

      // 顶部微标牌（置于战壕上沿内侧，避开地平线百分比界碑）
      if (this.W >= 600) {
        const tx = pts[0][0];
        let ty = y0 + 10;
        for (const px of placedTags) {
          if (Math.abs(px[0] - tx) < 92 && Math.abs(px[1] - ty) < 16) ty += 17;
        }
        if (ty < y1 - 24) {
          placedTags.push([tx, ty]);
          const lbl = `🧱 $${Math.round(w.price).toLocaleString('en-US')} · ${fmtUsd(w.usd)}`;
          ctx.font = '700 9.5px "JetBrains Mono", -apple-system, sans-serif';
          const tw = ctx.measureText(lbl).width + 10;
          const bx = clamp(tx - tw / 2, 8, this.W - tw - 8);
          ctx.fillStyle = 'rgba(10,14,28,0.88)';
          ctx.strokeStyle = w.side === 'blue' ? 'rgba(96,165,250,0.65)' : 'rgba(248,113,113,0.65)';
          ctx.lineWidth = 1;
          this._roundRect(ctx, bx, ty - 7.5, tw, 15, 4);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fde68a';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(lbl, bx + tw / 2, ty + 0.3);
        }
      }
    }
    ctx.restore();
  }

  triggerWallEvent(type, { side, price, usd, noFeed = false } = {}) {
    if (!this.W || !(usd > 0)) return;
    const u = clamp(this._priceToU(price) ?? (side === 'blue' ? -0.35 : 0.35), -0.88, 0.88);
    const midY = (this.laneTop + this.laneBot) * 0.5;
    const mx = this.defenseX(u, midY, side === 'blue' ? 1 : -1);
    const c = colOf(side);
    if (type === 'spoof') {
      for (let i = 0; i < Math.round(16 * this.Q.pk); i++) {
        const py = rand(this.laneTop + 10, this.laneBot - 10);
        const px = this.defenseX(u, py, side === 'blue' ? 1 : -1);
        this.parts.push({
          type: 'spark', x: px, y: py,
          vx: rand(-55, 55), vy: rand(-130, -45),
          life: rand(0.45, 0.85), max: 0.85,
          col: c.light, w: rand(1.3, 2.4),
        });
      }
      this.texts.push({
        x: mx, y: this.laneTop + 26, vx: 0,
        txt: `💨 ${tr('wallSpoofTag', side)} ${fmtUsd(usd)}`,
        side, col: side === 'blue' ? '#93c5fd' : '#fca5a5', lvl: 2, life: 2.0, max: 2.0,
      });
      if (!noFeed) {
        this._pushFeed({ side, type: 'spoof', price, usd, label: tr('kfSpoof', side, fmtUsd(usd)) });
      }
    } else if (type === 'iceberg') {
      this.rings.push({ x: mx, y: midY, r: 8, max: 64, life: 0.65, t: 0, col: [253, 230, 138] });
      this.parts.push({ type: 'glow', spr: 'gold', x: mx, y: midY, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 92, add: true, grow: 1.2 });
      for (let i = 0; i < Math.round(12 * this.Q.pk); i++) {
        const a = rand(0, TAU), sp = rand(40, 130);
        this.parts.push({ type: 'spark', x: mx, y: midY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, col: '#fde68a', w: 1.8 });
      }
      this.texts.push({
        x: mx, y: this.laneTop + 26, vx: 0,
        txt: `🛡️ ${tr('wallIcebergTag', side)} ${fmtUsd(usd)}`,
        side, col: side === 'blue' ? '#93c5fd' : '#fca5a5', lvl: 2, life: 2.1, max: 2.1,
      });
      if (!noFeed) {
        this._pushFeed({ side, type: 'iceberg', price, usd, label: tr('kfIceberg', side, fmtUsd(usd)) });
      }
    }
  }

  _pushFeed(item) {
    const ev = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      ...item,
    };
    this.killFeed.unshift(ev);
    if (this.killFeed.length > 5) this.killFeed.length = 5;
    this.onFeedUpdate && this.onFeedUpdate(this.killFeed);
  }

  replayEvent(ev) {
    if (!ev || !this.W) return;
    if (ev.type === 'whale') {
      this._skyStrike(ev.side, ev.usd || this.th.whale, 2);
      this._spawnUnit(ev.side, 'titan', false);
      this.onDemoSfx && this.onDemoSfx('whale', ev.side);
    } else if (ev.type === 'liq') {
      this.liquidate(ev.liqSide || (ev.side === 'blue' ? 'long' : 'short'), ev.usd || this.th.heavy, { noFeed: true, replay: true });
      this.onDemoSfx && this.onDemoSfx('liq', ev.side);
    } else if (ev.type === 'breach' || ev.type === 'recap') {
      const ln = this.def.lines.get(ev.lvl);
      if (ln) this._triggerLineEvent(ln, ev.side, !!ev.recaptured, false);
      this.onDemoSfx && this.onDemoSfx('breach', ev.side, !!ev.recaptured);
    } else if (ev.type === 'spoof' || ev.type === 'iceberg') {
      this.triggerWallEvent(ev.type, { side: ev.side, price: ev.price, usd: ev.usd, noFeed: true });
    }
  }

  triggerDemo(kind) {
    if (!this.W) return;
    if (kind === 'whale_blue' || kind === 'whale_red') {
      const side = kind === 'whale_blue' ? 'blue' : 'red';
      const usd = 1850000;
      this._skyStrike(side, usd, 2);
      this._recordCombo(side, usd);
      this._spawnUnit(side, 'titan', false);
      this._spawnUnit(side, 'cavalry', true);
      this._spawnUnit(side, 'cavalry', true);
      this._pushFeed({ side, type: 'whale', usd, price: this.def.price, label: tr('kfWhale', tr(side), fmtUsd(usd)) });
      this.onDemoSfx && this.onDemoSfx('whale', side);
    } else if (kind === 'liq_cascade') {
      const victimSide = this.front < 0.5 ? 'long' : 'short';
      const winner = victimSide === 'long' ? 'red' : 'blue';
      [85000, 140000, 290000, 460000].forEach((amt, idx) => {
        setTimeout(() => {
          this.liquidate(victimSide, amt, { noFeed: idx !== 3, replay: true });
          this.onDemoSfx && this.onDemoSfx('liq', winner);
        }, idx * 170);
      });
    } else if (kind === 'siege') {
      const att = this.front >= 0.5 ? 'blue' : 'red';
      this._spawnUnit(att, 'siege', true);
      this._spawnUnit(att, 'siege', true);
      for (let i = 0; i < 3; i++) this._spawnUnit(att, 'cavalry', true);
      this._shell(att, 360000, 'heavy');
      this._shell(att, 180000, 'shell');
      this._volley(att);
      this.onDemoSfx && this.onDemoSfx('surge', att);
    }
  }

  _emitHover() {
    if (!this.onHover || !this._hoverPos || !this.W) return;
    const { x, y } = this._hoverPos;
    let hit = null;

    // 1. 城堡能量护盾侦察
    for (const side of ['blue', 'red']) {
      const f = this.forts[side];
      if (!f || !f.body) continue;
      const sx = f.X(52 * f.k), sy = f.gy - 52 * f.k;
      if (Math.abs(x - sx) < 34 * f.k && Math.abs(y - sy) < 68 * f.k) {
        hit = { kind: 'shield', side, str: this.shields[side].str, usd: this.shields[side].prevUsd, alert: f.alert, x, y };
        break;
      }
    }

    // 2. 真实巨鲸挂单墙侦察
    if (!hit && this.def.anchor > 0 && y >= this.horizon && y <= this.H) {
      for (const w of this.orderWalls) {
        const u = this._priceToU(w.price);
        if (u == null || Math.abs(u) > 0.9) continue;
        const wx = this.defenseX(u, clamp(y, this.laneTop, this.laneBot), w.side === 'blue' ? 1 : -1);
        if (Math.abs(x - wx) < 16) {
          hit = { kind: 'wall', side: w.side, price: w.price, usd: w.usd, distPct: w.distPct, x, y };
          break;
        }
      }
    }

    // 3. 价格防线侦察
    if (!hit && this.def.anchor > 0 && y >= this.horizon && y <= this.H) {
      let bestDist = 16;
      for (const lvl of [-3, -2, -1, 1, 2, 3]) {
        const ln = this.def.lines.get(lvl);
        if (!ln) continue;
        const wx = this.defenseX(lvl * 0.25, clamp(y, this.laneTop, this.laneBot), ln.owner === 'blue' ? 1 : -1);
        const d = Math.abs(x - wx);
        if (d < bestDist) {
          bestDist = d;
          const pct = +(lvl * this.def.step).toFixed(1);
          const price = this.def.anchor * (1 + pct / 100);
          hit = { kind: 'line', lvl, pct, price, state: ln.state, owner: ln.owner, wallUsd: ln.wallUsd, breachCount: ln.breachCount || 0, x, y };
        }
      }
    }

    if (!hit) {
      if (this._lastHoverKey) { this._lastHoverKey = ''; this.onHover(null); }
      return;
    }
    const key = `${hit.kind}-${hit.side || hit.lvl || ''}-${Math.round(hit.price || 0)}`;
    this._lastHoverKey = key;
    this.onHover(hit);
  }
}

export { fmtUsd };
