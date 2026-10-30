/* 隊友 AI 的閃避（各階段共用）：判斷某點在接下來幾秒內會不會被打到、找最近的安全點、把攻略站位修正成「此刻」的安全點。
   危險來源：即將判定的預警範圍（S.fx）、（即將縮小的）場地邊緣、階段自訂的危險（extra，例如 P3 的污泥）。
   U.AI.make(opt) → { pendingFx, badFn, sanitize }；opt：horizon（往後看幾秒）、margin（安全距離）、
   edge(S)（超過這個半徑算危險）、extra(S, c)（回傳 (p) => 是否危險，可省略）。 */
(function (root) {
'use strict';
const U = root.UWU;
const { inRect, inCone } = U;
const PI = Math.PI;
const xz = (p) => ({ x: p[0], z: p[1] });

function inFx(p, f, margin) {
  if (f.kind === 'circle') return Math.hypot(p.x - f.x, p.z - f.z) <= f.r + margin;
  if (f.kind === 'ring') { const d = Math.hypot(p.x - f.x, p.z - f.z); return d >= f.inner - margin && d <= f.r + margin; }
  if (f.kind === 'rect') return inRect(p, f, f.rot, f.w / 2 + margin, f.len + margin);
  if (f.kind === 'cone') return inCone(p, f, f.rot, f.half + 0.12, f.len + margin);
  return false;
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

function make(opt) {
  /** 某人在 horizon 秒內會判定的預警範圍（npcIgnore：這個範圍不用躲的人，例如死刑的坦克）。 */
  const pendingFx = (S, c) => S.fx.filter((f) => f.t1 > S.t && f.t1 <= S.t + opt.horizon && !(f.npcIgnore && f.npcIgnore.includes(c.slot)) && !f.harmless);
  function badFn(S, c, margin) {
    const list = pendingFx(S, c), er = opt.edge(S), extra = opt.extra ? opt.extra(S, c) : null;
    return (p) => {
      if (Math.hypot(p.x, p.z) > er) return true;
      for (const f of list) if (inFx(p, f, margin)) return true;
      return !!(extra && extra(p));
    };
  }
  /** 把攻略站位修正成「現在這一刻」的安全點（隨機的範圍位置都會變）；判定前走不到的話，改去走得到、又最接近目標的安全點。 */
  function sanitize(S, spots) {
    const now = S.t, v = U.C.NPC_SPEED;
    return spots.map((sp, slot) => {
      if (!sp) return sp;
      const c = S.chars[slot];
      if (!c.alive || now < c.stunUntil) return sp;
      const bad = badFn(S, c, opt.margin);
      let p = nearestSafe(xz(sp), bad);
      // 直線走過去的途中，會不會剛好在某個判定的瞬間站在範圍裡（出發可能晚 0～0.4 秒）？會的話改去「那之前走得到」的安全點
      const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
      let tHit = Infinity;
      for (const f of pendingFx(S, c)) {
        for (const late of [0, 0.2, 0.4]) {
          const k = d < 1e-6 ? 1 : Math.min(1, Math.max(0, v * (f.t1 - now - late)) / d);
          const q = { x: c.pos.x + (p.x - c.pos.x) * k, z: c.pos.z + (p.z - c.pos.z) * k };
          if (inFx(q, f, 0.3)) { tHit = Math.min(tHit, f.t1 - now); break; }
        }
      }
      if (tHit !== Infinity) p = bestReachable(c.pos, p, Math.max(0, v * (tHit - 0.5)), bad);
      return [p.x, p.z];
    });
  }
  return { pendingFx, badFn, sanitize };
}

U.AI = { make, inFx, nearestSafe, bestReachable };
})(typeof window !== 'undefined' ? window : globalThis);
