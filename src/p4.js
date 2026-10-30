/* P4 究極神兵：P4A 拉哈布雷亞、P4B 追擊之究極幻想、P4C 爆擊之究極幻想、P4D 亂擊之究極幻想。
   站位／分工：攻略 P4A-F01~F08、P4B-F02~F26、P4C-F01~F37、P4D-F02~F24（由攻略的文字座標換算，gen/extract_md.py）。
   職位對應：戰=MT 騎=OT 白=H1 學=H2 龍=M1 忍=M2 詩=R 召=C。
   時間：P4A 照攻略；究極之後的過場動畫（0:57～1:34）縮短成 4 秒，P4B 之後的 0:00＝本階段 1:01（tb()）。
   P4A 的重點是極限技：C 法系 LB3（浮游炮）、H1 治療 LB3（死亡宣告）、M2 近戰 LB3（拉哈布雷亞）、OT 坦克 LB3（究極）；
   P4D 結尾的第二次究極也要 OT 的坦克 LB3。負責的職位是真人時要自己按（時機錯就團滅），是 AI 時照攻略的時間自動使用。
   隨機：追擊之究極幻想時迦樓羅／伊弗利特／泰坦／究極神兵的出現位置、地裂的目標、火獄之鎖的 DPS；
   爆擊之究極幻想時伊弗利特／泰坦在西南或東南、灼熱咆哮的補師、中高壓的對象、烈焰碎擊的對象；
   亂擊之究極幻想時地火噴發／花崗石牢／寒風之歌／光柱的對象、魔科學激光的路徑、中高壓與烈焰碎擊的對象。
   P1 遺留的低氣壓：OT、H1、H2、C 各 1 層（擋中高壓用）。判定範圍是估計值（攻略圖不是按比例畫的）。 */
