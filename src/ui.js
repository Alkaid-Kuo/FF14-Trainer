/* UI 控制：階段（含完整體驗）、模式、職位、起始點、輸入、HUD、音效、結算。 */
(function () {
'use strict';
const { Sim, C, ROLES, PHASES, STATUS_DEF, WAYMARKS, WM_COLOR, SKILLS, LOADOUT, GCD, skillCheck, bossOf, meleeReach, raiseTarget } = window.UWU;
const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const PHASE_ORDER = ['p1', 'p2', 'p3', 'p4'];  // 已完成的階段（依戰鬥順序）
const FULL_CHAIN = ['p1', 'p2', 'p3', 'p4'];   // 完整體驗：連續挑戰的階段

const S = {
  pid: 'p1', mode: 'guide', party: 'multi', role: 0, view: '2d', viewTouched: false, cp: 0, speed: 1,
  phase: 'ready', seed: 0, sim: null, keys: new Set(), acc: 0, dismissed: false, p3v: 'regular',
  ci: 0, offset: 0, chainLog: [],
  death: { solo: 'stop', net: 'continue' },   // 有人倒地時：單人預設立即重來、連線預設繼續打
  target: null, held: null,                   // 復活目標（點隊伍列表）、按住的技能鍵
};
const deathMode = () => (netOn() ? S.death.net : S.death.solo);
let r2d = null, r3d = null;
const sfx = new window.Sfx();
const stage = $('stage');
const chain = () => (S.pid === 'full' ? FULL_CHAIN : [S.pid]);
const curPid = () => chain()[S.ci];
const PH = () => PHASES[curPid()];
const fullMode = () => S.pid === 'full';

function randSeed() { return (Math.random() * 4294967296) >>> 0; }
const fmtTime = (t) => {
  if (t < 0) return '-0:0' + Math.ceil(-t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
};
const phaseTag = (pid) => PHASES[pid].name.split(' ')[0];
/** 每個階段用不同但固定的隨機種子（同一組隨機重來時結果一樣）。 */
const phaseSeed = (pid) => (S.seed + Math.imul(PHASE_ORDER.indexOf(pid), 0x9E3779B1)) >>> 0;

// ------------------------------------------------------------------ setup
function seg(id, cb) {
  const el = $(id);
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    b.blur();
    cb(b.dataset.v);
  }));
}
function setSeg(id, v) { $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === String(v))); }

/** 起始點清單：完整體驗時把各階段的檢查點串起來。 */
function cpList() {
  const out = [];
  chain().forEach((pid, ci) => PHASES[pid].checkpoints.forEach((c) => {
    const time = c.t === 0 ? '0:00' : fmtTime(c.t).replace(/\.\d$/, '');
    out.push({ ci, t: c.t, label: (fullMode() ? phaseTag(pid) + '　' : '') + time + '　' + c.name });
  }));
  return out;
}
function rebuildCp() {
  const cp = $('cp');
  cp.innerHTML = '';
  cpList().forEach((c, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = c.label;
    cp.appendChild(o);
  });
}

function buildSide() {
  const roles = $('roles');
  ROLES.forEach((r) => {
    const b = document.createElement('button');
    b.className = 'role'; b.textContent = r.key; b.style.background = r.color; b.title = r.name; b.dataset.slot = r.slot;
    b.addEventListener('click', () => { b.blur(); pickRole(r.slot); });
    roles.appendChild(b);
  });
  rebuildCp();
  $('cp').addEventListener('change', () => { $('cp').blur(); if (isGuest()) { $('cp').value = S.cp; return; } S.cp = +$('cp').value; newRun(S.seed); });

  seg('seg-phase', (v) => { S.pid = v; S.cp = 0; rebuildCp(); newRun(S.seed); });
  // 教學／實戰：連線時只影響自己的畫面，不重開
  seg('seg-mode', (v) => { S.mode = v; if (!S.viewTouched) setView(v === 'guide' ? '2d' : (r3d ? 'both' : '2d'), true); if (!netOn()) newRun(S.seed); else syncSide(); });
  seg('seg-party', (v) => { S.party = v; syncSide(); });
  seg('seg-view', (v) => setView(v));
  seg('seg-speed', (v) => { S.speed = +v; });
  const p3v = loadSetting(P3V_STORE, { v: 'regular' });
  S.p3v = p3v.v === 'suicide' ? 'suicide' : 'regular';
  seg('seg-p3v', (v) => { S.p3v = v; saveSetting(P3V_STORE, { v }); newRun(S.seed); });
  const dm = loadSetting(DEATH_STORE, S.death);
  S.death = { solo: dm.solo === 'continue' ? 'continue' : 'stop', net: dm.net === 'stop' ? 'stop' : 'continue' };
  seg('seg-death', (v) => {
    if (isGuest()) { syncSide(); return; }
    S.death[netOn() ? 'net' : 'solo'] = v; saveSetting(DEATH_STORE, S.death);
    // 打到一半切換：直接套用到這一局；還沒開始就重新建立
    if (S.phase === 'running' || S.phase === 'paused') { S.sim.keepGoing = v === 'continue'; S.sim.stopOnDeath = v !== 'continue'; syncSide(); }
    else newRun(S.seed);
    if (isHost()) sendCfg();
  });
  $('b-giveup').addEventListener('click', (e) => { e.currentTarget.blur(); giveUp(); });
  $('raise').addEventListener('click', (e) => { e.currentTarget.blur(); acceptRaise(); });

  $('b-start').addEventListener('click', (e) => { e.currentTarget.blur(); startPause(); });
  $('b-restart').addEventListener('click', (e) => { e.currentTarget.blur(); if (hostOk()) newRun(S.seed); });
  $('b-new').addEventListener('click', (e) => { e.currentTarget.blur(); if (hostOk()) newRun(randSeed()); });
  $('b-demo').addEventListener('click', (e) => { e.currentTarget.blur(); toggleDemo(); });
  $('banner').addEventListener('click', (e) => { if (e.target.closest('[data-act="start"]')) { e.target.blur(); startPause(); } });
  $('togglepanel').addEventListener('click', (e) => { e.currentTarget.blur(); togglePanel(); });
  $('keys').innerHTML = '<kbd>WASD</kbd> 移動　<kbd>Space</kbd> 開始/暫停<br><kbd>R</kbd> 重來　<kbd>N</kbd> 換隨機　<kbd>V</kbd> 視角　<kbd>P</kbd> AI 代打';
}

const P3V_STORE = 'uwu-trainer-p3v';
const DEATH_STORE = 'uwu-trainer-death';
// 3D 鏡頭限制：預設為 FF14 近似值，可調整並存在瀏覽器
const CAM_DEFAULT = { maxDist: 20, fov: 45, maxPitchDeg: 80 };
const CAM_STORE = 'uwu-trainer-cam';
function loadSetting(key, def) {
  try {
    const o = JSON.parse(localStorage.getItem(key));
    if (o && Object.keys(def).every((k) => typeof o[k] === typeof def[k])) return o;
  } catch (_) { /* 無法讀取就用預設 */ }
  return Object.assign({}, def);
}
function saveSetting(key, o) { try { localStorage.setItem(key, JSON.stringify(o)); } catch (_) { /* 存不了也沒關係 */ } }
function buildCamSettings() {
  if (!r3d) { $('camset').style.display = 'none'; return; }
  const cur = loadSetting(CAM_STORE, CAM_DEFAULT);
  const rows = [['cam-dist', 'maxDist', ' yalm'], ['cam-fov', 'fov', '°'], ['cam-pitch', 'maxPitchDeg', '°']];
  const apply = () => {
    rows.forEach(([id, key, unit]) => { cur[key] = +$(id).value; $('o-' + id).textContent = cur[key] + unit; });
    r3d.setLimits(cur);
    saveSetting(CAM_STORE, cur);
  };
  rows.forEach(([id, key]) => { $(id).value = cur[key]; $(id).addEventListener('input', apply); });
  $('cam-reset').addEventListener('click', (e) => {
    e.currentTarget.blur();
    rows.forEach(([id, key]) => { $(id).value = CAM_DEFAULT[key]; });
    apply();
  });
  apply();
}
// 畫質（3D）：高／標準／流暢
const QUALITY_STORE = 'uwu-trainer-quality';
function buildQualitySetting() {
  if (!r3d) { $('qualsec').style.display = 'none'; return; }
  const cur = loadSetting(QUALITY_STORE, { q: 'normal' });
  const apply = (q) => { cur.q = q; setSeg('seg-quality', q); r3d.setQuality(q); saveSetting(QUALITY_STORE, cur); };
  seg('seg-quality', apply);
  apply(cur.q);
}
// 音效設定
const AUDIO_DEFAULT = { vol: 60, muted: false };
const AUDIO_STORE = 'uwu-trainer-audio';
function buildAudioSettings() {
  const cur = loadSetting(AUDIO_STORE, AUDIO_DEFAULT);
  const apply = () => {
    cur.vol = +$('vol').value; cur.muted = $('mute').checked;
    $('o-vol').textContent = cur.muted ? '靜音' : cur.vol + '%';
    sfx.setVolume(cur.vol / 100, cur.muted);
    saveSetting(AUDIO_STORE, cur);
  };
  $('vol').value = cur.vol; $('mute').checked = cur.muted;
  $('vol').addEventListener('input', apply);
  $('mute').addEventListener('change', apply);
  apply();
  $('b-test-sfx').addEventListener('click', (e) => { e.currentTarget.blur(); sfx.unlock(); setTimeout(() => sfx.play('markMe'), 30); });
}

