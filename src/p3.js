/* P3 泰坦（覺醒前＋覺醒後）。站位／分工：攻略 P3A-F01~F28、P3B-F01~F52；時間點以攻略 mm:ss 為準（攻略沒有毫秒資料）。
   職位對應：戰=MT 騎=OT 白=H1 學=H2 龍=M1 忍=M2 詩=R 召=C。
   隨機：第一次跳躍方向（四個正點）、爆破岩石配置（2 種，互為鏡像）、花崗石牢點名（3 人，照優先順序站位）、地裂目標、
   第二次跳躍方向（只會往左前／正前／右前）、覺醒後花崗石牢（1 人）。
   打法（S.variant）：'regular' 正規；'suicide' 自殺流——OT/M1/M2/R 在第二波大地之重自殺，石牢固定點 H1/H2/C，
   H1→OT、H2→M1、C 即刻→M2、C 10 秒詠唱→R，被救的人在「三連桶炸完～開始踩地板」之間接受復活。
   座標轉換：攻略圖 P3A 開場以隊伍在南（C）為準、第一次跳躍落在 D、岩石為情況 1；P3B 後半第二次跳躍落在 C。
   實際依隨機旋轉／鏡像。判定範圍是由攻略站位反推的估計值。 */
(function (root) {
'use strict';
const U = root.UWU;
const { PHASES, ROLES, inCircle, inRect, inCone, bearingOf, mulberry32, shuffler, rotateXZ, norm360, rotFromBearing } = U;
const { MT, OT, H1, H2, M1, M2, RR, CC } = U;
const PI = Math.PI;
const FR = U.FRAMES;

const K = {
  END: 166, CHARGES: 4, EDGE: 17.2, GEO_KILL: 16, SHRINK1: 16.5, SHRINK2: 12.5,
  WOTL_R: 4, BUSTER_LEN: 14, BUSTER_HALF: PI / 3,
  IMPACT_R: 2.5, BOMB_R: 4, KB: 26, KB_DUR: 0.8,
  LS_W: 4.2, LS_LEN: 40, GAOL_TOL: 3, GAOL_BLAST_R: 4.5, SLUDGE_R: 3, SLUDGE_DWELL: 0.4,
  LINK: 12.5, TITAN_REACH: 10, LOCK: 50.2,   // 石牢連鎖：相鄰石牢間距上限；靠王的污泥要在泰坦中心 10 以內（泰坦體型＋污泥）；被關住的時間
  RUN_R: 11, MARGIN: 0.9, HORIZON: 3.6,
};
const DIR4 = { 0: 'A（北）', 90: 'B（東）', 180: 'C（南）', 270: 'D（西）' };
const TURN = { '-90': '左前', 0: '正前', 90: '右前' };
// 爆破岩石（情況 1，泰坦在 D）：大怒震時 5 顆、之後在缺口落下第 6 顆
const BOMBS = [[12.4, -9.5], [5.9, -3.5], [6.0, 3.9], [14.1, 3.0], [12.4, 9.7]];
const BOMB6 = [14.2, -3.8];
// 花崗石牢三個位置（同上座標）：泰坦位、1 號位、爆破岩石位
const GAOL_SPOTS = [[-11.5, 0], [0, 0], [10.6, -3.0]];
const GAOL_NAMES = ['泰坦位', '1 號位', '爆破岩石位'];
// 站位順序：泰坦 → 龍 → 忍 → 詩 → 召 → 騎 → 白 → 學 → 爆破岩石
const ORDER = [M1, M2, RR, CC, OT, H1, H2];
// 覺醒後爆破岩石（第二次落在 C）：依序落在西南、西北、東北、東南
const BOMBS2 = [[-3.4, 3.4], [-3.4, -3.4], [3.7, -3.4], [3.7, 3.9]];
// 自殺流
const SUI = [OT, M1, M2, RR];
const RAISES = [
  { slot: OT, by: H1, t: 35.5, how: '即刻詠唱' }, { slot: M1, by: H2, t: 36.5, how: '即刻詠唱' },
  { slot: M2, by: CC, t: 37.5, how: '即刻詠唱' }, { slot: RR, by: CC, t: 65.0, cast: 55.0, how: '10 秒詠唱' },
];
// 起身：0:45 石牢點名前不能起；三顆石牢形成（0:50）～開始踩地板（0:55）之間起身；AI 在三連桶炸完後起（0:53.5）
const RISE = { early: 45.0, win0: 50.2, win1: 55.5, auto: 53.5, deadline: 66.5, lastGrace: 3.5 };

const fp = (id) => { const f = FR[id].pos; return ROLES.map((r) => (f[r.key] ? f[r.key].slice() : null)); };
const near = (p, dx, dz) => [p[0] + dx, p[1] + dz];
const only = (list) => { const a = Array(8).fill(null); for (const [s, p] of list) a[s] = p; return a; };
const tipf = (m) => (slot, S) => {
  const r = ROLES[slot];
  const sui = S && S.variant === 'suicide';
  const pick = (k) => (sui && m['s' + k] !== undefined ? m['s' + k] : m[k]);
  const v = pick(r.key);
  if (v !== undefined) return typeof v === 'function' ? v(S, slot) : v;
  const g = pick(r.kind === 'tank' ? 'T' : r.kind === 'healer' ? 'H' : 'D');
  const d = g !== undefined ? g : (pick('def') || '');
  return typeof d === 'function' ? d(S, slot) : d;
};
const rot = (p, deg) => (p ? rotateXZ(p, deg) : p);
/** 開場（0:00～0:30）：隊伍集合的方位 O（攻略為 C）。 */
const T0 = (S, p) => rot(p, S.s.O - 180);
/** 第一次跳躍後（0:30～1:21）：泰坦落點 J1（攻略為 D），情況 2 鏡像。 */
const T1 = (S, p) => (p ? rot([p[0], S.roll.mirror ? -p[1] : p[1]], S.roll.j1 - 270) : p);
/** 第二次跳躍後（1:21～）：泰坦落點 J2（攻略為 C）。 */
const T2 = (S, p) => rot(p, S.roll.j2 - 180);
const xz = (p) => ({ x: p[0], z: p[1] });

function roll(seed) {
  const rng = mulberry32(seed), sh = shuffler(rng), pick = (a) => a[Math.floor(rng() * a.length)];
  const j1 = 90 * Math.floor(rng() * 4);
  const turn = pick([-90, 0, 90]);
  const nonMT = [OT, H1, H2, M1, M2, RR, CC];
  return {
    seed, j1, turn, j2: norm360(j1 + 180 + turn),
    mirror: rng() < 0.5,                 // 爆破岩石：情況 1／情況 2（鏡像）
    gaolPick: sh(nonMT),                 // 花崗石牢：依序取活著的前 3 人
    gaol2Pick: sh(nonMT),                // 覺醒後花崗石牢：1 人
    ls: [rng(), rng(), rng(), rng(), rng()],   // 5 次地裂的目標（從活著的人裡挑）
    gaolTargets: [], gaol2Target: '', lsTargets: [],
  };
}

function setup(S) {
  const s = S.s;
  // 開場：隊伍在哪一邊集合（單獨練習＝攻略的 C；完整體驗＝ P2 結束時所在的邊）
  let cx = 0, cz = 0;
  for (const c of S.chars) { cx += c.pos.x; cz += c.pos.z; }
  cx /= 8; cz /= 8;
  s.O = Math.hypot(cx, cz) < 3 ? 180 : norm360(90 * Math.round(bearingOf({ x: cx, z: cz }) / 90));
  const titan = S.actor('titan', '泰坦', 0, 0, 0);
  titan.visible = false; titan.targetable = false; titan.lift = 1;
  s.titan = titan; s.charges = 0; s.woken = false; s.faceMT = false;
  s.gaol = []; s.sludge = []; s.nextEdgeR = S.edgeR; s.titanSludge = false;
  s.anim = [];                        // 泰坦跳躍高度動畫：{ t0, t1, from, to }
}

// ---------------------------------------------------------------- 隊友 AI：找最近的安全點
/** 判斷某點是否危險：之後 H 秒內會判定的預警範圍、污泥、（即將縮小的）場地邊緣。 */
const pendingFx = (S, c) => S.fx.filter((f) => f.t1 > S.t && f.t1 <= S.t + K.HORIZON && !(f.npcIgnore && f.npcIgnore.includes(c.slot)) && !f.harmless);
function inFx(p, f, margin) {
  if (f.kind === 'circle') return Math.hypot(p.x - f.x, p.z - f.z) <= f.r + margin;
  if (f.kind === 'rect') return inRect(p, f, f.rot, f.w / 2 + margin, f.len + margin);
  if (f.kind === 'cone') return inCone(p, f, f.rot, f.half + 0.12, f.len + margin);
  return false;
}
function badFn(S, c, margin) {
  const now = S.t, s = S.s;
  const list = pendingFx(S, c);
  const sl = s.sludge.filter((z) => z.t1 > now && z.t0 <= now + K.HORIZON);
  const er = Math.min(S.edgeR, s.nextEdgeR) - 1.0;
  return (p) => {
    if (Math.hypot(p.x, p.z) > er) return true;
    for (const f of list) if (inFx(p, f, margin)) return true;
    for (const z of sl) if (Math.hypot(p.x - z.x, p.z - z.z) <= z.r + margin) return true;
    return false;
  };
}
function nearestSafe(base, bad) {
  if (!bad(base)) return base;
  for (let d = 0.4; d <= 16; d += 0.4) {
    const n = Math.max(16, Math.round(d * 10));
    for (let i = 0; i < n; i++) {
      const a = i / n * PI * 2, p = { x: base.x + Math.cos(a) * d, z: base.z + Math.sin(a) * d };
      if (!bad(p)) return p;
    }
  }
  return base;
}
/** 在走得到的範圍（reach）內找安全、又最接近 target 的點。 */
function bestReachable(cur, target, reach, bad) {
  let best = null, bd = 1e9;
  for (let d = 0; d <= reach; d += 0.6) {
    const n = d === 0 ? 1 : Math.max(12, Math.round(d * 5));
    for (let i = 0; i < n; i++) {
      const a = i / n * PI * 2, p = { x: cur.x + Math.cos(a) * d, z: cur.z + Math.sin(a) * d };
      if (bad(p)) continue;
      const e = Math.hypot(p.x - target.x, p.z - target.z);
      if (e < bd) { bd = e; best = p; }
    }
  }
  return best || nearestSafe(cur, bad);
}
/** 把攻略站位修正成「現在這一刻」的安全點（隨機的地裂方向、圓圈位置都會變）；
    判定前走不到的話，改去走得到、又最接近目標的安全點。 */
function sanitize(S, spots) {
  const now = S.t, v = U.C.NPC_SPEED;
  return spots.map((sp, slot) => {
    if (!sp) return sp;
    const c = S.chars[slot];
    if (!c.alive || now < c.stunUntil) return sp;
    const bad = badFn(S, c, K.MARGIN);
    let p = nearestSafe(xz(sp), bad);
    // 直線走過去的途中，會不會剛好在某個判定的瞬間站在範圍裡？會的話改去「那之前走得到」的安全點
    const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
    let tHit = Infinity;
    for (const f of pendingFx(S, c)) {
      const k = d < 1e-6 ? 1 : Math.min(1, Math.max(0, v * (f.t1 - now - 0.4)) / d);
      const q = { x: c.pos.x + (p.x - c.pos.x) * k, z: c.pos.z + (p.z - c.pos.z) * k };
      if (inFx(q, f, 0.3)) tHit = Math.min(tHit, f.t1 - now);
    }
    if (tHit !== Infinity) p = bestReachable(c.pos, p, Math.max(0, v * (tHit - 0.5)), bad);
    return [p.x, p.z];
  });
}

function build(S) {
  const R = S.roll, s = S.s, at = (t, fn) => S.at(t, fn);
  const titan = s.titan;
  const sui = S.variant === 'suicide';
  const fail = (slot, cause) => {
    if (S.status !== 'running') return;
    S.failure = S.failure || { t: S.t, slot, cause };
    S.note('death', cause, slot);
    S.status = 'failed';
  };
  const dirTo = (p) => Math.atan2(p.x - titan.pos.x, p.z - titan.pos.z);
  const lift = (t0, t1, from, to) => s.anim.push({ t0, t1, from, to });

  // ---------------------------------------------------------------- 機制
  const geocrush = (tJump, tLand, p) => S.hazard({
    t0: tJump, omen: tLand - 1.0, assistFrom: tJump, tRes: tLand, kind: 'circle', label: 'Geocrush（大地粉碎）',
    geom: { x: p.x, z: p.z, r: K.GEO_KILL },
    killMsg: `大地粉碎：離泰坦落點太近（${K.GEO_KILL} 以內）被秒殺`,
    onResolve: () => { S.screenFx.push({ t: S.t, type: 'raidwide', power: 1 }); S.sound('quake'); for (const c of S.alive()) S.damage(c, 25, 'Geocrush', true); },
  });
  const raid = (name, pct, power) => {
    S.screenFx.push({ t: S.t, type: 'raidwide', power });
    for (const c of S.alive()) S.damage(c, pct, name, true);
  };
  const buster = (t, name) => S.hazard({
    t0: t - 0.8, omen: t - 0.8, tRes: t, kind: 'cone', label: name, tankSafe: true, tankDmg: 55,
    geom: () => ({ x: titan.pos.x, z: titan.pos.z, rot: dirTo(S.chars[MT].pos), half: K.BUSTER_HALF, len: K.BUSTER_LEN, npcIgnore: [MT] }),
    follow: (f) => { f.x = titan.pos.x; f.z = titan.pos.z; f.rot = dirTo(S.chars[MT].pos); },
    killMsg: `被${name}（泰坦正面順劈）擊中：非坦克不能站在泰坦正面`,
  });
  /** 大地之重：每個活著的人腳下出圈。onHit(c) 決定被打到的結果。 */
  const wotl = (tAppear, tRes, onHit) => {
    let spots = [];
    at(tAppear, () => {
      spots = S.alive().map((c) => ({ x: c.pos.x, z: c.pos.z }));
      for (const p of spots) S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.WOTL_R, t0: tAppear, t1: tRes, label: 'Weight of the Land（大地之重）', tint: 'earth' });
    });
    at(tRes, () => {
      const hit = S.alive().filter((c) => spots.some((p) => inCircle(c.pos, p, K.WOTL_R)));
      if (onHit) onHit(hit); else for (const c of hit) S.kill(c, '被大地之重（腳下的圈，半徑 4）擊中');
    });
  };
  /** 地裂：從泰坦往目標方向放 5 條直線（間隔 45°）；覺醒後在兩兩之間追加看不見的第二波。 */
  const W1 = [0, PI / 4, -PI / 4, PI / 2, -PI / 2], W2 = [PI / 8, -PI / 8, 3 * PI / 8, -3 * PI / 8, PI];
  const landslide = (i, tCast, tRes, tRes2) => {
    let l1 = [], l2 = [];
    at(tCast, () => {
      const alive = S.alive();
      if (!alive.length) return;
      const tg = alive[Math.floor(R.ls[i] * alive.length)];
      R.lsTargets[i] = tg.key;
      S.cast('泰坦', `Landslide（地裂）`, tCast, tRes - tCast);
      S.log(`地裂目標：${tg.key}（從泰坦往 ${tg.key} 方向放 5 條直線，間隔 45°）`, -1, true);
      const r0 = dirTo(tg.pos), o = { x: titan.pos.x, z: titan.pos.z };
      l1 = W1.map((d) => S.addFx({ kind: 'rect', x: o.x, z: o.z, rot: r0 + d, w: K.LS_W, len: K.LS_LEN, t0: tCast, t1: tRes, label: 'Landslide（地裂）', tint: 'earth' }));
      if (tRes2) l2 = W2.map((d) => S.addFx({ kind: 'rect', x: o.x, z: o.z, rot: r0 + d, w: K.LS_W, len: K.LS_LEN, t0: tRes2 - 0.02, assistFrom: tRes, t1: tRes2, label: 'Landslide（地裂・覺醒追加）', tint: 'earth' }));
    });
    const hit = (lines, wave) => {
      for (const c of S.alive()) if (lines.some((g) => inRect(c.pos, g, g.rot, g.w / 2, g.len))) S.kill(c, `被地裂${wave}（直線）擊中：被擊退到場外即死`);
    };
    at(tRes, () => { hit(l1, tRes2 ? '第一波' : ''); S.sound('rock'); });
    if (tRes2) at(tRes2, () => { hit(l2, '第二波（看不見，在第一波的線之間）'); S.sound('rock'); });
  };
  /** 爆破岩石：落地衝擊（小）→ 讀條爆炸（半徑 4）。 */
  const bomb = (p, tImpact, tCast, tExp) => {
    let a = null;
    S.hazard({ t0: tImpact - 1.0, tRes: tImpact, kind: 'circle', geom: { x: p[0], z: p[1], r: K.IMPACT_R }, label: 'Bomb Boulder（落地衝擊）', tint: 'earth', killMsg: '被爆破岩石落地衝擊（半徑 2.5）擊中' });
    at(tImpact, () => { a = S.actor('bomb', '爆破岩石', p[0], p[1], 0); a.hp = 0; S.sound('rock'); });
    at(tCast, () => { if (a) a.hp = 1; });
    S.hazard({ t0: tCast, tRes: tExp, kind: 'circle', geom: { x: p[0], z: p[1], r: K.BOMB_R }, label: 'Burst（爆破岩石爆炸）', tint: 'danger', killMsg: '被爆破岩石爆炸（半徑 4）擊中' });
    at(tExp, () => S.despawn(a));
  };
  const tumult = (t0, n) => {
    at(t0 - 0.3, () => S.cast('泰坦', `Tumult（怒震 ×${n}）`, t0 - 0.3, n));
    for (let k = 0; k < n; k++) at(t0 + k, () => { raid('Tumult（怒震）', 5, 0.28); if (k === 0) S.log(`怒震：連續 ${n} 次全體攻擊`); });
  };
  const shrink = (tWarn, tOn, r) => {
    at(tWarn, () => { S.shrink = { r, warn: tWarn, from: tOn, prev: S.edgeR < U.C.EDGE_DEATH ? S.edgeR : null }; s.nextEdgeR = r; S.log(`場地周圍出現危險區域：安全區縮小到半徑 ${r}`); });
    at(tOn, () => { S.edgeR = r; S.edgeMsg = '踏進場地外圍的危險區域（場地縮小）：即死'; });
  };
  /** 泰坦跳起（面向 = 落點方向）→ 消失 → 落在場邊。 */
  const jump = (tTurn, tLand, bearing) => {
    const land = U.atBearing(bearing, K.EDGE);
    at(tTurn, () => { s.faceMT = false; titan.rot = rotFromBearing(bearing); titan.targetable = false; titan.goal = null; S.log(`泰坦轉向 ${DIR4[bearing]} 並跳起：落點就是他面向的正點，去最遠的地方`); S.sound('jump'); });
    lift(tTurn + 0.6, tTurn + 1.3, 0, 1);
    at(tTurn + 1.3, () => { titan.visible = false; });
    geocrush(tTurn + 0.6, tLand, land);
    at(tLand - 0.6, () => { titan.pos.x = land.x; titan.pos.z = land.z; titan.rot = Math.atan2(-land.x, -land.z); titan.visible = true; });
    lift(tLand - 0.6, tLand, 1, 0);
    at(tLand + 0.5, () => { s.faceMT = true; });
    at(tLand + 2.0, () => { titan.targetable = true; });
  };

  // ---------------------------------------------------------------- 時間軸：覺醒前
  at(0.0, () => S.log('伊弗利特消失。泰坦從天而降（大地粉碎）：留在場地外圍，離中心 16 以上'));
  at(3.6, () => { titan.pos.x = 0; titan.pos.z = 0; titan.visible = true; titan.rot = rotFromBearing(norm360(s.O)); });
  lift(3.9, 4.5, 1, 0);
  geocrush(0.0, 4.5, { x: 0, z: 0 });
  at(5.0, () => { s.faceMT = true; });
  at(7.0, () => { titan.targetable = true; S.cast('泰坦', 'Earthen Fury（大地之怒）', 7.0, 3.0); });
  at(13.0, () => { raid('Earthen Fury（大地之怒）', 35, 0.8); S.log('大地之怒：全體攻擊'); });
  buster(19.0, 'Rock Buster（碎岩）');
  buster(22.0, 'Mountain Buster（山崩）');
  at(23.0, () => S.cast('泰坦', 'Weight of the Land（大地之重）', 23.0, 3.0));
  wotl(23.0, 26.0);
  wotl(26.0, 29.0, (hit) => {
    for (const c of hit) {
      if (sui && SUI.includes(c.slot)) S.kill(c, '自殺流：留在第二波大地之重裡', { planned: true });
      else S.kill(c, '被大地之重（腳下的圈，半徑 4）擊中');
    }
    if (sui) for (const k of SUI) if (S.chars[k].alive) fail(k, `自殺流：${ROLES[k].key} 要留在第二波大地之重裡死亡（只剩 MT／H1／H2／C 活著，石牢才會固定點 H1／H2／C）`);
  });
  // 第一次跳躍
  jump(30.0, 34.0, R.j1);
  shrink(31.0, 34.0, K.SHRINK1);
  // 大怒震＋爆破岩石（情況 1／2）
  const kbDir = () => { const d = Math.hypot(titan.pos.x, titan.pos.z) || 1; return { x: -titan.pos.x / d, z: -titan.pos.z / d }; };
  // 擊退落點預覽（教學）：每位真人各一個，只畫給本人看
  at(36.0, () => { s.kbPrev = [...S.humans].map((slot) => ({ x: 0, z: 0, r: 1.1, t0: 39.0, t1: 43.0, kb: true, owner: slot })); S.previews.push(...s.kbPrev); });
  at(37.0, () => S.log('泰坦召喚爆破岩石'));
  BOMBS.forEach((b) => bomb(T1(S, b), 40.0, 41.0, 44.0));
  at(39.4, () => S.cast('泰坦', 'Upheaval（大怒震）', 39.4, 3.0));
  at(39.0, () => S.log(`爆破岩石：情況 ${R.mirror ? 2 : 1}。看外側靠中線那顆岩石在哪一邊，貼近泰坦站「另一邊」，被擊退到岩石之間`, -1, true));
  at(43.0, () => {
    const u = kbDir();
    raid('Upheaval（大怒震）', 12, 0.7);
    for (const c of S.alive()) { S.knockVec(c, u.x, u.z, K.KB, K.KB_DUR); c.stunUntil = 45.0; S.addStatus(c.slot, 'stun', 2.0); }
    S.sound('knock');
    S.log('大怒震：全員被擊退並暈眩 2 秒');
  });
  // 花崗石牢（3 人）
  at(45.0, () => {
    const tg = R.gaolPick.filter((k) => S.chars[k].alive).slice(0, 3).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    s.gaol = tg.map((slot, i) => ({ slot, idx: i, spot: T1(S, GAOL_SPOTS[i]), name: GAOL_NAMES[i], pos: null, actor: null, broken: false }));
    R.gaolTargets = tg.map((k) => ROLES[k].key);
    for (const g of s.gaol) S.mark(g.slot, 'gaol', 45.0, K.LOCK);
    S.cast('泰坦', 'Granite Gaol（花崗石牢）', 45.0, 1.0);
    S.log(`花崗石牢點名：${s.gaol.map((g) => `${ROLES[g.slot].key}→${g.name}`).join('、')}（順序：泰坦→龍→忍→詩→召→騎→白→學→岩石）`);
  });
  landslide(0, 46.0, 48.0);
  bomb(T1(S, BOMB6), 48.0, 49.0, 53.0);
  // 被點名的人被關住：位置固定。連鎖爆炸需要 爆破岩石位 → 1 號位 → 泰坦位 排成一線
  at(K.LOCK, () => {
    for (const g of s.gaol) {
      const c = S.chars[g.slot];
      g.pos = { x: c.pos.x, z: c.pos.z };
      if (!c.alive) continue;
      c.stunUntil = 999; c.invulnUntil = 999; c.goal = null;
      S.addStatus(c.slot, 'gaol', null);
      c.stats.gaolOk = Math.hypot(c.pos.x - g.spot[0], c.pos.z - g.spot[1]) <= K.GAOL_TOL;
    }
    // 連鎖：引爆炸彈的爆炸要碰到最近的石牢（炸彈端），之後一顆傳一顆（間距 ≤ LINK）
    const left = s.gaol.filter((g) => S.chars[g.slot].alive);
    let from = xz(T1(S, BOMB6)), reach = K.BOMB_R + 1.2;
    s.chain = [];
    while (left.length) {
      let best = null, bd = 1e9;
      for (const g of left) { const d = Math.hypot(g.pos.x - from.x, g.pos.z - from.z); if (d < bd) { bd = d; best = g; } }
      if (bd > reach) break;
      best.chainIdx = s.chain.length; s.chain.push(best); left.splice(left.indexOf(best), 1);
      from = best.pos; reach = K.LINK;
    }
    // 覺醒：連鎖炸開的石牢留下的污泥要碰到泰坦（靠王端）
    s.titanSludge = s.chain.some((g) => Math.hypot(g.pos.x - titan.pos.x, g.pos.z - titan.pos.z) <= K.TITAN_REACH);
    const n = s.chain.length, all3 = n === s.gaol.length;
    S.log(n === 0 ? '石牢連鎖沒有啟動：炸彈端的石牢離引爆炸彈太遠（其餘要靠輸出打掉，不留污泥 → 泰坦不會覺醒）'
      : !all3 ? `石牢連鎖只炸到 ${n} 顆：石牢之間距離太遠（沒炸到的要靠輸出打掉，不留污泥）`
        : s.titanSludge ? '石牢排成一線：爆破岩石會依序炸開 3 顆石牢，靠王的污泥會讓泰坦覺醒'
          : '三顆石牢都會被炸開，但靠王的石牢離泰坦太遠：污泥碰不到泰坦，不會覺醒');
  });
  at(52.0, () => {
    for (const g of s.gaol) if (g.pos) g.actor = S.actor('gaol', '花崗石牢', g.pos.x, g.pos.z, 0);
    S.cast('花崗石牢', 'Granite Impact（花崗岩衝擊）', 52.0, 6.0);
    // 連鎖爆炸的範圍（給 AI 與畫面）
    s.chain.forEach((g, i) => {
      S.addFx({ kind: 'circle', x: g.pos.x, z: g.pos.z, r: K.GAOL_BLAST_R, t0: 52.0, t1: 53.0 + 0.4 * i, label: '花崗石牢（爆炸）', tint: 'earth' });
      const prev = i ? s.chain[i - 1].pos : xz(T1(S, BOMB6));
      S.tethers.push({ kind: 'chain', t0: 53.0 + 0.4 * i - 0.05, t1: 53.0 + 0.4 * i + 0.35, ends: () => [[prev, g.pos]] });
    });
  });
  landslide(1, 51.0, 53.0);
  const freeGaol = (g, bySource) => {
    if (g.broken) return;
    g.broken = true;
    S.despawn(g.actor);
    const c = S.chars[g.slot];
    if (c.alive) { c.stunUntil = 0; c.invulnUntil = S.t + 0.3; S.removeStatus(c.slot, 'gaol'); }
    if (!bySource) { S.log(`${ROLES[g.slot].key} 的石牢被輸出打掉（不會留污泥）`); return; }
    for (const o of S.alive()) if (o !== c && inCircle(o.pos, g.pos, K.GAOL_BLAST_R)) S.damage(o, 40, '花崗石牢爆炸');
    S.sound('rock');
    // 0:55 原地留下污泥
    const onTitan = Math.hypot(g.pos.x - titan.pos.x, g.pos.z - titan.pos.z) <= K.TITAN_REACH;
    const z = { x: g.pos.x, z: g.pos.z, r: K.SLUDGE_R, t0: 55.0, t1: 68.0 + g.chainIdx, style: 'sludge', label: onTitan ? '污泥（泰坦踩著）' : '污泥', lethal: 55.3 };
    s.sludge.push(z); S.zones.push(z);
    S.avoid.push({ x: z.x, z: z.z, r: z.r, t0: S.t, t1: z.t1 });   // AI 一知道污泥位置就開始繞路
  };
  [53.0, 53.4, 53.8].forEach((t, i) => at(t, () => { const g = s.chain[i]; if (g) freeGaol(g, true); }));
  at(55.5, () => { for (const g of s.gaol) if (!g.broken) freeGaol(g, false); });
  // 污泥消失（1:08～1:10 依序）
  at(68.0, () => S.log('污泥依序消失'));
  // 怒震（泰坦踩在污泥上 → 覺醒層數）
  tumult(55.5, 8);
  [58.5, 62.0, 66.0, 69.0].forEach((t) => at(t, () => {
    if (!s.titanSludge) return;
    s.charges++;
    S.log(`泰坦踩在污泥上：覺醒層數 +1（${s.charges}/${K.CHARGES}）`);
    if (s.charges >= K.CHARGES && !s.woken) { s.woken = true; S.log('泰坦覺醒！'); }
  }));

  // ---------------------------------------------------------------- 自殺流：復活
  if (sui) {
    s.autoAccept = { [OT]: RISE.auto, [M1]: RISE.auto, [M2]: RISE.auto, [RR]: 65.5 };
    for (const r of RAISES) {
      if (r.cast) at(r.cast, () => { if (S.chars[r.by].alive) S.cast(ROLES[r.by].key, `復活 → ${ROLES[r.slot].key}（${r.how}）`, r.cast, r.t - r.cast); });
      at(r.t, () => {
        const c = S.chars[r.slot], by = S.chars[r.by];
        if (c.alive || !by.alive) return;
        c.raise = { by: r.by, t: r.t };
        S.log(`${ROLES[r.by].key} 復活 ${ROLES[r.slot].key}（${r.how}）：先別起身，等三顆石牢形成`, r.slot);
      });
    }
    // 沒有及時起身
    at(RISE.deadline, () => { for (const k of [OT, M1, M2]) { const c = S.chars[k]; if (!c.alive && c.raise) fail(k, `${ROLES[k].key} 沒有接受復活（要在 0:50～0:55 起身）`); } });
    at(65.0 + RISE.lastGrace + 1, () => { const c = S.chars[RR]; if (!c.alive && c.raise) fail(RR, 'R 沒有接受復活（C 的 10 秒復活到了就要起身）'); });
  }
  /** 接受復活（玩家按 F／AI 自動）。 */
  s.accept = (slot) => {
    const c = S.chars[slot];
    if (c.alive || !c.raise || S.status !== 'running') return false;
    const t = S.t, last = slot === RR;
    S.revive(c, 30);
    c.invulnUntil = t + 5; S.addStatus(slot, 'transcendent', 5);
    c.stats.rise = t;
    if (!last && t < RISE.early) { fail(slot, `太早接受復活（${(t / 60 | 0)}:${String(Math.floor(t % 60)).padStart(2, '0')}）：0:45 花崗石牢點名前起身會被點到，石牢就不再固定（三顆石牢形成後再起）`); return true; }
    if (S.humans.has(slot)) {
      if (!last && t < RISE.win0) S.note('hit', '起身偏早：三顆石牢還沒形成（要自己躲地裂、離開石牢連線）', slot);
      else if (!last && t > RISE.win1) S.note('hit', '起身偏晚：踩地板開始後才起身', slot);
    }
    return true;
  };

  // ---------------------------------------------------------------- 時間軸：覺醒後
  at(67.0, () => S.cast('泰坦', 'Weight of the Land（大地之重）', 67.0, 3.0));
  wotl(67.0, 70.0);
  wotl(70.0, 73.0);
  landslide(2, 73.0, 75.0, 78.0);
  at(78.5, () => { const p = T1(S, [-10.1, 0]); titan.moveTo(p[0], p[1], 3); });
  jump(81.0, 86.0, R.j2);
  shrink(83.0, 86.0, K.SHRINK2);
  at(88.0, () => {
    const k = R.gaol2Pick.find((x) => S.chars[x].alive);
    s.gaol2 = { slot: k, spot: [0, 0], pos: null, actor: null };
    R.gaol2Target = ROLES[k].key;
    S.mark(k, 'gaol', 88.0, 93.0);
    S.cast('泰坦', 'Granite Gaol（花崗石牢）', 88.0, 1.0);
    S.log(`花崗石牢點名：${ROLES[k].key}（直接站 1 號位）`);
  });
  at(88.5, () => { const p = T2(S, [0, 6.2]); titan.moveTo(p[0], p[1], 3); });
  at(93.0, () => {
    const g = s.gaol2, c = S.chars[g.slot];
    g.pos = { x: c.pos.x, z: c.pos.z };
    if (!c.alive) return;
    c.stunUntil = 999; c.invulnUntil = 999; c.goal = null; S.addStatus(c.slot, 'gaol', null);
    c.stats.gaol2Ok = Math.hypot(c.pos.x, c.pos.z) <= K.GAOL_TOL;
  });
  at(95.0, () => { const g = s.gaol2; g.actor = S.actor('gaol', '花崗石牢', g.pos.x, g.pos.z, 0); S.cast('花崗石牢', 'Granite Impact（花崗岩衝擊・覺醒）', 95.0, 5.5); S.log('花崗石牢出現：全員集火打掉'); });
  at(100.0, () => {
    const g = s.gaol2, c = S.chars[g.slot];
    S.despawn(g.actor);
    if (c.alive) { c.stunUntil = 0; c.invulnUntil = S.t + 0.3; S.removeStatus(c.slot, 'gaol'); }
    S.log('花崗石牢被擊破');
  });
  landslide(3, 100.0, 102.0, 105.0);
  tumult(108.0, 6);
  buster(116.0, 'Rock Buster（碎岩）');
  buster(120.0, 'Mountain Buster（山崩）');
  at(121.0, () => S.log('泰坦召喚爆破岩石：會依序落在場中附近 4 處，全員貼著安全區邊緣跑（MT 逆時針、其他人順時針）'));
  BOMBS2.forEach((b, i) => bomb(T2(S, b), 124.0 + 2 * i, 126.0 + 2 * i, [129.0, 131.0, 134.0, 136.0][i]));
  at(123.0, () => S.cast('泰坦', 'Weight of the Land（大地之重・覺醒 3 輪）', 123.0, 2.0));
  wotl(123.0, 125.0); wotl(126.0, 128.0); wotl(129.0, 131.0);
  at(123.5, () => { const p = T2(S, [3.0, 7.2]); titan.moveTo(p[0], p[1], 3); });
  at(125.5, () => { const p = T2(S, [6.5, 4.6]); titan.moveTo(p[0], p[1], 3); });
  landslide(4, 129.0, 130.5, 134.0);
  at(134.5, () => { const p = T2(S, [3.2, -5.3]); titan.moveTo(p[0], p[1], 3); });
  buster(140.0, 'Rock Buster（碎岩）');
  buster(144.0, 'Mountain Buster（山崩）');
  at(145.0, () => S.cast('泰坦', 'Weight of the Land（大地之重・覺醒 3 輪）', 145.0, 2.0));
  wotl(145.0, 147.0); wotl(148.0, 150.0); wotl(151.0, 153.0);
  tumult(156.0, 8);
  at(165.0, () => { S.despawn(titan); S.log('擊殺泰坦'); });
  at(K.END, () => S.finishWith(s.woken, `泰坦沒有覺醒（${s.charges}/${K.CHARGES}）：花崗石牢沒有被爆破岩石連鎖炸開，泰坦位沒有污泥`));

  // ---------------------------------------------------------------- 走位
  const MV = (t, id, title, spots, tip, frame, opt) => S.move(t, id, title, (S2) => sanitize(S2, spots(S2)), Object.assign({ tip: tipf(tip), frame }, opt || {}));
  const A0 = (id, fix) => (S2) => { const a = fp(id); if (fix) fix(a); return a.map((p) => T0(S2, p)); };
  const A1 = (id, fix) => (S2) => { const a = fp(id); if (fix) fix(a, S2); return a.map((p) => T1(S2, p)); };
  const A2 = (id, fix) => (S2) => { const a = fp(id); if (fix) fix(a, S2); return a.map((p) => T2(S2, p)); };
  const sui4null = (S2, a) => { if (S2.variant === 'suicide') for (const k of SUI) a[k] = null; return a; };
  const gaolSpots = (S2, a) => { for (const g of S2.s.gaol) a[g.slot] = g.spot.slice(); return a; };
  const cur = (S2) => S2.chars.map((c) => [c.pos.x, c.pos.z]);
  const arc = (S2, deg, r) => { const p = U.atBearing(norm360(S2.roll.j2 + deg), r); return [p.x, p.z]; };
  const runAt = (crowd, mt) => (S2) => S2.chars.map((c) => arc(S2, c.slot === MT ? mt : crowd + ((c.slot * 37) % 9 - 4) * 0.8, K.RUN_R - (c.slot % 3) * 0.5));
  const fixMT01 = (a) => { a[MT] = [-1.2, 17.6]; };
  const fillH1 = (a) => { if (!a[H1]) a[H1] = near(a[H2], 0.6, 0.5); };
  const KB_Z = [-2.6, -2.2, -2.9, -2.4, -2.0, -3.0, -2.5, -2.8];

  MV(0.3, 'edge0', '大地粉碎：留在場地外圍', A0('P3A-F01', fixMT01), {
    def: '泰坦會落在場地中央，離落點 16 以內會被秒殺：留在外圍。之後全員向泰坦移動（C 順路撿突破極限碎片）。',
  }, 'P3A-F01', { preview: false, spread: true });
  MV(4.9, 'in', '全員向泰坦集合', A0('P3A-F02'), {
    MT: '繞到泰坦另一側拉住他，讓他面向最近的正點（方便看之後跳起的面向）。', def: '在泰坦背後（MT 對面）集中站位。',
  }, 'P3A-F02');
  MV(17.8, 'buster1', '碎岩／山崩：只有 MT 在泰坦正面', A0('P3A-F03'), {
    MT: '碎岩、山崩是對你的順劈死刑：開減傷，其他人都在泰坦背後。', def: '待在泰坦背後，不要進他正面的順劈範圍。',
  }, 'P3A-F03');
  MV(23.25, 'wotl1', '大地之重①：離開腳下的圈', A0('P3A-F04'), {
    MT: '腳下出圈（半徑 4）：往旁邊走出去（攻略：往右）。', def: '腳下出圈（半徑 4）：人群一起往旁邊走出去（攻略：往左）。',
    sOT: '自殺流：先照常躲第一波。', sM1: '自殺流：先照常躲第一波。', sM2: '自殺流：先照常躲第一波。', sR: '自殺流：先照常躲第一波。',
  }, 'P3A-F04', { preview: false });
  MV(26.25, 'wotl2', '大地之重②：走回原位', (S2) => sui4null(S2, A0('P3A-F06')(S2)), {
    def: '第二波又在腳下出圈：走回原本的位置。',
    sOT: '自殺流：這一波不要動，留在圈裡被打死（之後 H1 會救你）。', sM1: '自殺流：這一波不要動，留在圈裡被打死（之後 H2 會救你）。',
    sM2: '自殺流：這一波不要動，留在圈裡被打死（之後 C 即刻救你）。', sR: '自殺流：這一波不要動，留在圈裡被打死（C 會在踩地板時用 10 秒詠唱救你）。',
  }, 'P3A-F06', { preview: false });
  MV(30.15, 'far1', '泰坦上天：去他面向的對面', A1('P3A-F07'), {
    def: (S2) => `泰坦面向 ${DIR4[S2.roll.j1]} 跳起，會落在那裡：去對面最遠處（安全區內，場地要縮小了）。`,
  }, 'P3A-F07', { preview: false });
  MV(34.3, 'land1', '落地：向泰坦移動', (S2) => { const a = fp('P3A-F11'); return a.map((p, i) => T1(S2, p ? [p[0], (i % 3 - 1) * 0.5] : p)); }, {
    MT: '跑到泰坦正面拉住他（面向場中）。', def: '跑到泰坦正面、貼近泰坦（大怒震會把人往場中擊退）。',
  }, 'P3A-F09', { preview: false });
  MV(39.5, 'kbSide', '看爆破岩石：貼近泰坦，站另一邊', (S2) => { const a = fp('P3A-F11'); return a.map((p, i) => T1(S2, p ? [p[0], KB_Z[i]] : p)); }, {
    def: '大怒震把全員往場中擊退 26 並暈眩：看外側靠中線的那顆岩石在哪一邊，貼著泰坦站另一邊，被擊退到岩石之間（黃色虛線圈是你的落點）。',
  }, 'P3A-F11', { preview: false });
  MV(45.1, 'spread', '暈眩結束：前後分散，看石牢點名', (S2) => gaolSpots(S2, A1('P3A-F16')(S2)), {
    def: (S2, slot) => {
      const g = S2.s.gaol.find((x) => x.slot === slot);
      return g ? `你被點名花崗石牢：照順序（泰坦→龍→忍→詩→召→騎→白→學→岩石）站「${g.name}」，0:50 會被關住。` : '前後分散，看誰被點名花崗石牢；地裂馬上來。';
    },
  }, 'P3A-F16', { preview: false });
  MV(46.3, 'ls1', '地裂①：躲開 5 條直線', (S2) => gaolSpots(S2, cur(S2)), {
    def: '泰坦往目標方向放 5 條直線（間隔 45°），被打到會被擊退到場外：站在線與線之間。被點石牢的人躲完要回到自己的位置。',
  }, 'P3A-F16', { preview: false });
  MV(48.1, 'gaolGo', '石牢就位', (S2) => { const a = Array(8).fill(null); return gaolSpots(S2, a); }, {
    def: (S2, slot) => { const g = S2.s.gaol.find((x) => x.slot === slot); return g ? `回到「${g.name}」：0:50 被關住，之後爆破岩石會連鎖炸開石牢。` : '留在原地。'; },
  }, 'P3A-F18', { preview: false, jitter: false });
  MV(51.2, 'ls2', '地裂②：躲開（被關的人無敵）', cur, {
    def: '再一次地裂：躲開直線，也遠離石牢（0:53 會依序爆炸）與爆破岩石。',
  }, 'P3A-F22', { preview: false });
  MV(54.0, 'stack1', '到泰坦旁集合（踩地板）', A1('P3A-F27'), {
    def: '石牢炸開後原地會留下污泥（踩到會死）：繞開污泥，到泰坦旁集合。泰坦踩著污泥會累積覺醒層數。',
    sOT: '自殺流：三顆石牢形成後（0:50～0:55，建議三連桶炸完）按 F 接受復活，用普通移動走到泰坦旁。', sM1: '自殺流：三顆石牢形成後（0:50～0:55，建議三連桶炸完）按 F 接受復活，用普通移動走到泰坦旁。',
    sM2: '自殺流：三顆石牢形成後（0:50～0:55，建議三連桶炸完）按 F 接受復活，用普通移動走到泰坦旁。', sR: '自殺流：等 C 的 10 秒復活（約 1:05），到了就起身。',
  }, 'P3A-F27');
  MV(65.6, 'stack2', '覺醒後：泰坦旁集合', A1('P3B-F01'), { def: '在泰坦旁集合，準備大地之重。', sR: '自殺流：收到復活就起身（按 F），回到人群。' }, 'P3B-F01', { preview: false });
  MV(67.25, 'wotl3', '大地之重①：穿過泰坦躲開', A1('P3B-F03'), { def: '腳下出圈：全員穿過泰坦到另一側（繞開污泥）。' }, 'P3B-F03', { preview: false });
  MV(70.25, 'wotl4', '大地之重②：分散', A1('P3B-F05'), { def: '第二波出圈：全員分散躲開。' }, 'P3B-F05', { preview: false });
  MV(73.3, 'ls3', '地裂（覺醒）：躲開第一波', cur, {
    def: '覺醒後的地裂有兩波：先躲開看得到的 5 條線；第一波打完立刻站進第一波打過的地方（第二波看不見，打在線與線之間）。',
  }, 'P3B-F05', { preview: false });
  MV(75.1, 'ls3b', '地裂第二波：站回第一波的線上', cur, { def: '第二波（看不見）會打在第一波的線之間：站到第一波打過的線上。' }, 'P3B-F07', { preview: false });
  MV(78.3, 'pull2', 'MT 把泰坦拉向場中', A1('P3B-F11'), {
    MT: '把泰坦往 1 號位拉一點，方便大家看他跳起的面向。', def: '跟著往場中靠。泰坦接下來只會往他的左前、正前、右前跳。',
  }, 'P3B-F11', { preview: false });
  MV(81.15, 'far2', '泰坦上天：去對面', A2('P3B-F13'), {
    def: (S2) => `泰坦面向 ${DIR4[S2.roll.j2]}（他的${TURN[S2.roll.turn]}）跳起：去對面，場地會再縮小（半徑 ${K.SHRINK2}）。`,
  }, 'P3B-F13', { preview: false });
  MV(86.3, 'land2', '落地：向泰坦移動', A2('P3B-F15'), { def: '向泰坦移動；MT 準備把泰坦拉進場中。' }, 'P3B-F15', { preview: false });
  const g2fix = (a, S2) => {
    const k = S2.s.gaol2 ? S2.s.gaol2.slot : H2;
    if (k !== H2) { const t = a[k]; a[k] = a[H2]; a[H2] = t; }
    a[k] = [0, 0];
  };
  MV(88.3, 'gaol2', '石牢②：被點名的人站 1 號位', A2('P3B-F17', g2fix), {
    MT: '站在 1 號位旁拉住泰坦（往 1 號位拉）。',
    def: (S2, slot) => (S2.s.gaol2 && S2.s.gaol2.slot === slot ? '你被點名花崗石牢：直接站 1 號位（場地中心）。' : '在 1 號位附近，石牢出現後集火打掉。'),
  }, 'P3B-F17', { preview: false });
  MV(95.1, 'gaol2b', '集火石牢', A2('P3B-F19', g2fix), { def: '集火打掉石牢（地裂前打掉，讓被關的人有時間躲）。' }, 'P3B-F19', { preview: false });
  MV(100.3, 'ls4', '地裂（覺醒）：躲開第一波', (S2) => { const a = A2('P3B-F23')(S2); return S2.chars.map((c, i) => (a[i] && Math.hypot(a[i][0] - c.pos.x, a[i][1] - c.pos.z) < 6 ? a[i] : [c.pos.x, c.pos.z])); }, { def: '躲開 5 條線；第一波打完立刻站進第一波打過的地方。' }, 'P3B-F23', { preview: false });
  MV(102.1, 'ls4b', '地裂第二波：站回第一波的線上', cur, { def: '第二波（看不見）打在第一波的線之間：站到第一波打過的線上。' }, 'P3B-F25', { preview: false });
  MV(106.0, 'center', '全員 1 號位集合（怒震 ×6）', A2('P3B-F28', (a) => { a[MT] = [-0.1, 2.6]; }), { def: '全員在 1 號位集合，補師撐過連續怒震。' }, 'P3B-F27');
  MV(114.6, 'buster2', 'MT 到場邊，讓泰坦背對人群', A2('P3B-F28'), {
    MT: '站到場邊拉住泰坦，讓他背對人群：碎岩、山崩打你。', def: '在 1 號位（泰坦背後），不要進他正面的順劈範圍。',
  }, 'P3B-F28');
  MV(121.1, 'run0', '穿過泰坦，到 MT 那邊集合', A2('P3B-F30'), { def: '爆破岩石要落在場中附近：穿過泰坦到 MT 那邊的場邊集合。' }, 'P3B-F30');
  MV(123.1, 'run1', '沿場邊跑（MT 逆時針、其他人順時針）', runAt(40, -40), {
    MT: '大地之重出圈：沿安全區邊緣逆時針跑。', def: '大地之重出圈：沿安全區邊緣順時針跑（和 MT 反方向）。',
  }, 'P3B-F32', { preview: false, jitter: false });
  MV(126.1, 'run2', '繼續沿場邊跑', runAt(80, -80), { MT: '繼續逆時針跑，躲第二輪圈。', def: '繼續順時針跑，躲第二輪圈。' }, 'P3B-F34', { preview: false, jitter: false });
  MV(129.2, 'run3', '繼續跑＋躲地裂第一波', runAt(120, -120), { MT: '繼續逆時針跑；同時躲開地裂的線。', def: '繼續順時針跑；同時躲開地裂的線。' }, 'P3B-F36', { preview: false, jitter: false });
  MV(130.6, 'run4', '地裂第二波：站回第一波的線上', runAt(160, -160), { def: '第一波打完：往前跑並站到第一波打過的線上（第二波打在線與線之間）。' }, 'P3B-F38', { preview: false });
  MV(136.0, 'behind', 'MT 讓泰坦面向朝外，人群在背後', A2('P3B-F42'), {
    MT: '把泰坦面向調整朝外（就近），準備碎岩、山崩。', def: '在泰坦背後集合輸出。',
  }, 'P3B-F42');
  MV(145.2, 'wotl5', '大地之重①（覺醒）', A2('P3B-F46'), { MT: '出圈：往泰坦的另一側走。', def: '出圈：人群往外側走。' }, 'P3B-F46', { preview: false });
  MV(148.2, 'wotl6', '大地之重②', A2('P3B-F48', fillH1), { def: '再出圈：走回原位。' }, 'P3B-F48', { preview: false });
  MV(151.2, 'wotl7', '大地之重③：集合', A2('P3B-F50', fillH1), { def: '第三輪：出圈並集合，接著連續怒震 ×8。' }, 'P3B-F50', { preview: false });
}