(function (root) {
'use strict';
const U = root.UWU;
const { PHASES, ROLES, isTank, inCircle, inRect, atBearing, bearingOf, mulberry32, shuffler, segInfo, dist, ENMITY } = U;
const { MT, OT, H1, H2, M1, M2, RR, CC } = U;
const PI = Math.PI;
const FR = U.FRAMES;

const B = 61;                 // P4B 的 0:00 在本階段的秒數
const tb = (s) => B + s;
const K = {
  END: B + 241.5,
  MISSILE_R: 10, MISSILE_D: 17, BITS_BOOM: 19, CASTER_LB_HIT: 4, MELEE_LB_HIT: 5,
  STICKY_R: 5, LASER_R: 4.5, VENT_R: 14,
  WHEEL_R: 8.4, WHEEL_IN2: 6.5, WHEEL_OUT2: 20, LANE_HALF: 9, CROSS_HALF: 5,
  LS_W: 4.2, LS_LEN: 40, PLUME_R: 8, ERUPT_R: 8, RAIN_R: 2, BOMB_R: 4, IMPACT_R: 2.5, CLONE_WHEEL_R: 6.5, FETTER_D: 14,
  PLAN_R: 17.2, PLAN_MARGIN: 1.3,
  // P4C 爆擊之究極幻想
  EYE_IN: 13, WOL_R: 4.8, CRUSH_R: 4, CRUSH_NEED: 6, MESO_R: 3, PASS_HALF: 1.0, WIND_R: 14,
  ORB: [3.2, -5.0], ORB_TOUCH: 1.4, ORB_BLAST: 7.0, ORB_LIFE: 5.5,
  PLUME_C_R: 9.6, DIFF_HALF: PI / 3, DIFF_LEN: 20, VULCAN_KB: 15,
  // P4D 亂擊之究極幻想
  ERUPT_D_R: 8.6, SONG_HALF: 2.5, SONG_LEN: 40, GW_R: 6, GSONG_HALF: PI / 3, GSONG_LEN: 20,
  FEATHER_R: 18.8, FEATHER_HIT: 2.5, FEATHER_EDGE: 15.0, FEATHER_BOOM: 8, FEATHER_SPEED: 30, SPIN0: B + 205, SPIN1: B + 220,
  PILLAR_R: 2.4, MLASER_W: 7.8, WM2: [-9.2, -3.6], GAOL_TOL: 3,
};
/** P4A 的極限技：誰負責、什麼種類、什麼時候（from～by 之間按），AI 在 ai 秒使用。 */
const LB_TASKS = [
  { kind: 'caster', slot: CC, from: 8.5, ai: 9.0, by: 14.5, what: '0:09～0:14 法系 LB3（萬億核爆）：擊殺魔導浮游炮' },
  { kind: 'healer', slot: H1, from: 26.0, ai: 26.1, by: 30.5, what: '0:26～0:30 治療 LB3（生命鼓動）：解除死亡宣告' },
  { kind: 'melee', slot: M2, from: 38.0, ai: 38.3, by: 40.5, what: '0:38～0:40 近戰 LB3（月遁血祭）：擊殺拉哈布雷亞' },
  { kind: 'tank', slot: OT, from: 48.0, ai: 48.3, by: 56.5, what: '0:48～0:56 坦克 LB3（終極堡壘）：扛下究極' },
  { kind: 'tank', slot: OT, from: B + 231, ai: B + 232, by: B + 239.5, what: '3:51～3:59 坦克 LB3（終極堡壘）：扛下第二次究極' },
];
/** 極限技槽（攻略）：[時間, 格數]。 */
const LB_SET = [[0, 3], [21, 0], [25, 3], [36, 0], [38, 3], [46, 0], [48, 3]];
const W1 = [0, PI / 4, -PI / 4, PI / 2, -PI / 2], W2 = [PI / 8, -PI / 8, 3 * PI / 8, -3 * PI / 8, PI];
// 泰坦的爆破岩石（攻略：泰坦在西北），依序落在場中一圈
const BOMBS = [[-4.8, -5.8], [4.0, -5.8], [7.4, 0], [4.0, 5.6], [-4.2, 5.6], [-7.4, 0]];

const fp = (id) => { const f = FR[id].pos; return ROLES.map((r) => (f[r.key] ? f[r.key].slice() : null)); };
const all = (p) => ROLES.map(() => p.slice());
const only = (list) => { const a = Array(8).fill(null); for (const [s, p] of list) a[s] = p; return a; };
const tipf = (m) => (slot, S) => {
  const r = ROLES[slot];
  const v = m[r.key];
  if (v !== undefined) return typeof v === 'function' ? v(S, slot) : v;
  const g = r.kind === 'tank' ? m.T : r.kind === 'healer' ? m.H : m.D;
  const d = g !== undefined ? g : (m.def || '');
  return typeof d === 'function' ? d(S, slot) : d;
};
const NON_TANKS_ORDER = [H1, H2, M1, M2, RR, CC];
const xz = (p) => ({ x: p[0], z: p[1] });
/** 繞場中心轉 deg 度（順時針為正，跟方位角一樣）。 */
const turn = (p, deg) => { const b = bearingOf(xz(p)) + deg, r = Math.hypot(p[0], p[1]), q = atBearing(b, r); return [q.x, q.z]; };

function roll(seed) {
  const rng = mulberry32(seed), pick = (a) => a[Math.floor(rng() * a.length)], sh = shuffler(rng);
  const ifr = Math.floor(rng() * 4);
  const ultChoices = [0, 1, 2, 3].filter((k) => k !== ifr);
  return {
    seed,
    // 追擊之究極幻想：迦樓羅在 1 號位偏向某個斜點、伊弗利特在場外斜點、泰坦在正點兩側、究極神兵在另一個斜點
    pg: 45 + 90 * Math.floor(rng() * 4), pi: 45 + 90 * ifr, pt: 90 * Math.floor(rng() * 4) + pick([-10, 10]), pu: 45 + 90 * pick(ultChoices),
    fettersDps: pick([M1, M2, RR, CC]),
    ls: [rng(), rng(), rng()],
    lsTargets: [],
    // 爆擊之究極幻想：伊弗利特在西南（攻略圖）或東南（左右鏡像）、灼熱咆哮的補師、兩次中高壓的對象、烈焰碎擊的對象
    ann: { ifritSW: rng() < 0.5, sear: pick([H1, H2]), meso: [rng(), rng()], crush: rng() },
    // 亂擊之究極幻想：6 名非坦克依序 3 人地火噴發（其中 1 人花崗石牢）、2 人寒風之歌、1 人光柱；魔科學激光 3 次的路徑
    sup: (() => {
      const nt = sh([H1, H2, M1, M2, RR, CC]), erupt = nt.slice(0, 3);
      return { erupt, gaol: erupt[Math.floor(rng() * 3)], song: nt.slice(3, 5), pillar: nt[5], lasers: [0, 1, 2].map(() => Math.floor(rng() * 3)), meso: rng(), crush: rng() };
    })(),
  };
}

function setup(S) {
  const s = S.s;
  s.tank = MT; s.faceTank = false;
  s.ultima = S.actor('ultima', '究極神兵', 0, -9.2, 0);
  s.ultima.visible = false; s.ultima.targetable = false;
  s.bits = []; s.laha = null; s.garuda = null; s.ifrit = null; s.titan = null; s.clones = [];
  s.charges = 0; s.woken = false;
  s.orbs = []; s.feathers = []; s.featherOn = false; s.steer = []; s.meso = {}; s.mesoBy = {}; s.mesoLog = []; s.songs = [null, null]; s.gw = [null, null];
  s.searWho = null; s.gaolWho = null; s.pillarWho = null;
  for (const k of [OT, H1, H2, CC]) S.chars[k].thermal = 1;   // P1 遺留的低氣壓（擋中高壓用）
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
      t0, omen: t0, tRes, kind: 'circle', label: '誘導射線', tankSafe: true, tankDmg: 60, buster: true, busterTarget: () => tg,
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
  // ---------------------------------------------------------------- 共用（P4C／P4D）
  const AN = R.ann, SU = R.sup;
  const mx = AN.ifritSW ? 1 : -1;   // 攻略圖：伊弗利特在西南、泰坦在東南；相反時左右鏡像
  s.wipe = wipe;
  const eye = (t0, tRes, who) => S.hazard({
    t0, tRes, kind: 'ring', label: '台風眼', tankSafe: true, tankDmg: 35, quiet: true,
    geom: { x: 0, z: 0, inner: K.EYE_IN, r: 25 }, castBy: [who, '台風眼', tRes - t0],
    killMsg: `被台風眼的外環擊中：要站在場地中央半徑 ${K.EYE_IN} 以內`,
  });
  /** 擋中高壓、消除低氣壓：全體小傷害（超級氣旋）。 */
  const cleanse = (c) => {
    c.thermal = 0;
    S.log(`${c.key} 擋下中高壓、消除低氣壓（全體超級氣旋）`, c.slot);
    S.screenFx.push({ t: S.t, type: 'raidwide', power: 0.4 });
    for (const o of S.alive()) S.damage(o, 4, 'Super Cyclone', true);
  };
  /** 中高壓：迦樓羅連線隨機 1 人，判定時打在「線上離迦樓羅最近的人」（擋線），有低氣壓才扛得住。
      byList：預定擋線的人（第一個活著、還有低氣壓的人）。 */
  const meso = (key, t0, tRes, roll01, byList, label) => {
    at(t0, () => {
      const alive = S.alive();
      if (!alive.length) return;
      const holder = alive[Math.floor(roll01 * alive.length)];
      const by = (typeof byList === 'function' ? byList() : byList).find((k) => S.chars[k].alive && S.chars[k].thermal > 0);
      const th = { kind: 'meso', src: s.garuda, holder: holder.slot, by: by === undefined ? null : by, label, t0, t1: tRes };
      th.end = () => {
        const a = th.src.pos, h = S.chars[th.holder];
        let best = null, bt = Infinity;
        for (const c of S.alive()) { const r = segInfo(c.pos, a, h.pos); if (r.d <= K.PASS_HALF && r.t < bt) { best = c; bt = r.t; } }
        return best || (h.alive ? h : null);
      };
      th.ends = () => { const e = th.end(); return e ? [[th.src.pos, e.pos]] : []; };
      S.tethers.push(th); s.meso[key] = th; s.mesoBy[key] = th.by;
      const fx = S.addFx({ kind: 'circle', r: K.MESO_R, t0, t1: tRes, label: 'Mesohigh（中高壓）', tint: 'meso', harmless: true });
      fx.follow = (f) => { const e = th.end(); if (e) { f.x = e.pos.x; f.z = e.pos.z; f.hidden = false; } else f.hidden = true; };
      S.cast('Garuda', '中高壓', t0, 1.0);
      S.log(`中高壓連線：${holder.key}${th.by !== null && th.by !== holder.slot ? `（${ROLES[th.by].key} 用 P1 遺留的低氣壓擋線）` : ''}`, -1, true);
    });
    at(tRes, () => {
      const th = s.meso[key];
      if (!th) return;
      const e = th.end();
      S.tethers = S.tethers.filter((x) => x !== th);
      s.meso[key] = null;
      if (!e) return;
      if (th.by !== null) s.mesoLog.push({ slot: th.by, label: th.label, ok: e.slot === th.by && e.thermal > 0 });
      for (const c of S.alive()) {
        if (!inCircle(c.pos, e.pos, K.MESO_R)) continue;
        if (c.thermal > 0) cleanse(c); else S.kill(c, '被中高壓命中但沒有低氣壓（要由有低氣壓的人擋線）');
      }
    });
  };
  /** 擋中高壓的位置：從迦樓羅往被連線者方向 d 碼（擋線的人自己被連線時回傳 null＝照攻略站位，遠離人群）。 */
  const mesoSpot = (key, d) => (S2) => {
    const th = S2.s.meso[key];
    if (!th || th.by === null || th.by === th.holder) return null;
    const a = th.src.pos, h = S2.chars[th.holder].pos, L = Math.hypot(h.x - a.x, h.z - a.z) || 1, k = Math.min(d, L - 1.5) / L;
    return [a.x + (h.x - a.x) * k, a.z + (h.z - a.z) * k];
  };
  /** 擋分身寒風之歌的位置：分身往目標方向 d 碼。 */
  const songSpot = (k, d) => (S2) => {
    const sg = S2.s.songs[k];
    if (!sg) return null;
    const a = sg.src.pos, h = S2.chars[sg.tgt].pos, L = Math.hypot(h.x - a.x, h.z - a.z) || 1, q = Math.min(d, L - 1.5) / L;
    return [a.x + (h.x - a.x) * q, a.z + (h.z - a.z) * q];
  };
  /** AI 在 from～to 之間持續走向 spot（擋線的位置會跟著被連線者移動）。 */
  const steer = (from, to, slotFn, spotFn) => s.steer.push({ from, to, slot: slotFn, spot: spotFn });
  // 烈焰碎擊：分攤（至少 6 人），人數不足時詛咒之炎致死
  const crush = (tMark, tRes, roll01, pool) => {
    let slot = null, stack = [];
    at(tMark, () => {
      const cand = pool.filter((k) => S.chars[k].alive);
      if (!cand.length) return;
      slot = cand[Math.floor(roll01 * cand.length)];
      S.mark(slot, 'crush', tMark, tRes);
      const fx = S.addFx({ kind: 'circle', r: K.CRUSH_R, t0: tMark, t1: tRes, label: 'Flaming Crush（烈焰碎擊）', tint: 'share', assistFrom: tMark, harmless: true });
      fx.follow = (f) => { const c = S.chars[slot]; f.x = c.pos.x; f.z = c.pos.z; };
      S.cast('伊弗利特', '烈焰碎擊', tMark, tRes - tMark);
      S.log(`烈焰碎擊點名 ${ROLES[slot].key}：全員分攤（至少 ${K.CRUSH_NEED} 人）`, -1, true);
    });
    at(tRes, () => {
      if (slot === null) return;
      const tg = S.chars[slot];
      stack = S.alive().filter((c) => inCircle(c.pos, tg.pos, K.CRUSH_R));
      const n = stack.length, dur = n >= K.CRUSH_NEED ? 2 : n === K.CRUSH_NEED - 1 ? 4 : 30;
      for (const c of stack) { S.damage(c, n >= K.CRUSH_NEED ? 20 : 45, `烈焰碎擊（${n} 人）`, n >= K.CRUSH_NEED); S.addStatus(c.slot, 'curse', dur); }
      S.log(`烈焰碎擊 ${n} 人分攤：詛咒之炎 ${dur} 秒${n >= K.CRUSH_NEED ? '（不會跳傷害）' : ''}`);
    });
    at(tRes + 3, () => {
      const n = stack.length;
      if (n >= K.CRUSH_NEED) return;
      for (const c of stack) {
        if (n === K.CRUSH_NEED - 1) S.damage(c, 30, '詛咒之炎');
        else S.kill(c, `烈焰碎擊分攤人數不足（${n} 人，至少 ${K.CRUSH_NEED} 人）：詛咒之炎致死`);
      }
    });
  };
  /** 覺醒地裂：從 o 朝場地中心 5 條直線，第二波（看不見）在線與線之間。 */
  const landslideC = (who, o, tCast, tRes, tRes2) => {
    let l1 = [], l2 = [];
    at(tCast, () => {
      const p = { x: o().x, z: o().z }, r0 = Math.atan2(-p.x, -p.z);
      S.cast(who, '地裂（覺醒）', tCast, tRes - tCast);
      l1 = W1.map((d) => S.addFx({ kind: 'rect', x: p.x, z: p.z, rot: r0 + d, w: K.LS_W, len: K.LS_LEN, t0: tCast, t1: tRes, label: '地裂（覺醒）', tint: 'earth' }));
      l2 = W2.map((d) => S.addFx({ kind: 'rect', x: p.x, z: p.z, rot: r0 + d, w: K.LS_W, len: K.LS_LEN, t0: tRes2 - 0.02, assistFrom: tRes, t1: tRes2, label: '地裂（覺醒追加）', tint: 'earth' }));
    });
    at(tRes, () => { lsHit(l1, '第一波'); S.sound('rock'); });
    at(tRes2, () => { lsHit(l2, '第二波（看不見，在第一波的線之間）'); S.sound('rock'); });
  };
  const nuke = (t0, tRes) => {
    at(t0, () => { S.cast('究極神兵', '魔導核爆', t0, tRes - t0 - 1); S.expect('raid', tRes); });
    at(tRes, () => raid('魔導核爆', 30, 0.8));
  };

  // ---------------------------------------------------------------- P4C：爆擊之究極幻想（1:36～3:04）
  at(tb(96), () => {
    s.tank = MT; ult.moveTo(0, 7.8, 2);
    S.cast('究極神兵', '爆擊之究極幻想', tb(96), 3.0);
    S.log('爆擊之究極幻想：MT 挑釁拿回主仇（OT 退避），全員 1 號位集合');
  });
  at(tb(104), () => { ult.targetable = false; s.faceTank = false; });
  at(tb(104.5), () => show(ult, false));
  at(tb(105), () => {
    show(ult, true); ult.pos.x = 0; ult.pos.z = -10.4; ult.rot = 0; ult.goal = null;
    s.garuda = S.actor('garuda', 'Garuda', 0, 19.6, 0); s.garuda.targetable = false;
    s.ifrit = S.actor('ifrit', '伊弗利特', -14.8 * mx, 13.8, 0); s.ifrit.targetable = false;
    s.titan = S.actor('titan', '泰坦', 14 * mx, 13.8, 0); s.titan.targetable = false;
    for (const a of [s.garuda, s.ifrit, s.titan]) face(a, { x: 0, z: 0 });
    S.log(`究極神兵在 A 點前（面向南）；迦樓羅在 C、伊弗利特在${mx > 0 ? '西南' : '東南'}、泰坦在${mx > 0 ? '東南' : '西南'}：全員到究極神兵右腳前`, -1, true);
  });
  at(tb(108), () => { ult.targetable = true; S.cast('泰坦', '大地之重（覺醒）', tb(108), 1.0); });
  // 泰坦：大地之重（覺醒）3 輪，落在此刻每個人腳下（人群在究極神兵兩腳之間來回）
  const weight = (t0, tRes) => {
    let spots = [];
    at(t0, () => {
      spots = [];
      for (const c of S.alive()) if (!spots.some((p) => Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 0.8)) spots.push({ x: c.pos.x, z: c.pos.z });
      for (const p of spots) S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.WOL_R, t0, t1: tRes, label: '大地之重', tint: 'earth' });
    });
    at(tRes, () => { for (const c of S.alive()) if (spots.some((p) => inCircle(c.pos, p, K.WOL_R))) S.kill(c, '被大地之重（覺醒）擊中：圈出現就要離開'); S.sound('rock'); });
  };
  weight(tb(108), tb(111)); weight(tb(111), tb(114)); weight(tb(114), tb(117));
  crush(tb(108), tb(113), AN.crush, [MT, OT, H1, H2, M1, M2, RR, CC]);
  eye(tb(111), tb(114), 'Garuda');
  meso('m1', tb(111), tb(117), AN.meso[0], [CC, H2, H1, RR, M1, M2], '第一次（C）');
  steer(tb(114.05), tb(117), (S2) => (S2.s.meso.m1 ? S2.s.meso.m1.by : null), mesoSpot('m1', 10));
  // 以太炸彈：究極神兵左腳前，OT 撞掉（tick 判定）
  const orb = (t) => at(t, () => {
    const a = S.actor('orb', '以太炸彈', K.ORB[0], K.ORB[1], 0); a.targetable = false;
    s.orbs.push({ a, t0: t, until: t + K.ORB_LIFE, popped: false });
    S.log('究極神兵在左腳前放置以太炸彈：OT 去撞掉（其他人離遠一點）', -1, true);
  });
  [114, 120, 127, 133].forEach((t) => orb(tb(t)));
  // 伊弗利特：灼熱咆哮（覺醒）點名 1 名補師，每 6 秒一次大範圍（半徑 14）
  at(tb(118), () => {
    s.searWho = S.pickAlive(AN.sear, [H1, H2, CC, RR, M1, M2]);
    const h = S.chars[s.searWho];
    h.searing = true; S.addStatus(h.slot, 'searing', 29.5);
    S.cast('伊弗利特', '灼熱咆哮（覺醒）', tb(118), 1.0);
    S.log(`${h.key} 被點名灼熱咆哮：立刻往 C 點方向離開人群（每 6 秒一次，半徑 ${K.WIND_R}）`, h.slot, true);
  });
  at(tb(147.5), () => { S.chars[s.searWho].searing = false; });
  [123, 129, 135, 141, 147].forEach((t) => S.hazard({
    t0: tb(t) - 0.7, omen: tb(t) - 0.7, tRes: tb(t), kind: 'circle', label: 'Searing Wind（灼熱咆哮）', tint: 'meso', noKill: true,
    geom: () => { const h = S.chars[s.searWho]; return { x: h.pos.x, z: h.pos.z, r: K.WIND_R, npcIgnore: [h.slot] }; },
    follow: (f) => { const h = S.chars[s.searWho]; f.x = h.pos.x; f.z = h.pos.z; },
    onResolve: (list) => {
      const h = S.chars[s.searWho];
      if (!h.alive) return;
      for (const c of list) {
        if (c === h) continue;
        h.stats.searHits = (h.stats.searHits || 0) + 1;
        if (isTank(c.slot)) { S.damage(c, 45, 'Searing Wind'); S.knock(c, h.pos, 8, 0.6); }
        else { S.kill(c, `被灼熱咆哮波及（太靠近持有熱風的 ${h.key}，半徑 ${K.WIND_R}）`); S.knock(c, h.pos, 13, 0.9); }
      }
    },
  }));
  at(tb(118), () => show(s.garuda, false));
  featherRain(tb(118), tb(119), tb(120), '迦樓羅');
  at(tb(126), () => { show(s.garuda, true); s.garuda.pos.x = 0; s.garuda.pos.z = 19.8; });
  // 伊弗利特俯衝（穿過場中到對角）＋十字火焰（不致死）；泰坦覺醒地裂（朝場中）
  S.hazard({ t0: tb(122), tRes: tb(125), kind: 'rect', label: '深紅旋風（覺醒）', castBy: ['伊弗利特', '深紅旋風（覺醒）', 3.0],
    geom: () => ({ x: s.ifrit.pos.x, z: s.ifrit.pos.z, rot: Math.atan2(-s.ifrit.pos.x, -s.ifrit.pos.z), w: K.LANE_HALF * 2, len: 44 }), killMsg: '被深紅旋風（伊弗利特的俯衝線）擊中' });
  const ifrLand = { x: 14.4 * mx, z: -14.2 };
  at(tb(124.9), () => s.ifrit.moveTo(ifrLand.x, ifrLand.z, 180));
  at(tb(125.1), () => { s.ifrit.pos.x = ifrLand.x; s.ifrit.pos.z = ifrLand.z; s.ifrit.goal = null; face(s.ifrit, { x: 0, z: 0 }); });
  for (const off of [-45, 45]) {
    S.hazard({ t0: tb(125.2), omen: tb(126.2), assistFrom: tb(125.2), tRes: tb(127), kind: 'rect', label: '十字火焰（減傷足夠，不致死）', noKill: true, tint: 'line',
      geom: () => { const e = atBearing(bearingOf(ifrLand) + off, 20); return { x: e.x, z: e.z, rot: Math.atan2(-e.x, -e.z), w: K.CROSS_HALF * 2, len: 44, harmless: true }; },
      onResolve: (list) => { for (const c of list) S.damage(c, 30, '十字火焰', true); } });
  }
  landslideC('泰坦', () => s.titan.pos, tb(124), tb(126), tb(128));
  at(tb(128), () => { S.despawn(s.ifrit); s.ifrit = null; });
  at(tb(129), () => { S.despawn(s.titan); s.titan = null; });
  eye(tb(128), tb(131), 'Garuda');
  meso('m2', tb(128), tb(134), AN.meso[1], () => [s.searWho], '第二次（灼熱咆哮的補師）');
  steer(tb(128.05), tb(131), (S2) => (S2.s.meso.m2 ? S2.s.meso.m2.by : null), mesoSpot('m2', 8));
  steer(tb(131), tb(134), (S2) => (S2.s.meso.m2 ? S2.s.meso.m2.by : null), mesoSpot('m2', 4.2));
  nuke(tb(132), tb(137));
  at(tb(136), () => show(s.garuda, false));
  featherRain(tb(136), tb(137), tb(138), '迦樓羅');
  at(tb(138.5), () => { S.despawn(s.garuda); s.garuda = null; });
  // 究極神兵本體：台風眼、誘導射線、光輝炎柱、擴散射線、火神爆裂
  at(tb(141), () => { ult.targetable = false; show(ult, false); });
  at(tb(143), () => { show(ult, true); ult.pos.x = 0; ult.pos.z = 0; ult.rot = 0; ult.targetable = true; S.log('究極神兵出現在 1 號位（面向 C）'); });
  at(tb(145), () => { s.faceTank = true; ult.moveTo(0, -4.8, 2.5); S.log('MT 把究極神兵往 A 點拉'); });
  eye(tb(145), tb(148), '究極神兵');
  laser(tb(148), tb(153));
  eye(tb(157), tb(159), '究極神兵');
  S.hazard({ t0: tb(158), tRes: tb(163), kind: 'circle', label: '光輝炎柱', castBy: ['究極神兵', '光輝炎柱', 2.0], geom: { x: 0, z: 0, r: 0 }, noKill: true });
  for (const p of [[7, 0], [-7, 0], [0, -6.6], [0, 6.6]]) {
    S.hazard({ t0: tb(158), tRes: tb(163), kind: 'circle', label: 'Radiant Plume', geom: { x: p[0], z: p[1], r: K.PLUME_C_R }, killMsg: '被光輝炎柱擊中：台風眼消失後往外走' });
  }
  const diffractive = (tRes) => {
    let tg = null;
    S.hazard({
      t0: tRes - 1.5, omen: tRes - 1.5, tRes, kind: 'cone', label: '擴散射線', tankSafe: true, tankDmg: 50, buster: true,
      geom: () => { tg = S.mainTank(); return { x: ult.pos.x, z: ult.pos.z, rot: Math.atan2(tg.pos.x - ult.pos.x, tg.pos.z - ult.pos.z), half: K.DIFF_HALF, len: K.DIFF_LEN, npcIgnore: [tg.slot] }; },
      follow: (f) => { f.x = ult.pos.x; f.z = ult.pos.z; f.rot = Math.atan2(tg.pos.x - ult.pos.x, tg.pos.z - ult.pos.z); },
      killMsg: '被擴散射線（究極神兵朝 MT 的扇形）擊中：非坦克不能站在 MT 那一側',
    });
  };
  diffractive(tb(165));
  // 火神爆裂：沒有群盾（補師的群體減傷）也沒開防擊退 → 被擊飛（台風眼中被擊出場外）
  const shieldOn = (slot, t) => S.statuses.some((x) => x.slot === slot && x.id === 'pmit' && S.t >= x.t0 && x.t1 !== null && x.t1 >= t);
  const vulcan = (tRes) => {
    at(tRes - 2.6, () => {
      if (S.alive().every((c) => shieldOn(c.slot, tRes))) return;
      for (const k of [H2, H1]) {
        const c = S.chars[k];
        if (!c.alive || !c.auto || (c.cd.pmit || 0) > S.t) continue;
        S.aiFree(c);
        if (S.useSkill(k, 'pmit').why === undefined) return;
      }
    });
    at(tRes - 1.0, () => {   // 群盾沒蓋到：AI 自己開防擊退
      for (const c of S.alive()) {
        if (!c.auto || shieldOn(c.slot, tRes) || S.hasStatus(c.slot, 'antikb')) continue;
        const id = U.LOADOUT[c.slot].includes('arms') ? 'arms' : 'sure';
        if ((c.cd[id] || 0) > S.t) continue;
        S.aiFree(c); S.useSkill(c.slot, id);
      }
    });
    at(tRes - 1.5, () => S.cast('究極神兵', '火神爆裂', tRes - 1.5, 1.5));
    at(tRes, () => {
      S.screenFx.push({ t: S.t, type: 'raidwide', power: 0.7 }); S.sound('knock');
      for (const c of S.alive()) {
        if (shieldOn(c.slot, S.t)) continue;
        S.damage(c, 15, '火神爆裂', true);
        if (S.knock(c, ult.pos, K.VULCAN_KB, 0.7)) { c.stats.vulcanKb = (c.stats.vulcanKb || 0) + 1; if (S.humans.has(c.slot)) S.note('hit', '火神爆裂：沒有群盾也沒開防擊退，被擊飛', c.slot); }
      }
    });
  };
  eye(tb(168), tb(170), '究極神兵');
  vulcan(tb(169));
  laser(tb(173), tb(179));
  eye(tb(180), tb(182), '究極神兵');
  vulcan(tb(181));
  diffractive(tb(184));

  // ---------------------------------------------------------------- P4D：亂擊之究極幻想（3:05～4:00）
  at(tb(185), () => S.cast('究極神兵', '亂擊之究極幻想', tb(185), 3.0));
  at(tb(193), () => { ult.targetable = false; s.faceTank = false; });
  at(tb(194), () => show(ult, false));
  at(tb(195), () => {
    show(ult, true); ult.pos.x = 14.6; ult.pos.z = -14.2; ult.goal = null; face(ult, { x: 0, z: 0 });
    s.garuda = S.actor('garuda', 'Garuda', -14.2, -14.0, 0);
    s.ifrit = S.actor('ifrit', '伊弗利特', 14.6, 13.6, 0);
    s.titan = S.actor('titan', '泰坦', -14.0, 14.2, 0);
    s.clones = [[-6.0, -6.0], [6.2, 6.0]].map((p, k) => { const a = S.actor('sister', k ? 'Chirada' : 'Suparna', p[0], p[1], 0); a.tint = k ? '#e0b25a' : '#56d0d0'; return a; });
    for (const a of [s.garuda, s.ifrit, s.titan, ...s.clones]) { a.targetable = false; face(a, { x: 0, z: 0 }); }
    S.log('究極神兵（東北）、迦樓羅（西北）、泰坦（西南）、伊弗利特（東南）、2 隻分身出現：人群在 A 點和究極神兵之間', -1, true);
  });
  // 伊弗利特：地火噴發（6 名非坦克中 3 人，連續 4 次；第 4 次不點石牢的人）
  let eBaits = [];
  at(tb(197), () => {
    eBaits = SU.erupt.filter((k) => S.chars[k].alive);
    for (const k of eBaits) S.mark(k, 'erupt', tb(197), tb(206));
    S.cast('伊弗利特', '地火噴發', tb(197), 2.0);
    S.log(`地火噴發：${eBaits.map((k) => ROLES[k].key).join('、')}（人群一起移動，先走出圈就停）`, -1, true);
  });
  [197, 199, 201, 203].forEach((t, i) => {
    let spots = [];
    at(tb(t), () => {
      spots = eBaits.filter((k) => S.chars[k].alive && !(i === 3 && k === s.gaolWho)).map((k) => ({ x: S.chars[k].pos.x, z: S.chars[k].pos.z }));
      for (const p of spots) S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.ERUPT_D_R, t0: tb(t), t1: tb(t + 3), label: 'Eruption', tint: 'danger', npcIgnore: [MT, OT] });
    });
    at(tb(t + 3), () => {
      for (const c of S.alive()) {
        if (!spots.some((p) => inCircle(c.pos, p, K.ERUPT_D_R))) continue;
        if (isTank(c.slot)) S.damage(c, 50, 'Eruption', true); else S.kill(c, `被地火噴發（半徑 ${K.ERUPT_D_R}）擊中：人群要一起走出圈`);
      }
    });
  });
  at(tb(203.5), () => show(s.ifrit, false));
  // 分身：寒風之歌（點名剩下 3 人中的 2 人），坦克在分身和目標之間擋線（MT 擋東南分身、OT 擋西北分身），擋線處生成大龍捲風
  [0, 1].forEach((k) => {
    at(tb(198), () => {
      const tgt = S.pickAlive(SU.song[k], [SU.song[k], SU.pillar, ...NON_TANKS_ORDER]);
      const sg = { src: s.clones[k], tgt };
      s.songs[k] = sg;
      S.mark(tgt, 'song', tb(198), tb(202.5));
      const fx = S.addFx({ kind: 'rect', x: sg.src.pos.x, z: sg.src.pos.z, w: K.SONG_HALF * 2, len: K.SONG_LEN, t0: tb(200), assistFrom: tb(198), t1: tb(202.5), label: 'Mistral Song（分身）', tint: 'line', harmless: true });
      fx.follow = (f) => { const t = S.chars[sg.tgt].pos; f.x = sg.src.pos.x; f.z = sg.src.pos.z; f.rot = Math.atan2(t.x - sg.src.pos.x, t.z - sg.src.pos.z); };
    });
    at(tb(200), () => S.cast(k ? 'Chirada' : 'Suparna', '寒風之歌', tb(200), 2.5));
    at(tb(202.5), () => {
      const sg = s.songs[k], src = sg.src.pos, tg = S.chars[sg.tgt];
      const rot = Math.atan2(tg.pos.x - src.x, tg.pos.z - src.z);
      const line = S.alive().filter((c) => inRect(c.pos, src, rot, K.SONG_HALF, K.SONG_LEN)).sort((a, b) => dist(a.pos, src) - dist(b.pos, src));
      const first = line[0];
      s.gw[k] = first ? { x: first.pos.x, z: first.pos.z } : { x: tg.pos.x, z: tg.pos.z };
      if (!first) return;
      if (isTank(first.slot)) { S.damage(first, 59, '寒風之歌', true); first.stats.intercepts = (first.stats.intercepts || 0) + 1; S.log(`${first.key} 擋下寒風之歌`, first.slot); }
      else S.kill(first, '寒風之歌：直線最前方不是坦克（坦克要站在分身和目標之間擋線）');
      for (const c of line.slice(1)) S.damage(c, 15, '寒風之歌（站在擋線者後方被波及）');
    });
    for (const [a, b] of [[206, 207.5], [207.6, 209.5]]) {
      S.hazard({ t0: tb(a), tRes: tb(b), kind: 'circle', label: '大龍捲風', tint: 'danger',
        geom: () => ({ x: s.gw[k].x, z: s.gw[k].z, r: K.GW_R }), killMsg: '被大龍捲風（擋寒風之歌的位置）擊中' });
    }
  });
  at(tb(198.01), () => S.log(`分身寒風之歌點名 ${s.songs.map((x) => ROLES[x.tgt].key).join('、')}：OT 擋西北分身、MT 擋東南分身（站在分身和目標之間）`, -1, true));
  steer(tb(198.1), tb(202.5), () => MT, songSpot(1, 3.0));
  steer(tb(198.1), tb(202.5), () => OT, songSpot(0, 3.5));
  at(tb(205), () => s.clones.forEach((a) => show(a, false)));
  at(tb(207.5), () => { s.clones.forEach((a) => S.despawn(a)); s.clones = []; });
  // 泰坦：花崗石牢（地火噴發 3 人之一）→ 跑去 2 號標點被關（無敵），之後全員打掉
  at(tb(200), () => {
    const k = [SU.gaol, ...SU.erupt].find((x) => S.chars[x].alive);
    if (k === undefined) return;
    s.gaolWho = k;
    S.mark(k, 'gaol', tb(200), tb(204));
    S.cast('泰坦', '花崗石牢', tb(200), 1.0);
    S.log(`花崗石牢點名 ${ROLES[k].key}：立刻直線跑向 2 號標點（1 號位西北約 10 碼）`, -1, true);
  });
  at(tb(204), () => {
    if (s.gaolWho === null) return;
    const c = S.chars[s.gaolWho];
    s.gaolPos = { x: c.pos.x, z: c.pos.z };
    if (!c.alive) return;
    c.stunUntil = 999; c.invulnUntil = 999; c.goal = null; c.cast = null; S.addStatus(c.slot, 'gaol', null);
    c.stats.gaolOk = Math.hypot(c.pos.x - K.WM2[0], c.pos.z - K.WM2[1]) <= K.GAOL_TOL;
  });
  at(tb(206), () => {
    if (s.gaolWho === null) return;
    s.gaolActor = S.actor('gaol', '花崗石牢', s.gaolPos.x, s.gaolPos.z, 0);
    S.cast('花崗石牢', '花崗岩衝擊（覺醒）', tb(206), 3.0);
    S.log('花崗石牢出現：人群一邊閃躲一邊打掉');
  });
  at(tb(209), () => {
    if (s.gaolWho === null) return;
    const c = S.chars[s.gaolWho];
    S.despawn(s.gaolActor);
    if (c.alive) { c.stunUntil = 0; c.invulnUntil = S.t + 0.3; S.removeStatus(c.slot, 'gaol'); }
    S.log('花崗石牢被擊破');
  });
  // 迦樓羅：召喚羽毛（覺醒）4 根在斜點，3:25 起逆時針旋轉（碰到即死），3:40 停、3:42 爆炸
  at(tb(200), () => {
    s.feathers = [45, 135, 225, 315].map((b) => { const p = atBearing(b, K.FEATHER_R); const a = S.actor('feather', '羽毛', p.x, p.z, 0); a.targetable = false; a.b0 = b; return a; });
    s.featherOn = true;
    S.cast('Garuda', '召喚羽毛（覺醒）', tb(200), 1.0);
    S.log('迦樓羅在 4 個斜點召喚羽毛：3:25 開始逆時針旋轉，碰到即死（不要靠近場邊）', -1, true);
  });
  for (let i = 0; i < 4; i++) {
    S.hazard({ t0: tb(220), tRes: tb(222), kind: 'circle', label: '羽毛爆炸', geom: () => ({ x: s.feathers[i].pos.x, z: s.feathers[i].pos.z, r: K.FEATHER_BOOM }), killMsg: '被羽毛爆炸擊中：羽毛停下後要離開場邊' });
  }
  at(tb(222), () => { s.feathers.forEach((a) => S.despawn(a)); s.feathers = []; s.featherOn = false; });
  // 迦樓羅：寒風之歌（覺醒）大扇形（被關在石牢的人無敵）
  S.hazard({ t0: tb(203), tRes: tb(205), snap: tb(204.4), kind: 'cone', label: '寒風之歌（覺醒）', castBy: ['Garuda', '寒風之歌（覺醒）', 1.4],
    geom: () => ({ x: s.garuda.pos.x, z: s.garuda.pos.z, rot: Math.atan2(-s.garuda.pos.x, -s.garuda.pos.z), half: K.GSONG_HALF, len: K.GSONG_LEN }),
    killMsg: '被迦樓羅的寒風之歌（覺醒）擊中：西北的大扇形，要離開' });
  // 究極神兵：光柱（剩下的 1 名非坦克，腳下連續 6 次小範圍，要持續移動）
  at(tb(203), () => {
    s.pillarWho = S.pickAlive(SU.pillar, [SU.pillar, ...NON_TANKS_ORDER]);
    S.mark(s.pillarWho, 'pillar', tb(203), tb(213));
    S.cast('究極神兵', '光柱', tb(203), 1.0);
    S.log(`光柱點名 ${ROLES[s.pillarWho].key}：腳下連續 6 次小範圍，人群要一直移動`, -1, true);
  });
  for (let k = 0; k < 6; k++) {
    let spot = null;
    const hit = tb(208 + k);
    at(hit - 2.0, () => {
      const c = S.chars[s.pillarWho];
      if (!c.alive) { spot = null; return; }
      spot = { x: c.pos.x, z: c.pos.z };
      S.addFx({ kind: 'circle', x: spot.x, z: spot.z, r: K.PILLAR_R, t0: hit - 2.0, t1: hit, label: '光柱', tint: 'danger' });
    });
    at(hit, () => {
      if (!spot) return;
      for (const c of S.alive()) {
        if (!inCircle(c.pos, spot, K.PILLAR_R)) continue;
        if (c.slot !== s.pillarWho) { const o = S.chars[s.pillarWho]; o.stats.pillarHits = (o.stats.pillarHits || 0) + 1; }
        S.kill(c, '被光柱擊中：要一直移動，不要停在之前的位置');
      }
    });
  }
  // 飛翎雨：分身（3:26）、迦樓羅（3:27）
  at(tb(206), () => show(s.garuda, false));
  featherRain(tb(205), tb(206), tb(207), '分身');
  featherRain(tb(206), tb(207), tb(208), '迦樓羅');
  // 究極神兵：魔科學激光 ×3（3 條固定路徑隨機）
  const LPATH = [Math.atan2(-14.6, 14.2), -PI / 2, 0];   // 穿過場中往西南、沿北邊往西、沿東邊往南
  [[206, 208], [210, 213], [214, 217]].forEach(([a, b], i) => S.hazard({
    t0: tb(a), omen: tb(b) - 1.2, assistFrom: tb(a), tRes: tb(b), kind: 'rect', label: '魔科學激光', castBy: ['究極神兵', '魔科學激光', b - a],
    geom: () => ({ x: ult.pos.x, z: ult.pos.z, rot: LPATH[SU.lasers[i]], w: K.MLASER_W, len: 44 }),
    killMsg: '被魔科學激光擊中（3 條固定路徑之一，讀條時避開 3 條路徑）',
  }));
  // 3:32 迦樓羅、伊弗利特回來；泰坦覺醒地裂、中高壓（OT 擋）、烈焰碎擊
  at(tb(212), () => {
    show(s.garuda, true); s.garuda.pos.x = -14.2; s.garuda.pos.z = -14.0;
    show(s.ifrit, true); s.ifrit.pos.x = 14.8; s.ifrit.pos.z = 14.2; face(s.ifrit, { x: 0, z: 0 });
  });
  landslideC('泰坦', () => s.titan.pos, tb(214), tb(216.5), tb(219));
  meso('m3', tb(214), tb(220), SU.meso, [OT, MT, H2, H1, CC, RR, M1, M2], '第三次（OT）');
  steer(tb(214.05), tb(217.15), (S2) => (S2.s.meso.m3 ? S2.s.meso.m3.by : null), mesoSpot('m3', 9.9));
  steer(tb(217.15), tb(220), (S2) => (S2.s.meso.m3 ? S2.s.meso.m3.by : null), mesoSpot('m3', 7.2));
  crush(tb(215), tb(220), SU.crush, [MT, H1, H2, M1, M2, RR, CC]);
  at(tb(221), () => { S.despawn(s.ifrit); S.despawn(s.titan); s.ifrit = null; s.titan = null; });
  nuke(tb(221), tb(227));
  at(tb(222), () => show(s.garuda, false));
  featherRain(tb(222), tb(223), tb(224), '迦樓羅');
  at(tb(224.5), () => { S.despawn(s.garuda); s.garuda = null; });
  // 第二次究極：OT 坦克 LB3
  at(tb(228), () => show(ult, false));
  at(tb(229), () => { S.lb = 3; S.log('極限技槽回復滿'); });
  at(tb(230), () => { show(ult, true); ult.pos.x = 0; ult.pos.z = 0; ult.rot = 0; S.log('究極神兵出現在 1 號位（面向 C）'); });
  at(tb(231), () => { ult.targetable = true; S.cast('究極神兵', '究極', tb(231), 5.0); S.log('究極神兵讀條究極：OT 開坦克 LB3', -1, true); });
  at(tb(240), () => {
    S.screenFx.push({ t: S.t, type: 'raidwide', power: 1 });
    for (const c of S.alive()) {
      if (S.hasStatus(c.slot, 'lbtank')) S.damage(c, 60, '究極（坦克 LB3 減傷）', true);
      else S.kill(c, '究極：沒有坦克 LB3 的減傷（OT 要在 3:51～3:59 使用）', { force: true });
    }
  });
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

  // ---------------------------------------------------------------- P4C 走位
  // 攻略圖的分工：伊弗利特在西南、H1 灼熱咆哮、C 擋第一次中高壓。實際分工不同時把站位換給實際的人；mirror：伊弗利特在東南時左右鏡像（OT 不鏡像）
  const swap = (a, x, y) => { if (x !== y && x !== null && y !== null) { const t = a[x]; a[x] = a[y]; a[y] = t; } };
  const posC = (id, o) => (S2) => {
    const a = fp(id), opt = o || {};
    swap(a, H1, S2.s.searWho);
    if (opt.mirror && mx < 0) for (let i = 0; i < 8; i++) if (a[i] && i !== OT) a[i] = [-a[i][0], a[i][1]];
    if (opt.meso) {
      const th = S2.s.meso[opt.meso[0]];
      // 攻略圖上擋線的人（灼熱咆哮的補師已經換過站位）
      const cur = opt.meso[2] === H1 && S2.s.searWho !== null ? S2.s.searWho : opt.meso[2];
      if (th && th.by !== null) { swap(a, cur, th.by); const p = mesoSpot(opt.meso[0], opt.meso[1])(S2); if (p) a[th.by] = p; }
    }
    if (opt.rain) for (let i = 0; i < 8; i++) if (a[i]) a[i] = repel(a[i], S2.s.rain || [], K.RAIN_R + 1.0);
    for (const k of opt.drop || []) a[k] = null;
    return a;
  };
  /** 以太炸彈期間：OT 倒地由 MT 去撞；MT 倒地時 OT 接手主坦站位，撞球位置也給 OT。 */
  const MVO = (t, id, title, spots, tip, frame, opt) => S.move(t, id, title, (S2) => {
    const a0 = spots(S2), orbSpot = a0[OT], a = S2.swapTanks(a0);
    if (orbSpot) { if (!S2.chars[OT].alive) a[MT] = orbSpot; else if (!S2.chars[MT].alive) a[OT] = orbSpot; }
    return AI.sanitize(S2, a);
  }, Object.assign({ tip: tipf(tip), frame, noSwap: true }, opt || {}));
  const searTip = (S2, slot) => slot === S2.s.searWho;
  MV(tb(96.2), 'c0', '爆擊之究極幻想：全員 1 號位', posC('P4C-F01'), {
    MT: '挑釁拿回主仇（OT 退避）。全員 1 號位集合，之後究極神兵會出現在 A 點前。', def: '全員 1 號位集合。之後究極神兵出現在 A 點前、迦樓羅在 C、伊弗利特和泰坦在 C 兩側的斜點。',
  }, 'P4C-F01', { spread: true });
  MV(tb(104.6), 'c-f02', '到究極神兵右腳前集合', posC('P4C-F02'), { def: '究極神兵出現在 A 點前（面向南）：全員到他右腳前（西側）集合。' }, 'P4C-F02', { spread: true });
  MV(tb(108.05), 'c-wol1', '大地之重①：移到左腳前', posC('P4C-F04'), { def: '大地之重落在腳下：全員移到究極神兵左腳前（東側）。烈焰碎擊要 8 人一起分攤。' }, 'P4C-F04', { spread: true, jitter: false });
  MV(tb(111.05), 'c-wol2', '大地之重②：移到右腳前', posC('P4C-F06'), { def: '大地之重第 2 輪：全員移回右腳前（西側）。迦樓羅放台風眼（要在場中半徑 13 以內）、中高壓連線。' }, 'P4C-F06', { spread: true, jitter: false });
  MVO(tb(114.05), 'c-wol3', '大地之重③：順時針繞開；OT 撞球、C 擋中高壓', posC('P4C-F07', { meso: ['m1', 10, CC] }), {
    OT: '以太炸彈出現在究極神兵左腳前：去撞掉（之後還有 3 個，一樣由你撞）。',
    C: '用 P1 遺留的低氣壓擋中高壓：站在迦樓羅和被連線者之間的線上（往 C 點方向）。',
    def: '大地之重第 3 輪：貼著究極神兵順時針繞到西北側，離以太炸彈遠一點。',
  }, 'P4C-F07', { jitter: false });
  MV(tb(117.1), 'c-f09', '擋完中高壓：回人群', (S2) => { const by = S2.s.mesoBy.m1; return by === null || by === undefined ? Array(8).fill(null) : only([[by, posC('P4C-F09')(S2)[CC]]]); }, {
    def: '擋完中高壓：回人群（先往西繞開以太炸彈的位置）。',
  }, 'P4C-F09', { preview: false, jitter: false });
  MVO(tb(118.05), 'c-rain1', '飛翎雨：往北邊場邊；灼熱咆哮的補師往 C 跑', posC('P4C-F10', { rain: true }), {
    def: (S2, slot) => (searTip(S2, slot) ? '你被點名灼熱咆哮（半徑 14）：立刻往 C 點跑，遠離人群；之後還要擋第二次中高壓。' : '迦樓羅上天放飛翎雨（落在此刻腳下）：全員往北邊場邊移動。'),
  }, 'P4C-F10', { preview: false, jitter: false });
  MVO(tb(120.05), 'c-f10', 'OT 撞第 2 個以太炸彈', posC('P4C-F10'), { OT: '撞第 2 個以太炸彈，之後回北邊人群。', def: '在北邊場邊待著。' }, 'P4C-F10', { spread: true });
  MV(tb(121.3), 'c-f11', 'OT 回北邊人群', posC('P4C-F11'), {
    def: (S2, slot) => (searTip(S2, slot) ? '待在 C 點場邊。' : '北邊場邊集合：伊弗利特會穿過場中俯衝、泰坦放覺醒地裂。'),
  }, 'P4C-F11', { spread: true });
  MV(tb(126.05), 'c-f13', '地裂第一波後：踩進第一波的線（躲第二波）', posC('P4C-F13', { mirror: true }), {
    OT: '往東北移動（之後回去撞第 3 個以太炸彈）。',
    def: (S2, slot) => (searTip(S2, slot) ? '移到伊弗利特原本的位置（場邊斜點）。' : '地裂第一波結束：踩進第一波的線上躲第二波；十字火焰不致死。'),
  }, 'P4C-F13', { spread: true, jitter: false });
  MV(tb(128.05), 'c-f16', '回究極神兵西北側；補師擋第二次中高壓', posC('P4C-F16', { meso: ['m2', 8, H1], drop: [OT] }), {
    def: (S2, slot) => (searTip(S2, slot) ? '用低氣壓擋第二次中高壓：站在迦樓羅和被連線者之間（台風眼結束前要在場中半徑 13 以內）。' : '回究極神兵西北側（台風眼：要在場中半徑 13 以內）。'),
  }, 'P4C-F16', { spread: true, jitter: false });
  MVO(tb(129.0), 'c-orb3', 'OT 撞第 3 個以太炸彈', (S2) => only([[OT, FR['P4C-F18'].pos.OT.slice()]]), { OT: '回究極神兵左腳前撞第 3 個以太炸彈，撞完留在原地（第 4 個會直接出現在你腳下）。', def: '' }, 'P4C-F18', { jitter: false });
  MV(tb(131.05), 'c-f20', '補師靠近迦樓羅擋線', posC('P4C-F20', { meso: ['m2', 4.2, H1], drop: [OT] }), {
    def: (S2, slot) => (searTip(S2, slot) ? '台風眼消失：靠近迦樓羅，繼續擋中高壓。' : '待在究極神兵西北側。'),
  }, 'P4C-F20', { spread: true, jitter: false });
  MV(tb(134.1), 'c-f21', '中高壓結束', posC('P4C-F21', { drop: [OT] }), { def: '待在究極神兵西北側。' }, 'P4C-F21', { spread: true });
  MV(tb(136.05), 'c-rain2', '飛翎雨：到北邊場邊', posC('P4C-F22', { rain: true }), {
    def: (S2, slot) => (searTip(S2, slot) ? '飛翎雨鎖定腳下：在南邊場邊移開。' : '迦樓羅上天放飛翎雨：全員移到北邊場邊（魔導核爆全屏攻擊）。'),
  }, 'P4C-F22', { preview: false, jitter: false });
  MV(tb(142.5), 'c-f24', '究極神兵回到 1 號位', posC('P4C-F24'), {
    MT: '究極神兵出現在 1 號位：站他北邊，之後往 A 點拉。', OT: '站究極神兵東北側（之後誘導射線打你）。',
    def: (S2, slot) => (searTip(S2, slot) ? '留在南邊場邊（灼熱咆哮還有 2 次）。' : '站究極神兵西北側。'),
  }, 'P4C-F24', { spread: true });
  MV(tb(144.8), 'c-f25', 'MT 往 A 拉；台風眼', posC('P4C-F25'), {
    MT: '把究極神兵往 A 點拉（他會停在 1 號位北邊），你站最北。', def: (S2, slot) => (searTip(S2, slot) ? '台風眼：進到場中半徑 13 以內（南邊）。' : '跟著究極神兵往北，站他西北側（台風眼：半徑 13 以內）。'),
  }, 'P4C-F25', { spread: true });
  MV(tb(147.6), 'c-f28', '灼熱咆哮結束：回人群', posC('P4C-F28'), {
    OT: '誘導射線打你：站究極神兵東側，離人群遠一點，開減傷。', def: '灼熱咆哮結束：全員在究極神兵西側集合。',
  }, 'P4C-F28', { spread: true });
  MV(tb(159.05), 'c-f30', '光輝炎柱：往外走', posC('P4C-F30'), {
    def: '台風眼消失：立刻往外走躲光輝炎柱（4 個大圓），判定後回究極神兵身邊。',
  }, 'P4C-F30', { spread: true, jitter: false });
  MV(tb(163.05), 'c-f31', '回究極神兵身邊：擴散射線／火神爆裂', posC('P4C-F31'), {
    MT: '擴散射線（朝你的扇形）：開減傷。火神爆裂：沒有群盾或防擊退會被擊飛（台風眼中會死）。',
    H1: '火神爆裂 ×2（2:49、3:01）：沒有群盾會被擊飛。AI 補師會開群體減傷；你是真人就在 2:46 左右開（15 秒蓋得到兩次），或開防擊退。',
    H2: '火神爆裂 ×2（2:49、3:01）：沒有群盾會被擊飛。AI 補師會開群體減傷；你是真人就在 2:46 左右開（15 秒蓋得到兩次），或開防擊退。',
    def: '回究極神兵身邊（不要站 MT 那一側）。火神爆裂：沒有群盾（補師的群體減傷）就開防擊退。',
  }, 'P4C-F31', { spread: true });

  // 擋中高壓的人（真人）：被連線者會移動，擋線位置定期更新
  const mesoGuide = (key, d, times, tip) => {
    for (const t of times) {
      MV(t, 'meso-' + key, '擋中高壓：站在迦樓羅和被連線者之間', (S2) => {
        const th = S2.s.meso[key], p = mesoSpot(key, d)(S2);
        return th && p ? only([[th.by, p]]) : Array(8).fill(null);
      }, { def: tip }, '', { preview: false, jitter: false });
    }
  };
  mesoGuide('m1', 10, [tb(115.0), tb(115.9), tb(116.5)], '擋中高壓：站在迦樓羅（C）和被連線者之間的線上，靠近迦樓羅那一側。');
  mesoGuide('m2', 8, [tb(129.2), tb(130.2)], '擋中高壓：站在迦樓羅（C）和被連線者之間的線上（台風眼結束前要在場中半徑 13 以內）。');
  mesoGuide('m2', 4.2, [tb(131.6), tb(132.6), tb(133.4)], '擋中高壓：靠近迦樓羅，留在線上。');
  // ---------------------------------------------------------------- P4D 走位
  // 攻略圖的分工：M1 花崗石牢；實際被關的人不同時對調站位
  const posD = (id, o) => (S2) => {
    const a = fp(id), opt = o || {};
    swap(a, M1, S2.s.gaolWho !== null ? S2.s.gaolWho : SU.gaol);
    if (opt.meso) {
      const th = S2.s.meso.m3;
      if (th && th.by !== null) { swap(a, OT, th.by); const p = mesoSpot('m3', opt.meso)(S2); if (p) a[th.by] = p; }
    }
    if (opt.rain) for (let i = 0; i < 8; i++) if (a[i]) a[i] = repel(a[i], S2.s.rain || [], K.RAIN_R + 1.0);
    for (const k of opt.drop || []) a[k] = null;
    if (opt.noGaol && S2.s.gaolWho !== null) a[S2.s.gaolWho] = null;   // 被關（或快被關）的人留在 2 號標點
    return a;
  };
  const gaolTip = (S2, slot) => slot === S2.s.gaolWho;
  MV(tb(193.2), 'd-f02', '亂擊之究極幻想：A 點和究極神兵之間', posD('P4D-F02'), {
    MT: '去東南分身附近（之後擋東南分身的寒風之歌）。', OT: '去西北分身東南側（之後擋西北分身的寒風之歌）。',
    def: '非坦克在 A 點和究極神兵（東北）之間集合：地火噴發點 3 人，人群一起沿東邊往南走。',
  }, 'P4D-F02', { spread: true });
  const eTip = { MT: '擋東南分身的寒風之歌：站在分身和被點名者之間的線上、靠近分身。', OT: '擋西北分身的寒風之歌：站在分身和被點名者之間的線上、靠近分身。', def: '地火噴發：人群一起走出圈就停（不要開衝刺），沿東邊往南。' };
  MV(tb(197.05), 'd-e1', '地火噴發①：人群往東移', posD('P4D-F04', { drop: [MT, OT] }), eTip, 'P4D-F04', { spread: true, jitter: false });
  MV(tb(199.05), 'd-e2', '地火噴發②：人群往南移', posD('P4D-F05', { drop: [MT, OT] }), eTip, 'P4D-F05', { spread: true, jitter: false });
  MV(tb(200.05), 'd-gaol', '花崗石牢：跑向 2 號標點', (S2) => (S2.s.gaolWho === null ? Array(8).fill(null) : only([[S2.s.gaolWho, K.WM2.slice()]])), {
    def: (S2, slot) => (gaolTip(S2, slot) ? '你被點名花崗石牢：立刻直線跑向 2 號標點（1 號位西北約 10 碼），3:24 被關住（無敵）。' : ''),
  }, 'P4D-F07', { jitter: false });
  MV(tb(201.05), 'd-e3', '地火噴發③：人群往西南移', posD('P4D-F07', { drop: [MT, OT] }), eTip, 'P4D-F07', { spread: true, jitter: false });
  for (const t of [198.1, 199.6, 200.8, 201.8]) {
    MV(tb(t), 'd-song', '坦克擋分身的寒風之歌', (S2) => only([[MT, songSpot(1, 3.0)(S2)], [OT, songSpot(0, 3.5)(S2)]].filter((x) => x[1])), eTip, 'P4D-F06', { preview: false, jitter: false });
  }
  MV(tb(202.6), 'd-f08', '坦克離開：躲迦樓羅的大扇形', (S2) => only([[MT, FR['P4D-F08'].pos.MT.slice()], [OT, FR['P4D-F08'].pos.OT.slice()]]), {
    MT: '擋完：跟人群到西南。', OT: '擋完：往東南走出迦樓羅（西北）的大扇形。', def: '',
  }, 'P4D-F08', { jitter: false });
  MV(tb(203.05), 'd-e4', '地火噴發④：人群往西移', posD('P4D-F08', { drop: [MT, OT], noGaol: true }), {
    def: (S2, slot) => (gaolTip(S2, slot) ? '被關在石牢裡（無敵）。' : slot === S2.s.pillarWho ? '光柱點名你：之後腳下連續 6 次小範圍，跟人群一直移動。' : '人群往西移：迦樓羅的大扇形（西北）不要進去。'),
  }, 'P4D-F08', { spread: true, jitter: false });
  const dTip = { OT: '在石牢北側閃躲。', def: (S2, slot) => (gaolTip(S2, slot) ? '被關在石牢裡（無敵）。' : '一邊打石牢一邊移動：躲光柱、飛翎雨、魔科學激光（讀條時避開 3 條路徑）、旋轉的羽毛。') };
  MV(tb(205.05), 'd-f10', '分身飛翎雨：往西移', posD('P4D-F10', { rain: true, noGaol: true }), dTip, 'P4D-F10', { preview: false, jitter: false });
  MV(tb(206.05), 'd-f11', '迦樓羅飛翎雨：往北移', posD('P4D-F11', { rain: true, noGaol: true }), dTip, 'P4D-F11', { preview: false, jitter: false });
  for (const [t, id] of [[207.05, 'P4D-F12'], [208.05, 'P4D-F13'], [209.05, 'P4D-F14'], [210.05, 'P4D-F15']]) {
    MV(tb(t), 'd-move', '光柱：持續移動', posD(id, { noGaol: t < 209 }), dTip, id, { preview: false, jitter: false });
  }
  MV(tb(211.05), 'd-f16', '往 1 號位（魔科學激光穿過場中時先等）', posD('P4D-F16'), {
    def: '往 1 號位移動；魔科學激光如果走穿過場中的路徑，等它打完（爆炸）再進去。',
  }, 'P4D-F16', { preview: false, jitter: false, spread: true });
  MV(tb(213.1), 'd-f17', '全員 1 號位集合', posD('P4D-F17'), { def: '全員 1 號位集合：泰坦覺醒地裂、中高壓、烈焰碎擊。' }, 'P4D-F17', { spread: true, jitter: false });
  MV(tb(214.1), 'd-f20', '往東南閃地裂和激光；OT 擋中高壓', posD('P4D-F20', { meso: 9.9 }), {
    OT: '用低氣壓擋中高壓：站在迦樓羅（西北）和被連線者之間的線上，之後往迦樓羅靠近。',
    def: '往伊弗利特（東南）方向移出地裂和魔科學激光的範圍；烈焰碎擊 7 人分攤。',
  }, 'P4D-F20', { spread: true, jitter: false });
  MV(tb(217.1), 'd-f21', '回 1 號位（躲地裂第二波）', posD('P4D-F21', { meso: 7.2 }), {
    OT: '繼續擋中高壓，往迦樓羅靠近（躲地裂第二波）。', def: '地裂第一波結束：回 1 號位（第一波的線上），烈焰碎擊分攤。',
  }, 'P4D-F21', { spread: true, jitter: false });
  mesoGuide('m3', 9.9, [tb(215.2), tb(216.2)], '擋中高壓：站在迦樓羅（西北）和被連線者之間的線上。');
  mesoGuide('m3', 7.2, [tb(218.2), tb(219.3)], '擋中高壓：往迦樓羅靠近（躲地裂第二波），留在線上。');
  MV(tb(220.1), 'd-ot', 'OT 離開羽毛', (S2) => { const by = S2.s.mesoBy.m3; return only([[by === null || by === undefined ? OT : by, FR['P4D-F23'].pos.OT.slice()]]); }, { OT: '中高壓結束：離開場邊（羽毛 3:42 爆炸）。', def: '' }, 'P4D-F23', { jitter: false });
  MV(tb(222.05), 'd-rain', '飛翎雨：散開', posD('P4D-F23', { rain: true }), { def: '迦樓羅上天放飛翎雨：離開原本的位置（魔導核爆全屏攻擊）。' }, 'P4D-F23', { preview: false, jitter: false });
  MV(tb(228.5), 'd-f24', '究極：在究極神兵北側集合', posD('P4D-F24'), {
    OT: '究極神兵讀條究極：3:51～3:59 用坦克 LB3（技能列的 LB）。', def: '在究極神兵北側集合，等 OT 的坦克 LB3 扛下究極。',
  }, 'P4D-F24', { spread: true });
}

