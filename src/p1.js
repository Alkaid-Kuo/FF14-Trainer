/* P1 迦樓羅。站位／分工：攻略（萌神神 v11）P1-F01~F37；時間點以攻略 mm:ss 為準，細部間隔參考第三方 log 資料。
   職位對應：戰=MT 騎=OT 白=H1 學=H2 龍=M1 忍=M2 詩=R 召=C。 */
(function (root) {
'use strict';
const U = root.UWU;
const { C, PHASES, ROLES, isTank, inCircle, inRect, segInfo, atBearing, mulberry32, shuffler, dist } = U;
const { MT, OT, H1, H2, M1, M2, RR, CC } = U;
const PI = Math.PI;
const FR = U.FRAMES;
const IDX = { MT: 0, OT: 1, H1: 2, H2: 3, M1: 4, M2: 5, R: 6, C: 7 };

const K = {
  SLIP_HALF: PI / 4, SLIP_LEN: 11.7, SONG_HALF: 2.5, SONG_LEN: 40,
  GW_R: 6.5, WHEEL_R: 8.4, WHEEL_IN2: 6.5, EYE_IN: 12, EYE_OUT: 25, GIGA_R: 5.0, BUBBLE_R: 4.0, BUBBLE_SEC: 1.4,
  FRIC_R: 5, RAIN_R: 2.0, MESO_R: 3, PASS_HALF: 1, MAX_THERMAL: 2, CHARGES: 4, END: 168.5,
  RING_TANK: 10.4, CLONE_R: 19.5,
};
const BUBBLE_AT = { x: -4.6, z: -0.6 };
/** 開場改在東邊（B）開怪：攻略 F02~F04（原本在北邊 A）整組順時針轉 90°；F05 之後照攻略。 */
const OPEN_ROT = 90;
/** 倒數時的出生位置：補師在南邊（C 點附近），其餘人在東邊（B 點附近）集合。 */
function spawnSpots() {
  const a = ROLES.map(() => null);
  a[H1] = [-1.6, 17.4]; a[H2] = [1.6, 17.4];
  a[MT] = [17.4, -1.0]; a[OT] = [17.4, 1.0]; a[M1] = [16.4, -2.4]; a[M2] = [16.4, 2.4]; a[RR] = [15.6, -1.0]; a[CC] = [15.6, 1.0];
  return a;
}
const PLUME_SPOTS = [346, 14, 45, 76, 104, 135, 166, 194, 225, 256, 284, 315].map((b) => atBearing(b, 17.2));
const RAIN_N = [6, 6, 4, 4, 4];

/** 取攻略畫面各職位座標；ov 為覆寫（鍵為職位或 slot）。 */
function fp(id, ov) {
  const f = FR[id].pos;
  const a = ROLES.map((r) => (f[r.key] ? f[r.key].slice() : null));
  if (ov) for (const k of Object.keys(ov)) a[k in IDX ? IDX[k] : +k] = ov[k];
  return a;
}
const all = (p, ov) => { const a = ROLES.map(() => p.slice()); if (ov) for (const k of Object.keys(ov)) a[k in IDX ? IDX[k] : +k] = ov[k]; return a; };
const only = (slot, p) => { const a = Array(8).fill(null); a[slot] = p; return a; };
const rot2 = (p, deg) => U.rotateXZ(p, deg);
const openRot = (a) => a.map((p) => (p ? rot2(p, OPEN_ROT) : p));
/** 0:14~0:34 依你們的打法南北對調（MT 在北、Garuda 面向 A、人群靠 C），東西不變。 */
const flipNS = (p) => [p[0], -p[1]];
const flipAll = (a) => a.map((p) => (p ? flipNS(p) : p));
/** 羽毛雨離開位置：以攻略位置為準，但自動與當次鎖定位置拉開距離。 */
function repel(p, spots, minD) {
  let x = p[0], z = p[1];
  for (let it = 0; it < 8; it++) {
    let moved = false;
    for (const q of spots) {
      const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz);
      if (d < minD) { const k = (minD - d + 0.05) / (d || 1); x += (d ? dx : 1) * k; z += (d ? dz : 0) * k; moved = true; }
    }
    if (!moved) break;
  }
  const d = Math.hypot(x, z);
  if (d > 18.8) { x *= 18.8 / d; z *= 18.8 / d; }
  return [x, z];
}
/** 從 from 到 to，若直線會穿過中心區（距離中心 < 6），改沿外圈弧線走一個中繼點。 */
function viaRim(from, to) {
  const seg = segInfo({ x: 0, z: 0 }, { x: from[0], z: from[1] }, { x: to[0], z: to[1] });
  if (seg.d >= 6) return null;
  const b0 = Math.atan2(from[0], -from[1]), b1 = Math.atan2(to[0], -to[1]);
  let d = b1 - b0; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
  const bm = b0 + d / 2;
  return [11.5 * Math.sin(bm), -11.5 * Math.cos(bm)];
}
const tipf = (m) => (slot) => {
  const r = ROLES[slot];
  const v = m[r.key];
  if (v !== undefined) return v;
  const g = r.kind === 'tank' ? m.T : r.kind === 'healer' ? m.H : m.D;
  return g !== undefined ? g : (m.def || '');
};

function roll(seed) {
  const rng = mulberry32(seed), sh = shuffler(rng), pick = (a) => a[Math.floor(rng() * a.length)];
  const nonTanks = [2, 3, 4, 5, 6, 7];
  return {
    seed,
    songTarget: [2, 3][Math.floor(rng() * 2)],
    frictionTargets: [pick(nonTanks), pick(nonTanks)],
    plumes1: sh(PLUME_SPOTS).slice(0, 4), plumes2: sh(PLUME_SPOTS).slice(0, 4),
    rainOrder: [0, 1, 2, 3, 4].map(() => sh([0, 1, 2, 3, 4, 5, 6, 7])),
    cloneBearings: sh([0, 90, 180, 270]).slice(0, 2),
    cloneSongTargets: sh(nonTanks).slice(0, 2),
    mesoOrder: sh([0, 1, 2, 3, 4, 5, 6, 7]),
  };
}

/** 兩隻分身的方位 → MT/OT 各自擋哪個方位（攻略 P1-F19 的分配表）。 */
function cloneTankBearings(b0, b1) {
  const ab = (b) => b === 0 || b === 90;
  if (ab(b0) !== ab(b1)) { const x = ab(b0) ? b0 : b1, y = ab(b0) ? b1 : b0; return { mt: x, ot: y }; }
  return ab(b0) ? { mt: 0, ot: 90 } : { mt: 180, ot: 270 };
}

function setup(S) {
  const g = S.actor('garuda', 'Garuda', 0, -13.2, 0);
  S.s.garuda = g;
}

function build(S) {
  const R = S.roll, s = S.s, at = (t, fn) => S.at(t, fn);
  const g = s.garuda;
  const mtc = () => S.mainTank();   // MT 倒地時 Garuda 改面向 OT（再來依仇恨順序）
  const faceMT = () => { g.rot = Math.atan2(mtc().pos.x - g.pos.x, mtc().pos.z - g.pos.z); };
  s.gw = {}; s.rains = []; s.charges = 0; s.woken = false; s.plumes = []; s.shard = null; s.bubble = null; s.clones = [];
  const SONG = { intercept: 59, behind: 15 };

  // ---------------------------------------------------------------- 機制
  const slipstream = (t0, quiet) => S.hazard({
    t0, tRes: t0 + 2.49, kind: 'cone', label: 'Slipstream（螺旋氣流）', tankSafe: true, tankDmg: 60, quiet, buster: true,
    geom: () => { faceMT(); return { x: g.pos.x, z: g.pos.z, rot: g.rot, half: K.SLIP_HALF, len: K.SLIP_LEN }; },
    castBy: ['Garuda', 'Slipstream', 2.2],
    killMsg: '被 Slipstream（Garuda 正面扇形）擊中：非坦克不能站正面',
  });

  // 扇形的對象在讀條開始時就鎖定（讀條中 MT 倒地也不會轉向別人）
  const downburst = (tRes) => { let tg = null; return S.hazard({
    t0: tRes - 4.5, omen: tRes - 2.5, assistFrom: tRes - 4.5, tRes, kind: 'cone', label: 'Downburst（下行突風）', tankSafe: true, tankDmg: 45, buster: true,
    geom: () => { tg = mtc(); return { x: g.pos.x, z: g.pos.z, rot: g.rot, half: K.SLIP_HALF, len: K.SLIP_LEN }; },
    follow: (f) => { f.x = g.pos.x; f.z = g.pos.z; f.rot = Math.atan2(tg.pos.x - g.pos.x, tg.pos.z - g.pos.z); },
    killMsg: '被 Downburst 扇形（Garuda→MT 方向）擊中',
  }); };

  const song = (srcFn, slot0, tMark, tShow, tRes, spotKey, label) => {
    let fx = null, src = null, targetSlot = slot0;
    at(tMark, () => {
      src = srcFn();
      targetSlot = S.pickAlive(slot0);   // 預定的人倒地 → 點下一個活著的非坦克
      S.mark(targetSlot, 'song', tMark, tRes);
      fx = S.addFx({ kind: 'rect', x: src.pos.x, z: src.pos.z, w: K.SONG_HALF * 2, len: K.SONG_LEN, t0: tShow, assistFrom: tMark, t1: tRes, label, tint: 'line' });
      fx.follow = (f) => { const tg = S.chars[targetSlot]; f.x = src.pos.x; f.z = src.pos.z; f.rot = Math.atan2(tg.pos.x - src.pos.x, tg.pos.z - src.pos.z); };
    });
    at(tShow, () => S.cast(src.look === 'garuda' ? 'Garuda' : src.name, 'Mistral Song', tShow, tRes - tShow));
    at(tRes, () => {
      const tg = S.chars[targetSlot];
      const rot = Math.atan2(tg.pos.x - src.pos.x, tg.pos.z - src.pos.z);
      const line = S.alive().filter((c) => inRect(c.pos, src.pos, rot, K.SONG_HALF, K.SONG_LEN)).sort((a, b) => dist(a.pos, src.pos) - dist(b.pos, src.pos));
      const first = line[0];
      s.gw[spotKey] = first ? { x: first.pos.x, z: first.pos.z } : { x: tg.pos.x, z: tg.pos.z };
      if (!first) return;
      if (isTank(first.slot)) {
        S.damage(first, SONG.intercept, label, true); first.stats.intercepts = (first.stats.intercepts || 0) + 1;
        S.log(`${first.key} 擋下 ${label}`, first.slot);
      } else S.kill(first, `${label}：直線最前方不是坦克（沒有人擋歌）`);
      for (const c of line.slice(1)) S.damage(c, SONG.behind, `${label}（站在坦克後方被波及）`);
    });
  };

  const gwCast = (spotKey, t0, tRes) => {
    let spot = null;
    at(t0 - 0.01, () => { spot = s.gw[spotKey]; });
    S.hazard({
      t0, tRes, kind: 'circle', label: 'Great Whirlwind（大龍卷風）', castBy: ['龍捲', 'Great Whirlwind', tRes - t0],
      geom: () => (spot ? { x: spot.x, z: spot.z, r: K.GW_R } : { x: 0, z: 0, r: 0 }),
      killMsg: '被 Great Whirlwind 大龍卷風（半徑 6.5）吃到',
    });
  };

  const featherRain = (idx, tSnap, tCast, tEffect) => {
    at(tSnap, () => {
      S.sound('eagle');   // 上天時的鷹嘯：聽到就要離開原地
      const targets = R.rainOrder[idx].filter((x) => S.chars[x].alive).slice(0, RAIN_N[idx]);
      const spots = targets.map((x) => ({ x: S.chars[x].pos.x, z: S.chars[x].pos.z }));
      s.rains[idx] = spots;
      for (const p of spots) S.previews.push({ kind: 'circle', x: p.x, z: p.z, r: K.RAIN_R, t0: tSnap, t1: tCast, label: '羽毛雨' });
      S.log('Garuda 上天：羽毛雨鎖定在此刻腳下，立刻離開', -1, true);
    });
    let hit = [];
    at(tCast, () => {
      for (const p of s.rains[idx]) S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.RAIN_R, t0: tCast, t1: tEffect + 0.2, label: 'Feather Rain', tint: 'rain' });
      S.cast('Garuda', 'Feather Rain（飛翎雨）', tCast, 0.7);
    });
    at(tCast + 0.7, () => { hit = S.alive().filter((c) => s.rains[idx].some((p) => inCircle(c.pos, p, K.RAIN_R))); });
    at(tEffect + 0.2, () => { for (const c of hit) S.kill(c, '被 Feather Rain 羽毛雨命中（沒有離開鎖定位置）'); });
  };

  const warp = (tOut, tHide, tPos, tShow, tTarget, pos) => {
    at(tOut, () => { g.targetable = false; });
    at(tHide, () => { g.visible = false; });
    at(tPos, () => { g.pos.x = pos.x; g.pos.z = pos.z; g.rot = 0; g.goal = null; });
    at(tShow, () => { g.visible = true; });
    at(tTarget, () => { g.targetable = true; });
  };

  const addThermal = (c) => { if (c.alive && c.thermal < K.MAX_THERMAL) c.thermal++; };
  s.cleanse = (c, source) => {
    if (!c.thermal) return;
    const awakening = c.thermal >= K.MAX_THERMAL;
    c.thermal = 0;
    S.log(`${c.key} 消除低氣壓${awakening ? '（2 層：充能 +1，全體 25000）' : '（1 層：無充能，全體 4000）'}`, c.slot);
    for (const o of S.alive()) S.damage(o, awakening ? 14 : 3, 'Super Cyclone');
    const st = c.stats;
    if (source === 'bubble') st.bubbleClean = (st.bubbleClean || 0) + 1; else st.mesoClean = (st.mesoClean || 0) + 1;
    if (!awakening) return;
    s.charges++;
    if (source === 'bubble') st.bubbleCharge = (st.bubbleCharge || 0) + 1; else st.mesoCharge = (st.mesoCharge || 0) + 1;
    if (s.charges >= K.CHARGES && !s.woken) { s.woken = true; S.log('Garuda 覺醒層數達 4：覺醒！'); }
  };

  const friction = (slot, tCast, tRes) => {
    let target = null;
    at(tCast, () => {
      target = S.chars[S.pickAlive(slot)];
      S.mark(target.slot, 'friction', tCast, tRes);
      const fx = S.addFx({ kind: 'circle', x: target.pos.x, z: target.pos.z, r: K.FRIC_R, t0: tCast, t1: tRes, label: 'Friction（烈風刃）', tint: 'share' });
      fx.follow = (f) => { f.x = target.pos.x; f.z = target.pos.z; };
      S.cast('Garuda', 'Friction（烈風刃）', tCast, 1.7);
    });
    at(tRes, () => {
      for (const c of S.alive()) if (inCircle(c.pos, target.pos, K.FRIC_R)) { S.damage(c, 15, 'Friction'); addThermal(c); }
    });
  };

  const eye = (t0, tRes) => S.hazard({
    t0, tRes, kind: 'ring', label: 'Eye of the Storm（台風眼）', tankSafe: true, tankDmg: 35, quiet: true,
    geom: { x: 0, z: 0, inner: K.EYE_IN, r: K.EYE_OUT }, castBy: ['Garuda', 'Eye of the Storm', 2.7],
    killMsg: '被 Eye of the Storm 外環（距離中心 12 以上）擊中',
  });
  const wheel = (t0, tRes) => S.hazard({
    t0, tRes, kind: 'circle', label: 'Wicked Wheel（邪輪旋風）',
    geom: () => ({ x: g.pos.x, z: g.pos.z, r: K.WHEEL_R }), castBy: ['Garuda', 'Wicked Wheel', 2.7],
    killMsg: '被 Wicked Wheel（Garuda 腳下半徑 8.4）擊中',
  });

  const spawnPlumes = (spots) => {
    s.plumes = spots.map((p, i) => { const a = S.actor('plume', '柔羽', p.x, p.z, 0); a.hp = 1; a.link = [M1, M2, RR, CC][i]; return a; });
  };
  const plumesGather = (point, tWalk, killAt, tGather) => {
    at(tWalk, () => s.plumes.forEach((p) => {
      const dx = p.pos.x - point.x, dz = p.pos.z - point.z, d = Math.hypot(dx, dz);
      p.moveTo(point.x + dx / d * 1.5, point.z + dz / d * 1.5, 7);
    }));
    at(tGather, () => s.plumes.forEach((p, i) => { p.drain = 1 / (killAt[i] - tGather); p.killAt = killAt[i]; }));
  };
  const plumeTethers = (t0, t1) => S.tethers.push({ kind: 'plume', t0, t1, ends: () => s.plumes.filter((p) => !p.dead).map((p) => [p.pos, S.chars[p.link].pos]) });

  // ---------------------------------------------------------------- 時間軸
  // 開場：Mistral Song / Slipstream / 大龍卷風
  song(() => g, R.songTarget, 5.2, 8.6, 10.32, 'boss', 'Mistral Song（寒風之歌）');
  slipstream(5.29, true);
  const pull0 = rot2([0, -13.5], OPEN_ROT), pull1 = rot2([0, -14.7], OPEN_ROT);
  at(0, () => g.moveTo(pull0[0], pull0[1], 7.5));
  at(7.9, () => { g.pos.x = pull1[0]; g.pos.z = pull1[1]; });
  at(13.0, () => g.moveTo(0, 0.6, 5));
  gwCast('boss', 13.44, 16.43);
  gwCast('boss', 19.59, 22.57);
  gwCast('boss', 25.73, 28.72);

  // 刺羽 + 柔羽 ①
  at(20.33, () => { spawnPlumes(R.plumes1); s.spiny = S.actor('spiny', '刺羽', -10.5, -0.3, 0); plumeTethers(20.33, 33); });
  at(20.52, () => {
    s.spiny.moveTo(-2.0, 1.9, 2.5);
    S.tethers.push({ kind: 'spiny', t0: 20.52, t1: 38, ends: () => (s.spiny && !s.spiny.dead ? [[s.spiny.pos, S.chars[OT].pos]] : []) });
  });
  slipstream(20.61, false);
  plumesGather({ x: 0.6, z: 3.2 }, 23.1, [30.6, 31.5, 32.3, 33.1], 24.5);
  downburst(26.58);
  const spinyHit = () => { const c = S.chars[S.pickAlive(OT, [OT, MT])]; S.log(`刺羽攻擊 ${c.key}：+1 層低氣壓`); addThermal(c); };
  at(26.71, spinyHit);
  at(33.0, () => s.spiny.moveTo(-5.6, -0.4, 2.5));
  at(35.85, spinyHit);
  at(36.5, () => s.spiny.moveTo(BUBBLE_AT.x, BUBBLE_AT.z, 2));

  // 羽毛雨 ① + 刺羽爆炸 + 寒風之嘯
  warp(33.93, 35.17, 36.07, 37.99, 38.21, { x: 0, z: -0.6 });
  featherRain(0, 34.02, 35.53, 36.52);
  at(37.9, () => { S.despawn(s.spiny); s.spiny = null; });
  S.hazard({
    t0: 38.21, tRes: 41.19, kind: 'circle', label: '刺羽爆炸（Gigastorm）', castBy: ['刺羽', 'Gigastorm', 2.7],
    geom: { x: BUBBLE_AT.x, z: BUBBLE_AT.z, r: K.GIGA_R }, killMsg: '被刺羽爆炸（半徑 5）擊中',
  });
  at(38.3, () => { S.cast('Garuda', 'Mistral Shriek（寒風之嘯）', 38.3, 2.7); S.expect('raid', 41.28); });
  at(41.28, () => S.raidwide('Mistral Shriek', 40));

  // 高氣壓圈 + 烈風刃 ×2
  at(43.45, () => {
    s.bubble = { id: 'bubble', kind: 'circle', x: BUBBLE_AT.x, z: BUBBLE_AT.z, r: K.BUBBLE_R, active: true, label: '高氣壓圈', tint: 'good' };
    S.zones.push(s.bubble); S.log('高氣壓圈出現：站進去停留 1.4 秒消除低氣壓', -1, true);
  });
  friction(R.frictionTargets[0], 48.68, 50.64);
  friction(R.frictionTargets[1], 54.78, 56.74);
  at(66.19, () => { if (s.bubble) s.bubble.active = false; });
  at(69.63, () => { S.zones = S.zones.filter((z) => z !== s.bubble); s.bubble = null; });

  // 羽毛雨 ② + 大氣爆發
  warp(68.81, 70.37, 70.95, 70.96, 73.09, { x: 0, z: -0.6 });
  featherRain(1, 68.90, 70.42, 71.40);
  at(73.18, () => { S.cast('Garuda', 'Aerial Blast（大氣爆發）', 73.18, 2.7); S.expect('raid', 76.17); });
  at(76.17, () => S.raidwide('Aerial Blast', 50));

  // 分身登場：羽毛雨 ③、寒風之歌 ×2、台風眼 + 邪輪旋風
  at(87.62, () => {
    for (let i = 0; i < 2; i++) { const a = S.actor('sister', i ? 'Chirada' : 'Suparna', 0, 0, 0); a.visible = false; a.tint = i ? '#e0b25a' : '#56d0d0'; s.clones.push(a); }
  });
  at(89.52, () => s.clones.forEach((a) => { a.visible = true; }));
  featherRain(2, 89.85, 91.36, 92.34);
  at(91.57, () => s.clones.forEach((a) => { a.visible = false; }));
  at(90.2, () => g.moveTo(3.4, -3.5, 4));
  at(91.3, () => g.moveTo(9.2, -8.7, 4));
  at(91.9, () => {
    s.clones.forEach((a, i) => {
      const p = atBearing(R.cloneBearings[i], K.CLONE_R);
      a.pos.x = p.x; a.pos.z = p.z; a.rot = Math.atan2(-p.x, -p.z);
    });
  });
  at(95.99, () => s.clones.forEach((a) => { a.visible = true; }));
  song(() => s.clones[0], R.cloneSongTargets[0], 94.04, 96.4, 99.2, 'c0', 'Mistral Song（分身）');
  song(() => s.clones[1], R.cloneSongTargets[1], 94.04, 96.4, 99.2, 'c1', 'Mistral Song（分身）');
  eye(96.58, 99.56);
  wheel(96.71, 99.69);
  featherRain(3, 101.29, 102.81, 103.79);
  gwCast('c0', 102.32, 105.31);
  gwCast('c1', 102.32, 105.31);
  at(102.57, () => s.clones.forEach((a) => { a.visible = false; }));

  // 柔羽 ② + 中高壓
  at(108.0, () => g.moveTo(0.1, 0.1, 4));
  at(111.8, () => { g.rot = Math.PI / 2; });
  at(110.84, () => { spawnPlumes(R.plumes2); plumeTethers(110.84, 126.4); });
  plumesGather({ x: -1.8, z: 0 }, 113.0, [123.1, 124.3, 125.3, 126.3], 114.5);
  at(117.38, () => s.clones.forEach((a, i) => { a.pos.x = i ? 19.8 : -19.8; a.pos.z = 0; a.rot = i ? -PI / 2 : PI / 2; }));
  slipstream(118.76, false);
  at(119.28, () => s.clones.forEach((a) => { a.visible = true; }));
  s.meso = [];
  at(119.56, () => {
    const seeds = R.mesoOrder.filter((x) => S.chars[x].alive);
    [0, 1].forEach((i) => {
      if (seeds[i] === undefined) return;
      const th = { kind: 'meso', clone: s.clones[i], holder: seeds[i], t0: 119.56, t1: 124.64 };
      th.end = () => {
        const a = th.clone.pos, holder = S.chars[th.holder];
        let best = null, bt = Infinity;
        for (const c of S.chars) {
          if (!c.alive) continue;
          const r = segInfo(c.pos, a, holder.pos);
          if (r.d <= K.PASS_HALF && r.t < bt) { best = c; bt = r.t; }
        }
        return best || (holder.alive ? holder : null);
      };
      th.ends = () => { const e = th.end(); return e ? [[th.clone.pos, e.pos]] : []; };
      s.meso.push(th); S.tethers.push(th);
      const fx = S.addFx({ kind: 'circle', r: K.MESO_R, t0: 119.56, t1: 124.64, label: 'Mesohigh（中高壓）', tint: 'meso' });
      fx.follow = (f) => { const e = th.end(); if (e) { f.x = e.pos.x; f.z = e.pos.z; f.hidden = false; } else f.hidden = true; };
    });
    S.log('中高壓連線：被連線者以外的人可擋線（擋線者需有低氣壓）', -1, true);
  });
  eye(119.61, 122.59);
  at(124.64, () => {
    for (const th of s.meso) {
      const holder = th.end();
      if (!holder) continue;
      for (const c of S.alive()) {
        if (!inCircle(c.pos, holder.pos, K.MESO_R)) continue;
        if (c.thermal > 0) s.cleanse(c, 'meso');
        else S.kill(c, '被中高壓命中但沒有低氣壓');
      }
    }
    s.meso = []; S.tethers = S.tethers.filter((t) => t.kind !== 'meso');
  });
  downburst(124.73);
  at(124.9, () => g.moveTo(6.3, -0.4, 4));
  featherRain(4, 126.74, 128.25, 129.23);

  // 覺醒後：螺旋氣流、覺醒邪輪旋風、覺醒下行突風
  slipstream(138.6, false);
  S.hazard({
    t0: 146.6, tRes: 150.5, snap: 149.3, kind: 'circle', label: 'Wicked Wheel（覺醒）第 1 段',
    geom: () => ({ x: g.pos.x, z: g.pos.z, r: K.WHEEL_R }), castBy: ['Garuda', 'Wicked Wheel（覺醒）', 2.7],
    killMsg: '被覺醒邪輪旋風第 1 段（圓形）擊中',
  });
  S.hazard({
    t0: 149.3, omen: 151.55, assistFrom: 149.3, tRes: 151.6, kind: 'ring', label: '邪輪旋風第 2 段（環形，無預警）',
    geom: () => ({ x: g.pos.x, z: g.pos.z, inner: K.WHEEL_IN2, r: 45 }),
    killMsg: '被覺醒邪輪旋風第 2 段（環形）擊中：要貼近 Garuda（6.5 以內）',
  });
  let shareTg = null;
  S.hazard({
    t0: 152.1, omen: 152.1, tRes: 154.6, kind: 'cone', label: 'Downburst（覺醒）8 人分攤', tint: 'share', noKill: true,
    geom: () => { shareTg = mtc(); return { x: g.pos.x, z: g.pos.z, rot: g.rot, half: K.SLIP_HALF, len: K.SLIP_LEN }; },
    follow: (f) => { f.x = g.pos.x; f.z = g.pos.z; f.rot = Math.atan2(shareTg.pos.x - g.pos.x, shareTg.pos.z - g.pos.z); },
    castBy: ['Garuda', 'Downburst（覺醒）', 2.5],
    onResolve: (inside) => {
      const n = inside.length;
      for (const c of S.alive()) {
        if (inside.includes(c)) continue;
        c.stats.shareMiss = (c.stats.shareMiss || 0) + 1;
        if (S.humans.has(c.slot)) S.note('hit', '覺醒下行突風：沒有站進扇形分攤', c.slot);
      }
      if (n < 4) { for (const c of inside) S.kill(c, '覺醒下行突風：分攤人數不足（需 8 人）'); return; }
      for (const c of inside) S.damage(c, 35 * 8 / n, 'Downburst（覺醒）分攤');
    },
  });
  slipstream(158.6, false);
  at(163.5, () => {
    s.shard = S.actor('shard', '突破極限碎片', g.pos.x, g.pos.z, 0);
    S.despawn(g); S.log('擊殺 Garuda：掉落突破極限碎片（M2 拾起）');
  });
  at(K.END, () => {
    const m2 = S.chars[M2];
    if (s.shard && m2.alive && dist(m2.pos, s.shard.pos) <= 2.5) m2.stats.shard = 1;
    S.finishWith(s.woken, `Garuda 沒有覺醒（充能 ${s.charges}/${K.CHARGES}）：淨化不足`);
  });

  // ---------------------------------------------------------------- 走位（攻略畫面）
  const MV = (t, id, title, spots, tip, frame, opt) => S.move(t, id, title, spots, Object.assign({ tip: tipf(tip), frame }, opt || {}));
  const bub = [BUBBLE_AT.x, BUBBLE_AT.z];

  MV(-4.99, 'spawn', '倒數：預備位置', spawnSpots, {
    T: '開怪前：站東邊（B 點）集合；MT 負責開怪。',
    H: '開怪前：站南邊（C 點附近），開怪後再去正中間（1 號位）。',
    D: '開怪前：到東邊（B 點）集合，等 MT 開怪。',
  }, null, { preview: false });
  MV(0.0, 'open', '開怪：Garuda 拉到東邊', () => {
    const a = openRot(fp('P1-F02'));
    a[H1] = [-0.5, 0]; a[H2] = [0.5, 0];
    return a;
  }, {
    MT: '在東邊（B）開怪，把 Garuda 拉到 B 邊緣、臉朝外（東），開減傷吃第一次 Slipstream。',
    OT: '站在 Garuda 背後（西側）約 (5,0)，不要進她的正面扇形。',
    H: '去正中間（1 號位）集合。寒風之歌可能點到你，留在原地即可。',
    D: '站在 Garuda 背後（西側）約 (5,0)，不要進她的正面扇形。',
  }, 'P1-F02 轉 90°');
  MV(6.0, 'songMT', 'MT 穿過 Garuda 擋歌', () => only(MT, rot2([0, -12.6], OPEN_ROT)), {
    MT: '穿過 Garuda 站到她正前方最近處約 (12.6,0)：寒風之歌的直線第一個必須是你，龍捲會生在你腳下。',
    def: '留在原位。寒風之歌會從 Garuda 穿過 MT 打向被點名的補師（在正中間），你站在直線上 MT 後方會被波及一點傷害。',
  }, 'P1-F03 轉 90°');
  MV(13.0, 'pull1', 'MT 拉 Garuda 到中心、面向 A', () => { const a = openRot(fp('P1-F04')); a[MT] = [0, -3.6]; return a; }, {
    MT: '把 Garuda 拉到中心，你站她北側 (0,-3.6)，讓她面向 A。',
    def: '離開龍捲（半徑 6.5，在 (12.6,0)）：站 (5,±2) 一帶，貼著龍捲邊緣但不要進去。接著移到 Garuda 背後（南、靠 C）。',
  }, 'P1-F04 轉 90°');
  MV(18.0, 'spiny', '刺羽與柔羽出現', () => flipAll(fp('P1-F05')), {
    MT: '站 Garuda 正前方（北）(0,-3.6)，讓她面向 A。',
    OT: '第一時間搶刺羽仇恨，站西側約 (-7,0) 把它拉住。',
    def: '站 Garuda 背後（南、靠 C）。柔羽（紫）會連線 M1/M2/R/C 並自動集中過來，之後用 AOE 打掉（本練習器自動處理）。',
  }, 'P1-F05 南北對調');
  MV(20.8, 'slipOut', 'MT 離開螺旋氣流', () => only(MT, [6.8, -3.6]), {
    MT: 'Garuda 讀條螺旋氣流：往東側走出扇形（讀條 2.5 秒）。',
    def: '原地不動。',
  }, 'P1-F05 南北對調');
  MV(23.2, 'slipBack', 'MT 回正面、OT 拉刺羽回中場', () => flipAll(fp('P1-F06')), {
    MT: '螺旋氣流結束後立刻回到 Garuda 正面（北）(0,-3.6)。',
    OT: '把刺羽拉回中場約 (0.6,2)。刺羽每次攻擊你會 +1 層低氣壓。',
    def: '原地（Garuda 背後），準備吃下行突風（MT 承受）。',
  }, 'P1-F06 南北對調');
  const leave = (idx, id, ov) => (S2) => {
    const a = fp(id, ov), sp = S2.s.rains[idx] || [];
    return a.map((p) => (p ? repel(p, sp, K.RAIN_R + 0.9) : p));
  };
  MV(34.15, 'leave1', '羽毛雨 ①：離開 1 號位', leave(0, 'P1-F07'), {
    MT: 'Garuda 上天的瞬間，場上 6 人腳下會被標羽毛雨：往南走到 (0,7)。',
    OT: '往西走到 (-9,0)，拉著刺羽（不要打死它）。',
    def: '往東離開 1 號位到約 (5,-2)，羽毛雨只有小範圍，走開 5 以上就安全。',
  }, 'P1-F07');
  MV(36.9, 'south1', '集合南側、躲刺羽爆炸', () => fp('P1-F09'), {
    MT: 'Garuda 回來：站她正面 (0,3)。',
    OT: '拉刺羽在西側 (-4.6,-0.6) 處被打死；你站 (2.3,-4.4)。',
    def: '集合到南側 (1,3.6)：刺羽死亡處會爆炸（半徑 5），要離它 5 以上。',
  }, 'P1-F09');
  MV(43.6, 'bubbleOT', 'OT 進高氣壓圈', () => fp('P1-F10', { 1: bub }), {
    OT: '高氣壓圈出現在 (-4.6,-0.6)：你有 2 層低氣壓，站進去停留 1.4 秒消除 → 充能 +1。',
    def: '在南側 (0.5,4) 集合，準備吃烈風刃。',
  }, 'P1-F10');
  MV(46.8, 'offBubble', 'OT 離開人群、其餘集合', () => fp('P1-F11'), {
    OT: '離開人群到 (5,-5)：不要被烈風刃命中（你已清空低氣壓）。',
    def: '全員在南側 (0,5.5) 集合吃第一次烈風刃：命中者 +1 層低氣壓。',
  }, 'P1-F11');
  MV(51.9, 'cleanse1', 'H1/H2/R/C 進圈消除 1 層', () => fp('P1-F12'), {
    H: '進高氣壓圈消除 1 層（不充能，全體約 4000）。',
    R: '進高氣壓圈消除 1 層（不充能）。', C: '進高氣壓圈消除 1 層（不充能）。',
    def: '留在南側，不要進圈（M1/M2/MT 需要保留層數）。',
  }, 'P1-F12');
  MV(54.4, 'stack2', '全員集合吃烈風刃 ②', () => fp('P1-F13', { M1: [1.4, 4.4], M2: [0.8, 4.9], H2: [1.6, 5.4] }), {
    def: '全員集合到南側 (0.5,4.5) 吃第二次烈風刃：MT、M1、M2 會疊到 2 層，其餘 1 層。',
  }, 'P1-F13', { spread: true });
  MV(58.9, 'm1enter', 'M1 先進圈', () => fp('P1-F14', { M1: bub, M2: [-2.0, -6.1] }), {
    M1: '進高氣壓圈停留 1.4 秒：2 層 → 充能 +1（全體約 25000）。',
    M2: '先在圈北側 (-2,-6) 等，M1 結束後再進。',
    def: '留在南側，治療準備補血。',
  }, 'P1-F14');
  MV(61.6, 'm2enter', 'M2 進圈', () => only(M2, bub), {
    M2: '進高氣壓圈停留 1.4 秒：2 層 → 充能 +1。',
    def: '留在南側。',
  }, 'P1-F14');
  MV(63.8, 'stack3', '全員 1 號位集中', () => all([0, 2.0]), { def: '全員回中心 1 號位集合（Garuda 即將上天）。' }, 'P1-F14', { spread: true });
  MV(69.05, 'leave2', '羽毛雨 ②：往東離開', leave(1, 'P1-F15'), {
    def: 'Garuda 上天的瞬間按圖往東散開（約 x=4~9），離開 1 號位 5 以上。',
  }, 'P1-F15');
  MV(72.4, 'stack4', '集中、大氣爆發', () => all([0, 2.0]), { def: '回 1 號位集合，準備大氣爆發（全體攻擊）。' }, 'P1-F16', { spread: true });
  MV(90.05, 'leave3', '分身羽毛雨：離開', leave(2, 'P1-F17'), {
    MT: '把 Garuda 往東北（A、B 之間）拉。',
    def: '分身上天瞬間按圖往東側散開，離開 1 號位。',
  }, 'P1-F17');
  MV(92.3, 'apart', '分身登場、點名出現', () => fp('P1-F18'), {
    MT: '移動到 Garuda 背後（東北邊緣）。',
    OT: '準備擋歌，先往東北靠近。',
    def: 'H1/H2/R/C 回中心 1 號位集合；M1/M2 稍後也進來。',
  }, 'P1-F18');
  MV(94.8, 'block', 'MT/OT 擋寒風之歌', (S2) => {
    const tb = cloneTankBearings(S2.roll.cloneBearings[0], S2.roll.cloneBearings[1]);
    const a = fp('P1-F19');
    const m = atBearing(tb.mt, K.RING_TANK), o = atBearing(tb.ot, K.RING_TANK);
    a[MT] = [m.x, m.z]; a[OT] = [o.x, o.z];
    return a;
  }, {
    T: '依分身方位站到半徑 10.4 處擋歌：兩隻在 A/B 與 C/D 各一 → MT 擋 A/B 那隻、OT 擋 C/D 那隻；都在 A/B → MT 擋 A、OT 擋 B；都在 C/D → MT 擋 C、OT 擋 D。',
    def: '全員在 1 號位集中，讓兩位坦克站在你和分身之間。台風眼的外環（12 以外）會致死。',
  }, 'P1-F19', { preview: false });
  // 分身羽毛雨 ④：離開方向要避開兩顆龍捲（攻略：圖示不唯一），坦克沿外圈繞開中心
  const leave4Plan = (S2) => {
    const tb = cloneTankBearings(S2.roll.cloneBearings[0], S2.roll.cloneBearings[1]);
    const torn = [atBearing(tb.mt, K.RING_TANK), atBearing(tb.ot, K.RING_TANK)];
    let best = 80, bs = -1e9;
    for (let k = 0; k < 8; k++) {
      const b = k * 45, p = atBearing(b, 7);
      const d = Math.min(...torn.map((t) => Math.hypot(p.x - t.x, p.z - t.z)));
      let dev = Math.abs(b - 80); if (dev > 180) dev = 360 - dev;
      const sc = d - dev * 0.02;
      if (sc > bs) { bs = sc; best = b; }
    }
    const rot = best - 80, sp = S2.s.rains[3] || [];
    const a = fp('P1-F22');
    const fin = a.map((p, i) => (i === MT ? p : repel(rot2(p, rot), sp, K.RAIN_R + 0.9)));
    return { fin, torn };
  };
  MV(101.45, 'leave4', '分身羽毛雨：離開', (S2) => {
    const { fin } = leave4Plan(S2);
    const out = fin.map((p, i) => (isTank(i) ? null : p));
    for (const i of [MT, OT]) {
      const from = [S2.chars[i].pos.x, S2.chars[i].pos.z], via = viaRim(from, fin[i]);
      out[i] = via || fin[i];
    }
    return out;
  }, {
    def: '分身上天瞬間，往「遠離兩顆龍捲」的方向散開（約 6~9，圖示不唯一）；坦克腳下會生成大龍卷風（半徑 6.5）。',
    T: '沿外圈繞開中心走（不要穿過人群原本的位置），MT 去 Garuda 旁、OT 跟人群。',
  }, 'P1-F22');
  MV(103.3, 'leave4b', '坦克就位', (S2) => { const { fin } = leave4Plan(S2); const a = Array(8).fill(null); a[MT] = fin[MT]; a[OT] = fin[OT]; return a; }, {
    T: '繞到定位：MT 站 Garuda 旁（東北），OT 與人群會合。', def: '留在原位。',
  }, 'P1-F22', { preview: false });
  MV(108.0, 'pull2', 'MT 把 Garuda 拉回 1 號位', () => fp('P1-F24'), {
    MT: '把 Garuda 拉到 1 號位，就近面向 B 或 D（東/西），你站在她面前。',
    def: '除 MT 外全員集中在 Garuda 背後（西側）。柔羽會自動集中，用 AOE 打掉。',
  }, 'P1-F24');
  MV(118.9, 'mtBehind', 'MT 繞到背後躲螺旋氣流', () => fp('P1-F26'), {
    MT: '螺旋氣流讀條：移動到 Garuda 背後（西側）躲開。',
    def: '全員在 Garuda 背後集合，等待中高壓連線。',
  }, 'P1-F26');
  for (let t = 119.7; t < 123.95; t += 0.3) {
    MV(Math.round(t * 100) / 100, 'meso', '中高壓擋線', (S2) => {
      const a = fp('P1-F28');
      const th = S2.s.meso || [];
      const wTh = th.find((x) => x.clone === S2.s.clones[0]), eTh = th.find((x) => x.clone === S2.s.clones[1]);
      const hold = (mt, def, fromClone, d, holderSlot, self) => {
        if (!mt || mt.holder === self) return def;
        const c = mt.clone.pos, h = S2.chars[mt.holder].pos;
        const L = Math.hypot(h.x - c.x, h.z - c.z) || 1;
        return [c.x + (h.x - c.x) / L * d, c.z + (h.z - c.z) / L * d];
      };
      a[MT] = S2.t < 121.35 ? [-3.9, 0] : hold(eTh, [5.9, -0.2], null, 13.9, 0, MT);
      a[RR] = hold(wTh, [-11.2, 0], null, 8.6, 0, RR);
      return a;
    }, {
      MT: '等螺旋氣流結束，站到東側連線上（約離東側分身 14）擋線；你有 2 層低氣壓 → 第 4 次充能。',
      R: '站到西側連線上（約離西側分身 8.6）擋線；你有 1 層低氣壓，只消除不充能。',
      def: '留在 Garuda 背後的人群，離擋線者 3 以上。',
    }, 'P1-F28', { jitter: false, preview: false });
  }
  MV(126.9, 'leave5', '分身羽毛雨：離開', leave(4, 'P1-F31'), {
    MT: '把 Garuda 往東拉到 (6.3,0)，你站她東側 (10.8,0)。',
    def: '分身上天瞬間按圖小幅散開（約 3~4）：不要留在原位。',
  }, 'P1-F31');
  MV(138.7, 'mtBehind2', 'MT 繞背躲螺旋氣流', () => only(MT, [3.0, -0.4]), {
    MT: '螺旋氣流讀條：繞到 Garuda 背後（西側）。', def: '留在原位。',
  }, 'P1-F32');
  MV(146.5, 'wheelWait', '覺醒邪輪旋風：先在外面', () => fp('P1-F33'), {
    def: '邪輪旋風（覺醒）讀條：第 1 段是 Garuda 腳下圓形（半徑 8.4），先站在圈外。',
  }, 'P1-F33');
  MV(149.4, 'wheelIn', '圈消失後立刻貼近 Garuda', () => fp('P1-F34'), {
    def: '第 1 段圈消失的瞬間立刻跑向 Garuda（6.5 以內）：第 2 段是無預警的環形範圍。',
  }, 'P1-F34');
  MV(151.0, 'wheelIn2', '待在 Garuda 身邊', () => fp('P1-F35'), { def: '待在 Garuda 6.5 以內，等第 2 段結束。' }, 'P1-F35');
  MV(152.3, 'share', '覺醒下行突風：8 人分攤', () => {
    const a = all([10.8, 0]);
    a[MT] = [10.8, -0.4]; a[OT] = [9.0, 0.4]; a[H1] = [9.4, -1.6]; a[H2] = [9.8, 1.4]; a[M1] = [11.6, -2.0]; a[M2] = [11.8, 1.6]; a[RR] = [12.6, 0]; a[CC] = [13.0, -1.2];
    return a;
  }, {
    MT: '站 Garuda 東側前方 (10.8,0)，全員要站進她的正面扇形一起分攤（8 人，各約 30000）。',
    def: '站進 Garuda 正面扇形（跟 MT 站一起）分攤。少於 8 人分攤會很痛，少於 4 人會死。',
  }, 'P1-F36');
  MV(154.8, 'mtThrough', 'MT 穿過 Garuda', () => only(MT, [-3.0, -0.4]), {
    MT: '分攤後穿過 Garuda 到西側，讓人群（東側）在她背後。', def: '留在原位（Garuda 背後）。',
  }, 'P1-F36');
  MV(158.7, 'mtBehind3', 'MT 繞背躲螺旋氣流', () => only(MT, [9.0, -0.4]), {
    MT: '螺旋氣流讀條：繞到 Garuda 背後（東側）。', def: '留在 Garuda 背後（東側）。',
  }, 'P1-F37');
  MV(164.0, 'shard', 'M2 撿碎片', () => (S.s.shard ? only(M2, [S.s.shard.pos.x, S.s.shard.pos.z]) : Array(8).fill(null)), {
    M2: 'Garuda 被擊殺後掉落突破極限碎片：M2 去拾起（P4 過渡用）。', def: '原地。',
  }, 'P1-F37', { preview: false });
}

