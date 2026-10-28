import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 3900 + Math.floor(Math.random() * 90);
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;
let server;

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: mkdtempSync(join(tmpdir(), 'studnia-')) },
    stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => d.toString().includes('serwer działa') && resolve()));
});
after(() => server.kill());

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  const ws = new WebSocket(WS_URL);
  const c = { ws, room: null, state: null, errors: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'welcome') Object.assign(c, { id: m.id, session: m.sessionId });
    if (m.type === 'room') c.room = m.room;
    if (m.type === 'state') c.state = m.state;
    if (m.type === 'error') c.errors.push(m.message);
    if (m.type === 'pong') c.pong = m.t;
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  await new Promise((r) => ws.on('open', r));
  c.send({ type: 'hello' });
  await wait(50);
  return c;
}

test('pełny mecz: pokój, walidacja, runda, zamiana ról, ranking', { timeout: 30_000 }, async () => {
  const a = await connect();
  const b = await connect();
  a.send({ type: 'createRoom', nick: 'Bartek' });
  await wait(80);
  b.send({ type: 'joinRoom', code: 'ZZZZ', nick: 'Ola' });
  await wait(50);
  assert.match(b.errors.at(-1), /Nie ma pokoju/);

  b.send({ type: 'joinRoom', code: a.room.code, nick: 'Ola' });
  await wait(80);
  // każdy gracz może zmienić zasady meczu, a swoje ustawienia ma niezależne
  b.send({ type: 'updateSettings', settings: { roundSeconds: 45, jumpPower: 1.3 } });
  await wait(60);
  a.send({ type: 'updateSettings', settings: { roundsToWin: 3, startSpeed: 99 } });
  await wait(80);
  const pa = () => a.room.players.find((p) => p.id === a.id);
  const pb = () => a.room.players.find((p) => p.id === b.id);
  assert.equal(a.room.settings.roundSeconds, 45);
  assert.equal(a.room.settings.roundsToWin, 3);
  assert.equal(pa().settings.startSpeed, 10, 'wartość przycięta do zakresu');
  assert.equal(pb().settings.startSpeed, 4, 'ustawienia gracza B nietknięte');
  assert.equal(pb().settings.jumpPower, 1.3);
  assert.equal(a.room.settingsBy, 'Bartek');

  a.send({ type: 'resetSettings', scope: 'player' });
  await wait(60);
  assert.equal(pa().settings.startSpeed, 4, 'reset przywraca ustawienia fabryczne');
  assert.equal(pb().settings.jumpPower, 1.3, 'reset nie rusza drugiego gracza');
  a.send({ type: 'updateSettings', settings: { startSpeed: 7 } });
  await wait(60);

  // natychmiastowy zrzut: wymaga zgody obu graczy
  a.send({ type: 'updateSettings', settings: { hardDrop: true } });
  await wait(60);
  assert.equal(a.room.rules.hardDrop, false, 'jeden głos nie wystarcza');
  b.send({ type: 'updateSettings', settings: { hardDrop: true } });
  await wait(60);
  assert.equal(a.room.rules.hardDrop, true, 'obaj za — zrzut włączony');
  b.send({ type: 'updateSettings', settings: { hardDrop: false } });
  await wait(60);
  assert.equal(a.room.rules.hardDrop, false, 'wycofanie głosu wyłącza zrzut');

  // ping
  a.send({ type: 'ping', t: 123 });
  await wait(40);
  assert.equal(a.pong, 123);

  const roleBefore = a.room.players.find((p) => p.id === a.id).role;
  a.send({ type: 'startMatch' });
  await wait(5300); // odliczanie z intro
  assert.equal(a.room.phase, 'playing');

  // skoczek idzie prosto na najbliższe pole lawy
  const jumper = a.room.players.find((p) => p.role === 'jumper').id === a.id ? a : b;
  for (let i = 0; i < 60 && a.room.phase === 'playing'; i++) {
    const j = jumper.state.jumper;
    const center = j.x + 0.35;
    const target = jumper.state.lava.reduce((best, c) => (Math.abs(c + 0.5 - center) < Math.abs(best + 0.5 - center) ? c : best));
    const dx = target + 0.5 - center;
    jumper.send({ type: 'input', keys: { left: dx < -0.1, right: dx > 0.1 } });
    await wait(50);
  }
  assert.equal(a.room.phase, 'roundOver');
  assert.equal(a.room.lastRound.reason, 'floor');

  await wait(4400);
  const roleAfter = a.room.players.find((p) => p.id === a.id).role;
  assert.notEqual(roleAfter, roleBefore, 'role powinny się zamienić po rundzie');

  // powrót po zerwaniu połączenia
  b.ws.close();
  await wait(150);
  assert.equal(a.room.phase, 'paused');
  const b2 = new WebSocket(WS_URL);
  let b2room = null;
  b2.on('message', (raw) => { const m = JSON.parse(raw); if (m.type === 'room') b2room = m.room; });
  await new Promise((r) => b2.on('open', r));
  b2.send(JSON.stringify({ type: 'hello', sessionId: b.session }));
  await wait(150);
  assert.equal(b2room?.code, a.room.code);
  assert.equal(a.room.phase, 'countdown');

  a.ws.close();
  b2.close();
});
