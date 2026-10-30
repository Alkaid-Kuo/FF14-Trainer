/* 3D 模型：全部用 Three.js 基本幾何程式生成（隊員、迦樓羅、伊弗利特、小怪、場上物件），附簡單動作。
   模型正面朝 +z（與模擬的 rot = 0 一致）；腳底在 y = 0。 */
(function (root) {
'use strict';
const T = root.THREE;
const PI = Math.PI;

const GEO = {};
const geo = (key, make) => {
  if (!GEO[key]) { GEO[key] = make(); GEO[key].userData.shared = true; }   // 共用幾何：移除物件時不要釋放
  return GEO[key];
};
const std = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.05 }, o || {}));
const glowMat = (color, intensity, o) => new T.MeshStandardMaterial(Object.assign({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }, o || {}));
function mesh(g, m, x, y, z) {
  const o = new T.Mesh(g, m);
  o.position.set(x || 0, y || 0, z || 0);
  o.castShadow = true;
  return o;
}
function pivot(x, y, z) { const g = new T.Group(); g.position.set(x, y, z); return g; }
/** 沿 -y 方向延伸的圓柱／膠囊（原點在頂端，方便當關節）。 */
const limb = (key, r0, r1, len, seg) => geo(key, () => { const g = new T.CylinderGeometry(r0, r1, len, seg || 10); g.translate(0, -len / 2, 0); return g; });
const capsule = (key, r, len) => geo(key, () => { const g = new T.CapsuleGeometry(r, len, 4, 10); g.translate(0, -len / 2 - r, 0); return g; });
const ball = (key, r, ws, hs) => geo(key, () => new T.SphereGeometry(r, ws || 14, hs || 10));
/** 沿曲線、由粗變細的管子（角、羽毛、長髮、尾巴）。points：[[x,y,z]...]。 */
function taper(key, points, r0, r1, seg, radial) {
  return geo(key, () => {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const S = seg || 16, Rr = radial || 8;
    const g = new T.TubeGeometry(curve, S, 1, Rr, false);
    const pos = g.attributes.position, v = new T.Vector3();
    for (let i = 0; i <= S; i++) {
      const u = i / S, c = curve.getPointAt(u), r = r0 + (r1 - r0) * u;
      for (let j = 0; j <= Rr; j++) {
        const k = i * (Rr + 1) + j;
        v.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c).multiplyScalar(r).add(c);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}
/** 扁平羽毛（橢球壓扁），長度 len 沿 +y。 */
const feather = (key) => geo(key, () => { const g = new T.SphereGeometry(1, 12, 8); g.translate(0, 1, 0); return g; });
function addFeather(parent, mat, len, width, x, y, z, rz, rx, ry) {
  const f = mesh(feather('fth'), mat, x, y, z);
  f.scale.set(width, len / 2, width * 0.18);
  f.rotation.set(rx || 0, ry || 0, rz || 0);
  parent.add(f);
  return f;
}

// ------------------------------------------------------------------ 隊員
const guardGeo = () => geo('cGuard', () => new T.BoxGeometry(0.22, 0.04, 0.05));
const hiltGeo = () => geo('cHilt', () => { const g = new T.CylinderGeometry(0.025, 0.025, 0.2, 6); g.translate(0, 0.1, 0); return g; });
const HAIR = [0x3b2a20, 0xd8bf86, 0x8a3b22, 0x22222c, 0xe9e3da, 0x5a3a72, 0xb2602c, 0x2c3d5e];
const SKIN = [0xf1d2b0, 0xe8c09a, 0xf3d9be, 0xd9a882, 0xf0cfae, 0xe2b48e, 0xf4dcc4, 0xe6bf9c];

function character(role) {
  const col = new T.Color(role.color);
  const mats = {
    cloth: std(col.clone(), { roughness: 0.68 }),
    cloth2: std(col.clone().multiplyScalar(0.5), { roughness: 0.72 }),
    trim: std(0xe8d9a8, { metalness: 0.55, roughness: 0.35 }),
    skin: std(SKIN[role.slot], { roughness: 0.8 }),
    hair: std(HAIR[role.slot], { roughness: 0.5 }),
    boot: std(0x2e2620, { roughness: 0.75 }),
    metal: std(0xc9ced8, { metalness: 0.75, roughness: 0.3 }),
    wood: std(0x6e4a2c, { roughness: 0.7 }),
    eye: std(0x15171c),
  };
  const group = new T.Group();
  const body = new T.Group(); group.add(body);

  // 腿
  const legL = pivot(-0.13, 0.88, 0), legR = pivot(0.13, 0.88, 0);
  for (const leg of [legL, legR]) {
    leg.add(mesh(capsule('cLeg', 0.085, 0.56), mats.cloth2));
    leg.add(mesh(geo('cBoot', () => { const g = new T.CapsuleGeometry(0.085, 0.16, 3, 8); g.rotateX(PI / 2); g.translate(0, -0.8, 0.06); return g; }), mats.boot));
  }
  body.add(legL, legR);
  // 身體（車床旋轉：裙擺→腰→胸→肩）
  const torso = mesh(geo('cTorso', () => new T.LatheGeometry([
    [0.0, 0.78], [0.29, 0.8], [0.31, 0.9], [0.23, 1.05], [0.22, 1.12], [0.25, 1.3], [0.28, 1.5], [0.24, 1.63], [0.1, 1.7], [0.0, 1.71],
  ].map(([r, y]) => new T.Vector2(r, y)), 18)), mats.cloth);
  body.add(torso);
  body.add(mesh(geo('cBelt', () => { const g = new T.TorusGeometry(0.225, 0.03, 6, 18); g.rotateX(PI / 2); return g; }), mats.trim, 0, 1.08, 0));
  body.add(mesh(geo('cCollar', () => { const g = new T.TorusGeometry(0.13, 0.03, 6, 16); g.rotateX(PI / 2); return g; }), mats.trim, 0, 1.68, 0));
  for (const sx of [-1, 1]) { const pad = mesh(ball('cPad', 0.11), mats.cloth2, sx * 0.28, 1.6, 0); pad.scale.set(1, 0.75, 1); body.add(pad); }
  // 手臂
  const armL = pivot(-0.3, 1.6, 0), armR = pivot(0.3, 1.6, 0);
  for (const arm of [armL, armR]) {
    arm.add(mesh(capsule('cArm', 0.062, 0.48), mats.cloth));
    arm.add(mesh(geo('cCuff', () => { const g = new T.CylinderGeometry(0.075, 0.07, 0.1, 10); g.translate(0, -0.5, 0); return g; }), mats.trim));
    arm.add(mesh(geo('cHand', () => { const g = new T.SphereGeometry(0.07, 10, 8); g.translate(0, -0.64, 0); return g; }), mats.skin));
  }
  armL.rotation.z = -0.1; armR.rotation.z = 0.1;
  body.add(armL, armR);
  // 頭
  body.add(mesh(geo('cNeck', () => new T.CylinderGeometry(0.06, 0.07, 0.12, 8)), mats.skin, 0, 1.74, 0));
  const head = pivot(0, 1.93, 0);
  const skull = mesh(ball('cHead', 0.19, 18, 14), mats.skin); skull.scale.set(1, 1.05, 1); head.add(skull);
  for (const sx of [-1, 1]) {
    const e = mesh(ball('cEye', 0.03, 8, 6), mats.eye, sx * 0.068, 0.0, 0.168); e.scale.set(1, 1.4, 0.6); head.add(e);
  }
  head.add(mesh(geo('cHairCap', () => new T.SphereGeometry(0.205, 18, 10, 0, PI * 2, 0, PI * 0.55)), mats.hair, 0, 0.025, -0.012));
  head.add(mesh(geo('cBangs', () => { const g = new T.SphereGeometry(0.2, 14, 6, -PI * 0.4, PI * 0.8, PI * 0.25, PI * 0.2); return g; }), mats.hair, 0, 0.02, 0.012));
  const style = role.slot % 4;
  if (style === 0) head.add(mesh(taper('cHairShort', [[0, 0.05, -0.15], [0, -0.08, -0.2], [0, -0.16, -0.17]], 0.14, 0.06, 8, 8), mats.hair));
  if (style === 1) head.add(mesh(taper('cPony', [[0, 0.12, -0.17], [0, 0.02, -0.3], [0, -0.22, -0.32], [0, -0.42, -0.26]], 0.07, 0.02, 12, 8), mats.hair));
  if (style === 2) head.add(mesh(taper('cLong', [[0, 0.05, -0.12], [0, -0.15, -0.2], [0, -0.45, -0.2], [0, -0.62, -0.16]], 0.16, 0.07, 12, 10), mats.hair));
  if (style === 3) for (const sx of [-1, 1]) head.add(mesh(taper('cTwin' + sx, [[sx * 0.17, 0.08, -0.05], [sx * 0.26, -0.05, -0.08], [sx * 0.27, -0.3, -0.05]], 0.06, 0.02, 10, 6), mats.hair));
  body.add(head);

  // 武器背在背上（不跟著手臂甩，也不會穿模）
  const back = pivot(0, 1.35, -0.25);
  body.add(back);
  if (role.kind === 'tank') {
    const shield = mesh(geo('cShield', () => { const g = new T.CylinderGeometry(0.3, 0.3, 0.05, 20); g.rotateX(PI / 2); return g; }), mats.metal, 0, 0, -0.03);
    const boss = mesh(ball('cShieldBoss', 0.08, 10, 8), mats.trim, 0, 0, -0.07);
    const rim = mesh(geo('cShieldRim', () => new T.TorusGeometry(0.3, 0.025, 6, 24)), mats.trim, 0, 0, -0.03);
    back.add(shield, boss, rim);
    const sword = new T.Group(); sword.position.set(0.12, 0.05, 0.02); sword.rotation.z = -0.5;
    sword.add(mesh(geo('cBlade', () => { const g = new T.BoxGeometry(0.07, 0.75, 0.02); g.translate(0, -0.42, 0); return g; }), mats.metal));
    sword.add(mesh(guardGeo(), mats.trim, 0, -0.03, 0));
    sword.add(mesh(hiltGeo(), mats.wood));
    back.add(sword);
  } else if (role.kind === 'healer') {
    const staff = new T.Group(); staff.rotation.z = 0.42;
    staff.add(mesh(geo('cStaff', () => new T.CylinderGeometry(0.025, 0.03, 1.45, 8)), mats.wood));
    staff.add(mesh(geo('cStaffHead', () => new T.TorusGeometry(0.09, 0.02, 6, 14)), mats.trim, 0, 0.78, 0));
    staff.add(mesh(ball('cOrb', 0.07, 12, 10), glowMat(role.slot === 2 ? 0x9cffc0 : 0xe8ff9c, 1.8), 0, 0.78, 0));
    back.add(staff);
  } else if (role.key === 'R') {
    const bow = mesh(geo('cBow', () => new T.TorusGeometry(0.45, 0.02, 6, 24, PI)), mats.wood, 0, 0, 0);
    bow.rotation.z = PI / 2 + 0.35;
    back.add(bow);
    const quiver = mesh(geo('cQuiver', () => new T.CylinderGeometry(0.07, 0.06, 0.45, 10)), mats.cloth2, -0.12, -0.05, 0.04);
    quiver.rotation.z = -0.4; back.add(quiver);
  } else if (role.key === 'C') {
    const orb = mesh(ball('cCorb', 0.12, 14, 10), glowMat(0xc58bff, 1.8), 0.32, 1.85, -0.1);
    body.add(orb);
    mats.orb = orb;
    back.add(mesh(geo('cBook', () => new T.BoxGeometry(0.28, 0.34, 0.07)), std(0x4a2a6a), 0, 0, 0));
  } else {
    const n = role.key === 'M2' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = new T.Group(); s.rotation.z = n === 2 ? (i ? 0.55 : -0.55) : -0.45;
      const bl = n === 2 ? 0.55 : 0.8;
      s.add(mesh(geo('cBlade' + n, () => { const g = new T.BoxGeometry(0.06, bl, 0.02); g.translate(0, -bl / 2 - 0.02, 0); return g; }), mats.metal));
      s.add(mesh(guardGeo(), mats.trim, 0, 0.02, 0));
      s.add(mesh(hiltGeo(), mats.wood, 0, 0.02, 0));
      back.add(s);
    }
  }

  const orig = {};
  for (const k of ['cloth', 'cloth2', 'skin', 'hair']) orig[k] = mats[k].color.clone();
  return { group, body, legL, legR, armL, armR, head, mats, orig, phase: Math.random() * 6, dead: false };
}

const GRAY = new T.Color(0x5a5f68);
function animateCharacter(m, dt, t, walk) {
  const a = Math.min(1, walk / 5);
  m.phase += dt * (2 + walk * 1.5);
  const s = Math.sin(m.phase);
  m.legL.rotation.x = s * 0.6 * a; m.legR.rotation.x = -s * 0.6 * a;
  m.armL.rotation.x = -s * 0.42 * a + (1 - a) * Math.sin(t * 1.3 + m.phase) * 0.03;
  m.armR.rotation.x = s * 0.42 * a;
  m.body.position.y = Math.abs(Math.cos(m.phase)) * 0.05 * a + (1 - a) * Math.sin(t * 2 + m.phase) * 0.01;
  m.body.rotation.x = 0.07 * a;
  if (m.mats.orb) m.mats.orb.position.y = 1.85 + Math.sin(t * 2.4) * 0.07;
}
function setCharacterDead(m, dead) {
  if (m.dead === dead) return;
  m.dead = dead;
  for (const k of Object.keys(m.orig)) {
    if (dead) m.mats[k].color.copy(m.orig[k]).lerp(GRAY, 0.75);
    else m.mats[k].color.copy(m.orig[k]);
  }
  m.legL.rotation.x = 0; m.legR.rotation.x = 0;
}

// ------------------------------------------------------------------ 迦樓羅（與分身）
function garuda(tint, scale) {
  const main = new T.Color(tint || 0x2fae6a);
  const mats = {
    main: std(main, { roughness: 0.5, side: T.DoubleSide }),
    dark: std(main.clone().multiplyScalar(0.55), { roughness: 0.55, side: T.DoubleSide }),
    teal: std(main.clone().lerp(new T.Color(0x2a9a9a), 0.6), { roughness: 0.5, side: T.DoubleSide }),
    white: std(0xf1f6ea, { roughness: 0.5, side: T.DoubleSide }),
    gold: std(0xe6c25a, { metalness: 0.6, roughness: 0.3 }),
    skin: std(0xe3ecd8, { roughness: 0.65 }),
    claw: std(0xd9b04a, { metalness: 0.3, roughness: 0.4 }),
    eye: glowMat(0x7ff7ff, 2.2),
    hair: std(0xd6f0c8, { roughness: 0.45 }),
  };
  const group = new T.Group();
  const float = new T.Group(); group.add(float);
  float.scale.setScalar(scale || 1);

  // 羽毛裙：三圈長羽毛往下展開，底部露出鳥爪
  const rings = [[2.75, 1.9, 0.55, mats.main, 14], [2.3, 1.7, 0.75, mats.teal, 14], [1.9, 1.5, 0.95, mats.white, 12]];
  for (const [y, len, rad, mat, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i + (y > 2.5 ? 0 : 0.5)) / n * PI * 2;
      const f = addFeather(float, mat, len, 0.22, Math.sin(a) * rad, y, Math.cos(a) * rad, 0, 0, a);
      f.rotation.set(PI - 0.35, a, 0, 'YXZ');
    }
  }
  for (const sx of [-1, 1]) {
    const foot = pivot(sx * 0.32, 0.35, 0.15);
    foot.add(mesh(capsule('gShin', 0.08, 0.35), mats.claw));
    for (let k = -1; k <= 1; k++) {
      const c = mesh(geo('gClaw', () => { const g = new T.ConeGeometry(0.05, 0.32, 6); g.rotateX(PI / 2); g.translate(0, -0.5, 0.18); return g; }), mats.claw);
      c.rotation.y = k * 0.45; foot.add(c);
    }
    float.add(foot);
  }
  // 上半身
  float.add(mesh(geo('gTorso', () => new T.LatheGeometry([
    [0.0, 2.6], [0.36, 2.65], [0.3, 2.95], [0.27, 3.15], [0.38, 3.45], [0.42, 3.65], [0.3, 3.85], [0.12, 3.95], [0.0, 3.97],
  ].map(([r, y]) => new T.Vector2(r, y)), 20)), mats.skin));
  float.add(mesh(geo('gBelt', () => { const g = new T.TorusGeometry(0.31, 0.06, 8, 20); g.rotateX(PI / 2); return g; }), mats.gold, 0, 2.95, 0));
  for (let i = 0; i < 9; i++) {   // 胸前羽飾
    const a = (i - 4) * 0.28;
    const f = addFeather(float, i % 2 ? mats.main : mats.teal, 0.55, 0.12, Math.sin(a) * 0.38, 3.75, Math.cos(a) * 0.36, 0, 0, a);
    f.rotation.set(PI - 0.4, a, 0, 'YXZ');
  }
  float.add(mesh(geo('gNeck', () => new T.CylinderGeometry(0.1, 0.13, 0.3, 10)), mats.skin, 0, 4.05, 0));
  const head = pivot(0, 4.42, 0.02);
  const skull = mesh(ball('gHead', 0.3, 18, 14), mats.skin); skull.scale.set(0.95, 1.1, 1); head.add(skull);
  for (const sx of [-1, 1]) { const e = mesh(ball('gEye', 0.045, 8, 6), mats.eye, sx * 0.11, 0.03, 0.27); e.scale.set(1.4, 0.8, 0.6); head.add(e); }
  head.add(mesh(geo('gMask', () => new T.SphereGeometry(0.31, 16, 8, -PI * 0.45, PI * 0.9, PI * 0.28, PI * 0.18)), mats.gold, 0, 0.02, 0));
  // 冠羽：往後上方掃
  for (let i = 0; i < 7; i++) {
    const off = (i - 3) * 0.08;
    const c = mesh(taper('gCrest' + i, [[off, 0.2, 0.05], [off * 1.4, 0.55, -0.2], [off * 2, 0.85, -0.65 - Math.abs(i - 3) * 0.05], [off * 2.4, 0.95, -1.1 + Math.abs(i - 3) * 0.12]], 0.06, 0.008, 14, 6), i % 2 ? mats.gold : mats.main);
    head.add(c);
  }
  // 長髮羽：披在背後
  const hair = new T.Group(); head.add(hair);
  for (let i = 0; i < 6; i++) {
    const off = (i - 2.5) * 0.12;
    hair.add(mesh(taper('gHair' + i, [[off, 0.05, -0.2], [off * 1.4, -0.4, -0.45], [off * 1.8, -1.2, -0.55], [off * 2.1, -1.9, -0.45 - (i % 2) * 0.15]], 0.09, 0.02, 14, 6), mats.hair));
  }
  float.add(head);
  // 手臂
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = pivot(sx * 0.44, 3.82, 0);
    arm.add(mesh(capsule('gArm', 0.07, 0.95), mats.skin));
    const cuff = mesh(geo('gCuff', () => { const g = new T.ConeGeometry(0.16, 0.45, 10); g.translate(0, -0.78, 0); return g; }), mats.main);
    arm.add(cuff);
    for (let k = 0; k < 3; k++) {
      const cl = mesh(geo('gFinger', () => { const g = new T.ConeGeometry(0.025, 0.22, 5); g.translate(0, -0.11, 0); return g; }), mats.claw, (k - 1) * 0.04, -1.12, 0.02);
      cl.rotation.x = 0.2; arm.add(cl);
    }
    arm.rotation.z = sx * 0.5;
    float.add(arm); arms.push(arm);
  }
  // 翅膀：像老鷹一樣從肩後伸出翅骨，覆羽／次級飛羽／初級飛羽沿著翅骨往下、往外排
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = pivot(sx * 0.25, 3.75, -0.3);
    const inner = new T.Group(); w.add(inner);
    const bonePts = [[0, 0, 0], [sx * 1.1, 0.55, -0.15], [sx * 2.3, 1.15, -0.25], [sx * 3.4, 1.05, -0.2], [sx * 4.1, 0.7, -0.1]];
    inner.add(mesh(taper('gBone' + sx, bonePts, 0.13, 0.03, 16, 8), mats.main));
    const bone = new T.CatmullRomCurve3(bonePts.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const rows = [[14, 0.55, 0.85, 0.2, mats.main, 0.06], [12, 1.2, 1.9, 0.21, mats.teal, 0.02], [10, 1.6, 2.6, 0.2, mats.dark, -0.02]];
    rows.forEach(([n, l0, l1, width, mat, dz], ri) => {
      for (let i = 0; i < n; i++) {
        const u = ri === 2 ? 0.45 + i / (n - 1) * 0.55 : i / (n - 1) * (ri === 1 ? 0.75 : 1);
        const p = bone.getPointAt(u);
        const fg = new T.Group(); fg.position.set(p.x, p.y, p.z + dz);
        fg.rotation.z = PI + sx * (0.05 + u * 0.75);   // 朝下，越外側越往外張
        const len = l0 + (l1 - l0) * (ri === 2 ? Math.sin((u - 0.45) / 0.55 * PI * 0.6 + 0.3) : u);
        addFeather(fg, mat, len, width, 0, 0, 0, 0, 0, 0);
        if (ri === 2) addFeather(fg, mats.white, len * 0.3, width * 0.92, 0, len * 0.72, 0.004, 0, 0, 0);
        inner.add(fg);
      }
    });
    inner.rotation.y = sx * 0.25;
    float.add(w); wings.push({ w, inner, sx });
  }
  return { group, float, head, hair, arms, wings, mats, kind: 'garuda' };
}
function animateGaruda(m, t, castP, opacity) {
  m.float.position.y = 0.45 + Math.sin(t * 1.5) * 0.16;
  const casting = castP > 0;
  const flapAmp = casting ? 0.3 : 0.12, speed = casting ? 6 : 2.2;
  for (const { w, inner, sx } of m.wings) {
    w.rotation.z = sx * (Math.sin(t * speed) * flapAmp + (casting ? 0.15 : 0));
    inner.rotation.y = sx * (0.25 - (casting ? 0.2 : 0));
  }
  m.arms.forEach((a, i) => {
    const sx = i ? 1 : -1, raise = casting ? Math.min(1, castP * 3) : 0;
    a.rotation.z = sx * (0.5 + raise * 1.7);
    a.rotation.x = -raise * 0.3;
  });
  m.head.rotation.x = casting ? -0.15 : Math.sin(t * 0.9) * 0.05;
  m.hair.rotation.x = 0.08 + Math.sin(t * 1.7) * 0.06;
  for (const k of Object.keys(m.mats)) { m.mats[k].transparent = opacity < 1; m.mats[k].opacity = opacity; }
}