// 場地標點：玩家自訂，整場共用，存在瀏覽器（沒存過就用攻略預設）
const WM_KEYS = ['A', 'B', 'C', 'D', '1', '2', '3', '4'];
const WM_STORE = 'uwu-trainer-waymarks';
const wm = { list: [], ver: 0, tool: null };   // tool：要放的標點、'del'（移除）或 null
const wmDefault = () => WAYMARKS.map((w) => ({ k: w.k, x: w.x, z: w.z }));
function loadWaymarks() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(WM_STORE)); } catch (_) { /* 讀不到就用預設 */ }
  if (!o || typeof o !== 'object') return wmDefault();
  return WM_KEYS.filter((k) => Array.isArray(o[k]) && o[k].length === 2 && o[k].every(Number.isFinite)).map((k) => ({ k, x: o[k][0], z: o[k][1] }));
}
function setWaymarks(list) {
  applyWaymarks(list);
  if (netOn() && N.link) N.link.send({ t: 'wm', to: 'all', list });   // 標點全隊共用
}
function applyWaymarks(list) {
  wm.list = list; wm.ver++;
  const o = {};
  for (const w of list) o[w.k] = [w.x, w.z];
  saveSetting(WM_STORE, o);
}
function setWmTool(t) {
  wm.tool = t;
  document.querySelectorAll('#wmbar button').forEach((b) => b.classList.toggle('on', b.dataset.wm === t));
  stage.classList.toggle('placing', !!t);
  $('wmhint').textContent = !t ? '' : t === 'del' ? '點地圖上的標點移除・Esc 或右鍵結束' : `點地圖放置 ${t}・Esc 或右鍵取消`;
}
/** 在場地座標 p 放置目前選的標點（或移除最近的標點）。點到場外不處理。 */
function useWmTool(p) {
  const r = Math.hypot(p.x, p.z), lim = C.ARENA_R - 0.5;
  if (r > C.ARENA_R + 1) return;
  const q = r > lim ? { x: p.x * lim / r, z: p.z * lim / r } : p;
  if (wm.tool === 'del') {      // 移除模式保持開著，可以連續移除
    let best = null, bd = 3;
    for (const w of wm.list) { const d = Math.hypot(w.x - q.x, w.z - q.z); if (d < bd) { bd = d; best = w; } }
    if (best) setWaymarks(wm.list.filter((w) => w !== best));
    return;
  }
  const k = wm.tool;
  setWaymarks(wm.list.filter((w) => w.k !== k).concat([{ k, x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100 }]));
  setWmTool(null);
}
function buildWaymarks() {
  const row = $('wmbar').querySelector('.wmrow');
  for (const k of WM_KEYS.concat(['del'])) {
    const b = document.createElement('button');
    b.dataset.wm = k;
    if (k === 'del') { b.textContent = '✕'; b.title = '移除標點：選這個再點地圖上的標點'; }
    else { b.textContent = k; b.className = /\d/.test(k) ? 'num' : 'let'; b.style.setProperty('--c', WM_COLOR[k]); b.title = `放置 ${k}：選這個再點地圖`; }
    b.addEventListener('click', (e) => { e.currentTarget.blur(); setWmTool(wm.tool === k ? null : k); });
    row.appendChild(b);
  }
  $('wm-reset').addEventListener('click', (e) => { e.currentTarget.blur(); setWmTool(null); setWaymarks(wmDefault()); });
  $('wm-clear').addEventListener('click', (e) => { e.currentTarget.blur(); setWmTool(null); setWaymarks([]); });
  wm.list = loadWaymarks(); wm.ver++;
}

function syncSide() {
  setSeg('seg-phase', S.pid);
  setSeg('seg-mode', S.mode);
  const keep = deathMode() === 'continue';
  $('phasenote').textContent = fullMode()
    ? `從 P1 開場一路打到 ${phaseTag(FULL_CHAIN[FULL_CHAIN.length - 1])} 結束，階段之間無縫銜接（跟遊戲一樣沒有倒數）；${keep ? '倒地的人延續到下一階段，等人復活。' : '任何人死亡即失敗（自殺流的計畫倒地除外）。'}`
    : `「完整體驗」可從 P1 連續挑戰到 ${phaseTag(FULL_CHAIN[FULL_CHAIN.length - 1])}。`;
  $('charge').style.display = PH().maxCharges ? '' : 'none';   // P4 沒有覺醒充能
  setSeg('seg-death', deathMode());
  $('deathnote').textContent = keep
    ? '倒地的人可以被補師／C 復活（AI 補師也會救人），真人玩家全部倒地或按「放棄」才結束；沒覺醒也打到最後（結算標 ✗）。'
    : '任何人死亡就失敗，馬上看結算重來（自殺流的計畫倒地除外）。';
  $('app').classList.toggle('can-giveup', keep && !isGuest() && (S.phase === 'running' || S.phase === 'paused'));
  const p3on = S.pid === 'p3' || fullMode();
  $('p3vsec').classList.toggle('show', p3on);
  setSeg('seg-p3v', S.p3v);
  $('p3vnote').textContent = S.p3v === 'suicide'
    ? '自殺流：OT／M1／M2／R 在第二波大地之重倒地，H1→OT、H2→M1、C→M2（即刻）與 R（10 秒）；石牢固定 泰坦—C—H1—H2；三顆石牢形成後起身（F）。'
    : '正規：照萌神神攻略，花崗石牢隨機點 3 人，照順序站 泰坦位／1 號位／爆破岩石位。';
  $('modenote').textContent = S.mode === 'guide'
    ? '會顯示建議站位（取自攻略圖）、提前預告與下一步提示，可放慢速度。'
    : '只顯示遊戲內看得到的資訊（詠唱條、預警圈、頭標），不提示站位。';
  $('partynote').textContent = S.party === 'multi'
    ? '隊友由 AI 依攻略完美執行，可觀察整體編排。'
    : '其他隊友隱藏，但他們的機制視為正確處理，只判定你的職責。';
  $('speedsec').style.display = S.mode === 'guide' ? '' : 'none';
  stage.dataset.assist = S.mode === 'guide' ? '1' : '0';
  $('modetag').textContent = (S.mode === 'guide' ? '教學指引' : '實戰模擬');
  $('ttl').textContent = '絕神兵 ' + (fullMode() ? '完整體驗：' + PH().name : PH().name.replace(' ', '・'));
  document.title = '絕神兵練習器・' + (fullMode() ? '完整體驗' : PH().name);
  document.querySelectorAll('.role').forEach((b) => b.classList.toggle('on', +b.dataset.slot === S.role));
  const rd = PH().roleDescFor ? PH().roleDescFor(S.p3v) : PH().roleDesc;
  $('roledesc').textContent = ROLES[S.role].name + (fullMode() ? `（${PH().name}）` : '') + '：' + rd[S.role];
  $('cp').value = S.cp;
  $('seedline').textContent = '隨機種子：' + S.seed + (S.cp > 0 ? '（含檢查點）' : '');
  $('b-start').textContent = S.phase === 'running' ? '暫停' : S.phase === 'paused' ? '繼續' : S.phase === 'ended' ? '再來' : '開始';
  const demo = S.sim && S.sim.pc.auto;
  $('b-demo').textContent = demo ? 'AI 代打中' : 'AI 代打';
  $('b-demo').title = demo ? '目前由 AI 代打，點一下接手（P）' : 'AI 代打（P）';
  $('b-demo').classList.toggle('primary', !!demo);
  setSeg('seg-view', S.view);
  setSeg('seg-party', S.party);
  // 連線：隊員不能控制；連線時固定 1 倍速
  const lock = isGuest();
  for (const id of ['b-start', 'b-restart', 'b-new', 'cp']) $(id).disabled = lock;
  document.querySelectorAll('#seg-phase button, #seg-p3v button, #seg-death button').forEach((b) => { b.disabled = lock; });
  if (netOn()) {
    $('speedsec').style.display = 'none';
    $('partynote').textContent = S.party === 'multi' ? '連線中：其他職位由隊友操作，沒人的職位由 AI 操作。' : '只顯示你自己（隊友照樣在打）。';
  }
}

function setView(v, auto) {
  if (v !== '2d' && !r3d) v = '2d';
  S.view = v;
  if (!auto) S.viewTouched = true;
  stage.dataset.view = v;
  syncSide();
  requestAnimationFrame(resizeAll);
}
function resizeAll() { if (r2d) r2d.resize(); if (r3d) r3d.resize(); }
function togglePanel() { $('app').classList.toggle('nopanel'); requestAnimationFrame(resizeAll); }

// ------------------------------------------------------------------ 連線（房間、房主／隊員）
const NET = window.UWU_NET;
const NET_STORE = 'uwu-trainer-net';
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** role：off（單機）／pending（連線中）／host（房主：跑模擬並廣播）／guest（隊員：顯示房主的狀態，自己的角色在本機移動）。 */
const N = {
  role: 'off', link: null, me: null, host: null, members: [], roles: {}, room: '', cfg: null,
  rep: null, ep: 0, lastSim: null, lastSend: 0, lastMe: 0, sentMe: '',
  mirror: null, spectate: false, acc: 0, kb: null, kbSeq: 0, drift: 0,
};
const isHost = () => N.role === 'host';
const isGuest = () => N.role === 'guest';
const netOn = () => N.role !== 'off';
const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const memberName = (id) => { const m = N.members.find((x) => x.id === id); return m ? m.name : '？'; };
const slotOwner = (slot) => Object.keys(N.roles).find((id) => N.roles[id] === slot);
const remoteSlots = () => Object.keys(N.roles).filter((id) => id !== N.me).map((id) => N.roles[id]);
let toastTimer = 0;
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function hostOk() { if (isGuest()) { toast('只有房主可以控制開始、暫停與設定'); return false; } return true; }
const served = () => location.protocol === 'http:' || location.protocol === 'https:';
/** WebSocket 位址：用網址開練習器時就是同一個網站；單機檔要填部署後的網址。 */
function serverBase() {
  if (served()) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const v = ($('net-srv').value || '').trim().replace(/\/+$/, '').replace(/\/ws$/, '');
  if (!v) return null;
  return v.replace(/^http/, 'ws').replace(/^(?!wss?:\/\/)/, 'wss://') + '/ws';
}

