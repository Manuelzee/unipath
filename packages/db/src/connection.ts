import type { ConnectionOptions } from "node:tls";

const SSL_URL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

/**
 * Connection settings from DATABASE_URL.
 *
 * Hosted Postgres (Supabase) needs TLS. Either put `?sslmode=require&uselibpqcompat=true`
 * on the URL (encrypted, certificate not checked), or set DATABASE_CA_CERT to the
 * provider's CA certificate (PEM text; `\n` escapes are accepted) to also verify the
 * server. With a CA set, SSL options on the URL are ignored, because node-postgres
 * would let them override the verified settings.
 */
export function connectionConfig(url: string): { connectionString: string; ssl?: ConnectionOptions } {
  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (!ca) return { connectionString: url };
  const parsed = new URL(url);
  for (const key of SSL_URL_PARAMS) parsed.searchParams.delete(key);
  return { connectionString: parsed.toString(), ssl: { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true } };
}