// ---------------------------------------------------------------- 隊友 AI
/** 撞以太炸彈的人：OT，OT 倒地時 MT。 */
const orbPopper = (S) => (S.chars[OT].alive ? OT : S.chars[MT].alive ? MT : null);
const AI = U.AI.make({
  horizon: 4.5, margin: 0.9,
  edge: (S) => (S.s.featherOn ? K.FEATHER_EDGE : S.edgeR - 1.0),   // 羽毛旋轉時遠離場邊
  // 還沒撞掉的以太炸彈：撞球的人以外不要靠近（爆炸範圍）
  extra: (S, c) => {
    const orbs = S.s.orbs.filter((o) => !o.popped);
    if (!orbs.length || c.slot === orbPopper(S)) return null;
    return (p) => orbs.some((o) => Math.hypot(p.x - o.a.pos.x, p.z - o.a.pos.z) <= K.ORB_BLAST + 0.6);
  },
});
/** 撞掉以太炸彈：周圍（半徑 ORB_BLAST）受傷，撞的人小傷。 */
function popOrb(S, o, by) {
  const p = { x: o.a.pos.x, z: o.a.pos.z };
  o.popped = true; S.despawn(o.a);
  S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.ORB_BLAST, t0: S.t, t1: S.t + 0.4, label: '以太炸彈爆炸', tint: 'meso', harmless: true });
  S.sound('boom');
  by.stats.orbPops = (by.stats.orbPops || 0) + 1;
  for (const c of S.alive()) {
    if (dist(c.pos, p) > K.ORB_BLAST) continue;
    if (c === by) { S.damage(c, 20, '以太炸彈', true); continue; }
    S.damage(c, 30, '以太炸彈爆炸（離撞球的人太近）');
    c.stats.orbHits = (c.stats.orbHits || 0) + 1;
  }
  S.log(`${by.key} 撞掉以太炸彈`, by.slot);
}
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
  // 以太炸彈：放置 0.3 秒後碰到就爆炸；時間內沒撞掉 → 團滅
  for (const o of s.orbs) {
    if (o.popped) continue;
    const c = S.t >= o.t0 + 0.3 ? S.alive().find((x) => dist(x.pos, o.a.pos) <= K.ORB_TOUCH) : null;
    if (c) popOrb(S, o, c);
    else if (S.t >= o.until) {
      o.popped = true; S.despawn(o.a);
      S.screenFx.push({ t: S.t, type: 'raidwide', power: 1 });
      const k = orbPopper(S);
      s.wipe(k === null ? OT : k, '以太炸彈沒有在時間內撞掉（OT 要在放置後幾秒內去撞）');
    }
  }
  // 羽毛（覺醒）：逆時針旋轉，碰到即死
  if (s.feathers.length) {
    const k = Math.max(0, Math.min(K.SPIN1, S.t) - K.SPIN0);
    for (const a of s.feathers) { const p = atBearing(a.b0 - K.FEATHER_SPEED * k, K.FEATHER_R); a.pos.x = p.x; a.pos.z = p.z; a.rot = Math.atan2(-p.x, -p.z); }
    for (const c of S.alive()) if (s.feathers.some((a) => dist(c.pos, a.pos) <= K.FEATHER_HIT)) S.kill(c, '碰到迦樓羅的羽毛（覺醒）：羽毛旋轉時不要靠近場邊');
  }
  // AI 擋線：持續走向線上的位置（被連線者會移動）
  for (const st of s.steer) {
    if (S.t < st.from || S.t > st.to) continue;
    const k = st.slot(S);
    if (k === null || k === undefined) continue;
    const c = S.chars[k];
    if (!c.alive || !c.auto || S.t < c.stunUntil || c.kb) continue;
    const p = st.spot(S);
    if (p) { c.goal = { x: p[0], z: p[1] }; c.goalAt = S.t; }
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
  for (const task of LB_TASKS) {
    if (task.slot !== slot || S.t < task.from) continue;
    out.push({ ok: S.lbLog.some((l) => l.slot === slot && l.kind === task.kind && l.lv >= 3 && l.t >= task.from - 0.6 && l.t <= task.by), text: task.what });
  }
  if (S.t >= tb(17) && (slot === MT || slot === OT)) {
    if (slot === MT) out.push({ ok: !st.stickyHits, text: '吸附以太炸彈：遠離人群單吃（沒有波及隊友）' });
    if (slot === OT) out.push({ ok: !st.laserHits, text: '誘導射線：遠離人群單吃（沒有波及隊友）' });
  }
  if (S.t >= tb(65) && (slot === RR || slot === CC)) out.push({ ok: !st.eruptHits, text: '地火噴發：沿場邊跑，沒有炸到隊友' });
  const s = S.s;
  if (S.t >= tb(134) && slot === OT) out.push({ ok: (st.orbPops || 0) >= 4, text: '以太炸彈：4 個都由你撞掉' });
  for (const m of s.mesoLog) if (m.slot === slot) out.push({ ok: m.ok, text: `中高壓${m.label}：用低氣壓擋線` });
  if (S.t >= tb(148) && slot === s.searWho) out.push({ ok: !st.searHits, text: '灼熱咆哮（覺醒）：遠離人群，沒有波及隊友' });
  if (S.t >= tb(181.5)) out.push({ ok: !st.vulcanKb, text: '火神爆裂：有群盾或防擊退，沒有被擊飛' });
  if (S.t >= tb(204) && slot === s.gaolWho) out.push({ ok: !!st.gaolOk, text: '花崗石牢：在 2 號標點被關住' });
  if (S.t >= tb(213) && slot === s.pillarWho) out.push({ ok: !st.pillarHits, text: '光柱：持續移動，沒有讓隊友被打到' });
  if (S.t >= tb(202.5) && isTank(slot)) out.push({ ok: (st.intercepts || 0) >= 1, text: '擋下分身的寒風之歌' });
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
  { t: tb(95.5), name: '爆擊：大地之重／中高壓／以太炸彈' },
  { t: tb(117.5), name: '爆擊：灼熱咆哮／深紅旋風／地裂' },
  { t: tb(142), name: '爆擊：台風眼／光輝炎柱／火神爆裂' },
  { t: tb(184.5), name: '亂擊：地火噴發／寒風之歌／石牢' },
  { t: tb(204.5), name: '亂擊：光柱／魔科學激光／羽毛' },
  { t: tb(213), name: '亂擊：地裂／中高壓／烈焰碎擊' },
  { t: tb(227.5), name: '究極（坦克 LB3）' },
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
  [tb(96), '爆擊之究極幻想：MT 挑釁，全員 1 號位'],
  [tb(105), '究極神兵在 A 點前：全員到他右腳前'],
  [tb(108), '大地之重 ×3：右腳→左腳→右腳；烈焰碎擊 8 人分攤'],
  [tb(111), '台風眼（半徑 13 以內）＋中高壓：C 用低氣壓擋線'],
  [tb(114), '以太炸彈：OT 撞；其他人順時針繞到西北'],
  [tb(118), '灼熱咆哮（覺醒）：被點的補師往 C 跑；飛翎雨'],
  [tb(122), '深紅旋風（俯衝）＋泰坦覺醒地裂'],
  [tb(126), '地裂第一波後：踩進第一波的線'],
  [tb(128), '台風眼＋中高壓：灼熱咆哮的補師擋線'],
  [tb(132), '魔導核爆；飛翎雨（往北）'],
  [tb(143), '究極神兵回到 1 號位，MT 往 A 拉'],
  [tb(148), '誘導射線（OT）'],
  [tb(157), '台風眼＋光輝炎柱：台風眼消失後往外走'],
  [tb(165), '擴散射線（MT）'],
  [tb(168), '台風眼＋火神爆裂：要有群盾或防擊退'],
  [tb(173), '誘導射線（OT）'],
  [tb(180), '台風眼＋火神爆裂'],
  [tb(185), '亂擊之究極幻想'],
  [tb(195), '五個敵人出現：非坦克在 A 和究極神兵之間'],
  [tb(197), '地火噴發 ×4：人群沿東邊往南走'],
  [tb(198), '分身寒風之歌：MT 擋東南、OT 擋西北'],
  [tb(200), '花崗石牢：被點的人跑向 2 號標點；羽毛出現'],
  [tb(203), '迦樓羅大扇形（西北）；光柱點名'],
  [tb(205), '羽毛逆時針旋轉；飛翎雨 ×2；大龍捲風'],
  [tb(206), '魔科學激光 ×3：避開 3 條路徑'],
  [tb(213), '全員 1 號位'],
  [tb(214), '泰坦覺醒地裂；中高壓（OT 擋）；烈焰碎擊 7 人'],
  [tb(221), '魔導核爆；羽毛爆炸；飛翎雨'],
  [tb(231), '究極：OT 坦克 LB3'],
];
const ROLE_DESC = [
  'P4A 在 1 號位；P4B 開場把究極神兵拉向外並遠離人群吃吸附以太炸彈（0:17 爆炸單吃）；追擊之後的第二次吸附以太炸彈也要離開人群，OT 挑釁後你是第 2 仇恨，吃誘導射線。爆擊：挑釁拿回主仇，2:25 把究極神兵往 A 拉，吃擴散射線。亂擊：擋東南分身的寒風之歌。',
  'P4A：0:48 用坦克 LB3（終極堡壘）扛究極。P4B 開場拿第 2 仇恨，遠離人群單吃誘導射線；火獄之鎖連你；第二次吸附以太炸彈時挑釁接主仇。爆擊：撞掉 4 個以太炸彈、吃 2 次誘導射線。亂擊：擋西北分身的寒風之歌、用低氣壓擋中高壓；3:51 用坦克 LB3 扛第二次究極。',
  'P4A：死亡宣告＋擊倒結束後（0:26）立刻用治療 LB3（生命鼓動）解除死亡宣告。爆擊：可能被點灼熱咆哮（往 C 跑、用低氣壓擋第二次中高壓）；火神爆裂前開群體減傷。亂擊可能被點地火噴發、石牢、寒風之歌或光柱。',
  '跟人群；P4A 時注意 H1 的治療 LB3。爆擊：可能被點灼熱咆哮（往 C 跑、用低氣壓擋第二次中高壓）；火神爆裂前開群體減傷（15 秒蓋兩次）。',
  '跟人群。亂擊可能被點地火噴發、石牢（跑向 2 號標點）、寒風之歌或光柱。',
  'P4A：0:38 用近戰 LB3（月遁血祭）擊殺拉哈布雷亞。其餘跟人群。',
  '追擊之後去 D 點：地火噴發點你，沿場邊往 C 跑（4 次）。',
  'P4A：0:09 用法系 LB3（萬億核爆）打魔導浮游炮。追擊之後去 B 點：地火噴發點你，沿場邊往 C 跑（4 次）。爆擊：用 P1 遺留的低氣壓擋第一次中高壓。',
];

