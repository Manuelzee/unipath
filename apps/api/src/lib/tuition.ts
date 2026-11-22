import type { InstitutionDirectoryRecord, InstitutionTuitionRecord } from "@workspace/db";
import type { TuitionQuote } from "@workspace/api-zod";

/** Scorecard annual undergraduate institution-level tuition; not a program quote. */
export function universityTuition(row: InstitutionDirectoryRecord, evidence: InstitutionTuitionRecord[] = []) {
  const sourceId = row.scorecardId ?? row.ipedsId;
  const qualify = (amount: number | null, year: number | null) =>
    row.countryCode === "US" && sourceId !== null && Number.isSafeInteger(sourceId) && sourceId > 0 &&
    amount !== null && Number.isFinite(amount) &&
    amount >= 0 && year !== null && Number.isInteger(year) && year >= 2000 &&
    year <= new Date().getUTCFullYear() ? amount : null;
  const quotes: TuitionQuote[] = evidence.filter(q => q.institutionId === row.id &&
    q.year <= new Date().getUTCFullYear()).map(q => ({
    category: q.category as TuitionQuote["category"], amount: q.amount, currency: q.currency as TuitionQuote["currency"],
    year: q.year, academicYear: q.academicYear, period: "year", scope: q.scope,
    sourceName: q.sourceName, sourceUrl: q.sourceUrl, sourceFileUrl: q.sourceFileUrl,
    sourceLicenseUrl: q.sourceLicenseUrl, attribution: q.attribution, sourcePublishedAt: q.sourcePublishedAt,
    importedAt: q.importedAt.toISOString(), status: q.year < new Date().getUTCFullYear() - 1 ? "outdated" : "source_reported",
  }));
  // Compatibility for existing Scorecard rows. New evidence is kept separately.
  for (const [category, amount, year] of [
    ["in_state", qualify(row.tuitionInStateUsd, row.tuitionInStateYear), row.tuitionInStateYear],
    ["out_of_state", qualify(row.tuitionOutOfStateUsd, row.tuitionOutOfStateYear), row.tuitionOutOfStateYear],
  ] as const) {
    if (amount === null || year === null || quotes.some(q => q.category === category)) continue;
    quotes.push({
      category, amount, year, academicYear: `${year}/${String(year + 1).slice(-2)}`, currency: "USD", period: "year",
      scope: "Annual undergraduate tuition and required fees; institution-level, not international fees.",
      sourceName: "U.S. Department of Education, College Scorecard",
      sourceUrl: `https://collegescorecard.ed.gov/school/?${sourceId}`, sourceFileUrl: "https://collegescorecard.ed.gov/data/",
      sourceLicenseUrl: "https://www.ed.gov/about/ed-overview/required-notices/website-policies/copyright-status-notice",
      attribution: "Source: U.S. Department of Education. No endorsement.",
      sourcePublishedAt: null, importedAt: row.lastUpdatedAt.toISOString(),
      status: year < new Date().getUTCFullYear() - 1 ? "outdated" : "source_reported",
    });
  }
  quotes.sort((a, b) => a.category.localeCompare(b.category));
  const a = quotes.find(q => q.category === "in_state" && q.currency === "USD");
  const b = quotes.find(q => q.category === "out_of_state" && q.currency === "USD");
  const inStateAmount = a?.amount ?? null, outOfStateAmount = b?.amount ?? null;
  const years = quotes.map(q => q.year);
  const status = !years.length ? "missing" : Math.min(...years) < new Date().getUTCFullYear() - 1
    ? "outdated" : "source_reported";
  return {
    quotes, inStateAmount, outOfStateAmount,
    // Legacy scalar fields remain USD-only. Native-currency amounts live in quotes.
    internationalAmount: quotes.find(q => q.category === "international" && q.currency === "USD")?.amount ?? null,
    inStateYear: a?.year ?? null, outOfStateYear: b?.year ?? null,
    currency: "USD", period: "year",
    sourceUrl: quotes[0]?.sourceUrl ?? null,
    recordUpdatedAt: row.lastUpdatedAt.toISOString(), status,
    note: "Source-reported figures are not personalized quotes. Compare each figure's scope, academic year and included fees, not just its amount. U.S. in-state/out-of-state categories do not establish international fees or residency eligibility. Missing categories remain unknown; source reporting periods and import times are not current verification. Confirm current costs with the institution.",
  };
}
