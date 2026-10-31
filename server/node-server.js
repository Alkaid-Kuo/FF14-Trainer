/* 絕神兵練習器：自架用的連線伺服器（Node），跟 worker.js 同樣的行為，改動房間邏輯時兩邊都要改。
   - GET /            → 練習器網頁（public/index.html）
   - GET /healthz     → 健康檢查
   - GET /ws?room=ABCD&name=暱稱 → WebSocket，同一個房號進同一個房間
   房間只放在記憶體，所以只能跑一個 Pod；重啟後房間會清空。訊息格式見 worker.js。 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const MAX_MEMBERS = 10;
const MAX_MESSAGE = 1024 * 1024;
const PING_MS = 30000;
const ROOM_RE = /^[A-Z0-9]{4}$/;

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const gzipped = zlib.gzipSync(html);
const etag = '"' + crypto.createHash('sha1').update(html).digest('hex') + '"';

const newId = () => Math.random().toString(36).slice(2, 8);

/** 房號 → 房間。沒人的房間會刪掉。 */
const rooms = new Map();

class Room {
  constructor(code) { this.code = code; this.sockets = new Set(); }

  /** 目前在線的成員（依進房順序）。 */
  members() {
    return [...this.sockets].filter((ws) => ws.readyState === WebSocket.OPEN).map((ws) => ({ ws, a: ws.member }));
  }

  join(ws, name) {
    const list = this.members();
    if (list.length >= MAX_MEMBERS) {
      ws.send(JSON.stringify({ t: 'roomfull' }));
      ws.close(4001, 'room full');
      return;
    }
    ws.member = { id: newId(), name, host: !list.some((m) => m.a.host) };
    this.sockets.add(ws);
    ws.send(JSON.stringify({ t: 'welcome', id: ws.member.id }));
    this.broadcastRoster();
  }

  broadcastRoster() {
    const list = this.members();
    // 沒有房主（房主剛離開）→ 交給最早進房的人
    if (list.length && !list.some((m) => m.a.host)) list[0].a.host = true;
    const host = list.find((m) => m.a.host);
    const msg = JSON.stringify({ t: 'roster', host: host ? host.a.id : null, members: list.map((m) => ({ id: m.a.id, name: m.a.name })) });
    for (const m of list) m.ws.send(msg);
  }

  message(ws, data) {
    let msg;
    try { msg = JSON.parse(data); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    const me = ws.member;
    const list = this.members();
    if (msg.t === 'xfer') {
      if (!me.host) return;
      const to = list.find((m) => m.a.id === msg.to);
      if (!to) return;
      me.host = false;
      to.a.host = true;
      this.broadcastRoster();
      return;
    }
    if (msg.t === 'name') {
      me.name = String(msg.name || '').trim().slice(0, 16) || me.name;
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

  leave(ws) {
    if (!this.sockets.delete(ws)) return;
    if (this.sockets.size) this.broadcastRoster();
    else rooms.delete(this.code);
  }
}

function serveHtml(req, res) {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gzip ? gzipped : html;
  if (gzip) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((req, res) => {
  const reply = (status, text) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
  // 請求目標不合法（例如 //[）時 new URL 會拋錯；不接住整個程序會崩潰、所有房間清空
  let pathname;
  try { ({ pathname } = new URL(req.url, 'http://localhost')); } catch (_) { return reply(400, 'Bad Request'); }
  if (pathname === '/ws') return reply(426, '需要 WebSocket');
  if (pathname === '/healthz') return reply(200, 'ok');
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, 'Method Not Allowed');
  if (pathname === '/' || pathname === '/index.html') return serveHtml(req, res);
  reply(404, 'Not Found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

server.on('upgrade', (req, socket, head) => {
  // upgrade 事件時 http 自己的 socket 錯誤監聽已被移除，ws 要到 handleUpgrade 才會掛上；
  // 這之前（或直接拒絕時）對方重置連線會是沒人接的 ECONNRESET，整個程序會崩潰
  socket.on('error', () => socket.destroy());
  const refuse = (line) => { socket.end(`HTTP/1.1 ${line}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (_) { return refuse('400 Bad Request'); }
  if (url.pathname !== '/ws') return refuse('404 Not Found');
  const code = (url.searchParams.get('room') || '').toUpperCase();
  if (!ROOM_RE.test(code)) return refuse('400 Bad Request');
  const name = (url.searchParams.get('name') || '玩家').trim().slice(0, 16) || '玩家';
  wss.handleUpgrade(req, socket, head, (ws) => {
    let room = rooms.get(code);
    if (!room) { room = new Room(code); rooms.set(code, room); }
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, isBinary) => { if (!isBinary && ws.member) room.message(ws, data.toString()); });
    ws.on('close', () => room.leave(ws));
    ws.on('error', () => ws.terminate());
    room.join(ws, name);
    if (!room.sockets.size) rooms.delete(code);
  });
});

// 定期 ping：清掉沒回應的連線（對方斷網時收不到 close），也避免閒置太久被反向代理切斷
const pinger = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, PING_MS);

function shutdown() {
  clearInterval(pinger);
  for (const ws of wss.clients) ws.close(1001, 'server restart');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`ff14-trainer listening on :${PORT}`));