function netConnect(room) {
  const base = serverBase();
  if (!base) { $('net-msg').textContent = '請先填伺服器網址（部署到 Cloudflare 後拿到的網址）。'; return; }
  const name = ($('net-name').value || '').trim().slice(0, 16) || '玩家';
  saveSetting(NET_STORE, { name, server: $('net-srv').value || '' });
  if (N.link) netLeave(true);
  N.room = room; N.role = 'pending'; N.ep = 0;
  $('net-msg').textContent = '';
  N.link = new NET.Link(`${base}?room=${room}&name=${encodeURIComponent(name)}`, onNetMessage, onNetClose);
  syncNet();
}
function netLeave(silent) {
  const wasGuest = isGuest();
  if (N.link) N.link.close();
  Object.assign(N, { role: 'off', link: null, me: null, host: null, members: [], roles: {}, room: '', cfg: null, rep: null, mirror: null, lastSim: null, spectate: false });
  if (wasGuest) { S.phase = 'ready'; newRun(S.seed); }   // 回到單機：重新建立自己的模擬
  else if (S.sim) newRun(S.seed);
  if (!silent) syncNet();
  buildParty(); syncSide(); syncNet();
}
function onNetClose(e) {
  const why = e.code === 4001 ? '房間已滿（最多 10 人）' : N.role === 'pending' ? '連不上伺服器（網址或網路有問題）' : '連線中斷';
  netLeave(true);
  $('net-msg').textContent = why + '，已回到單機。';
}
function onNetMessage(m) {
  if (m.t === 'welcome') { N.me = m.id; return; }
  if (m.t === 'roomfull') { $('net-msg').textContent = '房間已滿（最多 10 人）。'; return; }
  if (m.t === 'roster') { onRoster(m); return; }
  if (m.t === 'wm') { applyWaymarks(m.list); return; }
  if (isHost()) hostMessage(m);
  else if (isGuest()) guestMessage(m);
}
function onRoster(m) {
  const prevHost = N.host;
  N.members = m.members; N.host = m.host;
  if (m.host === N.me && !isHost()) becomeHost();
  else if (m.host !== N.me && !isGuest()) becomeGuest();
  else if (isHost()) hostRosterChanged();
  if (prevHost && prevHost !== m.host) toast(`房主改為 ${memberName(m.host)}`);
  buildParty(); syncNet(); syncSide();
}

// ---------------- 房主
function becomeHost() {
  const fromGuest = isGuest(), mir = N.mirror;
  N.role = 'host'; N.rep = new NET.Replicator(); N.mirror = null; N.lastSim = null;
  if (fromGuest && N.cfg) {
    // 接手房主：沿用原本的設定，從目前時間附近的檢查點重新開始
    S.pid = N.cfg.pid; S.p3v = N.cfg.p3v; S.seed = N.cfg.seed;
    rebuildCp();
    const t = mir ? mir.t : 0, ci = N.cfg.ci;
    let best = 0;
    cpList().forEach((c, i) => { if (c.ci < ci || (c.ci === ci && c.t <= t)) best = i; });
    S.cp = best;
    N.roles = Object.assign({}, N.cfg.roles);
  } else N.roles = {};
  if (S.role === undefined || Object.keys(N.roles).some((id) => id !== N.me && N.roles[id] === S.role)) S.role = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => !Object.values(N.roles).includes(k));
  N.roles[N.me] = S.role;
  for (const id of Object.keys(N.roles)) if (!N.members.some((x) => x.id === id)) delete N.roles[id];
  assignNewMembers();
  S.phase = 'ready';
  newRun(S.seed);
  toast(fromGuest ? '你現在是房主：從最近的檢查點重新開始' : '房間已建立：把房號給隊友');
}
function becomeGuest() {
  N.role = 'guest'; N.rep = null; N.mirror = null; N.lastSim = null;
  S.phase = 'ready'; S.dismissed = false;
  $('overlay').classList.remove('show');
}
/** 新進房的人：分配第一個沒人用的職位（8 個都有人就觀戰）。 */
function assignNewMembers() {
  const fresh = [];
  for (const m of N.members) {
    if (N.roles[m.id] !== undefined) continue;
    const used = new Set(Object.values(N.roles));
    const slot = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => !used.has(k));
    if (slot === undefined) continue;
    N.roles[m.id] = slot; fresh.push(m.id);
    if (S.sim && isHost()) { S.sim.humans.add(slot); S.sim.setRemoteAuto(slot, false); }
  }
  return fresh;
}
function hostRosterChanged() {
  const ids = new Set(N.members.map((m) => m.id));
  let changed = false;
  for (const id of Object.keys(N.roles)) {
    if (ids.has(id)) continue;
    const slot = N.roles[id]; delete N.roles[id]; changed = true;
    S.sim.setRemoteAuto(slot, true);   // 離開的人改由 AI
    toast(`${ROLES[slot].key} 的玩家離開，改由 AI 操作`);
  }
  const fresh = assignNewMembers();
  if (!fresh.length && !changed) return;
  sendCfg();
  if (fresh.length) { sendTick(); for (const id of fresh) sendFull(id); }
}
const cfgMsg = () => ({ t: 'cfg', pid: S.pid, ci: S.ci, cp: S.cp, seed: S.seed, p3v: S.p3v, death: deathMode(), roles: N.roles, wm: wm.list });
function sendCfg() { N.link.send(cfgMsg()); }
function sendFull(to) {
  const m = { t: 'full', ep: N.ep, ph: S.phase, off: S.offset, pid: curPid(), ci: S.ci, variant: S.sim.variant, cfg: cfgMsg(), snap: N.rep.snapshot(S.sim, true) };
  if (to) m.to = to;
  N.link.send(m);
}
function sendTick() {
  if (!N.rep || !S.sim || N.lastSim !== S.sim) return;
  N.link.send({ t: 'tk', ep: N.ep, ph: S.phase, off: S.offset, snap: N.rep.snapshot(S.sim, false) });
  N.lastSend = performance.now();
}
function netHostTick(now) {
  if (N.me === null) return;
  if (S.sim !== N.lastSim) { N.lastSim = S.sim; N.ep++; sendCfg(); sendFull(); N.lastSend = now; return; }   // 新的一局／下一階段
  if (now - N.lastSend >= (S.phase === 'running' ? 50 : 250)) sendTick();
}
function sendEnd(r) {
  const recs = {};
  for (const slot of S.sim.humans) recs[slot] = S.chainLog.map((x) => x[slot]).filter(Boolean).concat([phaseRecord(S.sim, slot)]);
  sendTick();
  N.link.send({ t: 'end', ep: N.ep, ok: r.ok, full: r.full, total: r.total, phaseName: r.phaseName, pid: r.pid, fail: r.fail, recs });
}
function hostMessage(m) {
  const slot = N.roles[m.from];
  if (m.t === 'me') { if (slot !== undefined && S.sim.chars[slot].remote) S.sim.setRemote(slot, m.x, m.z, m.r); return; }
  if (m.t === 'act') {
    if (slot === undefined) return;
    if (m.a === 'raise' && S.phase === 'running') S.sim.acceptRaise(slot);
    if (m.a === 'skill' && S.phase === 'running' && SKILLS[m.id]) {
      const c = S.sim.chars[slot];
      if (c.remote && m.x !== undefined) c.net = { x: m.x, z: m.z, rot: m.r };   // 按技能時的位置（不算移動）
      S.sim.useSkill(slot, m.id, m.tg);
    }
    if (m.a === 'auto') S.sim.setRemoteAuto(slot, !!m.on);
    return;
  }
  if (m.t === 'role') {
    const want = m.slot, owner = slotOwner(want);
    if (owner && owner !== m.from) { N.link.send({ t: 'deny', to: m.from, msg: `${ROLES[want].key} 已經是 ${memberName(owner)} 的職位` }); return; }
    if (slot !== undefined) S.sim.setRemoteAuto(slot, true);
    N.roles[m.from] = want; S.sim.humans.add(want); S.sim.setRemoteAuto(want, false);
    sendCfg(); sendTick(); sendFull();
    buildParty(); syncNet();
  }
}
function pickRole(slot) {
  if (isGuest()) { if (slot !== S.role || N.spectate) N.link.send({ t: 'role', slot }); return; }
  if (isHost()) {
    const owner = slotOwner(slot);
    if (owner && owner !== N.me) { toast(`${ROLES[slot].key} 已經是 ${memberName(owner)} 的職位`); return; }
    N.roles[N.me] = slot;
  }
  S.role = slot; newRun(S.seed);
}