function tick(S, dt) {
  const s = S.s, titan = s.titan;
  // 泰坦面向 MT（跳躍時除外）
  if (s.faceMT && titan.visible && !titan.dead) { const m = S.chars[MT]; titan.rot = Math.atan2(m.pos.x - titan.pos.x, m.pos.z - titan.pos.z); }
  for (const a of s.anim) if (S.t >= a.t0 && S.t <= a.t1 + dt) titan.lift = a.from + (a.to - a.from) * Math.min(1, (S.t - a.t0) / (a.t1 - a.t0));
  // 大怒震落點預覽（教學）
  if (s.kbPrev && S.t <= 43.0) {
    const d = Math.hypot(titan.pos.x, titan.pos.z) || 1;
    for (const p of s.kbPrev) { const c = S.chars[p.owner]; p.x = c.pos.x - titan.pos.x / d * K.KB; p.z = c.pos.z - titan.pos.z / d * K.KB; }
  }
  // 污泥：站在裡面太久會死
  for (const c of S.chars) {
    if (!c.alive) continue;
    const inS = s.sludge.some((z) => S.t >= z.lethal && S.t <= z.t1 && inCircle(c.pos, z, z.r));
    c.sludgeT = inS ? (c.sludgeT || 0) + dt : 0;
    if (c.sludgeT > K.SLUDGE_DWELL) S.kill(c, '踩到污泥（石牢爆炸後留在地上）：致死的持續傷害');
  }
  S.zones = S.zones.filter((z) => z.style !== 'sludge' || S.t <= z.t1);
  // 自殺流：AI 自動接受復活
  if (s.autoAccept) for (const c of S.chars) if (!c.alive && c.raise && c.auto && S.t >= s.autoAccept[c.slot]) s.accept(c.slot);
}