function tick(S, dt) {
  const s = S.s;
  const g = s.garuda;
  if (g && S.t >= 0 && g.visible && !g.dead && g.targetable) { const m = S.mainTank(); g.rot = Math.atan2(m.pos.x - g.pos.x, m.pos.z - g.pos.z); }
  for (const p of S.actors) {
    if (p.look !== 'plume' || p.dead || !p.drain) continue;
    p.hp = Math.max(0, p.hp - p.drain * dt);
    if (S.t >= p.killAt) S.despawn(p);
  }
  const b = s.bubble;
  if (!b || !b.active) return;
  for (const c of S.chars) {
    if (!c.alive) continue;
    if (c.thermal > 0 && inCircle(c.pos, b, b.r)) {
      c.dwell += dt;
      if (c.dwell >= K.BUBBLE_SEC) { c.dwell = 0; s.cleanse(c, 'bubble'); }
    } else c.dwell = 0;
  }
}

function objectives(S, slot) {
  const c = S.chars[slot], st = c.stats, k = c.slot, s = S.s, out = [];
  out.push({ ok: c.alive, text: '全程存活' });
  if (k === MT) {
    out.push({ ok: (st.intercepts || 0) >= 2, text: '擋下開場寒風之歌與一條分身寒風之歌' });
    out.push({ ok: (st.mesoCharge || 0) >= 1, text: '擋東側中高壓連線並消除 2 層（第 4 次充能）' });
  }
  if (k === OT) {
    out.push({ ok: (st.bubbleCharge || 0) >= 1, text: '以刺羽的 2 層低氣壓進高氣壓圈充能' });
    out.push({ ok: (st.intercepts || 0) >= 1, text: '擋下一條分身寒風之歌' });
  }
  if (k === M1 || k === M2) out.push({ ok: (st.bubbleCharge || 0) >= 1, text: '烈風刃兩次後進高氣壓圈，2 層消除（充能 +1）' });
  if (k === H1 || k === H2 || k === CC) out.push({ ok: (st.bubbleClean || 0) >= 1, text: '第一次烈風刃後進圈消除 1 層' });
  if (k === RR) {
    out.push({ ok: (st.bubbleClean || 0) >= 1, text: '第一次烈風刃後進圈消除 1 層' });
    out.push({ ok: (st.mesoClean || 0) >= 1, text: '擋西側中高壓連線並消除' });
  }
  if (k === M2) out.push({ ok: !!st.shard, text: '拾起突破極限碎片' });
  out.push({ ok: !st.shareMiss, text: '覺醒下行突風：站進扇形分攤' });
  out.push({ ok: !!s.woken, text: `Garuda 覺醒（充能 ${s.charges || 0}/${K.CHARGES}）` });
  return out;
}

