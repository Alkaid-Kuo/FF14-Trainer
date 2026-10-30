/* 3D 渲染（Three.js）：第三人稱跟隨鏡頭、程式生成模型、FF14 風格預警圈（讀條時填滿）、粒子與特效、場地主題。
   世界座標與 2D 相同：x 東、z 南、北 = -z。 */
(function (root) {
'use strict';
const T = root.THREE;
const MD = root.UWU_MODELS, IC = root.UWU_ICONS;
const { C, ROLES, WM_COLOR, ipos, irot } = root.UWU;
const fxState = root.fxState;
const PI = Math.PI;
const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';

const TINT = { danger: 0xff7a24, line: 0x3fe8a0, rain: 0x8fd0ff, share: 0xffc23a, meso: 0xc47bff, good: 0x5ab4ff, fire: 0xff5a1e, earth: 0xe8a04a };
const TETHER = { plume: 0xe6d8ff, spiny: 0x9be05a, meso: 0xc47bff, fetters: 0xff3b2a, chain: 0xffb060 };
const MARK_TYPES = ['song', 'friction', 'crush', 'gaol'];
const FIRE_RE = /Eruption|Plume|Incinerate|Crimson|深紅|十字|Searing|Crush|碎擊|地火|炎柱/;
const WIND_RE = /Whirlwind|Song|Wheel|Eye|Downburst|Slipstream|Friction|Gigastorm|邪輪|旋風/;
const WHITE = new T.Color(0xffffff);

const THEMES = {
  p1: { sky: ['#3f86c8', '#9fcbe6', '#dcecf4'], fog: 0x9fc6de, fogNear: 70, fogFar: 260, hemi: [0xdff0ff, 0x46564c, 1.15], sun: [0xfff1d8, 2.1], floor: 'wind', wall: 0x9ff2ff, below: 'clouds' },
  p2: { sky: ['#140302', '#5a1405', '#ff6a1a'], fog: 0x3a0e05, fogNear: 55, fogFar: 200, hemi: [0xffb08a, 0x2a0805, 1.25], sun: [0xffb070, 2.5], floor: 'lava', wall: 0xff7a2a, below: 'lava' },
  p3: { sky: ['#3a2a18', '#a4834e', '#e6cfa2'], fog: 0xb89a70, fogNear: 70, fogFar: 240, hemi: [0xffe8c4, 0x4a3a28, 1.15], sun: [0xffe2b4, 2.3], floor: 'earth', wall: 0xffc070, below: 'dust' },
  p4: { sky: ['#0c0a1e', '#2e2456', '#8a78c0'], fog: 0x3a3060, fogNear: 60, fogFar: 230, hemi: [0xd8ccff, 0x2a2440, 1.1], sun: [0xe0d8ff, 2.0], floor: 'wind', wall: 0xb08aff, below: 'clouds' },
};

const canvasTex = (c, repeat) => {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
  return t;
};
const texCache = {};
const iconTex = (key, fn) => texCache[key] || (texCache[key] = canvasTex(fn()));

function textSprite(text, opt) {
  opt = opt || {};
  const h = 64, pad = 22;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `bold ${opt.size || 40}px ${FONT}`;
  const w = Math.max(h, Math.ceil(ctx.measureText(text).width) + pad * 2);
  c.width = w; c.height = h;
  ctx.font = `bold ${opt.size || 40}px ${FONT}`;
  ctx.fillStyle = opt.bg || 'rgba(8,12,20,0.7)';
  const r = 18;
  ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r); ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r); ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.fill();
  ctx.fillStyle = opt.fg || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = canvasTex(c);
  tex.minFilter = T.LinearFilter;
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  const k = opt.scale || 0.0092;
  s.scale.set(w * k, h * k, 1);
  s.renderOrder = 20;
  return s;
}
function disposeSprite(s) { if (s && s.material) { if (s.material.map) s.material.map.dispose(); s.material.dispose(); } }
function disposeTree(o) {
  o.traverse((n) => {
    if (n.isSprite) { disposeSprite(n); return; }
    if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
    if (n.material && !n.material.userData.shared) n.material.dispose();
  });
}
function iconSprite(canvas, size) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: iconTex(canvas.__key || (canvas.__key = 'c' + Math.random()), () => canvas), transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(size, size, 1); s.renderOrder = 21;
  return s;
}

// ------------------------------------------------------------------ 場地貼圖
function floorCanvas(kind) {
  const S = 2048, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const R = S / 2, k = S / (2 * C.ARENA_R);
  const lava = kind === 'lava', earth = kind === 'earth';
  const g = ctx.createRadialGradient(R, R, 0, R, R, R);
  if (lava) { g.addColorStop(0, '#463430'); g.addColorStop(1, '#231916'); }
  else if (earth) { g.addColorStop(0, '#a88e66'); g.addColorStop(1, '#6e5a40'); }
  else { g.addColorStop(0, '#9fb0b8'); g.addColorStop(1, '#5e707b'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // 石材雜點
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S, y = Math.random() * S, s = 2 + Math.random() * 7;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${0.03 + Math.random() * 0.05})` : `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(x, y, s, s);
  }
  // 地磚：同心環＋放射線
  if (earth) {   // 乾裂的地面
    ctx.strokeStyle = 'rgba(60,38,16,0.35)'; ctx.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      let x = Math.random() * S, y = Math.random() * S, a = Math.random() * PI * 2;
      ctx.lineWidth = 2 + Math.random() * 3; ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { a += (Math.random() - 0.5) * 1.2; x += Math.cos(a) * 40; y += Math.sin(a) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  ctx.strokeStyle = lava ? 'rgba(0,0,0,0.35)' : earth ? 'rgba(60,38,16,0.28)' : 'rgba(40,60,70,0.22)'; ctx.lineWidth = 3;
  for (let r = 2.5; r < C.ARENA_R; r += 2.5) { ctx.beginPath(); ctx.arc(R, R, r * k, 0, PI * 2); ctx.stroke(); }
  for (let ring = 0; ring < 8; ring++) {
    const r0 = ring * 2.5, r1 = r0 + 2.5, n = Math.max(6, Math.round((r0 + 1) * 3.2));
    for (let i = 0; i < n; i++) {
      const a = (i + (ring % 2) * 0.5) / n * PI * 2;
      ctx.beginPath(); ctx.moveTo(R + Math.cos(a) * r0 * k, R + Math.sin(a) * r0 * k); ctx.lineTo(R + Math.cos(a) * r1 * k, R + Math.sin(a) * r1 * k); ctx.stroke();
    }
  }
  // 雕刻環（5/10/15）
  for (const r of [5, 10, 15]) {
    ctx.lineWidth = 10; ctx.strokeStyle = lava ? 'rgba(0,0,0,0.5)' : earth ? 'rgba(50,30,10,0.4)' : 'rgba(30,50,60,0.35)'; ctx.beginPath(); ctx.arc(R, R, r * k, 0, PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = lava ? 'rgba(255,140,80,0.25)' : earth ? 'rgba(255,230,180,0.45)' : 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(R, R, r * k + 6, 0, PI * 2); ctx.stroke();
  }
  // 中央紋章
  ctx.save(); ctx.translate(R, R);
  ctx.strokeStyle = lava ? 'rgba(255,150,80,0.35)' : earth ? 'rgba(110,70,30,0.5)' : 'rgba(70,140,160,0.45)'; ctx.lineWidth = 7;
  const arms = lava ? 8 : earth ? 4 : 3;
  for (let arm = 0; arm < arms; arm++) {
    ctx.save(); ctx.rotate(arm * PI * 2 / arms);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = i / 60 * (lava ? 0.6 : 3.2), r = (lava ? 1.5 + i / 60 * 2.6 : 0.4 + i / 60 * 3.6) * k;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  // 外圈符文帶
  ctx.fillStyle = lava ? 'rgba(10,4,2,0.55)' : earth ? 'rgba(50,32,14,0.4)' : 'rgba(40,60,75,0.35)';
  ctx.beginPath(); ctx.arc(R, R, C.ARENA_R * k, 0, PI * 2); ctx.arc(R, R, 18.7 * k, 0, PI * 2, true); ctx.fill();
  ctx.strokeStyle = lava ? 'rgba(255,120,60,0.6)' : earth ? 'rgba(255,215,150,0.6)' : 'rgba(230,250,255,0.65)'; ctx.lineWidth = 4;
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * PI * 2, r0 = 19.0 * k, r1 = 19.6 * k;
    ctx.beginPath(); ctx.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); ctx.lineTo(R + Math.cos(a + (i % 3 === 0 ? 0.03 : 0)) * r1, R + Math.sin(a) * r1); ctx.stroke();
  }
  return c;
}
function lavaCracks() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#ff7a2a'; ctx.shadowColor = '#ff5a10'; ctx.shadowBlur = 12; ctx.lineCap = 'round';
  for (let i = 0; i < 30; i++) {
    let x = Math.random() * S, y = Math.random() * S, a = Math.random() * PI * 2;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) { a += (Math.random() - 0.5) * 1.4; x += Math.cos(a) * 30; y += Math.sin(a) * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return c;
}
function gradientStrip(stops) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([p, col]) => g.addColorStop(p, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  return c;
}
function wallCanvas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 512, w = 2 + Math.random() * 10, h = 40 + Math.random() * 88;
    const g = ctx.createLinearGradient(0, 128, 0, 128 - h);
    g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 128 - h, w, h);
  }
  const g2 = ctx.createLinearGradient(0, 128, 0, 0);
  g2.addColorStop(0, 'rgba(255,255,255,0.55)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, 512, 128);
  return c;
}
function cloudCanvas(kind) {
  const lava = kind === 'lava', dust = kind === 'dust';
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  if (lava) {
    ctx.fillStyle = '#ff6a10'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(40,8,2,0.9)'); g.addColorStop(1, 'rgba(40,8,2,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else {
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 30 + Math.random() * 110;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c0 = dust ? 'rgba(235,205,160,0.6)' : 'rgba(255,255,255,0.55)', c1 = dust ? 'rgba(235,205,160,0)' : 'rgba(255,255,255,0)';
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  return c;
}

// ------------------------------------------------------------------ 粒子（CPU 更新的 Points）
class Particles {
  constructor(scene, max, size, tex, additive) {
    this.max = max; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.ttl = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;
    const g = new T.BufferGeometry();
    this.aPos = new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage);
    this.aCol = new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol);
    const m = new T.PointsMaterial({ size, map: canvasTex(tex), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, sizeAttenuation: true });
    // 限制粒子在螢幕上的最大尺寸：離鏡頭很近的粒子會被放大到蓋滿畫面，大量重疊時非常吃效能
    this.maxPx = { value: 40 };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.maxPx = this.maxPx;
      sh.vertexShader = 'uniform float maxPx;\n' + sh.vertexShader.replace('#include <fog_vertex>', 'gl_PointSize = min( gl_PointSize, maxPx );\n#include <fog_vertex>');
    };
    this.points = new T.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    this.alive = 0; this.keep = 1;
  }
  spawn(x, y, z, vx, vy, vz, ttl, color, grav, drag) {
    if (this.keep < 1 && Math.random() > this.keep) return;   // 畫質較低時少一點粒子
    const i = this.cursor; this.cursor = (i + 1) % this.max;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.base[j] = color.r; this.base[j + 1] = color.g; this.base[j + 2] = color.b;
    this.life[i] = ttl; this.ttl[i] = ttl; this.grav[i] = grav || 0; this.drag[i] = drag === undefined ? 1 : drag;
    this.alive = Math.max(this.alive, 1);
  }
  update(dt) {
    if (!this.alive) return;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[j + 1] = -999; this.col[j] = this.col[j + 1] = this.col[j + 2] = 0; continue; }
      n++;
      const d = Math.pow(this.drag[i], dt);
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = Math.min(1, this.life[i] / this.ttl[i] * 1.6);
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
    }
    this.alive = n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
  }
  clear() {
    this.life.fill(0); this.col.fill(0);
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -999;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.alive = 0;
  }
}

