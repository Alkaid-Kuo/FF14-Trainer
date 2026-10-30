/* 絕神兵練習器：連線伺服器（Cloudflare Worker＋Durable Object）。
   - GET /            → 練習器網頁（public/index.html）
   - GET /ws?room=ABCD&name=暱稱 → WebSocket，同一個房號進同一個房間（Durable Object）
   伺服器只負責：成員名單、房主（可轉讓；房主離開自動交給最早進房的人）、轉送訊息。
   模擬由房主的瀏覽器負責。
   訊息（JSON）：
     伺服器 → 客戶端：{ t: 'welcome', id } / { t: 'roster', host, members: [{ id, name }] } / { t: 'roomfull' }
     客戶端 → 伺服器：{ t: 'xfer', to }（房主轉讓）、{ t: 'name', name }；
       其他訊息照轉送：房主送出的預設給所有人；隊員送出的預設只給房主；to: 'all' 給所有人、to: 成員 id 只給那個人。
       轉送時會加上 from（送出者 id）。 */
import { DurableObject } from 'cloudflare:workers';

const MAX_MEMBERS = 10;
const ROOM_RE = /^[A-Z0-9]{4}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!ROOM_RE.test(room)) return new Response('房號要是 4 個英數字', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

const newId = () => Math.random().toString(36).slice(2, 8);

export class Room extends DurableObject {
  /** 目前在線的成員（依進房順序）。 */
  members(except) {
    return this.ctx.getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, a: ws.deserializeAttachment() }))
      .sort((x, y) => x.a.joined - y.a.joined);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get('name') || '玩家').trim().slice(0, 16) || '玩家';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const list = this.members(server);
    if (list.length >= MAX_MEMBERS) {
      server.send(JSON.stringify({ t: 'roomfull' }));
      server.close(4001, 'room full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const a = { id: newId(), name, joined: Date.now(), host: !list.some((m) => m.a.host) };
    server.serializeAttachment(a);
    server.send(JSON.stringify({ t: 'welcome', id: a.id }));
    this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastRoster(except) {
    const list = this.members(except);
    // 沒有房主（房主剛離開）→ 交給最早進房的人
    if (list.length && !list.some((m) => m.a.host)) { list[0].a.host = true; list[0].ws.serializeAttachment(list[0].a); }
    const host = list.find((m) => m.a.host);
    const msg = JSON.stringify({ t: 'roster', host: host ? host.a.id : null, members: list.map((m) => ({ id: m.a.id, name: m.a.name })) });
    for (const m of list) m.ws.send(msg);
  }

  webSocketMessage(ws, data) {
    if (typeof data !== 'string') return;
    let msg;
    try { msg = JSON.parse(data); } catch (_) { return; }
    const me = ws.deserializeAttachment();
    const list = this.members();
    if (msg.t === 'xfer') {
      if (!me.host) return;
      const to = list.find((m) => m.a.id === msg.to);
      if (!to) return;
      me.host = false; ws.serializeAttachment(me);
      to.a.host = true; to.ws.serializeAttachment(to.a);
      this.broadcastRoster();
      return;
    }
    if (msg.t === 'name') {
      me.name = String(msg.name || '').trim().slice(0, 16) || me.name;
      ws.serializeAttachment(me);
      this.broadcastRoster();
      return;
    }
    msg.from = me.id;
    const out = JSON.stringify(msg);
    const to = msg.to || (me.host ? 'all' : 'host');
    for (const m of list) {
      if (m.ws === ws) continue;
      if (to === 'all' || (to === 'host' && m.a.host) || to === m.a.id) m.ws.send(out);
    }
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (_) { /* 已經關了 */ }
    this.broadcastRoster(ws);
  }

  webSocketError(ws) { this.broadcastRoster(ws); }
}