const CHECKPOINTS = [
  { t: 0, name: '開場：寒風之歌／螺旋氣流／大龍卷風' },
  { t: 17, name: '刺羽＋柔羽、下行突風' },
  { t: 32, name: '羽毛雨 ①＋刺羽爆炸' },
  { t: 42, name: '高氣壓圈＋烈風刃 ×2' },
  { t: 67, name: '羽毛雨 ②＋大氣爆發' },
  { t: 86.5, name: '分身登場：台風眼／邪輪旋風' },
  { t: 106.5, name: '第二批柔羽＋中高壓' },
  { t: 136, name: '覺醒後：邪輪旋風／下行突風' },
];

const CUES = [
  [0, '開怪：MT 在東邊（B）把 Garuda 拉到 B 邊緣、臉朝外；補師去正中間'],
  [5.2, '寒風之歌點名補師：直線，MT 要站在線上最前方'],
  [5.3, '螺旋氣流：正面扇形，只有坦克能吃（MT 開減傷）'],
  [10.3, '寒風之歌判定 → MT 腳下生成大龍卷風（連續 3 輪）'],
  [13.4, '大龍卷風：整隊貼邊離開，MT 把 Garuda 拉到中心'],
  [20.3, '刺羽 ×1（OT 拉）與柔羽 ×4（連線 M1/M2/R/C）出現'],
  [20.6, '螺旋氣流：MT 離開正面，結束後回正面'],
  [26.6, '下行突風：正面扇形，MT 承受'],
  [33.9, 'Garuda 上天瞬間，6 人腳下標羽毛雨 → 立刻離開 1 號位'],
  [38.2, '刺羽死亡處爆炸（半徑 5）＋寒風之嘯全體攻擊'],
  [43.5, '高氣壓圈出現：OT 帶 2 層低氣壓進去充能'],
  [48.7, '烈風刃 ①：集合吃，OT 先離開'],
  [52.0, 'H1/H2/R/C 進圈消除 1 層（不充能）'],
  [54.8, '烈風刃 ②：全員集合，MT/M1/M2 疊到 2 層'],
  [59.0, 'M1 先進圈、M2 後進，各充能 +1'],
  [68.9, '羽毛雨 ②：Garuda 上天瞬間離開'],
  [73.2, '大氣爆發：全體攻擊'],
  [89.9, '分身上天 → 羽毛雨（4 人）立刻離開'],
  [94.0, '分身寒風之歌點名 2 名非坦克：MT/OT 依方位擋線'],
  [96.6, '台風眼（外環 12+）＋邪輪旋風（Garuda 腳下）：人群在中心'],
  [101.3, '分身羽毛雨（4 人）→ 離開 1 號位'],
  [110.8, '第二批柔羽：MT 把 Garuda 拉到中心，人群在她背後'],
  [118.8, '螺旋氣流：MT 繞背'],
  [119.6, '中高壓連線：MT 擋東側、R 擋西側（需有低氣壓）'],
  [124.7, '下行突風＋中高壓判定：MT 的 2 層是第 4 次充能 → 覺醒'],
  [126.7, '分身羽毛雨（4 人）→ 小幅散開'],
  [138.6, '螺旋氣流：MT 繞背'],
  [146.6, '覺醒邪輪旋風：圈消失立刻貼近 Garuda 躲環形'],
  [152.1, '覺醒下行突風：8 人站進扇形分攤；之後 MT 穿過 Garuda'],
  [158.6, '螺旋氣流：MT 繞背'],
  [163.5, '擊殺 Garuda：M2 拾起突破極限碎片'],
];

