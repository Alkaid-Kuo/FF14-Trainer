/* P4 究極神兵（第一部分）：P4A 拉哈布雷亞＋P4B 追擊之究極幻想。站位／分工：攻略 P4A-F01~F08、P4B-F02~F26
   （由攻略的文字座標換算，gen/extract_md.py）。職位對應：戰=MT 騎=OT 白=H1 學=H2 龍=M1 忍=M2 詩=R 召=C。
   時間：P4A 照攻略；究極之後的過場動畫（0:57～1:34）縮短成 4 秒，P4B 的 0:00＝本階段 1:01。
   P4A 的重點是極限技：C 法系 LB3（浮游炮）、H1 治療 LB3（死亡宣告）、M2 近戰 LB3（拉哈布雷亞）、OT 坦克 LB3（究極）；
   負責的職位是真人時要自己按（時機錯就團滅），是 AI 時照攻略的時間自動使用。
   隨機：追擊之究極幻想時迦樓羅／伊弗利特／泰坦／究極神兵的出現位置、地裂的目標、火獄之鎖的 DPS。
   判定範圍是估計值（攻略圖不是按比例畫的）。 */
(function (root) {
'use strict';
const U = root.UWU;
const { PHASES, ROLES, isTank, inCircle, inRect, atBearing, bearingOf, mulberry32, dist, ENMITY } = U;
const { MT, OT, H1, H2, M1, M2, RR, CC } = U;
const PI = Math.PI;
const FR = U.FRAMES;

const B = 61;                 // P4B 的 0:00 在本階段的秒數
const tb = (s) => B + s;
const K = {
  END: B + 96,
  MISSILE_R: 10, MISSILE_D: 17, BITS_BOOM: 19, CASTER_LB_HIT: 4, MELEE_LB_HIT: 5,
  STICKY_R: 5, LASER_R: 4.5, VENT_R: 14,
  WHEEL_R: 8.4, WHEEL_IN2: 6.5, WHEEL_OUT2: 20, LANE_HALF: 9, CROSS_HALF: 5,
  LS_W: 4.2, LS_LEN: 40, PLUME_R: 8, ERUPT_R: 8, RAIN_R: 2, BOMB_R: 4, IMPACT_R: 2.5, CLONE_WHEEL_R: 6.5, FETTER_D: 14,
  PLAN_R: 17.2, PLAN_MARGIN: 1.3,
};
/** P4A 的極限技：誰負責、什麼種類、什麼時候（from～by 之間按），AI 在 ai 秒使用。 */
const LB_TASKS = [
  { kind: 'caster', slot: CC, from: 8.5, ai: 9.0, by: 14.5, what: '0:09～0:14 法系 LB3（萬億核爆）：擊殺魔導浮游炮' },
  { kind: 'healer', slot: H1, from: 26.0, ai: 26.1, by: 30.5, what: '0:26～0:30 治療 LB3（生命鼓動）：解除死亡宣告' },
  { kind: 'melee', slot: M2, from: 38.0, ai: 38.3, by: 40.5, what: '0:38～0:40 近戰 LB3（月遁血祭）：擊殺拉哈布雷亞' },
  { kind: 'tank', slot: OT, from: 48.0, ai: 48.3, by: 56.5, what: '0:48～0:56 坦克 LB3（終極堡壘）：扛下究極' },
];
/** 極限技槽（攻略）：[時間, 格數]。 */
const LB_SET = [[0, 3], [21, 0], [25, 3], [36, 0], [38, 3], [46, 0], [48, 3]];
const W1 = [0, PI / 4, -PI / 4, PI / 2, -PI / 2], W2 = [PI / 8, -PI / 8, 3 * PI / 8, -3 * PI / 8, PI];
// 泰坦的爆破岩石（攻略：泰坦在西北），依序落在場中一圈
const BOMBS = [[-4.8, -5.8], [4.0, -5.8], [7.4, 0], [4.0, 5.6], [-4.2, 5.6], [-7.4, 0]];

const fp = (id) => { const f = FR[id].pos; return ROLES.map((r) => (f[r.key] ? f[r.key].slice() : null)); };
const all = (p) => ROLES.map(() => p.slice());
const only = (list) => { const a = Array(8).fill(null); for (const [s, p] of list) a[s] = p; return a; };
const tipf = (m) => (slot) => {
  const r = ROLES[slot];
  const v = m[r.key];
  if (v !== undefined) return v;
  const g = r.kind === 'tank' ? m.T : r.kind === 'healer' ? m.H : m.D;
  return g !== undefined ? g : (m.def || '');
};
const xz = (p) => ({ x: p[0], z: p[1] });
/** 繞場中心轉 deg 度（順時針為正，跟方位角一樣）。 */
const turn = (p, deg) => { const b = bearingOf(xz(p)) + deg, r = Math.hypot(p[0], p[1]), q = atBearing(b, r); return [q.x, q.z]; };

function roll(seed) {
  const rng = mulberry32(seed), pick = (a) => a[Math.floor(rng() * a.length)];
  const ifr = Math.floor(rng() * 4);
  const ultChoices = [0, 1, 2, 3].filter((k) => k !== ifr);
  return {
    seed,
    // 追擊之究極幻想：迦樓羅在 1 號位偏向某個斜點、伊弗利特在場外斜點、泰坦在正點兩側、究極神兵在另一個斜點
    pg: 45 + 90 * Math.floor(rng() * 4), pi: 45 + 90 * ifr, pt: 90 * Math.floor(rng() * 4) + pick([-10, 10]), pu: 45 + 90 * pick(ultChoices),
    fettersDps: pick([M1, M2, RR, CC]),
    ls: [rng(), rng(), rng()],
    lsTargets: [],
  };
}

function setup(S) {
  const s = S.s;
  s.tank = MT; s.faceTank = false;
  s.ultima = S.actor('ultima', '究極神兵', 0, -9.2, 0);
  s.ultima.visible = false; s.ultima.targetable = false;
  s.bits = []; s.laha = null; s.garuda = null; s.ifrit = null; s.titan = null; s.clones = [];
  s.charges = 0; s.woken = false;
}

function build(S) {
  const R = S.roll, s = S.s, at = (t, fn) => S.at(t, fn);
  const ult = s.ultima;
  const raid = (name, pct, power) => { S.screenFx.push({ t: S.t, type: 'raidwide', power }); S.recordRaid(name, pct); for (const c of S.alive()) S.damage(c, pct, name, true); };
  /** 團滅（機制沒處理好）：立即重來模式記為該職位的失誤；繼續打模式全員倒地。 */
  const wipe = (slot, cause) => { S.mistake(slot, cause); for (const c of S.alive()) S.kill(c, cause, { force: true }); };
  const lbUsed = (task) => S.lbLog.find((l) => l.kind === task.kind && l.lv >= 3 && l.t >= task.from - 0.6 && l.t <= task.by);
  const offTank = () => { const main = S.mainTank(); const o = S.chars[main.slot === MT ? OT : MT]; return o.alive ? o : S.chars[ENMITY.find((k) => k !== main.slot && S.chars[k].alive) || main.slot]; };
  const face = (a, p) => { a.rot = Math.atan2(p.x - a.pos.x, p.z - a.pos.z); };
  const show = (a, on) => { a.visible = on; };

  // ---------------------------------------------------------------- P4A：拉哈布雷亞（極限技）
  for (const [t, v] of LB_SET) at(t, () => { S.lb = v; if (v) S.log('極限技槽回復滿'); });
  at(0.0, () => S.log('泰坦消失。全員 1 號位集合，治療奶滿'));
  // 誘導爆炸：A／B／C／D 四顆導彈，離落點越近越痛（場中央不致死）
  for (const b of [0, 90, 180, 270]) {
    const p = atBearing(b, K.MISSILE_D);
    S.hazard({ t0: 3.0, tRes: 9.0, kind: 'circle', label: '誘導爆炸', geom: { x: p.x, z: p.z, r: K.MISSILE_R }, killMsg: '被誘導爆炸擊中：離落點太近（要站在場地中央）' });
  }
  at(3.0, () => S.log('A、B、C、D 出現 4 個導彈落點：全員待在 1 號位'));
  [9.0, 9.25, 9.5, 9.75].forEach((t) => at(t, () => raid('誘導爆炸', 8, 0.5)));
  // 魔導浮游炮：出現後立刻讀條自爆，讀條結束前要擊殺（C 的法系 LB3）
  at(11.0, () => {
    s.bits = Object.values(FR['P4A-F04'].ents).map((p) => { const a = S.actor('bit', '魔導浮游炮', p[0], p[1], 0); a.rot = Math.atan2(-p[0], -p[1]); return a; });
    S.cast('魔導浮游炮', '自爆', 11.0, K.BITS_BOOM - 11.0);
    S.log('6 個魔導浮游炮出現並讀條自爆：讀條結束前要擊殺');
  });
  at(K.BITS_BOOM, () => {
    if (s.bitsDown) return;
    for (const b of s.bits) S.despawn(b);
    S.screenFx.push({ t: S.t, type: 'raidwide', power: 1 });
    wipe(CC, '魔導浮游炮自爆：沒有在讀條結束前擊殺（C 要在 0:09～0:14 用法系 LB3）');
  });
  // 拉哈布雷亞：死亡宣告（治療 LB3 才能解除）＋擊倒（5 秒無法行動）
  at(20.5, () => S.cast('拉哈布雷亞', '死亡宣告', 20.5, 1.5));
  at(22.0, () => {
    for (const c of S.alive()) { S.addStatus(c.slot, 'doom', 9); S.addStatus(c.slot, 'down', 4); c.stunUntil = 26; c.goal = null; c.cast = null; }
    S.log('拉哈布雷亞：全員死亡宣告（9 秒）＋擊倒，H1 擊倒結束後立刻用治療 LB3');
  });
  at(23.0, () => { for (const c of S.alive()) c.hp = 1; S.log('拉哈布雷亞把全員 HP 扣為 1'); });
  at(31.0, () => { for (const c of S.alive()) if (S.hasStatus(c.slot, 'doom')) S.kill(c, '死亡宣告：沒有被治療 LB3 解除（H1 要在 0:26～0:30 使用）', { force: true }); });
  // 拉哈布雷亞本體：讀條冥暗 15 秒，結束前要用近戰 LB3 擊殺
  at(31.0, () => {
    s.laha = S.actor('lahabrea', '拉哈布雷亞', 0.6, -0.4, PI);
    S.cast('拉哈布雷亞', '冥暗', 31.0, 15.0);
    S.log('拉哈布雷亞出現並讀條冥暗（15 秒後全滅）：M2 用近戰 LB3 擊殺');
  });
  at(46.0, () => { if (s.laha && !s.laha.dead) { S.despawn(s.laha); wipe(M2, '冥暗：拉哈布雷亞沒有被擊殺（M2 要在 0:38～0:40 用近戰 LB3）'); } });
  // 究極神兵：究極（全屏超高額傷害）要開坦克 LB3 扛
  at(48.0, () => { show(ult, true); ult.pos.x = 0; ult.pos.z = -9.2; ult.rot = 0; S.log('究極神兵出現（不可選中）：OT 開坦克 LB3'); });
  at(51.0, () => { S.cast('究極神兵', '究極', 51.0, 6.0); });
  at(57.0, () => {
    S.screenFx.push({ t: S.t, type: 'raidwide', power: 1 });
    for (const c of S.alive()) {
      if (S.hasStatus(c.slot, 'lbtank')) S.damage(c, 60, '究極（坦克 LB3 減傷）', true);
      else S.kill(c, '究極：沒有坦克 LB3 的減傷（OT 要在 0:48～0:56 使用）', { force: true });
    }
  });
  at(57.4, () => { show(ult, false); S.log('（究極之後的過場動畫 0:57～1:34 省略）'); });
  at(60.0, () => { for (const c of S.alive()) c.hp = 100; });
  // AI 照攻略的時間用極限技（負責的人倒地時，由同種類的 AI 代替）
  for (const task of LB_TASKS) {
    at(task.ai, () => {
      const owner = S.chars[task.slot];
      if (owner.alive && !owner.auto) return;   // 真人負責：自己按
      const c = owner.alive ? owner : S.chars.find((x) => x.alive && x.auto && U.LB_KIND[x.slot] === task.kind);
      if (!c) return;
      S.aiFree(c);
      S.useSkill(c.slot, 'lb');
    });
  }

  // ---------------------------------------------------------------- P4B：追擊之究極幻想
  at(tb(-0.5), () => { show(ult, true); ult.pos.x = 0; ult.pos.z = -7.8; ult.rot = 0; });
  at(tb(0), () => { ult.targetable = true; s.faceTank = true; S.cast('究極神兵', '魔導核爆', tb(0), 3.0); S.expect('raid', tb(4)); S.log('究極神兵可以選中'); });
  at(tb(4), () => raid('魔導核爆', 30, 0.8));
  // 吸附以太炸彈（主仇）＋誘導射線（第 2 仇恨）
  const sticky = (t0, tHit, tBoom) => {
    let holder = null;
    S.hazard({
      t0, tRes: tHit, kind: 'circle', label: '吸附以太炸彈', tankSafe: true, tankDmg: 30,
      geom: () => { holder = S.mainTank(); return { x: holder.pos.x, z: holder.pos.z, r: K.STICKY_R, npcIgnore: [holder.slot] }; },
      follow: (f) => { f.x = holder.pos.x; f.z = holder.pos.z; },
      castBy: ['究極神兵', '吸附以太炸彈', tHit - t0],
      killMsg: '被吸附以太炸彈波及：MT 要遠離人群',
      onResolve: (list) => { if (list.some((c) => c !== holder)) holder.stats.stickyHits = (holder.stats.stickyHits || 0) + 1; if (holder.alive) S.addStatus(holder.slot, 'sticky', tBoom - tHit); },
    });
    S.hazard({
      t0: tBoom - 2.5, tRes: tBoom, kind: 'circle', label: '吸附式炸彈（爆炸）', tankSafe: true, tankDmg: 50, buster: true,
      geom: () => ({ x: holder.pos.x, z: holder.pos.z, r: K.STICKY_R, npcIgnore: [holder.slot] }),
      follow: (f) => { f.x = holder.pos.x; f.z = holder.pos.z; },
      killMsg: '被吸附式炸彈的爆炸波及：要離 MT 遠一點',
      onResolve: (list) => { if (list.some((c) => c !== holder)) holder.stats.stickyHits = (holder.stats.stickyHits || 0) + 1; },
    });
  };
  const laser = (t0, tRes) => {
    let tg = null;
    S.hazard({
      t0, omen: t0, tRes, kind: 'circle', label: '誘導射線', tankSafe: true, tankDmg: 60, buster: true,
      geom: () => { tg = offTank(); return { x: tg.pos.x, z: tg.pos.z, r: K.LASER_R, npcIgnore: [tg.slot] }; },
      follow: (f) => { f.x = tg.pos.x; f.z = tg.pos.z; },
      castBy: ['究極神兵', '誘導射線', 2.0],
      killMsg: '被誘導射線波及：第 2 仇恨的坦克要遠離人群',
      onResolve: (list) => { if (list.some((c) => c !== tg)) tg.stats.laserHits = (tg.stats.laserHits || 0) + 1; },
    });
  };
  sticky(tb(8.2), tb(9), tb(17));
  laser(tb(9), tb(14));
  // 追擊之究極幻想：四個召喚獸同時出招
  at(tb(20), () => S.cast('究極神兵', '追擊之究極幻想', tb(20), 2.0));
  at(tb(27), () => { ult.targetable = false; s.faceTank = false; });
  at(tb(29), () => {
    const g = atBearing(R.pg, 5.5), i = atBearing(R.pi, 20.2), ti = atBearing(R.pt, 19.7), u = atBearing(R.pu, 20.6);
    s.garuda = S.actor('garuda', 'Garuda', g.x, g.z, 0); s.garuda.targetable = false;
    s.ifrit = S.actor('ifrit', '伊弗利特', i.x, i.z, 0); s.ifrit.targetable = false;
    s.titan = S.actor('titan', '泰坦', ti.x, ti.z, 0); s.titan.targetable = false;
    ult.pos.x = u.x; ult.pos.z = u.z;
    for (const a of [s.garuda, s.ifrit, s.titan, ult]) face(a, { x: 0, z: 0 });
    S.log('迦樓羅、伊弗利特、泰坦、究極神兵出現在場地周圍：先找迦樓羅，去離她遠、沒有泰坦的正點', -1, true);
  });
  const plan = () => s.plan || (s.plan = predationPlan(S));
  // 迦樓羅：邪輪旋風（覺醒）第 1 段圓形、第 2 段大環形（無預警）
  S.hazard({ t0: tb(34), tRes: tb(38), snap: tb(37), kind: 'circle', label: '邪輪旋風（覺醒）第 1 段', castBy: ['Garuda', '邪輪旋風（覺醒）', 3.0],
    geom: () => ({ x: s.garuda.pos.x, z: s.garuda.pos.z, r: K.WHEEL_R }), killMsg: '被邪輪旋風第 1 段（迦樓羅腳下）擊中' });
  S.hazard({ t0: tb(38), omen: tb(39.85), assistFrom: tb(38), tRes: tb(40), kind: 'ring', label: '邪輪旋風第 2 段（環形，無預警）',
    geom: () => ({ x: s.garuda.pos.x, z: s.garuda.pos.z, inner: K.WHEEL_IN2, r: K.WHEEL_OUT2 }), killMsg: '被邪輪旋風第 2 段（環形）擊中：要站在離迦樓羅很遠的場邊' });
  // 伊弗利特：深紅旋風（覺醒）俯衝＋十字火焰（減傷足夠，不致死）
  S.hazard({ t0: tb(34), tRes: tb(37), kind: 'rect', label: '深紅旋風（覺醒）', castBy: ['伊弗利特', '深紅旋風（覺醒）', 3.0],
    geom: () => ({ x: s.ifrit.pos.x, z: s.ifrit.pos.z, rot: Math.atan2(-s.ifrit.pos.x, -s.ifrit.pos.z), w: K.LANE_HALF * 2, len: 44 }), killMsg: '被深紅旋風（俯衝線）擊中' });
  at(tb(36.9), () => { const o = atBearing(R.pi + 180, 20.2); s.ifrit.moveTo(o.x, o.z, 180); });
  at(tb(37.2), () => { const o = atBearing(R.pi + 180, 20.2); s.ifrit.pos.x = o.x; s.ifrit.pos.z = o.z; s.ifrit.goal = null; face(s.ifrit, { x: 0, z: 0 }); });
  for (const off of [-45, 45]) {
    S.hazard({ t0: tb(38), omen: tb(39.5), assistFrom: tb(38), tRes: tb(40), kind: 'rect', label: '十字火焰（減傷足夠，不致死）', noKill: true, tint: 'line',
      geom: () => { const e = atBearing(R.pi + 180 + off, 20); return { x: e.x, z: e.z, rot: Math.atan2(-e.x, -e.z), w: K.CROSS_HALF * 2, len: 44, harmless: true }; },
      onResolve: (list) => { for (const c of list) S.damage(c, 30, '十字火焰', true); } });
  }
  // 泰坦：地裂（覺醒）兩波
  let lsBase = 0;
  at(tb(34), () => {
    lsBase = Math.atan2(-s.titan.pos.x, -s.titan.pos.z);
    S.cast('泰坦', '地裂（覺醒）', tb(34), 4.0);
    const o = { x: s.titan.pos.x, z: s.titan.pos.z };
    s.ls1 = W1.map((d) => S.addFx({ kind: 'rect', x: o.x, z: o.z, rot: lsBase + d, w: K.LS_W, len: K.LS_LEN, t0: tb(34), t1: tb(38), label: '地裂（覺醒）', tint: 'earth' }));
    s.ls2 = W2.map((d) => S.addFx({ kind: 'rect', x: o.x, z: o.z, rot: lsBase + d, w: K.LS_W, len: K.LS_LEN, t0: tb(39.98), assistFrom: tb(38), t1: tb(40), label: '地裂（覺醒追加）', tint: 'earth' }));
  });
  const lsHit = (lines, wave) => { for (const c of S.alive()) if (lines.some((g) => inRect(c.pos, g, g.rot, g.w / 2, g.len))) S.kill(c, `被地裂${wave}擊中`); };
  at(tb(38), () => { lsHit(s.ls1, '第一波'); S.sound('rock'); });
  at(tb(40), () => { lsHit(s.ls2, '第二波（在第一波的線之間）'); S.sound('rock'); });
  // 究極神兵：青磷放射（自身周圍）
  S.hazard({ t0: tb(37), omen: tb(38.6), assistFrom: tb(37), tRes: tb(40), kind: 'circle', label: '青磷放射（究極神兵周圍）', castBy: ['究極神兵', '青磷放射', 3.0],
    geom: () => ({ x: ult.pos.x, z: ult.pos.z, r: K.VENT_R }), killMsg: '被青磷放射（究極神兵周圍）擊中' });
  at(tb(41), () => { S.despawn(s.ifrit); S.despawn(s.titan); show(ult, false); s.ifrit = null; s.titan = null; });
  // 迦樓羅上天：飛翎雨（落在此刻每個人腳下）
  const featherRain = (tSnap, tCast, tHit, who) => {
    let spots = [];
    at(tSnap, () => {
      spots = S.alive().map((c) => ({ x: c.pos.x, z: c.pos.z }));
      s.rain = spots;
      // 範圍在鎖定的瞬間就建立（AI 才躲得到），畫面上讀條開始才顯示；教學模式先用虛線圈提示
      for (const p of spots) {
        S.previews.push({ kind: 'circle', x: p.x, z: p.z, r: K.RAIN_R, t0: tSnap, t1: tCast, label: '飛翎雨' });
        S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.RAIN_R, t0: tCast, t1: tHit, label: 'Feather Rain', tint: 'rain' });
      }
      S.sound('eagle');
      S.log(`${who}上天：飛翎雨鎖定在此刻腳下，立刻離開`, -1, true);
    });
    at(tCast, () => S.cast('Garuda', '飛翎雨', tCast, tHit - tCast));
    at(tHit, () => { for (const c of S.alive()) if (spots.some((p) => inCircle(c.pos, p, K.RAIN_R))) S.kill(c, '被飛翎雨命中（沒有離開鎖定位置）'); });
  };
  at(tb(43), () => { if (s.garuda) show(s.garuda, false); });
  featherRain(tb(43), tb(44), tb(45), '迦樓羅');
  at(tb(45.5), () => { S.despawn(s.garuda); s.garuda = null; });
  // 究極神兵回到場中，召喚伊弗利特：地火噴發（離伊弗利特最遠的 2 人，連續 4 次）
  at(tb(45), () => { show(ult, true); ult.pos.x = 0; ult.pos.z = 0; ult.rot = PI; });
  at(tb(46), () => { ult.targetable = true; s.faceTank = true; });
  at(tb(50), () => S.cast('究極神兵', '召喚伊弗利特', tb(50), 2.0));
  at(tb(54), () => { s.ifrit = S.actor('ifrit', '伊弗利特', 0, -19.6, 0); s.ifrit.targetable = false; });
  let baits = [];
  at(tb(56), () => {
    baits = S.alive().sort((a, b) => dist(b.pos, s.ifrit.pos) - dist(a.pos, s.ifrit.pos)).slice(0, 2);
    S.cast('伊弗利特', '地火噴發', tb(56), 2.0);
    S.log(`地火噴發：${baits.map((b) => b.key).join('、')}（離伊弗利特最遠的 2 人）腳下連續 4 次`, -1, true);
  });
  [56, 58, 60, 62].forEach((t) => {
    let spots = [];
    at(tb(t), () => {
      spots = baits.filter((b) => b.alive).map((b) => ({ x: b.pos.x, z: b.pos.z, owner: b }));
      for (const p of spots) S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.ERUPT_R, t0: tb(t), t1: tb(t + 3), label: 'Eruption', tint: 'danger' });
    });
    at(tb(t + 3), () => {
      for (const p of spots) for (const c of S.alive()) {
        if (!inCircle(c.pos, p, K.ERUPT_R)) continue;
        if (c !== p.owner) p.owner.stats.eruptHits = (p.owner.stats.eruptHits || 0) + 1;
        if (isTank(c.slot)) S.damage(c, 50, 'Eruption'); else S.kill(c, '被地火噴發（半徑 8）擊中');
      }
    });
  });
  // 召喚泰坦；火獄之鎖（OT＋1 名 DPS，距離越遠越痛）
  at(tb(61), () => S.cast('究極神兵', '召喚泰坦', tb(61), 2.0));
  at(tb(63), () => {
    const dps = R.fettersDps;
    S.tethers.push({ kind: 'fetters', t0: tb(63), t1: tb(83), ends: () => [[S.chars[OT].pos, S.chars[dps].pos]] });
    S.addStatus(OT, 'fetters', 20); S.addStatus(dps, 'fetters', 20);
    S.log(`伊弗利特：火獄之鎖（OT 與 ${ROLES[dps].key}）`);
  });
  at(tb(64.5), () => { S.despawn(s.ifrit); s.ifrit = null; });
  at(tb(65), () => { s.titan = S.actor('titan', '泰坦', -14.4, -14.2, 0); s.titan.targetable = false; face(s.titan, { x: 0, z: 0 }); });
  // 光輝炎柱（究極神兵）：場地一圈 8 個大圓，原地躲（人群在究極神兵南側）
  S.hazard({ t0: tb(66), tRes: tb(69), kind: 'circle', label: '光輝炎柱', castBy: ['究極神兵', '光輝炎柱', 2.5], geom: { x: 0, z: 0, r: 0 }, noKill: true });
  const PLUMES = [[0, -17.6], [17.6, 0], [0, 17.6], [-17.6, 0], [11, -11], [11, 11], [-11, 11], [-11, -11]];
  for (const p of PLUMES) S.hazard({ t0: tb(66), tRes: tb(69), kind: 'circle', label: 'Radiant Plume', geom: { x: p[0], z: p[1], r: K.PLUME_R }, killMsg: '被光輝炎柱（半徑 8）擊中' });
  // 爆破岩石 ×6（依序）＋泰坦地裂（兩波）＋究極神兵地裂（朝人群）＋怒震
  at(tb(67), () => S.cast('泰坦', '爆破岩石', tb(67), 2.0));
  BOMBS.forEach((b, i) => {
    const tImp = tb(70 + 2 * i), tExp = tb([75, 76, 78, 80, 82, 84][i]);
    let a = null;
    S.hazard({ t0: tImp - 1.0, tRes: tImp, kind: 'circle', geom: { x: b[0], z: b[1], r: K.IMPACT_R }, label: '爆破岩石（落地衝擊）', tint: 'earth', killMsg: '被爆破岩石落地衝擊擊中' });
    at(tImp, () => { a = S.actor('bomb', '爆破岩石', b[0], b[1], 0); a.hp = 0; S.sound('rock'); });
    at(tExp - 3, () => { if (a) a.hp = 1; });
    S.hazard({ t0: tExp - 3, tRes: tExp, kind: 'circle', geom: { x: b[0], z: b[1], r: K.BOMB_R }, label: '爆破岩石爆炸', killMsg: '被爆破岩石爆炸（半徑 4）擊中' });
    at(tExp, () => S.despawn(a));
  });
  const landslide = (i, who, from, tCast, tRes, tRes2) => {
    let l1 = [], l2 = [];
    at(tCast, () => {
      const alive = S.alive();
      if (!alive.length) return;
      const tg = alive[Math.floor(R.ls[i] * alive.length)], o = from();
      R.lsTargets[i] = tg.key;
      S.cast(who, '地裂', tCast, tRes - tCast);
      const r0 = Math.atan2(tg.pos.x - o.x, tg.pos.z - o.z);
      l1 = W1.map((d) => S.addFx({ kind: 'rect', x: o.x, z: o.z, rot: r0 + d, w: K.LS_W, len: K.LS_LEN, t0: tCast, t1: tRes, label: `地裂（${who}）`, tint: 'earth' }));
      if (tRes2) l2 = W2.map((d) => S.addFx({ kind: 'rect', x: o.x, z: o.z, rot: r0 + d, w: K.LS_W, len: K.LS_LEN, t0: tRes2 - 0.02, assistFrom: tRes, t1: tRes2, label: '地裂（覺醒追加）', tint: 'earth' }));
    });
    at(tRes, () => { lsHit(l1, tRes2 ? '第一波' : ''); S.sound('rock'); });
    if (tRes2) at(tRes2, () => { lsHit(l2, '第二波（看不見，在第一波的線之間）'); S.sound('rock'); });
  };
  at(tb(70), () => { ult.moveTo(0, 9.6, 3); });
  landslide(0, '泰坦', () => s.titan.pos, tb(70), tb(73), tb(75));
  landslide(1, '究極神兵', () => ult.pos, tb(71), tb(74));
  at(tb(77), () => S.cast('究極神兵', '召喚迦樓羅', tb(77), 2.0));
  at(tb(77.7), () => S.cast('泰坦', '怒震 ×7', tb(77.7), 7));
  for (let k = 0; k < 7; k++) at(tb(78 + k), () => raid('怒震', 5, 0.28));
  at(tb(78.5), () => { ult.moveTo(0, 10.8, 2); });
  at(tb(85.5), () => { S.despawn(s.titan); s.titan = null; });
  // 迦樓羅＋2 隻分身；第二次吸附以太炸彈（MT），OT 挑釁接主仇
  at(tb(81), () => {
    s.garuda = S.actor('garuda', 'Garuda', 0, 0, 0); s.garuda.targetable = false;
    s.clones = [-15.7, 15.7].map((x, k) => { const a = S.actor('sister', k ? 'Chirada' : 'Suparna', x, 0, 0); a.tint = k ? '#e0b25a' : '#56d0d0'; a.targetable = false; face(a, { x: 0, z: 0 }); return a; });
  });
  sticky(tb(81.4), tb(82), tb(92));
  at(tb(82.3), () => { s.tank = OT; S.log('OT 挑釁接主仇（MT 退避，變第 2 仇恨）'); });
  S.hazard({ t0: tb(86), tRes: tb(88.7), kind: 'circle', label: '邪輪旋風（分身）', castBy: ['Suparna', '邪輪旋風', 2.7], geom: () => ({ x: s.clones[0].pos.x, z: s.clones[0].pos.z, r: K.CLONE_WHEEL_R }), killMsg: '被分身的邪輪旋風擊中' });
  S.hazard({ t0: tb(86), tRes: tb(88.7), kind: 'circle', label: '邪輪旋風（分身）', geom: () => ({ x: s.clones[1].pos.x, z: s.clones[1].pos.z, r: K.CLONE_WHEEL_R }), killMsg: '被分身的邪輪旋風擊中' });
  at(tb(86), () => { S.cast('Garuda', '寒風之嘯', tb(86), 2.0); S.expect('raid', tb(88)); });
  at(tb(88), () => raid('寒風之嘯', 40, 0.9));
  at(tb(89), () => s.clones.forEach((a) => show(a, false)));
  featherRain(tb(90), tb(90.4), tb(91), '分身');
  laser(tb(90), tb(95));
  at(tb(92), () => { if (s.garuda) show(s.garuda, false); });
  featherRain(tb(93), tb(93.3), tb(94), '迦樓羅');
  at(tb(95), () => { s.clones.forEach((a) => S.despawn(a)); s.clones = []; S.despawn(s.garuda); s.garuda = null; });
  at(K.END, () => S.finishWith(true));

  // ---------------------------------------------------------------- 走位
  const MV = (t, id, title, spots, tip, frame, opt) => S.move(t, id, title, (S2) => AI.sanitize(S2, S2.swapTanks(spots(S2))), Object.assign({ tip: tipf(tip), frame, noSwap: true }, opt || {}));
  const center = () => all([0, 0]);
  MV(0.2, 'center', '全員 1 號位集合', center, {
    def: '泰坦消失。全員在 1 號位（場地中央）集合：A／B／C／D 會落下導彈，離落點越近越痛。',
    C: '全員在 1 號位集合。0:09 用法系 LB3（技能列的 LB）打魔導浮游炮。',
  }, 'P4A-F01', { spread: true });
  MV(10.6, 'bits', '魔導浮游炮：分散輸出', () => fp('P4A-F04'), {
    C: '魔導浮游炮出現：法系 LB3 如果還沒放，馬上放（0:14 之前），其他人補刀。',
    def: '6 個魔導浮游炮出現並讀條自爆：照圖分散去打（C 的法系 LB3 已經打到大部分血量）。',
  }, 'P4A-F04', { preview: false });
  MV(18.2, 'center2', '全員 1 號位集合', center, {
    H1: '回 1 號位。0:22 拉哈布雷亞會給全員死亡宣告並擊倒 4 秒，0:26 能動之後立刻用治療 LB3（技能列的 LB）。',
    def: '回 1 號位集合。0:22 死亡宣告＋擊倒（全員不能動），等 H1 的治療 LB3。',
  }, 'P4A-F06', { spread: true });
  MV(31.2, 'laha', '拉哈布雷亞：全員在 1 號位輸出', () => fp('P4A-F07'), {
    M2: '拉哈布雷亞讀條冥暗（15 秒後全滅）：0:38 極限技槽滿了就用近戰 LB3（技能列的 LB）擊殺他。',
    def: '拉哈布雷亞讀條冥暗：等 M2 的近戰 LB3 擊殺。',
  }, 'P4A-F07', { preview: false });
  MV(46.4, 'ultima', '究極神兵出現：準備扛究極', center, {
    OT: '究極神兵出現：0:48 極限技槽滿了就用坦克 LB3（技能列的 LB），全員才扛得住 0:57 的究極。',
    def: '全員在 1 號位，等 OT 的坦克 LB3 扛下究極。',
  }, 'P4A-F08', { spread: true });
  MV(tb(0.2), 'b0', '全員 1 號位集合', () => fp('P4B-F02'), { def: '究極神兵可以選中：魔導核爆全屏攻擊。' }, 'P4B-F02', { spread: true });
  MV(tb(6), 'b-pull', 'MT 把究極神兵拉向外、OT 第 2 仇恨', () => fp('P4B-F03'), {
    MT: '把究極神兵拉到北側，讓他面向外，你站最北邊遠離人群：會吃吸附以太炸彈。',
    OT: '站人群和究極神兵之間的西北側（第 2 仇恨）：誘導射線會打你，要離人群 5 以上，開減傷。',
    def: '在究極神兵南側集合，離 MT 與 OT 遠一點。',
  }, 'P4B-F03');
  MV(tb(11.2), 'b-laser', '誘導射線：OT 單吃', () => fp('P4B-F04'), {
    MT: '0:17 吸附式炸彈爆炸：你單吃（開無敵），別回人群。', OT: '誘導射線打你：留在原位。', def: '待在人群，不要靠近 MT、OT。',
  }, 'P4B-F04');
  MV(tb(17.3), 'pred0', '追擊之究極幻想：全員 1 號位', () => fp('P4B-F06'), {
    def: '全員回 1 號位。究極神兵消失後，迦樓羅（場中偏斜點）、伊弗利特（場外斜點）、泰坦（正點兩側）、究極神兵（場外斜點）會出現。',
  }, 'P4B-F06', { spread: true });
  const pred1Tip = { def: '找迦樓羅的位置，去離她遠、沒有泰坦的正點附近；躲開泰坦的地裂與伊弗利特的俯衝線。' };
  MV(tb(30), 'pred1', '追擊：先找迦樓羅，去第 1 輪的安全點', () => all(plan().p1), pred1Tip, 'P4B-F07', { spread: true, preview: false });
  MV(tb(34.1), 'pred1', '追擊：躲第 1 輪', () => all(plan().p1), pred1Tip, 'P4B-F07', { spread: true, preview: false, jitter: false });
  MV(tb(38.15), 'pred2', '追擊：躲第 2 輪', () => { const p = plan().p2; return all(p); }, {
    def: '第 1 輪結束立刻移動：躲開地裂第二波（線與線之間）、究極神兵周圍的青磷放射；離迦樓羅要很遠（環形）。',
  }, 'P4B-F09', { spread: true, preview: false, jitter: false });
  MV(tb(43.05), 'b-rain', '飛翎雨：回 1 號位附近', (S2) => fp('P4B-F12').map((p) => repel(p, S2.s.rain || [], K.RAIN_R + 1.0)), {
    def: '迦樓羅上天：腳下會被鎖定飛翎雨，立刻往 1 號位移動。',
  }, 'P4B-F12', { preview: false });
  MV(tb(45.6), 'b-f13', '究極神兵回到場中：R 去 D、C 去 B', () => fp('P4B-F13'), {
    R: '去 D 點（場地西邊緣）：之後地火噴發會點你，沿場邊往 C 跑。', C: '去 B 點（場地東邊緣）：之後地火噴發會點你，沿場邊往 C 跑。',
    def: '在究極神兵南側（1 號位旁）集合。',
  }, 'P4B-F13');
  const ERUPT_RUN = [[56.1, 'P4B-F15'], [58.1, 'P4B-F16'], [60.1, 'P4B-F17']];
  for (const [t, id] of ERUPT_RUN) {
    MV(tb(t), 'erupt', '地火噴發：R／C 沿場邊跑', () => { const a = fp(id); return only([[RR, a[RR]], [CC, a[CC]]]); }, {
      R: '地火噴發在你腳下：沿場邊往 C 點跑（每 2 秒一圈，半徑 8）。', C: '地火噴發在你腳下：沿場邊往 C 點跑（每 2 秒一圈，半徑 8）。',
      def: '留在究極神兵南側，不要靠近 R／C 的路線。',
    }, id, { preview: false, jitter: false });
  }
  MV(tb(62.4), 'b-f18', '全員在究極神兵正面前集合', () => fp('P4B-F18'), {
    OT: '火獄之鎖：你和 1 名 DPS 連線，待在一起不要拉遠。', def: '全員在究極神兵南側集合（火獄之鎖：連線的兩人待在一起）。',
  }, 'P4B-F18', { spread: true });
  MV(tb(69.3), 'b-f20', '光輝炎柱結束：到南邊場邊', () => fp('P4B-F20'), {
    def: '炎柱結束後移到南邊場邊：爆破岩石會依序落在場中一圈，泰坦與究極神兵都會放地裂（躲開直線）。',
  }, 'P4B-F20', { spread: true });
  MV(tb(72), 'b-f21', '躲究極神兵的地裂', () => fp('P4B-F21'), { def: '究極神兵朝人群放地裂：往旁邊閃開直線，留在南邊場邊。' }, 'P4B-F21', { spread: true });
  MV(tb(75.2), 'b-f22', '南邊場邊（怒震）', () => fp('P4B-F22'), { def: '留在南邊場邊，補師撐過連續怒震。' }, 'P4B-F22', { spread: true });
  MV(tb(79.5), 'b-f23', 'MT 離開人群（吸附以太炸彈）', () => fp('P4B-F23'), {
    MT: '第二次吸附以太炸彈：先離開人群到東北側，OT 會挑釁接主仇。', OT: '準備挑釁接主仇。', def: '留在南邊場邊，離 MT 遠一點。',
  }, 'P4B-F23', { spread: true });
  MV(tb(83.2), 'b-f24', 'MT 回到人群', () => fp('P4B-F24'), { def: '分身在 B、D 讀邪輪旋風：留在南邊場邊。' }, 'P4B-F24', { spread: true });
  MV(tb(90.05), 'b-f25', '分身飛翎雨：MT 逆時針、其他人順時針', () => fp('P4B-F25'), {
    MT: '飛翎雨鎖定腳下：逆時針走開；誘導射線（1:35）會打你，要離人群遠一點。', def: '飛翎雨鎖定腳下：順時針走開，離 MT 遠一點。',
  }, 'P4B-F25', { preview: false, jitter: false });
  MV(tb(92.1), 'b-f26', '吸附式炸彈爆炸＋誘導射線', () => fp('P4B-F26'), {
    MT: '吸附式炸彈爆炸、之後誘導射線都打你：遠離人群單吃。', def: '跟人群移動，離 MT 遠一點。',
  }, 'P4B-F26', { preview: false, jitter: false });
  MV(tb(93.05), 'b-rain3', '迦樓羅飛翎雨：繼續走', () => fp('P4B-F26').map((p, i) => turn(p, i === MT ? -18 : 18)), {
    MT: '飛翎雨鎖定腳下：繼續逆時針走。', def: '飛翎雨鎖定腳下：繼續順時針走。',
  }, 'P4B-F26', { preview: false, jitter: false });
}

