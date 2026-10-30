const U = require('../src/core.js'); require('../src/frames.js'); require('../src/p1.js'); require('../src/p2.js'); require('../src/p3.js'); require('../src/p4.js');
for (const ph of (process.argv[2] || 'p1,p2,p3').split(',')) {
  const P = U.PHASES[ph];
  console.log('==', ph);
  for (const cp of P.checkpoints) {
    const res = {};
    for (const slot of [0, 2, 4, 7]) {
      const hist = {};
      for (let seed = 1; seed <= 8; seed++) {
        const s = new U.Sim({ phase: ph, seed, playerSlot: slot, stopOnDeath: true });
        if (cp.t > 0) s.fastForward(cp.t);
        if (s.status !== 'running') { hist['FF-fail ' + (s.failure && s.failure.cause)] = 1; continue; }
        s.pc.auto = false; s.pc.goal = null; s.input = { x: 0, z: 0 };
        while (s.status === 'running' && s.t < P.end + 5) s.step(1 / 60);
        const k = s.failure ? `${s.failure.t.toFixed(0)}s ${s.failure.cause.slice(0, 16)}` : 'clear';
        hist[k] = (hist[k] || 0) + 1;
      }
      res[U.ROLES[slot].key] = Object.entries(hist).sort((a, b) => b[1] - a[1])[0].join('×');
    }
    console.log(String(cp.t).padStart(5), cp.name.slice(0, 18).padEnd(20), JSON.stringify(res));
  }
}
