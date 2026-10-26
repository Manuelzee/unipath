import { readFile } from "node:fs/promises";
import { and, eq, notInArray, sql } from "drizzle-orm";
import {
  db,
  institutionDirectoryTable,
  pool,
} from "@workspace/db";

type IpedsRecord = {
  unitid: string;
  name: string;
  city: string;
  state: string;
  website: string;
  sector: string;
  institutionType: string;
  level: string;
  degreeLevels: string[];
};

type JsonRecord = Record<string, unknown>;
type ImportRow = typeof institutionDirectoryTable.$inferInsert;

const SCORECARD_API =
  "https://api.data.gov/ed/collegescorecard/v1/schools";
const FIRST_DATA_YEAR = 1996;
const LAST_DATA_YEAR = 2025;
const PAGE_SIZE = 100;
const METRIC_FIELDS = [
  "cost.tuition.in_state",
  "cost.tuition.out_of_state",
  "admissions.admission_rate.overall",
  "completion.completion_rate_4yr_150nt",
  "completion.completion_rate_less_than_4yr_150nt",
  "aid.pell_grant_rate",
  "aid.median_debt.completers.overall",
];

function getValue(record: JsonRecord, dottedPath: string): unknown {
  if (dottedPath in record) return record[dottedPath];
  return dottedPath.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as JsonRecord)[part];
  }, record);
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function officialUrl(value: unknown): string | null {
  const candidate = textValue(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(
      candidate.startsWith("www.") ? `https://${candidate}` : candidate,
    );
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function ownershipFromSector(sector: string): string | null {
  if (sector === "1" || sector === "4" || sector === "7") return "Public";
  if (sector === "2" || sector === "5" || sector === "8") {
    return "Private nonprofit";
  }
  if (sector === "3" || sector === "6" || sector === "9") {
    return "Private for-profit";
  }
  return null;
}

function ownershipFromScorecard(value: unknown): string | null {
  switch (numberValue(value)) {
    case 1:
      return "Public";
    case 2:
      return "Private nonprofit";
    case 3:
      return "Private for-profit";
    default:
      return null;
  }
}

function predominantDegree(value: unknown): string[] {
  switch (numberValue(value)) {
    case 1:
    case 2:
      return ["Undergraduate"];
    case 3:
      return ["Undergraduate"];
    case 4:
      return ["Graduate"];
    default:
      return [];
  }
}

function institutionTypeFallback(
  ownership: string | null,
  predominant: unknown,
): string {
  const level = [1, 2].includes(numberValue(predominant) ?? -1)
    ? "2-year"
    : [3, 4].includes(numberValue(predominant) ?? -1)
      ? "4-year or above"
      : "postsecondary";
  return ownership ? `${ownership}, ${level}` : level;
}

function latestMetric(
  record: JsonRecord,
  field: string,
): { value: number; year: number } | null {
  for (let year = LAST_DATA_YEAR; year >= FIRST_DATA_YEAR; year -= 1) {
    const value = numberValue(getValue(record, `${year}.${field}`));
    if (value !== null) return { value, year };
  }
  return null;
}

function programData(record: JsonRecord) {
  const raw = getValue(record, "latest.programs.cip_4_digit");
  if (!Array.isArray(raw)) return { majors: [] as string[], degreeTypes: [] as string[] };

  const majors = new Set<string>();
  const degreeTypes = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const program = item as JsonRecord;
    const title = textValue(program["title"]);
    if (title) majors.add(title);
    const credential =
      program["credential"] && typeof program["credential"] === "object"
        ? (program["credential"] as JsonRecord)
        : {};
    const credentialTitle = textValue(credential["title"]);
    if (credentialTitle) degreeTypes.add(credentialTitle);
  }

  return {
    majors: [...majors].sort((a, b) => a.localeCompare(b)),
    degreeTypes: [...degreeTypes].sort((a, b) => a.localeCompare(b)),
  };
}

function scorecardFields(
  firstYear: number,
  lastYear: number,
  includeInstitutionDetails: boolean,
): string[] {
  const fields = includeInstitutionDetails
    ? [
    "id",
    "school.name",
    "school.city",
    "school.state",
    "school.website",
    "school.admissions_url",
    "school.ownership",
    "school.operating",
    "school.degrees_awarded.predominant",
    "latest.programs.cip_4_digit.code",
    "latest.programs.cip_4_digit.title",
    "latest.programs.cip_4_digit.credential.title",
  ]
    : ["id"];
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const metric of METRIC_FIELDS) fields.push(`${year}.${metric}`);
  }
  return fields;
}

