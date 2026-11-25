// 军队与城堡美术：全部用 Canvas 程序化绘制，开页时预渲染成精灵 / 缓存图层（不加载任何图片）
// 风格：暗黑奇幻重装军团。蓝军 = 公牛军团（牛角盔、▲ 徽记），红军 = 熊军团（鬃冠盔、毛皮披肩、▼ 徽记）
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

// 士兵精灵：单位坐标，R 倍分辨率；原点在脚底中心，朝右
export const UNIT = { R: 3, W: 48, H: 54, OX: 22, OY: 49, FRAMES: 8 };
export const UNIT_SPEC = {
  infantry: UNIT,
  cavalry: { R: 2.5, W: 70, H: 60, OX: 35, OY: 54, FRAMES: 8 },
  siege: { R: 2.5, W: 78, H: 60, OX: 38, OY: 54, FRAMES: 6 },
  titan: { R: 2, W: 112, H: 126, OX: 56, OY: 118, FRAMES: 6 },
};

function chevron(x, cx, cy, s, up) {
  x.beginPath();
  if (up) { x.moveTo(cx - s, cy + s * 0.55); x.lineTo(cx, cy - s * 0.65); x.lineTo(cx + s, cy + s * 0.55); x.lineTo(cx + s * 0.55, cy + s * 0.75); x.lineTo(cx, cy - s * 0.05); x.lineTo(cx - s * 0.55, cy + s * 0.75); }
  else { x.moveTo(cx - s, cy - s * 0.55); x.lineTo(cx, cy + s * 0.65); x.lineTo(cx + s, cy - s * 0.55); x.lineTo(cx + s * 0.55, cy - s * 0.75); x.lineTo(cx, cy + s * 0.05); x.lineTo(cx - s * 0.55, cy - s * 0.75); }
  x.closePath(); x.fill();
}

function drawUnit(x, side, c, ph, moving) {
  const blue = side === 'blue';
  const walk = moving ? Math.sin(ph) : 0;
  const lift = moving ? Math.max(0, Math.cos(ph)) * 1.4 : 0;
  x.lineCap = 'round'; x.lineJoin = 'round';
  // 披风（身后）
  const cg = x.createLinearGradient(0, -24, 0, -4); cg.addColorStop(0, c.cape); cg.addColorStop(1, c.capeDk);
  x.fillStyle = cg; x.beginPath(); x.moveTo(-2, -23.5);
  x.quadraticCurveTo(-8.5 - walk * 1.2, -16, -10.5 - (moving ? 2.5 : 0) - walk * 1.5, -5.5);
  x.lineTo(-6.5 - walk, -4.5); x.quadraticCurveTo(-4, -10, -2.5, -11); x.closePath(); x.fill();
  // 腿：后腿暗、前腿亮
  const leg = (dx, up, front) => {
    x.strokeStyle = front ? '#323a4f' : '#191e2b'; x.lineWidth = 3.6;
    x.beginPath(); x.moveTo(front ? 0.6 : -0.6, -11); x.lineTo(dx * 0.45 + 0.8, -5.5 - up * 0.6); x.lineTo(dx, -1.2 - up); x.stroke();
    x.fillStyle = front ? '#0e121c' : '#090c13'; x.beginPath(); x.ellipse(dx + 1.3, -0.9 - up, 2.8, 1.35, 0, 0, TAU); x.fill();
    x.fillStyle = front ? c.main : c.dark; x.fillRect(dx * 0.45 - 0.4, -6.6 - up * 0.6, 2.4, 1.5); // 护膝
  };
  leg(-walk * 4.6, walk < 0 ? lift : 0, false);
  leg(walk * 4.6, walk > 0 ? lift : 0, true);
  // 腰甲裙
  x.fillStyle = c.dark; x.beginPath(); x.moveTo(-4.8, -11.5); x.lineTo(4.8, -11.5); x.lineTo(4, -7.6); x.lineTo(-4, -7.6); x.closePath(); x.fill();
  x.strokeStyle = c.main; x.lineWidth = 0.6; x.beginPath(); x.moveTo(-4, -7.9); x.lineTo(4, -7.9); x.stroke();
  // 胸甲
  const g = x.createLinearGradient(-5, -24, 5, -10); g.addColorStop(0, c.steelHi); g.addColorStop(0.45, c.armor); g.addColorStop(1, c.dark);
  x.fillStyle = g; x.beginPath(); x.moveTo(-5.2, -23.5); x.lineTo(5.4, -23.5); x.quadraticCurveTo(6, -17, 4.4, -11.5); x.lineTo(-4.4, -11.5); x.quadraticCurveTo(-5.6, -17, -5.2, -23.5); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(-3.6, -22.3); x.lineTo(4, -22.3); x.stroke();
  x.fillStyle = '#0d111b'; x.fillRect(-4.9, -13.2, 9.8, 2); x.fillStyle = c.gold; x.fillRect(-0.9, -13.2, 1.8, 2); // 腰带扣
  if (!blue) { x.fillStyle = '#3b1d18'; x.beginPath(); x.ellipse(-0.6, -23.3, 6.2, 2.4, 0, 0, TAU); x.fill(); // 熊皮披肩
    x.strokeStyle = '#5c2e24'; x.lineWidth = 0.7; for (let i = -5; i <= 4; i += 1.6) { x.beginPath(); x.moveTo(i, -24.6); x.lineTo(i + 0.6, -21.8); x.stroke(); } }
  // 盾（前手，鸢形盾 + 徽记）
  const sx = 4.6, sg = x.createLinearGradient(sx - 4, -22, sx + 4, -7); sg.addColorStop(0, c.light); sg.addColorStop(0.35, c.main); sg.addColorStop(1, c.dark);
  x.fillStyle = sg; x.beginPath(); x.moveTo(sx - 3.9, -21.2); x.quadraticCurveTo(sx, -22.6, sx + 3.9, -21.2); x.lineTo(sx + 3.6, -14.5); x.quadraticCurveTo(sx + 2.6, -9, sx, -6.4); x.quadraticCurveTo(sx - 2.6, -9, sx - 3.6, -14.5); x.closePath(); x.fill();
  x.strokeStyle = c.gold; x.lineWidth = 0.9; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.85)'; chevron(x, sx, -15, 2.1, blue);
  // 武器：架在盾上的符能长枪（枪口发光，与开火位置一致）
  x.fillStyle = '#2b3245'; x.fillRect(-4.5, -16.4, 15.5, 2.1);
  x.fillStyle = '#58637d'; x.fillRect(1.5, -17.5, 7, 1.2);
  x.fillStyle = c.gold; x.fillRect(-1, -16.4, 1.2, 2.1);
  x.save(); x.shadowColor = c.light; x.shadowBlur = 4; x.fillStyle = c.light; x.fillRect(11, -16.1, 2.6, 1.5); x.restore();
  // 肩甲
  x.fillStyle = c.main; x.beginPath(); x.ellipse(-1, -22.4, 4.4, 2.8, -0.15, Math.PI * 0.95, TAU * 1.02); x.closePath(); x.fill();
  x.strokeStyle = c.gold; x.lineWidth = 0.6; x.stroke();
  // 头盔（全覆式，无露脸）
  const hx = 0.6, hy = -27;
  if (blue) { // 牛角：后角暗、前角亮
    x.strokeStyle = '#8a7a5c'; x.lineWidth = 1.9; x.beginPath(); x.moveTo(hx - 2.4, hy - 2); x.quadraticCurveTo(hx - 8, hy - 4, hx - 5.5, hy - 9.5); x.stroke();
  } else { // 熊军团：后掠鬃冠
    const pg = x.createLinearGradient(hx - 10, hy - 6, hx + 2, hy - 2); pg.addColorStop(0, c.capeDk); pg.addColorStop(1, c.main);
    x.fillStyle = pg; x.beginPath(); x.moveTo(hx + 2, hy - 4.6); x.quadraticCurveTo(hx - 5, hy - 8.5, hx - 11, hy - 3.5); x.quadraticCurveTo(hx - 5.5, hy - 4.6, hx - 3, hy - 1.5); x.closePath(); x.fill(); x.strokeStyle = c.light; x.lineWidth = 0.6; x.beginPath(); x.moveTo(hx + 2, hy - 4.6); x.quadraticCurveTo(hx - 5, hy - 8.5, hx - 11, hy - 3.5); x.stroke();
  }
  const hg = x.createLinearGradient(hx - 4, hy - 5, hx + 4, hy + 4); hg.addColorStop(0, '#6c7790'); hg.addColorStop(0.5, '#2d3446'); hg.addColorStop(1, '#141824');
  x.fillStyle = hg; x.beginPath(); x.moveTo(hx - 4.3, hy + 3.6); x.lineTo(hx - 4.5, hy - 1); x.quadraticCurveTo(hx - 4, hy - 5.2, hx + 0.4, hy - 5.2); x.quadraticCurveTo(hx + 4.6, hy - 5, hx + 4.8, hy); x.lineTo(hx + 4.4, hy + 3); x.lineTo(hx + 1.5, hy + 4); x.closePath(); x.fill();
  x.fillStyle = c.main; x.fillRect(hx - 4.5, hy - 1.6, 9.2, 1.1); // 盔沿彩带
  x.save(); x.shadowColor = c.light; x.shadowBlur = 5; x.fillStyle = c.visor; x.fillRect(hx + 0.6, hy + 0.1, 4.2, 1.2); x.restore(); // 发光目镜
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 0.6; x.beginPath(); x.arc(hx, hy - 1, 3.6, Math.PI * 1.15, Math.PI * 1.6); x.stroke();
  if (blue) { x.strokeStyle = '#3a3226'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(hx + 1.6, hy - 3); x.lineTo(hx + 3.6, hy - 4.4); x.stroke(); x.strokeStyle = '#f1e6c8'; x.lineWidth = 1.9; x.beginPath(); x.moveTo(hx + 2.6, hy - 3.8); x.quadraticCurveTo(hx + 8.5, hy - 5, hx + 6, hy - 10); x.stroke(); }
}