function objectives(S, slot) {
  const c = S.chars[slot], st = c.stats, k = c.slot, s = S.s, out = [];
  const sui = S.variant === 'suicide' && SUI.includes(k);
  if (sui) {
    out.push({ ok: c.planned || st.rise !== undefined, text: '自殺流：第二波大地之重留在原地死亡' });
    const last = k === RR;
    const okRise = st.rise !== undefined && (last ? st.rise <= 65.0 + RISE.lastGrace : st.rise >= RISE.win0 && st.rise <= RISE.win1);
    out.push({ ok: okRise, text: last ? '收到 C 的 10 秒復活就起身' : '三顆石牢形成後～開始踩地板前（0:50～0:55）起身' });
    out.push({ ok: c.alive, text: '起身後存活到最後' });
  } else out.push({ ok: c.alive, text: '全程存活' });
  const g = s.gaol.find((x) => x.slot === k);
  if (g) out.push({ ok: !!st.gaolOk, text: `花崗石牢：照順序站「${g.name}」` });
  if (s.gaol2 && s.gaol2.slot === k) out.push({ ok: !!st.gaol2Ok, text: '覺醒後花崗石牢：站 1 號位' });
  out.push({ ok: !!s.woken, text: `泰坦覺醒（${s.charges || 0}/${K.CHARGES}：泰坦位的石牢被連鎖炸開，留下污泥）` });
  return out;
}