const ROLE_DESC = [
  '開怪前站東邊（B）；0:00 開怪，把 Garuda 拉到 B（東）邊緣、臉朝外，吃第一次螺旋氣流與寒風之歌（站在線最前方，龍捲生在你腳下）。之後負責拉 Garuda 位置、躲螺旋氣流、承受下行突風。分身階段依分身方位擋一條歌；中高壓連線你擋東側（你有 2 層低氣壓，是第 4 次充能）。',
  '開怪前站東邊（B）集合，開怪後站 Garuda 背後。搶刺羽仇恨並把它拉到西側打死；你有 2 層低氣壓，高氣壓圈出現後第一個進去（第 1 次充能）。分身階段依方位擋另一條寒風之歌。',
  '開怪前站南邊（C），開怪後去正中間（1 號位）集合；之後跟隊伍站位、躲羽毛雨；第一次烈風刃後進高氣壓圈消除 1 層（不充能）。開場可能被點寒風之歌。',
  '開怪前站南邊（C），開怪後去正中間（1 號位）集合；之後跟隊伍站位、躲羽毛雨；第一次烈風刃後進高氣壓圈消除 1 層（不充能）。開場可能被點寒風之歌。',
  '開怪前東邊（B）集合。兩次烈風刃都吃（2 層），第 59 秒左右第一個進高氣壓圈消除（第 2 次充能）。柔羽會連線你。',
  '開怪前東邊（B）集合。兩次烈風刃都吃（2 層），第 62 秒左右在 M1 之後進高氣壓圈消除（第 3 次充能）。結尾拾起突破極限碎片。',
  '開怪前東邊（B）集合。第一次烈風刃後進圈消除 1 層；中高壓連線你擋西側（1 層，只消除）。柔羽會連線你。',
  '開怪前東邊（B）集合。第一次烈風刃後進圈消除 1 層。柔羽會連線你。',
];