// ---------------- 隊員
function guestMessage(m) {
  if (m.t === 'cfg') applyCfg(m);
  else if (m.t === 'full') { applyCfg(m.cfg); loadMirror(m); }
  else if (m.t === 'tk') { if (N.mirror && m.ep === N.ep) { N.mirror.apply(m.snap, m.ph === 'running'); S.offset = m.off; if (m.ph !== S.phase && !(S.phase === 'ended' && m.ph !== 'ready' && m.ph !== 'running')) { S.phase = m.ph; syncSide(); } } }
  else if (m.t === 'end') { if (m.ep === N.ep) guestResult(m); }
  else if (m.t === 'deny') toast(m.msg);
}
function applyCfg(c) {
  N.cfg = c; N.roles = c.roles;
  const mine = N.roles[N.me];
  const roleChanged = mine !== undefined && mine !== S.role;
  S.pid = c.pid; S.ci = c.ci; S.cp = c.cp; S.seed = c.seed; S.p3v = c.p3v; S.death.net = c.death;
  if (mine !== undefined) S.role = mine;
  if (JSON.stringify(c.wm) !== JSON.stringify(wm.list)) applyWaymarks(c.wm);
  rebuildCp();
  if (roleChanged) buildParty();
  syncSide(); syncNet(); buildParty();
}
function loadMirror(m) {
  N.ep = m.ep;
  const mine = N.roles[N.me];
  N.spectate = mine === undefined;
  N.mirror = new NET.Mirror(m.pid, m.variant, N.spectate ? 0 : mine, m.snap);
  N.mirror.spectator = N.spectate;
  S.sim = N.mirror; S.offset = m.off; S.ci = m.ci; S.phase = m.ph; S.dismissed = false;
  N.acc = 0; N.kb = null; N.kbSeq = 0; N.drift = 0; N.sentMe = '';
  snapMe();
  $('overlay').classList.remove('show');
  audioReset(); buildParty(); syncSide();
}
/** 自己的角色直接放到房主那邊的位置（新的一局、復活、位置差太多時）。 */
function snapMe() {
  const me = N.mirror.pc;
  me.pos.x = me.prev.x = me.host.x; me.pos.z = me.prev.z = me.host.z; me.rot = me.prevRot = me.host.rot;
}
function guestTick(now, dt) {
  const mir = N.mirror;
  if (!mir) return;
  mir.frame(now, dt);
  const me = mir.pc;
  if (mir.teleport) { mir.teleport = false; snapMe(); }
  const mine = !N.spectate && me.alive && !me.auto;
  if (!mine || S.phase !== 'running') { N.acc = 0; if (mine) { me.prev.x = me.pos.x; me.prev.z = me.pos.z; me.walk = 0; } return; }
  N.acc = Math.min(0.25, N.acc + dt);
  while (N.acc >= STEP) {
    me.prev.x = me.pos.x; me.prev.z = me.pos.z; me.prevRot = me.rot;
    const x0 = me.pos.x, z0 = me.pos.z;
    // 擊退：照房主給的方向與總距離，在剩下的時間內補完（訊息有延遲）
    if (me.kb && me.kb.seq !== N.kbSeq) {
      N.kbSeq = me.kb.seq;
      const total = me.kb.until - me.kb.t0, remain = Math.max(0.25, me.kb.until - mir.t);
      N.kb = { vx: me.kb.vx * total / remain, vz: me.kb.vz * total / remain, left: remain };
    }
    if (N.kb && N.kb.left > 0) { me.pos.x += N.kb.vx * STEP; me.pos.z += N.kb.vz * STEP; N.kb.left -= STEP; }
    else if (mir.t >= me.stunUntil) {
      const inp = readInput(), l = Math.hypot(inp.x, inp.z);
      const v = C.SPEED * (mir.statuses.some((x) => x.slot === me.slot && x.id === 'sprint' && (x.t1 === null || mir.t <= x.t1)) ? 1.3 : 1);   // 衝刺
      if (l > 0.01) { me.pos.x += inp.x * v * STEP; me.pos.z += inp.z * v * STEP; me.rot = Math.atan2(inp.x, inp.z); }
    }
    me.walk = Math.hypot(me.pos.x - x0, me.pos.z - z0) / STEP;
    N.acc -= STEP;
  }
  // 跟房主那邊差太多（例如房主快轉）就直接對齊
  N.drift = Math.hypot(me.pos.x - me.host.x, me.pos.z - me.host.z) > 10 ? N.drift + dt : 0;
  if (N.drift > 1.5) { snapMe(); N.drift = 0; }
  // 位置有變才送，最多每秒 15 次（免費方案的請求額度主要花在這裡）
  if (now - N.lastMe >= 66) {
    const m = { t: 'me', x: Math.round(me.pos.x * 100) / 100, z: Math.round(me.pos.z * 100) / 100, r: Math.round(me.rot * 1000) / 1000 };
    const key = m.x + ',' + m.z + ',' + m.r;
    if (key !== N.sentMe) { N.link.send(m); N.sentMe = key; N.lastMe = now; }
  }
}
function guestResult(m) {
  S.phase = 'ended'; S.dismissed = false; syncSide();
  sfx.play(m.ok ? 'clear' : 'fail');
  const slot = N.roles[N.me];
  let h = slot === undefined ? `<h2 class="${m.ok ? 'ok' : 'bad'}">${m.ok ? '通過' : '失敗'}</h2>` : resultHtml(Object.assign({}, m, { recs: m.recs[slot] || [] }), slot);
  h += '<p class="note">等待房主開始下一局。</p><div class="btns"><button class="btn" id="r-close">看場景</button></div>';
  $('card').innerHTML = h;
  $('overlay').classList.add('show');
  $('r-close').onclick = () => { S.dismissed = true; $('overlay').classList.remove('show'); };
}

// ---------------- 連線面板
function buildNet() {
  const st = loadSetting(NET_STORE, { name: '', server: '' });
  $('net-name').value = st.name; $('net-srv').value = st.server;
  $('net-srv-row').style.display = served() ? 'none' : '';
  const q = new URLSearchParams(location.search).get('room');
  if (q) $('net-room').value = q.toUpperCase().slice(0, 4);
  $('net-create').addEventListener('click', (e) => {
    e.currentTarget.blur();
    let c = ''; for (let i = 0; i < 4; i++) c += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    netConnect(c);
  });
  $('net-join').addEventListener('click', (e) => {
    e.currentTarget.blur();
    const c = ($('net-room').value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(c)) { $('net-msg').textContent = '房號是 4 個英數字。'; return; }
    netConnect(c);
  });
  $('net-leave').addEventListener('click', (e) => { e.currentTarget.blur(); netLeave(); });
  $('net-copy').addEventListener('click', (e) => {
    e.currentTarget.blur();
    const text = served() ? `${location.origin}${location.pathname}?room=${N.room}` : N.room;
    navigator.clipboard.writeText(text).then(() => toast(served() ? '已複製邀請連結' : '已複製房號'), () => toast('房號：' + N.room));
  });
  $('net-members').addEventListener('click', (e) => { const b = e.target.closest('[data-xfer]'); if (b && isHost()) N.link.send({ t: 'xfer', to: b.dataset.xfer }); });
  syncNet();
}
function syncNet() {
  const on = netOn();
  $('net-off').style.display = on ? 'none' : '';
  $('net-on').style.display = on ? '' : 'none';
  $('app').classList.toggle('net-guest', isGuest());
  if (!on) return;
  $('net-code').textContent = N.room;
  $('net-members').innerHTML = N.members.map((m) => {
    const slot = N.roles[m.id];
    const role = slot === undefined ? '<span class="nk none">觀戰</span>' : `<span class="nk" style="background:${ROLES[slot].color}">${ROLES[slot].key}</span>`;
    const tags = (m.id === N.host ? '<em>房主</em>' : '') + (m.id === N.me ? '<em class="me">你</em>' : '');
    const xfer = isHost() && m.id !== N.me ? `<button class="btn mini" data-xfer="${m.id}">轉讓房主</button>` : '';
    return `<div class="nm-row">${role}<span class="nn">${escapeHtml(m.name)}</span>${tags}${xfer}</div>`;
  }).join('');
  $('net-note').textContent = N.role === 'pending' ? '連線中…'
    : isHost() ? '你是房主：開始、暫停、階段、起始點、打法由你控制。點上方職位可以換自己的職位（會重開這一局）。'
      : '房主控制開始與設定。點上方職位可以換成沒人用的職位；教學／實戰、視角、單人顯示只影響你自己的畫面。';
}