async function fetchScorecardPage(
  apiKey: string,
  page: number,
  firstYear: number,
  lastYear: number,
  includeInstitutionDetails: boolean,
): Promise<{ total: number; results: JsonRecord[] }> {
  const url = new URL(SCORECARD_API);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("school.operating", "1");
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PAGE_SIZE));
  url.searchParams.set(
    "fields",
    scorecardFields(firstYear, lastYear, includeInstitutionDetails).join(","),
  );
  url.searchParams.set("keys_nested", "true");
  if (includeInstitutionDetails) {
    url.searchParams.set("all_programs_nested", "true");
  }

  let lastError = "Unknown College Scorecard API error.";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      const responseText = await response.text();
      if (!response.ok) {
        const message = (() => {
          try {
            const payload = JSON.parse(responseText) as {
              error?: { message?: string };
            };
            return payload.error?.message;
          } catch {
            return undefined;
          }
        })();
        lastError =
          message ?? `College Scorecard returned HTTP ${response.status}.`;
        if (response.status !== 429 && response.status < 500) break;
      } else {
        const payload = JSON.parse(responseText) as {
          metadata?: { total?: number };
          results?: JsonRecord[];
        };
        return {
          total: payload.metadata?.total ?? 0,
          results: payload.results ?? [],
        };
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Network request failed.";
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 8_000)),
    );
  }

  throw new Error(
    `Could not retrieve College Scorecard page ${page}. ${lastError} Check the API key and try again.`,
  );
}

function mergeJsonRecords(target: JsonRecord, source: JsonRecord): void {
  for (const [key, value] of Object.entries(source)) {
    const targetValue = target[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      mergeJsonRecords(targetValue as JsonRecord, value as JsonRecord);
    } else {
      target[key] = value;
    }
  }
}

function ipedsRow(record: IpedsRecord, updatedAt: Date): ImportRow {
  const ipedsId = Number(record.unitid);
  if (!Number.isInteger(ipedsId) || ipedsId <= 0) {
    throw new Error(`Invalid IPEDS UnitID: ${record.unitid}`);
  }

  return {
    id: `nces-${ipedsId}`,
    ipedsId,
    scorecardId: null,
    name: record.name,
    city: record.city || "",
    state: record.state || "",
    country: "United States",
    institutionType: record.institutionType || "Not reported",
    ownership: ownershipFromSector(record.sector),
    degreeLevels: record.degreeLevels ?? [],
    degreeTypes: [],
    majors: [],
    website: officialUrl(record.website),
    admissionsWebsite: null,
    tuitionInStateUsd: null,
    tuitionInStateYear: null,
    tuitionOutOfStateUsd: null,
    tuitionOutOfStateYear: null,
    admissionRate: null,
    admissionRateYear: null,
    completionRate: null,
    completionRateYear: null,
    completionRateType: null,
    pellGrantRate: null,
    pellGrantRateYear: null,
    medianDebtUsd: null,
    medianDebtYear: null,
    dataSource: "NCES IPEDS",
    dataYear: "2025–26",
    sourceUrl: `https://nces.ed.gov/collegenavigator/?id=${ipedsId}`,
    isActive: true,
    lastUpdatedAt: updatedAt,
  };
}