// ------------------------------------------------------------------ 伊弗利特（與分身）
function ifrit(variant) {
  const ghost = variant !== 'boss', blue = variant === 'blue';
  const flameCol = blue ? 0x4aa8ff : 0xff6a1a;
  const o = ghost ? { transparent: true, opacity: 0.62 } : {};
  const mats = {
    skin: std(blue ? 0x2a4a8a : 0x7a1c12, Object.assign({ roughness: 0.55, emissive: blue ? 0x0a2a6a : 0x2a0602, emissiveIntensity: ghost ? 1.2 : 0.6 }, o)),
    muscle: std(blue ? 0x3a5aa0 : 0x9a2c18, Object.assign({ roughness: 0.5 }, o)),
    dark: std(blue ? 0x162a50 : 0x2e100a, Object.assign({ roughness: 0.65 }, o)),
    horn: std(0xd8c8a0, Object.assign({ roughness: 0.45 }, o)),
    hoof: std(0x1c120c, o),
    gold: std(0xb8862a, Object.assign({ metalness: 0.6, roughness: 0.35 }, o)),
    flame: glowMat(flameCol, 2.4, Object.assign({}, o)),
    seam: glowMat(blue ? 0x8fd0ff : 0xffa040, 2.6, Object.assign({}, o)),
    eye: glowMat(blue ? 0xbfe4ff : 0xffe14a, 3),
  };
  const group = new T.Group();
  const body = new T.Group(); group.add(body);
  const emit = [], flames = [];

  // 反關節腿＋蹄
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = pivot(sx * 0.55, 2.05, 0);
    leg.add(mesh(capsule('iThigh', 0.3, 0.75), mats.skin));
    const shin = pivot(0, -0.95, 0.25);
    shin.add(mesh(capsule('iShin', 0.2, 0.55), mats.muscle));
    shin.rotation.x = 0.75;
    const foot = pivot(0, -0.85, 0);
    foot.add(mesh(capsule('iFoot', 0.15, 0.25), mats.skin));
    foot.add(mesh(geo('iHoof', () => { const g = new T.CylinderGeometry(0.18, 0.24, 0.22, 10); g.translate(0, -0.5, 0); return g; }), mats.hoof));
    foot.rotation.x = -0.95;
    shin.add(foot);
    leg.add(shin); leg.rotation.x = -0.35;
    body.add(leg); legs.push(leg);
  }
  // 腰與下擺
  const hips = mesh(ball('iHips', 0.72, 16, 12), mats.dark, 0, 2.1, 0); hips.scale.set(1.2, 0.55, 0.9); body.add(hips);
  body.add(mesh(geo('iBelt', () => { const g = new T.TorusGeometry(0.78, 0.09, 8, 24); g.rotateX(PI / 2); return g; }), mats.gold, 0, 2.3, 0));
  const flap = mesh(geo('iFlap', () => { const g = new T.BoxGeometry(0.6, 0.8, 0.06); g.translate(0, -0.4, 0); return g; }), mats.dark, 0, 2.25, 0.72); flap.rotation.x = 0.12; body.add(flap);
  // 軀幹（肌肉塊）
  const torso = mesh(ball('iTorso', 1, 20, 16), mats.skin, 0, 3.25, 0); torso.scale.set(1.15, 1.15, 0.85); body.add(torso);
  for (const [x, y, z, sx, sy, sz] of [[0, 2.72, 0.45, 0.55, 0.42, 0.35], [-0.42, 3.62, 0.5, 0.5, 0.36, 0.32], [0.42, 3.62, 0.5, 0.5, 0.36, 0.32], [0, 3.9, -0.45, 1.0, 0.7, 0.6]]) {
    const m = mesh(ball('iMus', 1, 14, 10), mats.muscle, x, y, z); m.scale.set(sx, sy, sz); body.add(m);
  }
  // 熔岩紋
  for (const [pts, key] of [[[[-0.6, 3.0, 0.7], [-0.2, 3.3, 0.85], [0.3, 3.1, 0.82]], 'iSeam1'], [[[0.2, 2.6, 0.75], [0.55, 2.9, 0.65], [0.8, 3.4, 0.45]], 'iSeam2']]) {
    body.add(mesh(taper(key, pts, 0.035, 0.015, 10, 5), mats.seam));
  }
  // 肩與尖刺
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = mesh(ball('iShoulder', 0.52, 14, 12), mats.muscle, sx * 1.12, 3.95, 0); body.add(sh);
    for (let k = 0; k < 3; k++) {
      const sp = mesh(geo('iSpike', () => { const g = new T.ConeGeometry(0.12, 0.6, 7); g.translate(0, 0.3, 0); return g; }), mats.horn, sx * (1.1 + k * 0.12), 4.3 - k * 0.1, -0.15 - k * 0.18);
      sp.rotation.set(-0.6 - k * 0.2, 0, -sx * 0.5); body.add(sp);
    }
    const arm = pivot(sx * 1.2, 3.92, 0);
    arm.add(mesh(capsule('iUpper', 0.3, 0.75), mats.skin));
    const fore = pivot(0, -1.1, 0);
    fore.add(mesh(capsule('iFore', 0.27, 0.65), mats.muscle));
    fore.add(mesh(geo('iBracer', () => { const g = new T.CylinderGeometry(0.31, 0.3, 0.28, 12); g.translate(0, -0.62, 0); return g; }), mats.gold));
    fore.add(mesh(ball('iFist', 0.36, 14, 10), mats.dark, 0, -1.2, 0.05));
    for (let k = 0; k < 4; k++) {
      const cl = mesh(geo('iClaw', () => { const g = new T.ConeGeometry(0.05, 0.3, 6); g.translate(0, -0.15, 0); return g; }), mats.horn, (k - 1.5) * 0.13, -1.45, 0.2);
      cl.rotation.x = 0.5; fore.add(cl);
    }
    const fe = new T.Object3D(); fe.position.set(0, -1.2, 0.05); fore.add(fe); emit.push(fe);
    fore.rotation.x = -0.35;
    arm.add(fore);
    arm.rotation.z = sx * 0.22;
    body.add(arm); arms.push({ arm, fore, sx });
  }
  // 頭：口鼻、獠牙、發光眼、往後彎的大角
  const head = pivot(0, 4.55, 0.3);
  const skull = mesh(ball('iHead', 0.52, 16, 12), mats.skin); skull.scale.set(1, 0.95, 1.05); head.add(skull);
  const snout = mesh(geo('iSnout', () => { const g = new T.CapsuleGeometry(0.24, 0.35, 4, 10); g.rotateX(PI / 2); return g; }), mats.skin, 0, -0.12, 0.48); head.add(snout);
  head.add(mesh(geo('iJaw', () => new T.BoxGeometry(0.46, 0.13, 0.5)), mats.dark, 0, -0.34, 0.4));
  head.add(mesh(geo('iBrow', () => new T.BoxGeometry(0.62, 0.1, 0.2)), mats.dark, 0, 0.2, 0.42));
  for (const sx of [-1, 1]) {
    const e = mesh(ball('iEye', 0.075, 8, 6), mats.eye, sx * 0.2, 0.1, 0.48); e.scale.set(1.3, 0.7, 0.6); head.add(e);
    const tusk = mesh(geo('iTusk', () => { const g = new T.ConeGeometry(0.06, 0.32, 6); g.rotateX(PI); return g; }), mats.horn, sx * 0.2, -0.3, 0.7); tusk.rotation.z = sx * 0.3; head.add(tusk);
    head.add(mesh(taper('iHorn' + sx, [[sx * 0.4, 0.25, -0.05], [sx * 0.85, 0.55, -0.35], [sx * 1.05, 0.7, -0.95], [sx * 0.9, 1.15, -1.45], [sx * 0.7, 1.5, -1.55]], 0.17, 0.02, 20, 10), mats.horn));
  }
  body.add(head);
  // 火焰鬃毛（頭後到背）
  for (let i = 0; i < 13; i++) {
    const a = -1.3 + i * (2.6 / 12);
    const fl = mesh(geo('iMane', () => { const g = new T.ConeGeometry(0.22, 1.2, 7); g.translate(0, 0.6, 0); return g; }), mats.flame, Math.sin(a) * 0.7, 4.55 + Math.cos(a) * 0.25 - Math.abs(a) * 0.15, -0.2 - Math.cos(a) * 0.3);
    fl.rotation.set(-0.75, 0, -a * 0.55);
    body.add(fl); flames.push(fl);
    if (i % 3 === 1) { const e = new T.Object3D(); e.position.set(Math.sin(a) * 0.75, 5.1, -0.7); body.add(e); emit.push(e); }
  }
  // 尾巴＋火焰尾端
  const tail = new T.Group(); tail.position.set(0, 2.15, -0.6); body.add(tail);
  tail.add(mesh(taper('iTail', [[0, 0, 0], [0, -0.3, -0.7], [0.1, -0.6, -1.5], [0.35, -0.5, -2.3]], 0.22, 0.05, 16, 8), mats.skin));
  const tf = mesh(geo('iTailF', () => { const g = new T.ConeGeometry(0.22, 0.8, 7); g.translate(0, 0.4, 0); return g; }), mats.flame, 0.35, -0.5, -2.3);
  tf.rotation.x = -1.2; tail.add(tf); flames.push(tf);

  if (ghost) group.scale.setScalar(0.85);
  return { group, body, head, arms, legs, tail, flames, mats, emit, torso, kind: 'ifrit', flameCol };
}
function animateIfrit(m, t, castP, opacity) {
  const casting = castP > 0;
  const breathe = 1 + Math.sin(t * 2.2) * 0.02;
  m.torso.scale.set(1.15 * breathe, 1.15 * breathe, 0.85 * breathe);
  m.body.position.y = Math.sin(t * 1.1) * 0.04;
  const raise = casting ? Math.min(1, castP * 2.5) : 0;
  for (const { arm, fore, sx } of m.arms) {
    arm.rotation.x = -raise * 2.3 + (1 - raise) * Math.sin(t * 1.4 + sx) * 0.05;
    arm.rotation.z = sx * (0.22 + raise * 0.35);
    fore.rotation.x = -0.35 - raise * 0.6;
  }
  m.head.rotation.x = casting ? -0.35 * raise : Math.sin(t * 0.8) * 0.04;
  m.tail.rotation.y = Math.sin(t * 1.3) * 0.25;
  m.flames.forEach((f, i) => { f.scale.y = 0.85 + 0.25 * Math.sin(t * 9 + i * 1.7); });
  m.mats.flame.emissiveIntensity = 2 + Math.sin(t * 9) * 0.5 + Math.sin(t * 13.7) * 0.3;
  for (const k of Object.keys(m.mats)) {
    const base = m.mats[k].userData.baseOpacity === undefined ? (m.mats[k].userData.baseOpacity = m.mats[k].opacity) : m.mats[k].userData.baseOpacity;
    m.mats[k].transparent = m.mats[k].transparent || opacity < 1;
    m.mats[k].opacity = base * opacity;
  }
}

