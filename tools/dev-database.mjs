// Zero-install PostgreSQL for local development (PGlite over the Postgres wire
// protocol). Data persists in .data/pglite. Usage: pnpm db:local
// For a full PostgreSQL server instead: docker compose up -d db
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.DB_PORT || 5433);
const host = '127.0.0.1';
const dataDir = process.env.DB_DATA_DIR ? path.resolve(process.env.DB_DATA_DIR) : path.resolve(import.meta.dirname, '..', '.data', 'pglite');

const portInUse = () => new Promise(resolve => {
  const socket = net.connect({ port, host }, () => { socket.end(); resolve(true); });
  socket.on('error', () => resolve(false));
});

if (await portInUse()) {
  console.log(`A database is already running on ${host}:${port}, so there is nothing to start.`);
  console.log('Stop that process first if you want to restart it.');
  process.exit(0);
}

mkdirSync(dataDir, { recursive: true });
let db;
try {
  db = await PGlite.create(dataDir);
} catch (error) {
  console.error(`Could not open the database in ${dataDir}.`);
  console.error('Another process may be using it. Close other "pnpm db:local" windows and try again.');
  console.error(error);
  process.exit(1);
}

const server = new PGLiteSocketServer({ db, port, host, maxConnections: 10 });
await server.start();
console.log(`Development database ready: postgres://postgres:postgres@localhost:${port}/postgres`);
console.log(`Data folder: ${dataDir}`);
console.log('Press Ctrl+C to stop.');

const shutdown = async () => {
  await server.stop().catch(() => undefined);
  await db.close().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