function drawCavalry(x, side, c, ph, moving) {
  const blue = side === 'blue';
  const stride = moving ? Math.sin(ph) : 0;
  const bob = moving ? Math.abs(Math.cos(ph)) * 1.8 : 0;
  x.lineCap = 'round'; x.lineJoin = 'round';

  // 后腿（远侧）
  const leg = (bx, phase, front) => {
    const s = moving ? Math.sin(phase) : 0;
    const lift = moving ? Math.max(0, Math.cos(phase)) * 2.5 : 0;
    x.strokeStyle = front ? (blue ? '#334155' : '#3a2220') : (blue ? '#182032' : '#211312');
    x.lineWidth = blue ? 3.2 : 4.2;
    x.beginPath();
    x.moveTo(bx, -13 - bob);
    x.lineTo(bx + s * 4.5, -6.5 - lift);
    x.lineTo(bx + s * 7.5, -1.2 - lift);
    x.stroke();
    x.fillStyle = '#090c13';
    x.beginPath();
    x.ellipse(bx + s * 7.5 + 1.2, -0.9 - lift, blue ? 2.4 : 3.2, 1.3, 0, 0, TAU);
    x.fill();
  };
  leg(-14, ph + 1.8, false);
  leg(11, ph - 1.2, false);

  // 坐骑躯干（蓝=重甲战牛，红=披甲战熊）
  x.save();
  x.translate(0, -bob);
  const bodyG = x.createLinearGradient(-20, -28, 18, -10);
  if (blue) {
    bodyG.addColorStop(0, '#475569'); bodyG.addColorStop(0.5, '#1e3a8a'); bodyG.addColorStop(1, '#0f172a');
  } else {
    bodyG.addColorStop(0, '#5c2b22'); bodyG.addColorStop(0.5, '#3b1815'); bodyG.addColorStop(1, '#1a0a0a');
  }
  x.fillStyle = bodyG;
  x.beginPath();
  x.ellipse(-1, -17, blue ? 18 : 19.5, blue ? 8.8 : 9.8, -0.05, 0, TAU);
  x.fill();

  // 战甲披挂（马衣/熊甲）
  x.fillStyle = c.armor;
  x.beginPath();
  x.moveTo(-16, -21);
  x.quadraticCurveTo(0, -24, 15, -19);
  x.lineTo(13, -10.5);
  x.quadraticCurveTo(0, -8.5, -15, -11.5);
  x.closePath();
  x.fill();
  x.strokeStyle = c.gold;
  x.lineWidth = 1;
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,.85)';
  chevron(x, 4, -15.5, 2.4, blue);

  // 坐骑头部
  if (blue) {
    // 牛首 + 金银双角
    x.fillStyle = '#1e293b';
    x.beginPath();
    x.moveTo(11, -24); x.lineTo(24, -22); x.lineTo(25, -14.5); x.lineTo(14, -13);
    x.closePath(); x.fill();
    x.strokeStyle = c.main; x.lineWidth = 1; x.stroke();
    // 发光牛眼
    x.fillStyle = c.visor; x.fillRect(18.5, -20, 3, 1.3);
    // 弯曲巨角
    x.strokeStyle = '#fef3c7'; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(17, -23.5); x.quadraticCurveTo(25, -28, 28.5, -32.5); x.stroke();
    x.strokeStyle = '#b8a374'; x.lineWidth = 1.9;
    x.beginPath(); x.moveTo(14.5, -24); x.quadraticCurveTo(21, -29, 23.5, -33.5); x.stroke();
  } else {
    // 熊首 + 护面铁箍 + 利齿
    x.fillStyle = '#4a211b';
    x.beginPath();
    x.ellipse(18, -20.5, 7.8, 6.4, 0.1, 0, TAU);
    x.fill();
    x.fillStyle = '#2e1210';
    x.beginPath(); x.arc(14.5, -26, 2.2, 0, TAU); x.fill(); // 熊耳
    x.fillStyle = c.visor; x.fillRect(19.5, -22.2, 3.2, 1.3); // 怒目
    x.fillStyle = '#e2e8f0';
    x.beginPath(); x.moveTo(23, -17.5); x.lineTo(24.5, -15); x.lineTo(21.5, -17); x.closePath(); x.fill(); // 獠牙
    x.strokeStyle = c.gold; x.lineWidth = 0.9;
    x.beginPath(); x.moveTo(13, -23); x.lineTo(21, -23.5); x.stroke();
  }

  // 骑手披风（随奔跑飘动）
  const cg = x.createLinearGradient(-4, -38, -20, -18);
  cg.addColorStop(0, c.cape); cg.addColorStop(1, c.capeDk);
  x.fillStyle = cg;
  x.beginPath();
  x.moveTo(-4, -36);
  x.quadraticCurveTo(-15 - stride * 2, -31, -24 - stride * 2.5, -20);
  x.lineTo(-16 - stride, -17.5);
  x.quadraticCurveTo(-9, -23, -4, -24);
  x.closePath();
  x.fill();

  // 骑手躯干与头盔
  const rg = x.createLinearGradient(-8, -38, 4, -23);
  rg.addColorStop(0, c.steelHi); rg.addColorStop(0.5, c.armor); rg.addColorStop(1, c.dark);
  x.fillStyle = rg;
  x.beginPath();
  x.roundRect ? x.roundRect(-7, -36.5, 10, 14, 2.5) : x.rect(-7, -36.5, 10, 14);
  x.fill();
  // 骑手头盔
  x.fillStyle = '#2d3446';
  x.beginPath(); x.arc(-1.5, -40.5, 4.6, 0, TAU); x.fill();
  x.fillStyle = c.visor; x.fillRect(-0.5, -41.2, 4, 1.2);
  if (blue) {
    x.strokeStyle = '#f1e6c8'; x.lineWidth = 1.7;
    x.beginPath(); x.moveTo(0, -43.5); x.quadraticCurveTo(5, -45, 3.5, -49.5); x.stroke();
  } else {
    x.fillStyle = c.main;
    x.beginPath(); x.moveTo(0, -45); x.quadraticCurveTo(-7, -48, -11, -43); x.lineTo(-4, -41.5); x.closePath(); x.fill();
  }

  // 骑手武器：蓝军长枪突刺 / 红军战斧劈砍
  if (blue) {
    x.fillStyle = '#64748b';
    x.fillRect(-6, -30.5, 32, 2.1);
    x.fillStyle = c.gold;
    x.beginPath(); x.moveTo(1, -33.5); x.lineTo(6, -29.5); x.lineTo(1, -25.5); x.closePath(); x.fill();
    x.save(); x.shadowColor = c.light; x.shadowBlur = 5; x.fillStyle = '#e0f2fe';
    x.beginPath(); x.moveTo(26, -32.2); x.lineTo(34, -29.5); x.lineTo(26, -26.8); x.closePath(); x.fill();
    x.restore();
  } else {
    x.strokeStyle = '#78716c'; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(-2, -29); x.lineTo(18, -42); x.stroke();
    x.save(); x.shadowColor = c.light; x.shadowBlur = 5; x.fillStyle = c.light;
    x.beginPath(); x.moveTo(14, -45); x.quadraticCurveTo(25, -44, 24, -34); x.quadraticCurveTo(18, -37, 13, -39); x.closePath(); x.fill();
    x.restore();
  }
  x.restore();

  // 前腿（近侧）
  leg(-11, ph, true);
  leg(13, ph + Math.PI, true);
}