function mergeScorecard(
  current: ImportRow | undefined,
  record: JsonRecord,
  updatedAt: Date,
): ImportRow | null {
  const scorecardId = numberValue(getValue(record, "id"));
  if (!scorecardId || !Number.isInteger(scorecardId)) return null;

  const ownership =
    ownershipFromScorecard(getValue(record, "school.ownership")) ??
    current?.ownership ??
    null;
  const predominant = getValue(
    record,
    "school.degrees_awarded.predominant",
  );
  const programs = programData(record);
  const completionFourYear = latestMetric(
    record,
    "completion.completion_rate_4yr_150nt",
  );
  const completionLessFourYear = latestMetric(
    record,
    "completion.completion_rate_less_than_4yr_150nt",
  );
  const hasFourYearDegree =
    current?.institutionType?.includes("4-year") ??
    [3, 4].includes(numberValue(predominant) ?? -1);
  const completionMetric = hasFourYearDegree
    ? (completionFourYear ?? completionLessFourYear)
    : (completionLessFourYear ?? completionFourYear);
  const tuitionIn = latestMetric(record, "cost.tuition.in_state");
  const tuitionOut = latestMetric(record, "cost.tuition.out_of_state");
  const admission = latestMetric(record, "admissions.admission_rate.overall");
  const pell = latestMetric(record, "aid.pell_grant_rate");
  const debt = latestMetric(record, "aid.median_debt.completers.overall");
  const name = textValue(getValue(record, "school.name")) ?? current?.name;
  if (!name) return null;

  const scorecardDegrees = predominantDegree(predominant);
  const ipedsDegreeLevels = current?.degreeLevels ?? [];
  const degreeLevels =
    ipedsDegreeLevels.length
      ? ipedsDegreeLevels
      : scorecardDegrees.length
        ? scorecardDegrees
        : [...new Set(
            programs.degreeTypes.map((degree) =>
              /graduate|master|doctor|professional/i.test(degree)
                ? "Graduate"
                : "Undergraduate",
            ),
          )];
  const id = current?.id ?? `nces-${scorecardId}`;
  const hasIpeds = current?.ipedsId != null;

  return {
    ...current,
    id,
    ipedsId: current?.ipedsId ?? null,
    scorecardId,
    name,
    city: current?.city || textValue(getValue(record, "school.city")) || "",
    state: current?.state || textValue(getValue(record, "school.state")) || "",
    country: "United States",
    institutionType:
      current?.institutionType ||
      institutionTypeFallback(ownership, predominant),
    ownership,
    degreeLevels,
    degreeTypes: programs.degreeTypes,
    majors: programs.majors,
    website:
      current?.website ?? officialUrl(getValue(record, "school.website")),
    admissionsWebsite: officialUrl(
      getValue(record, "school.admissions_url"),
    ),
    tuitionInStateUsd:
      tuitionIn?.value == null ? null : Math.round(tuitionIn.value),
    tuitionInStateYear: tuitionIn?.year ?? null,
    tuitionOutOfStateUsd:
      tuitionOut?.value == null ? null : Math.round(tuitionOut.value),
    tuitionOutOfStateYear: tuitionOut?.year ?? null,
    admissionRate: admission?.value ?? null,
    admissionRateYear: admission?.year ?? null,
    completionRate: completionMetric?.value ?? null,
    completionRateYear: completionMetric?.year ?? null,
    completionRateType: completionMetric
      ? completionMetric === completionFourYear
        ? "4-year completion rate (150% of normal time)"
        : "Less-than-4-year completion rate (150% of normal time)"
      : null,
    pellGrantRate: pell?.value ?? null,
    pellGrantRateYear: pell?.year ?? null,
    medianDebtUsd: debt?.value == null ? null : Math.round(debt.value),
    medianDebtYear: debt?.year ?? null,
    dataSource: hasIpeds
      ? "NCES IPEDS + U.S. Department of Education College Scorecard"
      : "U.S. Department of Education College Scorecard",
    dataYear: hasIpeds
      ? "IPEDS 2025–26"
      : "College Scorecard (individual metric years shown)",
    sourceUrl: hasIpeds
      ? `https://nces.ed.gov/collegenavigator/?id=${current?.ipedsId}`
      : `https://collegescorecard.ed.gov/school/?${scorecardId}`,
    isActive: true,
    lastUpdatedAt: updatedAt,
  };
}