// ---------------------------------------------------------------- 隊友 AI
const AI = U.AI.make({ horizon: 4.5, margin: 0.9, edge: (S) => S.edgeR - 1.0 });
/** 羽毛雨離開位置：以攻略位置為準，但自動與鎖定位置拉開距離。 */
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
  return [x, z];
}
/** 追擊之究極幻想：第 1 輪站 p1、第 2 輪站 p2（兩點走得到）。依召喚獸的位置算（攻略：去離迦樓羅遠、沒有泰坦的正點）。 */
function predationPlan(S) {
  const R = S.roll, M = K.PLAN_MARGIN;
  const g = atBearing(R.pg, 5.5), i = atBearing(R.pi, 20.2), ti = atBearing(R.pt, 19.7), u = atBearing(R.pu, 20.6);
  const lane = { x: i.x, z: i.z, rot: Math.atan2(-i.x, -i.z) };
  const base = Math.atan2(-ti.x, -ti.z);
  const onLine = (p, offs) => offs.some((d) => inRect(p, ti, base + d, K.LS_W / 2 + M, K.LS_LEN));
  const bad1 = (p) => Math.hypot(p.x - g.x, p.z - g.z) <= K.WHEEL_R + M || inRect(p, lane, lane.rot, K.LANE_HALF + M, 44) || onLine(p, W1);
  const bad2 = (p) => { const dg = Math.hypot(p.x - g.x, p.z - g.z); return (dg >= K.WHEEL_IN2 - M && dg <= K.WHEEL_OUT2 + M) || onLine(p, W2) || Math.hypot(p.x - u.x, p.z - u.z) <= K.VENT_R + M; };
  const pts = [];
  for (let x = -K.PLAN_R; x <= K.PLAN_R; x += 0.8) for (let z = -K.PLAN_R; z <= K.PLAN_R; z += 0.8) if (Math.hypot(x, z) <= K.PLAN_R) pts.push({ x, z });
  const s1 = pts.filter((p) => !bad1(p)), s2 = pts.filter((p) => !bad2(p));
  const reach = U.C.NPC_SPEED * 1.4;
  let best = null, bc = Infinity;
  for (const p of s1) {
    for (const q of s2) {
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d > reach) continue;
      const cost = d + 0.15 * Math.hypot(p.x, p.z);
      if (cost < bc) { bc = cost; best = [p, q]; }
    }
  }
  if (!best) { const p = s2[0] || { x: 0, z: 0 }; best = [s1[0] || p, p]; }   // 沒有完美解（不應發生）：至少躲第 2 輪
  return { p1: [best[0].x, best[0].z], p2: [best[1].x, best[1].z] };
}

