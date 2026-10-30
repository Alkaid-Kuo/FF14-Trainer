/* P2 伊弗利特（覺醒前＋覺醒後）。站位／分工：攻略 P2A-F01~F13、P2B-F01~F24；時間點參考第三方 log 資料（毫秒級），
   與攻略 mm:ss 相差 1~3 秒。職位對應：戰=MT 騎=OT 白=H1 學=H2 龍=M1 忍=M2 詩=R 召=C。
   隨機：伊弗利特開場方位、光輝炎柱的邊緣圓位置、火獄之楔的方向（8 種旋轉：楔 1 在正點或斜點）、灼熱咆哮補師、烈焰碎擊目標、
   分身深紅旋風出現的兩個正點、覺醒深紅旋風各自出現在楔子方向或對面、覺醒本體。 */
(function (root) {
'use strict';
const U = root.UWU;
const { PHASES, ROLES, isTank, inCircle, inRect, inCone, atBearing, mulberry32, shuffler, dist, rotateXZ } = U;
const { MT, OT, H1, H2, M1, M2, RR, CC } = U;
const PI = Math.PI;
const FR = U.FRAMES;
const IDX = { MT: 0, OT: 1, H1: 2, H2: 3, M1: 4, M2: 5, R: 6, C: 7 };

const K = {
  EDGE_R: 19.5, LANE_HALF: 9, LANE_LEN: 44, CROSS_HALF: 5, PLUME_R: 8, ERUPT_R: 8, WIND_R: 14, CRUSH_R: 4, CRUSH_NEED: 6,
  INC_HALF: PI / 4, INC_LEN: 15, NAIL_R: 10, END: 167.5, CHARGES: 4, SAFE_R: 17.5, RUN_R: 17.4,
};
const DIR8 = ['A（北）', '東北', 'B（東）', '東南', 'C（南）', '西南', 'D（西）', '西北'];
const DASH = { hit: [126.41, 127.83, 129.22, 130.64], cast: [123.43, 124.85, 126.24, 127.66], cross: 2.15 };

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
const rot = (p, deg) => (p ? rotateXZ(p, deg) : p);
const norm360 = U.norm360;

function roll(seed) {
  const rng = mulberry32(seed), sh = shuffler(rng), pick = (a) => a[Math.floor(rng() * a.length)];
  const dps = [M1, M2, RR, CC];
  const howl1 = pick([H1, H2]);
  // 火獄之楔：固定的等腰梯形（2 正點＋2 斜點），整組隨機旋轉 45° 的倍數 → 楔 1 可能在正點或斜點（攻略的兩種情況）
  const b = 45 * Math.floor(rng() * 8);
  const nails = [b, b + 135, b + 270, b + 225].map(norm360);
  // 覺醒前後半段（1:24 起）人群在「離 2 號位最近的斜點」：2 號位約在楔 1 順時針 67.5°，取最近的斜點，攻略圖以此旋轉
  const m2 = norm360(b + 67.5), corner = norm360(45 + 90 * Math.round((m2 - 45) / 90));
  return {
    seed,
    openerBearing: 90 * Math.floor(rng() * 4),
    nsPlume: pick([0, 180]), ewPlume: pick([90, 270]),
    b, nails, rho: b - 180,
    fettersDps: pick(dps),
    howl1, howl2: howl1 === H1 ? H2 : H1,
    crush: [pick(dps), pick(dps)],
    body: Math.floor(rng() * 4),                       // 覺醒的深紅旋風是第幾個
    rotB: corner - 225,
    clonePair: 90 * Math.floor(rng() * 4),             // 分身深紅旋風：從相鄰兩個正點出現（俯衝線同樣是十字）
    dashFlip: [0, 1, 2, 3].map(() => rng() < 0.5),     // 覺醒深紅旋風：出現在楔子方向或對面（範圍相同）
    _s: sh.length,
  };
}
/** 覺醒後深紅旋風：人群的起跑點與終點方位（攻略「起跑在 2 右手側，本體在正跑到正，本體在斜跑到斜」）。 */
function runPlan(R) {
  const m2 = norm360(R.b + 67.5);
  const s0 = Math.floor(m2 / 45) * 45;
  const bodyCard = R.nails[R.body] % 90 === 0;
  // 終點要和本體同類型（正／斜）：起跑點與本體同類型就跑 90°，不同就跑 45°（楔 1 在正點時起跑點是斜點，在斜點時起跑點是正點）
  const arc = (s0 % 90 === 0) === bodyCard ? 90 : 45;
  return { m2, s0, arc, end: norm360(s0 - arc) };
}

function setup(S) {
  const R = S.roll, s = S.s;
  const edge = atBearing(R.openerBearing, K.EDGE_R);
  const a = S.actor('ifrit', '伊弗利特', edge.x, edge.z, Math.atan2(-edge.x, -edge.z));
  a.visible = false;
  s.ifrit = a; s.tank = OT; s.nails = []; s.clones = []; s.charges = 0; s.woken = false;
}

function build(S) {
  const R = S.roll, s = S.s, at = (t, fn) => S.at(t, fn);
  const ifrit = s.ifrit;
  const plan = runPlan(R);
  const ESPOT = (b) => atBearing(b, K.EDGE_R);
  const faceTank = () => { const c = S.mainTank(); ifrit.rot = Math.atan2(c.pos.x - ifrit.pos.x, c.pos.z - ifrit.pos.z); };   // 拉怪坦克倒地 → 面向另一位坦克
  s.faceTank = faceTank;
  const HW1 = R.howl1, HW2 = R.howl2;

  // ---------------------------------------------------------------- 機制
  const laneFx = (bearing, tCast, tRes, half, label, tankDmg) => {
    const e = ESPOT(bearing);
    return S.hazard({
      t0: tCast, tRes, kind: 'rect', label, tankSafe: true, tankDmg: tankDmg || 80,
      geom: { x: e.x, z: e.z, rot: Math.atan2(-e.x, -e.z), w: half * 2, len: K.LANE_LEN },
      killMsg: `被 ${label}（俯衝線）擊中：非坦克不能站在俯衝路徑上`,
    });
  };

  // 扇形的對象在讀條開始時就鎖定（讀條中坦克倒地也不會轉向別人）
  const incinerate = (t) => { let tg = null; return S.hazard({
    t0: t - 1.2, omen: t - 1.2, tRes: t, kind: 'cone', label: 'Incinerate（烈焰焚燒）', tankSafe: true, tankDmg: 40, buster: true,
    geom: () => { tg = S.mainTank(); faceTank(); return { x: ifrit.pos.x, z: ifrit.pos.z, rot: ifrit.rot, half: K.INC_HALF, len: K.INC_LEN }; },
    follow: (f) => { f.x = ifrit.pos.x; f.z = ifrit.pos.z; f.rot = Math.atan2(tg.pos.x - ifrit.pos.x, tg.pos.z - ifrit.pos.z); },
    castBy: ['伊弗利特', 'Incinerate', 1.2],
    killMsg: '被 Incinerate（伊弗利特正面扇形）擊中：非坦克不能站正面',
  }); };

  const searingPulse = (slotFn, t) => {
    S.hazard({
      t0: t - 0.7, omen: t - 0.7, tRes: t, kind: 'circle', label: 'Searing Wind（灼熱咆哮）', tint: 'meso', noKill: true,
      geom: () => { const h = S.chars[slotFn()]; return { x: h.pos.x, z: h.pos.z, r: K.WIND_R }; },
      follow: (f) => { const h = S.chars[slotFn()]; f.x = h.pos.x; f.z = h.pos.z; },
      onResolve: (list) => {
        const h = S.chars[slotFn()];
        if (!h.alive) return;
        for (const c of list) {
          if (c === h) continue;
          // 非坦克吃不住傷害（屍體被擊飛）；坦克受傷並被擊退，撞到場地邊緣一樣會死
          if (isTank(c.slot)) { S.damage(c, 45, 'Searing Wind'); S.knock(c, h.pos, 8, 0.6); }
          else { S.kill(c, '被灼熱咆哮波及（太靠近持有熱風的補師，半徑 14）'); S.knock(c, h.pos, 13, 0.9); }
        }
      },
    });
  };
  const howl = (slotFn, tCast, tOn, dur, pulses) => {
    let who = slotFn();
    const cur = () => who;
    at(tCast, () => { S.cast('伊弗利特', 'Inferno Howl（灼熱咆哮）', tCast, 1.7); });
    at(tOn, () => {
      who = S.pickAlive(slotFn(), [H1, H2, M1, M2, RR, CC]);   // 預定的補師倒地 → 點下一個活著的人
      const h = S.chars[who]; h.searing = true; S.addStatus(h.slot, 'searing', dur); S.log(`${h.key} 被點名灼熱咆哮：遠離人群`, h.slot);
    });
    at(tOn + dur, () => { S.chars[who].searing = false; });
    for (const p of pulses) searingPulse(cur, p);
  };

  // 地火噴發：以「距離伊弗利特最遠的 2 名無熱風玩家」為落點，連續 4 輪
  const eruptions = (tStart, casts, resolves) => {
    let baits = [];
    at(tStart, () => {
      baits = S.alive().filter((c) => !c.searing).sort((a, b) => dist(b.pos, ifrit.pos) - dist(a.pos, ifrit.pos)).slice(0, 2);
      S.cast('伊弗利特', 'Eruption（地火噴發）', tStart, 2.2);
      S.log(`地火噴發點名：${baits.map((b) => b.key).join('、')}（離伊弗利特最遠的 2 人）`, -1, true);
    });
    casts.forEach((tc, i) => {
      let spots = [];
      at(tc, () => {
        spots = [];
        for (const b of baits) {
          if (!b.alive) continue;
          const sp = { x: b.pos.x, z: b.pos.z, owner: b };
          spots.push(sp);
          S.addFx({ kind: 'circle', x: sp.x, z: sp.z, r: K.ERUPT_R, t0: tc, t1: resolves[i], label: 'Eruption', tint: 'danger' });
        }
      });
      at(resolves[i], () => {
        for (const sp of spots) {
          for (const c of S.alive()) {
            if (!inCircle(c.pos, sp, K.ERUPT_R)) continue;
            if (isTank(c.slot)) S.damage(c, 50, 'Eruption'); else S.kill(c, '被地火噴發（半徑 8）擊中');
          }
          for (const n of s.nails) if (!n.dead && inCircle(n.pos, sp, K.ERUPT_R)) { n.hits++; n.badge = n.hits; sp.owner.stats.nailHits = (sp.owner.stats.nailHits || 0) + 1; }
        }
      });
    });
  };

  // 烈焰碎擊：分攤後掛詛咒之炎 DOT（每 3 秒一跳），持續時間依人數：≥6 人 2 秒（不跳）、5 人 4 秒（跳 1 次）、<5 人 30 秒（致死）
  const crush = (slot0, tMark, tRes) => {
    let stack = [], slot = slot0;
    at(tMark, () => {
      slot = S.pickAlive(slot0, [M1, M2, RR, CC, H1, H2]);
      S.mark(slot, 'crush', tMark, tRes);
      const fx = S.addFx({ kind: 'circle', r: K.CRUSH_R, t0: tMark, t1: tRes, label: 'Flaming Crush（烈焰碎擊）', tint: 'share', assistFrom: tMark });
      fx.follow = (f) => { const c = S.chars[slot]; f.x = c.pos.x; f.z = c.pos.z; };
      S.cast('伊弗利特', 'Flaming Crush（烈焰碎擊）', tMark, tRes - tMark);
    });
    at(tRes, () => {
      const tg = S.chars[slot];
      stack = S.alive().filter((c) => inCircle(c.pos, tg.pos, K.CRUSH_R));
      const n = stack.length;
      for (const c of S.alive()) if (!stack.includes(c) && S.humans.has(c.slot) && !c.searing) { c.stats.crushMiss = (c.stats.crushMiss || 0) + 1; S.note('hit', '烈焰碎擊：沒有站進分攤圈', c.slot); }
      const dur = n >= K.CRUSH_NEED ? 2 : n === K.CRUSH_NEED - 1 ? 4 : 30;
      for (const c of stack) { S.damage(c, n >= K.CRUSH_NEED ? 20 : 45, `Flaming Crush（${n} 人）`); S.addStatus(c.slot, 'curse', dur); }
      S.log(`烈焰碎擊 ${n} 人分攤：詛咒之炎 ${dur} 秒${n >= K.CRUSH_NEED ? '（不會跳傷害）' : ''}`);
    });
    // 詛咒之炎第 1 跳（3 秒後）：5 人時受傷，少於 5 人時致死
    at(tRes + 3, () => {
      const n = stack.length;
      if (n >= K.CRUSH_NEED) return;
      for (const c of stack) {
        if (n === K.CRUSH_NEED - 1) S.damage(c, 30, '詛咒之炎');
        else S.kill(c, `烈焰碎擊分攤人數不足（${n} 人，至少 6 人）：詛咒之炎致死`);
      }
    });
  };

  // ---------------------------------------------------------------- 時間軸：覺醒前
  at(2.93, () => { ifrit.visible = true; });
  const dashFrom = R.openerBearing, dashEdge = ESPOT(dashFrom);
  S.hazard({
    t0: 5.12, tRes: 8.10, kind: 'rect', label: 'Crimson Cyclone（深紅旋風）', tankSafe: true, tankDmg: 80,
    geom: { x: dashEdge.x, z: dashEdge.z, rot: Math.atan2(-dashEdge.x, -dashEdge.z), w: K.LANE_HALF * 2, len: K.LANE_LEN },
    castBy: ['伊弗利特', 'Crimson Cyclone', 2.7], killMsg: '被深紅旋風（俯衝線）擊中：非坦克不能站在俯衝路徑上',
  });
  // 俯衝：從一邊衝到對面
  at(7.95, () => { const o = ESPOT(norm360(dashFrom + 180)); ifrit.moveTo(o.x, o.z, 180); });
  at(8.2, () => { const o = ESPOT(norm360(dashFrom + 180)); ifrit.pos.x = o.x; ifrit.pos.z = o.z; ifrit.goal = null; });
  // 光輝炎柱
  const plumes = [];
  for (let bearing = 45; bearing < 360; bearing += 90) plumes.push(atBearing(bearing, 11 * Math.SQRT2));
  for (let bearing = 0; bearing < 360; bearing += 90) plumes.push(atBearing(bearing, 7));
  plumes.push(atBearing(R.nsPlume, 18)); plumes.push(atBearing(R.ewPlume, 18));
  s.plumes = plumes;
  at(5.16, () => {
    S.cast('伊弗利特', 'Radiant Plume（光輝炎柱）', 5.16, 3.7);
    for (const p of plumes) S.addFx({ kind: 'circle', x: p.x, z: p.z, r: K.PLUME_R, t0: 5.16, t1: 9.13, label: 'Radiant Plume' });
  });
  at(9.13, () => { for (const c of S.alive()) if (plumes.some((p) => inCircle(c.pos, p, K.PLUME_R))) S.kill(c, '被光輝炎柱（半徑 8 圓形）擊中'); });
  at(9.1, () => { ifrit.visible = false; });
  at(10.15, () => { ifrit.pos.x = 0; ifrit.pos.z = 0; ifrit.rot = 0; });
  at(10.24, () => { ifrit.visible = true; });
  at(12.29, () => { ifrit.targetable = true; });
  at(12.38, () => { S.cast('伊弗利特', 'Hellfire（地獄之火炎）', 12.38, 2.7); S.expect('raid', 15.37); });
  at(15.37, () => S.raidwide('Hellfire', 65, 25));
  at(23.56, () => S.raidwide('Vulcan Burst（火神爆裂，擊退視為已用群盾擋下）', 15));
  incinerate(26.38); incinerate(29.50); incinerate(33.60);

  // 火獄之楔
  at(39.89, () => {
    s.nails = R.nails.map((bn, i) => {
      const p = atBearing(bn, K.NAIL_R);
      const a = S.actor('nail', `火楔${i + 1}`, p.x, p.z, 0);
      a.hits = 0; a.badge = 0; a.order = i; return a;
    });
    S.log('4 個火獄之楔出現：被地火噴發命中 2 次以上再擊殺才會充能', -1, true);
  });
  at(41.5, () => { const p = rot([5.5, -2.4], R.rho); ifrit.moveTo(p[0], p[1], 4); });
  at(45.76, () => {
    S.tethers.push({ kind: 'fetters', t0: 45.76, t1: 66.8, ends: () => [[S.chars[OT].pos, S.chars[R.fettersDps].pos]] });
    S.addStatus(OT, 'fetters', 66.8 - 45.76); S.addStatus(R.fettersDps, 'fetters', 66.8 - 45.76);
    S.log('火獄之鎖：OT 與隨機 1 名 DPS 連線，距離越遠傷害越高');
  });
  howl(() => HW1, 46.03, 47.99, 18.9, [53.96, 59.97, 65.99]);
  eruptions(51.16, [51.16, 53.12, 55.12, 57.12], [54.14, 56.10, 58.10, 60.10]);
  const kills = [57.66, 62.55, 66.03, 69.46];
  kills.forEach((tk, i) => {
    at(tk, () => {
      const n = s.nails[i]; if (!n || n.dead) return;
      S.despawn(n);
      for (const c of S.alive()) S.damage(c, isTank(c.slot) ? 10 : 22, 'Infernal Surge', true);
      if (n.hits >= 2) { s.charges++; S.log(`火楔${i + 1} 被擊中 ${n.hits} 次後擊殺：覺醒層數 +1（${s.charges}/4）`); }
      else S.log(`火楔${i + 1} 只被擊中 ${n.hits} 次：沒有充能`);
      if (s.charges >= K.CHARGES && !s.woken) { s.woken = true; S.log('伊弗利特覺醒層數達 4：覺醒！'); }
    });
  });
  at(45, () => s.nails.forEach((n) => { n.drainFrom = 45; }));
  at(71.02, () => { ifrit.targetable = false; });
  at(72.2, () => { ifrit.visible = false; });

  // ---------------------------------------------------------------- 時間軸：覺醒後
  at(75.25, () => { ifrit.pos.x = 0; ifrit.pos.z = 0; ifrit.rot = 0; });
  at(75.30, () => { ifrit.visible = true; ifrit.targetable = true; });
  at(75.38, () => { S.cast('伊弗利特', 'Hellfire（地獄之火炎）', 75.38, 2.7); S.expect('raid', 78.37); });
  at(78.37, () => S.raidwide('Hellfire', 65, 25));
  at(79.5, () => { const p = rot([-9.7, 9.4], R.rotB); ifrit.moveTo(p[0], p[1], 4); });
  howl(() => HW2, 84.74, 86.70, 30.9, [92.68, 98.69, 104.70, 110.72, 116.74]);
  eruptions(89.87, [89.87, 91.83, 93.83, 95.84], [92.85, 94.81, 96.81, 98.82]);
  at(98.5, () => { s.tank = MT; S.log('換坦：MT 挑釁，OT 退避'); });
  // 分身深紅旋風：2 隻分身出現在場邊相鄰的兩個正點，各自衝到對面（合起來是十字）
  const cloneB = [R.clonePair, norm360(R.clonePair + 90)];
  at(96.0, () => {
    s.clones = cloneB.map((b) => { const e = ESPOT(b); const a = S.actor('ifrit_clone', '伊弗利特分身', e.x, e.z, Math.atan2(-e.x, -e.z)); return a; });
  });
  for (const b of cloneB) laneFx(b, 96.91, 99.89, K.LANE_HALF, 'Crimson Cyclone（分身）');
  at(99.75, () => s.clones.forEach((a, i) => { const o = ESPOT(norm360(cloneB[i] + 180)); a.moveTo(o.x, o.z, 180); }));
  at(101.1, () => { s.clones.forEach((a) => S.despawn(a)); s.clones = []; });
  howl(() => HW1, 102.84, 104.79, 30.9, [110.77, 116.78, 122.80, 128.82, 134.83]);
  crush(R.crush[0], 109.88, 115.0);

  // 覺醒深紅旋風 ×4 ＋ 十字
  at(119.02, () => { ifrit.targetable = false; });
  at(120.3, () => { ifrit.visible = false; });
  // 依擊殺火楔的順序出現在 4 個楔子方向（或對面，範圍一樣），各自衝到對面
  const dashFrom4 = R.nails.map((b, i) => norm360(b + (R.dashFlip[i] ? 180 : 0)));
  at(122.53, () => {
    s.clones = dashFrom4.map((b, i) => {
      const e = ESPOT(b); const a = S.actor('ifrit_clone', i === R.body ? '伊弗利特（本體）' : '伊弗利特分身', e.x, e.z, Math.atan2(-e.x, -e.z));
      a.blue = i === R.body; return a;
    });
    S.log('4 個深紅旋風出現：身上帶藍色火焰的是本體', -1, true);
  });
  dashFrom4.forEach((b, i) => {
    laneFx(b, DASH.cast[i], DASH.hit[i], K.LANE_HALF, '深紅旋風');
    at(DASH.hit[i] - 0.15, () => { const o = ESPOT(norm360(b + 180)); if (s.clones[i]) s.clones[i].moveTo(o.x, o.z, 180); });
    at(DASH.hit[i] + 1.2, () => { if (s.clones[i]) S.despawn(s.clones[i]); });
  });
  {
    const tc = DASH.hit[R.body] + DASH.cross, bb = R.nails[R.body];
    for (const off of [-45, 45]) laneFx(norm360(bb + off), tc - 1.0, tc, K.CROSS_HALF, '十字火焰（覺醒）', 70);
  }
  at(134.0, () => { ifrit.pos.x = 0; ifrit.pos.z = 0; ifrit.rot = 0; });
  at(134.05, () => { ifrit.visible = true; });
  at(134.83, () => { ifrit.targetable = true; s.tank = MT; });
  at(135.5, () => { const p = rot([-0.1, 9.6], plan.end - 180); ifrit.moveTo(p[0], p[1], 4); });
  incinerate(138.98); incinerate(142.10); incinerate(146.19);
  at(148.5, () => { const p = rot([-0.1, 13.7], plan.end - 180); ifrit.moveTo(p[0], p[1], 3); });
  eruptions(152.29, [152.29, 154.25, 156.26, 158.26], [155.27, 157.23, 159.24, 161.24]);
  crush(R.crush[1], 159.15, 164.27);
  at(166.5, () => { S.despawn(ifrit); S.log('擊殺伊弗利特'); });
  at(K.END, () => S.finishWith(s.woken, `伊弗利特沒有覺醒（充能 ${s.charges}/${K.CHARGES}）：火獄之楔被地火噴發命中不足 2 次`));

  // ---------------------------------------------------------------- 走位
  const MV = (t, id, title, spots, tip, frame, opt) => S.move(t, id, title, spots, Object.assign({ tip: tipf(tip), frame }, opt || {}));
  /** 旋轉後的攻略畫面（人群方位隨火獄之楔 1 而轉）；補師依灼熱咆哮順序對調。 */
  const rf = (S2, id, ov, deg) => {
    const a = fp(id);
    if (ov) for (const k of Object.keys(ov)) a[k in IDX ? IDX[k] : +k] = ov[k];
    if (S2.roll.howl1 === H1) { const t = a[H1]; a[H1] = a[H2]; a[H2] = t; }
    return a.map((p) => rot(p, deg === undefined ? S2.roll.rho : deg));
  };
  const hw1 = () => R.howl1, hw2 = () => R.howl2;
  /** 1:24～1:55 用：以「離 2 號位最近的斜點」旋轉攻略圖（楔 1 在斜點時與 rho 差 45°）。 */
  const rfB = (S2, id, ov) => rf(S2, id, ov, S2.roll.rotB);

  MV(0.5, 'center0', '開場：1 號位集合', () => { const a = fp('P2A-F01'); a[MT] = [0.3, -0.3]; return a; }, {
    def: '全員在中心 1 號位集合。伊弗利特會出現在 A/B/C/D 其中一個邊緣，之後深紅旋風（俯衝線）加光輝炎柱。',
  }, 'P2A-F01', { spread: true });
  MV(5.3, 'safe', '光輝炎柱：去安全點', (S2) => {
    const ob = S2.roll.openerBearing, beside = ob % 180 === 0 ? S2.roll.ewPlume : S2.roll.nsPlume;
    const p = atBearing(norm360(beside + 180), K.SAFE_R);
    return all([p.x, p.z]);
  }, {
    def: '深紅旋風會沿「伊弗利特到對面」的線俯衝（寬約 18），光輝炎柱有很多大圓：往垂直於俯衝線的那一側邊緣、沒有邊緣大圓的位置站（伊弗利特腳下及順/逆時針 90° 處必有安全點）。',
  }, 'P2A-F03', { spread: true, preview: false });
  MV(9.3, 'center1', '回 1 號位集合', () => { const a = fp('P2A-F04'); a[MT] = [0.2, 0.3]; return a; }, { def: '全員回 1 號位集合。' }, 'P2A-F04');
  MV(12.3, 'tank1', 'OT 拉住伊弗利特（面向 C）', () => fp('P2A-F05'), {
    OT: '拉住伊弗利特，讓他面向 C（南），你站在他正前方。烈焰焚燒 ×3 打你，第 2 下開始要無敵。',
    def: '站在伊弗利特背後（北側），不要進他正面扇形。地獄之火炎全體攻擊。',
  }, 'P2A-F05');
  MV(40.9, 'nails', '火獄之楔出現：就定位', (S2) => {
    const a = rf(S2, 'P2A-F06');
    const hw = S2.roll.howl1; a[hw] = [0.5 + (hw === H1 ? 0 : 1), 0.8];
    return a;
  }, {
    MT: '站火楔 3 旁（約離伊弗利特 3）：負責火楔 3，並牽制。',
    OT: '把伊弗利特拉向火楔 3、4 的方向；負責火楔 4。',
    M1: '站在火楔 1 與伊弗利特之間：先打火楔 1 到殘血，轉打伊弗利特，等火楔出現 2 層 Buff 再擊殺。',
    M2: '站在火楔 2 與伊弗利特之間：同樣處理火楔 2。',
    R: '站在火楔 1 方向的場地邊緣：之後地火噴發的圓要蓋到火楔 1，再蓋火楔 3。',
    C: '站在火楔 2 方向的場地邊緣：之後地火噴發的圓要蓋到火楔 2，再蓋火楔 4。',
    H: '站在中心待命（會被灼熱咆哮點名的補師稍後去 2 號位邊緣）。',
  }, 'P2A-F06');
  MV(48.0, 'hw1', '灼熱咆哮①：被點名補師去 2 號位', (S2) => { const a = Array(8).fill(null); const p = rf(S2, 'P2A-F06')[S2.roll.howl1]; a[S2.roll.howl1] = p; return a; }, {
    H: '被點名灼熱咆哮的補師：去火楔 1、2 方向之間的場地邊緣（2 號位），遠離人群 14 以上，並在腳下標點。另一位補師留在中心。',
    def: '留在原位。被點名的補師會去邊緣。',
  }, 'P2A-F06', { preview: false });
  MV(50.8, 'er1', '地火噴發 ①', (S2) => rf(S2, 'P2A-F07'), {
    R: '地火噴發第 1 圈會落在你腳下：站火楔 1 方向邊緣，讓圓蓋住火楔 1。',
    C: '地火噴發第 1 圈會落在你腳下：站火楔 2 方向邊緣，讓圓蓋住火楔 2。',
    def: '離邊緣遠一點（R/C 是離伊弗利特最遠的 2 人，會被點名放圈）。',
  }, 'P2A-F07');
  MV(51.3, 'er2', '地火噴發 ②：R/C 沿邊緣移動', (S2) => { const a = rf(S2, 'P2A-F08'); return only([[M1, a[M1]], [M2, a[M2]], [RR, a[RR]], [CC, a[CC]]]); }, {
    R: '放完第 1 圈立刻沿邊緣往火楔 3 的方向移動約 10：第 2 圈再蓋火楔 1。', C: '放完第 1 圈立刻沿邊緣往火楔 4 的方向移動約 10：第 2 圈再蓋火楔 2。',
    M1: '離開圓（半徑 8），繼續打火楔 1。', M2: '離開圓，繼續打火楔 2。', def: '留在中心。',
  }, 'P2A-F08');
  MV(53.3, 'er3', '地火噴發 ③：R/C 移到火楔 3、4', (S2) => { const a = rf(S2, 'P2A-F09'); return only([[RR, a[RR]], [CC, a[CC]]]); }, {
    R: '繼續往火楔 3 方向移動：第 3 圈蓋火楔 3。', C: '繼續往火楔 4 方向移動：第 3 圈蓋火楔 4。', def: '留在原位。',
  }, 'P2A-F09');
  MV(54.6, 'er3b', '人群回 1 號位', (S2) => { const a = rf(S2, 'P2A-F09'); a[RR] = null; a[CC] = null; a[S2.roll.howl1] = null; return a; }, {
    def: '人群移到 1 號位，避免被地火噴發打到。', M1: '回到 1 號位附近，繼續打火楔。', M2: '回到 1 號位附近，繼續打火楔。',
  }, 'P2A-F09');
  MV(55.3, 'er4', '地火噴發 ④', (S2) => { const a = rf(S2, 'P2A-F10'); return only([[RR, a[RR]], [CC, a[CC]]]); }, {
    R: '再小移一點：第 4 圈再蓋火楔 3。', C: '再小移一點：第 4 圈再蓋火楔 4。', def: '留在原位。',
  }, 'P2A-F10');
  MV(57.5, 'er5', '回人群', (S2) => { const a = rf(S2, 'P2A-F11'); a[S2.roll.howl1] = null; return a; }, {
    R: '放完最後一圈後回到人群。', C: '放完最後一圈後回到人群。', def: '擊殺火楔 1、2（被命中 2 次以上才算覺醒層數）。',
  }, 'P2A-F11');
  MV(59.5, 'er6', '集合擊殺火楔', (S2) => { const a = rf(S2, 'P2A-F12'); a[S2.roll.howl1] = null; return a; }, { def: '在 1 號位附近，DPS 依序擊殺火楔 3、4。' }, 'P2A-F12');
  MV(71.5, 'tank2', '覺醒前結束：回 1 號位', () => fp('P2A-F05'), { def: '伊弗利特消失後回 1 號位；OT 準備再拉。' }, 'P2A-F13');
  MV(79.5, 'corner', 'OT 把伊弗利特拉向最近的斜點', (S2) => {
    const a = rfB(S2, 'P2B-F02'), c = rfB(S2, 'P2B-F03');
    a[RR] = c[RR]; a[CC] = c[CC];
    const hw = S2.roll.howl2; a[hw] = rot([-8.5, 6.5], S2.roll.rotB);
    return a;
  }, {
    OT: '把伊弗利特拉向「離 2 號位最近的斜點」，你站他正前方。',
    R: '站在離人群最遠的正點邊緣（與人群對角）：之後地火噴發 ② 由你放圈。',
    C: '站在離人群最遠的另一個正點邊緣：之後地火噴發 ② 由你放圈。',
    def: '人群集中在 2 號位最近的斜點、伊弗利特背後。',
  }, 'P2B-F02');
  MV(86.8, 'hw2', '灼熱咆哮②：被點名補師去人群對面', (S2) => { const a = Array(8).fill(null); a[S2.roll.howl2] = rfB(S2, 'P2B-F02')[S2.roll.howl2]; return a; }, {
    H: '被點名灼熱咆哮的補師（30 秒、跳 5 次）：去人群所在處的場地另一端（約 36 遠）。',
    def: '留在原位。',
  }, 'P2B-F02', { preview: false });
  MV(90.0, 'ep2b', '地火噴發②：R/C 沿邊緣前進', (S2) => { const a = rfB(S2, 'P2B-F04'); return only([[RR, a[RR]], [CC, a[CC]]]); }, {
    R: '放完第 1 圈後沿場邊往伊弗利特方向移動。', C: '放完第 1 圈後沿場邊往伊弗利特方向移動。', def: '留在原位。',
  }, 'P2B-F04');
  MV(92.0, 'ep2c', '地火噴發②：繼續前進', (S2) => { const a = rfB(S2, 'P2B-F05'); return only([[RR, a[RR]], [CC, a[CC]]]); }, { R: '沿場邊繼續移動。', C: '沿場邊繼續移動。', def: '留在原位。' }, 'P2B-F05');
  MV(94.0, 'ep2d', '地火噴發②：第 4 圈', (S2) => { const a = rfB(S2, 'P2B-F06'); return only([[RR, a[RR]], [CC, a[CC]]]); }, { R: '放第 4 圈後準備回人群。', C: '放第 4 圈後準備回人群。', def: '留在原位。' }, 'P2B-F06');
  MV(96.0, 'edge', '人群去場地邊緣斜點', (S2) => {
    const a = rfB(S2, 'P2B-F07');
    a[S2.roll.howl2] = null; a[S2.roll.howl1] = rfB(S2, 'P2B-F07')[S2.roll.howl1];
    return a;
  }, {
    def: '分身要放兩條十字深紅旋風：人群全部移到場地邊緣的斜點（四個角落之一），離俯衝線 9 以上。',
  }, 'P2B-F07');
  MV(101.0, 'hw2b', '補師②換邊', (S2) => { const a = Array(8).fill(null); a[S2.roll.howl2] = rfB(S2, 'P2B-F09')[S2.roll.howl2]; return a; }, {
    H: '灼熱咆哮②的補師：移到最近的正點邊緣（避開第③個補師）。', def: '留在原位。',
  }, 'P2B-F09', { preview: false });
  MV(105.0, 'hw1b', '灼熱咆哮③：補師去另一個正點', (S2) => { const a = Array(8).fill(null); a[S2.roll.howl1] = rfB(S2, 'P2B-F09')[S2.roll.howl1]; return a; }, {
    H: '被點名灼熱咆哮③的補師：去離人群最遠的另一個正點邊緣。烈焰碎擊時至少 6 人要在人群裡分攤。', def: '留在原位，分攤烈焰碎擊（至少 6 人，不含補師）。',
  }, 'P2B-F09', { preview: false });
  MV(117.0, 'predash', '深紅旋風起跑點', (S2) => {
    const a = rf(S2, 'P2B-F12'), f10 = rf(S2, 'P2B-F10');
    a[RR] = f10[RR];
    return a;
  }, {
    def: '起跑點是「2 號位右手（逆時針）最近的正/斜點」；身上有灼熱咆哮的補師站在人群正對面。',
  }, 'P2B-F12');
  const arcPos = (bearing, r) => { const p = atBearing(norm360(bearing), r); return [p.x, p.z]; };
  MV(126.5, 'run1', '深紅旋風：開始逆時針跑', (S2) => {
    const p = runPlan(S2.roll);
    const a = rf(S2, 'P2B-F12');
    a[RR] = rf(S2, 'P2B-F10')[RR];
    const crowd = arcPos(p.s0 - 0.4 * p.arc, K.RUN_R), opp = arcPos(p.s0 + 180 - 0.4 * p.arc, K.RUN_R);
    return a.map((q, i) => (i === S2.roll.howl1 ? opp : crowd));
  }, {
    def: '看藍色火焰的本體在正點還是斜點：終點要和本體同類型，從起跑點逆時針跑到最近的同類型點（起跑點與本體同類型跑 90°，開疾跑直線跑；不同類型跑 45°）。口訣：起跑在 2 右手側，本體在正跑到正，本體在斜跑到斜。',
  }, 'P2B-F14', { jitter: false });
  MV(127.5, 'run2', '深紅旋風：到終點', (S2) => {
    const p = runPlan(S2.roll);
    const crowd = arcPos(p.end, K.RUN_R), opp = arcPos(p.end + 180, K.RUN_R);
    return ROLES.map((r) => (r.slot === S2.roll.howl1 ? opp : crowd));
  }, { def: '在終點停下，不要進入十字火焰（以本體方向偏 45° 的兩條線，各寬 10）。' }, 'P2B-F15', { jitter: false });
  const endRot = (S2) => runPlan(S2.roll).end - 180;
  MV(133.0, 'pull3', 'MT 把伊弗利特拉向就近正點', (S2) => {
    const a = rf(S2, 'P2B-F18', null, endRot(S2));
    a[S2.roll.howl1] = null;
    return a;
  }, {
    MT: '把伊弗利特拉向人群所在方向的就近正點，站他正前方；烈焰焚燒 ×3 打你，要用死斗。',
    R: '站到離伊弗利特最遠的場地邊緣（與 C 左右各一）：地火噴發 ③ 由你放圈。',
    C: '站到離伊弗利特最遠的場地邊緣（與 R 左右各一）：地火噴發 ③ 由你放圈。',
    def: '人群站在伊弗利特背後（近中心），不要進他正面扇形。',
  }, 'P2B-F18');
  MV(135.0, 'hw1c', '補師回人群', (S2) => { const a = Array(8).fill(null); a[S2.roll.howl1] = rf(S2, 'P2B-F18', null, endRot(S2))[S2.roll.howl1]; return a; }, {
    H: '灼熱咆哮③結束（最後一跳 02:15 前後）：回到人群。', def: '留在原位。',
  }, 'P2B-F18', { preview: false });
  MV(149.5, 'pull4', '往人群那側的邊緣拉近', (S2) => { const a = rf(S2, 'P2B-F19', null, endRot(S2)); return a; }, { MT: '把伊弗利特往場地邊緣再拉 4。', def: '跟著往邊緣移動 4。' }, 'P2B-F19');
  MV(152.4, 'ep3b', '地火噴發③：R/C 繞向人群', (S2) => { const a = rf(S2, 'P2B-F20', null, endRot(S2)); return only([[RR, a[RR]], [CC, a[CC]]]); }, {
    R: '放完第 1 圈後沿場邊往人群方向移動。', C: '放完第 1 圈後沿場邊往人群方向移動。', def: '留在原位。',
  }, 'P2B-F20');
  MV(154.4, 'ep3c', '集合', (S2) => rf(S2, 'P2B-F21', null, endRot(S2)), {
    R: '繼續沿場邊移動並放圈。', C: '繼續沿場邊移動並放圈。', def: '其他人和 MT 在邊緣集合。',
  }, 'P2B-F21');
  MV(156.4, 'ep3d', '地火噴發③：第 4 圈', (S2) => { const a = rf(S2, 'P2B-F22', null, endRot(S2)); return only([[RR, a[RR]], [CC, a[CC]]]); }, {
    R: '放第 4 圈後準備回人群。', C: '放第 4 圈後準備回人群。', def: '留在原位。',
  }, 'P2B-F22');
  MV(158.4, 'crush2', '全員集合：烈焰碎擊', (S2) => rf(S2, 'P2B-F23', null, endRot(S2)), { def: '全員（8 人）集合在邊緣分攤烈焰碎擊，至少 6 人。' }, 'P2B-F23');
}

function tick(S, dt) {
  const s = S.s, ifrit = s.ifrit;
  if (ifrit && !ifrit.dead && ifrit.visible && s.faceTank) s.faceTank();
  for (const n of s.nails || []) {
    if (n.dead) continue;
    if (n.drainFrom !== undefined) { const i = n.order, kill = [57.66, 62.55, 66.03, 69.46][i]; n.hp = Math.max(0.02, Math.min(1, (kill - S.t) / (kill - 45))); }
  }
  // 火獄之鎖：距離過遠會受傷（不致死）
  const th = S.tethers.find((t) => t.kind === 'fetters');
  if (th && S.t >= th.t0 && S.t <= th.t1) {
    const a = S.chars[OT], b = S.chars[S.roll.fettersDps];
    if (a.alive && b.alive) {
      const d = dist(a.pos, b.pos);
      if (d > 14) { S.damage(a, 3 * dt, '火獄之鎖', true); S.damage(b, 3 * dt, '火獄之鎖', true); }
    }
  }
}

function objectives(S, slot) {
  const c = S.chars[slot], st = c.stats, k = c.slot, s = S.s, out = [];
  out.push({ ok: c.alive, text: '全程存活' });
  if (k === RR || k === CC) out.push({ ok: (st.nailHits || 0) >= 4, text: `地火噴發的 4 個圓蓋到火獄之楔（${st.nailHits || 0}/4 次命中）` });
  out.push({ ok: !st.crushMiss, text: '烈焰碎擊：站進分攤圈' });
  out.push({ ok: !!s.woken, text: `伊弗利特覺醒（充能 ${s.charges || 0}/${K.CHARGES}）` });
  return out;
}

const CHECKPOINTS = [
  { t: 0, name: '開場：光輝炎柱／深紅旋風' },
  { t: 11, name: '地獄之火炎／烈焰焚燒' },
  { t: 39, name: '火獄之楔＋灼熱咆哮①＋地火噴發①' },
  { t: 70, name: '覺醒前結束' },
  { t: 78, name: '覺醒後：灼熱咆哮②／地火噴發②' },
  { t: 108, name: '烈焰碎擊①' },
  { t: 120, name: '深紅旋風 ×4＋覺醒十字火焰' },
  { t: 132, name: '烈焰焚燒／地火噴發③／烈焰碎擊②' },
];

const CUES = [
  [5.1, '深紅旋風（俯衝線）＋光輝炎柱：往垂直於俯衝線一側的邊緣安全點'],
  [10.2, '全員 1 號位集合'],
  [12.4, '地獄之火炎全體攻擊（OT 拉住伊弗利特面向 C）'],
  [23.6, '火神爆裂（擊退，群盾可擋）'],
  [26.4, '烈焰焚燒 ×3：只有 OT 站正面（開無敵）'],
  [39.9, '4 個火獄之楔出現：依攻略站位'],
  [46.0, '灼熱咆哮 ①點補師：被點名者去 2 號位邊緣'],
  [51.2, '地火噴發（4 連）：R/C 在邊緣依序把圓覆蓋到火楔 1,2 再 3,4'],
  [57.7, '依序擊殺火楔（被命中 2 次以上才充能）'],
  [71.0, '伊弗利特消失，覺醒前結束'],
  [75.4, '地獄之火炎'],
  [79.5, 'OT 把伊弗利特拉向離 2 號位最近的斜點；R/C 去離人群最遠的正點'],
  [84.7, '灼熱咆哮 ②（30 秒）點另一名補師：去人群對面'],
  [89.9, '地火噴發 ②：R/C 沿邊緣朝伊弗利特前進'],
  [96.9, '分身深紅旋風（十字俯衝）：人群在邊緣斜點'],
  [102.8, '灼熱咆哮 ③：補師去另一個正點邊緣'],
  [109.9, '烈焰碎擊點名 DPS：至少 6 人分攤'],
  [122.5, '深紅旋風 ×4＋覺醒十字：找藍色火焰本體；起跑點在 2 號位逆時針最近的正/斜點'],
  [134.8, 'MT 拉伊弗利特到就近正點；烈焰焚燒 ×3'],
  [152.3, '地火噴發 ③：R/C 從伊弗利特對側沿邊緣繞向人群'],
  [159.2, '烈焰碎擊點名 DPS：全員集合分攤'],
  [166.5, '擊殺伊弗利特'],
];

const ROLE_DESC = [
  '開場站伊弗利特背後；負責火楔 3；覺醒後在 133 秒左右把伊弗利特拉向就近的正點，承受烈焰焚燒 ×3（死斗）。',
  '開場拉住伊弗利特面向 C，承受烈焰焚燒 ×3（無敵）；負責火楔 4，並把伊弗利特拉向火楔 3、4 方向；覺醒後拉向離 2 號位最近的斜點。',
  '可能被點灼熱咆哮：去 2 號位（①）、人群對面（②）、另一個正點（③）。其餘跟人群。',
  '可能被點灼熱咆哮：去 2 號位（①）、人群對面（②）、另一個正點（③）。其餘跟人群。',
  '站火楔 1 與伊弗利特之間，負責打掉火楔 1（需被命中 2 次）。',
  '站火楔 2 與伊弗利特之間，負責打掉火楔 2（需被命中 2 次）。',
  '離伊弗利特最遠的人之一：地火噴發的圓要蓋火楔 1、3（覺醒後從場邊移動放圈）。',
  '離伊弗利特最遠的人之一：地火噴發的圓要蓋火楔 2、4（覺醒後從場邊移動放圈）。',
];

PHASES.p2 = {
  id: 'p2', name: 'P2 伊弗利特', short: '伊弗利特', preRoll: -3, end: K.END, maxCharges: K.CHARGES, chargeLabel: '覺醒',
  bossLook: 'ifrit', bossR: 3.5, activeTank: (S) => S.s.tank,
  checkpoints: CHECKPOINTS, cues: CUES, roleDesc: ROLE_DESC,
  roll, setup, build, tick, objectives,
  start: () => { const a = fp('P2A-F01'); a[MT] = [0.3, -0.3]; return a; },
  rollSummary: (r) => [
    `伊弗利特開場方位：${DIR8[r.openerBearing / 45]}　火楔 1 方位：${DIR8[r.b / 45]}（${r.b % 90 ? '斜點' : '正點'}）`,
    `分身深紅旋風：${DIR8[r.clonePair / 45]}、${DIR8[((r.clonePair + 90) % 360) / 45]}`,
    `灼熱咆哮：${ROLES[r.howl1].key}（①③）、${ROLES[r.howl2].key}（②）　烈焰碎擊：${ROLES[r.crush[0]].key}、${ROLES[r.crush[1]].key}`,
    `火獄之鎖：OT 與 ${ROLES[r.fettersDps].key}　覺醒深紅旋風為第 ${r.body + 1} 個`,
  ],
};
root.UWU_P2 = { K, runPlan };

})(typeof window !== 'undefined' ? window : globalThis);
