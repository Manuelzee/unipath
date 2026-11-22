import { defineConfig } from "drizzle-kit";

// Read the repository-root .env when DATABASE_URL is not already set.
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile("../../.env"); } catch { /* no .env file */ }
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and set it (see README.md).");
}

export default defineConfig({
  // Relative to packages/db; forward slashes work on every OS.
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