// ------------------------------------------------------------------ run control
function makeSim(pid, extra) {
  return new Sim(Object.assign({ phase: pid, seed: phaseSeed(pid), playerSlot: S.role, stopOnDeath: true, onDeath: deathMode(), variant: pid === 'p3' ? S.p3v : null,
    remote: isHost() ? remoteSlots() : [] }, extra || {}));
}
function newRun(seed) {
  if (isGuest()) return;
  S.seed = seed >>> 0;
  const cp = cpList()[S.cp];
  S.ci = cp.ci; S.chainLog = []; S.offset = 0;
  for (let i = 0; i < cp.ci; i++) S.offset += PHASES[chain()[i]].end;
  S.sim = makeSim(curPid());
  if (cp.t > 0) S.sim.fastForward(cp.t);
  S.phase = 'ready'; S.acc = 0; S.dismissed = false;
  buildParty();
  $('overlay').classList.remove('show');
  audioReset();
  syncSide();
}
function phaseRecord(sim, slot) {
  return {
    name: sim.phase.name, objectives: sim.objectives(slot), roll: sim.phase.rollSummary(sim.roll),
    hits: sim.notes.filter((n) => n.type === 'hit' && n.slot === slot).slice(0, 6),
    skills: sim.skillSummary(slot),
  };
}
/** 本階段每位真人的檢查（連線時每個人看自己的）。 */
function phaseRecords(sim) { const r = {}; for (const slot of sim.humans) r[slot] = phaseRecord(sim, slot); return r; }
/** 完整體驗：本階段通過 → 位置延續，下一階段立刻從 0:00 開始（無倒數）。 */
function advanceChain() {
  const prev = S.sim;
  S.chainLog.push(phaseRecords(prev));
  S.offset += prev.t;
  S.ci++;
  // 位置、倒地者、極限技量表、技能冷卻都延續到下一階段
  S.sim = makeSim(curPid(), {
    startPos: prev.chars.map((c) => [c.pos.x, c.pos.z]), preRoll: 0,
    dead: prev.chars.filter((c) => !c.alive).map((c) => c.slot), lb: prev.lb,
    carry: prev.chars.map((c) => { const o = {}; for (const k of Object.keys(c.cd)) if (c.cd[k] > prev.t) o[k] = c.cd[k] - prev.t; return o; }),
  });
  if (prev.pc.auto) S.sim.setPlayerAuto(true);
  for (const slot of remoteSlots()) if (prev.chars[slot].auto) S.sim.setRemoteAuto(slot, true);   // 開著 AI 代打的隊員維持 AI
  audioReset();
  sfx.play('phase');
  syncSide();
}
function startPause() {
  sfx.unlock();
  if (!hostOk()) return;
  if (S.phase === 'ready') S.phase = 'running';
  else if (S.phase === 'running') S.phase = 'paused';
  else if (S.phase === 'paused') S.phase = 'running';
  else if (S.phase === 'ended') newRun(randSeed());   // 打完再開始：換一組新的隨機（要重練同一組用「重來」）
  syncSide();
  if (isHost()) sendTick();
}
/** 接受復活（倒地且收到復活時）。 */
function acceptRaise() {
  const sim = S.sim;
  if (S.phase !== 'running' || sim.pc.alive || !sim.pc.raise) return;
  if (isGuest()) { N.link.send({ t: 'act', a: 'raise' }); return; }
  sim.acceptRaise(sim.pc.slot);
}
/** 放棄這一局（房主／單人）：直接看結算。 */
function giveUp() {
  if (!hostOk() || !S.sim || !(S.phase === 'running' || S.phase === 'paused')) return;
  S.sim.giveUp();
  S.phase = 'ended'; syncSide(); showResult();
}
// ---------------- 技能
const hot = { slots: [], castKey: '', lbKey: '', sendT: {} };
function buildHotbar() {
  const box = $('slots'); box.innerHTML = ''; hot.slots = [];
  LOADOUT[S.role].forEach((id, i) => {
    const sk = SKILLS[id];
    const b = document.createElement('button');
    b.className = 'sk' + (sk.gcd ? ' gcd' : '') + (sk.lb ? ' lbk' : '');
    b.innerHTML = `<span class="kb">${i + 1}</span>${sk.short}<i class="cd"></i><span class="ct"></span>`;
    b.title = `${sk.name}（${i + 1}）：${sk.tip}`;
    b.addEventListener('click', (e) => { e.currentTarget.blur(); trySkill(id, true); });
    box.appendChild(b);
    hot.slots.push({ id, el: b, cd: b.querySelector('.cd'), ct: b.querySelector('.ct'), key: '' });
  });
  hot.castKey = ''; hot.lbKey = '';
}
/** 使用技能。fresh：這次是按下（不是按住重複），失敗時才跳提示。 */
function trySkill(id, fresh) {
  sfx.unlock();
  const sim = S.sim;
  if (!sim || S.phase !== 'running') { if (fresh) toast(S.phase === 'paused' ? '暫停中' : '還沒開始'); return; }
  if (isGuest()) {
    if (N.spectate) return;
    const chk = skillCheck(sim, sim.playerSlot, id, S.target);
    if (chk.why === undefined || (chk.gcdWait !== undefined && chk.gcdWait <= 0.15)) {
      const now = performance.now();
      if (now - (hot.sendT[id] || 0) < 200) return;   // 按住時不要一直送
      hot.sendT[id] = now;
      // 連同目前位置一起送：剛停下來就讀條時，房主不會把「最後一次位置更新」誤判成讀條中移動
      const me = sim.pc, x = Math.round(me.pos.x * 100) / 100, z = Math.round(me.pos.z * 100) / 100, r = Math.round(me.rot * 1000) / 1000;
      N.link.send({ t: 'act', a: 'skill', id, tg: S.target, x, z, r });
      N.sentMe = x + ',' + z + ',' + r;
      if (chk.why === undefined) skillFlash(id);
    } else if (fresh && chk.why) toast(chk.why);
    return;
  }
  const r = sim.useSkill(sim.playerSlot, id, S.target);
  if (r.why === undefined) { if (!r.queued) skillFlash(id); } else if (fresh && r.why) toast(r.why);
}
function skillFlash(id) {
  const s = hot.slots.find((x) => x.id === id);
  if (s) { s.el.classList.remove('fl'); void s.el.offsetWidth; s.el.classList.add('fl'); }
  sfx.play('skill');
}
function setTarget(slot) {
  S.target = S.target === slot ? null : slot;
  partyRows.forEach((row, i) => { if (row) row.el.classList.toggle('tg', i === S.target); });
}
function toggleDemo() {
  if (!S.sim || S.phase === 'ended') return;
  if (isGuest()) { if (!N.spectate) N.link.send({ t: 'act', a: 'auto', on: !S.sim.pc.auto }); return; }
  S.sim.setPlayerAuto(!S.sim.pc.auto);
  syncSide();
}

function readInput() {
  const k = S.keys;
  let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  let iy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  if (!ix && !iy) return { x: 0, z: 0 };
  const l = Math.hypot(ix, iy); ix /= l; iy /= l;
  const yaw = S.view === '2d' || !r3d ? 0 : r3d.cam.yaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { x: rx * ix + fx * iy, z: rz * ix + fz * iy };
}

// ------------------------------------------------------------------ 音效（比對模擬狀態的變化）
const au = { casts: new WeakSet(), fx: new Set(), marks: new WeakSet(), screen: new WeakSet(), alive: [], charges: 0, lastT: 0, sim: null };
function audioReset() {
  const sim = S.sim;
  au.sim = sim;
  au.casts = new WeakSet(sim.casts); au.marks = new WeakSet(sim.marks); au.screen = new WeakSet(sim.screenFx); au.sounds = new WeakSet(sim.sounds);
  au.fx = new Set(sim.fx.filter((f) => sim.t >= f.t1).map((f) => f.id));
  au.alive = sim.chars.map((c) => c.alive); au.charges = sim.charges; au.lastT = sim.t;
}
function fxSound(f) {
  const L = f.label || '';
  const size = f.kind === 'rect' || f.kind === 'cone' ? f.len / 2 : (f.r || 4);
  const p = Math.max(0.25, Math.min(1, size / 12));
  if (/Eruption|Plume|Incinerate|Crimson|深紅|十字|Searing|地火|炎/.test(L)) return ['fire', p];
  if (/Crush|碎擊|Friction|烈風刃/.test(L) || f.tint === 'share') return ['stack', p];
  if (/Whirlwind|Song|Wheel|Eye|Downburst|Slipstream|Rain|旋風|龍捲/.test(L)) return ['wind', p];
  return ['boom', p];
}
function audioTick() {
  const sim = S.sim;
  if (sim !== au.sim) audioReset();
  if (S.phase !== 'running') { au.lastT = sim.t; return; }
  const t = sim.t, me = sim.playerSlot, solo = S.party === 'solo';
  for (let k = -5; k <= 0; k++) if (au.lastT < k && t >= k && !(fullMode() && S.ci > 0 && k < -3)) sfx.play(k < 0 ? 'count' : 'go');
  for (const c of sim.casts) if (!au.casts.has(c) && t >= c.t0) { au.casts.add(c); sfx.play('cast'); }
  let best = null;
  for (const f of sim.fx) {
    if (t < f.t1 || au.fx.has(f.id)) continue;
    au.fx.add(f.id);
    const s = fxSound(f);
    if (!best || s[1] > best[1]) best = s;
  }
  if (best) sfx.play(best[0], best[1]);
  for (const m of sim.marks) {
    if (au.marks.has(m) || t < m.t0) continue;
    au.marks.add(m);
    if (m.slot === me) sfx.play('markMe'); else if (!solo) sfx.play('mark');
  }
  for (const f of sim.screenFx) if (!au.screen.has(f)) { au.screen.add(f); sfx.play(f.type === 'lb' ? 'lb' : 'raidwide', f.power); }
  if (!sim.pc.alive && sim.pc.raise && !au.raised) sfx.play('raised');
  au.raised = !sim.pc.alive && !!sim.pc.raise;
  for (const f of sim.sounds) if (!au.sounds.has(f)) { au.sounds.add(f); sfx.play(f.name); }
  sim.chars.forEach((c, i) => {
    if (au.alive[i] && !c.alive) { if (i === me) sfx.play('deathMe'); else if (!solo) sfx.play('death'); if (c.kb) sfx.play('knock'); }
    au.alive[i] = c.alive;
  });
  if (sim.charges > au.charges) sfx.play('charge');
  au.charges = sim.charges;
  au.lastT = t;
}