const MIN_DIST = 2, MIN_PITCH = 0.09;
/** 畫質：dpr＝解析度上限；shadows＝即時陰影（否則用腳下圓形影子，便宜很多）；particles＝粒子保留比例；wall＝邊緣光牆；fireLight＝伊弗利特火光。 */
const QUALITY = {
  high: { dpr: 2, shadows: true, particles: 1, wall: true, fireLight: true },
  normal: { dpr: 1.5, shadows: false, particles: 1, wall: true, fireLight: false },
  smooth: { dpr: 1, shadows: false, particles: 0.5, wall: false, fireLight: false },
};
const BLOB_R = { garuda: 1.7, sister: 1.2, ifrit: 2.0, ifrit_clone: 1.6, titan: 3.2, bomb: 1.0, gaol: 1.3, spiny: 0.6, plume: 0.4, nail: 1.2, shard: 0.4, ultima: 2.8, lahabrea: 0.8, bit: 0.5, orb: 0.8, feather: 0.7 };
const SH = (g) => { g.userData.shared = true; return g; };

class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = false; r.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(45, 1, 0.1, 600);
    this.cam = { yaw: 0, pitch: 0.74, dist: 20 };
    /** 鏡頭限制（預設為 FF14 近似值，可由側邊欄調整）：最大縮放距離 yalm、垂直視野角°、最大俯視角°。 */
    this.limits = { maxDist: 20, fov: 45, maxPitchDeg: 80 };
    this.shake = 0;
    this.last = performance.now();

    this.hemi = new T.HemisphereLight(0xffffff, 0x444444, 1.5); this.scene.add(this.hemi);
    const sun = this.sun = new T.DirectionalLight(0xffffff, 2.6);
    sun.position.set(14, 32, 10); sun.castShadow = false;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.fireLight = new T.PointLight(0xff5a1a, 0, 14, 2); this.scene.add(this.fireLight);

    this.texRadial = canvasTex(IC.aoeRadial()); this.texLinear = canvasTex(IC.aoeLinear());
    this.texFlame = canvasTex(IC.flame()); this.texSwirl = canvasTex(IC.swirl(), true);
    this.texStack = canvasTex(IC.stackRing()); this.texChev = canvasTex(IC.chevrons(), true);
    this.texBlob = canvasTex(IC.softDot());
    this.blobGeo = SH(new T.CircleGeometry(1, 20));
    this.sparks = new Particles(this.scene, 2600, 0.42, IC.softDot(), true);
    this.glows = new Particles(this.scene, 900, 1.3, IC.softDot(), true);
    this.feathers = new Particles(this.scene, 500, 0.75, IC.feather(), false);

    this.arena = new T.Group(); this.scene.add(this.arena);
    this.themeId = null;
    this.buildStatic();

    this.charObjs = ROLES.map((role) => this.makeChar(role));
    this.actorObjs = new Map(); this.zoneObjs = new Map(); this.fxMap = new Map();
    this.tornados = new Map(); this.effects = [];
    this.tetherPool = [];
    for (let i = 0; i < 14; i++) {
      const m = new T.Mesh(SH(new T.CylinderGeometry(1, 1, 1, 8, 1, true)), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
      m.visible = false; this.scene.add(m); this.tetherPool.push(m);
    }
    this.guideObjs = [this.makeGuideMarker(1), this.makeGuideMarker(0.5)];
    this.previewPool = [];
    for (let i = 0; i < 12; i++) {
      const m = new T.Mesh(SH(new T.RingGeometry(0.88, 1, 48)), new T.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
      m.rotation.x = -PI / 2; m.position.y = 0.06; m.visible = false; this.scene.add(m); this.previewPool.push(m);
    }
    this.sim = null;
    this.Q = QUALITY.normal; this.quality = null;
    this.setQuality('normal');
  }

  /** 切換畫質（高／標準／流暢）。陰影開關會讓材質重新編譯，所以之後會預先編譯一次。 */
  setQuality(q) {
    const Q = QUALITY[q];
    this.quality = q; this.Q = Q;
    this.renderer.setPixelRatio(Math.min(Q.dpr, window.devicePixelRatio || 1));
    this.resize();
    const pr = this.renderer.getPixelRatio();
    for (const p of [this.sparks, this.glows, this.feathers]) p.maxPx.value = (p === this.glows ? 56 : 28) * pr;
    if (this.renderer.shadowMap.enabled !== Q.shadows) {
      this.renderer.shadowMap.enabled = Q.shadows; this.sun.castShadow = Q.shadows;
      this.scene.traverse((n) => { if (n.material) n.material.needsUpdate = true; });
    }
    for (const p of [this.sparks, this.glows, this.feathers]) p.keep = Q.particles;
    if (this.wall) this.wall.visible = Q.wall;
    this.fireLight.visible = Q.fireLight && this.themeId === 'p2';
    if (this.themeId) this.prewarm();
  }
  blob(r) {
    const m = new T.Mesh(this.blobGeo, new T.MeshBasicMaterial({ color: 0x000000, map: this.texBlob, transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -PI / 2; m.scale.set(r, r, 1); m.renderOrder = 1;
    return m;
  }
  /** 預先編譯所有會用到的材質（第一次出現新東西時才編譯著色器會卡一下）。
      編好的暫存物件保留（隱藏）到下一次預熱，材質沒被釋放，著色器才會留在快取裡。 */
  prewarm() {
    const old = this.warm;
    const made = ['garuda', 'sister', 'ifrit', 'ifrit_clone', 'titan', 'bomb', 'gaol', 'spiny', 'plume', 'nail', 'shard', 'orb', 'feather'].map((look) => this.makeActor({ look, name: look, tint: '#e0b25a', blue: false }));
    made.push(this.makeActor({ look: 'ifrit_clone', name: 'b', blue: true }));
    const fakes = [
      { kind: 'circle', r: 3, tint: 'danger' }, { kind: 'circle', r: 3, tint: 'share' }, { kind: 'rect', len: 10, w: 4, tint: 'line' },
      { kind: 'cone', len: 5, half: 0.5, tint: 'danger' }, { kind: 'ring', inner: 3, r: 6, tint: 'danger' }, { kind: 'rect', len: 10, w: 4, tint: 'earth' },
    ].map((f, i) => Object.assign({ id: 900000 + i, x: 0, z: 0, rot: 0, label: '' }, f));
    const fxObjs = fakes.map((f) => this.buildFx(f));
    const nEff = this.effects.length;
    this.firePillar(0, 0, 1, 2, 0xffffff); this.shockRing(0, 0, 1, 2, 0xffffff); this.beam({ x: 0, z: 0, rot: 0, len: 5, w: 2 }, 0xffffff);
    const tz = new T.Group(); this.scene.add(tz);
    this.renderer.compile(this.scene, this.camera);
    const keep = made.map((info) => info.m.group).concat(fxObjs, this.effects.splice(nEff).map((e) => e.obj));
    for (const o of keep) o.visible = false;
    this.scene.remove(tz);
    if (old) for (const o of old) { this.scene.remove(o); disposeTree(o); }
    this.warm = keep;
  }

  // ---------------------------------------------------------------- 場地
  buildStatic() {
    // 天空球（主題切換時改頂點色）
    const sg = new T.SphereGeometry(300, 32, 20);
    sg.setAttribute('color', new T.BufferAttribute(new Float32Array(sg.attributes.position.count * 3), 3));
    this.sky = new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    this.scene.add(this.sky);
    // 平台
    const stone = new T.MeshStandardMaterial({ color: 0x8a96a0, roughness: 0.9 });
    this.platformMat = stone;
    const rim = new T.Mesh(new T.RingGeometry(C.ARENA_R, C.ARENA_R + 1.0, 128), stone); rim.rotation.x = -PI / 2; rim.position.y = 0.005; rim.receiveShadow = true;
    const side = new T.Mesh(new T.CylinderGeometry(C.ARENA_R + 1.0, C.ARENA_R - 3, 5, 96, 1, true), stone); side.position.y = -2.5;
    this.arena.add(rim, side);
    // 地板（主題切換時換貼圖）
    this.floorMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.04 });
    const floor = new T.Mesh(new T.CircleGeometry(C.ARENA_R, 128), this.floorMat); floor.rotation.x = -PI / 2; floor.receiveShadow = true;
    this.arena.add(floor);
    // 場地標點（玩家可自訂，render 時依版本號重建）
    this.wmGroup = new T.Group(); this.arena.add(this.wmGroup); this.wmVer = -1;
    this.wmBeamTex = canvasTex(gradientStrip([[0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0.9)']]));
    this.wmGeo = { let: SH(new T.PlaneGeometry(3.2, 3.2)), num: SH(new T.PlaneGeometry(2.6, 2.6)), beam: SH(new T.CylinderGeometry(1.25, 1.25, 3.2, 24, 1, true)), beamNum: SH(new T.CylinderGeometry(1.0, 1.0, 3.2, 24, 1, true)) };
    // 邊緣（碰到會死）：外圈發光牆（不閃爍、不流動）
    this.wallTex = canvasTex(wallCanvas(), true); this.wallTex.repeat.set(10, 1);
    this.wallMat = new T.MeshBasicMaterial({ map: this.wallTex, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const wall = this.wall = new T.Mesh(new T.CylinderGeometry(C.ARENA_R + 0.05, C.ARENA_R + 0.05, 4.5, 128, 1, true), this.wallMat); wall.position.y = 2.25;
    this.arena.add(wall);
    // 場外：雲海／岩漿
    this.belowMat = new T.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true });
    this.below = new T.Mesh(new T.PlaneGeometry(900, 900), this.belowMat); this.below.rotation.x = -PI / 2;
    this.scene.add(this.below);
  }

  applyTheme(id) {
    const th = THEMES[id] || THEMES.p1;
    this.themeId = id;
    const cols = th.sky.map((s) => new T.Color(s));
    const g = this.sky.geometry, pos = g.attributes.position, col = g.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 300;
      const c = y > 0 ? cols[1].clone().lerp(cols[0], Math.min(1, y * 1.6)) : cols[1].clone().lerp(cols[2], Math.min(1, -y * 2.5));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    this.scene.fog = new T.Fog(th.fog, th.fogNear, th.fogFar);
    this.hemi.color.set(th.hemi[0]); this.hemi.groundColor.set(th.hemi[1]); this.hemi.intensity = th.hemi[2];
    this.sun.color.set(th.sun[0]); this.sun.intensity = th.sun[1];
    if (this.floorMat.map) this.floorMat.map.dispose();
    this.floorMat.map = canvasTex(floorCanvas(th.floor)); this.floorMat.map.anisotropy = 8;
    if (th.floor === 'lava') {
      this.floorMat.emissiveMap = canvasTex(lavaCracks()); this.floorMat.emissive = new T.Color(0xff6a20); this.floorMat.emissiveIntensity = 0.75;
    } else { this.floorMat.emissiveMap = null; this.floorMat.emissive = new T.Color(0x000000); }
    this.floorMat.needsUpdate = true;
    this.platformMat.color.set(th.floor === 'lava' ? 0x3a2a24 : th.floor === 'earth' ? 0x6a5440 : 0x8a96a0);
    this.wallMat.color.set(th.wall);
    if (this.belowMat.map) this.belowMat.map.dispose();
    const lava = th.below === 'lava';
    this.belowMat.map = canvasTex(cloudCanvas(th.below), true); this.belowMat.map.repeat.set(lava ? 6 : 3, lava ? 6 : 3);
    this.belowMat.color.set(lava ? 0x9a8a80 : th.below === 'dust' ? 0xd8c0a0 : 0xffffff); this.belowMat.opacity = lava ? 1 : 0.85;
    this.belowMat.needsUpdate = true;
    this.below.position.y = lava ? -9 : -26;
    this.fireLight.visible = this.Q.fireLight && id === 'p2';
    this.prewarm();
  }

  // ---------------------------------------------------------------- 物件
  /** 重建場地標點（字母標點有光柱，數字標點只有地面圖示）。 */
  setWaymarks(list) {
    for (const m of this.wmGroup.children) m.material.dispose();
    this.wmGroup.clear();
    for (const { k, x, z } of list) {
      const col = WM_COLOR[k], num = /\d/.test(k);
      const m = new T.Mesh(num ? this.wmGeo.num : this.wmGeo.let, new T.MeshBasicMaterial({ map: iconTex('wm' + k, () => IC.waymark(k, col)), transparent: true, depthWrite: false, opacity: num ? 0.75 : 0.95 }));
      m.rotation.x = -PI / 2; m.position.set(x, 0.025, z); m.renderOrder = 1;
      this.wmGroup.add(m);
      // 光柱：數字標點細一點、淡一點
      const beam = new T.Mesh(num ? this.wmGeo.beamNum : this.wmGeo.beam, new T.MeshBasicMaterial({ color: col, map: this.wmBeamTex, transparent: true, opacity: num ? 0.28 : 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      beam.position.set(x, 1.6, z); this.wmGroup.add(beam);
    }
  }
  /** 螢幕座標 → 地面（y=0）座標；看不到地面時回傳 null。 */
  groundAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.ray = this.ray || new T.Raycaster();
    this.ray.setFromCamera(new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (d.y > -1e-4) return null;
    const k = -o.y / d.y;
    return { x: o.x + d.x * k, z: o.z + d.z * k };
  }

  makeChar(role) {
    const m = MD.character(role);
    m.group.rotation.order = 'YXZ';
    const ring = new T.Mesh(SH(new T.RingGeometry(0.7, 0.9, 40)), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -PI / 2; ring.position.y = 0.04; ring.visible = false;
    const lab = textSprite(role.key, { fg: '#fff', bg: role.color, size: 42 });
    lab.position.y = 2.6;
    const markers = {};
    for (const k of MARK_TYPES) { const s = iconSprite(IC.marker(k), 1.25); s.visible = false; m.group.add(s); markers[k] = s; }
    m.group.add(ring, lab);
    this.scene.add(m.group);
    const blob = this.blob(0.6); this.scene.add(blob);
    // 讀條光圈（腳下，藍：攻擊、金：復活）與倒地者的「已收到復活」標記：放在場景上（倒地時角色群組會躺平）
    const castRing = new T.Mesh(SH(new T.RingGeometry(0.95, 1.2, 48)), new T.MeshBasicMaterial({ color: 0x7fc4ff, side: T.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending }));
    castRing.rotation.x = -PI / 2; castRing.visible = false; this.scene.add(castRing);
    const raiseMark = textSprite('✚ 復活', { fg: '#2a1d00', bg: '#ffd866', size: 34 }); raiseMark.visible = false; this.scene.add(raiseMark);
    return { m, ring, lab, markers, blob, castRing, raiseMark, kbRef: null, kbT0: 0, kbDur: 1, deadT: -1, fallY: 0, spin: 0, walkSm: 0 };
  }

  makeActor(a) {
    let m;
    switch (a.look) {
      case 'garuda': m = MD.garuda(); break;
      case 'sister': m = MD.garuda(a.tint, 0.72); break;
      case 'ifrit': m = MD.ifrit('boss'); break;
      case 'ifrit_clone': m = MD.ifrit(a.blue ? 'blue' : 'clone'); break;
      case 'spiny': m = MD.spiny(); break;
      case 'plume': m = MD.plume(); break;
      case 'nail': m = MD.nail(); break;
      case 'titan': m = MD.titan(); break;
      case 'bomb': m = MD.bomb(); break;
      case 'gaol': m = MD.gaol(); break;
      case 'ultima': m = MD.ultima(); break;
      case 'lahabrea': m = MD.lahabrea(); break;
      case 'bit': m = MD.bit(); break;
      case 'orb': m = MD.orb(); break;
      case 'feather': m = MD.plume(0xc8f59a, 0x3a9a2a); m.float.scale.setScalar(1.9); break;
      default: m = MD.shard(); break;
    }
    const info = { m, label: null, badgeKey: '', badge: null, blob: this.blob(BLOB_R[a.look]) };
    info.blob.position.y = 0.02; m.group.add(info.blob);
    const labelY = { garuda: 6.2, sister: 4.6, ifrit: 6.2, ifrit_clone: 5.2, titan: 9.0, spiny: 2.6, nail: 4.6, shard: 2.4, ultima: 8.6, lahabrea: 4.0, bit: 2.6 }[a.look];
    const bg = { garuda: 'rgba(8,40,28,0.85)', ifrit: 'rgba(60,12,8,0.85)', ifrit_clone: 'rgba(60,12,8,0.8)', nail: 'rgba(60,20,8,0.85)', titan: 'rgba(56,38,16,0.85)', ultima: 'rgba(36,24,70,0.85)', lahabrea: 'rgba(50,8,8,0.85)' }[a.look];
    if (labelY) { const l = textSprite(a.name, { fg: '#fff', bg: bg || 'rgba(8,12,20,0.75)', size: 36 }); l.position.y = labelY; m.group.add(l); info.label = l; }
    this.scene.add(m.group);
    return info;
  }

  makeBubble(z) {
    const group = new T.Group();
    const dome = new T.Mesh(new T.SphereGeometry(z.r, 40, 16, 0, PI * 2, 0, PI / 2), new T.MeshBasicMaterial({ color: 0x66c4ff, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    const disc = new T.Mesh(new T.CircleGeometry(z.r, 64), new T.MeshBasicMaterial({ color: 0x66c4ff, map: this.texRadial, transparent: true, opacity: 0.4, depthWrite: false }));
    disc.rotation.x = -PI / 2; disc.position.y = 0.04;
    const lab = textSprite(z.label || '', { size: 36 }); lab.position.y = z.r + 0.8;
    group.add(dome, disc, lab); group.userData = { dome, disc };
    this.scene.add(group);
    return group;
  }
  /** 污泥：石牢被炸開後留下的地面（踩到會死）。 */
  makeSludge(z) {
    const group = new T.Group();
    const disc = new T.Mesh(new T.CircleGeometry(z.r, 40), new T.MeshBasicMaterial({ color: 0x3a2418, map: this.texRadial, transparent: true, opacity: 0.85, depthWrite: false }));
    disc.rotation.x = -PI / 2; disc.position.y = 0.045;
    const rim = new T.Mesh(new T.RingGeometry(z.r - 0.18, z.r, 48), new T.MeshBasicMaterial({ color: 0xb06ab0, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    rim.rotation.x = -PI / 2; rim.position.y = 0.05;
    const lab = textSprite(z.label || '污泥', { size: 34, bg: 'rgba(40,20,30,0.75)' }); lab.position.y = 1.6;
    group.add(disc, rim, lab); group.userData = { disc, rim };
    this.scene.add(group);
    return group;
  }
  /** 場地縮小：外圈危險區（預告時半透明橘色，生效後變成深色碎地＋內緣光牆；不閃爍）。 */
  updateShrink(sk, t) {
    if (!sk || t < sk.warn) { if (this.shrinkObj) this.shrinkObj.visible = false; return; }
    if (!this.shrinkObj || this.shrinkObj.userData.sk !== sk) {
      if (this.shrinkObj) { this.scene.remove(this.shrinkObj); disposeTree(this.shrinkObj); }
      const g = new T.Group();
      const band = new T.Mesh(new T.RingGeometry(sk.r, sk.prev || C.ARENA_R + 1.0, 128, 1), new T.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
      band.rotation.x = -PI / 2; band.position.y = 0.036;
      // 上一次縮小已生效的外圈（深色）
      const old = new T.Mesh(new T.RingGeometry(sk.prev || C.ARENA_R, C.ARENA_R + 1.0, 128, 1), new T.MeshBasicMaterial({ color: 0x4a1c0c, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false }));
      old.rotation.x = -PI / 2; old.position.y = 0.035; old.visible = !!sk.prev;
      const edge = new T.Mesh(new T.RingGeometry(sk.r - 0.15, sk.r + 0.15, 128), new T.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
      edge.rotation.x = -PI / 2; edge.position.y = 0.04;
      const wall = new T.Mesh(new T.CylinderGeometry(sk.r, sk.r, 1.8, 128, 1, true), new T.MeshBasicMaterial({ color: 0xffa040, map: this.wallTex, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      wall.position.y = 0.9;
      g.add(band, old, edge, wall); g.userData = { sk, band, edge, wall };
      this.scene.add(g); this.shrinkObj = g;
    }
    const u = this.shrinkObj.userData, on = t >= sk.from;
    this.shrinkObj.visible = true;
    u.band.material.color.set(on ? 0x4a1c0c : 0xff8a30); u.band.material.opacity = on ? 0.82 : 0.32;
    u.wall.visible = on;
  }
  /** 泰坦落地：塵土與衝擊波。 */
  landing(x, z) {
    this.shockRing(x, z, 2, 16, 0xe8c48a, 0.2, 0.9);
    this.shockRing(x, z, 1, 9, 0xffd8a0, 0.3, 0.6);
    for (let i = 0; i < 70; i++) {
      const an = Math.random() * PI * 2, r = 2 + Math.random() * 3, v = 4 + Math.random() * 8;
      this.glows.spawn(x + Math.cos(an) * r, 0.4 + Math.random(), z + Math.sin(an) * r, Math.cos(an) * v, 1 + Math.random() * 3, Math.sin(an) * v, 0.8 + Math.random() * 0.5, new T.Color(0xc8a878), 2, 0.4);
      if (i % 2) this.sparks.spawn(x + Math.cos(an) * r, 0.3, z + Math.sin(an) * r, Math.cos(an) * v * 0.6, 4 + Math.random() * 5, Math.sin(an) * v * 0.6, 0.9, new T.Color(0x8a6a48), 12, 0.7);
    }
    this.shake = Math.max(this.shake, 0.3);
  }
  makeGuideMarker(alpha) {
    const group = new T.Group();
    const ring = new T.Mesh(new T.RingGeometry(0.7, 0.95, 40), new T.MeshBasicMaterial({ color: 0xffec78, transparent: true, opacity: 0.95 * alpha, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -PI / 2; ring.position.y = 0.07;
    const beam = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 5, 20, 1, true), new T.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.16 * alpha, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
    beam.position.y = 2.5;
    group.add(ring, beam);
    group.userData = { ring, beam, lab: null, labText: '', alpha };
    group.visible = false; this.scene.add(group);
    return group;
  }

  // ---------------------------------------------------------------- 預警圈
  buildFx(f) {
    const tint = /Searing/.test(f.label) ? TINT.fire : (TINT[f.tint] || TINT.danger);
    const col = new T.Color(tint);
    const g = new T.Group(), flat = new T.Group(); flat.rotation.x = -PI / 2; g.add(flat);
    // 預警圈不做色調映射，顏色才會跟 FF14 一樣鮮明
    const fillMat = new T.MeshBasicMaterial({ color: col, map: f.kind === 'rect' ? this.texLinear : this.texRadial, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const progMat = new T.MeshBasicMaterial({ color: col.clone().lerp(WHITE, 0.45), transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const edgeMat = new T.MeshBasicMaterial({ color: col.clone().lerp(WHITE, 0.55), transparent: true, opacity: 1, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const add = (geom, mat) => { const m = new T.Mesh(geom, mat); flat.add(m); return m; };
    let prog = null;
    const E = 0.16;
    if (f.kind === 'circle') {
      add(new T.CircleGeometry(f.r, 64), fillMat);
      prog = add(new T.CircleGeometry(f.r, 64), progMat);
      add(new T.RingGeometry(Math.max(0, f.r - E), f.r, 64), edgeMat);
    } else if (f.kind === 'ring') {
      add(new T.RingGeometry(f.inner, f.r, 96), fillMat);
      prog = add(new T.RingGeometry(f.inner, f.r, 96), progMat);
      add(new T.RingGeometry(f.inner, f.inner + E, 96), edgeMat);
      add(new T.RingGeometry(Math.max(f.inner, f.r - E), f.r, 96), edgeMat);
    } else if (f.kind === 'cone') {
      add(new T.CircleGeometry(f.len, 48, -f.half, f.half * 2), fillMat);
      prog = add(new T.CircleGeometry(f.len, 48, -f.half, f.half * 2), progMat);
      add(new T.RingGeometry(f.len - E, f.len, 48, 1, -f.half, f.half * 2), edgeMat);
      for (const s of [-1, 1]) {
        const bg = new T.PlaneGeometry(f.len, E); bg.translate(f.len / 2, 0, 0);
        const b = add(bg, edgeMat); b.rotation.z = s * f.half;
      }
    } else {
      const fg = new T.PlaneGeometry(f.len, f.w); fg.translate(f.len / 2, 0, 0);
      add(fg, fillMat);
      const pg = new T.PlaneGeometry(f.len, f.w); pg.translate(f.len / 2, 0, 0);
      prog = add(pg, progMat);
      for (const s of [-1, 1]) {
        const bg = new T.PlaneGeometry(f.len, E); bg.translate(f.len / 2, s * (f.w / 2 - E / 2), 0); add(bg, edgeMat);
      }
      const end = new T.PlaneGeometry(E, f.w); end.translate(f.len - E / 2, 0, 0); add(end, edgeMat);
      const st = new T.PlaneGeometry(E, f.w); st.translate(E / 2, 0, 0); add(st, edgeMat);
    }
    let deco = null;
    if (f.tint === 'share' && f.kind === 'circle') {
      deco = add(new T.PlaneGeometry(f.r * 2, f.r * 2), new T.MeshBasicMaterial({ map: this.texStack, transparent: true, depthWrite: false, opacity: 0.9, color: 0xffe2a0 }));
      deco.position.z = 0.01;
    } else if (f.tint === 'line' && f.kind === 'rect') {
      const tex = this.texChev.clone(); tex.needsUpdate = true; tex.repeat.set(f.len / (f.w * 0.9), 1);
      const dg = new T.PlaneGeometry(f.len, f.w * 0.3); dg.translate(f.len / 2, 0, 0);
      deco = add(dg, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.3, color: 0xe8fff4, toneMapped: false }));
      deco.position.z = 0.01; deco.userData.tex = tex;
    }
    g.position.y = 0.03 + (f.id % 9) * 0.004;
    g.renderOrder = 2;
    g.userData = { fillMat, progMat, edgeMat, prog, deco, col };
    this.scene.add(g);
    return g;
  }
  updateFx(obj, f, st, t, now) {
    const u = obj.userData;
    obj.position.x = f.x; obj.position.z = f.z;
    if (f.kind === 'cone' || f.kind === 'rect') obj.rotation.y = f.rot - PI / 2;
    const p = st.early ? 0 : Math.max(0, Math.min(1, (t - f.t0) / Math.max(0.05, f.t1 - f.t0)));
    if (st.flash > 0) {
      u.fillMat.color.copy(u.col).lerp(WHITE, 0.6); u.fillMat.opacity = 0.75 * st.flash;
      u.edgeMat.opacity = st.flash; if (u.prog) u.prog.visible = false;
    } else {
      u.fillMat.color.copy(u.col);
      u.fillMat.opacity = st.early ? 0.2 : 0.42 + 0.18 * p;
      u.edgeMat.opacity = st.early ? 0.45 : 0.8 + 0.2 * Math.sin(now * 0.012);
      if (u.prog) {
        u.prog.visible = !st.early;
        if (f.kind === 'circle' || f.kind === 'cone') u.prog.scale.set(Math.max(0.001, p), Math.max(0.001, p), 1);
        else if (f.kind === 'rect') u.prog.scale.set(Math.max(0.001, p), 1, 1);
        else u.progMat.opacity = 0.1 + 0.3 * p;
      }
    }
    if (u.deco) {
      if (u.deco.userData.tex) u.deco.userData.tex.offset.x = -now * 0.0012;
      else u.deco.rotation.z = now * 0.0008;
      u.deco.material.opacity = st.flash > 0 ? 0.5 * st.flash : (u.deco.userData.tex ? 0.32 : 0.85);
    }
  }

  // ---------------------------------------------------------------- 特效
  addEffect(obj, dur, update) { this.scene.add(obj); this.effects.push({ obj, t: 0, dur, update }); }
  firePillar(x, z, r, h, color) {
    const geo = new T.CylinderGeometry(r, r * 0.6, h, 28, 1, true); geo.translate(0, h / 2, 0);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, map: this.texFlame, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.position.set(x, 0, z);
    this.addEffect(m, 0.9, (k) => { m.scale.set(1 + k * 0.25, Math.min(1, k * 5) * (1 - k * 0.3), 1 + k * 0.25); m.material.opacity = (1 - k) * 0.95; m.rotation.y += 0.05; });
  }
  shockRing(x, z, r0, r1, color, y, dur) {
    const m = new T.Mesh(SH(this.ringGeo || (this.ringGeo = new T.RingGeometry(0.86, 1, 64))), new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.rotation.x = -PI / 2; m.position.set(x, y || 0.15, z);
    this.addEffect(m, dur || 0.55, (k) => { const r = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 2)); m.scale.set(r, r, 1); m.material.opacity = 1 - k; });
  }
  beam(f, color) {
    const geo = new T.BoxGeometry(f.len, 1.2, f.w * 0.55); geo.translate(f.len / 2, 0.9, 0);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    m.position.set(f.x, 0, f.z); m.rotation.y = f.rot - PI / 2;
    this.addEffect(m, 0.5, (k) => { m.material.opacity = (1 - k) * 0.85; m.scale.set(1, 1 + k, 1 - k * 0.6); });
  }
  /** 在預警範圍內取隨機點。 */
  samplePoint(f) {
    if (f.kind === 'circle') { const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * f.r; return [f.x + Math.cos(a) * r, f.z + Math.sin(a) * r]; }
    if (f.kind === 'ring') { const a = Math.random() * PI * 2, r = f.inner + Math.random() * (f.r - f.inner); return [f.x + Math.cos(a) * r, f.z + Math.sin(a) * r]; }
    if (f.kind === 'cone') { const a = f.rot + (Math.random() * 2 - 1) * f.half, r = Math.sqrt(Math.random()) * f.len; return [f.x + Math.sin(a) * r, f.z + Math.cos(a) * r]; }
    const l = Math.random() * f.len, s = (Math.random() - 0.5) * f.w, fx = Math.sin(f.rot), fz = Math.cos(f.rot);
    return [f.x + fx * l + fz * s, f.z + fz * l - fx * s];
  }
  burst(f, me) {
    const L = f.label || '';
    const area = f.kind === 'circle' ? PI * f.r * f.r : f.kind === 'ring' ? PI * (f.r * f.r - f.inner * f.inner) : f.kind === 'cone' ? f.half * f.len * f.len : f.len * f.w;
    const n = Math.min(220, 18 + area * 0.5);
    const fire = FIRE_RE.test(L), wind = !fire && WIND_RE.test(L), rain = /Rain|羽毛雨/.test(L);
    const col = new T.Color(fire ? 0xff7a2a : wind ? 0xbff6ff : rain ? 0xbfe4ff : (TINT[f.tint] || TINT.danger));
    const col2 = new T.Color(fire ? 0xffd27a : 0xffffff);
    for (let i = 0; i < n; i++) {
      const [x, z] = this.samplePoint(f);
      const c = Math.random() < 0.3 ? col2 : col;
      if (wind) {
        const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz) || 1;
        this.sparks.spawn(x, 0.3 + Math.random() * 1.5, z, -dz / d * 6 + dx / d * 2, 2 + Math.random() * 3, dx / d * 6 + dz / d * 2, 0.6 + Math.random() * 0.5, c, 0, 0.3);
      } else {
        this.sparks.spawn(x, 0.2, z, (Math.random() - 0.5) * 2, 3 + Math.random() * (fire ? 9 : 5), (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.6, c, fire ? 4 : 9, 0.6);
      }
    }
    for (let i = 0; i < Math.min(24, n / 6); i++) {
      const [x, z] = this.samplePoint(f);
      this.glows.spawn(x, 0.6 + Math.random(), z, 0, fire ? 2.5 : 1.2, 0, 0.5 + Math.random() * 0.4, col, 0, 0.5);
    }
    if (f.kind === 'circle') {
      if (fire) this.firePillar(f.x, f.z, f.r * 0.8, 5 + f.r * 0.5, 0xff6a1a);
      this.shockRing(f.x, f.z, f.r * 0.3, f.r * 1.15, fire ? 0xffa060 : wind ? 0xd8fbff : col.getHex());
    } else if (f.kind === 'rect') {
      if (f.tint === 'line') this.beam(f, 0x7dffc0);
      if (fire) {
        const fx = Math.sin(f.rot), fz = Math.cos(f.rot);
        for (let l = 2; l < f.len; l += 5) this.firePillar(f.x + fx * l, f.z + fz * l, Math.min(3.2, f.w * 0.3), 4.5, 0xff5a14);
      }
    } else if (f.kind === 'ring') this.shockRing(f.x, f.z, f.inner, f.r, 0xd8fbff, 0.2, 0.7);
    else if (f.kind === 'cone' && fire) {
      for (let i = 0; i < 5; i++) { const [x, z] = this.samplePoint(f); this.firePillar(x, z, 1.6, 4, 0xff5a14); }
    }
    // 震動：只有大範圍、而且判定點就在你附近時才震（避免畫面常常在晃）
    const cx = f.kind === 'circle' || f.kind === 'ring' ? f.x : f.x + Math.sin(f.rot) * f.len / 2;
    const cz = f.kind === 'circle' || f.kind === 'ring' ? f.z : f.z + Math.cos(f.rot) * f.len / 2;
    const reach = (f.kind === 'circle' || f.kind === 'ring' ? f.r : f.len / 2) + 3;
    const d = Math.hypot(me.pos.x - cx, me.pos.z - cz);
    if (area > 60 && d < reach) this.shake = Math.max(this.shake, Math.min(0.22, area / 2000));
  }

  resetTransient(sim) {
    this.sparks.clear(); this.glows.clear(); this.feathers.clear();
    for (const e of this.effects) { this.scene.remove(e.obj); disposeTree(e.obj); }
    this.effects = [];
    for (const [, tn] of this.tornados) { this.scene.remove(tn.group); disposeTree(tn.group); }
    this.tornados.clear();
    this.bursted = new Set(sim.fx.filter((f) => sim.t >= f.t1).map((f) => f.id));
    this.screenSeen = new WeakSet(sim.screenFx);
    for (const ob of this.charObjs) { ob.kbRef = null; ob.deadT = -1; ob.fallY = 0; ob.spin = 0; ob.walkSm = 0; }
    if (this.shrinkObj) this.shrinkObj.visible = false;
    this.shake = 0;
  }

  tornado(f, t) {
    const key = Math.round(f.x) + ',' + Math.round(f.z);
    let tn = this.tornados.get(key);
    if (!tn) {
      const group = new T.Group();
      const pts = [];
      for (let i = 0; i <= 12; i++) { const y = i / 12 * 10; pts.push(new T.Vector2(0.5 + Math.pow(i / 12, 1.6) * 3.6, y)); }
      const layers = [];
      for (let j = 0; j < 2; j++) {
        const tex = this.texSwirl.clone(); tex.needsUpdate = true; tex.repeat.set(3, 1);
        const m = new T.Mesh(new T.LatheGeometry(pts, 40), new T.MeshBasicMaterial({ map: tex, color: j ? 0xcff4ff : 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
        m.scale.setScalar(j ? 1.12 : 1); group.add(m); layers.push(m);
      }
      group.position.set(f.x, 0, f.z);
      this.scene.add(group);
      tn = { group, layers, last: t, born: t };
      this.tornados.set(key, tn);
    }
    tn.last = t;
  }

  // ---------------------------------------------------------------- 鏡頭
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  get yaw() { return this.cam.yaw; }
  setLimits(o) {
    Object.assign(this.limits, o);
    const L = this.limits;
    this.camera.fov = L.fov;
    this.camera.updateProjectionMatrix();
    this.cam.dist = Math.max(MIN_DIST, Math.min(L.maxDist, this.cam.dist));
    this.cam.pitch = Math.max(MIN_PITCH, Math.min(L.maxPitchDeg * PI / 180, this.cam.pitch));
  }
  orbit(dYaw, dPitch) {
    this.cam.yaw += dYaw;
    this.cam.pitch = Math.max(MIN_PITCH, Math.min(this.limits.maxPitchDeg * PI / 180, this.cam.pitch + dPitch));
  }
  zoom(sign) {
    this.cam.dist = Math.max(MIN_DIST, Math.min(this.limits.maxDist, this.cam.dist * (1 + sign * 0.08)));
  }

  setGuide(marker, g, sim, now) {
    if (!g) { marker.visible = false; return; }
    const alpha = marker.userData.alpha;
    marker.visible = true;
    marker.position.set(g.spot.x, 0, g.spot.z);
    const s = 1 + Math.sin(now * 0.006) * 0.08;
    marker.userData.ring.scale.set(s, s, 1);
    const text = alpha < 1 ? '下一步：' + g.title : '建議站位';   // 不放倒數（倒數在畫面下方），避免每 0.1 秒重建貼圖
    if (marker.userData.labText !== text) {
      if (marker.userData.lab) { marker.remove(marker.userData.lab); disposeSprite(marker.userData.lab); }
      const l = textSprite(text, { fg: '#fff3a0', size: 34 }); l.position.y = 5.5; marker.add(l);
      marker.userData.lab = l; marker.userData.labText = text;
    }
  }

  // ---------------------------------------------------------------- 每幀
  render(sim, o) {
    const now = o.now;
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); this.last = now;
    const tsec = now / 1000;
    if (o.pid !== this.themeId) this.applyTheme(o.pid);
    if (o.wm.ver !== this.wmVer) { this.setWaymarks(o.wm.list); this.wmVer = o.wm.ver; }
    if (sim !== this.sim) { this.sim = sim; this.lastSimT = sim.t; this.resetTransient(sim); }
    const t = sim.t, dts = Math.max(0, Math.min(0.1, t - this.lastSimT)); this.lastSimT = t;
    // 模擬一秒 60 步、螢幕可能 144Hz：有些幀不會推進模擬。「最近 0.12 秒內有推進」就當作在跑，動作才不會一頓一頓
    if (dts > 0) this.lastAdvance = now;
    const running = now - (this.lastAdvance || 0) < 120;
    const solo = o.solo, me = sim.pc;
    const IP = (e) => ipos(e, o.alpha);
    const mp = IP(me);

    // 環境動畫
    if (this.belowMat.map) this.belowMat.map.offset.set(tsec * 0.004, tsec * 0.002);

    // 隊員
    const marksOn = new Map();
    for (const m of sim.activeMarks()) { if (!marksOn.has(m.slot)) marksOn.set(m.slot, []); marksOn.get(m.slot).push(m); }
    sim.chars.forEach((c, i) => {
      const ob = this.charObjs[i], g = ob.m.group;
      const show = !solo || c.slot === sim.playerSlot;
      g.visible = show;
      if (!show) { ob.blob.visible = false; ob.castRing.visible = false; ob.raiseMark.visible = false; return; }
      if (c.kb !== ob.kbRef) { ob.kbRef = c.kb; if (c.kb) { ob.kbT0 = t; ob.kbDur = Math.max(0.1, c.kb.until - t); } }
      let y = 0;
      if (c.kb || (t - ob.kbT0 < ob.kbDur && ob.kbRef === null && ob.kbT0 > 0)) {
        const s = Math.max(0, Math.min(1, (t - ob.kbT0) / ob.kbDur));
        y = 4 * (c.alive ? 1.0 : 2.6) * s * (1 - s);
      }
      if (c.fell) { ob.fallY -= dt * 14; y += ob.fallY; }
      const ip = IP(c);
      g.position.set(ip.x, y, ip.z);
      ob.blob.visible = !this.Q.shadows && !c.fell;
      ob.blob.position.set(ip.x, 0.02, ip.z);
      const bs = 0.6 / (1 + Math.max(0, y) * 0.25); ob.blob.scale.set(bs, bs, 1);
      MD.setCharacterDead(ob.m, !c.alive);
      if (c.alive) {
        ob.deadT = -1;
        g.rotation.set(0, irot(c, o.alpha), 0);
        ob.walkSm += ((running ? c.walk : 0) - ob.walkSm) * Math.min(1, dt * 12);
        MD.animateCharacter(ob.m, dt, tsec, ob.walkSm);
      } else {
        if (ob.deadT < 0) ob.deadT = tsec;
        const k = Math.min(1, (tsec - ob.deadT) / 0.35);
        if (c.kb) ob.spin += dt * 9;
        g.rotation.set(-PI / 2 * k, c.rot, ob.spin);
        g.position.y += 0.25 * k;
      }
      const k = c.alive ? c.cast : null;
      ob.castRing.visible = !!k;
      if (k) {
        const p = Math.max(0, Math.min(1, (t - k.t0) / (k.t1 - k.t0))), sc = 0.55 + 0.45 * p;
        ob.castRing.position.set(ip.x, 0.06, ip.z); ob.castRing.scale.set(sc, sc, 1);
        ob.castRing.material.color.setHex(k.id === 'raise' ? 0xffd866 : 0x7fc4ff);
        ob.castRing.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(tsec * 5));
      }
      ob.raiseMark.visible = !c.alive && !!c.raise;
      if (ob.raiseMark.visible) ob.raiseMark.position.set(ip.x, 1.4 + Math.sin(tsec * 3) * 0.08, ip.z);
      ob.ring.visible = c.slot === sim.playerSlot && c.alive;
      if (ob.ring.visible) { const s = 1 + Math.sin(tsec * 4) * 0.06; ob.ring.scale.set(s, s, 1); }
      ob.lab.visible = c.alive && c.slot !== sim.playerSlot;   // 跟 FF14 預設一樣不顯示自己的名牌（鏡頭拉近時才不會擋到 Boss）
      const ms = c.alive ? (marksOn.get(c.slot) || []) : [];
      let my = 3.3;
      for (const k of MARK_TYPES) {
        const sp = ob.markers[k], m = ms.find((x) => x.type === k);
        sp.visible = !!m;
        if (!m) continue;
        const age = t - m.t0, pop = age < 0.25 ? 0.6 + age / 0.25 * 0.6 : age < 0.4 ? 1.2 - (age - 0.25) / 0.15 * 0.2 : 1;
        sp.scale.set(1.25 * pop, 1.25 * pop, 1);
        sp.position.y = my + Math.sin(tsec * 3) * 0.08; my += 1.2;
      }
      // 狀態光效
      if (c.alive && dts > 0) {
        for (const s of sim.statusesOf(c)) {
          if (s.id === 'searing' && Math.random() < 0.7) { const a = Math.random() * PI * 2; this.sparks.spawn(c.pos.x + Math.cos(a) * 0.7, 0.3 + Math.random() * 1.6, c.pos.z + Math.sin(a) * 0.7, 0, 1.8, 0, 0.6, new T.Color(0xff7a2a), -1, 0.8); }
          else if (s.id === 'curse' && Math.random() < 0.6) { const a = Math.random() * PI * 2; this.sparks.spawn(c.pos.x + Math.cos(a) * 0.6, 0.2 + Math.random() * 1.8, c.pos.z + Math.sin(a) * 0.6, 0, 1.5, 0, 0.7, new T.Color(0xc05aff), -1, 0.8); }
          else if (s.id === 'sprint' && c.walk > 1 && Math.random() < 0.9) {   // 衝刺：腳下往後飄的風
            const fx = Math.sin(c.rot), fz = Math.cos(c.rot), sd = (Math.random() - 0.5) * 0.8;
            this.sparks.spawn(c.pos.x - fx * 0.4 + fz * sd, 0.15 + Math.random() * 0.9, c.pos.z - fz * 0.4 - fx * sd, -fx * 5, 0.4, -fz * 5, 0.35, new T.Color(0x9fe4ff), 0, 3);
          } else if (s.id === 'thermal' && Math.random() < 0.08 * s.stacks) { const a = Math.random() * PI * 2; this.sparks.spawn(c.pos.x + Math.cos(a) * 0.5, 2.2, c.pos.z + Math.sin(a) * 0.5, 0, -0.6, 0, 1.0, new T.Color(0x9fd8ff), 0, 1); }
        }
      }
    });

    // 敵人與場上實體
    const seen = new Set();
    let fireOn = null;
    for (const a of sim.actors) {
      if (a.dead) continue;
      seen.add(a);
      let info = this.actorObjs.get(a);
      if (!info) { info = this.makeActor(a); this.actorObjs.set(a, info); }
      const m = info.m, g = m.group;
      g.visible = a.visible;
      const ap = IP(a);
      // 跳到空中（泰坦）：往上飛出畫面，地上的影子跟著變化
      const ly = a.lift ? a.lift * a.lift * 40 : 0;
      g.position.set(ap.x, ly, ap.z);
      g.rotation.y = irot(a, o.alpha);
      info.blob.position.y = 0.02 - ly;
      if (a.look === 'titan') {
        const k = 1 + (a.lift || 0) * 0.8; info.blob.scale.set(BLOB_R.titan * k, BLOB_R.titan * k, 1); info.blob.material.opacity = 0.5 * (1 - (a.lift || 0) * 0.6);
        if (info.prevLift > 0.02 && !a.lift) this.landing(ap.x, ap.z);
        info.prevLift = a.lift || 0;
      }
      if (!a.visible) continue;
      const who = a.look === 'garuda' ? 'Garuda' : a.look === 'ifrit' ? '伊弗利特' : a.name;
      const cast = sim.activeCasts().find((c) => c.who === who && t <= c.t1);
      const castP = cast ? Math.max(0.01, (t - cast.t0) / Math.max(0.1, cast.t1 - cast.t0)) : 0;
      const op = a.targetable === false && (a.look === 'garuda' || a.look === 'ifrit' || a.look === 'titan' || a.look === 'ultima') ? 0.45 : 1;
      if (m.kind === 'garuda') MD.animateGaruda(m, tsec + (a.look === 'sister' ? 1.3 : 0), castP, op);
      else if (m.kind === 'ifrit') {
        MD.animateIfrit(m, tsec, castP, op);
        if (a.look === 'ifrit') fireOn = a;
        if (dts > 0 || Math.random() < 0.3) {
          const fc = new T.Color(m.flameCol);
          for (const e of m.emit) {
            if (Math.random() > 0.55) continue;
            const v = new T.Vector3(); e.getWorldPosition(v);
            this.sparks.spawn(v.x + (Math.random() - 0.5) * 0.5, v.y, v.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6, 0.45 + Math.random() * 0.3, fc, -1, 0.8);
          }
        }
      } else if (m.kind === 'titan') {
        // 怒震：每秒跺一次地
        const tum = sim.activeCasts().find((c) => c.who === '泰坦' && /Tumult/.test(c.name));
        const stomp = tum ? (((t - tum.t0 - 0.3) % 1) + 1) % 1 : 0;
        MD.animateTitan(m, tsec, tum ? 0 : castP, op, stomp);
        if (tum && stomp < 0.08 && dts > 0) for (let i = 0; i < 6; i++) { const an = Math.random() * PI * 2; this.glows.spawn(ap.x + Math.cos(an) * 3, 0.4, ap.z + Math.sin(an) * 3, Math.cos(an) * 5, 1.2, Math.sin(an) * 5, 0.7, new T.Color(0xc8a070), 0, 0.5); }
      } else if (m.kind === 'bomb') {
        const k = a.hp;
        m.mats.vent.emissiveIntensity = 1.0 + k * (2.2 + Math.sin(tsec * (5 + 10 * k)) * 1.4);
        m.float.scale.setScalar(1 + k * 0.05 * Math.sin(tsec * 14));
        m.float.rotation.y = tsec * 0.25;
        if (k > 0 && dts > 0 && Math.random() < 0.3) this.sparks.spawn(a.pos.x + (Math.random() - 0.5) * 1.4, 1.2 + Math.random(), a.pos.z + (Math.random() - 0.5) * 1.4, 0, 1.6, 0, 0.5, new T.Color(0xff8a3a), -0.5, 0.8);
      } else if (m.kind === 'gaol') {
        m.mats.glow.opacity = 0.25 + 0.1 * Math.sin(tsec * 3);
      } else if (m.kind === 'spiny') { m.float.position.y = 1.4 + Math.sin(tsec * 2.5) * 0.18; m.float.rotation.y = tsec * 0.8; }
      else if (m.kind === 'plume') {
        m.float.position.y = 1.3 + Math.sin(tsec * 2 + a.pos.x) * 0.2; m.float.rotation.y = tsec * 1.4;
        m.mats.f.opacity = 0.35 + 0.65 * a.hp;
      } else if (m.kind === 'nail') {
        m.crystal.scale.set(1, 0.45 + 0.55 * a.hp, 1);
        m.mats.core.emissiveIntensity = 1.8 + Math.sin(tsec * 5 + a.pos.x) * 0.6 + (a.hits || 0) * 0.6;
        if (Math.random() < 0.25) this.sparks.spawn(a.pos.x + (Math.random() - 0.5), 0.5 + Math.random() * 2.5, a.pos.z + (Math.random() - 0.5), 0, 1.2, 0, 0.8, new T.Color(0xff8a3a), -0.5, 0.9);
        const bk = a.badge ? '★'.repeat(Math.min(3, a.badge)) : '';
        if (bk !== info.badgeKey) {
          if (info.badge) { g.remove(info.badge); disposeSprite(info.badge); info.badge = null; }
          if (bk) { const s = textSprite(bk, { fg: '#ffe27a', size: 40 }); s.position.y = 5.4; g.add(s); info.badge = s; }
          info.badgeKey = bk;
        }
      } else if (m.kind === 'shard') { m.float.rotation.y = tsec * 2; m.float.position.y = Math.sin(tsec * 3) * 0.2; }
      else if (m.kind === 'ultima') MD.animateUltima(m, tsec, castP, op);
      else if (m.kind === 'lahabrea') { m.float.position.y = 0.6 + Math.sin(tsec * 1.6) * 0.15; m.mats.glow.emissiveIntensity = 1.8 + castP * 2.5; }
      else if (m.kind === 'orb') {
        m.float.position.y = 1.4 + Math.sin(tsec * 2.2 + a.pos.x) * 0.15; m.float.rotation.y = tsec * 1.2;
        m.mats.core.emissiveIntensity = 2.0 + Math.sin(tsec * 6) * 0.8;
        if (dts > 0 && Math.random() < 0.3) this.sparks.spawn(a.pos.x + (Math.random() - 0.5) * 1.2, 1.0 + Math.random() * 0.8, a.pos.z + (Math.random() - 0.5) * 1.2, 0, 1.0, 0, 0.6, new T.Color(0xc27aff), -0.3, 0.8);
      } else if (m.kind === 'bit') {
        m.float.position.y = 2.0 + Math.sin(tsec * 2.4 + a.pos.x) * 0.25; m.float.rotation.y = tsec * 1.5;
        m.mats.eye.emissiveIntensity = 1.5 + Math.abs(Math.sin(tsec * 6)) * 2.5 * a.hp;
      }
      if (a.blue && Math.random() < 0.5) this.sparks.spawn(a.pos.x + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 4, a.pos.z + (Math.random() - 0.5) * 2, 0, 2, 0, 0.6, new T.Color(0x5ab4ff), -1, 0.8);
    }
    for (const [a, info] of this.actorObjs) {
      if (!seen.has(a)) { this.scene.remove(info.m.group); disposeTree(info.m.group); this.actorObjs.delete(a); }
    }
    if (fireOn) {
      this.fireLight.position.set(fireOn.pos.x, 4, fireOn.pos.z);
      this.fireLight.intensity = 9 + Math.sin(tsec * 11) * 2 + Math.sin(tsec * 17) * 1.2;
    } else this.fireLight.intensity = 0;

    // 持續區域
    const zseen = new Set();
    for (const z of sim.zones) {
      if (z.t0 !== undefined && t < z.t0) continue;
      zseen.add(z);
      let ob = this.zoneObjs.get(z);
      if (!ob) { ob = z.style === 'sludge' ? this.makeSludge(z) : this.makeBubble(z); this.zoneObjs.set(z, ob); }
      ob.position.set(z.x, 0, z.z);
      if (z.style === 'sludge') {
        const fade = Math.max(0, Math.min(1, (z.t1 - t) / 0.8)) * Math.min(1, (t - z.t0) / 0.5);
        ob.userData.disc.material.opacity = 0.85 * fade; ob.userData.rim.material.opacity = 0.8 * fade;
        if (dts > 0 && Math.random() < 0.35 * fade) { const an = Math.random() * PI * 2, r = Math.random() * z.r * 0.9; this.glows.spawn(z.x + Math.cos(an) * r, 0.15, z.z + Math.sin(an) * r, 0, 0.6, 0, 0.6, new T.Color(0x8a5a8a), 0, 0.6); }
        continue;
      }
      const a = z.active === false ? 0.3 : 1;
      ob.userData.dome.material.opacity = (0.12 + 0.05 * Math.sin(tsec * 2.5)) * a; ob.userData.disc.material.opacity = 0.4 * a;
    }
    this.updateShrink(sim.shrink, t);
    for (const [z, ob] of this.zoneObjs) if (!zseen.has(z)) { this.scene.remove(ob); disposeTree(ob); this.zoneObjs.delete(z); }

    // 預警圈與判定特效
    const live = new Set();
    for (const f of sim.fx) {
      if (/Whirlwind/.test(f.label) && t >= f.t0 - 0.3 && t <= f.t1 + 0.4) this.tornado(f, t);
      if (/Feather Rain/.test(f.label) && t >= f.t0 && t < f.t1 && dts > 0 && Math.random() < 0.5) {
        const [x, z] = this.samplePoint(f);
        this.feathers.spawn(x, 9 + Math.random() * 3, z, (Math.random() - 0.5), -11, (Math.random() - 0.5), 0.9, WHITE, 0, 1);
      }
      if (t >= f.t1 && !this.bursted.has(f.id) && t - f.t1 < 0.35) { this.bursted.add(f.id); this.burst(f, me); }
      const st = fxState(f, t, o.assist);
      if (!st) continue;
      live.add(f.id);
      let obj = this.fxMap.get(f.id);
      if (!obj) { obj = this.buildFx(f); this.fxMap.set(f.id, obj); }
      this.updateFx(obj, f, st, t, now);
      obj.visible = true;
    }
    for (const [id, obj] of this.fxMap) {
      if (live.has(id)) continue;
      if (!sim.fx.some((f) => f.id === id)) { this.scene.remove(obj); disposeTree(obj); this.fxMap.delete(id); } else obj.visible = false;
    }
    for (const sf of sim.screenFx) if (!this.screenSeen.has(sf)) { this.screenSeen.add(sf); this.shake = Math.max(this.shake, 0.2 * sf.power); }

    // 龍捲
    for (const [key, tn] of this.tornados) {
      const age = t - tn.last;
      const k = Math.min(1, (t - tn.born + 0.3) / 0.6) * Math.max(0, 1 - Math.max(0, age - 3) / 0.8);
      if (k <= 0 && age > 3.8) { this.scene.remove(tn.group); disposeTree(tn.group); this.tornados.delete(key); continue; }
      tn.layers.forEach((m, j) => { m.rotation.y = tsec * (j ? -2.2 : 3.1); m.material.map.offset.y = -tsec * 0.5; m.material.opacity = (j ? 0.35 : 0.55) * k; });
      if (dts > 0 && Math.random() < 0.8 * k) {
        const a = Math.random() * PI * 2, r = 1 + Math.random() * 3;
        this.glows.spawn(tn.group.position.x + Math.cos(a) * r, Math.random() * 8, tn.group.position.z + Math.sin(a) * r, -Math.sin(a) * 6, 2.5, Math.cos(a) * 6, 0.6, new T.Color(0xcfeeff), 0, 0.7);
      }
    }

    // 特效更新
    this.effects = this.effects.filter((e) => {
      e.t += dt; const k = e.t / e.dur;
      if (k >= 1) { this.scene.remove(e.obj); disposeTree(e.obj); return false; }
      e.update(k); return true;
    });
    this.sparks.update(dt); this.glows.update(dt); this.feathers.update(dt);

    // 連線
    let ti = 0;
    const up = new T.Vector3(0, 1, 0), dir = new T.Vector3();
    const owner = new Map();
    for (const c of sim.chars) owner.set(c.pos, c);
    for (const a of sim.actors) owner.set(a.pos, a);
    const tp = (p) => (owner.has(p) ? IP(owner.get(p)) : p);
    for (const th of sim.tethers) {
      if (th.t0 !== undefined && t < th.t0) continue;
      const pairs = th.ends ? th.ends() : [];
      for (const [a0, b0] of pairs) {
        const a = tp(a0), b = tp(b0);
        if (ti >= this.tetherPool.length) break;
        const m = this.tetherPool[ti++];
        dir.set(b.x - a.x, 0, b.z - a.z);
        const len = dir.length() || 0.01;
        m.position.set((a.x + b.x) / 2, 1.3, (a.z + b.z) / 2);
        m.quaternion.setFromUnitVectors(up, dir.normalize());
        const rad = th.kind === 'fetters' ? 0.09 : th.kind === 'meso' ? 0.12 : 0.05;
        m.scale.set(rad, len, rad);
        m.material.color.set(TETHER[th.kind] || 0xffd34d);
        m.material.opacity = th.kind === 'fetters' ? 0.75 + 0.25 * Math.sin(tsec * 10) : 0.8;
        m.visible = true;
      }
    }
    for (; ti < this.tetherPool.length; ti++) this.tetherPool[ti].visible = false;

    // 教學標記與預告
    if (o.assist) {
      this.setGuide(this.guideObjs[0], sim.guide.cur, sim, now);
      const nx = sim.guide.next;
      const same = nx && sim.guide.cur && nx.id === sim.guide.cur.id && Math.hypot(nx.spot.x - sim.guide.cur.spot.x, nx.spot.z - sim.guide.cur.spot.z) < 0.3;
      this.setGuide(this.guideObjs[1], same ? null : nx, sim, now);
    } else { this.guideObjs[0].visible = false; this.guideObjs[1].visible = false; }
    let pi = 0;
    if (o.assist) {
      for (const p of sim.previews) {
        if (t < p.t0 || t >= p.t1 || pi >= this.previewPool.length || (p.owner !== undefined && p.owner !== sim.playerSlot)) continue;
        const m = this.previewPool[pi++]; m.position.set(p.x, 0.06, p.z); m.scale.set(p.r, p.r, 1); m.visible = true;
      }
    }
    for (; pi < this.previewPool.length; pi++) this.previewPool[pi].visible = false;

    // 相機（含震動）
    const cam = this.cam;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const sh = this.shake; this.shake = sh < 0.005 ? 0 : sh * Math.exp(-dt * 6);
    // 平滑的正弦晃動（不是每幀亂數，避免看起來像畫面在抖）
    const jx = sh * Math.sin(tsec * 47), jy = sh * 0.6 * Math.sin(tsec * 61 + 1.3), jz = sh * Math.sin(tsec * 53 + 2.1);
    const fy = me.alive ? 1.3 : 0.6;
    this.camera.position.set(mp.x + Math.sin(cam.yaw) * cp * cam.dist + jx, fy + sp * cam.dist + jy, mp.z + Math.cos(cam.yaw) * cp * cam.dist + jz);
    this.camera.lookAt(mp.x + jx * 0.5, fy, mp.z + jz * 0.5);
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}

root.Renderer3D = Renderer3D;
})(window);