PHASES.p4 = {
  id: 'p4', name: 'P4 究極神兵', short: '究極神兵', preRoll: -3, end: K.END, maxCharges: 0, chargeLabel: '',
  bossLook: ['bit', 'lahabrea', 'ultima'], bossR: 4, activeTank: (S) => S.s.tank,
  checkpoints: CHECKPOINTS, cues: CUES, roleDesc: ROLE_DESC,
  roll, setup, build, tick, objectives,
  /** 輪到這個職位用極限技（技能列的 LB 會閃）。 */
  lbDue: (S, slot) => LB_TASKS.some((x) => x.slot === slot && S.t >= x.from && S.t <= x.by && S.lb >= 3),
  /** 補師的群體減傷留給火神爆裂（2:49、3:01），AI 不拿去減魔導核爆。 */
  mitReserve: (S, slot, id) => id === 'pmit' && S.t >= tb(110) && S.t < tb(182),
  start: () => all([0, 0]).map((p, i) => [Math.cos(i * 0.8) * 1.2, Math.sin(i * 0.8) * 1.2]),
  rollSummary: (r) => {
    const D8 = (b) => ['A（北）', '東北', 'B（東）', '東南', 'C（南）', '西南', 'D（西）', '西北'][Math.round(U.norm360(b) / 45) % 8];
    return [
      `追擊之究極幻想：迦樓羅偏${D8(r.pg)}、伊弗利特在${D8(r.pi)}、泰坦在${D8(r.pt)}（${U.norm360(r.pt) % 90 > 45 ? '偏左' : '偏右'}）、究極神兵在${D8(r.pu)}`,
      `火獄之鎖：OT 與 ${ROLES[r.fettersDps].key}　地裂目標：${r.lsTargets.filter(Boolean).join('、') || '—'}`,
      `爆擊：伊弗利特在${r.ann.ifritSW ? '西南' : '東南'}、灼熱咆哮 ${ROLES[r.ann.sear].key}`,
      `亂擊：地火噴發 ${r.sup.erupt.map((k) => ROLES[k].key).join('、')}（石牢 ${ROLES[r.sup.gaol].key}）、寒風之歌 ${r.sup.song.map((k) => ROLES[k].key).join('、')}、光柱 ${ROLES[r.sup.pillar].key}、魔科學激光 ${r.sup.lasers.map((i) => ['穿場中', '北邊', '東邊'][i]).join('→')}`,
    ];
  },
};
root.UWU_P4 = { K, predationPlan, LB_TASKS };
})(typeof window !== 'undefined' ? window : globalThis);