const CHECKPOINTS = [
  { t: 0, name: '開場：大地粉碎／大地之怒' },
  { t: 17, name: '碎岩・山崩／大地之重' },
  { t: 29, name: '第一次跳躍＋場地縮小' },
  { t: 36, name: '大怒震＋爆破岩石' },
  { t: 44.5, name: '花崗石牢＋地裂' },
  { t: 54, name: '污泥／怒震' },
  { t: 66, name: '覺醒後：大地之重／地裂（兩波）' },
  { t: 80, name: '第二次跳躍＋再縮小' },
  { t: 87, name: '花崗石牢②＋地裂' },
  { t: 113, name: '碎岩・山崩／爆破岩石跑圈' },
  { t: 137, name: '碎岩・山崩／大地之重 ×3／怒震' },
];

const CUES = [
  [0.0, '大地粉碎：泰坦落在中央，留在外圍'],
  [7.0, '大地之怒（全體）'],
  [19.0, '碎岩／山崩：MT 死刑順劈'],
  [23.0, '大地之重 ×2：腳下出圈，走出去再走回來'],
  [30.0, '泰坦轉向跳起：去他面向的對面（場地縮小）'],
  [39.0, '爆破岩石 5 顆＋大怒震：貼近泰坦站對的一邊'],
  [45.0, '花崗石牢點名 3 人：照順序站 泰坦位／1 號位／岩石位'],
  [46.0, '地裂：躲開 5 條直線'],
  [51.0, '地裂②；0:53 石牢連鎖爆炸，留下污泥'],
  [55.5, '怒震 ×8（泰坦踩污泥累積覺醒）'],
  [67.0, '大地之重 ×2：穿過泰坦躲開'],
  [73.0, '地裂（覺醒）：兩波，第二波站回第一波的線上'],
  [81.0, '泰坦再跳（只會往左前／正前／右前）：去對面，場地再縮小'],
  [88.0, '花崗石牢：被點名者站 1 號位，集火打掉'],
  [100.0, '地裂（覺醒）：兩波'],
  [108.0, '全員 1 號位：怒震 ×6'],
  [116.0, '碎岩／山崩：MT 在場邊'],
  [121.0, '爆破岩石 ×4＋大地之重 ×3：沿場邊跑（MT 逆時針、其他順時針）'],
  [129.0, '地裂（覺醒）：邊跑邊躲'],
  [140.0, '碎岩／山崩'],
  [145.0, '大地之重 ×3'],
  [156.0, '怒震 ×8'],
  [165.0, '擊殺泰坦'],
];
const CUES_SUI = [
  [26.0, '自殺流：OT／M1／M2／R 第二波留在圈裡'],
  [35.5, '自殺流：H1 救 OT、H2 救 M1、C 即刻救 M2（先別起身）'],
  [50.2, '自殺流：三顆石牢形成，0:50～0:55 可以起身（F），建議三連桶炸完再起'],
  [55.0, '自殺流：C 用 10 秒詠唱救 R'],
];