// ------------------------------------------------------------------ HUD
let partyRows = [];
/** 左上「你」面板＋隊友列表（不含自己，自己在上方面板）。 */
function buildParty() {
  const box = $('party'); box.innerHTML = ''; partyRows = [];
  ROLES.forEach((r) => {
    if (r.slot === S.role) { partyRows.push(null); return; }
    const d = document.createElement('div'); d.className = 'pm';
    const owner = netOn() ? slotOwner(r.slot) : null;
    d.innerHTML = `<span class="k" style="background:${r.color}">${r.key}</span><span class="hp"><i></i></span><span class="st"></span>` + (netOn() ? `<span class="who${owner ? '' : ' ai'}">${owner ? escapeHtml(memberName(owner)) : 'AI'}</span>` : '')
      + '<span class="cb"><i></i></span>';
    d.title = '點一下選為目標（復活用），再點一次取消';
    d.addEventListener('click', () => setTarget(r.slot));
    if (S.target === r.slot) d.classList.add('tg');
    box.appendChild(d);
    partyRows.push({ el: d, hp: d.querySelector('.hp i'), st: d.querySelector('.st'), cb: d.querySelector('.cb'), cbi: d.querySelector('.cb i'), cbKey: '', html: null, dead: null, hw: '', hc: null });
  });
  if (S.target === S.role) S.target = null;
  buildHotbar();
  const me = ROLES[S.role];
  $('me-key').textContent = me.key; $('me-key').style.background = me.color;
  $('me-name').textContent = me.name;
  hud.me = null; hud.meHw = ''; hud.meHc = null; hud.solo = null; lastMyHtml = null;
}
const remText = (s, t) => {
  if (s.t1 === null) return '';
  const r = Math.max(0, s.t1 - t);
  return r >= 10 ? String(Math.ceil(r)) : r.toFixed(1);
};
function statusIcons(list, t) {
  return list.map((s) => {
    const d = STATUS_DEF[s.id];
    return `<span class="sti${d.mark ? ' mk' : ''}" style="--c:${d.color}" title="${d.name}"><b>${d.icon}</b>${s.stacks ? `<em>${s.stacks}</em>` : ''}<small>${remText(s, t)}</small></span>`;
  }).join('');
}
function myStatusHtml(list, t) {
  return list.map((s) => {
    const d = STATUS_DEF[s.id];
    const rem = remText(s, t);
    return `<div class="msi${d.mark ? ' mk' : ''}" style="--c:${d.color}"><b>${d.icon}${s.stacks ? `<em>${s.stacks}</em>` : ''}</b><span>${d.name}${s.stacks ? ` ×${s.stacks}` : ''}</span><small>${rem ? rem + ' 秒' : '持續中'}</small></div>`;
  }).join('');
}

/** 隊伍列表裡倒地者的狀態：陣亡／誰正在救／已收到復活。 */
function deadHtml(sim, c) {
  if (c.raise) return `<span class="rz">已收到復活（${ROLES[c.raise.by].key}）</span>`;
  const r = sim.chars.find((x) => x.cast && x.cast.id === 'raise' && x.cast.tg === c.slot);
  if (r) return `<span class="rz">${r.key} 復活中…</span>`;
  return `<span class="dead-x">${c.planned ? '倒地' : '陣亡'}</span>`;
}
/** 技能列：冷卻、GCD、不能用（倒地、距離太遠、沒有目標）、排隊中；自己的讀條；極限技量表。 */
function updateHotbar(sim) {
  const pc = sim.pc, t = sim.t, run = S.phase === 'running' && t >= 0;
  const b = bossOf(sim, pc.pos), far = !b || Math.hypot(b.pos.x - pc.pos.x, b.pos.z - pc.pos.z) > meleeReach(sim);
  const blocked = !pc.alive || t < pc.stunUntil;
  for (const sl of hot.slots) {
    const sk = SKILLS[sl.id];
    let p = 0, txt = '';
    if (sk.gcd) { const rem = pc.gcdUntil - t; if (rem > 0 && run) p = Math.min(1, rem / GCD); }
    else if (!sk.lb && pc.cd[sl.id] !== undefined) { const rem = pc.cd[sl.id] - t; if (rem > 0) { p = rem / sk.cd; txt = String(Math.ceil(rem)); } }
    const off = !!(!run || blocked || (sk.lb && sim.lb < 1) || (sk.melee && far) || (sk.gcd && !sk.raise && !b) || (sk.raise && !raiseTarget(sim, pc, S.target)));
    const q = !!(pc.queued && pc.queued.id === sl.id);
    const due = !!(sk.lb && run && sim.phase.lbDue && sim.phase.lbDue(sim, pc.slot));   // 輪到你用極限技（P4 拉哈布雷亞）
    const key = `${p.toFixed(2)}|${txt}|${off}|${q}|${due}`;
    if (key === sl.key) continue;
    sl.key = key;
    sl.cd.style.setProperty('--p', p.toFixed(3)); sl.ct.textContent = txt;
    sl.el.classList.toggle('off', off); sl.el.classList.toggle('q', q); sl.el.classList.toggle('due', due);
  }
  const k = pc.cast, ck = k ? `${k.id}|${k.tg}|${Math.min(1, (t - k.t0) / (k.t1 - k.t0)).toFixed(3)}` : '';
  if (ck !== hot.castKey) {
    const el = $('mycast');
    el.classList.toggle('show', !!k); el.classList.toggle('raise', !!k && k.id === 'raise');
    if (k) {
      $('mycast-nm').textContent = SKILLS[k.id].name + (k.id === 'raise' && k.tg >= 0 ? ` → ${ROLES[k.tg].key}` : '') + `　${Math.max(0, k.t1 - t).toFixed(1)}`;
      $('mycast-bar').style.width = (Math.min(1, (t - k.t0) / (k.t1 - k.t0)) * 100).toFixed(1) + '%';
    }
    hot.castKey = ck;
  }
  const lk = sim.lb.toFixed(2);
  if (lk !== hot.lbKey) {
    $('lbbar').querySelectorAll('i').forEach((el, i) => {
      const f = Math.max(0, Math.min(1, sim.lb - i));
      el.firstChild.style.width = (f * 100).toFixed(0) + '%'; el.classList.toggle('full', f >= 1);
    });
    hot.lbKey = lk;
  }
}

