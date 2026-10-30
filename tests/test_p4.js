// P4 全 AI 回歸：每個職位、多組隨機都要通過（立即重來模式）。用法：node tests/test_p4.js [每個職位的局數]
const U = require('../src/core.js'); require('../src/frames.js'); require('../src/p1.js'); require('../src/p2.js'); require('../src/p3.js'); require('../src/p4.js');
const N = parseInt(process.argv[2] || '30');
const t0 = Date.now(); let runs = 0, bad = 0; const why = {};
for (let slot = 0; slot < 8; slot++) {
  for (let seed = 1; seed <= N; seed++) {
    const s = new U.Sim({ phase: 'p4', seed: seed * 977 + slot, playerSlot: slot, autoPlayer: true });
    while (s.status === 'running') s.step(1 / 60);
    runs++;
    if (s.status !== 'cleared') { bad++; const k = `${s.failure.t.toFixed(0)}s ${s.failure.slot >= 0 ? U.ROLES[s.failure.slot].key : '-'} ${s.failure.cause.slice(0, 30)}`; why[k] = (why[k] || 0) + 1; }
  }
}
console.log('runs', runs, 'bad', bad, 'ms', Date.now() - t0);
console.log(Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 12));