function drawSiege(x, side, c, ph, moving) {
  const blue = side === 'blue';
  const thrust = Math.sin(ph) * (moving ? 3.5 : 5);
  x.lineCap = 'round'; x.lineJoin = 'round';

  // 顶棚与攻城木框架
  x.fillStyle = '#1a1512';
  x.strokeStyle = '#3f342a';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(-28, -11); x.lineTo(-22, -37); x.lineTo(16, -33); x.lineTo(22, -11);
  x.closePath();
  x.fill(); x.stroke();

  // 倾斜顶甲与护盾板
  const roofG = x.createLinearGradient(-24, -39, 18, -28);
  roofG.addColorStop(0, '#334155'); roofG.addColorStop(1, '#0f172a');
  x.fillStyle = roofG;
  x.beginPath();
  x.moveTo(-26, -36); x.lineTo(-20, -42); x.lineTo(18, -37); x.lineTo(19, -31);
  x.closePath();
  x.fill();
  x.strokeStyle = c.gold; x.lineWidth = 1; x.stroke();

  // 侧板徽记
  x.fillStyle = c.dark;
  x.fillRect(-16, -29, 26, 14);
  x.strokeStyle = c.main; x.lineWidth = 0.9; x.strokeRect(-16, -29, 26, 14);
  x.fillStyle = 'rgba(255,255,255,.85)';
  chevron(x, -3, -22, 3.2, blue);

  // 悬吊的巨型符文撞锤（往复冲击）
  x.strokeStyle = '#94a3b8'; x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(-12, -33); x.lineTo(-12 + thrust, -20);
  x.moveTo(8, -32); x.lineTo(8 + thrust, -20);
  x.stroke();

  x.save();
  x.translate(thrust, 0);
  const logG = x.createLinearGradient(0, -23, 0, -14);
  logG.addColorStop(0, '#574332'); logG.addColorStop(1, '#291e16');
  x.fillStyle = logG;
  x.fillRect(-20, -23, 42, 8);
  // 金属发光撞锤头
  x.save();
  x.shadowColor = c.light; x.shadowBlur = 7;
  x.fillStyle = c.main;
  x.beginPath();
  x.moveTo(20, -25.5); x.lineTo(34, -21); x.lineTo(34, -17); x.lineTo(20, -12.5);
  x.closePath();
  x.fill();
  x.strokeStyle = c.gold; x.lineWidth = 1.1; x.stroke();
  x.fillStyle = '#fff';
  x.fillRect(28, -20.5, 5, 3);
  x.restore();
  x.restore();

  // 双轮（带旋转辐条）
  for (const wx of [-15, 11]) {
    const wy = -7.5, wr = 7.2;
    x.fillStyle = '#0c101a';
    x.beginPath(); x.arc(wx, wy, wr, 0, TAU); x.fill();
    x.strokeStyle = '#64748b'; x.lineWidth = 2;
    x.beginPath(); x.arc(wx, wy, wr, 0, TAU); x.stroke();
    x.strokeStyle = c.gold; x.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = ph + k * Math.PI * 0.25;
      x.beginPath();
      x.moveTo(wx - Math.cos(a) * wr * 0.85, wy - Math.sin(a) * wr * 0.85);
      x.lineTo(wx + Math.cos(a) * wr * 0.85, wy + Math.sin(a) * wr * 0.85);
      x.stroke();
    }
    x.fillStyle = c.gold; x.beginPath(); x.arc(wx, wy, 2.2, 0, TAU); x.fill();
  }
}

