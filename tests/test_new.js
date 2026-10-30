// 新機制：邊緣死亡、灼熱咆哮擊飛／擊退、詛咒之炎狀態
const U = require('../src/core.js');
require('../src/frames.js'); require('../src/p1.js'); require('../src/p2.js');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// 1) 走到邊緣會死
{
  const s = new U.Sim({ phase: 'p1', seed: 1, playerSlot: 6, stopOnDeath: true });
  s.input = { x: 1, z: 0 };
  while (s.status === 'running' && s.t < 10) s.step(1 / 60);
  ok(!s.pc.alive && /邊緣/.test(s.pc.deathCause), '走到場地邊緣 → 死亡（' + s.pc.deathCause + '）r=' + Math.hypot(s.pc.pos.x, s.pc.pos.z).toFixed(2));
}
// 2) 灼熱咆哮：非坦克在熱風補師旁 → 死亡並被擊飛
for (const slot of [4, 1]) {
  const s = new U.Sim({ phase: 'p2', seed: 3, playerSlot: slot, stopOnDeath: false, autoPlayer: true });
  s.fastForward(53.6);
  s.setPlayerAuto(false);
  const h = s.chars[s.roll.howl1];
  s.pc.pos.x = h.pos.x * 0.9; s.pc.pos.z = h.pos.z * 0.9;   // 站在補師內側 2 yalm 左右
  const p0 = { x: s.pc.pos.x, z: s.pc.pos.z }, hp0 = s.pc.hp;
  while (s.t < 55.2) { s.input = { x: 0, z: 0 }; s.step(1 / 60); }
  const moved = Math.hypot(s.pc.pos.x - p0.x, s.pc.pos.z - p0.z);
  if (slot === 4) ok(!s.pc.alive && /灼熱咆哮/.test(s.pc.deathCause) && moved > 8, `M1 被灼熱咆哮打到 → 死亡且屍體被擊飛 ${moved.toFixed(1)} yalm`);
  else ok(s.pc.alive && moved > 5 && s.pc.stats.damage > 0, `OT 被灼熱咆哮打到 → 存活、受傷並被擊退 ${moved.toFixed(1)} yalm`);
}
// 3) 狀態：熱風 18.9 秒、火獄之鎖、烈焰碎擊後的詛咒之炎
{
  const s = new U.Sim({ phase: 'p2', seed: 5, playerSlot: 2, stopOnDeath: false, autoPlayer: true });
  s.fastForward(50);
  const hs = s.statusesOf(s.chars[s.roll.howl1]).find((x) => x.id === 'searing');
  ok(hs && Math.abs(hs.t1 - (47.99 + 18.9)) < 0.01, '熱風狀態剩餘時間正確（結束於 ' + (hs && hs.t1.toFixed(2)) + '）');
  ok(s.statusesOf(s.chars[1]).some((x) => x.id === 'fetters') && s.statusesOf(s.chars[s.roll.fettersDps]).some((x) => x.id === 'fetters'), '火獄之鎖：OT 與 DPS 都有狀態');
  s.fastForward(115.3);
  const tg = s.chars[s.roll.crush[0]];
  const cs = s.statusesOf(tg).find((x) => x.id === 'curse');
  ok(cs && Math.abs(cs.t1 - 117.0) < 0.05, '烈焰碎擊 ≥6 人：詛咒之炎 2 秒（結束於 ' + (cs && cs.t1.toFixed(2)) + '）');
}
// 4) P1 0:14~0:34 南北對調：MT 在北、人群在南
{
  const s = new U.Sim({ phase: 'p1', seed: 2, playerSlot: 0, stopOnDeath: false, autoPlayer: true });
  s.fastForward(25);
  const g = s.s.garuda, mt = s.chars[0];
  const others = s.chars.filter((c) => c.slot !== 0 && c.slot !== 1);
  ok(mt.pos.z < g.pos.z && others.every((c) => c.pos.z > g.pos.z), `25 秒：MT 在 Garuda 北側（${mt.pos.z.toFixed(1)}），人群在南側`);
}
