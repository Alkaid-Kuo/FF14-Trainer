/* 共用圖示（2D 與 3D 都用）：頭頂點名標記、分攤箭頭環、粒子貼圖、龍捲紋理、場地標點。全部用 canvas 畫出來並快取。 */
(function (root) {
'use strict';
const PI = Math.PI;
const cache = {};
const make = (key, w, h, draw) => {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  cache[key] = c;
  return c;
};

function glowCircle(ctx, x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, inner); g.addColorStop(0.7, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
}
function arrow(ctx, len, w) {
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-w, -w * 1.1); ctx.lineTo(-w * 0.42, -w * 1.1); ctx.lineTo(-w * 0.42, -len);
  ctx.lineTo(w * 0.42, -len); ctx.lineTo(w * 0.42, -w * 1.1); ctx.lineTo(w, -w * 1.1); ctx.closePath();
}

/** 頭頂點名標記（128×128）。 */
function marker(type) {
  return make('marker-' + type, 128, 128, (ctx) => {
    const cx = 64, cy = 60;
    if (type === 'song') {
      // 寒風之歌：綠色點名（菱形＋向下箭頭）
      glowCircle(ctx, cx, cy, 60, 'rgba(120,255,160,0.9)', 'rgba(30,200,90,0.4)');
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(PI / 4);
      ctx.fillStyle = '#138a3e'; ctx.strokeStyle = '#d6ffe2'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.rect(-28, -28, 56, 56); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#f2fff6';
      ctx.beginPath(); ctx.moveTo(cx - 17, cy - 12); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx + 17, cy - 12); ctx.lineTo(cx + 17, cy - 1); ctx.lineTo(cx, cy + 17); ctx.lineTo(cx - 17, cy - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7dffaa'; ctx.beginPath(); ctx.moveTo(cx - 12, 108); ctx.lineTo(cx + 12, 108); ctx.lineTo(cx, 124); ctx.closePath(); ctx.fill();
    } else if (type === 'friction') {
      // 烈風刃：黃色鎖定準星
      glowCircle(ctx, cx, cy, 58, 'rgba(255,230,120,0.9)', 'rgba(255,170,30,0.35)');
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, 30, 0, PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffb21e'; ctx.lineWidth = 7;
      for (let i = 0; i < 4; i++) {
        const a = i * PI / 2 + PI / 4;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); ctx.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, PI * 2); ctx.fill();
    } else if (type === 'crush') {
      // 烈焰碎擊：分攤標記（四支箭頭指向中心）
      glowCircle(ctx, cx, cy, 62, 'rgba(255,170,90,0.95)', 'rgba(230,60,20,0.45)');
      ctx.save(); ctx.translate(cx, cy);
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i * PI / 2);
        ctx.translate(0, -12);
        ctx.fillStyle = '#ffefdc'; ctx.strokeStyle = '#a3260a'; ctx.lineWidth = 3;
        arrow(ctx, 40, 16); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#ff3d14'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, PI * 2); ctx.fill();
      ctx.restore();
    } else if (type === 'gaol') {
      // 花崗石牢：琥珀色光暈＋石頭牢籠
      glowCircle(ctx, cx, cy, 60, 'rgba(255,200,120,0.95)', 'rgba(170,100,40,0.45)');
      ctx.fillStyle = '#6a4a2a'; ctx.strokeStyle = '#ffe2b0'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx - 30, cy + 30); ctx.lineTo(cx - 34, cy - 18); ctx.lineTo(cx - 16, cy - 34); ctx.lineTo(cx + 16, cy - 34); ctx.lineTo(cx + 34, cy - 18); ctx.lineTo(cx + 30, cy + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 6;
      for (const x of [-16, 0, 16]) { ctx.beginPath(); ctx.moveTo(cx + x, cy - 26); ctx.lineTo(cx + x, cy + 26); ctx.stroke(); }
      ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.moveTo(cx - 12, 108); ctx.lineTo(cx + 12, 108); ctx.lineTo(cx, 124); ctx.closePath(); ctx.fill();
    } else if (type === 'erupt') {
      // 地火噴發：橘紅光暈＋往上噴的火焰
      glowCircle(ctx, cx, cy, 60, 'rgba(255,150,70,0.95)', 'rgba(220,60,10,0.45)');
      ctx.fillStyle = '#ffcf8a'; ctx.strokeStyle = '#8a2208'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx, cy - 36); ctx.quadraticCurveTo(cx + 26, cy - 4, cx + 18, cy + 22); ctx.quadraticCurveTo(cx, cy + 34, cx - 18, cy + 22);
      ctx.quadraticCurveTo(cx - 26, cy - 4, cx, cy - 36); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff6a1e'; ctx.beginPath(); ctx.ellipse(cx, cy + 10, 9, 14, 0, 0, PI * 2); ctx.fill();
      ctx.fillStyle = '#ffcf8a'; ctx.beginPath(); ctx.moveTo(cx - 12, 108); ctx.lineTo(cx + 12, 108); ctx.lineTo(cx, 124); ctx.closePath(); ctx.fill();
    } else if (type === 'pillar') {
      // 光柱：青色光暈＋直立的光柱
      glowCircle(ctx, cx, cy, 60, 'rgba(140,255,240,0.95)', 'rgba(30,170,200,0.45)');
      ctx.fillStyle = '#e8fffb'; ctx.strokeStyle = '#1a8a9a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.rect(cx - 11, cy - 36, 22, 66); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy + 30, 26, 9, 0, 0, PI * 2); ctx.stroke();
      ctx.fillStyle = '#8affef'; ctx.beginPath(); ctx.moveTo(cx - 12, 108); ctx.lineTo(cx + 12, 108); ctx.lineTo(cx, 124); ctx.closePath(); ctx.fill();
    } else {
      glowCircle(ctx, cx, cy, 56, 'rgba(255,255,255,0.9)', 'rgba(150,150,255,0.4)');
    }
  });
}

