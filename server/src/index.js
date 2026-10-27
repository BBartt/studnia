import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { RoomManager } from './rooms/RoomManager.js';
import { Leaderboard } from './leaderboard.js';

const HEARTBEAT_MS = 15_000;
const RATE = { perSecond: 40, burst: 80 };

const leaderboard = new Leaderboard(join(config.dataDir, 'leaderboard.json'));
const manager = new RoomManager({ leaderboard });

/* ---------- HTTP ---------- */
const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', true);

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: manager.rooms.size, uptime: Math.round(process.uptime()) }));
app.get('/api/leaderboard', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ entries: leaderboard.top(10) });
});

if (existsSync(config.clientDist)) {
  // Pliki z hashem w nazwie (assets/) można cache'ować „na zawsze”, index.html — nigdy
  app.use('/assets', express.static(join(config.clientDist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(config.clientDist, { index: false, maxAge: 0 }));
  app.get('*', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(join(config.clientDist, 'index.html'));
  });
} else if (config.production) {
  console.warn(`[studnia] Brak zbudowanego frontendu w ${config.clientDist} — uruchom "npm run build".`);
}

const server = createServer(app);

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 4 * 1024,
  verifyClient: ({ origin }, done) => {
    if (!config.allowedOrigins.length || config.allowedOrigins.includes(origin)) return done(true);
    console.warn('[ws] odrzucono połączenie z originu', origin);
    return done(false, 403, 'Forbidden origin');
  },
});

/** Limiter „token bucket” — chroni serwer przed zalewem wiadomości. */
function allow(client) {
  const now = Date.now();
  const b = client.bucket;
  b.tokens = Math.min(RATE.burst, b.tokens + ((now - b.last) / 1000) * RATE.perSecond);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

const clients = new Map(); // ws → client

wss.on('connection', (ws) => {
  const client = {
    id: null,
    sessionId: null,
    room: null,
    alive: true,
    bucket: { tokens: RATE.burst, last: Date.now() },
    send(obj) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    },
  };
  clients.set(ws, client);

  ws.on('pong', () => { client.alive = true; });
  ws.on('message', (raw) => {
    if (!allow(client)) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    try {
      manager.handle(client, msg);
    } catch (err) {
      console.error('[ws] błąd obsługi wiadomości', msg.type, err);
    }
  });
  ws.on('close', () => {
    clients.delete(ws);
    manager.disconnect(client);
  });
  ws.on('error', () => ws.terminate());
});

// Heartbeat: wykrywa martwe połączenia (zamknięta klapa laptopa, zerwane Wi-Fi)
const heartbeat = setInterval(() => {
  for (const [ws, client] of clients) {
    if (!client.alive) { ws.terminate(); continue; }
    client.alive = false;
    ws.ping();
  }
  manager.sweepSessions();
}, HEARTBEAT_MS);

server.listen(config.port, config.host, () => {
  console.log(`[studnia] serwer działa na http://${config.host}:${config.port} (WebSocket: /ws, tryb: ${config.production ? 'produkcja' : 'deweloperski'})`);
});

/* ---------- Łagodne zamykanie (docker stop, deploy) ---------- */
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[studnia] ${signal}: zamykanie…`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1012, 'Serwer się restartuje');
  server.close();
  leaderboard.save()
    .catch((err) => console.error('[leaderboard]', err))
    .finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
