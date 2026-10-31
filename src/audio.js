/* 音效：全部用 WebAudio 即時合成，不需要音檔。第一次按鍵／點擊後才會啟動（瀏覽器限制）。 */
(function (root) {
'use strict';

class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.noiseBuf = null;
    this.vol = 0.6; this.muted = false;
    this.lastPlay = {};
  }

  /** 由使用者手勢呼叫：建立或喚醒 AudioContext。 */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.connect(comp);
    const n = c.sampleRate * 1.5, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.ctx = c;
    this.applyVol();
  }
  setVolume(vol, muted) { this.vol = vol; this.muted = muted; this.applyVol(); }
  applyVol() { if (this.master) this.master.gain.value = this.muted ? 0 : this.vol * 0.9; }
  ready() { return !!this.ctx && this.ctx.state === 'running' && !this.muted && this.vol > 0; }

  tone(freq, dur, o) {
    const c = this.ctx, t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  noise(dur, o) {
    const c = this.ctx, t0 = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0, Math.random() * 0.4); src.stop(t0 + dur + 0.05);
  }

  /** 鷹嘯：高頻滑音（先上揚再下滑）＋快速顫音＋氣聲，兩段「咿——啊」。 */
  eagle(delay, len, f0, f1, f2, vol) {
    const c = this.ctx, t0 = c.currentTime + delay;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
    out.gain.setValueAtTime(vol, t0 + len * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(f1 * 1.1, t0); bp.frequency.exponentialRampToValueAtTime(f2 * 1.2, t0 + len);
    bp.connect(out); out.connect(this.master);
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 28; depth.gain.value = f1 * 0.035;
    lfo.connect(depth);
    for (const [type, mult, g] of [['sawtooth', 1, 0.55], ['triangle', 2.01, 0.25]]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type; og.gain.value = g;
      o.frequency.setValueAtTime(f0 * mult, t0);
      o.frequency.exponentialRampToValueAtTime(f1 * mult, t0 + len * 0.18);
      o.frequency.exponentialRampToValueAtTime(f2 * mult, t0 + len);
      depth.connect(o.frequency);
      o.connect(og); og.connect(bp);
      o.start(t0); o.stop(t0 + len + 0.05);
    }
    lfo.start(t0); lfo.stop(t0 + len + 0.05);
    this.noise(len * 0.9, { filter: 'bandpass', freq: f1 * 1.2, freqTo: f2, q: 3, vol: vol * 0.25, delay });
  }

  /** power：0~1，影響音量與長度。同一音效 60ms 內只播一次，避免同時判定時爆音。 */
  play(name, power) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] !== undefined && now - this.lastPlay[name] < 0.06) return;
    this.lastPlay[name] = now;
    const p = power === undefined ? 0.6 : power;
    switch (name) {
      case 'count': this.tone(880, 0.13, { type: 'square', vol: 0.09 }); break;
      case 'go': this.tone(1320, 0.3, { type: 'square', vol: 0.11 }); this.tone(660, 0.3, { type: 'triangle', vol: 0.12 }); break;
      case 'cast':
        this.noise(0.55, { filter: 'bandpass', freq: 500, freqTo: 2600, q: 1.4, vol: 0.06, attack: 0.15 });
        this.tone(392, 0.45, { type: 'triangle', vol: 0.05, slideTo: 587, attack: 0.08 });
        break;
      case 'markMe':
        this.tone(988, 0.14, { type: 'triangle', vol: 0.22 });
        this.tone(1480, 0.22, { type: 'triangle', vol: 0.2, delay: 0.11 });
        break;
      case 'mark': this.tone(784, 0.12, { type: 'triangle', vol: 0.06 }); break;
      case 'target': this.tone(1175, 0.05, { type: 'square', vol: 0.045 }); this.tone(1568, 0.07, { type: 'triangle', vol: 0.05, delay: 0.04 }); break;   // 選取目標
      case 'boom':
        this.noise(0.3 + 0.45 * p, { freq: 2200, freqTo: 140, vol: 0.12 + 0.3 * p });
        this.tone(110, 0.35 + 0.35 * p, { vol: 0.12 + 0.3 * p, slideTo: 38 });
        break;
      case 'fire':
        this.noise(0.5 + 0.5 * p, { filter: 'bandpass', freq: 900, freqTo: 260, q: 0.6, vol: 0.12 + 0.28 * p });
        this.noise(0.25, { filter: 'highpass', freq: 3000, vol: 0.05 + 0.08 * p });
        this.tone(80, 0.5 + 0.3 * p, { vol: 0.12 + 0.25 * p, slideTo: 35 });
        break;
      case 'wind':
        this.noise(0.6 + 0.4 * p, { filter: 'bandpass', freq: 400, freqTo: 1800, q: 2.2, vol: 0.1 + 0.25 * p, attack: 0.08 });
        this.tone(140, 0.4, { vol: 0.08 + 0.15 * p, slideTo: 60 });
        break;
      case 'stack':
        this.tone(220, 0.25, { type: 'triangle', vol: 0.18 });
        this.tone(165, 0.35, { type: 'triangle', vol: 0.16, delay: 0.08 });
        this.noise(0.4, { freq: 1600, freqTo: 200, vol: 0.12 });
        break;
      case 'raidwide':
        this.noise(1.3, { freq: 3000, freqTo: 90, vol: 0.38 });
        this.tone(70, 1.2, { vol: 0.4, slideTo: 28 });
        this.noise(0.9, { filter: 'bandpass', freq: 600, freqTo: 150, vol: 0.12, delay: 0.25 });
        break;
      case 'knock':
        this.noise(0.5, { filter: 'bandpass', freq: 1800, freqTo: 300, q: 1.5, vol: 0.18 });
        break;
      case 'death': this.tone(523, 0.5, { type: 'sawtooth', vol: 0.05, slideTo: 130 }); break;
      case 'deathMe':
        this.tone(392, 0.9, { type: 'sawtooth', vol: 0.12, slideTo: 82 });
        this.tone(55, 0.7, { vol: 0.3, slideTo: 30 });
        break;
      case 'charge':
        [660, 880, 1175].forEach((f, i) => this.tone(f, 0.28, { type: 'sine', vol: 0.12, delay: i * 0.08 }));
        break;
      case 'clear':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.22, { type: 'triangle', vol: 0.16, delay: i * 0.12 }));
        break;
      case 'fail':
        [440, 370, 311].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.13, delay: i * 0.18 }));
        break;
      case 'eagle':
        this.eagle(0, 0.55, 2100, 3300, 2500, 0.32);
        this.eagle(0.5, 0.95, 2600, 3100, 1500, 0.36);
        break;
      case 'phase':
        [392, 523, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.12, delay: i * 0.15 }));
        break;
      case 'quake':      // 泰坦落地：低沉重擊＋長地鳴
        this.tone(55, 1.6, { vol: 0.45, slideTo: 24 });
        this.noise(0.5, { freq: 1800, freqTo: 120, vol: 0.35 });
        this.noise(2.2, { filter: 'lowpass', freq: 260, freqTo: 60, vol: 0.28, attack: 0.15, delay: 0.1 });
        break;
      case 'rock':       // 岩石落地／碎裂：清脆的碎裂聲＋悶響
        this.noise(0.18, { filter: 'highpass', freq: 2500, vol: 0.14 });
        this.noise(0.45, { filter: 'bandpass', freq: 700, freqTo: 180, q: 1.2, vol: 0.2, delay: 0.02 });
        this.tone(95, 0.4, { vol: 0.18, slideTo: 45 });
        break;
      case 'jump':       // 泰坦跳起：往上的風切聲
        this.noise(0.9, { filter: 'bandpass', freq: 300, freqTo: 2400, q: 0.9, vol: 0.18, attack: 0.3 });
        this.tone(90, 0.5, { vol: 0.15, slideTo: 40 });
        break;
      case 'skill': this.tone(1046, 0.07, { type: 'triangle', vol: 0.07 }); break;   // 自己用技能
      case 'raised':     // 收到復活
        [784, 988, 1319].forEach((f, i) => this.tone(f, 0.35, { type: 'sine', vol: 0.12, delay: i * 0.09 }));
        break;
      case 'lb':         // 極限技：上升的和弦＋重擊
        [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', vol: 0.1, delay: i * 0.05 }));
        this.noise(1.0, { filter: 'bandpass', freq: 400, freqTo: 3000, q: 0.8, vol: 0.16, attack: 0.2 });
        this.tone(65, 0.9, { vol: 0.3, slideTo: 30, delay: 0.25 });
        break;
      default: break;
    }
  }
}

root.Sfx = Sfx;
})(window);
