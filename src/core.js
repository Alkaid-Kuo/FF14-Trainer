/* UWU 練習器：共用模擬核心。座標：x 向東，z 向南（北 = -z），單位 yalm，場地半徑 20。
   rot：0 面向南(+z)，PI 面向北(-z)，向量 = (sin rot, cos rot)。
   各階段（P1 迦樓羅、P2 伊弗利特…）以 UWU.PHASES[id] 註冊：roll / start / setup / build / objectives。 */
(function (root) {
'use strict';

const PI = Math.PI;

const C = {
  ARENA_R: 20, EDGE_DEATH: 19.5, SPEED: 6, NPC_SPEED: 6.6, REGEN: 2.5,
};

/** 狀態（Buff/Debuff）與頭頂點名的顯示定義；icon 是狀態圖示上的字。 */
const STATUS_DEF = {
  thermal: { name: '低氣壓', icon: '低', color: '#4aa3ff' },
  searing: { name: '熱風', icon: '熱', color: '#ff7a2f' },
  fetters: { name: '火獄之鎖', icon: '鎖', color: '#d9534f' },
  curse: { name: '詛咒之炎', icon: '炎', color: '#b04ae0' },
  mark_song: { name: '寒風之歌（點名）', icon: '歌', color: '#3fd17a', mark: true },
  mark_friction: { name: '烈風刃（點名）', icon: '刃', color: '#ffc83c', mark: true },
  mark_crush: { name: '烈焰碎擊（分攤）', icon: '分', color: '#ff5a3c', mark: true },
  mark_gaol: { name: '花崗石牢（點名）', icon: '牢', color: '#d8a060', mark: true },
  gaol: { name: '花崗石牢（拘束・無敵）', icon: '牢', color: '#a07850' },
  stun: { name: '暈眩', icon: '暈', color: '#e0c050' },
  transcendent: { name: '復活無敵', icon: '無', color: '#f5e27a' },
};

const ROLES = [
  { slot: 0, key: 'MT', name: '主坦 MT', kind: 'tank', color: '#4f8dff' },
  { slot: 1, key: 'OT', name: '副坦 OT', kind: 'tank', color: '#2f63d8' },
  { slot: 2, key: 'H1', name: '補師 H1', kind: 'healer', color: '#49cf7a' },
  { slot: 3, key: 'H2', name: '補師 H2', kind: 'healer', color: '#9be04c' },
  { slot: 4, key: 'M1', name: '近戰 M1', kind: 'dps', color: '#ff6b5e' },
  { slot: 5, key: 'M2', name: '近戰 M2', kind: 'dps', color: '#ff9150' },
  { slot: 6, key: 'R', name: '遠程 R', kind: 'dps', color: '#ff5f9e' },
  { slot: 7, key: 'C', name: '法系 C', kind: 'dps', color: '#b27bff' },
];
const MT = 0, OT = 1, H1 = 2, H2 = 3, M1 = 4, M2 = 5, RR = 6, CC = 7;

/** 場地標點（攻略標準：A/B/C/D 在正點、1 號位在中心）。顏色照 FF14：A/1 紅、B/2 黃、C/3 藍、D/4 紫。 */
const WM_COLOR = { A: '#ff4d4d', B: '#ffd23f', C: '#4da6ff', D: '#c46bff', 1: '#ff4d4d', 2: '#ffd23f', 3: '#4da6ff', 4: '#c46bff' };
const WAYMARKS = [
  { k: 'A', x: 0, z: -17.2 }, { k: 'B', x: 17.2, z: 0 }, { k: 'C', x: 0, z: 17.2 }, { k: 'D', x: -17.2, z: 0 }, { k: '1', x: 0, z: 0 },
];
const isTank = (s) => s === MT || s === OT;
const isHealer = (s) => s === H1 || s === H2;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash01(a, b, c) {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9E3779B1) ^ Math.imul(c | 0, 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
  h = Math.imul(h ^ (h >>> 12), 0x297A2D39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function shuffler(rng) {
  return (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function angDiff(a, b) { let d = a - b; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return d; }
const inCircle = (p, c, r) => Math.hypot(p.x - c.x, p.z - c.z) <= r;
function inRing(p, c, r0, r1) { const d = Math.hypot(p.x - c.x, p.z - c.z); return d >= r0 && d <= r1; }
function inCone(p, o, rot, half, len) {
  const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
  if (d > len) return false;
  if (d < 1e-6) return true;
  return Math.abs(angDiff(Math.atan2(dx, dz), rot)) <= half;
}
function inRect(p, o, rot, hw, len) {
  const dx = p.x - o.x, dz = p.z - o.z, fx = Math.sin(rot), fz = Math.cos(rot);
  const f = dx * fx + dz * fz, s = dx * fz - dz * fx;
  return f >= 0 && f <= len && Math.abs(s) <= hw;
}
function segInfo(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2));
  return { t, d: Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)) };
}
/** 羅盤方位（自北順時針，度）→ 位置。 */
const atBearing = (deg, r) => ({ x: r * Math.sin(deg * PI / 180), z: -r * Math.cos(deg * PI / 180) });
const bearingOf = (p) => ((Math.atan2(p.x, -p.z) * 180 / PI) + 360) % 360;
const norm360 = (d) => ((d % 360) + 360) % 360;
/** 畫面內插：模擬固定每秒 60 步，畫面在上一步與這一步之間依 alpha 取位置，高更新率螢幕才不會一頓一頓。 */
const ipos = (e, alpha) => ({ x: e.prev.x + (e.pos.x - e.prev.x) * alpha, z: e.prev.z + (e.pos.z - e.prev.z) * alpha });
const irot = (e, alpha) => e.prevRot + angDiff(e.rot, e.prevRot) * alpha;
/** 攻略圖的面向（自北順時針度數）→ 本程式的 rot。 */
const rotFromBearing = (deg) => PI - deg * PI / 180;
const rotateXZ = (p, deg) => {
  const a = deg * PI / 180, c = Math.cos(a), s = Math.sin(a);
  // 自北順時針旋轉 deg：(x,z) → (x cos - (-z) ... ) 以螢幕座標（x 右、z 下）順時針旋轉
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

/** 場上會被畫出來的實體（Boss、小怪、分身…）。 */
class Actor {
  constructor(look, name, x, z, rot) {
    this.look = look; this.name = name;
    this.pos = { x, z }; this.rot = rot || 0;
    this.prev = { x, z };              // 上一個模擬步的位置與朝向（畫面內插用）
    this.prevRot = this.rot;
    this.visible = true; this.targetable = true;
    this.goal = null; this.speed = 0;
    this.hp = 1; this.blue = false; this.tint = null; this.dead = false;
    this.lift = 0;                     // 跳到空中的高度比例（0 = 地面，1 = 看不見的高空）
  }
  moveTo(x, z, speed) { this.goal = { x, z }; this.speed = speed; }
  stepMove(dt) {
    if (!this.goal) return;
    const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z, d = Math.hypot(dx, dz), m = this.speed * dt;
    if (d <= m) { this.pos.x = this.goal.x; this.pos.z = this.goal.z; this.goal = null; }
    else { this.pos.x += dx / d * m; this.pos.z += dz / d * m; }
  }
}

const PHASES = {};

class Sim {
  /** opts: { phase, seed, playerSlot, autoPlayer, stopOnDeath, startPos?, preRoll?, variant?, remote? }
      startPos / preRoll：完整體驗模式接續上一階段時，沿用上一階段結束時的位置，preRoll 0＝無倒數直接開始。
      variant：打法（例如 P3 的 'regular' / 'suicide'）。
      remote：連線時其他真人玩家的職位（位置由網路傳來，不由 AI 控制）。 */
  constructor(opts) {
    this.phase = PHASES[opts.phase || 'p1'];
    this.seed = opts.seed >>> 0;
    this.variant = opts.variant || null;
    this.playerSlot = opts.playerSlot;
    this.humans = new Set([this.playerSlot].concat(opts.remote || []));   // 真人控制的職位（受傷紀錄、結算都算他們）
    this.stopOnDeath = opts.stopOnDeath !== false;
    this.t = opts.preRoll === undefined ? this.phase.preRoll : opts.preRoll;   // 倒數秒數（負值）
    this.t0 = this.t;
    this.status = 'running';          // running | failed | cleared
    this.failure = null;
    this.events = []; this.evIdx = 0;
    this.moves = [];
    this.fx = []; this.fxSeq = 0;
    this.casts = []; this.marks = []; this.feed = []; this.notes = []; this.floats = [];
    this.tethers = []; this.zones = []; this.previews = []; this.actors = [];
    this.statuses = [];                // { slot, id, t0, t1 }，t1 = null 表示無時限
    this.screenFx = [];                // 全畫面效果（全體攻擊閃光／震動）：{ t, type, power }
    this.sounds = [];                  // 機制專屬音效提示（例如羽毛雨前的鷹嘯）：{ t, name }
    this.edgeR = C.EDGE_DEATH;         // 超過這個半徑即死（場地縮小時變小）
    this.shrink = null;                // 場地縮小的危險區域（畫面用）：{ r, warn, from }
    this.edgeMsg = '碰到場地邊緣：墜落死亡';
    this.avoid = [];                   // 隊友 AI 走路時會繞開的圓（污泥等）：{ x, z, r, t0, t1 }
    this.input = { x: 0, z: 0 };
    this.guides = ROLES.map(() => ({ cur: null, next: null }));   // 每個職位各自的教學指引（連線時每人看自己的）
    this.s = {};                       // 階段自訂狀態
    this.roll = this.phase.roll(this.seed);

    const start = opts.startPos || this.phase.start(this.roll);
    this.chars = ROLES.map((r) => ({
      slot: r.slot, key: r.key, kind: r.kind,
      pos: { x: start[r.slot][0], z: start[r.slot][1] }, prev: { x: start[r.slot][0], z: start[r.slot][1] }, rot: PI, prevRot: PI,
      goal: null, goalAt: 0, auto: r.slot !== this.playerSlot || !!opts.autoPlayer,
      alive: true, hp: 100, thermal: 0, searing: false, dwell: 0, deathCause: null,
      kb: null, kbSeq: 0, fell: false, walk: 0, stunUntil: 0, invulnUntil: 0, planned: false, raise: null,
      remote: (opts.remote || []).includes(r.slot), net: null,
      stats: { damage: 0 },
    }));
    this.pc = this.chars[this.playerSlot];

    this.phase.setup(this);
    this.phase.build(this);
    if (opts.startPos) {
      this.move(this.t + 0.01, 'transit', '轉場：移到本階段起始位置', () => (this.phase.transitSpots ? this.phase.transitSpots(this) : this.phase.start(this.roll)), {
        preview: false, tip: () => `${this.phase.name} 已經開始：移到起始位置（黃圈）。`,
      });
    }
    this.events.sort((a, b) => a.t - b.t || a.seq - b.seq);
    this.moves.sort((a, b) => a.t - b.t);
    this.moves.forEach((mv, idx) => {
      mv.idx = idx;
      this.at(mv.t, () => this.runMove(mv));
      if (mv.preview) this.at(mv.t - 2.0, () => this.previewMove(mv));
    });
    this.events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  }

  // ---------------------------------------------------------------- 基礎
  at(t, fn) { this.events.push({ t, fn, seq: this.events.length }); }
  log(text, slot, hint) { this.feed.push({ t: this.t, text, slot: slot === undefined ? -1 : slot, hint: !!hint }); if (this.feed.length > 60) this.feed.shift(); }
  note(type, text, slot) { this.notes.push({ t: this.t, type, text, slot: slot === undefined ? -1 : slot }); }
  addFx(o) {
    const fx = Object.assign({ id: ++this.fxSeq, kind: 'circle', x: 0, z: 0, rot: 0, r: 1, inner: 0, half: 0, len: 0, w: 0, t0: this.t, t1: this.t + 1, follow: null, tint: 'danger', label: '' }, o);
    this.fx.push(fx);
    return fx;
  }
  cast(who, name, t0, dur) { this.casts.push({ who, name, t0, t1: t0 + dur }); }
  mark(slot, type, t0, t1) { this.marks.push({ slot, type, t0, t1 }); }
  activeMarks() { return this.marks.filter((m) => this.t >= m.t0 && this.t <= m.t1); }
  activeCasts() { return this.casts.filter((c) => this.t >= c.t0 && this.t <= c.t1); }
  actor(look, name, x, z, rot) { const a = new Actor(look, name, x, z, rot); a.id = (this.actorSeq = (this.actorSeq || 0) + 1); this.actors.push(a); return a; }
  despawn(a) { if (!a) return; a.dead = true; a.visible = false; }
  alive() { return this.chars.filter((c) => c.alive); }

  /** 死亡。opt.planned：打法內的計畫死亡（自殺流），不算失敗；opt.force：無視無敵（場地邊緣、危險區域）。 */
  kill(c, cause, opt) {
    if (!c.alive) return;
    const o = opt || {};
    if (!o.force && this.t < c.invulnUntil) return;
    c.alive = false; c.deathCause = cause; c.goal = null; c.planned = !!o.planned;
    if (o.planned) { this.log(`${c.key} 死亡（照打法）：${cause}`, c.slot); return; }
    this.notes.push({ t: this.t, type: 'death', text: cause, slot: c.slot });
    this.log(`${c.key} 死亡：${cause}`, c.slot);
    if (!this.failure) this.failure = { t: this.t, slot: c.slot, cause };
    if (this.stopOnDeath && this.status === 'running') this.status = 'failed';
  }
  /** 復活（接受復活後在屍體位置起身）。 */
  revive(c, hp) {
    c.alive = true; c.planned = false; c.deathCause = null; c.hp = hp; c.raise = null; c.kb = null; c.goal = null;
    this.log(`${c.key} 接受復活`, c.slot);
  }
  damage(c, pct, why, quiet) {
    if (!c.alive) return;
    c.hp = Math.max(1, c.hp - pct);
    c.stats.damage += pct;
    this.floats.push({ slot: c.slot, t: this.t, text: `-${Math.round(pct)}%` });
    if (!quiet && this.humans.has(c.slot) && pct >= 20) this.note('hit', `${why}（-${Math.round(pct)}%）`, c.slot);
  }
  sound(name) { this.sounds.push({ t: this.t, name }); }
  raidwide(name, pct, tankPct) {
    this.log(`${name} 全體攻擊`);
    this.screenFx.push({ t: this.t, type: 'raidwide', power: pct >= 40 ? 1 : 0.6 });
    for (const c of this.chars) if (c.alive) this.damage(c, isTank(c.slot) && tankPct !== undefined ? tankPct : pct, name);
  }

  /**
   * 通用範圍攻擊。shape：circle/ring/cone/rect（欄位同 fx）。
   * snap 為判定瞬間（預設 = tRes）；tankSafe：坦克只受傷不致死。
   */
  hazard(o) {
    const tRes = o.tRes, snap = o.snap === undefined ? tRes : o.snap;
    let fx = null, hit = [];
    this.at(o.t0, () => {
      const g = typeof o.geom === 'function' ? o.geom() : o.geom;
      fx = this.addFx(Object.assign({ t1: tRes, label: o.label || '', tint: o.tint || 'danger', assistFrom: o.assistFrom }, g, { kind: o.kind, t0: o.omen === undefined ? o.t0 : o.omen }));
      if (o.follow) fx.follow = o.follow;
      if (o.castBy) this.cast(o.castBy[0], o.castBy[1], o.t0, o.castBy[2]);
    });
    const test = (c) => {
      const f = fx; if (!f) return false;
      if (f.kind === 'circle') return inCircle(c.pos, f, f.r);
      if (f.kind === 'ring') return inRing(c.pos, f, f.inner, f.r);
      if (f.kind === 'cone') return inCone(c.pos, f, f.rot, f.half, f.len);
      if (f.kind === 'rect') return inRect(c.pos, f, f.rot, f.w / 2, f.len);
      return false;
    };
    this.at(snap, () => { hit = fx ? this.alive().filter(test) : []; });
    this.at(tRes, () => {
      if (!fx) return;
      const list = snap === tRes ? this.alive().filter(test) : hit.filter((c) => c.alive);
      if (o.onResolve) o.onResolve(list, fx);
      if (o.noKill) return;
      for (const c of list) {
        if (o.tankSafe && isTank(c.slot)) { this.damage(c, o.tankDmg || 45, o.label, o.quiet); c.stats.tankHits = (c.stats.tankHits || 0) + 1; continue; }
        this.kill(c, o.killMsg || `被 ${o.label} 擊中`);
      }
    });
    return () => fx;
  }

  /** 加上狀態；dur 為 null 表示無時限（同一狀態會覆蓋）。 */
  addStatus(slot, id, dur) {
    this.statuses = this.statuses.filter((s) => !(s.slot === slot && s.id === id));
    this.statuses.push({ slot, id, t0: this.t, t1: dur === null ? null : this.t + dur });
  }
  removeStatus(slot, id) { this.statuses = this.statuses.filter((s) => !(s.slot === slot && s.id === id)); }
  /** 某人身上目前的狀態與點名（顯示用）：{ id, t1, stacks }。 */
  statusesOf(c) {
    const out = [];
    for (const m of this.activeMarks()) if (m.slot === c.slot && STATUS_DEF['mark_' + m.type]) out.push({ id: 'mark_' + m.type, t1: m.t1, stacks: 0 });
    for (const s of this.statuses) if (s.slot === c.slot && this.t >= s.t0) out.push({ id: s.id, t1: s.t1, stacks: 0 });
    if (c.thermal) out.push({ id: 'thermal', t1: null, stacks: c.thermal });
    return out;
  }
  /** 往固定方向 (ux, uz) 擊退 distance。 */
  knockVec(c, ux, uz, distance, dur) {
    c.kb = { vx: ux * distance / dur, vz: uz * distance / dur, t0: this.t, until: this.t + dur, seq: ++c.kbSeq };
    c.goal = null;
  }
  /** 擊退：從 from 往外推 distance（屍體也會被擊飛）。 */
  knock(c, from, distance, dur) {
    const dx = c.pos.x - from.x, dz = c.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    c.kb = { vx: dx / d * distance / dur, vz: dz / d * distance / dur, t0: this.t, until: this.t + dur, seq: ++c.kbSeq };
    c.goal = null;
  }

  // ---------------------------------------------------------------- 隊友 AI
  move(t, id, title, spots, opt) {
    this.moves.push(Object.assign({ t, id, title, spots, jitter: true, preview: true, spread: false, tip: null, frame: '' }, opt || {}));
  }
  runMove(mv) {
    const spots = mv.spots(this);
    for (const c of this.chars) {
      const sp = spots[c.slot];
      if (!sp) continue;
      if (this.humans.has(c.slot)) {
        this.guides[c.slot].cur = { id: mv.id, title: mv.title, t: mv.t, spot: { x: sp[0], z: sp[1] }, tip: mv.tip ? mv.tip(c.slot, this) : '', frame: mv.frame };
      }
      if (!c.auto || !c.alive) continue;
      let gx = sp[0], gz = sp[1];
      if (mv.spread) {
        const a = c.slot * 2.4, rad = mv.spread === 'wide' ? 0.9 : 0.5;
        gx += Math.cos(a) * rad; gz += Math.sin(a) * rad;
      }
      c.goal = { x: gx, z: gz };
      c.goalAt = this.t + (mv.jitter ? 0.05 + 0.3 * hash01(this.seed, c.slot, mv.idx) : 0);
    }
  }
  previewMove(mv) {
    const spots = mv.spots(this);
    for (const slot of this.humans) {
      const sp = spots[slot];
      if (!sp) continue;
      this.guides[slot].next = { id: mv.id, title: mv.title, t: mv.t, spot: { x: sp[0], z: sp[1] }, tip: mv.tip ? mv.tip(slot, this) : '', frame: mv.frame };
    }
  }
  /** 本機玩家的教學指引。 */
  get guide() { return this.guides[this.playerSlot]; }
  /** 連線：設定遠端真人角色的位置（隊員自己算好的位置）。 */
  setRemote(slot, x, z, rot) { const c = this.chars[slot]; c.net = { x, z, rot }; }
  /** 連線：某職位改由 AI（斷線、隊員開 AI 代打）或交回遠端真人。 */
  setRemoteAuto(slot, auto) { const c = this.chars[slot]; c.remote = !auto; c.auto = auto; if (!auto) c.goal = null; }
  setPlayerAuto(on) {
    this.pc.auto = on;
    if (!on) this.pc.goal = null;
  }

  // ---------------------------------------------------------------- 更新
  step(dt) {
    if (this.status !== 'running') return;
    for (const c of this.chars) { c.prev.x = c.pos.x; c.prev.z = c.pos.z; c.prevRot = c.rot; }
    for (const a of this.actors) { a.prev.x = a.pos.x; a.prev.z = a.pos.z; a.prevRot = a.rot; }
    const t1 = this.t + dt;
    while (this.evIdx < this.events.length && this.events[this.evIdx].t <= t1) {
      const ev = this.events[this.evIdx++];
      if (ev.t > this.t) this.t = ev.t;
      ev.fn();
      if (this.status !== 'running') return;
    }
    this.t = t1;
    this.entities(dt);
    if (this.phase.tick) this.phase.tick(this, dt);
    this.fxStep();
  }

  entities(dt) {
    const inp = this.input;
    for (const c of this.chars) {
      const x0 = c.pos.x, z0 = c.pos.z;
      if (c.kb) {
        if (this.t >= c.kb.until) c.kb = null;
        else if (!c.remote || !c.alive) { c.pos.x += c.kb.vx * dt; c.pos.z += c.kb.vz * dt; }
      }
      if (!c.alive) { if (Math.hypot(c.pos.x, c.pos.z) > C.ARENA_R + 0.3) c.fell = true; continue; }
      if (c.remote) {
        // 連線的隊員：位置由他自己的電腦算（含擊退、暈眩），這裡平滑地跟上收到的位置
        if (c.net) {
          const k = Math.min(1, dt * 20);
          c.pos.x += (c.net.x - c.pos.x) * k; c.pos.z += (c.net.z - c.pos.z) * k;
          c.rot = c.net.rot;
        }
      } else if (c.kb || this.t < c.stunUntil) {
        // 擊退中、暈眩或被拘束時不能移動
      } else if (c.auto) {
        if (c.goal && this.t >= c.goalAt) {
          const dx = c.goal.x - c.pos.x, dz = c.goal.z - c.pos.z, d = Math.hypot(dx, dz), m = C.NPC_SPEED * dt;
          if (d <= m) { c.pos.x = c.goal.x; c.pos.z = c.goal.z; c.goal = null; }
          else {
            const u = this.steer(c, dx / d, dz / d, m);
            c.pos.x += u.x * m; c.pos.z += u.z * m; c.rot = Math.atan2(u.x, u.z);
          }
        }
      } else if (c.slot === this.playerSlot) {
        const l = Math.hypot(inp.x, inp.z);
        if (l > 0.01) {
          const k = Math.min(1, l) / l;
          c.pos.x += inp.x * k * C.SPEED * dt; c.pos.z += inp.z * k * C.SPEED * dt;
          c.rot = Math.atan2(inp.x, inp.z);
        }
      }
      c.walk = Math.hypot(c.pos.x - x0, c.pos.z - z0) / dt;
      if (Math.hypot(c.pos.x, c.pos.z) >= this.edgeR) { this.kill(c, this.edgeMsg, { force: true }); continue; }
      c.hp = Math.min(100, c.hp + C.REGEN * dt);
    }
    for (const a of this.actors) if (!a.dead) a.stepMove(dt);
  }

  /** 隊友 AI 繞路：要走進 avoid 圓（污泥等）時，改沿圓的切線走。 */
  steer(c, ux, uz, m) {
    for (const a of this.avoid) {
      if (this.t < a.t0 || this.t > a.t1) continue;
      const ax = c.pos.x - a.x, az = c.pos.z - a.z, ad = Math.hypot(ax, az) || 0.001, R = a.r + 0.8;
      if (ad > R + m + 0.2) continue;
      const inward = -(ux * ax + uz * az) / ad;
      if (inward <= 0) continue;
      const tx = -az / ad, tz = ax / ad, sgn = (ux * tx + uz * tz) >= 0 ? 1 : -1;
      return { x: tx * sgn, z: tz * sgn };
    }
    return { x: ux, z: uz };
  }

  fxStep() {
    for (const f of this.fx) if (f.follow && this.t <= f.t1) f.follow(f);
    this.fx = this.fx.filter((f) => this.t <= f.t1 + 0.45);
    this.casts = this.casts.filter((c) => this.t <= c.t1 + 1);
    this.marks = this.marks.filter((m) => this.t <= m.t1 + 1);
    this.floats = this.floats.filter((f) => this.t - f.t < 1.2);
    this.tethers = this.tethers.filter((th) => th.t1 === undefined || this.t <= th.t1 + 0.5);
    this.previews = this.previews.filter((p) => this.t <= p.t1);
    this.statuses = this.statuses.filter((s) => s.t1 === null || this.t <= s.t1);
    this.screenFx = this.screenFx.filter((f) => this.t - f.t < 2);
    this.sounds = this.sounds.filter((f) => this.t - f.t < 2);
    this.actors = this.actors.filter((a) => !a.dead);
    this.avoid = this.avoid.filter((a) => this.t <= a.t1);
    for (const g of this.guides) if (g.next && this.t > g.next.t) g.next = null;
  }

  /** 以 AI 全自動模擬到時間 t（用於從檢查點開始）。 */
  fastForward(tTarget) {
    const keep = this.chars.map((c) => [c.auto, c.remote]);
    for (const c of this.chars) { c.auto = true; c.remote = false; }   // 快轉時真人也交給 AI
    while (this.status === 'running' && this.t < tTarget) this.step(1 / 60);
    this.chars.forEach((c, i) => { [c.auto, c.remote] = keep[i]; if (!c.auto) c.goal = null; c.net = null; });
  }

  finishWith(ok, failMsg) {
    if (this.status !== 'running') return;
    if (ok) { this.status = 'cleared'; this.log(`${this.phase.name} 通過！`); }
    else {
      this.status = 'failed';
      this.failure = this.failure || { t: this.t, slot: -1, cause: failMsg };
      this.note('death', failMsg, -1);
    }
  }

  get charges() { return this.s.charges || 0; }
  get woken() { return !!this.s.woken; }
  /** 結算檢查（slot 省略＝本機玩家）。 */
  objectives(slot) { return this.phase.objectives(this, slot === undefined ? this.playerSlot : slot); }
  badge(c) {
    let s = '';
    if (c.thermal) s += '❄' + c.thermal;
    if (c.searing) s += '🔥';
    return s;
  }
}

root.UWU = {
  Sim, Actor, C, ROLES, PHASES, STATUS_DEF, WAYMARKS, WM_COLOR, isTank, isHealer, dist, inCone, inRect, inCircle, inRing, segInfo,
  atBearing, bearingOf, norm360, ipos, irot, rotFromBearing, rotateXZ, mulberry32, hash01, shuffler, angDiff,
  MT, OT, H1, H2, M1, M2, RR, CC,
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.UWU;
})(typeof window !== 'undefined' ? window : globalThis);
