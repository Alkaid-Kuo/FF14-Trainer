const U = require('../src/core.js');
require('../src/frames.js');
require('../src/p3.js');
const t0 = Date.now();
const N = parseInt(process.argv[2] || '40');
const variants = (process.argv[3] || 'regular,suicide').split(',');
for (const v of variants) {
  let bad = 0, total = 0; const causes = {}; const ch = {};
  for (let seed = 1; seed <= N; seed++) {
    for (const slot of [0, 1, 2, 3, 4, 5, 6, 7]) {
      total++;
      const s = new U.Sim({ phase: 'p3', seed, playerSlot: slot, autoPlayer: true, stopOnDeath: false, variant: v });
      while (s.status === 'running' && s.t < 170) s.step(1 / 60);
      ch[s.charges] = (ch[s.charges] || 0) + 1;
      const deaths = s.notes.filter((n) => n.type === 'death');
      if (deaths.length || s.status !== 'cleared') {
        bad++;
        const k = deaths.map((d) => `${d.slot}@${d.t.toFixed(1)}:${d.text}`).join(' | ') || ('status ' + s.status);
        causes[k] = (causes[k] || 0) + 1;
      }
    }
  }
  console.log(v, 'runs', total, 'bad', bad, 'ms', Date.now() - t0, 'charges', ch);
  console.log(Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 12));
}
