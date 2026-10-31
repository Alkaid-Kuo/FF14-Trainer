/* 2D 俯視圖渲染（北在上）：場地主題、FF14 風格預警圈（讀條時填滿）、判定粒子、頭頂點名標記、震動。 */
(function (root) {
'use strict';
const U = root.UWU;
const { C, ROLES, WM_COLOR, ipos, irot } = U;
const IC = root.UWU_ICONS;
const PI = Math.PI;

const TINTS = {
  danger: [255, 122, 36], line: [63, 232, 160], rain: [143, 208, 255], share: [255, 194, 58], meso: [196, 123, 255], good: [90, 180, 255], fire: [255, 90, 30], earth: [232, 160, 74],
};
const FIRE_RE = /Eruption|Plume|Incinerate|Crimson|深紅|十字|Searing|Crush|碎擊|地火|炎柱/;
const WIND_RE = /Whirlwind|Song|Wheel|Eye|Downburst|Slipstream|Friction|Gigastorm|邪輪|旋風/;
const TETHER = { plume: '#e6d8ff', spiny: '#9be05a', meso: '#c47bff', fetters: '#ff3b2a', chain: '#ffb060' };
const THEME = {
  p1: { bg0: '#16324a', bg1: '#070d16', f0: '#7b919c', f1: '#3a4c57', line: 'rgba(30,50,60,0.25)', hi: 'rgba(255,255,255,0.5)' },
  p2: { bg0: '#3a0e05', bg1: '#0a0302', f0: '#4a3a34', f1: '#1e1513', line: 'rgba(0,0,0,0.4)', hi: 'rgba(255,140,80,0.3)' },
  p3: { bg0: '#3a2a16', bg1: '#0c0804', f0: '#8e7a5c', f1: '#4e3e2a', line: 'rgba(40,24,8,0.3)', hi: 'rgba(255,225,170,0.35)' },
  p4: { bg0: '#1e1838', bg1: '#06040e', f0: '#6e6a8c', f1: '#36324e', line: 'rgba(20,16,40,0.35)', hi: 'rgba(200,180,255,0.35)' },
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** 回傳 { fill, edge, early, flash } 或 null（尚未顯示 / 已消失）。 */
function fxState(f, t, assist) {
  if (f.hidden) return null;
  const start = assist && f.assistFrom !== undefined ? f.assistFrom : f.t0;
  if (t < start) return null;
  if (t <= f.t1) {
    const early = f.t0 > t;
    const p = Math.max(0, Math.min(1, (t - f.t0) / Math.max(0.05, f.t1 - f.t0)));
    return { fill: early ? 0.09 : 0.14 + 0.22 * p, edge: early ? 0.5 : 0.95, early, flash: 0 };
  }
  const q = 1 - (t - f.t1) / 0.45;
  if (q <= 0) return null;
  return { fill: 0.55 * q, edge: q, early: false, flash: q };
}

class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 300; this.H = 300; this.dpr = 1;
    this.bgKey = ''; this.bg = null;
    this.parts = []; this.sim = null; this.last = performance.now(); this.shake = 0;
    this.tornados = new Map();
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.W = r.width; this.H = r.height; this.dpr = dpr;
    this.bgKey = '';
  }

  /** 場地底圖（依大小與主題快取）。 */
  background(pid, mini, scale, cx, cz) {
    const key = [this.W, this.H, pid, mini].join('|');
    if (key === this.bgKey) return this.bg;
    const th = THEME[pid] || THEME.p1;
    const c = document.createElement('canvas');
    c.width = Math.round(this.W * this.dpr); c.height = Math.round(this.H * this.dpr);
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    const R = C.ARENA_R * scale;
    const bg = ctx.createRadialGradient(cx, cz, R * 0.5, cx, cz, Math.max(this.W, this.H) * 0.8);
    bg.addColorStop(0, th.bg0); bg.addColorStop(1, th.bg1);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.W, this.H);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 30;
    const fg = ctx.createRadialGradient(cx, cz, 0, cx, cz, R);
    fg.addColorStop(0, th.f0); fg.addColorStop(1, th.f1);
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cz, R, 0, PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cz, R, 0, PI * 2); ctx.clip();
    for (let i = 0; i < (mini ? 300 : 2500); i++) {
      const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * R, s = 1 + Math.random() * 2.5;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(cx + Math.cos(a) * r, cz + Math.sin(a) * r, s, s);
    }
    ctx.strokeStyle = th.line; ctx.lineWidth = 1;
    for (let r = 2.5; r < C.ARENA_R; r += 2.5) { ctx.beginPath(); ctx.arc(cx, cz, r * scale, 0, PI * 2); ctx.stroke(); }
    for (const r of [5, 10, 15]) {
      ctx.lineWidth = 3; ctx.strokeStyle = th.line; ctx.beginPath(); ctx.arc(cx, cz, r * scale, 0, PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = th.hi; ctx.beginPath(); ctx.arc(cx, cz, r * scale + 2, 0, PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = th.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - R, cz); ctx.lineTo(cx + R, cz); ctx.moveTo(cx, cz - R); ctx.lineTo(cx, cz + R); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(cx, cz, R, 0, PI * 2); ctx.arc(cx, cz, 18.7 * scale, 0, PI * 2, true); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cz, R, 0, PI * 2); ctx.stroke();
    this.bg = c; this.bgKey = key;
    return c;
  }

  samplePoint(f) {
    if (f.kind === 'circle') { const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * f.r; return [f.x + Math.cos(a) * r, f.z + Math.sin(a) * r]; }
    if (f.kind === 'ring') { const a = Math.random() * PI * 2, r = f.inner + Math.random() * (f.r - f.inner); return [f.x + Math.cos(a) * r, f.z + Math.sin(a) * r]; }
    if (f.kind === 'cone') { const a = f.rot + (Math.random() * 2 - 1) * f.half, r = Math.sqrt(Math.random()) * f.len; return [f.x + Math.sin(a) * r, f.z + Math.cos(a) * r]; }
    const l = Math.random() * f.len, s = (Math.random() - 0.5) * f.w, fx = Math.sin(f.rot), fz = Math.cos(f.rot);
    return [f.x + fx * l + fz * s, f.z + fz * l - fx * s];
  }
  burst(f, me) {
    const L = f.label || '';
    const fire = FIRE_RE.test(L), wind = !fire && WIND_RE.test(L);
    const col = fire ? [255, 140, 50] : wind ? [210, 248, 255] : (TINTS[f.tint] || TINTS.danger);
    const area = f.kind === 'circle' ? PI * f.r * f.r : f.kind === 'ring' ? PI * (f.r * f.r - f.inner * f.inner) : f.kind === 'cone' ? f.half * f.len * f.len : f.len * f.w;
    const n = Math.min(120, 10 + area * 0.25);
    for (let i = 0; i < n; i++) {
      const [x, z] = this.samplePoint(f);
      const a = Math.random() * PI * 2, v = 1 + Math.random() * 3;
      this.parts.push({ x, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, ttl: 0.9, col, size: 1.5 + Math.random() * 2.5 });
    }
    if (f.kind === 'circle') this.parts.push({ ring: true, x: f.x, z: f.z, r0: f.r * 0.3, r1: f.r * 1.1, life: 0.5, ttl: 0.5, col });
    const cx = f.kind === 'circle' || f.kind === 'ring' ? f.x : f.x + Math.sin(f.rot) * f.len / 2;
    const cz = f.kind === 'circle' || f.kind === 'ring' ? f.z : f.z + Math.cos(f.rot) * f.len / 2;
    const reach = (f.kind === 'circle' || f.kind === 'ring' ? f.r : f.len / 2) + 3;
    const d = Math.hypot(me.pos.x - cx, me.pos.z - cz);
    if (area > 60 && d < reach) this.shake = Math.max(this.shake, Math.min(2.5, area / 400));
  }
  reset(sim) {
    this.parts = []; this.tornados.clear(); this.shake = 0;
    this.bursted = new Set(sim.fx.filter((f) => sim.t >= f.t1).map((f) => f.id));
    this.screenSeen = new WeakSet(sim.screenFx);
    this.alive = sim.chars.map((c) => c.alive);
  }

  draw(sim, o) {
    if (this.W < 2 || this.H < 2) return;   // 畫布隱藏中（尚未量到大小）
    const now = o.now;
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); this.last = now;
    const tsec = now / 1000;
    if (sim !== this.sim) { this.sim = sim; this.reset(sim); }
    this.ip = (e) => ipos(e, o.alpha);   // 畫面內插（高更新率螢幕不會一頓一頓）
    this.alpha = o.alpha;
    const ctx = this.ctx, W = this.W, H = this.H, t = sim.t, me = sim.pc, mini = o.mini;
    // 畫面夠寬時，場地放在左欄（約 300px）右邊，避免被 HUD 擋住
    const inset = mini || W < 860 ? 0 : 300;
    const scale = Math.min(W - inset, H) / (2 * (C.ARENA_R + 2.2));
    const cx = inset + (W - inset) / 2, cz = H / 2;

    // 判定 → 粒子／震動
    for (const f of sim.fx) if (t >= f.t1 && !this.bursted.has(f.id) && t - f.t1 < 0.35) { this.bursted.add(f.id); this.burst(f, me); }
    for (const sf of sim.screenFx) if (!this.screenSeen.has(sf)) { this.screenSeen.add(sf); this.shake = Math.max(this.shake, 3 * sf.power); }
    sim.chars.forEach((c, i) => {
      if (this.alive[i] && !c.alive) for (let k = 0; k < 24; k++) { const a = Math.random() * PI * 2, v = 2 + Math.random() * 4; this.parts.push({ x: c.pos.x, z: c.pos.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, life: 0.7, ttl: 0.7, col: [255, 70, 60], size: 2 + Math.random() * 2 }); }
      this.alive[i] = c.alive;
    });
    const sh = mini ? 0 : this.shake; this.shake = this.shake < 0.05 ? 0 : this.shake * Math.exp(-dt * 7);
    const ox = sh * Math.sin(tsec * 47), oz = sh * Math.sin(tsec * 53 + 1.7);
    const X = (x) => cx + ox + x * scale, Z = (z) => cz + oz + z * scale;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.background(o.pid, mini, scale, cx, cz), ox, oz, W, H);
    this.view = { cx, cz, scale };   // 給「點地圖放標點」換算座標用
    if (!mini) this.drawWaymarks(ctx, o.wm.list, X, Z, scale, mini);   // 小地圖的標點畫在最上層（不會被人物、Boss 擋住）

    // 場地縮小的危險區（預告：半透明橘；生效：深色。不閃爍）
    const sk = sim.shrink;
    if (sk && t >= sk.warn) {
      const on = t >= sk.from, band = (r0, r1, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(0), Z(0), r1 * scale, 0, PI * 2); ctx.arc(X(0), Z(0), r0 * scale, 0, PI * 2, true); ctx.fill(); };
      // 上一次縮小的範圍已經生效（深色），這次預告的範圍（半透明橘）
      if (sk.prev && !on) { band(sk.prev, C.ARENA_R + 0.3, 'rgba(70,24,8,0.78)'); band(sk.r, sk.prev, 'rgba(255,138,48,0.28)'); }
      else band(sk.r, C.ARENA_R + 0.3, on ? 'rgba(70,24,8,0.78)' : 'rgba(255,138,48,0.28)');
      ctx.strokeStyle = on ? 'rgba(255,190,110,0.95)' : 'rgba(255,190,110,0.8)'; ctx.lineWidth = 2.5;
      if (!on) ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(X(0), Z(0), sk.r * scale, 0, PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }

    // 持續區域（高氣壓圈、污泥等）
    for (const z of sim.zones) {
      if (z.t0 !== undefined && t < z.t0) continue;
      if (z.style === 'sludge') {
        const fade = Math.max(0, Math.min(1, (z.t1 - t) / 0.8));
        const g = ctx.createRadialGradient(X(z.x), Z(z.z), 0, X(z.x), Z(z.z), z.r * scale);
        g.addColorStop(0, `rgba(40,20,14,${0.85 * fade})`); g.addColorStop(0.8, `rgba(70,34,40,${0.8 * fade})`); g.addColorStop(1, `rgba(150,80,150,${0.9 * fade})`);
        ctx.fillStyle = g; ctx.strokeStyle = `rgba(200,120,200,${0.9 * fade})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(z.x), Z(z.z), z.r * scale, 0, PI * 2); ctx.fill(); ctx.stroke();
        if (!mini && z.label) { ctx.fillStyle = `rgba(240,200,240,${fade})`; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(z.label, X(z.x), Z(z.z) - z.r * scale - 4); }
        continue;
      }
      const on = z.active !== false;
      const g = ctx.createRadialGradient(X(z.x), Z(z.z), 0, X(z.x), Z(z.z), z.r * scale);
      g.addColorStop(0, `rgba(80,170,255,${on ? 0.12 : 0.04})`); g.addColorStop(1, `rgba(120,200,255,${on ? 0.45 : 0.12})`);
      ctx.fillStyle = g; ctx.strokeStyle = on ? 'rgba(150,215,255,0.95)' : 'rgba(120,200,255,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(z.x), Z(z.z), z.r * scale, 0, PI * 2); ctx.fill(); ctx.stroke();
      if (!mini && z.label) { ctx.fillStyle = 'rgba(190,230,255,0.95)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(z.label, X(z.x), Z(z.z) - z.r * scale - 4); }
    }

    // 預告（教學）：羽毛雨鎖定位置等
    if (o.assist) {
      for (const p of sim.previews) {
        if (t < p.t0 || t >= p.t1 || (p.owner !== undefined && p.owner !== sim.playerSlot)) continue;
        if (p.kb) {   // 擊退落點預覽：從你畫一條線到落點
          const mp = this.ip(me);
          ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,214,120,0.85)'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(X(mp.x), Z(mp.z)); ctx.lineTo(X(p.x), Z(p.z)); ctx.stroke();
          ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), Math.max(6, p.r * scale), 0, PI * 2); ctx.stroke(); ctx.setLineDash([]);
          if (!mini) { ctx.fillStyle = 'rgba(255,224,150,0.95)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('擊退落點', X(p.x), Z(p.z) - Math.max(6, p.r * scale) - 4); }
          continue;
        }
        ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(140,200,255,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), p.r * scale, 0, PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    for (const f of sim.fx) {
      this.drawFx(ctx, f, t, o.assist, scale, X, Z, tsec);
      if (/Whirlwind/.test(f.label) && t >= f.t0 - 0.3 && t <= f.t1 + 0.4) {
        const key = Math.round(f.x) + ',' + Math.round(f.z);
        const tn = this.tornados.get(key) || { x: f.x, z: f.z, born: t };
        tn.last = t; this.tornados.set(key, tn);
      }
    }
    // 龍捲
    for (const [key, tn] of this.tornados) {
      const age = t - tn.last;
      const k = Math.max(0, 1 - Math.max(0, age - 3) / 0.8);
      if (k <= 0) { this.tornados.delete(key); continue; }
      ctx.save(); ctx.translate(X(tn.x), Z(tn.z)); ctx.rotate(tsec * 4);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(PI / 2);
        ctx.strokeStyle = `rgba(225,248,255,${0.7 * k})`; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let j = 0; j <= 20; j++) { const a = j / 20 * 2.6, r = (0.4 + j / 20 * 3.4) * scale; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 連線
    const owner = new Map();
    for (const c of sim.chars) owner.set(c.pos, c);
    for (const a of sim.actors) owner.set(a.pos, a);
    const tp = (p) => (owner.has(p) ? this.ip(owner.get(p)) : p);
    for (const tt of sim.tethers) {
      if (tt.t0 !== undefined && t < tt.t0) continue;
      const pairs = tt.ends ? tt.ends() : [];
      const col = TETHER[tt.kind] || '#ffd34d';
      for (const [a0, b0] of pairs) {
        const a = tp(a0), b = tp(b0);
        ctx.save();
        const lw = tt.kind === 'meso' ? 3.5 : tt.kind === 'fetters' ? 3 : 1.6;
        // 光暈：先畫一條寬的半透明線（比 shadowBlur 便宜很多）
        ctx.globalAlpha = 0.25; ctx.strokeStyle = col; ctx.lineWidth = lw * 3;
        ctx.beginPath(); ctx.moveTo(X(a.x), Z(a.z)); ctx.lineTo(X(b.x), Z(b.z)); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = lw;
        if (tt.kind === 'fetters') { ctx.setLineDash([7, 4]); ctx.lineDashOffset = -tsec * 20; }
        ctx.beginPath(); ctx.moveTo(X(a.x), Z(a.z)); ctx.lineTo(X(b.x), Z(b.z)); ctx.stroke();
        ctx.restore();
      }
    }

    // 目標圈（畫在 Boss／隊員底下）
    const bt = o.btarget === null ? null : U.bossList(sim).find((a) => a.id === o.btarget);
    if (bt) { const p = this.ip(bt); this.drawRing(ctx, 'enemy', X(p.x), Z(p.z), irot(bt, this.alpha), U.hitboxR(sim, bt) * scale); }
    const ac = o.atarget === null ? null : sim.chars[o.atarget];
    if (ac && (!o.solo || ac.slot === sim.playerSlot)) { const p = this.ip(ac); this.drawRing(ctx, 'ally', X(p.x), Z(p.z), 0, Math.max(10, 0.62 * scale) + 7 + Math.sin(tsec * 5) * 1.5); }

    // 敵人與場上實體
    for (const a of sim.actors) {
      if (a.dead || !a.visible) continue;
      ctx.globalAlpha = a.targetable === false && (a.look === 'garuda' || a.look === 'ifrit' || a.look === 'titan') ? 0.45 : 1;
      this.drawActor(ctx, a, X, Z, scale, tsec, mini);
      ctx.globalAlpha = 1;
    }

    // 隊員
    const marks = sim.activeMarks();
    for (const c of sim.chars) {
      if (o.solo && c.slot !== sim.playerSlot) continue;
      this.drawChar(ctx, c, sim, o, scale, X, Z, tsec, marks);
    }
    if (mini) this.drawWaymarks(ctx, o.wm.list, X, Z, scale, mini);

    // 粒子
    this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
    for (const p of this.parts) {
      const k = p.life / p.ttl;
      if (p.ring) {
        const r = p.r0 + (p.r1 - p.r0) * (1 - k);
        ctx.strokeStyle = rgba(p.col, k); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), r * scale, 0, PI * 2); ctx.stroke();
        continue;
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      ctx.fillStyle = rgba(p.col, k);
      ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), p.size * (0.5 + k * 0.5), 0, PI * 2); ctx.fill();
    }

    if (o.assist) this.drawGuide(ctx, sim, scale, X, Z, mini, tsec);

    if (!mini) {
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      for (const f of sim.floats) {
        const c = sim.chars[f.slot];
        if (o.solo && f.slot !== sim.playerSlot) continue;
        const age = t - f.t;
        const fa = 1 - age / 1.2;
        ctx.fillStyle = f.lb ? `rgba(255,216,102,${fa})` : f.text === '中斷' ? `rgba(190,215,255,${fa})` : `rgba(255,130,115,${fa})`;
        const cp = this.ip(c);
        ctx.fillText(f.text, X(cp.x), Z(cp.z) - 1.8 * scale - age * 18);
      }
    }
  }

  /** 場地標點（小地圖也畫，尺寸縮小）；數字標點畫小一點、半透明，避免蓋住站在上面的人。 */
  drawWaymarks(ctx, list, X, Z, scale, mini) {
    for (const w of list) {
      const num = /\d/.test(w.k);
      const s = mini ? Math.max(num ? 13 : 16, scale * (num ? 2.8 : 3.6)) : Math.max(num ? 18 : 22, scale * (num ? 2.4 : 3.0));
      ctx.globalAlpha = mini ? (num ? 0.62 : 0.8) : num ? 0.7 : 0.95;
      ctx.drawImage(IC.waymark(w.k, WM_COLOR[w.k]), X(w.x) - s / 2, Z(w.z) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  /** 螢幕座標 → 場地座標（yalm）。 */
  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.view.cx) / this.view.scale, z: (clientY - r.top - this.view.cz) / this.view.scale };
  }

  drawFx(ctx, f, t, assist, scale, X, Z, tsec) {
    const st = fxState(f, t, assist);
    if (!st) return;
    const col = /Searing/.test(f.label) ? TINTS.fire : (TINTS[f.tint] || TINTS.danger);
    const p = st.early ? 0 : Math.max(0, Math.min(1, (t - f.t0) / Math.max(0.05, f.t1 - f.t0)));
    const x0 = X(f.x), z0 = Z(f.z);
    const path = (k) => {
      ctx.beginPath();
      if (f.kind === 'circle') ctx.arc(x0, z0, f.r * scale * k, 0, PI * 2);
      else if (f.kind === 'ring') { ctx.arc(x0, z0, f.r * scale, 0, PI * 2); ctx.moveTo(x0 + f.inner * scale, z0); ctx.arc(x0, z0, f.inner * scale, 0, PI * 2, true); }
      else if (f.kind === 'cone') { const a = PI / 2 - f.rot; ctx.moveTo(x0, z0); ctx.arc(x0, z0, f.len * scale * k, a - f.half, a + f.half); ctx.closePath(); }
      else { ctx.save(); ctx.translate(x0, z0); ctx.rotate(PI / 2 - f.rot); ctx.rect(0, -f.w / 2 * scale, f.len * scale * k, f.w * scale); ctx.restore(); }
    };
    const fillRule = f.kind === 'ring' ? 'evenodd' : 'nonzero';
    let grad;
    if (f.kind === 'rect') {
      const nx = Math.cos(f.rot) * f.w / 2 * scale, nz = -Math.sin(f.rot) * f.w / 2 * scale;
      grad = ctx.createLinearGradient(x0 - nx, z0 - nz, x0 + nx, z0 + nz);
      grad.addColorStop(0, rgba(col, 0.75)); grad.addColorStop(0.15, rgba(col, 0.4)); grad.addColorStop(0.5, rgba(col, 0.28)); grad.addColorStop(0.85, rgba(col, 0.4)); grad.addColorStop(1, rgba(col, 0.75));
    } else {
      const R = (f.kind === 'cone' ? f.len : f.r) * scale;
      grad = ctx.createRadialGradient(x0, z0, 0, x0, z0, R);
      grad.addColorStop(0, rgba(col, 0.2)); grad.addColorStop(0.75, rgba(col, 0.38)); grad.addColorStop(0.96, rgba(col, 0.7)); grad.addColorStop(1, rgba(col, 0.85));
    }
    ctx.save();
    if (st.flash > 0) {
      ctx.globalAlpha = st.flash;
      ctx.fillStyle = 'rgba(255,248,230,0.75)'; path(1); ctx.fill(fillRule);
      ctx.restore(); return;
    }
    ctx.globalAlpha = st.early ? 0.45 : 1;
    ctx.fillStyle = grad; path(1); ctx.fill(fillRule);
    if (!st.early && p > 0 && f.kind !== 'ring') { ctx.fillStyle = rgba([255, 240, 210], 0.18); path(p); ctx.fill(fillRule); }
    if (!st.early && f.kind === 'ring') { ctx.fillStyle = rgba([255, 240, 210], 0.25 * p); path(1); ctx.fill(fillRule); }
    ctx.strokeStyle = rgba(col.map((v) => Math.min(255, v + 90)), st.early ? 0.6 : 0.9 + 0.1 * Math.sin(tsec * 12));
    ctx.lineWidth = 2;
    if (st.early) ctx.setLineDash([6, 5]);
    path(1); ctx.stroke();
    ctx.setLineDash([]);
    if (f.tint === 'share' && f.kind === 'circle' && !st.early) {
      const s = f.r * 2 * scale;
      ctx.translate(x0, z0); ctx.rotate(tsec * 0.8); ctx.globalAlpha = 0.85;
      ctx.drawImage(IC.stackRing(), -s / 2, -s / 2, s, s);
    }
    ctx.restore();
  }

  /** 目標圈貼圖：前方（貼圖下方）轉到面向 rot，圓環半徑 rpx 像素。 */
  drawRing(ctx, kind, x, z, rot, rpx) {
    const s = 512 * rpx / IC.RING_R;
    ctx.save(); ctx.translate(x, z); ctx.rotate(-rot); ctx.drawImage(IC.targetRing(kind), -s / 2, -s / 2, s, s); ctx.restore();
  }
  drawActor(ctx, a, X, Z, scale, tsec, mini) {
    const ap = this.ip(a);
    const ar = irot(a, this.alpha);
    const px = X(ap.x), pz = Z(ap.z), fx = Math.sin(ar), fz = Math.cos(ar);
    const face = (r, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(px + fx * r * 1.45, pz + fz * r * 1.45);
      ctx.lineTo(px + fx * r * 0.7 - fz * r * 0.5, pz + fz * r * 0.7 + fx * r * 0.5);
      ctx.lineTo(px + fx * r * 0.7 + fz * r * 0.5, pz + fz * r * 0.7 - fx * r * 0.5);
      ctx.closePath(); ctx.fill();
    };
    const label = (txt, r) => { if (mini || scale < 6 || !txt) return; ctx.fillStyle = '#f0f4fa'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(txt, px, pz + r + 13); };
    const disc = (r, c0, c1, stroke) => {
      const g = ctx.createRadialGradient(px - r * 0.3, pz - r * 0.3, r * 0.1, px, pz, r);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, pz, r, 0, PI * 2); ctx.fill(); ctx.stroke();
    };
    switch (a.look) {
      case 'garuda': case 'sister': {
        const r = (a.look === 'garuda' ? 1.9 : 1.3) * scale;
        const col = a.tint || '#36c58a';
        ctx.save(); ctx.translate(px, pz); ctx.rotate(-ar);
        const flap = Math.sin(tsec * 3) * 0.12;
        for (const s of [-1, 1]) {
          ctx.save(); ctx.scale(s, 1); ctx.rotate(flap);
          ctx.fillStyle = 'rgba(230,245,225,0.9)'; ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.2); ctx.quadraticCurveTo(r * 2.2, -r * 0.9, r * 2.3, r * 0.4); ctx.quadraticCurveTo(r * 1.4, r * 0.2, r * 0.3, r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
        disc(r, '#e8fff0', col, '#0f5a3d'); face(r, '#0f5a3d');
        label(a.name, r); break;
      }
      case 'ifrit': case 'ifrit_clone': {
        const r = (a.look === 'ifrit' ? 1.9 : 1.5) * scale;
        const blue = a.blue;
        const ga = ctx.createRadialGradient(px, pz, r * 0.6, px, pz, r * 1.8);
        ga.addColorStop(0, blue ? 'rgba(90,180,255,0.5)' : 'rgba(255,120,40,0.5)'); ga.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = ga; ctx.beginPath(); ctx.arc(px, pz, r * (1.8 + Math.sin(tsec * 8) * 0.06), 0, PI * 2); ctx.fill();
        ctx.save(); if (a.look === 'ifrit_clone') ctx.globalAlpha *= 0.75;
        disc(r, blue ? '#9fd0ff' : '#ff9a6a', blue ? '#2a5ab8' : '#b8281a', blue ? '#0a2a6a' : '#4a0a05');
        ctx.translate(px, pz); ctx.rotate(-ar);
        ctx.fillStyle = '#efe2bc';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.45, r * 0.3); ctx.quadraticCurveTo(s * r * 1.3, r * 0.2, s * r * 1.15, -r * 0.6); ctx.quadraticCurveTo(s * r * 0.9, 0, s * r * 0.25, r * 0.55); ctx.fill(); }
        ctx.restore();
        face(r, blue ? '#0a2a6a' : '#4a0a05');
        label(a.name, r); break;
      }
      case 'titan': {
        // 跳到空中：落點處畫影子，本體放大變淡
        const lift = a.lift || 0, r = 2.9 * scale;
        if (lift > 0) { ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - lift * 0.6)})`; ctx.beginPath(); ctx.arc(px, pz, r * (1 + lift * 0.6), 0, PI * 2); ctx.fill(); }
        ctx.save(); ctx.globalAlpha *= 1 - lift * 0.85; ctx.translate(px, pz); ctx.scale(1 + lift, 1 + lift); ctx.translate(-px, -pz);
        ctx.fillStyle = '#c8a070';
        for (let i = 0; i < 8; i++) { const an = -ar + PI / 2 + (i / 8) * PI * 2; if (i === 0) continue; ctx.beginPath(); ctx.moveTo(px + Math.cos(an - 0.18) * r * 0.9, pz + Math.sin(an - 0.18) * r * 0.9); ctx.lineTo(px + Math.cos(an) * r * 1.3, pz + Math.sin(an) * r * 1.3); ctx.lineTo(px + Math.cos(an + 0.18) * r * 0.9, pz + Math.sin(an + 0.18) * r * 0.9); ctx.fill(); }
        disc(r, '#c8a77a', '#5e4630', '#2e2010');
        ctx.strokeStyle = 'rgba(255,170,70,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px - r * 0.5, pz - r * 0.1); ctx.lineTo(px - r * 0.1, pz + r * 0.15); ctx.lineTo(px + r * 0.35, pz - r * 0.2); ctx.stroke();
        face(r, '#2e2010');
        ctx.restore();
        label(a.name, r); break;
      }
      case 'ultima': {
        const r = 2.6 * scale;
        ctx.save(); ctx.translate(px, pz); ctx.rotate(-ar);
        ctx.fillStyle = 'rgba(160,120,255,0.45)';
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.5, -r * 0.3); ctx.lineTo(sx * r * 2.1, -r * 0.9); ctx.lineTo(sx * r * 1.9, -r * 0.2); ctx.lineTo(sx * r * 0.6, r * 0.2); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        disc(r, '#9aa4c4', '#3a4058', '#1a1830');
        const gl = ctx.createRadialGradient(px, pz, 0, px, pz, r * 0.5);
        gl.addColorStop(0, 'rgba(200,140,255,0.95)'); gl.addColorStop(1, 'rgba(160,100,255,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, pz, r * 0.5 * (1 + 0.1 * Math.sin(tsec * 4)), 0, PI * 2); ctx.fill();
        face(r, '#1a1830');
        label(a.name, r); break;
      }
      case 'lahabrea': {
        const r = 1.0 * scale;
        disc(r, '#3a3a48', '#121218', '#000');
        ctx.fillStyle = '#e8e2d6'; ctx.beginPath(); ctx.arc(px + fx * r * 0.35, pz + fz * r * 0.35, r * 0.4, 0, PI * 2); ctx.fill();
        face(r, '#9a1a1a');
        this.hpBar(ctx, px, pz - r * 1.6, r * 2.4, a.hp);
        label(a.name, r); break;
      }
      case 'bit': {
        const r = 0.75 * scale;
        ctx.save(); ctx.translate(px, pz); ctx.rotate(-ar);
        ctx.fillStyle = '#6a7084'; ctx.strokeStyle = '#1e2230'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, r * 1.2); ctx.lineTo(r, -r * 0.7); ctx.lineTo(-r, -r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = `rgba(255,80,60,${0.6 + 0.4 * Math.abs(Math.sin(tsec * 6))})`; ctx.beginPath(); ctx.arc(0, r * 0.3, r * 0.28, 0, PI * 2); ctx.fill();
        ctx.restore();
        this.hpBar(ctx, px, pz - r * 1.6, r * 2.2, a.hp);
        break;
      }
      case 'orb': {
        const r = 0.8 * scale, gl = ctx.createRadialGradient(px, pz, 0, px, pz, r * 1.9);
        gl.addColorStop(0, `rgba(210,140,255,${0.55 + 0.25 * Math.sin(tsec * 6)})`); gl.addColorStop(1, 'rgba(140,60,220,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, pz, r * 1.9, 0, PI * 2); ctx.fill();
        disc(r, '#e2b8ff', '#9a4ae0', '#4a1a80');
        label(a.name, r);
        break;
      }
      case 'feather': {
        const r = 1.0 * scale;
        ctx.save(); ctx.translate(px, pz); ctx.rotate(-a.rot + 0.6);
        ctx.fillStyle = 'rgba(200,245,154,0.95)'; ctx.strokeStyle = '#2a7a1a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r * 1.25, 0, 0, PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(0, r * 1.25); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'bomb': {
        const r = 0.95 * scale, k = a.hp;
        if (k > 0) { const gl = ctx.createRadialGradient(px, pz, 0, px, pz, r * 2); gl.addColorStop(0, `rgba(255,140,50,${0.35 + 0.25 * Math.sin(tsec * (6 + 8 * k))})`); gl.addColorStop(1, 'rgba(255,100,30,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, pz, r * 2, 0, PI * 2); ctx.fill(); }
        disc(r, '#8a6a4a', '#4a3020', '#2a1a0a');
        ctx.fillStyle = `rgba(255,150,60,${0.6 + 0.4 * k})`;
        for (let i = 0; i < 5; i++) { const an = i * 1.256 + 0.3; ctx.beginPath(); ctx.arc(px + Math.cos(an) * r * 0.55, pz + Math.sin(an) * r * 0.55, Math.max(1.5, r * 0.14), 0, PI * 2); ctx.fill(); }
        break;
      }
      case 'gaol': {
        const r = 1.15 * scale;
        ctx.strokeStyle = '#3a2814'; ctx.lineWidth = Math.max(3, scale * 0.35); ctx.fillStyle = 'rgba(122,96,72,0.35)';
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const an = i / 7 * PI * 2; ctx.lineTo(px + Math.cos(an) * r, pz + Math.sin(an) * r); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a6a4a';
        for (let i = 0; i < 7; i++) { const an = i / 7 * PI * 2; ctx.beginPath(); ctx.arc(px + Math.cos(an) * r, pz + Math.sin(an) * r, Math.max(2, scale * 0.28), 0, PI * 2); ctx.fill(); }
        break;
      }
      case 'spiny': {
        const r = 0.9 * scale;
        ctx.fillStyle = '#d9f08a';
        for (let i = 0; i < 10; i++) { const an = i / 10 * PI * 2 + tsec; ctx.beginPath(); ctx.moveTo(px + Math.cos(an) * r * 1.5, pz + Math.sin(an) * r * 1.5); ctx.lineTo(px + Math.cos(an + 0.25) * r * 0.8, pz + Math.sin(an + 0.25) * r * 0.8); ctx.lineTo(px + Math.cos(an - 0.25) * r * 0.8, pz + Math.sin(an - 0.25) * r * 0.8); ctx.fill(); }
        disc(r, '#b8f07a', '#4a9a2a', '#2a5a14'); label('刺羽', r); break;
      }
      case 'plume': {
        const r = 0.8 * scale;
        ctx.save(); ctx.translate(px, pz); ctx.rotate(tsec * 1.2);
        ctx.fillStyle = `rgba(243,238,254,${0.4 + 0.6 * a.hp})`; ctx.strokeStyle = '#8a6ac0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r * 1.1, 0.5, 0, PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
        this.hpBar(ctx, px, pz - r * 1.4, r * 2, a.hp); break;
      }
      case 'nail': {
        const r = 1.0 * scale, h = r * (0.6 + 0.6 * a.hp);
        const gl = ctx.createRadialGradient(px, pz, 0, px, pz, r * 1.6);
        gl.addColorStop(0, `rgba(255,140,60,${0.45 + 0.15 * Math.sin(tsec * 5 + a.pos.x)})`); gl.addColorStop(1, 'rgba(255,100,30,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, pz, r * 1.6, 0, PI * 2); ctx.fill();
        ctx.fillStyle = '#7a2a14'; ctx.strokeStyle = '#ffb07a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, pz - h); ctx.lineTo(px + r * 0.6, pz); ctx.lineTo(px, pz + h * 0.6); ctx.lineTo(px - r * 0.6, pz); ctx.closePath(); ctx.fill(); ctx.stroke();
        this.hpBar(ctx, px, pz - r * 1.5, r * 2, a.hp);
        if (a.badge) { ctx.fillStyle = '#ffe27a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★'.repeat(Math.min(3, a.badge)), px, pz + r * 1.2); }
        label(a.name, r * 1.4); break;
      }
      default: {
        const r = 0.8 * scale;
        ctx.save(); ctx.translate(px, pz); ctx.rotate(tsec * 2);
        ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#8a6a00'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const an = i / 10 * PI * 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        break;
      }
    }
  }
  hpBar(ctx, x, y, w, hp) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y, w, 3);
    ctx.fillStyle = '#9be05a'; ctx.fillRect(x - w / 2, y, w * hp, 3);
  }

  drawChar(ctx, c, sim, o, scale, X, Z, tsec, marks) {
    const cp = this.ip(c);
    const role = ROLES[c.slot], px = X(cp.x), pz = Z(cp.z);
    const isMe = c.slot === sim.playerSlot;
    let r = Math.max(7, 0.62 * scale);
    if (c.fell) { ctx.globalAlpha = 0.35; }
    if (c.kb) { // 擊退中：放大＋影子表示在空中
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(px, pz, r, 0, PI * 2); ctx.fill();
      r *= 1.35;
    }
    if (!c.alive) {
      ctx.fillStyle = '#5a5f68'; ctx.beginPath(); ctx.arc(px, pz, r * 0.85, 0, PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff6b5e'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px - r * 0.6, pz - r * 0.6); ctx.lineTo(px + r * 0.6, pz + r * 0.6); ctx.moveTo(px + r * 0.6, pz - r * 0.6); ctx.lineTo(px - r * 0.6, pz + r * 0.6); ctx.stroke();
      // 有人正在救／已收到復活：金色光圈與 ✚
      const saving = sim.chars.some((x) => x.cast && x.cast.id === 'raise' && x.cast.tg === c.slot);
      if ((c.raise || saving) && !o.mini) {
        ctx.strokeStyle = `rgba(255,216,102,${c.raise ? 0.9 : 0.45 + 0.35 * Math.sin(tsec * 8)})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px, pz, r + 4, 0, PI * 2); ctx.stroke();
        if (c.raise) { ctx.fillStyle = '#ffd866'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('✚', px, pz - r - 6); }
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (isMe && !o.mini) {
      const pr = r + 5 + Math.sin(tsec * 5) * 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, pz, pr, 0, PI * 2); ctx.stroke();
    }
    const g = ctx.createRadialGradient(px - r * 0.35, pz - r * 0.35, r * 0.1, px, pz, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, role.color); g.addColorStop(1, role.color);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, pz, r, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(0,0,0,0.6)'; ctx.lineWidth = isMe ? 3 : 1.5; ctx.stroke();
    const cr = irot(c, this.alpha), fx = Math.sin(cr), fz = Math.cos(cr);
    // 衝刺中移動：身後的速度線
    if (c.walk > 1 && !o.mini && sim.statusesOf(c).some((x) => x.id === 'sprint')) {
      ctx.strokeStyle = 'rgba(140,220,255,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const k of [-0.55, 0, 0.55]) {
        const ox = px - fx * (r + 3) + fz * k * r, oz = pz - fz * (r + 3) - fx * k * r, L = r * (k ? 1.1 : 1.7) * (0.8 + 0.2 * Math.sin(tsec * 20 + k * 5));
        ctx.beginPath(); ctx.moveTo(ox, oz); ctx.lineTo(ox - fx * L, oz - fz * L); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(px + fx * (r + 5), pz + fz * (r + 5));
    ctx.lineTo(px + fx * r - fz * 4, pz + fz * r + fx * 4);
    ctx.lineTo(px + fx * r + fz * 4, pz + fz * r - fx * 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a0f17'; ctx.font = `bold ${Math.max(9, r * 0.95)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(role.key, px, pz + 0.5);
    if (o.mini) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px - r, pz + r + 3, r * 2, 4);
    ctx.fillStyle = c.hp > 50 ? '#52d17c' : c.hp > 25 ? '#e6c84a' : '#e5584d'; ctx.fillRect(px - r, pz + r + 3, r * 2 * (c.hp / 100), 4);
    // 讀條（藍：攻擊；金：復活）
    if (c.cast) {
      const k = c.cast, p = Math.max(0, Math.min(1, (sim.t - k.t0) / (k.t1 - k.t0)));
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(px - r, pz + r + 9, r * 2, 4);
      ctx.fillStyle = k.id === 'raise' ? '#ffd866' : '#7fc4ff'; ctx.fillRect(px - r, pz + r + 9, r * 2 * p, 4);
    }
    // 狀態光環
    for (const s of sim.statusesOf(c)) {
      if (s.id === 'searing') { ctx.strokeStyle = `rgba(255,120,40,${0.6 + 0.3 * Math.sin(tsec * 8)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, pz, r + 3, 0, PI * 2); ctx.stroke(); }
      if (s.id === 'curse') { ctx.strokeStyle = `rgba(190,90,255,${0.6 + 0.3 * Math.sin(tsec * 8)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, pz, r + 3, 0, PI * 2); ctx.stroke(); }
      if (s.id === 'thermal') { ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('❄' + s.stacks, px + r + 3, pz); }
    }
    // 頭頂點名標記
    let off = 0;
    for (const m of marks) {
      if (m.slot !== c.slot) continue;
      const age = sim.t - m.t0, pop = age < 0.25 ? 0.6 + age / 0.25 * 0.6 : age < 0.4 ? 1.2 - (age - 0.25) / 0.15 * 0.2 : 1;
      const s = 28 * pop, my = pz - r - 18 - off + Math.sin(tsec * 4) * 2;
      ctx.drawImage(IC.marker(m.type), px - s / 2, my - s / 2, s, s);
      off += 26;
    }
  }

  drawGuide(ctx, sim, scale, X, Z, mini, tsec) {
    const cur = sim.guide.cur, nxt = sim.guide.next, me = sim.pc;
    const spot = (s, alpha, label) => {
      if (!s) return;
      const sx = X(s.spot.x), sz = Z(s.spot.z), rr = Math.max(8, 0.9 * scale) * (1 + Math.sin(tsec * 6) * 0.06);
      ctx.save();
      ctx.strokeStyle = `rgba(255,236,120,${alpha})`; ctx.fillStyle = `rgba(255,236,120,${alpha * 0.18})`; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(sx, sz, rr, 0, PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx - 5, sz); ctx.lineTo(sx + 5, sz); ctx.moveTo(sx, sz - 5); ctx.lineTo(sx, sz + 5); ctx.stroke();
      if (!mini && label) { ctx.fillStyle = `rgba(255,240,150,${Math.min(1, alpha + 0.2)})`; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, sx, sz - rr - 6); }
      ctx.restore();
    };
    if (nxt && (!cur || nxt.id !== cur.id || Math.hypot(nxt.spot.x - cur.spot.x, nxt.spot.z - cur.spot.z) > 0.3)) spot(nxt, 0.55, `${nxt.title}（${Math.max(0, nxt.t - sim.t).toFixed(1)}s）`);
    if (cur) {
      spot(cur, 1, '建議站位');
      const d = Math.hypot(cur.spot.x - me.pos.x, cur.spot.z - me.pos.z);
      if (d > 1.2 && me.alive) {
        ctx.strokeStyle = 'rgba(255,236,120,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
        const mp = this.ip(me);
        ctx.beginPath(); ctx.moveTo(X(mp.x), Z(mp.z)); ctx.lineTo(X(cur.spot.x), Z(cur.spot.z)); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }
}

root.Renderer2D = Renderer2D;
root.fxState = fxState;
})(window);