let lastCastHtml = '', lastFeedHtml = '', lastNextHtml = '', lastMyHtml = '', lastBanner = '', lastFlash = null;
const hud = { timer: '', charge: '', solo: null, me: null, meHw: '', meHc: null, raise: null, raiseHint: null };
function updateHud() {
  const sim = S.sim;
  // 只有數值改變時才寫入 DOM（每幀改 DOM 會觸發版面重算，造成掉幀）
  const tm = fmtTime(S.offset + sim.t);
  if (tm !== hud.timer) { $('timer').textContent = tm; hud.timer = tm; }
  const chk = sim.charges + (sim.woken ? 'w' : '');
  if (chk !== hud.charge) {
    const ch = $('charge');
    ch.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < sim.charges));
    ch.classList.toggle('woken', sim.woken);
    ch.querySelector('span').textContent = sim.woken ? '覺醒' : '充能';
    hud.charge = chk;
  }

  // 全體攻擊閃光：沒有閃光時整層不顯示（全畫面圖層每幀合成很吃效能）
  const sf = sim.screenFx[sim.screenFx.length - 1];
  const fop = sf ? Math.max(0, 0.7 * sf.power * (1 - (sim.t - sf.t) / 0.7)) : 0;
  const fs = fop > 0.005 ? fop.toFixed(2) : '';
  if (fs !== lastFlash) {
    const el = $('flash');
    el.style.display = fs ? 'block' : 'none';
    if (fs) el.style.opacity = fs;
    lastFlash = fs;
  }

  const solo = S.party === 'solo';
  if (solo !== hud.solo) { $('party').classList.toggle('hide', solo); hud.solo = solo; }
  // 你自己（左上）
  const pc = sim.pc;
  const mw = (pc.alive ? Math.round(pc.hp) : 0) + '%', mc = pc.hp > 50 ? '' : pc.hp > 25 ? '#e6c84a' : '#e5584d';
  if (mw !== hud.meHw) { $('me-hp').style.width = mw; hud.meHw = mw; }
  if (mc !== hud.meHc) { $('me-hp').style.background = mc; hud.meHc = mc; }
  const meSt = pc.alive ? 'a' : pc.planned ? 'p' : 'd';
  if (meSt !== hud.me) { $('me').classList.toggle('dead', !pc.alive); $('me-name').textContent = ROLES[pc.slot].name + (pc.alive ? '' : pc.planned || sim.keepGoing ? '（倒地・等復活）' : '（陣亡）'); hud.me = meSt; }
  // 接受復活按鈕（自殺流的計畫倒地另外提示起身時機）
  const canRaise = S.phase === 'running' && !pc.alive && !!pc.raise;
  const rh = !canRaise ? '' : !pc.planned ? `${ROLES[pc.raise.by].key} 復活了你：起身後 5 秒無敵`
    : pc.slot === 6 && sim.t > 60 ? '收到 C 的復活：馬上起身' : sim.t < 50.2 ? '先別起身：等三顆石牢形成（0:50 之後）' : sim.t <= 55.5 ? '現在可以起身（三牢已形成，踩地板前）' : '踩地板開始了，盡快起身';
  if (canRaise !== hud.raise) { $('raise').classList.toggle('show', canRaise); hud.raise = canRaise; }
  if (rh !== hud.raiseHint) { $('raise-hint').textContent = S.mode === 'guide' || !pc.planned ? rh : ''; hud.raiseHint = rh; }
  updateHotbar(sim);
  const my = pc.alive ? myStatusHtml(sim.statusesOf(pc), sim.t) : '';
  if (my !== lastMyHtml) { $('mystatus').innerHTML = my; lastMyHtml = my; }
  // 隊友
  if (!solo) sim.chars.forEach((c, i) => {
    const row = partyRows[i];
    if (!row) return;
    if (c.alive !== row.dead) { row.el.classList.toggle('dead', !c.alive); row.dead = c.alive; }
    const hw = (c.alive ? Math.round(c.hp) : 0) + '%', hc = c.hp > 50 ? '' : c.hp > 25 ? '#e6c84a' : '#e5584d';
    if (hw !== row.hw) { row.hp.style.width = hw; row.hw = hw; }
    if (hc !== row.hc) { row.hp.style.background = hc; row.hc = hc; }
    const html = c.alive ? statusIcons(sim.statusesOf(c), sim.t) : deadHtml(sim, c);
    if (html !== row.html) { row.st.innerHTML = html; row.html = html; }
    const k = c.cast, ck = k ? `${k.id}|${Math.min(1, (sim.t - k.t0) / (k.t1 - k.t0)).toFixed(2)}` : '';
    if (ck !== row.cbKey) {
      row.cb.classList.toggle('on', !!k); row.cb.classList.toggle('raise', !!k && k.id === 'raise');
      if (k) row.cbi.style.width = (Math.min(1, (sim.t - k.t0) / (k.t1 - k.t0)) * 100).toFixed(0) + '%';
      row.cbKey = ck;
    }
  });

  let ch_html = '';
  for (const c of sim.activeCasts().slice(-3)) {
    const p = Math.max(0, Math.min(1, (sim.t - c.t0) / (c.t1 - c.t0)));
    ch_html += `<div class="cast${p >= 1 ? ' done' : ''}"><div class="nm"><span>${c.who}</span><b>${c.name}</b></div><div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div></div>`;
  }
  if (S.phase === 'ready') ch_html = '';
  if (ch_html !== lastCastHtml) { $('casts').innerHTML = ch_html; lastCastHtml = ch_html; }

  const assist = S.mode === 'guide';
  const lines = sim.feed.filter((f) => sim.t - f.t < 7 && sim.t >= f.t && (assist || !f.hint) && (!solo || f.slot === -1 || f.slot === sim.playerSlot)).slice(-3);
  const fh = lines.map((f) => `<div class="${f.slot === sim.playerSlot ? 'me' : ''}${/死亡/.test(f.text) ? ' bad' : ''}">${f.text}</div>`).join('');
  if (fh !== lastFeedHtml) { $('feed').innerHTML = fh; lastFeedHtml = fh; }

  if (assist || !pc.alive) {
    const cur = sim.guide.cur, pc = sim.pc;
    if (!pc.alive && !pc.planned) {   // 繼續打：倒地等復活
      $('g-title').textContent = sim.keepGoing ? '倒地：等待復活' : '陣亡';
      $('g-tip').textContent = !sim.keepGoing ? '' : pc.raise ? `${ROLES[pc.raise.by].key} 已經復活你：按 F（或畫面上的按鈕）起身，起身後 5 秒無敵，先回到自己的位置。`
        : '等補師／C 復活你（AI 補師會自動救人）。可以看看隊友的處理。';
    } else if (!pc.alive && pc.planned) {   // 自殺流倒地中
      $('g-title').textContent = '倒地（照自殺流）：等待復活';
      $('g-tip').textContent = pc.raise
        ? `${ROLES[pc.raise.by].key} 已經復活你。${pc.slot === 6 ? '收到就按 F 起身，回到人群。' : '三顆石牢形成後（0:50）～開始踩地板前（0:55）按 F 起身，起身後先普通移動到泰坦旁集合。'}`
        : '照分配等隊友復活（H1→OT、H2→M1、C→M2、C 10 秒詠唱→R）；收到後先別起身。';
    } else {
      $('g-title').textContent = cur ? `${cur.title}${cur.frame ? '（攻略 ' + cur.frame + '）' : ''}` : '準備';
      $('g-tip').textContent = cur ? (cur.tip || '') : '按 Space 開始。黃色虛線圈是建議站位；1～7 使用技能。';
    }
    let nh = '';
    const nx = sim.guide.next;
    if (nx && nx.t > sim.t) nh += `<div><b>${(nx.t - sim.t).toFixed(1)}s</b><span>下一個站位：${nx.title}</span></div>`;
    const cues = (sim.phase.cuesFor ? sim.phase.cuesFor(sim.variant) : sim.phase.cues).filter((c) => c[0] > sim.t - 0.3 && c[0] < sim.t + 14).slice(0, 3);
    for (const c of cues) nh += `<div><b>${Math.max(0, c[0] - sim.t).toFixed(1)}s</b><span class="cue">${c[1]}</span></div>`;
    if (nh !== lastNextHtml) { $('g-next').innerHTML = nh; lastNextHtml = nh; }
  }

  let bh = '';
  if (isGuest()) {
    if (!N.mirror) bh = '<div class="mid">等待房主…</div>';
    else if (S.phase === 'ready') bh = `<div class="mid">${N.spectate ? '觀戰中' : ROLES[S.role].name}</div><div class="sm">等待房主 ${escapeHtml(memberName(N.host))} 開始</div>`;
    else if (S.phase === 'paused') bh = '<div class="mid">房主暫停中</div>';
    else if (S.phase === 'running' && sim.t < 0) bh = `<div class="big">${Math.ceil(-sim.t)}</div>`;
    else if (S.phase === 'ended' && S.dismissed) bh = '<div class="mid">等待房主開始下一局</div>';
  } else if (S.phase === 'ready') {
    const where = fullMode() ? `完整體驗（${FULL_CHAIN.map(phaseTag).join('→')}）・起點：${cpList()[S.cp].label}` : `${PH().name}・起點：${PH().checkpoints[S.cp].name}`;
    bh = `<div class="mid">${ROLES[S.role].name}</div><div class="sm">${where}</div><button class="btn primary bn-start" data-act="start">開始${sim.t < 0 ? '（' + (-sim.t) + ' 秒倒數）' : ''}</button><div class="sm">或按 Space</div>`;
  } else if (S.phase === 'paused') bh = '<div class="mid">已暫停</div><div class="sm">按 Space 繼續</div>';
  else if (S.phase === 'running' && sim.t < 0) bh = `<div class="big">${Math.ceil(-sim.t)}</div>`;
  else if (S.phase === 'ended' && S.dismissed) bh = `<div class="mid">${sim.status === 'cleared' ? '成功' : '失敗'}</div><div class="sm">按 R 重來・N 換隨機</div>`;
  if (bh !== lastBanner) { $('banner').innerHTML = bh; lastBanner = bh; }
}

