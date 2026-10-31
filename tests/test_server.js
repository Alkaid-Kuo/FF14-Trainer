/* 自架伺服器（server/node-server.js）的連線測試：node tests/test_server.js
   需要先在 server/ 執行 npm install；用 Node 22 內建的 WebSocket 當客戶端。 */
const assert = require('assert');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const PORT = 18765;
const BASE = `127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 連線並把收到的訊息記下來；wait(條件) 等到有符合的訊息為止。 */
function client(room, name) {
  const ws = new WebSocket(`ws://${BASE}/ws?room=${room}&name=${encodeURIComponent(name)}`);
  const c = { ws, got: [], closed: null };
  ws.onmessage = (e) => c.got.push(JSON.parse(e.data));
  ws.onclose = (e) => { c.closed = e.code; };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = async (fn, label) => {
    for (let i = 0; i < 200; i++) {
      const hit = [...c.got].reverse().find(fn);
      if (hit) return hit;
      await sleep(10);
    }
    throw new Error(`${name} 等不到 ${label}：${JSON.stringify(c.got)}`);
  };
  c.joined = async () => { c.id = (await c.wait((m) => m.t === 'welcome', 'welcome')).id; return c; };
  return c;
}
const rosterOf = (n) => (m) => m.t === 'roster' && m.members.length === n;

async function main() {
  let res = await fetch(`http://${BASE}/`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /<html/i);
  res = await fetch(`http://${BASE}/`, { headers: { 'If-None-Match': res.headers.get('etag') } });
  assert.strictEqual(res.status, 304);
  assert.strictEqual((await fetch(`http://${BASE}/healthz`)).status, 200);
  assert.strictEqual((await fetch(`http://${BASE}/nope`)).status, 404);
  assert.strictEqual((await fetch(`http://${BASE}/ws?room=ABCD`)).status, 426);

  // 房號不合法：連不上
  const bad = new WebSocket(`ws://${BASE}/ws?room=toolong`);
  await new Promise((r) => { bad.onerror = r; bad.onclose = r; });   // 握手被拒時有的 Node 版本只觸發 error、不會觸發 close

  // 不合法的請求不能讓伺服器掛掉：請求目標壞掉（new URL 會拋錯）、upgrade 被拒絕時對方立刻重置連線
  const rawLine = (payload) => new Promise((resolve) => {
    const s = net.connect(PORT, '127.0.0.1', () => s.write(payload));
    let first = '';
    s.on('data', (d) => { first += d.toString(); });
    s.on('error', () => {});
    s.on('close', () => resolve(first.split('\r\n')[0]));
  });
  assert.match(await rawLine('GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'), /^HTTP\/1\.1 400/);
  assert.match(await rawLine('GET //[ HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'), /^HTTP\/1\.1 400/);
  for (let i = 0; i < 30; i++) {
    const s = net.connect(PORT, '127.0.0.1', () => {
      s.write('GET /bad HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
      s.resetAndDestroy();
    });
    s.on('error', () => {});
    await sleep(5);
  }
  await sleep(100);
  assert.strictEqual((await fetch(`http://${BASE}/healthz`)).status, 200, '壞請求之後伺服器還要活著');

  // 第一個進房的是房主
  const a = await client('abcd', '甲').joined();
  const b = await client('ABCD', '乙').joined();
  const r = await b.wait(rosterOf(2), '兩人名單');
  assert.strictEqual(r.host, a.id);
  assert.deepStrictEqual(r.members.map((m) => m.name), ['甲', '乙']);

  // 不同房號互不相通
  const other = await client('ZZZZ', '丙').joined();
  assert.strictEqual((await other.wait(rosterOf(1), '別房名單')).host, other.id);

  // 轉送：房主預設給所有人、隊員預設只給房主、to 指定對象，並加上 from
  const c = await client('ABCD', '丁').joined();
  await a.wait(rosterOf(3), '三人名單');
  a.send({ t: 'snap', v: 1 });
  assert.strictEqual((await b.wait((m) => m.t === 'snap', '房主廣播')).from, a.id);
  await c.wait((m) => m.t === 'snap', '房主廣播');
  b.send({ t: 'pos', v: 2 });
  assert.strictEqual((await a.wait((m) => m.t === 'pos', '隊員送房主')).from, b.id);
  b.send({ t: 'dm', to: c.id });
  await c.wait((m) => m.t === 'dm', '指定對象');
  b.send({ t: 'shout', to: 'all' });
  await a.wait((m) => m.t === 'shout', 'to all');
  await c.wait((m) => m.t === 'shout', 'to all');
  await sleep(50);
  assert.ok(!c.got.some((m) => m.t === 'pos'), '隊員的訊息不該給其他隊員');
  assert.ok(!a.got.some((m) => m.t === 'dm'), '指定對象的訊息不該給別人');
  assert.ok(!other.got.some((m) => m.t === 'snap'), '不該收到別房的訊息');

  // 壞訊息不能讓伺服器掛掉
  for (const junk of ['null', '123', '"x"', '{', '[]']) a.ws.send(junk);
  a.ws.send(new Uint8Array([1, 2, 3]));

  // 改名
  b.send({ t: 'name', name: '乙二' });
  await a.wait((m) => m.t === 'roster' && m.members.some((x) => x.name === '乙二'), '改名');

  // 只有房主能轉讓
  b.send({ t: 'xfer', to: b.id });
  await sleep(50);
  assert.strictEqual(a.got.filter((m) => m.t === 'roster').pop().host, a.id);
  a.send({ t: 'xfer', to: b.id });
  await c.wait((m) => m.t === 'roster' && m.host === b.id, '轉讓房主');

  // 房主離開 → 交給最早進房的人
  b.ws.close();
  const after = await c.wait((m) => m.t === 'roster' && m.members.length === 2, '房主離開');
  assert.strictEqual(after.host, a.id);

  // 第 11 人進不來
  const full = [a, c];
  for (let i = 0; i < 8; i++) full.push(await client('ABCD', `p${i}`).joined());
  const late = client('ABCD', '遲到');
  await late.wait((m) => m.t === 'roomfull', 'roomfull');
  for (let i = 0; i < 100 && late.closed === null; i++) await sleep(10);
  assert.strictEqual(late.closed, 4001);

  // 全部離開後同房號重新開房：新的人是房主
  for (const m of full) m.ws.close();
  await sleep(100);
  const again = await client('ABCD', '新').joined();
  assert.strictEqual((await again.wait(rosterOf(1), '新房')).host, again.id);
  again.ws.close();
  other.ws.close();

  assert.strictEqual((await fetch(`http://${BASE}/healthz`)).status, 200);
}

const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'node-server.js')], { env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'] });
proc.stdout.once('data', () => {
  main().then(() => { console.log('test_server OK'); proc.kill(); process.exit(0); })
    .catch((e) => { console.error(e); proc.kill(); process.exit(1); });
});
proc.on('exit', (code) => { if (code) { console.error('伺服器異常結束', code); process.exit(1); } });