function tick(S, dt) {
  const s = S.s, u = s.ultima;
  if (s.faceTank && u.visible && !u.dead) { const m = S.mainTank(); u.rot = Math.atan2(m.pos.x - u.pos.x, m.pos.z - u.pos.z); }
  // 魔導浮游炮：法系 LB3 打到 → 4 秒後消失（其他人補刀）
  if (s.bits.length && !s.bitsDown) {
    const l = S.lbLog.find((x) => x.kind === 'caster' && x.lv >= 3 && x.t >= LB_TASKS[0].from - 0.6 && x.t <= LB_TASKS[0].by);
    if (l) {
      const k = Math.max(0, Math.min(1, (S.t - l.t) / K.CASTER_LB_HIT));
      for (const b of s.bits) b.hp = 1 - k;
      if (k >= 1) { for (const b of s.bits) S.despawn(b); s.bitsDown = true; S.log('魔導浮游炮全部擊殺'); }
    }
  }
  // 拉哈布雷亞：近戰 LB3 打到 → 擊殺
  if (s.laha && !s.laha.dead) {
    const l = S.lbLog.find((x) => x.kind === 'melee' && x.lv >= 3 && x.t >= LB_TASKS[2].from - 0.6 && x.t <= LB_TASKS[2].by);
    s.laha.hp = l ? Math.max(0, 1 - (S.t - l.t) / K.MELEE_LB_HIT) : 1;
    if (l && S.t >= l.t + K.MELEE_LB_HIT) { S.despawn(s.laha); S.casts = S.casts.filter((c) => c.who !== '拉哈布雷亞'); S.log('近戰 LB3：擊殺拉哈布雷亞'); }
  }
  // 火獄之鎖：距離過遠會受傷（不致死）
  const th = S.tethers.find((x) => x.kind === 'fetters');
  if (th && S.t >= th.t0 && S.t <= th.t1) {
    const a = S.chars[OT], b = S.chars[S.roll.fettersDps];
    if (a.alive && b.alive && dist(a.pos, b.pos) > K.FETTER_D) { S.damage(a, 3 * dt, '火獄之鎖', true); S.damage(b, 3 * dt, '火獄之鎖', true); }
  }
}