/** 結算的技能區：GCD 使用率、死刑／大範圍攻擊的減傷時機、倒地與復活、極限技。 */
function skillHtml(k) {
  const li = [];
  const cnt = (a) => a.filter((x) => x.ok).length;
  if (k.uptime !== null) li.push(`<li class="info">GCD 使用率 ${k.uptime}%${k.interrupts ? `（讀條被打斷 ${k.interrupts} 次）` : ''}</li>`);
  else if (k.interrupts) li.push(`<li class="info">讀條被打斷 ${k.interrupts} 次</li>`);
  if (k.busters.length) {
    const miss = k.busters.filter((x) => !x.ok).map((x) => `${fmtTime(x.t)} ${x.name.replace(/（.*/, '')}`);
    li.push(`<li class="${miss.length ? 'no' : ''}">死刑有開減傷／無敵：${cnt(k.busters)}/${k.busters.length}${miss.length ? `（沒開：${miss.join('、')}）` : ''}</li>`);
  }
  if (k.raids.length) li.push(`<li class="info">大範圍攻擊有團隊減傷覆蓋（全隊）：${cnt(k.raids)}/${k.raids.length}</li>`);
  if (k.deaths) li.push(`<li class="no">倒地 ${k.deaths} 次${k.raisedBy.length ? '，被 ' + k.raisedBy.map((r) => `${r.lb ? r.by + ' 的 LB3' : r.by}（${fmtTime(r.t)}）`).join('、') + ' 救起' : ''}</li>`);
  if (k.raises.length) li.push(`<li class="info">復活了 ${k.raises.map((r) => `${r.who}（${fmtTime(r.t)}）`).join('、')}</li>`);
  if (k.lb) li.push(`<li class="info">使用極限技 ${k.lb} 次</li>`);
  return li.length ? '<h5>技能</h5><ul>' + li.join('') + '</ul>' : '';
}
function recordHtml(rec, rl, heading) {
  let h = `<h5>${heading}</h5><ul>` + rec.objectives.map((o) => `<li class="${o.ok ? '' : 'no'}">${o.text}</li>`).join('') + '</ul>';
  if (rec.skills) h += skillHtml(rec.skills);
  if (rec.hits.length) h += '<h5>受到的傷害／失誤</h5><ul>' + rec.hits.map((n) => `<li class="no">${fmtTime(n.t)}　${n.text}</li>`).join('') + '</ul>';
  h += '<h5>本局隨機</h5><p class="note">' + rec.roll.join('<br>') + '</p>';
  return h;
}
/** 結算卡片（單機、房主、隊員共用）。r：{ ok, full, total, phaseName, pid, fail, recs }；slot：看誰的檢查。 */
function resultHtml(r, slot) {
  const rl = ROLES[slot];
  let h;
  const deaths = r.recs.reduce((n, x) => n + (x.skills ? x.skills.deaths : 0), 0);
  const dn = r.ok && deaths ? `（你倒地 ${deaths} 次）` : '';
  if (r.full) h = `<h2 class="${r.ok ? 'ok' : 'bad'}">${r.ok ? `完整體驗通過${dn}（${FULL_CHAIN.map(phaseTag).join('→')}）` : `失敗：${r.phaseName}`}</h2><p class="note">總時間 ${fmtTime(r.total)}</p>`;
  else h = `<h2 class="${r.ok ? 'ok' : 'bad'}">${r.ok ? `成功：${r.phaseName} 通過${dn}` : '失敗'}</h2>`;
  if (!r.ok && r.fail) {
    const f = r.fail, who = f.slot < 0 ? '隊伍' : (f.slot === slot ? '你（' + rl.key + '）' : '隊友 ' + ROLES[f.slot].key + (netOn() && slotOwner(f.slot) ? `（${escapeHtml(memberName(slotOwner(f.slot)))}）` : ''));
    h += `<p class="why">${r.full ? phaseTag(r.pid) + ' ' : ''}${fmtTime(Math.max(0, f.t))}・${who}：${f.cause}</p>`;
  }
  for (const rec of r.recs) h += recordHtml(rec, rl, r.full ? `${rec.name}：${rl.name} 的檢查` : `${rl.name} 的檢查`);
  return h;
}
function showResult() {
  const sim = S.sim, ok = sim.status === 'cleared', full = fullMode();
  sfx.play(ok ? 'clear' : 'fail');
  const r = { ok, full, total: S.offset + sim.t, phaseName: sim.phase.name, pid: curPid(), fail: sim.failure, recs: S.chainLog.map((x) => x[S.role]).concat([phaseRecord(sim, S.role)]) };
  if (isHost()) sendEnd(r);
  let h = resultHtml(r, S.role);
  h += '<div class="btns"><button class="btn primary" id="r-new">再來一次（新的隨機）</button><button class="btn" id="r-again">同一組重來</button>';
  const nextId = PHASE_ORDER[PHASE_ORDER.indexOf(S.pid) + 1];
  if (ok && !full && nextId) h += `<button class="btn" id="r-next">下一階段：${PHASES[nextId].name}</button>`;
  let retry = -1;
  if (!ok && sim.failure) {
    cpList().forEach((c, i) => { if (c.ci === S.ci && c.t <= sim.failure.t - 1) retry = i; });
    if (retry >= 0 && retry !== S.cp) h += `<button class="btn" id="r-cp">從失敗前的檢查點重試</button>`;
    else retry = -1;
  }
  h += '<button class="btn" id="r-close">看場景</button></div>';
  $('card').innerHTML = h;
  $('overlay').classList.add('show');
  $('r-again').onclick = () => newRun(S.seed);
  $('r-new').onclick = () => newRun(randSeed());
  $('r-close').onclick = () => { S.dismissed = true; $('overlay').classList.remove('show'); };
  const rn = $('r-next');
  if (rn) rn.onclick = () => { S.pid = nextId; S.cp = 0; rebuildCp(); newRun(randSeed()); };
  const rc = $('r-cp');
  if (rc) rc.onclick = () => { S.cp = retry; newRun(S.seed); };
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
// 幀率顯示（每 0.5 秒更新；最慢一幀超過 40ms 時一併顯示）
const fpsMeter = { t0: 0, n: 0, worst: 0, text: '' };
function meterFps(now, rawDt) {
  if (!fpsMeter.t0) fpsMeter.t0 = now;
  fpsMeter.n++; fpsMeter.worst = Math.max(fpsMeter.worst, rawDt);
  if (now - fpsMeter.t0 < 500) return;
  const fps = fpsMeter.n * 1000 / (now - fpsMeter.t0);
  const text = `FPS ${Math.round(fps)}` + (fpsMeter.worst > 40 ? `・最慢 ${Math.round(fpsMeter.worst)}ms` : '');
  if (text !== fpsMeter.text) { $('fps').textContent = text; fpsMeter.text = text; $('fps').classList.toggle('bad', fps < 45 || fpsMeter.worst > 40); }
  fpsMeter.t0 = now; fpsMeter.n = 0; fpsMeter.worst = 0;
}

/** 一幀：推進模擬（固定步長）＋繪製。now 為 requestAnimationFrame 的時間戳。 */
function tick(now) {
  meterFps(now, now - last);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.held) trySkill(S.held, false);   // 按住 GCD 鍵：冷卻快好時自動排隊
  if (isGuest()) { guestTick(now, dt); audioTick(); }
  else if (S.phase === 'running' && !document.hidden) {
    S.acc = Math.min(0.25, S.acc + dt * (S.mode === 'guide' && !netOn() ? S.speed : 1));   // 連線時固定 1 倍速
    let n = 0;
    while (S.acc >= STEP && n < 15) {
      const sim = S.sim;
      sim.input = readInput();
      sim.step(STEP);
      S.acc -= STEP; n++;
      if (sim.status === 'cleared' && fullMode() && S.ci < FULL_CHAIN.length - 1) { audioTick(); advanceChain(); continue; }
      if (sim.status !== 'running') break;
    }
    audioTick();
    if (S.sim.status !== 'running') { S.phase = 'ended'; syncSide(); showResult(); }
  }
  if (isHost()) netHostTick(now);
  const sim = S.sim;
  const alpha = isGuest() ? Math.min(1, N.acc / STEP) : S.phase === 'running' && sim.status === 'running' ? Math.min(1, S.acc / STEP) : 1;
  const o = { assist: S.mode === 'guide', solo: S.party === 'solo', mini: S.view === 'both', pid: curPid(), now, alpha, wm };
  if (S.view !== '3d' && r2d) r2d.draw(sim, o);
  if (S.view !== '2d' && r3d) r3d.render(sim, o);
  updateHud();
}
function frame(now) { tick(now); requestAnimationFrame(frame); }

// ------------------------------------------------------------------ input
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'SELECT' || tag === 'INPUT') return;
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === 'escape' && wm.tool) { setWmTool(null); return; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { S.keys.add(k); e.preventDefault(); return; }
  if (k === ' ') { e.preventDefault(); if (!e.repeat) startPause(); }
  else if (k === 'r') { if (hostOk()) newRun(S.seed); }
  else if (k === 'n') { if (hostOk()) newRun(randSeed()); }
  else if (k === 'v') { const order = ['2d', '3d', 'both']; setView(order[(order.indexOf(S.view) + 1) % 3]); }
  else if (k === 'p') toggleDemo();
  else if (k === 'h') togglePanel();
  else if (k === 'f') acceptRaise();
  else if (k === 'g') giveUp();
  else if (/^[1-9]$/.test(k) && +k <= LOADOUT[S.role].length) {   // 技能列
    e.preventDefault();
    const id = LOADOUT[S.role][+k - 1];
    if (!e.repeat) trySkill(id, true);
    S.held = SKILLS[id].gcd ? id : null;
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  S.keys.delete(k); if (e.key === ' ') e.preventDefault();
  if (/^[1-9]$/.test(k)) S.held = null;
});
window.addEventListener('blur', () => { S.keys.clear(); S.held = null; });
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });

// 放標點：點 2D 地圖／小地圖／3D 地面（攔在轉鏡頭之前）
stage.addEventListener('pointerdown', (e) => {
  if (!wm.tool) return;
  if (e.button === 2) { setWmTool(null); return; }
  const id = e.target.id;
  if (e.button !== 0 || (id !== 'c2d' && id !== 'c3d')) return;
  e.stopPropagation();
  const p = id === 'c2d' ? r2d.screenToWorld(e.clientX, e.clientY) : r3d.groundAt(e.clientX, e.clientY);
  if (p) useWmTool(p);
}, { capture: true });

let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (S.view === '2d' || e.target.closest('#overlay, button')) return;
  if (S.view === 'both' && e.target.id === 'c2d') return;
  drag = { x: e.clientX, y: e.clientY };
  stage.classList.add('dragging');
  try { stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
});
stage.addEventListener('pointermove', (e) => {
  if (!drag || !r3d) return;
  r3d.orbit(-(e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.005);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = () => { drag = null; stage.classList.remove('dragging'); };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('wheel', (e) => {
  if (S.view === '2d' || !r3d) return;
  e.preventDefault();
  r3d.zoom(Math.sign(e.deltaY));
}, { passive: false });

// ------------------------------------------------------------------ boot
r2d = new window.Renderer2D($('c2d'));
try { r3d = new window.Renderer3D($('c3d')); } catch (err) {
  r3d = null;
  document.querySelectorAll('#seg-view button').forEach((b) => { if (b.dataset.v !== '2d') { b.disabled = true; b.title = '此瀏覽器無法使用 WebGL'; } });
}
buildSide();
buildWaymarks();
buildCamSettings();
buildQualitySetting();
buildAudioSettings();
buildNet();
new ResizeObserver(resizeAll).observe(stage);
S.seed = randSeed();
newRun(S.seed);
syncSide();
resizeAll();
requestAnimationFrame(frame);

window.__uwu = { S, N, netConnect, netLeave, wm, setWmTool, useWmTool, acceptRaise, trySkill, setTarget, giveUp, tick, newRun, setView, startPause, toggleDemo, rebuildCp, advanceChain, sfx, get sim() { return S.sim; }, get r3d() { return r3d; }, get r2d() { return r2d; }, readInput };
})();
