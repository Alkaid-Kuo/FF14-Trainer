// P3 機制：站錯會出事
const U = require('../src/core.js');
require('../src/frames.js'); require('../src/p3.js');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const run = (s, t, input) => { while (s.status === 'running' && s.t < t) { if (input) s.input = input(s); s.step(1 / 60); } };
const mk = (o) => new U.Sim(Object.assign({ phase: 'p3', seed: 7, playerSlot: 4, stopOnDeath: false, autoPlayer: true }, o));

// 1) 大怒震：站錯邊 → 被擊退到爆破岩石爆炸裡
{
  const s = mk({}); s.fastForward(41.5); s.setPlayerAuto(false);
  const T = s.s.titan, d = Math.hypot(T.pos.x, T.pos.z), ux = -T.pos.x / d, uz = -T.pos.z / d;
  // 站在泰坦正面 3.5、往「錯的一側」偏 2.5（正確側的反方向）
  const good = s.chars[4].pos, side = { x: -uz, z: ux };
  const sgn = Math.sign((good.x - T.pos.x) * side.x + (good.z - T.pos.z) * side.z) || 1;
  s.pc.pos.x = T.pos.x + ux * 3.5 - side.x * sgn * 2.5; s.pc.pos.z = T.pos.z + uz * 3.5 - side.z * sgn * 2.5;
  run(s, 44.5, () => ({ x: 0, z: 0 }));
  ok(!s.pc.alive && /爆破岩石/.test(s.pc.deathCause), '大怒震站錯邊 → ' + s.pc.deathCause);
}
// 1b) 站對邊 → 存活
{
  const s = mk({}); s.fastForward(41.5); s.setPlayerAuto(false);
  run(s, 46, () => ({ x: 0, z: 0 }));
  ok(s.pc.alive, '大怒震站對邊（AI 位置）→ 存活');
}
// 2) 大地粉碎：跳躍後站在落點附近 → 秒殺
{
  const s = mk({}); s.fastForward(31); s.setPlayerAuto(false);
  const land = U.atBearing(s.roll.j1, 17.2);
  s.pc.pos.x = land.x * 0.6; s.pc.pos.z = land.z * 0.6;
  run(s, 34.5, () => ({ x: 0, z: 0 }));
  ok(!s.pc.alive && /大地粉碎/.test(s.pc.deathCause), '跳躍後站落點側 → ' + s.pc.deathCause);
}
// 3) 場地縮小：0:34 後站在外圈 → 即死
{
  const s = mk({}); s.fastForward(31); s.setPlayerAuto(false);
  const opp = U.atBearing((s.roll.j1 + 180) % 360, 17.5);
  s.pc.pos.x = opp.x; s.pc.pos.z = opp.z;
  run(s, 34.5, () => ({ x: 0, z: 0 }));
  ok(!s.pc.alive && /危險區域/.test(s.pc.deathCause), '縮圈後站外圈 → ' + s.pc.deathCause);
}
// 4) 大地之重：不動 → 死
{
  const s = mk({}); s.fastForward(23.5); s.setPlayerAuto(false);
  run(s, 26.5, () => ({ x: 0, z: 0 }));
  ok(!s.pc.alive && /大地之重/.test(s.pc.deathCause), '大地之重不動 → ' + s.pc.deathCause);
}
// 5) 石牢：被點名的人站錯位置 → 連鎖斷掉、泰坦不覺醒（找一個點到石牢的種子）
{
  let done = false;
  for (let seed = 1; seed < 40 && !done; seed++) {
    const p = new U.Sim({ phase: 'p3', seed, playerSlot: 0, stopOnDeath: false, autoPlayer: true }); p.fastForward(45.2);
    const g = p.s.gaol.find((x) => x.idx === 1); if (!g) continue;
    const s = mk({ seed, playerSlot: g.slot }); s.fastForward(45.2); s.setPlayerAuto(false);
    // 1 號位的人跑去場邊（離其他石牢太遠）
    run(s, 49.5, (S) => { const sp = U.atBearing((S.roll.j1 + 90) % 360, 14); const dx = sp.x - S.pc.pos.x, dz = sp.z - S.pc.pos.z, d = Math.hypot(dx, dz); return d < 0.3 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d }; });
    s.setPlayerAuto(true);
    run(s, 170);
    ok(s.status === 'failed' && !s.s.woken && s.s.chain.length < 3, `石牢 1 號位站錯（seed ${seed}）→ 連鎖 ${s.s.chain.length} 顆、覺醒 ${s.s.charges}/4、結果 ${s.status}`);
    const o = s.objectives().find((x) => /花崗石牢/.test(x.text));
    ok(o && !o.ok, '結算：' + (o && o.text) + ' ✗');
    done = true;
  }
}
// 6) 污泥：站在污泥上 → 死
{
  const s = mk({ playerSlot: 0 }); s.fastForward(55.0); s.setPlayerAuto(false);
  const z = s.s.sludge[0]; s.pc.pos.x = z.x; s.pc.pos.z = z.z;
  run(s, 56.5, () => ({ x: 0, z: 0 }));
  ok(!s.pc.alive && /污泥/.test(s.pc.deathCause), '踩污泥 → ' + s.pc.deathCause);
}
// 7) 地裂：站在線上不動 → 死
{
  const s = mk({}); s.fastForward(46.1); s.setPlayerAuto(false);
  const line = s.fx.find((f) => /Landslide/.test(f.label));
  s.pc.pos.x = line.x + Math.sin(line.rot) * 8; s.pc.pos.z = line.z + Math.cos(line.rot) * 8;
  run(s, 49, () => ({ x: 0, z: 0 }));
  ok(!s.pc.alive && /地裂/.test(s.pc.deathCause), '站地裂線上 → ' + s.pc.deathCause);
}
// 8) 自殺流：OT 沒有死 → 失敗；早起 → 失敗；正確時機起身 → 通過
{
  const s = mk({ variant: 'suicide', playerSlot: 1 }); s.fastForward(26.3); s.setPlayerAuto(false);
  run(s, 30, (S) => ({ x: 1, z: 0 }));
  ok(s.status === 'failed' && /要留在第二波/.test(s.failure.cause), '自殺流 OT 躲開第二波 → ' + (s.failure && s.failure.cause));
}
{
  const s = mk({ variant: 'suicide', playerSlot: 1 }); s.fastForward(40); s.setPlayerAuto(false);
  ok(!s.pc.alive && s.pc.raise && s.status === 'running', '自殺流 OT 0:29 死亡、0:35 收到復活，未失敗');
  s.s.accept(1);
  ok(s.status === 'failed' && /太早/.test(s.failure.cause), '0:40 起身 → ' + (s.failure && s.failure.cause));
}
{
  const s = mk({ variant: 'suicide', playerSlot: 5 }); s.fastForward(50.5); s.setPlayerAuto(false);
  ok(s.s.gaol.map((g) => g.slot).sort().join() === [2, 3, 7].sort().join(), '自殺流石牢固定點 H1/H2/C：' + s.roll.gaolTargets.join('、'));
  run(s, 54.0); s.s.accept(5); s.setPlayerAuto(true); run(s, 170);
  const o = s.objectives();
  ok(s.status === 'cleared' && o.every((x) => x.ok), '自殺流 M2 0:54 起身 → 通過：' + o.map((x) => (x.ok ? '✓' : '✗') + x.text).join(' / '));
}
{
  const s = mk({ variant: 'suicide', playerSlot: 6 }); s.fastForward(64); s.setPlayerAuto(false);
  run(s, 66, () => ({ x: 0, z: 0 }));
  ok(!s.pc.alive && s.pc.raise, 'R 在 1:05 收到 C 的 10 秒復活');
  run(s, 75, () => ({ x: 0, z: 0 }));
  ok(s.status === 'failed' && /R 沒有接受復活/.test(s.failure.cause), 'R 不起身 → ' + (s.failure && s.failure.cause));
}
