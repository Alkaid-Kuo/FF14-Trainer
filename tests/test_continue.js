// 繼續打模式壓力測試：隨機時間把隨機的人打死，確認機制遇到倒地者不會壞掉、AI 會救人、打得到最後。
// 用法：node tests/test_continue.js [每種的局數] [階段，例如 p1,p2,p3,p3s]
const U = require('../src/core.js'); require('../src/frames.js'); require('../src/p1.js'); require('../src/p2.js'); require('../src/p3.js');
const N = parseInt(process.argv[2] || '40');
const kinds = (process.argv[3] || 'p1,p2,p3,p3s').split(',');
let bad = 0;
for (const kind of kinds) {
  const ph = kind === 'p3s' ? 'p3' : kind, variant = kind === 'p3s' ? 'suicide' : kind === 'p3' ? 'regular' : null;
  const stat = { cleared: 0, wiped: 0, woken: 0, deaths: 0, raises: 0, lb3: 0, errors: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const rng = U.mulberry32(seed * 7919);
    const slot = Math.floor(rng() * 8);
    try {
      const s = new U.Sim({ phase: ph, seed, playerSlot: slot, autoPlayer: true, onDeath: 'continue', variant });
      const kills = [0, 1, 2].map(() => 5 + rng() * (U.PHASES[ph].end - 15)).sort((a, b) => a - b);
      while (s.status === 'running' && s.t < U.PHASES[ph].end + 5) {
        if (kills.length && s.t >= kills[0]) {
          kills.shift();
          const alive = s.alive();
          if (alive.length) s.kill(alive[Math.floor(rng() * alive.length)], '測試：隨機擊殺', { force: true });
        }
        s.step(1 / 60);
      }
      if (s.status === 'cleared') stat.cleared++;
      else if (s.failure && /全員倒地/.test(s.failure.cause)) stat.wiped++;
      else { bad++; console.log('FAIL', kind, seed, s.status, s.failure); }
      if (s.woken) stat.woken++;
      for (const c of s.chars) { stat.deaths += c.stats.deaths; stat.raises += c.stats.raises.length; if (c.stats.used.lb) stat.lb3++; }
    } catch (e) { bad++; stat.errors++; console.log('ERROR', kind, seed, e.stack.split('\n').slice(0, 4).join(' | ')); }
  }
  console.log(kind, JSON.stringify(stat));
}
console.log(bad ? `bad ${bad}` : 'ok');
