// Connects once with DATABASE_URL (same TLS rules as src/connection.ts) and,
// on failure, explains the likely cause. Never prints the password.
// Usage: pnpm db:check
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
const fail = (message, hint) => {
  console.error(`Database connection failed: ${message}`);
  if (hint) console.error(`What to check: ${hint}`);
  process.exit(1);
};
if (!url) fail("DATABASE_URL is not set.", "Set it in the host's environment settings (see docs/deployment.md).");
if (/\[YOUR-(DATABASE-)?PASSWORD\]/i.test(url))
  fail("DATABASE_URL still contains the password placeholder.", "Replace [YOUR-PASSWORD] (or [YOUR-DATABASE-PASSWORD]), brackets included, with the database password.");
if (url.includes("…"))
  fail("DATABASE_URL contains the … character, so it is an example rather than the real connection string.", "Copy the Session pooler URI from Supabase > Connect.");

let parsed;
try { parsed = new URL(url); } catch {
  fail("DATABASE_URL is not a valid URL.", "If the password contains characters such as @ # / ? : or %, reset it in Supabase to one with only letters and digits.");
}
const password = decodeURIComponent(parsed.password);
const redact = text => (password ? String(text).split(password).join("***") : String(text));
const host = parsed.hostname;
const port = parsed.port || "5432";
const user = decodeURIComponent(parsed.username);
console.log(`Checking the database connection to ${host}:${port} as ${user} ...`);

const config = { connectionString: url, connectionTimeoutMillis: 15_000 };
const ca = process.env.DATABASE_CA_CERT?.trim();
if (ca) {
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) parsed.searchParams.delete(key);
  config.connectionString = parsed.toString();
  config.ssl = { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
}

const hints = {
  ENOTFOUND: "The host name is wrong. Copy the URI again from Supabase > Connect.",
  ENETUNREACH: "This host is only reachable over IPv6, which Render does not support. In Supabase > Connect choose the Session pooler URI (host ends in pooler.supabase.com).",
  EHOSTUNREACH: "The host is unreachable. Use the Session pooler URI from Supabase > Connect.",
  ECONNREFUSED: "Nothing accepted the connection on that port. The Session pooler uses port 5432 (the Transaction pooler 6543).",
  ETIMEDOUT: "The connection timed out. Use the Session pooler URI, and check that the Supabase project is not paused.",
  "28P01": "Wrong password. Reset the database password in Supabase > Database settings and update DATABASE_URL.",
  "28000": "The user is not allowed to connect. For the pooler the user is postgres.<project-ref>, exactly as Supabase shows it.",
  "3D000": "The database name at the end of the URL is wrong; it should be /postgres.",
  XX000: "The pooler did not recognize the user. Copy the Session pooler URI again; the user must be postgres.<project-ref>.",
  SELF_SIGNED_CERT_IN_CHAIN: "TLS certificate check failed. End the URL with ?sslmode=require&uselibpqcompat=true, or set DATABASE_CA_CERT.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS certificate check failed. End the URL with ?sslmode=require&uselibpqcompat=true, or set DATABASE_CA_CERT.",
};

const client = new pg.Client(config);
try {
  await client.connect();
  const { rows } = await client.query("select current_database() as database, current_user as role");
  console.log(`Database connection OK (database ${rows[0].database}, role ${rows[0].role}).`);
  await client.end();
} catch (error) {
  const code = error?.code ?? error?.errors?.[0]?.code ?? "";
  const message = redact(error?.message || error?.errors?.map(e => e.message).join("; ") || "unknown error");
  const hint = hints[code]
    ?? (/tenant or user not found/i.test(message) ? hints.XX000 : undefined)
    ?? (/password authentication failed/i.test(message) ? hints["28P01"] : undefined)
    ?? (/certificate/i.test(message) ? hints.SELF_SIGNED_CERT_IN_CHAIN : undefined);
  await client.end().catch(() => undefined);
  fail(`${code ? `[${code}] ` : ""}${message}`, hint);
}
