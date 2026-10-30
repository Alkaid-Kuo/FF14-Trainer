// 完整體驗（P1→P2→P3→P4）全 AI：階段之間位置延續、無倒數，每個職位都要打完。用法：node tests/test_chain.js [每個職位的局數]
const U = require('../src/core.js'); require('../src/frames.js'); require('../src/p1.js'); require('../src/p2.js'); require('../src/p3.js'); require('../src/p4.js');
const CHAIN = ['p1', 'p2', 'p3', 'p4'];
const N = parseInt(process.argv[2] || '3');
let bad = 0, runs = 0;
for (let slot = 0; slot < 8; slot++) {
  for (let seed = 1; seed <= N; seed++) {
    let prev = null, ok = true;
    for (const ph of CHAIN) {
      const o = { phase: ph, seed: seed * 31 + slot * 7 + CHAIN.indexOf(ph), playerSlot: slot, autoPlayer: true, variant: ph === 'p3' ? 'regular' : null };
      if (prev) Object.assign(o, { startPos: prev.chars.map((c) => [c.pos.x, c.pos.z]), preRoll: 0, lb: prev.lb });
      const s = new U.Sim(o);
      while (s.status === 'running') s.step(1 / 60);
      if (s.status !== 'cleared') { ok = false; console.log('FAIL', U.ROLES[slot].key, seed, ph, s.failure.t.toFixed(1), s.failure.cause); break; }
      prev = s;
    }
    runs++; if (!ok) bad++;
  }
}
console.log('chains', runs, 'bad', bad);
