import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { connectionConfig } from "./connection";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Copy .env.example to .env and set it (see README.md).",
  );
}

export const pool = new Pool({
  ...connectionConfig(process.env.DATABASE_URL),
  // Hosted poolers cap clients per user (Supabase's free session pooler: 15).
  // Keep each process well under it, so the old and new servers can overlap
  // during a deploy without "max clients reached" errors.
  max: Number(process.env.DB_POOL_MAX) > 0 ? Number(process.env.DB_POOL_MAX) : 5,
  // Fail fast instead of hanging when the database is unreachable.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

// When an idle connection drops (database restart, failover, network blip) the
// pool emits "error". Without a listener Node treats it as fatal and the whole
// server exits. Log it and let the pool reconnect on the next query. Only the
// error code is logged: messages can include host names.
pool.on("error", (error: Error & { code?: string }) => {
  console.error(`[db] Idle database connection failed (${error.code ?? "unknown"}); reconnecting on next use.`);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