// ------------------------------------------------------------------ 小怪與場上物件
function spiny() {
  const mats = { body: std(0x6fbf3a, { roughness: 0.5 }), spike: std(0xd9f08a, { roughness: 0.4 }), eye: glowMat(0xff4a2a, 2) };
  const group = new T.Group(), float = new T.Group(); group.add(float);
  float.add(mesh(ball('spBody', 0.6, 16, 12), mats.body, 0, 0, 0));
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996, y = 1 - (i + 0.5) / 18 * 2, r = Math.sqrt(1 - y * y);
    const dir = new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const s = mesh(geo('spSpike', () => { const g = new T.ConeGeometry(0.09, 0.55, 6); g.translate(0, 0.27, 0); return g; }), mats.spike);
    s.position.copy(dir.clone().multiplyScalar(0.5));
    s.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    float.add(s);
  }
  for (const sx of [-1, 1]) float.add(mesh(ball('spEye', 0.08, 8, 6), mats.eye, sx * 0.2, 0.15, 0.52));
  return { group, float, mats, kind: 'spiny' };
}
function plume(color, glow) {
  const mats = { f: std(color || 0xf3eefe, { roughness: 0.4, emissive: glow || 0x6a4aa0, emissiveIntensity: 0.35, transparent: true }) };
  const group = new T.Group(), float = new T.Group(); group.add(float);
  const f = mesh(ball('plF', 1, 12, 8), mats.f); f.scale.set(0.28, 0.85, 0.07); f.rotation.z = 0.5;
  const quill = mesh(geo('plQ', () => new T.CylinderGeometry(0.02, 0.02, 1.8, 5)), std(0xb8a8d8)); quill.rotation.z = 0.5;
  float.add(f, quill);
  return { group, float, mats, kind: 'plume' };
}
function nail() {
  const mats = { rock: std(0x5a2416, { roughness: 0.6, emissive: 0x2a0802, emissiveIntensity: 0.5 }), core: glowMat(0xff7a2a, 2.2, { transparent: true, opacity: 0.85 }), base: std(0x2a1a14, { roughness: 0.9 }) };
  const group = new T.Group();
  const cr = mesh(geo('nCr', () => new T.OctahedronGeometry(0.85)), mats.rock, 0, 1.9, 0); cr.scale.set(0.85, 2.0, 0.85);
  const core = mesh(geo('nCore', () => new T.OctahedronGeometry(0.5)), mats.core, 0, 1.9, 0); core.scale.set(0.9, 2.2, 0.9);
  const base = mesh(geo('nBase', () => new T.CylinderGeometry(1.0, 1.3, 0.4, 8)), mats.base, 0, 0.2, 0);
  const crystal = new T.Group(); crystal.add(cr, core);
  group.add(base, crystal);
  return { group, crystal, mats, kind: 'nail' };
}
function shard() {
  const mats = { c: glowMat(0xffd34d, 1.4, { metalness: 0.4 }) };
  const group = new T.Group(), float = new T.Group(); group.add(float);
  float.add(mesh(geo('shard', () => new T.OctahedronGeometry(0.55)), mats.c, 0, 1.3, 0));
  return { group, float, mats, kind: 'shard' };
}