function drawTitan(x, side, c, ph, moving) {
  const blue = side === 'blue';
  const walk = moving ? Math.sin(ph) : 0;
  const hover = Math.sin(ph * 2) * 1.8;
  x.lineCap = 'round'; x.lineJoin = 'round';

  // 圣像光辉背晕
  const aura = x.createRadialGradient(0, -52, 8, 0, -52, 52);
  aura.addColorStop(0, `rgba(${c.glow.join(',')},0.35)`);
  aura.addColorStop(0.65, `rgba(${c.glow.join(',')},0.12)`);
  aura.addColorStop(1, `rgba(${c.glow.join(',')},0)`);
  x.fillStyle = aura;
  x.beginPath(); x.arc(0, -52, 52, 0, TAU); x.fill();

  // 巨型飘动战袍
  const cg = x.createLinearGradient(-10, -76, -34, -10);
  cg.addColorStop(0, c.cape); cg.addColorStop(1, 'rgba(10,14,28,0.45)');
  x.fillStyle = cg;
  x.beginPath();
  x.moveTo(-6, -74);
  x.quadraticCurveTo(-28 - walk * 4, -50, -34 - walk * 5, -12);
  x.lineTo(-16 - walk * 2, -8);
  x.quadraticCurveTo(-12, -36, -6, -42);
  x.closePath();
  x.fill();

  // 巨型双腿
  const tLeg = (dx, front) => {
    x.strokeStyle = front ? '#475569' : '#1e293b';
    x.lineWidth = 8.5;
    x.beginPath();
    x.moveTo(front ? 2 : -3, -34);
    x.lineTo(dx * 0.5, -17);
    x.lineTo(dx, -2);
    x.stroke();
    x.fillStyle = c.main;
    x.fillRect(dx * 0.5 - 3.5, -21, 7, 4);
    x.fillStyle = '#090d16';
    x.beginPath(); x.ellipse(dx + 2.5, -1.5, 6.2, 2.8, 0, 0, TAU); x.fill();
  };
  tLeg(-walk * 9, false);
  tLeg(walk * 9, true);

  x.save();
  x.translate(0, hover);

  // 重装胸甲 + 符文核心
  const tg = x.createLinearGradient(-18, -78, 18, -32);
  tg.addColorStop(0, c.steelHi); tg.addColorStop(0.45, c.armor); tg.addColorStop(1, c.dark);
  x.fillStyle = tg;
  x.beginPath();
  x.moveTo(-18, -75); x.lineTo(18, -75);
  x.lineTo(14, -34); x.lineTo(-14, -34);
  x.closePath();
  x.fill();
  x.strokeStyle = c.gold; x.lineWidth = 1.6; x.stroke();

  // 胸口发光符文核心
  x.save(); x.shadowColor = '#fde68a'; x.shadowBlur = 10;
  x.fillStyle = '#fef3c7';
  chevron(x, 2, -56, 6.5, blue);
  x.restore();

  // 宽阔巨肩甲
  for (const sx of [-19, 17]) {
    x.fillStyle = c.main;
    x.beginPath(); x.ellipse(sx, -72, 10, 6.5, sx < 0 ? -0.25 : 0.25, 0, TAU); x.fill();
    x.strokeStyle = c.gold; x.lineWidth = 1.4; x.stroke();
  }

  // 头冠与头盔（蓝=黄金公牛神像，红=深渊巨熊领主）
  const hx = 1, hy = -87;
  const hg = x.createLinearGradient(hx - 10, hy - 10, hx + 10, hy + 10);
  hg.addColorStop(0, '#94a3b8'); hg.addColorStop(0.5, '#334155'); hg.addColorStop(1, '#0f172a');
  x.fillStyle = hg;
  x.beginPath();
  x.arc(hx, hy, 10.5, 0, TAU);
  x.fill();
  x.strokeStyle = c.gold; x.lineWidth = 1.3; x.stroke();

  // 发光双目
  x.save(); x.shadowColor = '#fde68a'; x.shadowBlur = 8;
  x.fillStyle = '#fef08a';
  x.fillRect(hx + 2, hy - 2, 7.5, 2.5);
  x.restore();

  if (blue) {
    // 冲天牛角
    x.strokeStyle = '#fde68a'; x.lineWidth = 3.5;
    x.beginPath(); x.moveTo(hx - 5, hy - 6); x.quadraticCurveTo(hx - 18, hy - 14, hx - 12, hy - 28); x.stroke();
    x.beginPath(); x.moveTo(hx + 5, hy - 6); x.quadraticCurveTo(hx + 20, hy - 14, hx + 14, hy - 28); x.stroke();
  } else {
    // 尖刺王冠 + 咆哮面甲
    x.fillStyle = c.gold;
    x.beginPath();
    x.moveTo(hx - 9, hy - 7); x.lineTo(hx - 11, hy - 20); x.lineTo(hx - 4, hy - 11);
    x.lineTo(hx + 1, hy - 23); x.lineTo(hx + 6, hy - 11); x.lineTo(hx + 11, hy - 19); x.lineTo(hx + 9, hy - 7);
    x.closePath(); x.fill();
  }

  // 悬浮符文光环
  x.save();
  x.strokeStyle = 'rgba(253,230,138,0.85)'; x.lineWidth = 1.6;
  x.beginPath(); x.ellipse(hx, hy - 22, 13, 4, 0, 0, TAU); x.stroke();
  x.restore();

  // 神器：巨型光剑 / 重型战锤
  x.save();
  x.shadowColor = c.light; x.shadowBlur = 10;
  if (blue) {
    x.fillStyle = c.gold; x.fillRect(14, -56, 12, 3);
    const sg = x.createLinearGradient(18, -56, 46, -98);
    sg.addColorStop(0, '#e0f2fe'); sg.addColorStop(1, c.light);
    x.fillStyle = sg;
    x.beginPath();
    x.moveTo(18, -56); x.lineTo(44, -104); x.lineTo(49, -101); x.lineTo(24, -53);
    x.closePath(); x.fill();
  } else {
    x.strokeStyle = '#78716c'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(12, -45); x.lineTo(36, -86); x.stroke();
    x.fillStyle = c.main;
    x.beginPath();
    x.roundRect ? x.roundRect(24, -98, 22, 16, 3) : x.rect(24, -98, 22, 16);
    x.fill();
    x.strokeStyle = c.gold; x.lineWidth = 1.5; x.stroke();
  }
  x.restore();
  x.restore();
}

