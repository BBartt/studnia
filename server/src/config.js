import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Cała konfiguracja w jednym miejscu, czytana ze zmiennych środowiskowych. */
export const config = Object.freeze({
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  production: process.env.NODE_ENV === 'production',
  clientDist: resolve(process.env.CLIENT_DIST || join(__dirname, '../../client/dist')),
  dataDir: resolve(process.env.DATA_DIR || join(__dirname, '../data')),
  // Lista dozwolonych originów, np. "https://studnia.example.com". Pusta = każdy (wygodne lokalnie).
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Za reverse proxy (Caddy, nginx, Render) — poprawne IP i protokół w logach/nagłówkach
  trustProxy: process.env.TRUST_PROXY !== 'false',
});