/** 目標圈（512×512，圓環半徑 200）：enemy＝紅色、背後缺口、兩側標記、前方箭頭（前方＝畫布下方）；ally＝綠色完整圓環。 */
const RING_R = 200;
function targetRing(kind) {
  return make('tring-' + kind, 512, 512, (ctx) => {
    const cx = 256, cy = 256, R = RING_R, enemy = kind === 'enemy';
    const glow = enemy ? 'rgba(255,40,30,' : 'rgba(60,255,140,', line = enemy ? '#fff2ee' : '#effff4';
    const gap = enemy ? 0.62 : 0;   // 背後缺口（半角，弧度）
    const a0 = -PI / 2 + gap, a1 = PI * 1.5 - gap;
    const arc = (r, w, style, blur) => {
      ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = style; ctx.lineCap = 'round';
      if (blur) { ctx.shadowColor = glow + '1)'; ctx.shadowBlur = blur; }
      ctx.beginPath(); if (gap) ctx.arc(cx, cy, r, a0, a1); else ctx.arc(cx, cy, r, 0, PI * 2); ctx.stroke(); ctx.restore();
    };
    arc(R - 9, 34, glow + '0.55)', 28);   // 外層紅光
    arc(R + 6, 5, line, 10);
    arc(R - 22, 4, line, 8);
    if (!enemy) return;
    // 兩側標記（左右各一個 V 形）
    for (const sx of [-1, 1]) {
      ctx.save(); ctx.translate(cx + sx * (R - 8), cy); ctx.rotate(sx * -PI / 2);
      ctx.shadowColor = glow + '1)'; ctx.shadowBlur = 12;
      ctx.strokeStyle = line; ctx.lineWidth = 6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-17, -9); ctx.lineTo(0, 9); ctx.lineTo(17, -9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(0, -10); ctx.lineTo(10, -20); ctx.stroke();
      ctx.restore();
    }
    // 前方箭頭（畫布下方）
    ctx.save(); ctx.translate(cx, cy + R + 4);
    ctx.shadowColor = glow + '1)'; ctx.shadowBlur = 16;
    ctx.fillStyle = line; ctx.strokeStyle = '#c21a10'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 44); ctx.quadraticCurveTo(-24, 6, -20, -22); ctx.lineTo(20, -22); ctx.quadraticCurveTo(24, 6, 0, 44); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c21a10'; ctx.beginPath(); ctx.ellipse(0, -2, 5, 14, 0, 0, PI * 2); ctx.fill();
    ctx.restore();
  });
}