function objectives(S, slot) {
  const c = S.chars[slot], st = c.stats, out = [];
  out.push({ ok: c.alive, text: '全程存活' });
  const task = LB_TASKS.find((x) => x.slot === slot);
  if (task) out.push({ ok: S.lbLog.some((l) => l.slot === slot && l.kind === task.kind && l.lv >= 3 && l.t >= task.from - 0.6 && l.t <= task.by), text: task.what });
  if (S.t >= tb(17) && (slot === MT || slot === OT)) {
    if (slot === MT) out.push({ ok: !st.stickyHits, text: '吸附以太炸彈：遠離人群單吃（沒有波及隊友）' });
    if (slot === OT) out.push({ ok: !st.laserHits, text: '誘導射線：遠離人群單吃（沒有波及隊友）' });
  }
  if (S.t >= tb(65) && (slot === RR || slot === CC)) out.push({ ok: !st.eruptHits, text: '地火噴發：沿場邊跑，沒有炸到隊友' });
  return out;
}

const CHECKPOINTS = [
  { t: 0, name: '拉哈布雷亞：誘導爆炸／魔導浮游炮' },
  { t: 19, name: '死亡宣告（治療 LB3）' },
  { t: 30, name: '拉哈布雷亞：冥暗（近戰 LB3）' },
  { t: 46.5, name: '究極（坦克 LB3）' },
  { t: tb(-0.5), name: '追擊：吸附以太炸彈／誘導射線' },
  { t: tb(19), name: '追擊之究極幻想（四召喚獸）' },
  { t: tb(44), name: '召喚伊弗利特：地火噴發／火獄之鎖' },
  { t: tb(65), name: '光輝炎柱／爆破岩石／地裂' },
  { t: tb(80), name: '迦樓羅分身／飛翎雨／誘導射線' },
];
const CUES = [
  [0, '全員 1 號位集合（極限技槽已滿）'],
  [3, 'A／B／C／D 誘導爆炸：待在場地中央'],
  [9, 'C：法系 LB3（萬億核爆）'],
  [11, '6 個魔導浮游炮讀條自爆：讀條結束前要擊殺'],
  [22, '死亡宣告＋擊倒：0:26 能動後 H1 用治療 LB3'],
  [31, '拉哈布雷亞讀條冥暗（15 秒）'],
  [38, 'M2：近戰 LB3（月遁血祭）擊殺拉哈布雷亞'],
  [48, 'OT：坦克 LB3（終極堡壘）'],
  [57, '究極（全屏超高額傷害）'],
  [tb(0), '究極神兵可以選中：魔導核爆'],
  [tb(6), 'MT 把究極神兵拉向外；OT 拿第 2 仇恨'],
  [tb(9), '吸附以太炸彈（MT）＋誘導射線（OT）：都要遠離人群'],
  [tb(20), '追擊之究極幻想：全員 1 號位'],
  [tb(29), '四召喚獸出現：找迦樓羅，去離她遠、沒有泰坦的正點'],
  [tb(38), '第 1 輪結束：躲地裂第二波、青磷放射'],
  [tb(43), '迦樓羅上天：飛翎雨，回 1 號位'],
  [tb(46), 'R 去 D、C 去 B'],
  [tb(56), '地火噴發 ×4：R／C 沿場邊往 C 跑'],
  [tb(63), '全員在究極神兵正面前；火獄之鎖'],
  [tb(66), '光輝炎柱：原地躲'],
  [tb(70), '爆破岩石 ×6、泰坦地裂（兩波）、究極神兵地裂：到南邊場邊'],
  [tb(78), '怒震 ×7'],
  [tb(81), '迦樓羅＋分身；吸附以太炸彈（MT），OT 挑釁'],
  [tb(86), '分身邪輪旋風（B、D）＋寒風之嘯'],
  [tb(90), '分身飛翎雨：MT 逆時針、其他人順時針；誘導射線（MT）'],
  [tb(93), '迦樓羅飛翎雨：繼續走'],
];
const ROLE_DESC = [
  'P4A 在 1 號位；P4B 開場把究極神兵拉向外並遠離人群吃吸附以太炸彈（0:17 爆炸單吃）；追擊之後的第二次吸附以太炸彈也要離開人群，OT 挑釁後你是第 2 仇恨，吃誘導射線。',
  'P4A：0:48 用坦克 LB3（終極堡壘）扛究極。P4B 開場拿第 2 仇恨，遠離人群單吃誘導射線；火獄之鎖連你；第二次吸附以太炸彈時挑釁接主仇。',
  'P4A：死亡宣告＋擊倒結束後（0:26）立刻用治療 LB3（生命鼓動）解除死亡宣告。其餘跟人群。',
  '跟人群；P4A 時注意 H1 的治療 LB3。',
  '跟人群。',
  'P4A：0:38 用近戰 LB3（月遁血祭）擊殺拉哈布雷亞。其餘跟人群。',
  '追擊之後去 D 點：地火噴發點你，沿場邊往 C 跑（4 次）。',
  'P4A：0:09 用法系 LB3（萬億核爆）打魔導浮游炮。追擊之後去 B 點：地火噴發點你，沿場邊往 C 跑（4 次）。',
];