const ROLE_DESC = [
  '開場繞到泰坦另一側拉住他（面向正點）；碎岩／山崩死刑；大怒震前站泰坦正面；覺醒後把泰坦往 1 號位拉；1:56 到場邊讓泰坦背對人群；爆破岩石跑圈時逆時針跑。',
  '跟人群；可能被點花崗石牢（順序：泰坦→龍→忍→詩→召→騎→白→學→岩石）。',
  '跟人群；可能被點花崗石牢（照順序站泰坦位／1 號位／爆破岩石位）。',
  '跟人群；可能被點花崗石牢（學被點名直接站爆破岩石位）。',
  '跟人群；被點花崗石牢時直接站泰坦位。',
  '跟人群；被點花崗石牢時先去泰坦位，龍也被點名就站 1 號位。',
  '跟人群；可能被點花崗石牢（照順序站位）。',
  '開場順路撿突破極限碎片；跟人群；可能被點花崗石牢（照順序站位）。',
];
const ROLE_DESC_SUI = [
  ROLE_DESC[0] + '（自殺流：你是主仇，石牢固定點 H1／H2／C。）',
  '自殺流：第二波大地之重留在圈裡死亡；H1 救你，三顆石牢形成後～開始踩地板前（0:50～0:55）按 F 起身。',
  '自殺流：即刻復活 OT（他會等石牢形成再起身）；石牢固定點你，站 1 號位（泰坦—C—H1—H2）。',
  '自殺流：即刻復活 M1；石牢固定點你，站爆破岩石位（泰坦—C—H1—H2）。',
  '自殺流：第二波大地之重留在圈裡死亡；H2 救你，0:50～0:55 按 F 起身。',
  '自殺流：第二波大地之重留在圈裡死亡；C 即刻救你，0:50～0:55 按 F 起身。',
  '自殺流：第二波大地之重留在圈裡死亡；C 在踩地板時用 10 秒詠唱救你，收到就按 F 起身。',
  '自殺流：即刻復活 M2、踩地板時 10 秒詠唱復活 R；石牢固定點你，站泰坦位（泰坦—C—H1—H2）。',
];