/** 分攤地面箭頭環（256×256，箭頭指向中心）。 */
function stackRing() {
  return make('stackRing', 256, 256, (ctx) => {
    ctx.translate(128, 128);
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * PI / 4);
      ctx.translate(0, -84);
      ctx.rotate(PI);
      ctx.fillStyle = 'rgba(255,236,190,0.95)'; ctx.strokeStyle = 'rgba(160,60,0,0.9)'; ctx.lineWidth = 3;
      arrow(ctx, 34, 15); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  });
}
/** 方向箭頭帶（直線攻擊上流動用，256×64）。 */
function chevrons() {
  return make('chevrons', 256, 64, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      const x = 20 + i * 64;
      ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x + 26, 32); ctx.lineTo(x, 54); ctx.stroke();
    }
  });
}
/** 粒子：柔和光點。 */
function softDot() {
  return make('softDot', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
}
/** 粒子：羽毛。 */
function feather() {
  return make('feather', 64, 64, (ctx) => {
    ctx.translate(32, 32); ctx.rotate(-0.7);
    const g = ctx.createLinearGradient(0, -28, 0, 28);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(190,225,255,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 9, 28, 0, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,190,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 30); ctx.stroke();
  });
}
/** 龍捲紋理：斜向條紋（可水平重複）。 */
function swirl() {
  return make('swirl', 256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    for (let i = -8; i < 16; i++) {
      const g = ctx.createLinearGradient(0, 0, 256, 0);
      const a = 0.25 + 0.5 * ((i * 37) % 7) / 7;
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 6 + (i % 3) * 4;
      ctx.beginPath(); ctx.moveTo(i * 32, 256); ctx.lineTo(i * 32 + 160, 0); ctx.stroke();
    }
    const v = ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = v; ctx.fillRect(0, 0, 256, 256);
  });
}
/** 預警圈貼圖：中心淡、邊緣亮（FF14 風格）。 */
function aoeRadial() {
  return make('aoeRadial', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.93, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  });
}
function aoeLinear() {
  return make('aoeLinear', 64, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,255,255,0.7)'); g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.92, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  });
}
/** 火柱貼圖：底部亮、往上漸淡，帶縱向火舌。 */
function flame() {
  return make('flame', 128, 256, (ctx) => {
    for (let i = 0; i < 26; i++) {
      const x = (i * 53) % 128, w = 10 + (i * 7) % 18, h = 120 + (i * 31) % 120;
      const g = ctx.createLinearGradient(0, 256, 0, 256 - h);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, 256, w, h, 0, PI, 0); ctx.fill();
    }
  });
}
/** 場地標點 A/B/C/D/1（FF14 風格：發光外圈＋字）。 */
function waymark(letter, color) {
  return make('wm-' + letter, 256, 256, (ctx) => {
    const square = /\d/.test(letter);
    ctx.translate(128, 128);
    const g = ctx.createRadialGradient(0, 0, 40, 0, 0, 128);
    g.addColorStop(0, color + '55'); g.addColorStop(0.8, color + '33'); g.addColorStop(1, color + '00');
    ctx.fillStyle = g; ctx.fillRect(-128, -128, 256, 256);
    ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.beginPath();
    if (square) ctx.rect(-86, -86, 172, 172); else ctx.arc(0, 0, 92, 0, PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 16; ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, 0, 8);
  });
}

root.UWU_ICONS = { marker, stackRing, chevrons, softDot, feather, swirl, aoeRadial, aoeLinear, flame, waymark, targetRing, RING_R };
})(window);