// ------------------------------------------------------------------ 泰坦（岩石巨人）與場上物件
const rock = (key, r, detail) => geo(key, () => new T.IcosahedronGeometry(r, detail || 0));
const dodeca = (key, r) => geo(key, () => new T.DodecahedronGeometry(r, 0));
const spikeGeo = (key, r, h) => geo(key, () => { const g = new T.ConeGeometry(r, h, 6); g.translate(0, h / 2, 0); return g; });
function titan() {
  const R = (c, o) => std(c, Object.assign({ roughness: 0.95, flatShading: true }, o || {}));
  const mats = {
    rock: R(0x8a6c4a), dark: R(0x4e3b2a), light: R(0xb59468), gold: R(0xc8994a, { metalness: 0.55, roughness: 0.4 }),
    crack: glowMat(0xffa63a, 2.2), eye: glowMat(0xffe27a, 3.2),
  };
  const group = new T.Group(), body = new T.Group(); group.add(body);
  // 粗短的腿＋大石塊腳
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = pivot(sx * 0.95, 2.3, 0);
    leg.add(mesh(capsule('tThigh', 0.72, 0.3), mats.dark));
    const shin = pivot(0, -1.2, 0.05);
    shin.add(mesh(capsule('tShin', 0.62, 0.1), mats.rock));
    const foot = mesh(dodeca('tFoot', 0.75), mats.dark, 0, -0.85, 0.25); foot.scale.set(1.2, 0.5, 1.5);
    shin.add(foot);
    leg.add(shin); body.add(leg); legs.push(leg);
  }
  // 腰、金色腰帶
  const pelvis = mesh(dodeca('tPelvis', 1.2), mats.dark, 0, 2.6, 0); pelvis.scale.set(1.45, 0.75, 1.0); body.add(pelvis);
  body.add(mesh(geo('tBelt', () => { const g = new T.TorusGeometry(1.45, 0.14, 6, 18); g.rotateX(PI / 2); return g; }), mats.gold, 0, 3.0, 0));
  // 軀幹：大塊多面岩＋胸甲＋背後岩塊與晶刺
  const torso = mesh(rock('tTorso', 1.9, 1), mats.rock, 0, 4.4, 0); torso.scale.set(1.35, 1.15, 0.95); body.add(torso);
  for (const [x, y, z, sx, sy, sz, m] of [[-0.8, 4.8, 1.2, 1.1, 0.8, 0.5, 'light'], [0.8, 4.8, 1.2, 1.1, 0.8, 0.5, 'light'], [0, 3.6, 1.25, 1.2, 0.8, 0.5, 'dark']]) {
    const p = mesh(dodeca('tPlate', 0.8), mats[m], x, y, z); p.scale.set(sx, sy, sz); body.add(p);
  }
  body.add(mesh(rock('tBack', 1.35, 0), mats.rock, 0, 5.0, -1.15));
  for (let k = 0; k < 3; k++) {
    const sp = mesh(spikeGeo('tBackSp', 0.32, 1.6), mats.light, (k - 1) * 0.75, 5.7 - Math.abs(k - 1) * 0.25, -1.6);
    sp.rotation.set(-0.85, 0, (k - 1) * -0.35); body.add(sp);
  }
  // 發光的裂紋
  for (const [pts, key] of [
    [[[-1.25, 4.0, 1.45], [-0.55, 4.35, 1.66], [0.2, 4.05, 1.68], [0.95, 4.45, 1.45]], 'tCr1'],
    [[[0.1, 5.3, 1.4], [0.25, 4.7, 1.62], [-0.05, 4.1, 1.7], [0.15, 3.4, 1.55]], 'tCr2'],
    [[[-1.6, 5.0, 0.9], [-1.9, 4.4, 0.7], [-1.7, 3.8, 0.8]], 'tCr3'],
  ]) body.add(mesh(taper(key, pts, 0.07, 0.03, 12, 5), mats.crack));
  // 肩膀巨石＋岩刺、手臂、大拳頭
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = mesh(dodeca('tShoulder', 1.15), mats.rock, sx * 2.1, 5.55, 0); sh.scale.set(1.1, 0.9, 1.0); body.add(sh);
    for (let k = 0; k < 2; k++) {
      const sp = mesh(spikeGeo('tShSp', 0.28, 1.1), mats.light, sx * (2.0 + k * 0.5), 6.2 - k * 0.15, -0.2 - k * 0.3);
      sp.rotation.set(-0.3, 0, -sx * (0.35 + k * 0.3)); body.add(sp);
    }
    const arm = pivot(sx * 2.25, 5.25, 0);
    arm.add(mesh(capsule('tUpper', 0.6, 0.8), mats.rock));
    const fore = pivot(0, -1.75, 0);
    fore.add(mesh(capsule('tFore', 0.66, 0.6), mats.dark));
    fore.add(mesh(geo('tBracer', () => { const g = new T.CylinderGeometry(0.72, 0.72, 0.3, 10); g.translate(0, -0.55, 0); return g; }), mats.gold));
    const fist = mesh(dodeca('tFist', 0.95), mats.light, 0, -2.15, 0.1); fist.scale.set(1, 1.1, 1); fore.add(fist);
    fore.rotation.x = -0.3;
    arm.add(fore); arm.rotation.z = sx * 0.28;
    body.add(arm); arms.push({ arm, fore, sx });
  }
  // 頭：嵌在肩膀之間，發光眼睛、金色頭冠
  const head = pivot(0, 6.15, 0.55);
  const skull = mesh(rock('tHead', 0.62, 1), mats.rock); skull.scale.set(1, 0.9, 1.05); head.add(skull);
  head.add(mesh(geo('tJaw', () => new T.BoxGeometry(0.75, 0.3, 0.55)), mats.dark, 0, -0.42, 0.25));
  head.add(mesh(geo('tBrow', () => new T.BoxGeometry(0.95, 0.16, 0.3)), mats.dark, 0, 0.2, 0.45));
  for (const sx of [-1, 1]) {
    const e = mesh(ball('tEye', 0.09, 8, 6), mats.eye, sx * 0.24, 0.04, 0.55); e.scale.set(1.5, 0.7, 0.6); head.add(e);
    head.add(mesh(taper('tCrown' + sx, [[sx * 0.4, 0.3, 0.15], [sx * 0.85, 0.85, -0.2], [sx * 0.85, 1.45, -0.7], [sx * 0.6, 1.8, -1.1]], 0.16, 0.03, 16, 6), mats.gold));
  }
  head.add(mesh(taper('tCrest', [[0, 0.45, 0.35], [0, 1.15, 0.1], [0, 1.65, -0.5], [0, 1.85, -1.0]], 0.15, 0.03, 16, 6), mats.gold));
  body.add(head);
  return { group, body, head, arms, legs, torso, mats, kind: 'titan' };
}
/** stomp：0～1，怒震時的跺地動作。 */
function animateTitan(m, t, castP, opacity, stomp) {
  const casting = castP > 0;
  const breathe = 1 + Math.sin(t * 1.6) * 0.015;
  m.torso.scale.set(1.35 * breathe, 1.15 * breathe, 0.95 * breathe);
  const st = stomp > 0 ? Math.sin(stomp * PI) : 0;
  m.body.position.y = Math.sin(t * 0.9) * 0.03 - st * 0.35;
  m.legs[0].rotation.x = -st * 0.55; m.legs[1].rotation.x = 0;
  const raise = casting ? Math.min(1, castP * 2.5) : 0;
  for (const { arm, fore, sx } of m.arms) {
    arm.rotation.x = -raise * 2.2 + st * 0.5 + (1 - raise) * Math.sin(t * 1.1 + sx) * 0.04;
    arm.rotation.z = sx * (0.28 + raise * 0.3);
    fore.rotation.x = -0.3 - raise * 0.5;
  }
  m.head.rotation.x = casting ? -0.25 * raise : Math.sin(t * 0.7) * 0.03;
  m.mats.crack.emissiveIntensity = 1.8 + Math.sin(t * 3.1) * 0.4 + raise * 1.2;
  for (const k of Object.keys(m.mats)) { m.mats[k].transparent = opacity < 1; m.mats[k].opacity = opacity; }
}
/** 爆破岩石：岩球＋發光的裂口（讀條爆炸時越來越亮）。 */
function bomb() {
  const mats = { rock: std(0x6a4a30, { roughness: 0.95, flatShading: true }), vent: glowMat(0xff7a2a, 1.5) };
  const group = new T.Group(), float = new T.Group(); group.add(float);
  float.add(mesh(rock('bRock', 0.95, 1), mats.rock, 0, 0.95, 0));
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39996, y = 1 - (i + 0.5) / 7 * 1.6, r = Math.sqrt(Math.max(0, 1 - y * y));
    const v = mesh(ball('bVent', 0.2, 8, 6), mats.vent, Math.cos(a) * r * 0.86, 0.95 + y * 0.86, Math.sin(a) * r * 0.86);
    v.scale.set(1, 0.45, 1); v.lookAt(0, 0.95, 0); float.add(v);
  }
  return { group, float, mats, kind: 'bomb' };
}
/** 花崗石牢：一圈往內傾的石柱＋頂蓋，被關的人在裡面看得到。 */
function gaol() {
  const mats = { rock: std(0x7a6048, { roughness: 0.95, flatShading: true }), dark: std(0x4a3a2a, { roughness: 0.95, flatShading: true }), glow: glowMat(0xffc070, 1.2, { transparent: true, opacity: 0.35 }) };
  const group = new T.Group();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * PI * 2;
    const p = mesh(geo('gPillar', () => { const g = new T.BoxGeometry(0.42, 2.6, 0.42); g.translate(0, 1.3, 0); return g; }), i % 2 ? mats.rock : mats.dark, Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0);
    p.rotation.set(Math.sin(a) * 0.18, -a, -Math.cos(a) * 0.18); group.add(p);
  }
  const cap = mesh(dodeca('gCap', 0.9), mats.rock, 0, 2.75, 0); cap.scale.set(1.25, 0.45, 1.25); group.add(cap);
  group.add(mesh(geo('gBase', () => { const g = new T.TorusGeometry(1.05, 0.22, 6, 14); g.rotateX(PI / 2); return g; }), mats.dark, 0, 0.12, 0));
  const glow = mesh(geo('gGlow', () => new T.CylinderGeometry(0.95, 0.95, 2.4, 14, 1, true)), mats.glow, 0, 1.2, 0); glow.castShadow = false; group.add(glow);
  return { group, mats, kind: 'gaol' };
}

