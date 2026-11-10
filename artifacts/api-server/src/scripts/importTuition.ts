/**
 * Tuition-only, opt-in official import. Never replaces institution identity,
 * branding, reviewed evidence, or existing tuition. Credentials stay server-side.
 * pnpm exec tsx src/scripts/importTuition.ts
 */
import { db, institutionDirectoryTable as schools } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const emit = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
const key = process.env.COLLEGE_SCORECARD_API_KEY;
const years = [2024, 2023, 2022];
type RecordRow = Record<string, unknown>;
async function page(pageNumber: number) {
  const url = new URL("https://api.data.gov/ed/collegescorecard/v1/schools");
  url.searchParams.set("api_key", key!);
  url.searchParams.set("school.operating", "1");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(pageNumber));
  url.searchParams.set("fields", ["id", ...years.flatMap(y => [
    `${y}.cost.tuition.in_state`, `${y}.cost.tuition.out_of_state`,
  ])].join(","));
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000), redirect: "error" });
  } catch {
    throw new Error("Official tuition source request failed or timed out; raw details suppressed to protect credentials.");
  }
  if (!response.ok) throw new Error(`Official tuition source returned HTTP ${response.status}; no response body or credential-bearing URL logged.`);
  const body = await response.json() as { metadata?: { total?: number }; results?: RecordRow[] };
  if (!Array.isArray(body.results) || !Number.isSafeInteger(body.metadata?.total) || body.metadata!.total! <= 0)
    throw new Error("Official tuition source returned an invalid or empty dataset.");
  return { total: body.metadata!.total!, rows: body.results };
}
const metric = (row: RecordRow, kind: string) => {
  for (const year of years) {
    const value = row[`${year}.cost.tuition.${kind}`];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1_000_000)
      return { amount: Math.round(value), year };
  }
  return null;
};

try {
  if (!key) throw new Error("COLLEGE_SCORECARD_API_KEY is not configured; no tuition was imported.");
  const first = await page(0);
  const rows = [...first.rows];
  const pages = Math.ceil(first.total / 100);
  if (pages > 100) throw new Error("Official dataset exceeds the import safety limit.");
  for (let n = 1; n < pages; n += 3) {
    const batch = await Promise.all(Array.from({ length: Math.min(3, pages - n) }, (_, i) => page(n + i)));
    if (batch.some(b => b.total !== first.total)) throw new Error("Official dataset changed during retrieval; retry later.");
    rows.push(...batch.flatMap(b => b.rows));
  }
  if (rows.length !== first.total || new Set(rows.map(r => r.id)).size !== rows.length)
    throw new Error("Official dataset pagination is incomplete or duplicated; no tuition imported.");
  let updated = 0;
  await db.transaction(async tx => {
    for (const row of rows) {
      if (typeof row.id !== "number" || !Number.isSafeInteger(row.id)) continue;
      const a = metric(row, "in_state"), b = metric(row, "out_of_state");
      if (!a && !b) continue;
      // Only fill null paired values on matching U.S. records.
      const result = await tx.update(schools).set({
        ...(a ? {
          tuitionInStateUsd: sql`CASE WHEN ${schools.tuitionInStateUsd} IS NULL AND ${schools.tuitionInStateYear} IS NULL THEN ${a.amount} ELSE ${schools.tuitionInStateUsd} END`,
          tuitionInStateYear: sql`CASE WHEN ${schools.tuitionInStateUsd} IS NULL AND ${schools.tuitionInStateYear} IS NULL THEN ${a.year} ELSE ${schools.tuitionInStateYear} END`,
        } : {}),
        ...(b ? {
          tuitionOutOfStateUsd: sql`CASE WHEN ${schools.tuitionOutOfStateUsd} IS NULL AND ${schools.tuitionOutOfStateYear} IS NULL THEN ${b.amount} ELSE ${schools.tuitionOutOfStateUsd} END`,
          tuitionOutOfStateYear: sql`CASE WHEN ${schools.tuitionOutOfStateUsd} IS NULL AND ${schools.tuitionOutOfStateYear} IS NULL THEN ${b.year} ELSE ${schools.tuitionOutOfStateYear} END`,
        } : {}),
        lastUpdatedAt: new Date(),
      }).where(sql`${schools.countryCode} = 'US' AND ${eq(schools.ipedsId, row.id)} AND
        ((${schools.tuitionInStateUsd} IS NULL AND ${schools.tuitionInStateYear} IS NULL AND ${Boolean(a)})
        OR (${schools.tuitionOutOfStateUsd} IS NULL AND ${schools.tuitionOutOfStateYear} IS NULL AND ${Boolean(b)}))`)
        .returning({ id: schools.id });
      updated += result.length;
    }
  });
  emit({ result: "completed", officialRows: rows.length, updatedInstitutions: updated,
    reportingYearsRequested: years, scope: "Annual U.S. undergraduate in-state/out-of-state tuition only. Not international rates or worldwide coverage." });
} catch (error) {
  // Only locally-authored messages above; never serialize a fetch/DB exception.
  const safe = error instanceof Error && /^(Official|COLLEGE_)/.test(error.message)
    ? error.message : "Tuition import failed; internal details suppressed. No claims of successful import.";
  emit({ result: "failed", error: safe });
  process.exitCode = 1;
} finally {
  // Drizzle's pool otherwise keeps this one-shot script open.
  await db.$client.end();
}
