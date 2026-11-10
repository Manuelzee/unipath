import type { InstitutionDirectoryRecord } from "@workspace/db";

/** Scorecard annual undergraduate institution-level tuition; not a program quote. */
export function universityTuition(row: InstitutionDirectoryRecord) {
  const sourceId = row.scorecardId ?? row.ipedsId;
  const qualify = (amount: number | null, year: number | null) =>
    row.countryCode === "US" && sourceId !== null && Number.isSafeInteger(sourceId) && sourceId > 0 &&
    amount !== null && Number.isFinite(amount) &&
    amount >= 0 && year !== null && Number.isInteger(year) && year >= 2000 &&
    year <= new Date().getUTCFullYear() ? amount : null;
  const inStateAmount = qualify(row.tuitionInStateUsd, row.tuitionInStateYear);
  const outOfStateAmount = qualify(row.tuitionOutOfStateUsd, row.tuitionOutOfStateYear);
  const years = [
    ...(inStateAmount !== null ? [row.tuitionInStateYear!] : []),
    ...(outOfStateAmount !== null ? [row.tuitionOutOfStateYear!] : []),
  ];
  const status = !years.length ? "missing" : Math.min(...years) < new Date().getUTCFullYear() - 1
    ? "outdated" : "source_reported";
  return {
    inStateAmount, outOfStateAmount, internationalAmount: null,
    inStateYear: inStateAmount !== null ? row.tuitionInStateYear : null,
    outOfStateYear: outOfStateAmount !== null ? row.tuitionOutOfStateYear : null,
    currency: "USD", period: "year",
    sourceUrl: years.length
      ? `https://collegescorecard.ed.gov/school/?${sourceId}` : null,
    recordUpdatedAt: row.lastUpdatedAt.toISOString(), status,
    note: "College Scorecard source-reported annual undergraduate tuition, not a current or program-specific quote. U.S. in-state and out-of-state categories do not establish international-student fees or residency eligibility. International tuition is unknown. Record update time is not a tuition verification date; confirm current costs with the university.",
  };
}