PHASES.p4 = {
  id: 'p4', name: 'P4 究極神兵', short: '究極神兵', preRoll: -3, end: K.END, maxCharges: 0, chargeLabel: '',
  bossLook: ['bit', 'lahabrea', 'ultima'], bossR: 4, activeTank: (S) => S.s.tank,
  checkpoints: CHECKPOINTS, cues: CUES, roleDesc: ROLE_DESC,
  roll, setup, build, tick, objectives,
  /** 輪到這個職位用極限技（技能列的 LB 會閃）。 */
  lbDue: (S, slot) => LB_TASKS.some((x) => x.slot === slot && S.t >= x.from && S.t <= x.by && S.lb >= 3),
  start: () => all([0, 0]).map((p, i) => [Math.cos(i * 0.8) * 1.2, Math.sin(i * 0.8) * 1.2]),
  rollSummary: (r) => {
    const D8 = (b) => ['A（北）', '東北', 'B（東）', '東南', 'C（南）', '西南', 'D（西）', '西北'][Math.round(U.norm360(b) / 45) % 8];
    return [
      `追擊之究極幻想：迦樓羅偏${D8(r.pg)}、伊弗利特在${D8(r.pi)}、泰坦在${D8(r.pt)}（${U.norm360(r.pt) % 90 > 45 ? '偏左' : '偏右'}）、究極神兵在${D8(r.pu)}`,
      `火獄之鎖：OT 與 ${ROLES[r.fettersDps].key}　地裂目標：${r.lsTargets.filter(Boolean).join('、') || '—'}`,
    ];
  },
};
root.UWU_P4 = { K, predationPlan, LB_TASKS };
})(typeof window !== 'undefined' ? window : globalThis);