// ------------------------------------------------------------------ P4
/** 究極神兵：深灰藍的機械巨人，胸口與背翼有紫色發光核心。 */
function ultima() {
  const M = (c, o) => std(c, Object.assign({ roughness: 0.35, metalness: 0.75 }, o || {}));
  const mats = { armor: M(0x4a5468), dark: M(0x262b38), trim: M(0x8a7ab8, { metalness: 0.85, roughness: 0.25 }), core: glowMat(0xb46cff, 2.6), eye: glowMat(0x7af0ff, 3.2), wing: glowMat(0x9a6cff, 1.2, { transparent: true, opacity: 0.55, side: T.DoubleSide }) };
  const group = new T.Group(), body = new T.Group(); group.add(body);
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = pivot(sx * 1.0, 3.0, 0);
    leg.add(mesh(limb('uThigh', 0.55, 0.45, 1.6, 8), mats.dark));
    const shin = pivot(0, -1.6, 0.1);
    shin.add(mesh(limb('uShin', 0.5, 0.35, 1.3, 8), mats.armor));
    const foot = mesh(geo('uFoot', () => new T.BoxGeometry(0.9, 0.35, 1.5)), mats.dark, 0, -1.35, 0.25); shin.add(foot);
    leg.add(shin); body.add(leg); legs.push(leg);
  }
  body.add(mesh(geo('uPelvis', () => new T.BoxGeometry(2.3, 0.8, 1.3)), mats.dark, 0, 3.2, 0));
  const torso = mesh(geo('uTorso', () => { const g = new T.CylinderGeometry(1.55, 1.0, 2.4, 6); g.translate(0, 1.2, 0); return g; }), mats.armor, 0, 3.5, 0); body.add(torso);
  body.add(mesh(geo('uChest', () => new T.BoxGeometry(2.0, 1.2, 0.5)), mats.trim, 0, 5.0, 0.95));
  const core = mesh(ball('uCore', 0.38, 16, 12), mats.core, 0, 4.7, 1.2); body.add(core);
  // 肩甲、手臂（前臂是砲管）
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = mesh(geo('uShoulder', () => new T.BoxGeometry(1.2, 0.9, 1.4)), mats.trim, sx * 2.0, 5.6, 0); sh.rotation.z = sx * -0.25; body.add(sh);
    const arm = pivot(sx * 2.05, 5.3, 0);
    arm.add(mesh(limb('uUpper', 0.42, 0.36, 1.5, 8), mats.dark));
    const fore = pivot(0, -1.5, 0);
    fore.add(mesh(limb('uFore', 0.45, 0.5, 1.6, 8), mats.armor));
    fore.add(mesh(ball('uMuzzle', 0.2, 10, 8), mats.core, 0, -1.65, 0));
    arm.add(fore); arm.rotation.z = sx * 0.2;
    body.add(arm); arms.push({ arm, fore, sx });
  }
  // 頭：窄長、發光的眼縫、後掠角
  const head = pivot(0, 6.25, 0.2);
  head.add(mesh(geo('uHead', () => new T.BoxGeometry(0.75, 0.8, 0.9)), mats.armor));
  const visor = mesh(geo('uVisor', () => new T.BoxGeometry(0.62, 0.12, 0.1)), mats.eye, 0, 0.05, 0.47); head.add(visor);
  for (const sx of [-1, 1]) head.add(mesh(taper('uHorn' + sx, [[sx * 0.35, 0.3, 0], [sx * 0.65, 0.75, -0.4], [sx * 0.75, 1.1, -0.95]], 0.12, 0.02, 12, 6), mats.trim));
  body.add(head);
  // 背後的光翼（4 片）
  const wings = [];
  for (const sx of [-1, 1]) for (const k of [0, 1]) {
    const w = pivot(sx * 0.7, 5.4 - k * 0.9, -0.8);
    const blade = mesh(geo('uWing', () => { const g = new T.PlaneGeometry(4.2, 0.9); g.translate(2.1, 0, 0); return g; }), mats.wing);
    blade.castShadow = false;
    w.add(blade); w.rotation.set(0, sx > 0 ? -0.35 : PI + 0.35, sx * (0.55 - k * 0.45));
    body.add(w); wings.push({ w, sx, k });
  }
  return { group, body, legs, arms, head, wings, core, mats, kind: 'ultima' };
}
function animateUltima(m, t, castP, opacity) {
  const casting = castP > 0, raise = casting ? Math.min(1, castP * 2.5) : 0;
  m.body.position.y = Math.sin(t * 1.2) * 0.08;
  for (const { arm, fore, sx } of m.arms) { arm.rotation.x = -raise * 1.8 + Math.sin(t * 0.9 + sx) * 0.04; arm.rotation.z = sx * (0.2 + raise * 0.4); fore.rotation.x = -raise * 0.6; }
  for (const { w, sx, k } of m.wings) w.rotation.z = sx * (0.55 - k * 0.45) + Math.sin(t * 1.4 + k) * 0.06 * sx + raise * 0.25 * sx;
  m.mats.core.emissiveIntensity = 2.2 + Math.sin(t * 3) * 0.6 + raise * 2;
  m.mats.wing.opacity = (0.4 + 0.2 * Math.sin(t * 2)) * opacity;
  for (const k of Object.keys(m.mats)) { if (k === 'wing') continue; m.mats[k].transparent = opacity < 1; m.mats[k].opacity = opacity; }
}
/** 拉哈布雷亞：黑色長袍、白色面具、紅色紋飾，飄在空中。 */
function lahabrea() {
  const mats = { robe: std(0x1a1a22, { roughness: 0.8 }), red: std(0x9a1a1a, { roughness: 0.5 }), mask: std(0xe8e2d6, { roughness: 0.35 }), glow: glowMat(0xff3a3a, 2.4) };
  const group = new T.Group(), float = new T.Group(); group.add(float);
  float.add(mesh(geo('lRobe', () => { const g = new T.ConeGeometry(0.75, 2.0, 12, 1, true); g.translate(0, 1.0, 0); return g; }), mats.robe, 0, 0.35, 0));
  float.add(mesh(geo('lChest', () => new T.CylinderGeometry(0.42, 0.5, 0.8, 10)), mats.robe, 0, 2.2, 0));
  float.add(mesh(geo('lSash', () => new T.BoxGeometry(0.16, 1.6, 0.06)), mats.red, 0, 1.6, 0.45));
  for (const sx of [-1, 1]) {
    const sp = mesh(geo('lPad', () => new T.ConeGeometry(0.22, 0.6, 6)), mats.red, sx * 0.55, 2.55, 0); sp.rotation.z = -sx * 1.1; float.add(sp);
    const arm = mesh(limb('lArm', 0.13, 0.16, 0.9, 8), mats.robe, sx * 0.48, 2.45, 0); arm.rotation.z = sx * 0.4; float.add(arm);
  }
  const head = pivot(0, 2.85, 0);
  head.add(mesh(ball('lHood', 0.3, 12, 10), mats.robe));
  const mask = mesh(geo('lMask', () => new T.SphereGeometry(0.24, 12, 10, 0, PI, 0, PI)), mats.mask, 0, 0, 0.12); head.add(mask);
  for (const sx of [-1, 1]) head.add(mesh(ball('lEye', 0.04, 6, 4), mats.glow, sx * 0.09, 0.03, 0.34));
  float.add(head);
  return { group, float, mats, kind: 'lahabrea' };
}
/** 以太炸彈：浮空的紫色能量球（外殼半透明）。 */
function orb() {
  const mats = { core: glowMat(0xc27aff, 2.6, { transparent: true, opacity: 0.95 }), shell: glowMat(0x8a4ad8, 0.9, { transparent: true, opacity: 0.3, depthWrite: false }) };
  const group = new T.Group(), float = new T.Group(); group.add(float);
  float.add(mesh(ball('oCore', 0.5, 16, 12), mats.core, 0, 0, 0));
  const shell = mesh(ball('oShell', 0.95, 18, 14), mats.shell, 0, 0, 0); shell.castShadow = false; float.add(shell);
  float.position.y = 1.4;
  return { group, float, mats, kind: 'orb' };
}
/** 魔導浮游炮：浮空的三角錐砲台，紅色感應眼。 */
function bit() {
  const mats = { body: std(0x5a6070, { metalness: 0.7, roughness: 0.3 }), fin: std(0x343a48, { metalness: 0.7, roughness: 0.35 }), eye: glowMat(0xff4a3a, 2.4) };
  const group = new T.Group(), float = new T.Group(); group.add(float);
  const core = mesh(geo('bCore', () => new T.OctahedronGeometry(0.55, 0)), mats.body, 0, 0, 0); core.scale.set(1, 1.3, 1); float.add(core);
  for (let i = 0; i < 3; i++) {
    const fin = mesh(geo('bFin', () => new T.BoxGeometry(0.08, 0.5, 0.9)), mats.fin, Math.cos(i * 2.094) * 0.55, 0, Math.sin(i * 2.094) * 0.55);
    fin.rotation.y = -i * 2.094; float.add(fin);
  }
  float.add(mesh(ball('bEye', 0.16, 10, 8), mats.eye, 0, 0.05, 0.5));
  return { group, float, mats, kind: 'bit' };
}

root.UWU_MODELS = { character, animateCharacter, setCharacterDead, garuda, animateGaruda, ifrit, animateIfrit, titan, animateTitan, bomb, gaol, spiny, plume, nail, shard, ultima, animateUltima, lahabrea, bit, orb };
})(window);
