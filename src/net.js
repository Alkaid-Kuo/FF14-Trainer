/* 連線：WebSocket 房間、房主把模擬狀態廣播給隊員（Replicator）、隊員端重建可繪製的鏡像（Mirror）。
   房主的瀏覽器跑模擬；隊員自己的角色在本機移動（含擊退、暈眩），位置送給房主；其他角色依快照內插顯示（約慢 0.1 秒）。 */
(function (root) {
'use strict';
const { ROLES, PHASES, STATUS_DEF, C, angDiff } = root.UWU;
const PI = Math.PI;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined && typeof o[k] !== 'function') r[k] = o[k]; return r; };
const FX_KEYS = ['id', 'kind', 'x', 'z', 'rot', 'r', 'inner', 'half', 'len', 'w', 't0', 't1', 'tint', 'label', 'assistFrom', 'hidden'];
const ZONE_KEYS = ['x', 'z', 'r', 'label', 'style', 'active', 't0', 't1'];
const PREV_KEYS = ['x', 'z', 'r', 't0', 't1', 'kb', 'owner'];

// ---------------------------------------------------------------- 連線
class Link {
  constructor(url, onMessage, onClose) {
    this.onMessage = onMessage; this.onClose = onClose;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } this.onMessage(m); };
    this.ws.onclose = (e) => this.onClose(e);
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { this.onMessage = () => {}; this.onClose = () => {}; this.ws.close(); }
}

// ---------------------------------------------------------------- 房主：模擬 → 快照
class Replicator {
  constructor() { this.reset(null); }
  reset(sim) { this.sim = sim; this.sent = new WeakSet(); this.guideKey = {}; this.zid = new WeakMap(); this.zseq = 0; }
  zoneId(z) { if (!this.zid.has(z)) this.zid.set(z, ++this.zseq); return this.zid.get(z); }
  /** full＝把目前所有東西都送出（新進房或換新的一局）；否則只送新出現的東西。 */
  snapshot(sim, full) {
    if (sim !== this.sim) this.reset(sim);
    const S = sim, sent = this.sent;
    const take = (arr) => {
      const out = [];
      for (const o of arr) { if (!full && sent.has(o)) continue; sent.add(o); out.push(o); }
      return out;
    };
    const posRef = new Map();
    for (const c of S.chars) posRef.set(c.pos, 'c' + c.slot);
    for (const a of S.actors) posRef.set(a.pos, 'a' + a.id);
    const ref = (p) => posRef.get(p) || [r2(p.x), r2(p.z)];
    const m = {
      t: r3(S.t), st: S.status, fail: S.failure, er: S.edgeR, sh: S.shrink, s: [S.charges, S.woken ? 1 : 0],
      ch: S.chars.map((c) => {
        const kb = c.kb && S.t < c.kb.until ? c.kb : null;
        const flags = (c.alive ? 1 : 0) | (c.planned ? 2 : 0) | (c.raise ? 4 : 0) | (c.fell ? 8 : 0) | (c.searing ? 16 : 0) | (c.auto && !c.remote ? 32 : 0);
        return [r2(c.pos.x), r2(c.pos.z), r3(c.rot), flags, Math.round(c.hp), kb ? kb.seq : 0, kb ? r2(kb.vx) : 0, kb ? r2(kb.vz) : 0, kb ? r3(kb.until) : 0,
          r3(c.stunUntil), r2(c.walk), c.thermal, c.raise ? c.raise.by : -1, kb ? r3(kb.t0) : 0];
      }),
      ac: S.actors.filter((a) => !a.dead).map((a) => [a.id, a.look, a.name, r2(a.pos.x), r2(a.pos.z), r3(a.rot), (a.visible ? 1 : 0) | (a.targetable === false ? 0 : 2) | (a.blue ? 4 : 0),
        r2(a.hp), r2(a.lift || 0), a.badge || 0, a.tint || '', a.hits || 0]),
      fx: take(S.fx).map((f) => pick(f, FX_KEYS)),
      fd: S.fx.filter((f) => f.follow && S.t <= f.t1 + 0.1).map((f) => [f.id, r2(f.x), r2(f.z), r3(f.rot)]),
      ca: take(S.casts), mk: take(S.marks), fe: take(S.feed), fl: take(S.floats), sf: take(S.screenFx), so: take(S.sounds),
      ss: S.statuses,
      zo: S.zones.map((z) => [this.zoneId(z), pick(z, ZONE_KEYS)]),
      pv: S.previews.map((p) => pick(p, PREV_KEYS)),
      te: S.tethers.filter((th) => th.t0 === undefined || S.t >= th.t0).map((th) => [th.kind, th.t1 === undefined ? null : th.t1, (th.ends ? th.ends() : []).map(([a, b]) => [ref(a), ref(b)])]),
      gd: {},
    };
    for (const slot of S.humans) {
      const g = S.guides[slot], key = JSON.stringify(g);
      if (full || this.guideKey[slot] !== key) { m.gd[slot] = g; this.guideKey[slot] = key; }
    }
    return m;
  }
}