PHASES.p3 = {
  id: 'p3', name: 'P3 泰坦', short: '泰坦', preRoll: -3, end: K.END, maxCharges: K.CHARGES, chargeLabel: '覺醒',
  checkpoints: CHECKPOINTS, cues: CUES, roleDesc: ROLE_DESC,
  cuesFor: (v) => (v === 'suicide' ? CUES.concat(CUES_SUI).sort((a, b) => a[0] - b[0]) : CUES),
  roleDescFor: (v) => (v === 'suicide' ? ROLE_DESC_SUI : ROLE_DESC),
  variants: [{ v: 'regular', name: '正規' }, { v: 'suicide', name: '自殺流' }],
  roll, setup, build, tick, objectives,
  start: () => { const a = fp('P3A-F01'); a[MT] = [-1.2, 17.6]; return a; },
  /** 完整體驗：從 P2 結束的地方，沿外圍到「同一邊」的開場位置。 */
  transitSpots: (S) => { const a = fp('P3A-F01'); a[MT] = [-1.2, 17.6]; return a.map((p) => T0(S, p)); },
  rollSummary: (r) => [
    `第一次跳躍：${DIR4[r.j1]}　爆破岩石：情況 ${r.mirror ? 2 : 1}　第二次跳躍：${DIR4[r.j2]}（${TURN[r.turn]}）`,
    `花崗石牢：${r.gaolTargets.join('、') || '—'}　覺醒後石牢：${r.gaol2Target || '—'}`,
    `地裂目標：${r.lsTargets.filter(Boolean).join('、') || '—'}`,
  ],
};
root.UWU_P3 = { K, sanitize, nearestSafe, badFn };

})(typeof window !== 'undefined' ? window : globalThis);
