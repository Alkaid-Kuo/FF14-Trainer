/* 技能：每個職位的技能列（GCD、讀條、冷卻、衝刺、防擊退、減傷、復活、極限技），以及 AI 隊友用技能
   （自動復活、接受復活、團隊減傷、坦克減傷、補師 LB3、補師／D4 的攻擊讀條）。
   減傷只檢查使用時機（傷害不致死）；防擊退真的會擋掉擊退；衝刺真的加速。 */
(function (root) {
'use strict';
const U = root.UWU;
const { Sim, ROLES, dist, isTank, MT, OT, H1, H2, D1, D2, D3, D4 } = U;

const GCD = 2.5;
const SLIDE = 0.5;                       // 讀條最後 0.5 秒可以移動（滑步）
const RAISE_CAST = 8, RAISE_CAST_C = 10; // 補師 8 秒；D4（赤魔）10 秒
const MELEE = 3;                         // 近戰距離：Boss 目標圈外 3 碼
const RAISE_RANGE = 30;
const LB_RATE = 1 / 50;                  // 極限技量表：開打後每 50 秒一格，最多 3 格
const AI_RAISE_DELAY = 2.5;              // AI 補師在有人倒地多久後開始救
const AI_ACCEPT_DELAY = 1.5;             // AI 收到復活多久後起身

const SKILLS = {
  atk: { name: '攻擊', short: '攻擊', gcd: true, melee: true, tip: '近戰 GCD：要站在 Boss 身邊（目標圈外 3 碼內）' },
  shot: { name: '攻擊', short: '攻擊', gcd: true, tip: '遠程 GCD（瞬發）' },
  spell: { name: '詠唱攻擊', short: '詠唱', gcd: true, cast: 1.5, tip: '讀條 1.5 秒；讀條中移動會中斷（最後 0.5 秒可以滑步）' },
  raise: { name: '復活', short: '復活', gcd: true, raise: true, tip: '讀條 8 秒（D4 為 10 秒），先開即刻詠唱可瞬發；目標：點隊伍列表或場上的角色選，沒選就救最近的倒地者' },
  swift: { name: '即刻詠唱', short: '即刻', cd: 60, self: 'swift', dur: 10, tip: '下一個讀條技能變瞬發' },
  sprint: { name: '衝刺', short: '衝刺', cd: 60, self: 'sprint', dur: 10, tip: '移動速度 +30%，10 秒' },
  arms: { name: '親疏自行', short: '防擊退', cd: 120, self: 'antikb', dur: 6, tip: '6 秒內不會被擊退' },
  sure: { name: '沉穩詠唱', short: '防擊退', cd: 120, self: 'antikb', dur: 6, tip: '6 秒內不會被擊退' },
  mit: { name: '減傷', short: '減傷', cd: 90, self: 'mit', dur: 20, tip: '自身減傷 20 秒（死刑前開）' },
  inv: { name: '無敵', short: '無敵', cd: 240, self: 'invuln', dur: 10, tip: '無敵 10 秒（死刑前開）' },
  reprisal: { name: '雪仇', short: '雪仇', cd: 60, party: 'reprisal', dur: 10, tip: '團隊減傷 10 秒（大範圍攻擊前開）' },
  pmit: { name: '群體減傷', short: '團減', cd: 120, party: 'pmit', dur: 15, tip: '團隊減傷 15 秒（大範圍攻擊前開）' },
  troub: { name: '團隊減傷', short: '團減', cd: 120, party: 'troub', dur: 15, tip: '團隊減傷 15 秒（大範圍攻擊前開）' },
  feint: { name: '牽制', short: '牽制', cd: 90, party: 'feint', dur: 10, tip: '團隊減傷 10 秒（大範圍攻擊前開）' },
  addle: { name: '昏亂', short: '昏亂', cd: 90, party: 'addle', dur: 10, tip: '團隊減傷 10 秒（大範圍攻擊前開）' },
  lb: { name: '極限技', short: 'LB', lb: true, tip: '坦克：全隊減傷；補師：LB3 全員復活；DPS：大量傷害（量表每 50 秒一格）' },
};
const SKILL_IDS = Object.keys(SKILLS);
const TANK_KIT = ['atk', 'mit', 'inv', 'reprisal', 'arms', 'sprint', 'lb'];
const HEAL_KIT = ['spell', 'raise', 'swift', 'pmit', 'sure', 'sprint', 'lb'];
const MELEE_KIT = ['atk', 'feint', 'arms', 'sprint', 'lb'];
/** 各職位的技能列（依 slot）。 */
const LOADOUT = [TANK_KIT, TANK_KIT, HEAL_KIT, HEAL_KIT, MELEE_KIT, MELEE_KIT,
  ['shot', 'troub', 'arms', 'sprint', 'lb'], ['spell', 'raise', 'swift', 'addle', 'sure', 'sprint', 'lb']];
const RAISERS = [H1, H2, D4];
/** 極限技的種類（依職位）。 */
const LB_KIND = ['tank', 'tank', 'healer', 'healer', 'melee', 'melee', 'ranged', 'caster'];
const LB_NAME = { tank: '坦克', healer: '治療', melee: '近戰', ranged: '遠程', caster: '法系' };
/** AI 輪流開團隊減傷的順序。 */
const MIT_ORDER = [[D3, 'troub'], [H1, 'pmit'], [H2, 'pmit'], [D4, 'addle'], [D1, 'feint'], [D2, 'feint'], [MT, 'reprisal'], [OT, 'reprisal']];
const SELF_MIT = ['mit', 'invuln', 'lbtank'];

// ---------------------------------------------------------------- 檢查（Sim 與連線的 Mirror 都能用）
const castTime = (slot, id) => (SKILLS[id].raise ? (slot === D4 ? RAISE_CAST_C : RAISE_CAST) : (SKILLS[id].cast || 0));
/** 可以攻擊的目標（看得到、可選取；階段的 bossLook 可以是多種）。from：取離這個位置最近的。 */
/** 目標圈半徑（Boss 體型）：主要 Boss 用階段的 bossR，P4 的小怪另外給。 */
const HITBOX = { bit: 1.2, lahabrea: 1.6 };
const hitboxR = (sim, a) => HITBOX[a.look] || sim.phase.bossR || 3;
/** 可以選中的 Boss（依 phase.bossLook）。 */
function bossList(sim) {
  const looks = [].concat(sim.phase.bossLook);
  return sim.actors.filter((a) => looks.includes(a.look) && !a.dead && a.visible && a.targetable);
}
/** 攻擊對象：指定的 Boss（id，還能選中時）優先，否則離 from 最近的 Boss。 */
function bossOf(sim, from, id) {
  const list = bossList(sim);
  if (id !== undefined && id !== null) { const b = list.find((a) => a.id === id); if (b) return b; }
  if (!from || list.length < 2) return list[0] || null;
  return list.sort((a, b) => dist(a.pos, from) - dist(b.pos, from))[0];
}
const meleeReach = (sim) => (sim.phase.bossR || 3) + MELEE;
/** 復活目標：指定的人（倒地、還沒被救、沒人正在救）優先，否則最近的倒地者。 */
function raiseTarget(sim, c, tg) {
  const ok = (d) => d !== c && !d.alive && !d.raise && dist(d.pos, c.pos) <= RAISE_RANGE
    && !sim.chars.some((r) => r !== c && r.cast && r.cast.id === 'raise' && r.cast.tg === d.slot);
  if (tg !== undefined && tg !== null && tg >= 0 && ok(sim.chars[tg])) return sim.chars[tg];
  return sim.chars.filter(ok).sort((a, b) => dist(a.pos, c.pos) - dist(b.pos, c.pos))[0] || null;
}
/** 能不能用（不改變狀態）。回傳 {} 表示可以；否則 why＝原因（'' 表示不用提示），gcdWait＝GCD 還要等幾秒。 */
function skillCheck(sim, slot, id, tg, bt) {
  const c = sim.chars[slot], sk = SKILLS[id];
  if (!LOADOUT[slot].includes(id)) return { why: '沒有這個技能' };
  if (sim.t < 0) return { why: '還沒開打' };
  if (!c.alive) return { why: '倒地中不能使用技能' };
  if (sim.t < c.stunUntil) return { why: c.stunUntil > 900 ? '被關在石牢裡' : '暈眩中' };
  if (c.cast) return { why: '' };
  if (sk.lb) return sim.lb < 1 ? { why: '極限技量表不足' } : {};
  if (sk.gcd) {
    if (sim.t < c.gcdUntil) return { why: '', gcdWait: c.gcdUntil - sim.t };
    if (sk.raise) return raiseTarget(sim, c, tg) ? {} : { why: '沒有可以復活的對象' };
    const b = bossOf(sim, c.pos, bt);
    if (!b) return { why: '沒有可以攻擊的目標' };
    if (sk.melee && dist(b.pos, c.pos) > meleeReach(sim)) return { why: '距離太遠：近戰要站在 Boss 身邊' };
    return {};
  }
  const ready = c.cd[id] || 0;
  if (sim.t < ready) return { why: `${sk.name}冷卻中（${Math.ceil(ready - sim.t)} 秒）` };
  return {};
}
const usable = (sim, slot, id, tg) => skillCheck(sim, slot, id, tg).why === undefined;

// ---------------------------------------------------------------- 模擬
const P = Sim.prototype;
P.initSkills = function (opts) {
  this.lb = opts.lb || 0;
  this.raids = []; this.aiQ = []; this.aiT = 0; this.wipeT = null; this.softFail = null;
  this.lbLog = [];   // 極限技使用紀錄：{ t, slot, kind, lv }（P4 拉哈布雷亞要特定種類的 LB3）
  // 完整體驗接續上一階段的冷卻：carry 是剩餘秒數，換成這一階段的時鐘（這一階段從倒數 this.t 開始）
  if (opts.carry) opts.carry.forEach((cd, i) => { const o = {}; for (const k of Object.keys(cd)) o[k] = cd[k] + this.t; this.chars[i].cd = o; });
};
P.speedMul = function (c) { return this.hasStatus(c.slot, 'sprint') ? 1.3 : 1; };
P.canRaise = (slot) => LOADOUT[slot].includes('raise');
P.boss = function () { return bossOf(this); };
/** 讀條中算不算在移動（被擊退也算）。 */
P.isMoving = function (c) {
  if (c.kb && this.t < c.kb.until) return true;
  if (c.remote) return this.t - c.netMoveT < 0.15;
  return c.walk > 0.3;
};
/** 使用技能。回傳 {}＝成功、{ queued }＝排進 GCD 佇列、否則 { why }。 */
P.useSkill = function (slot, id, tg, bt) {
  if (this.status !== 'running') return { why: '' };
  const c = this.chars[slot], sk = SKILLS[id];
  const chk = skillCheck(this, slot, id, tg, bt);
  if (chk.why !== undefined) {
    if (chk.gcdWait !== undefined && chk.gcdWait <= 0.5) { c.queued = { id, tg, bt }; return { queued: true }; }
    return chk;
  }
  if (sk.lb) { this.useLB(c); return {}; }
  if (sk.gcd) {
    let ct = castTime(slot, id);
    const target = sk.raise ? raiseTarget(this, c, tg) : null, tgs = target ? target.slot : -1;
    if (ct && this.hasStatus(slot, 'swift')) { this.removeStatus(slot, 'swift'); ct = 0; }
    c.gcdUntil = this.t + Math.max(GCD, ct);
    c.queued = null;
    if (ct) c.cast = { id, t0: this.t, t1: this.t + ct, tg: tgs, ai: !!c.auto };
    else this.skillDone(c, id, tgs, GCD);
    return {};
  }
  c.cd[id] = this.t + sk.cd;
  c.stats.used[id] = (c.stats.used[id] || 0) + 1;
  if (sk.self) this.addStatus(slot, sk.self, sk.dur);
  if (sk.party) for (const o of this.chars) if (o.alive) this.addStatus(o.slot, sk.party, sk.dur);
  return {};
};
/** GCD 技能生效（瞬發或讀條完成）。busy：這個 GCD 佔用的時間（算 GCD 使用率）。 */
P.skillDone = function (c, id, tg, busy) {
  c.stats.busy += busy;
  c.stats.used[id] = (c.stats.used[id] || 0) + 1;
  if (id !== 'raise') return;
  const d = this.chars[tg];
  if (!d || d.alive || d.raise) { this.log(`${c.key} 的復活沒有對象（已經起身或已被救）`, c.slot); return; }
  d.raise = { by: c.slot, t: this.t };
  c.stats.raises.push({ t: this.t, slot: tg });
  this.log(`${c.key} 復活 ${d.key}`, tg);
};
/** AI 要用別的技能時，先放棄攻擊讀條。 */
P.aiFree = function (c) { if (c.cast && c.cast.ai && c.cast.id === 'spell') { c.cast = null; c.gcdUntil = this.t; } };
/** 接受復活（玩家按 F、AI 自動）。自殺流的計畫倒地交給階段判斷時機。 */
P.acceptRaise = function (slot) {
  const c = this.chars[slot];
  if (c.alive || !c.raise || this.status !== 'running') return false;
  if (c.planned && this.s.accept) return this.s.accept(slot);
  this.raiseUp(c);
  return true;
};
/** 起身：HP 30%、5 秒無敵、衰弱（只顯示）。 */
P.raiseUp = function (c) {
  const by = c.raise.by, t = this.t;
  this.revive(c, 30);
  c.invulnUntil = t + 5; this.addStatus(c.slot, 'transcendent', 5); this.addStatus(c.slot, 'weak', 100);
  c.stats.raisedBy.push({ t, by });
};
P.useLB = function (c) {
  const lv = Math.min(3, Math.floor(this.lb + 1e-6)), kind = LB_KIND[c.slot], t = this.t;
  this.lb -= lv;
  this.lbLog.push({ t, slot: c.slot, kind, lv });
  c.stats.used.lb = (c.stats.used.lb || 0) + 1;
  this.screenFx.push({ t, type: 'lb', power: 0.4 + lv * 0.2 });
  this.floats.push({ slot: c.slot, t, text: `LB${lv}`, lb: true });
  if (kind === 'tank') {
    for (const o of this.chars) if (o.alive) this.addStatus(o.slot, 'lbtank', [0, 8, 10, 12][lv]);
    this.log(`${c.key}：坦克極限技 LB${lv}（全隊減傷）`, c.slot);
  } else if (kind === 'healer') {
    let n = 0;
    if (lv >= 3) {
      for (const d of this.chars) {
        if (d.alive) continue;
        this.revive(d, 100, true); n++;
        d.invulnUntil = t + 5; this.addStatus(d.slot, 'transcendent', 5);
        d.stats.raisedBy.push({ t, by: c.slot, lb: true });
      }
    }
    for (const o of this.chars) if (o.alive) o.hp = Math.min(100, o.hp + [0, 30, 60, 100][lv]);
    if (lv >= 3) this.statuses = this.statuses.filter((x) => x.id !== 'doom');   // 治療 LB3 解除死亡宣告
    this.log(`${c.key}：治療極限技 LB${lv}${n ? `（${n} 人復活）` : '（全隊回復）'}`, c.slot);
  } else this.log(`${c.key}：${LB_NAME[kind]}極限技 LB${lv}（大量傷害）`, c.slot);
};
/** 機制預告（給 AI 用減傷）：kind 'raid'＝大範圍攻擊、'buster'＝死刑；tRes 判定時間；who()：死刑對象（預設主坦）。 */
P.expect = function (kind, tRes, label, who) {
  if (kind === 'raid') {
    this.aiQ.push({ t: Math.max(this.t, tRes - 4), fn: () => {
      if (this.partyMitOn()) return;
      for (const [slot, id] of MIT_ORDER) {
        const c = this.chars[slot];
        if (!c.auto || !c.alive || (c.cd[id] || 0) > this.t) continue;
        if (this.phase.mitReserve && this.phase.mitReserve(this, slot, id)) continue;   // 留給之後的機制（例如 P4 火神爆裂的群盾）
        this.aiFree(c);
        if (usable(this, slot, id)) { this.useSkill(slot, id); return; }
      }
    } });
  } else if (kind === 'buster') {
    this.aiQ.push({ t: Math.max(this.t, tRes - 2.5), fn: () => {
      const c = who ? who() : this.mainTank();
      if (!c.auto || !isTank(c.slot) || SELF_MIT.some((id) => this.hasStatus(c.slot, id))) return;
      for (const id of ['mit', 'inv']) if (usable(this, c.slot, id)) { this.useSkill(c.slot, id); return; }
    } });
  }
};
/** 每一步：極限技量表、讀條（移動中斷／完成）、GCD 佇列、AI 起身、AI 判斷。 */
P.skillStep = function (dt) {
  const t = this.t;
  if (t >= 0) this.lb = Math.min(3, this.lb + dt * LB_RATE);
  const up = t >= 0 && !!bossOf(this);
  for (const c of this.chars) {
    if (up && c.alive && t >= c.stunUntil) c.stats.upT += dt;
    const k = c.cast;
    if (k) {
      if (t < c.stunUntil) { c.cast = null; c.gcdUntil = t; }
      else if (!k.ai && t < k.t1 - SLIDE && this.isMoving(c)) {
        c.cast = null; c.gcdUntil = t; c.stats.interrupts++;
        this.floats.push({ slot: c.slot, t, text: '中斷' });
      } else if (k.ai && k.id === 'spell' && c.goal && t >= c.goalAt) { c.cast = null; c.gcdUntil = t; }   // AI 要移動：放棄攻擊讀條
      else if (t >= k.t1) { c.cast = null; this.skillDone(c, k.id, k.tg, Math.max(GCD, k.t1 - k.t0)); }
    }
    if (c.queued && !c.cast && t >= c.gcdUntil) { const q = c.queued; c.queued = null; this.useSkill(c.slot, q.id, q.tg, q.bt); }
    if (!c.alive && c.raise && c.auto && !this.waitingPlan(c) && t - c.raise.t >= AI_ACCEPT_DELAY) this.acceptRaise(c.slot);
  }
  if (this.aiQ.length) {
    for (const q of this.aiQ) if (t >= q.t) { q.done = true; q.fn(); }
    this.aiQ = this.aiQ.filter((q) => !q.done);
  }
  this.aiT -= dt;
  if (this.aiT <= 0) { this.aiT = 0.25; this.aiThink(); }
};
/** AI 隊友：救人、補師 LB3、補師／D4 站著時讀攻擊（畫面用）。 */
P.aiThink = function () {
  const t = this.t;
  if (t < 0) return;
  const beingRaised = (d) => this.chars.some((r) => r.cast && r.cast.id === 'raise' && r.cast.tg === d.slot);
  const dead = this.chars.filter((d) => !d.alive && !d.raise && !this.waitingPlan(d) && t - d.deadAt >= AI_RAISE_DELAY && !beingRaised(d));
  if (dead.length) {
    const pri = (d) => (this.humans.has(d.slot) ? 0 : isTank(d.slot) ? 1 : RAISERS.includes(d.slot) ? 2 : 3);
    dead.sort((a, b) => pri(a) - pri(b) || a.deadAt - b.deadAt);
    for (const slot of RAISERS) {
      const r = this.chars[slot];
      if (!r.auto || !r.alive || t < r.stunUntil) continue;
      if (r.cast ? !(r.cast.ai && r.cast.id === 'spell') : t < r.gcdUntil) continue;
      const d = dead.find((x) => dist(x.pos, r.pos) <= RAISE_RANGE);
      if (!d) continue;
      this.aiFree(r);
      if (usable(this, slot, 'swift')) this.useSkill(slot, 'swift');
      this.useSkill(slot, 'raise', d.slot);
      dead.splice(dead.indexOf(d), 1);
      if (!dead.length) break;
    }
  }
  if (this.lb >= 3 && this.chars.filter((d) => !d.alive && !this.waitingPlan(d)).length >= 3) {
    const h = [H1, H2].map((s) => this.chars[s]).find((x) => x.auto && x.alive && t >= x.stunUntil);
    if (h) { this.aiFree(h); if (usable(this, h.slot, 'lb')) this.useSkill(h.slot, 'lb'); }
  }
  if (!bossOf(this)) return;
  for (const c of this.chars) {
    if (!c.auto || !c.alive || c.cast || c.goal || c.walk > 0.1 || LOADOUT[c.slot][0] !== 'spell') continue;
    if (usable(this, c.slot, 'spell')) this.useSkill(c.slot, 'spell');
  }
};
/** 結算用的技能統計。 */
P.skillSummary = function (slot) {
  const c = this.chars[slot], st = c.stats;
  return {
    uptime: st.upT >= 5 && st.busy > 0 ? Math.min(100, Math.round(st.busy / st.upT * 100)) : null,   // 完全沒用技能就不顯示
    interrupts: st.interrupts,
    busters: st.busters.map((b) => ({ t: b.t, name: b.name, ok: b.ok })),
    raids: this.raids.map((r) => ({ t: r.t, name: r.name, ok: r.mit })),
    deaths: st.deaths,
    raisedBy: st.raisedBy.map((r) => ({ t: r.t, by: ROLES[r.by].key, lb: !!r.lb })),
    raises: st.raises.map((r) => ({ t: r.t, who: ROLES[r.slot].key })),
    lb: st.used.lb || 0,
  };
};

U.SKILLS = SKILLS; U.SKILL_IDS = SKILL_IDS; U.LOADOUT = LOADOUT; U.RAISERS = RAISERS; U.GCD = GCD; U.LB_KIND = LB_KIND; U.LB_NAME = LB_NAME;
U.skillCheck = skillCheck; U.bossOf = bossOf; U.bossList = bossList; U.hitboxR = hitboxR; U.meleeReach = meleeReach; U.castTime = castTime; U.raiseTarget = raiseTarget;
})(typeof window !== 'undefined' ? window : globalThis);