// ---------------------------------------------------------------- 隊員：快照 → 可繪製的鏡像
const BUF = 24;
/** 隊員端的「模擬」：欄位與 Sim 相同，讓畫面、HUD、音效直接沿用。 */
class Mirror {
  constructor(pid, variant, mySlot, snap) {
    this.phase = PHASES[pid]; this.pid = pid; this.variant = variant; this.playerSlot = mySlot;
    this.t = snap.t; this.status = 'running'; this.failure = null; this.edgeR = C.EDGE_DEATH; this.shrink = null;
    this.s = { charges: 0, woken: false };
    this.chars = ROLES.map((r) => ({ slot: r.slot, key: r.key, kind: r.kind, pos: { x: 0, z: 0 }, prev: { x: 0, z: 0 }, rot: PI, prevRot: PI,
      alive: true, hp: 100, kb: null, fell: false, walk: 0, thermal: 0, searing: false, planned: false, raise: null, stunUntil: 0, auto: false }));
    this.actors = []; this.actorMap = new Map();
    this.fx = []; this.fxMap = new Map();
    this.casts = []; this.marks = []; this.feed = []; this.notes = []; this.floats = []; this.screenFx = []; this.sounds = [];
    this.tethers = []; this.zones = []; this.zoneMap = new Map(); this.previews = []; this.statuses = [];
    this.guides = ROLES.map(() => ({ cur: null, next: null }));
    this.buf = [];
    this.clock = snap.t; this.base = { t: snap.t, at: performance.now(), running: false };
    this.apply(snap, true);
    for (const c of this.chars) { c.prev.x = c.pos.x; c.prev.z = c.pos.z; c.prevRot = c.rot; }
  }
  get pc() { return this.chars[this.playerSlot]; }
  get guide() { return this.guides[this.playerSlot]; }
  get charges() { return this.s.charges; }
  get woken() { return this.s.woken; }
  activeMarks() { return this.marks.filter((m) => this.t >= m.t0 && this.t <= m.t1); }
  activeCasts() { return this.casts.filter((c) => this.t >= c.t0 && this.t <= c.t1); }
  statusesOf(c) {
    const out = [];
    for (const m of this.activeMarks()) if (m.slot === c.slot && STATUS_DEF['mark_' + m.type]) out.push({ id: 'mark_' + m.type, t1: m.t1, stacks: 0 });
    for (const s of this.statuses) if (s.slot === c.slot && this.t >= s.t0 && (s.t1 === null || this.t <= s.t1)) out.push({ id: s.id, t1: s.t1, stacks: 0 });
    if (c.thermal) out.push({ id: 'thermal', t1: null, stacks: c.thermal });
    return out;
  }
  /** 套用房主的快照。running：房主那邊是否正在跑（暫停時時間停住）。 */
  apply(m, running) {
    const me = this.playerSlot;
    this.base = { t: m.t, at: performance.now(), running };
    this.status = m.st; this.failure = m.fail; this.edgeR = m.er; this.shrink = m.sh;
    this.s.charges = m.s[0]; this.s.woken = !!m.s[1];
    const frame = { t: m.t, ch: [], ac: new Map() };
    m.ch.forEach((d, i) => {
      const c = this.chars[i];
      const wasAlive = c.alive;
      c.alive = !!(d[3] & 1); c.planned = !!(d[3] & 2); c.fell = !!(d[3] & 8); c.searing = !!(d[3] & 16);
      c.auto = !!(d[3] & 32);
      c.hp = d[4];
      if (d[5]) { if (!c.kb || c.kb.seq !== d[5]) c.kb = { seq: d[5], vx: d[6], vz: d[7], until: d[8], t0: d[13] }; } else c.kb = null;
      c.stunUntil = d[9]; c.thermal = d[11];
      c.raise = d[3] & 4 ? { by: d[12] } : null;
      if (i !== me || c.auto || !c.alive) c.walk = d[10];
      c.host = { x: d[0], z: d[1], rot: d[2] };
      if (i === me && c.alive && !wasAlive) this.teleport = true;   // 復活：從屍體位置起身
      frame.ch.push([d[0], d[1], d[2]]);
    });
    for (const d of m.ac) {
      let a = this.actorMap.get(d[0]);
      if (!a) {
        a = { id: d[0], look: d[1], name: d[2], pos: { x: d[3], z: d[4] }, prev: { x: d[3], z: d[4] }, rot: d[5], prevRot: d[5], dead: false };
        this.actorMap.set(d[0], a);
      }
      a.name = d[2]; a.visible = !!(d[6] & 1); a.targetable = !!(d[6] & 2); a.blue = !!(d[6] & 4);
      a.hp = d[7]; a.badge = d[9]; a.tint = d[10] || null; a.hits = d[11]; a.seen = m.t;
      frame.ac.set(d[0], [d[3], d[4], d[5], d[8]]);
    }
    for (const [id, a] of this.actorMap) if (a.seen !== m.t) { a.dead = true; this.actorMap.delete(id); }
    this.actors = [...this.actorMap.values()];
    for (const f of m.fx) if (!this.fxMap.has(f.id)) { this.fxMap.set(f.id, f); this.fx.push(f); }
    for (const [id, x, z, rot] of m.fd) { const f = this.fxMap.get(id); if (f) { f.x = x; f.z = z; f.rot = rot; } }
    this.casts.push(...m.ca); this.marks.push(...m.mk); this.feed.push(...m.fe); this.floats.push(...m.fl);
    this.screenFx.push(...m.sf); this.sounds.push(...m.so);
    if (this.feed.length > 60) this.feed.splice(0, this.feed.length - 60);
    this.statuses = m.ss;
    const zs = [];
    for (const [id, z] of m.zo) { let o = this.zoneMap.get(id); if (!o) { o = {}; this.zoneMap.set(id, o); } Object.assign(o, z); zs.push(o); }
    for (const [id, o] of this.zoneMap) if (!zs.includes(o)) this.zoneMap.delete(id);
    this.zones = zs;
    this.previews = m.pv;
    this.tetherData = m.te;
    for (const k of Object.keys(m.gd)) this.guides[k] = m.gd[k];
    this.buf.push(frame); if (this.buf.length > BUF) this.buf.shift();
  }
  /** 每幀：推進時鐘、內插其他角色與實體、清掉過期的東西。 */
  frame(now, dt) {
    const b = this.base;
    const target = b.running ? b.t + (now - b.at) / 1000 : b.t;
    if (!b.running || Math.abs(target - this.clock) > 0.3) this.clock = target;
    else this.clock += dt + (target - this.clock) * 0.1;
    this.t = this.clock;
    const rt = this.clock - 0.1, buf = this.buf;
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > rt) i--;
    const A = buf[Math.max(0, i - 1)], B = buf[i];
    const k = B.t > A.t ? Math.max(0, Math.min(1, (rt - A.t) / (B.t - A.t))) : 1;
    const lerpA = (a, b) => a + angDiff(b, a) * k;
    this.chars.forEach((c, j) => {
      if (j === this.playerSlot && !c.auto && c.alive && !this.spectator) return;   // 自己的角色由本機控制
      const p = A.ch[j], q = B.ch[j];
      c.pos.x = p[0] + (q[0] - p[0]) * k; c.pos.z = p[1] + (q[1] - p[1]) * k; c.rot = lerpA(p[2], q[2]);
      c.prev.x = c.pos.x; c.prev.z = c.pos.z; c.prevRot = c.rot;
    });
    for (const a of this.actors) {
      const p = A.ac.get(a.id) || B.ac.get(a.id), q = B.ac.get(a.id) || p;
      if (!p) continue;
      a.pos.x = p[0] + (q[0] - p[0]) * k; a.pos.z = p[1] + (q[1] - p[1]) * k; a.rot = lerpA(p[2], q[2]); a.lift = p[3] + (q[3] - p[3]) * k;
      a.prev.x = a.pos.x; a.prev.z = a.pos.z; a.prevRot = a.rot;
    }
    // 連線端點：角色／實體用內插後的位置
    const res = (r) => (typeof r === 'string' ? (r[0] === 'c' ? this.chars[+r.slice(1)].pos : (this.actorMap.get(+r.slice(1)) || { pos: { x: 0, z: 0 } }).pos) : { x: r[0], z: r[1] });
    this.tethers = (this.tetherData || []).filter((th) => th[1] === null || this.t <= th[1] + 0.5).map((th) => ({ kind: th[0], t1: th[1] === null ? undefined : th[1], ends: () => th[2].map(([a, b2]) => [res(a), res(b2)]) }));
    const t = this.t;
    this.fx = this.fx.filter((f) => { const keep = t <= f.t1 + 0.45; if (!keep) this.fxMap.delete(f.id); return keep; });
    this.casts = this.casts.filter((c) => t <= c.t1 + 1);
    this.marks = this.marks.filter((m) => t <= m.t1 + 1);
    this.floats = this.floats.filter((f) => t - f.t < 1.2);
    this.screenFx = this.screenFx.filter((f) => t - f.t < 2);
    this.sounds = this.sounds.filter((f) => t - f.t < 2);
  }
}

root.UWU_NET = { Link, Replicator, Mirror };
})(window);