async function main() {
  const apiKey = process.env.COLLEGE_SCORECARD_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "COLLEGE_SCORECARD_API_KEY is missing. Request a free key at https://api.data.gov/signup/ and add it to Replit Secrets before syncing.",
    );
  }

  const ipedsRows = JSON.parse(
    await readFile(new URL("../data/us-colleges-2025.json", import.meta.url), "utf8"),
  ) as IpedsRecord[];
  const updatedAt = new Date();
  const institutions = new Map<number, ImportRow>();

  for (const record of ipedsRows) {
    const row = ipedsRow(record, updatedAt);
    institutions.set(row.ipedsId!, row);
  }

  let total = 0;
  for (let page = 0; ; page += 1) {
    const result = await fetchScorecardPage(apiKey, page);
    total = result.total;
    if (page === 0 && total === 0) {
      throw new Error("College Scorecard returned no active institutions.");
    }

    for (const record of result.results) {
      const scorecardId = numberValue(getValue(record, "id"));
      const current = scorecardId ? institutions.get(scorecardId) : undefined;
      const merged = mergeScorecard(current, record, updatedAt);
      if (merged) institutions.set(scorecardId!, merged);
    }

    if ((page + 1) * PAGE_SIZE >= total) break;
    if (!result.results.length) {
      throw new Error(
        `College Scorecard stopped returning records at page ${page}.`,
      );
    }
  }

  if (!total) throw new Error("Could not determine the College Scorecard total.");

  const rows = [...institutions.values()];
  await db.transaction(async (tx) => {
    for (let start = 0; start < rows.length; start += PAGE_SIZE) {
      await tx
        .insert(institutionDirectoryTable)
        .values(rows.slice(start, start + PAGE_SIZE))
        .onConflictDoUpdate({
          target: institutionDirectoryTable.id,
          set: {
            ipedsId: sql`excluded.ipeds_id`,
            scorecardId: sql`excluded.scorecard_id`,
            name: sql`excluded.name`,
            city: sql`excluded.city`,
            state: sql`excluded.state`,
            country: sql`excluded.country`,
            institutionType: sql`excluded.institution_type`,
            ownership: sql`excluded.ownership`,
            degreeLevels: sql`excluded.degree_levels`,
            degreeTypes: sql`excluded.degree_types`,
            majors: sql`excluded.majors`,
            website: sql`excluded.website`,
            admissionsWebsite: sql`excluded.admissions_website`,
            tuitionInStateUsd: sql`excluded.tuition_in_state_usd`,
            tuitionInStateYear: sql`excluded.tuition_in_state_year`,
            tuitionOutOfStateUsd: sql`excluded.tuition_out_of_state_usd`,
            tuitionOutOfStateYear: sql`excluded.tuition_out_of_state_year`,
            admissionRate: sql`excluded.admission_rate`,
            admissionRateYear: sql`excluded.admission_rate_year`,
            completionRate: sql`excluded.completion_rate`,
            completionRateYear: sql`excluded.completion_rate_year`,
            completionRateType: sql`excluded.completion_rate_type`,
            pellGrantRate: sql`excluded.pell_grant_rate`,
            pellGrantRateYear: sql`excluded.pell_grant_rate_year`,
            medianDebtUsd: sql`excluded.median_debt_usd`,
            medianDebtYear: sql`excluded.median_debt_year`,
            dataSource: sql`excluded.data_source`,
            dataYear: sql`excluded.data_year`,
            sourceUrl: sql`excluded.source_url`,
            isActive: sql`excluded.is_active`,
            lastUpdatedAt: sql`excluded.last_updated_at`,
          },
        });
    }

    await tx
      .update(institutionDirectoryTable)
      .set({ isActive: false })
      .where(
        and(
          eq(institutionDirectoryTable.isActive, true),
          notInArray(
            institutionDirectoryTable.id,
            rows.map((row) => row.id),
          ),
        ),
      );
  });

  console.log(
    `Imported ${rows.length.toLocaleString()} unique active institutions: ${ipedsRows.length.toLocaleString()} from IPEDS and ${total.toLocaleString()} active College Scorecard records. Data sync completed ${updatedAt.toISOString()}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Institution sync failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
