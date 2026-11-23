import { defineConfig } from "drizzle-kit";
import { connectionConfig } from "./src/connection";

// Read the repository-root .env when DATABASE_URL is not already set.
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile("../../.env"); } catch { /* no .env file */ }
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and set it (see README.md).");
}

// Same TLS rules as the app (src/connection.ts): with DATABASE_CA_CERT the
// server certificate is verified, which needs the URL split into parts.
const { connectionString, ssl } = connectionConfig(process.env.DATABASE_URL);
const url = new URL(connectionString);
const dbCredentials = ssl
  ? {
      host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) || "postgres",
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), ssl,
    }
  : { url: connectionString };

export default defineConfig({
  // Relative to packages/db; forward slashes work on every OS.
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials,
});
