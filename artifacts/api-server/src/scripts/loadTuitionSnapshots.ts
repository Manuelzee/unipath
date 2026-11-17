/**
 * Development-only opt-in import of the reviewed, bundled source snapshots.
 * All files are validated before the single transaction starts.
 */
import { readFile } from "node:fs/promises";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { applyTuitionManifest, parseTuitionManifest } from "../lib/tuitionImport";

try {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1")
    throw new Error("Production import requires separate owner approval; this command is development-only.");
  const manifests = await Promise.all(["ipeds-2023", "bc-domestic-2025", "bc-international-2025"].map(async name => {
    const value: unknown = JSON.parse(await readFile(new URL(`../../data/tuition/${name}.json`, import.meta.url), "utf8"));
    parseTuitionManifest(value);
    return value;
  }));
  const result = await db.transaction(async tx => {
    const protectedState = async () => (await tx.execute(sql`
      select
      (select md5(string_agg(row_to_json(s)::text, '' order by s.id)) from institution_directory s) as directory,
      (select md5(string_agg(row_to_json(f)::text, '' order by f.id)) from institution_facts f) as facts
    `)).rows[0];
    const before = JSON.stringify(await protectedState());
    const reports = [];
    for (const manifest of manifests) reports.push(await applyTuitionManifest(manifest, tx));
    if (before !== JSON.stringify(await protectedState()))
      throw new Error("Protected directory or evidence changed; tuition imports rolled back.");
    return reports;
  });
  process.stdout.write(`${JSON.stringify({ result: "completed", protectedDirectoryAndFactsUnchanged: true, reports: result })}\n`);
} catch {
  process.stderr.write("Official tuition snapshot import failed; transaction rolled back. No credential or database details logged.\n");
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