/** 预渲染两军多兵种精灵：{ blue: { walk, idle, infantry, cavalry, siege, titan }, red: {...} } */
export function makeUnitSprites(COL) {
  const out = {};
  const builders = {
    infantry: drawUnit,
    cavalry: drawCavalry,
    siege: drawSiege,
    titan: drawTitan,
  };
  for (const side of ['blue', 'red']) {
    const pack = {};
    for (const [kind, spec] of Object.entries(UNIT_SPEC)) {
      const fn = builders[kind];
      const mk = (ph, moving) => {
        const c = document.createElement('canvas');
        c.width = Math.round(spec.W * spec.R);
        c.height = Math.round(spec.H * spec.R);
        const x = c.getContext('2d');
        x.scale(spec.R, spec.R);
        x.translate(spec.OX, spec.OY);
        fn(x, side, COL[side], ph, moving);
        return c;
      };
      pack[kind] = {
        walk: Array.from({ length: spec.FRAMES }, (_, i) => mk((i / spec.FRAMES) * TAU, true)),
        idle: mk(0, false),
      };
    }
    out[side] = {
      walk: pack.infantry.walk,
      idle: pack.infantry.idle,
      ...pack,
    };
  }
  return out;
}

/** 旗手的军旗（每帧绘制，只有少数士兵带） */
export function drawStandard(ctx, c, t, ph, blue) {
  ctx.strokeStyle = '#a8a08a'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-3.2, -10); ctx.lineTo(-3.2, -50); ctx.stroke();
  ctx.fillStyle = c.gold; ctx.beginPath(); ctx.arc(-3.2, -50.5, 1.1, 0, TAU); ctx.fill();
  ctx.fillStyle = c.main; ctx.beginPath(); ctx.moveTo(-3, -48.5);
  for (let i = 0; i <= 6; i++) { const k = i / 6; ctx.lineTo(-3 - k * 13, -48.5 + Math.sin(t * 6 + ph - k * 3) * 1.6 * k); }
  ctx.lineTo(-16 + 2.5, -41 + Math.sin(t * 6 + ph - 3) * 1.6); // 燕尾
  ctx.lineTo(-16, -33.5 + Math.sin(t * 6 + ph - 3) * 1.6);
  for (let i = 6; i >= 0; i--) { const k = i / 6; ctx.lineTo(-3 - k * 13, -33.5 + Math.sin(t * 6 + ph - k * 3) * 1.6 * k); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = c.gold; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; chevron(ctx, -9, -41 + Math.sin(t * 6 + ph - 1.5) * 1.1, 2.6, blue);
}