PHASES.p1 = {
  id: 'p1', name: 'P1 迦樓羅', short: '迦樓羅', preRoll: -5, end: K.END, maxCharges: K.CHARGES, chargeLabel: '覺醒',
  bossLook: 'garuda', bossR: 3,
  checkpoints: CHECKPOINTS, cues: CUES, roleDesc: ROLE_DESC,
  roll, setup, build, tick, objectives,
  start: spawnSpots,
  rollSummary: (r) => [
    `開場寒風之歌：${ROLES[r.songTarget].key}　烈風刃：${ROLES[r.frictionTargets[0]].key}、${ROLES[r.frictionTargets[1]].key}`,
    `分身方位：${['A（北）', 'B（東）', 'C（南）', 'D（西）'][r.cloneBearings[0] / 90]}、${['A（北）', 'B（東）', 'C（南）', 'D（西）'][r.cloneBearings[1] / 90]}　分身歌目標：${ROLES[r.cloneSongTargets[0]].key}、${ROLES[r.cloneSongTargets[1]].key}`,
    `中高壓連線對象：${ROLES[r.mesoOrder[0]].key}、${ROLES[r.mesoOrder[1]].key}`,
  ],
};
root.UWU_P1 = { K, cloneTankBearings, BUBBLE_AT };
})(typeof window !== 'undefined' ? window : globalThis);