// ---------------- 城堡 ----------------
// 布局用“朝战场方向为正”的本地坐标（蓝军直接画，红军镜像），原点 = 城门中心的地面
export class Fortress {
  constructor(side, c) {
    this.side = side; this.c = c; this.blue = side === 'blue';
    this.dmg = 0; this.glow = 0.6; this.slits = []; this.fires = [];
    this.siegeMode = false; this.alert = 0; this.share = 0.5;
  }
  build(W, H, dpr, base, groundY, edge) {
    const k = this.k = clamp(H / 500, 0.5, 1.15), c = this.c;
    this.base = base; this.gy = groundY; this.dir = this.blue ? 1 : -1;
    const L = this.L = edge + 14, R = this.R = 46 * k, T = this.T = 218 * k, B = this.B = 14 * k;
    const cw = Math.ceil((L + R) * dpr), ch = Math.ceil((T + B) * dpr);
    const mk = () => { const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d'); x.scale(dpr, dpr); x.translate(L, T); return [cv, x]; };
    const [body, x] = mk(), [crack, y] = mk();
    this.slits = []; this.fires = [];
    const stone = (x0, top, w, h) => { // 石砌块：竖向渐变 + 砖缝 + 顶部高光 + 朝战场一侧的轮廓光
      const g = x.createLinearGradient(0, top, 0, top + h); g.addColorStop(0, c.stoneHi); g.addColorStop(1, c.stoneLo);
      x.fillStyle = g; x.fillRect(x0, top, w, h);
      x.save(); x.beginPath(); x.rect(x0, top, w, h); x.clip();
      const row = 6.5 * k; x.lineWidth = 0.7;
      for (let yy = top + row, r = 0; yy < top + h; yy += row, r++) {
        x.strokeStyle = 'rgba(0,0,0,.38)'; x.beginPath(); x.moveTo(x0, yy); x.lineTo(x0 + w, yy); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.035)'; x.beginPath(); x.moveTo(x0, yy + 0.8); x.lineTo(x0 + w, yy + 0.8); x.stroke();
        x.strokeStyle = 'rgba(0,0,0,.3)';
        for (let xx = x0 + ((r % 2) ? row * 0.9 : row * 1.8); xx < x0 + w; xx += row * 1.8) { x.beginPath(); x.moveTo(xx, yy - row); x.lineTo(xx, yy); x.stroke(); }
      }
      const sh = x.createLinearGradient(x0, 0, x0 + w, 0); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,255,255,.05)');
      x.fillStyle = sh; x.fillRect(x0, top, w, h);
      x.restore();
      x.fillStyle = c.rim; x.globalAlpha = 0.55; x.fillRect(x0 + w - 1.2, top, 1.2, h); x.globalAlpha = 1;
    };
    const crenel = (x0, top, w, mw = 5 * k, mh = 6 * k) => { // 城垛
      const n = Math.max(2, Math.round(w / (mw * 1.7)) | 1), step = w / n;
      for (let i = 0; i < n; i += 2) stone(x0 + i * step, top - mh, step, mh + 1);
      x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(x0, top, w, 1.2 * k);
    };
    const corbels = (x0, top, w) => { x.fillStyle = '#0a0d15'; for (let xx = x0 + 2 * k; xx < x0 + w - 2 * k; xx += 5 * k) { x.beginPath(); x.moveTo(xx, top); x.lineTo(xx + 3 * k, top); x.lineTo(xx + 1.5 * k, top + 4 * k); x.closePath(); x.fill(); } };
    const slit = (cx, cy, h = 9 * k) => { x.fillStyle = '#05070c'; x.fillRect(cx - 1.3 * k, cy, 2.6 * k, h); this.slits.push([cx, cy, h]); };

    // 背后城墙（延伸到画面边缘，增加体量）
    stone(-L, -78 * k, L - 20 * k, 78 * k + B); crenel(-L, -78 * k, L - 20 * k);
    // 外侧高塔 + 尖顶
    const ox = -34 * k, ow = 30 * k, oh = 150 * k;
    stone(ox - ow / 2, -oh, ow, oh + B);
    stone(ox - ow / 2 - 3 * k, -oh - 12 * k, ow + 6 * k, 12 * k); corbels(ox - ow / 2 - 3 * k, -oh, ow + 6 * k);
    crenel(ox - ow / 2 - 3 * k, -oh - 12 * k, ow + 6 * k);
    const rg = x.createLinearGradient(ox - ow / 2, 0, ox + ow / 2, 0); rg.addColorStop(0, '#0b0e17'); rg.addColorStop(0.55, c.roof); rg.addColorStop(1, '#0b0e17');
    const apex = -oh - 18 * k - 44 * k;
    x.fillStyle = rg; x.beginPath(); x.moveTo(ox - ow / 2 + 1 * k, -oh - 18 * k); x.lineTo(ox, apex); x.lineTo(ox + ow / 2 - 1 * k, -oh - 18 * k); x.closePath(); x.fill();
    x.strokeStyle = c.rim; x.globalAlpha = 0.6; x.lineWidth = 1; x.beginPath(); x.moveTo(ox, apex); x.lineTo(ox + ow / 2 - 1 * k, -oh - 18 * k); x.stroke(); x.globalAlpha = 1;
    x.strokeStyle = 'rgba(255,255,255,.06)'; for (let i = 1; i < 5; i++) { const yy = apex + (44 * k) * i / 5, hw = (ow / 2) * i / 5; x.beginPath(); x.moveTo(ox - hw, yy); x.lineTo(ox + hw, yy); x.stroke(); }
    this.flagAt = [ox, apex];
    for (let i = 0; i < 3; i++) slit(ox, -oh + 22 * k + i * 34 * k);
    // 城门楼（主堡）
    const kw = 46 * k, kh = 106 * k;
    stone(-kw / 2, -kh, kw, kh + B); corbels(-kw / 2, -kh + 8 * k, kw); crenel(-kw / 2, -kh, kw);
    // 拱门 + 铁闸
    const gw = 19 * k, gh = 31 * k;
    x.fillStyle = '#04060b'; x.beginPath(); x.moveTo(-gw / 2, B); x.lineTo(-gw / 2, -gh + gw / 2); x.arc(0, -gh + gw / 2, gw / 2, Math.PI, TAU); x.lineTo(gw / 2, B); x.closePath(); x.fill();
    x.strokeStyle = c.stoneHi; x.lineWidth = 2.2 * k; x.beginPath(); x.moveTo(-gw / 2 - 1.5 * k, 0); x.lineTo(-gw / 2 - 1.5 * k, -gh + gw / 2); x.arc(0, -gh + gw / 2, gw / 2 + 1.5 * k, Math.PI, TAU); x.lineTo(gw / 2 + 1.5 * k, 0); x.stroke();
    this.gate = [0, -gh, gw, gh];
    // 主堡上的垂幡（徽记）
    for (const bx of [-kw / 2 + 8 * k, kw / 2 - 8 * k]) {
      const top = -kh + 16 * k, bh = 38 * k, bw = 9 * k;
      x.fillStyle = c.dark; x.beginPath(); x.moveTo(bx - bw / 2, top); x.lineTo(bx + bw / 2, top); x.lineTo(bx + bw / 2, top + bh); x.lineTo(bx, top + bh - 5 * k); x.lineTo(bx - bw / 2, top + bh); x.closePath(); x.fill();
      x.fillStyle = c.main; x.fillRect(bx - bw / 2 + 1 * k, top, bw - 2 * k, bh - 7 * k);
      x.fillStyle = c.gold; x.fillRect(bx - bw / 2 - 1 * k, top - 1.5 * k, bw + 2 * k, 1.8 * k);
      x.fillStyle = 'rgba(255,255,255,.85)'; chevron(x, bx, top + 15 * k, 3 * k, this.blue);
    }
    slit(0, -kh + 22 * k, 7 * k);
    // 前塔（朝战场，顶部炮台）
    const fx = 31 * k, fw = 24 * k, fh = 80 * k;
    stone(fx - fw / 2, -fh, fw, fh + B); crenel(fx - fw / 2, -fh, fw);
    slit(fx, -fh + 18 * k); slit(fx, -fh + 46 * k);
    // 炮台：炮座 + 青铜炮管（炮弹从这里发射）
    const cx = fx + 2 * k, cy = -fh - 7 * k;
    x.fillStyle = '#151a28'; x.beginPath(); x.arc(cx - 3 * k, cy + 2 * k, 5 * k, Math.PI, TAU); x.fill();
    x.save(); x.translate(cx - 3 * k, cy); x.rotate(-0.5);
    const bg2 = x.createLinearGradient(0, -2.6 * k, 0, 2.6 * k); bg2.addColorStop(0, '#d9b36a'); bg2.addColorStop(0.5, '#8a6a33'); bg2.addColorStop(1, '#3b2c14');
    x.fillStyle = bg2; x.fillRect(0, -2.6 * k, 15 * k, 5.2 * k); x.fillStyle = '#2a1f0e'; x.fillRect(13 * k, -3.2 * k, 2.4 * k, 6.4 * k);
    x.restore();
    this.cannon = [cx - 3 * k + Math.cos(-0.5) * 15 * k, cy + Math.sin(-0.5) * 15 * k];
    // 火点（受压时在城垛上燃烧）
    this.fires = [[ox - 8 * k, -oh - 18 * k], [-kw / 2 + 10 * k, -kh - 6 * k], [kw / 2 - 12 * k, -kh - 6 * k], [fx, -fh - 6 * k], [-L + 30 * k, -84 * k], [ox + 9 * k, -oh - 18 * k]];
    // 裂痕图层（按受损程度淡入）
    const cracks = [[ox, -oh + 30 * k, 60 * k], [0, -kh + 10 * k, 55 * k], [fx - 4 * k, -fh + 8 * k, 42 * k], [-kw / 2 + 6 * k, -40 * k, 34 * k], [ox - 8 * k, -60 * k, 40 * k]];
    for (const [sx, sy, len] of cracks) {
      let px = sx, py = sy; const pts = [[px, py]];
      while (py < sy + len) { px += rnd(-5, 5) * k; py += rnd(4, 9) * k; pts.push([px, py]); }
      for (const [w, col] of [[2.6 * k, 'rgba(0,0,0,.85)'], [0.9 * k, 'rgba(255,140,60,.75)']]) {
        y.strokeStyle = col; y.lineWidth = w; y.beginPath(); pts.forEach(([a, b], i) => i ? y.lineTo(a, b) : y.moveTo(a, b)); y.stroke();
      }
      const [bx, by] = pts[(pts.length / 2) | 0]; y.strokeStyle = 'rgba(0,0,0,.7)'; y.lineWidth = 1.2 * k; y.beginPath(); y.moveTo(bx, by); y.lineTo(bx + rnd(-10, 10) * k, by + rnd(4, 10) * k); y.stroke();
    }
    // 缺口（受损严重时城垛崩掉一块）
    y.fillStyle = 'rgba(5,7,12,.95)'; y.beginPath(); y.moveTo(kw / 2 - 14 * k, -kh - 7 * k); y.lineTo(kw / 2 - 2 * k, -kh - 7 * k); y.lineTo(kw / 2 - 4 * k, -kh + 6 * k); y.lineTo(kw / 2 - 10 * k, -kh + 1 * k); y.closePath(); y.fill();
    this.body = body; this.crack = crack;
  }
  // 本地坐标 → 画布坐标
  X(lx) { return this.base + this.dir * lx; }
  cannonPos() { return [this.X(this.cannon[0]), this.gy + this.cannon[1]]; }
  ballistaPos() {
    const fx = this.flagAt ? this.flagAt[0] : -34 * this.k;
    return [this.X(fx + 18 * this.k), this.gy - 110 * this.k];
  }
  /** share：本方战力占比（0~1）；surge：本方是否总攻；besieged：三道防线均告破进入主堡攻城态 */
  update(dt, share, surge, besieged = false) {
    this.share = share;
    this.siegeMode = !!besieged;
    const dmgT = clamp((0.44 - share) / 0.28, 0, 1) + (besieged ? 0.22 : 0);
    this.dmg += (clamp(dmgT, 0, 1) - this.dmg) * (1 - Math.exp(-dt * 1.2));
    const gT = clamp(0.25 + share * 0.9, 0.2, 1) + (surge ? 0.35 : 0);
    this.glow += (gT - this.glow) * (1 - Math.exp(-dt * 2));
    const alT = besieged ? 1 : 0;
    this.alert += (alT - this.alert) * (1 - Math.exp(-dt * 2.5));
  }
  draw(ctx, t, sprites, quality, rm) {
    const { k, c, dir, gy } = this; if (!this.body) return;
    // 背光
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.35 * this.glow;
    ctx.drawImage(sprites[this.side], this.X(-20 * k) - 90 * k, gy - 190 * k, 180 * k, 230 * k);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(this.base, gy); ctx.scale(dir, 1);
    ctx.drawImage(this.body, -this.L, -this.T, this.L + this.R, this.T + this.B);
    if (this.dmg > 0.02) { ctx.globalAlpha = this.dmg; ctx.drawImage(this.crack, -this.L, -this.T, this.L + this.R, this.T + this.B); ctx.globalAlpha = 1; }
    ctx.restore();
    // 箭窗灯光（受损越重越暗、越偏火光）
    const fl = rm ? 0 : 1;
    for (let i = 0; i < this.slits.length; i++) {
      const [sx, sy, h] = this.slits[i], f = 0.65 + 0.35 * Math.sin(t * (3 + i) + i * 1.7) * fl;
      const a = clamp(this.glow * f, 0.15, 1);
      ctx.fillStyle = this.dmg > 0.5 ? `rgba(255,150,70,${a})` : `rgba(${c.glow.join(',')},${a})`;
      ctx.fillRect(this.X(sx) - 1 * k, gy + sy + 1 * k, 2 * k, h - 2 * k);
    }
    // 城门：门洞内的符能光 + 铁闸
    const [, gt, gw, gh] = this.gate, pulse = 0.5 + 0.5 * Math.sin(t * 2.4) * fl;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(this.glow * (0.45 + 0.3 * pulse), 0, 0.9);
    ctx.drawImage(sprites[this.side], this.X(0) - gw, gy + gt - 4 * k, gw * 2, gh + 12 * k);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(20,24,36,.95)'; ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) { const xx = this.X(i * gw / 5.5); ctx.moveTo(xx, gy + gt + 3 * k); ctx.lineTo(xx, gy); }
    for (let j = 1; j <= 4; j++) { const yy = gy + gt + j * gh / 4.6; ctx.moveTo(this.X(-gw / 2), yy); ctx.lineTo(this.X(gw / 2), yy); }
    ctx.stroke();
    // 尖顶军旗（文字不镜像）
    const [fx0, fy0] = this.flagAt, px = this.X(fx0), py = gy + fy0;
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 34 * k); ctx.stroke();
    const fw = 34 * k, fh = 21 * k, top = py - 33 * k, wv = rm ? 0.3 : 1;
    ctx.fillStyle = c.main; ctx.beginPath(); ctx.moveTo(px, top);
    for (let i = 0; i <= 10; i++) { const q = i / 10; ctx.lineTo(px + dir * fw * q, top + Math.sin(t * 5 * wv - q * 4) * 2.6 * q * k); }
    ctx.lineTo(px + dir * (fw - 6 * k), top + fh / 2 + Math.sin(t * 5 * wv - 4) * 2.6 * k);
    for (let i = 10; i >= 0; i--) { const q = i / 10; ctx.lineTo(px + dir * fw * q, top + fh + Math.sin(t * 5 * wv - q * 4) * 2.6 * q * k); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = c.gold; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(12 * k + 2)}px -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.label || '', px + dir * fw * 0.42, top + fh / 2 + Math.sin(t * 5 * wv - 1.7) * 1.4 * k);
    // 受压起火
    if (this.dmg > 0.2) {
      const n = Math.min(this.fires.length, Math.ceil((this.dmg - 0.2) / 0.8 * this.fires.length * (quality >= 2 ? 0.5 : 1)));
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const [lx, ly] = this.fires[i], f = 0.7 + 0.3 * Math.sin(t * 13 + i * 2.1) * fl, s = (14 + 10 * this.dmg) * k * f;
        ctx.globalAlpha = 0.85 * f; ctx.drawImage(sprites.fire, this.X(lx) - s / 2, gy + ly - s * 0.8, s, s * 1.2);
        ctx.globalAlpha = 0.6; ctx.drawImage(sprites.white, this.X(lx) - s * 0.2, gy + ly - s * 0.35, s * 0.4, s * 0.5);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // 主堡攻城决战态：城垛警戒信标 + 铁闸过载能量条 + 堡垒防御条
    if (this.alert > 0.05) {
      const al = this.alert;
      const ap = rm ? 0.7 : (0.45 + 0.55 * Math.sin(t * 7.5));
      // 城门过载金红铁闸光柱
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(253,230,138,${0.7 * al * ap})`;
      ctx.lineWidth = 2.1 * k;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const xx = this.X(i * gw / 5.5);
        ctx.moveTo(xx, gy + gt + 3 * k);
        ctx.lineTo(xx, gy);
      }
      ctx.stroke();
      // 主堡城垛脉冲警报灯
      const [bx, by] = this.ballistaPos();
      ctx.globalAlpha = 0.85 * al * ap;
      ctx.drawImage(sprites.gold, bx - 16 * k, by - 16 * k, 32 * k, 32 * k);
      ctx.globalCompositeOperation = 'source-over';
      // 主堡顶部防御完整度条
      const bw = 42 * k, bh = 5 * k, barX = this.X(4 * k) - bw / 2, barY = gy - 122 * k;
      ctx.globalAlpha = 0.9 * al;
      ctx.fillStyle = 'rgba(6,9,20,0.86)';
      ctx.fillRect(barX - 1, barY - 1, bw + 2, bh + 2);
      const hp = clamp(1 - this.dmg * 0.65, 0.12, 1);
      ctx.fillStyle = hp > 0.45 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(barX, barY, bw * hp, bh);
      ctx.strokeStyle = 'rgba(253,230,138,0.6)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(barX - 1, barY - 1, bw + 2, bh + 2);
      ctx.restore();
    }
  }
  /** 起火点（用于冒烟），受损越重越多 */
  smokeSpot() { const n = Math.ceil(this.dmg * this.fires.length); const [lx, ly] = this.fires[(Math.random() * n) | 0]; return [this.X(lx), this.gy + ly - 6 * this.k]; }
}
