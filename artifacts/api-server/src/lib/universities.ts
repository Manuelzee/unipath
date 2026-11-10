import {
  GetUniversityResponse,
  type ListUniversitiesParams,
  type ListUniversityFactsParams,
  ListUniversityFactsResponse,
} from "@workspace/api-zod";
import {
  and,
  arrayContains,
  eq,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  db,
  institutionDirectoryTable,
  institutionFactsTable,
  type InstitutionDirectoryRecord,
} from "@workspace/db";
import { universityTuition } from "./tuition";
import { getReferenceRate } from "./exchangeRates";

export type University = typeof GetUniversityResponse._output;

function toUniversity(
  institution: InstitutionDirectoryRecord,
): University {
  return GetUniversityResponse.parse({
    tuition: universityTuition(institution),
    id: institution.id,
    name: institution.name,
    country: institution.country,
    countryCode: institution.countryCode,
    sourceScope: institution.sourceScope,
    sourceLicenseUrl: institution.sourceLicenseUrl,
    recognitionStatus: institution.recognitionStatus,
    languages: institution.languages,
    applicantStatuses: institution.applicantStatuses,
    dliNumber: institution.dliNumber,
    dliSourceUrl: institution.dliSourceUrl,
    dliVerifiedAt: institution.dliVerifiedAt?.toISOString() ?? null,
    lastVerifiedAt: institution.lastVerifiedAt?.toISOString() ?? null,
    city: institution.city,
    state: institution.state,
    institutionType: institution.institutionType,
    ownership: institution.ownership,
    dataSource: institution.dataSource,
    dataYear: institution.dataYear,
    degreeLevels: institution.degreeLevels,
    degreeTypes: institution.degreeTypes,
    majors: institution.majors,
    website: institution.website,
    admissionsWebsite: institution.admissionsWebsite,
    applicationWebsite: institution.applicationWebsite,
    financialAidWebsite: institution.financialAidWebsite,
    logoUrl: institution.logoVerificationStatus === "verified" && institution.logoAssetHash
      ? `/api/institution-logos/${institution.logoAssetHash}.webp` : null,
    logoSource: institution.logoSource,
    logoIdentitySource: institution.logoIdentitySource,
    logoLicenseUrl: institution.logoLicenseUrl,
    logoUsageNote: institution.logoUsageNote,
    logoVerificationStatus: institution.logoVerificationStatus,
    logoLastCheckedAt: institution.logoLastCheckedAt?.toISOString() ?? null,
    logoSourceUrl: institution.logoSourceUrl ?? institution.logoSource,
    primaryColorHex: institution.colorsVerificationStatus === "verified" ? institution.primaryColorHex : null,
    secondaryColorHex: institution.colorsVerificationStatus === "verified" ? institution.secondaryColorHex : null,
    colorsSourceUrl: institution.colorsSourceUrl,
    colorsUsageNote: institution.colorsUsageNote,
    colorsVerificationStatus: institution.colorsVerificationStatus,
    colorsLastVerifiedAt: institution.colorsLastVerifiedAt?.toISOString() ?? null,
    mascotName: institution.mascotVerificationStatus === "verified" ? institution.mascotName : null,
    mascotSourceUrl: institution.mascotSourceUrl,
    mascotVerificationStatus: institution.mascotVerificationStatus,
    mascotLastVerifiedAt: institution.mascotLastVerifiedAt?.toISOString() ?? null,
    mascotImageUrl: institution.mascotVerificationStatus === "verified" && institution.mascotName &&
      institution.mascotImageVerificationStatus === "verified" && institution.mascotImageAssetHash
      ? `/api/institution-branding/images/${institution.mascotImageAssetHash}.webp` : null,
    mascotImageSourceUrl: institution.mascotImageSourceUrl,
    mascotImageLicenseUrl: institution.mascotImageLicenseUrl,
    mascotImageCredit: institution.mascotImageCredit,
    mascotImageVerificationStatus: institution.mascotImageVerificationStatus,
    campusImageUrl: institution.campusImageVerificationStatus === "verified" && institution.campusImageAssetHash
      ? `/api/institution-branding/images/${institution.campusImageAssetHash}.webp` : null,
    campusImageSourceUrl: institution.campusImageSourceUrl,
    campusImageLicenseUrl: institution.campusImageLicenseUrl,
    campusImageCredit: institution.campusImageCredit,
    campusImageVerificationStatus: institution.campusImageVerificationStatus,
    campusImageLastVerifiedAt: institution.campusImageLastVerifiedAt?.toISOString() ?? null,
    brandingVerificationStatus: institution.brandingVerificationStatus,
    brandingLastVerifiedAt: institution.brandingLastVerifiedAt?.toISOString() ?? null,
    admissionRate: institution.admissionRate,
    admissionRateYear: institution.admissionRateYear,
    completionRate: institution.completionRate,
    completionRateYear: institution.completionRateYear,
    completionRateType: institution.completionRateType,
    pellGrantRate: institution.pellGrantRate,
    pellGrantRateYear: institution.pellGrantRateYear,
    medianDebtUsd: institution.medianDebtUsd,
    medianDebtYear: institution.medianDebtYear,
    sourceUrl: institution.sourceUrl,
    isActive: institution.isActive,
    lastUpdatedAt: institution.lastUpdatedAt.toISOString(),
  });
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function searchUniversities(
  filters: ListUniversitiesParams,
  database: Pick<typeof db, "select"> = db,
) {
  const conditions: SQL[] = [eq(institutionDirectoryTable.isActive, true)];
  if (filters.maxAnnualTuition !== undefined) {
    const fx = await getReferenceRate(filters.tuitionCurrency ?? "USD");
    if (fx.rate === null || !["available", "identity"].includes(fx.status))
      throw new TuitionRateUnavailable();
    if (filters.tuitionRate === "international") {
      // Never treat nonresident tuition as verified international tuition.
      conditions.push(sql`false`);
    } else {
      const inState = filters.tuitionRate === "in_state";
      const amount = inState ? institutionDirectoryTable.tuitionInStateUsd : institutionDirectoryTable.tuitionOutOfStateUsd;
      const year = inState ? institutionDirectoryTable.tuitionInStateYear : institutionDirectoryTable.tuitionOutOfStateYear;
      // Source amounts are whole USD. Round the converted ceiling down so
      // PostgreSQL's integer comparison never receives a fractional parameter.
      const maxUsd = Math.floor(filters.maxAnnualTuition / fx.rate);
      conditions.push(eq(institutionDirectoryTable.countryCode, "US"));
      conditions.push(sql`${amount} >= 0 AND ${amount} <= ${maxUsd}::double precision AND ${year} >= 2000 AND ${year} <= ${new Date().getUTCFullYear()}`);
    }
  }
  const search = filters.search?.trim();
  if (filters.countryCode) conditions.push(eq(institutionDirectoryTable.countryCode, filters.countryCode));
  if (filters.city?.trim()) {
    conditions.push(sql`${institutionDirectoryTable.city} ILIKE ${likePattern(filters.city.trim())} ESCAPE '\\'`);
  }
  if (filters.language) conditions.push(arrayContains(institutionDirectoryTable.languages, [filters.language]));
  if (filters.applicantStatus) conditions.push(arrayContains(institutionDirectoryTable.applicantStatuses, [filters.applicantStatus]));
  if (filters.fundingOnly) {
    conditions.push(sql`exists (
      select 1 from ${institutionFactsTable}
      where ${institutionFactsTable.institutionId} = ${institutionDirectoryTable.id}
      and ${institutionFactsTable.kind} = 'funding'
    )`);
  }

  if (filters.state) {
    conditions.push(eq(institutionDirectoryTable.state, filters.state));
  }
  if (filters.institutionType) {
    conditions.push(
      eq(institutionDirectoryTable.institutionType, filters.institutionType),
    );
  }
  if (filters.ownership) {
    conditions.push(eq(institutionDirectoryTable.ownership, filters.ownership));
  }
  if (filters.degreeLevel) {
    conditions.push(
      or(
        arrayContains(institutionDirectoryTable.degreeLevels, [filters.degreeLevel]),
        arrayContains(institutionDirectoryTable.degreeTypes, [filters.degreeLevel]),
      )!,
    );
  }
  if (filters.major) {
    conditions.push(
      arrayContains(institutionDirectoryTable.majors, [filters.major]),
    );
  }
  if (search) {
    const pattern = likePattern(search);
    const searchCondition = or(
      sql`${institutionDirectoryTable.name} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${institutionDirectoryTable.city} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${institutionDirectoryTable.state} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${institutionDirectoryTable.institutionType} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${institutionDirectoryTable.ownership} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${institutionDirectoryTable.country} ILIKE ${pattern} ESCAPE '\\'`,
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const where = and(...conditions);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 24;
  const [countResult, rows] = await Promise.all([
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(institutionDirectoryTable)
      .where(where),
    database
      .select()
      .from(institutionDirectoryTable)
      .where(where)
      .orderBy(institutionDirectoryTable.name, institutionDirectoryTable.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return {
    items: rows.map(toUniversity),
    total: countResult[0]?.total ?? 0,
    page,
    pageSize,
  };
}

export class TuitionRateUnavailable extends Error {
  constructor() { super("A current currency reference rate is unavailable. The budget filter was not applied. Retry or choose USD."); }
}

export async function findUniversity(
  id: string,
): Promise<University | undefined> {
  const [institution] = await db
    .select()
    .from(institutionDirectoryTable)
    .where(eq(institutionDirectoryTable.id, id))
    .limit(1);
  return institution ? toUniversity(institution) : undefined;
}

export async function findUniversities(
  ids: string[],
): Promise<Map<string, University>> {
  if (!ids.length) return new Map();
  const institutions = await db
    .select()
    .from(institutionDirectoryTable)
    .where(inArray(institutionDirectoryTable.id, ids));
  return new Map(institutions.map((institution) => [
    institution.id,
    toUniversity(institution),
  ]));
}

export async function getUniversityFilterOptions() {
  const active = eq(institutionDirectoryTable.isActive, true);
  const [institutionTypes, ownerships, degreeLevels, majors, countries, regions, languages, applicantStatuses] =
    await Promise.all([
      db
        .selectDistinct({ value: institutionDirectoryTable.institutionType })
        .from(institutionDirectoryTable)
        .where(active)
        .orderBy(institutionDirectoryTable.institutionType),
      db
        .selectDistinct({ value: institutionDirectoryTable.ownership })
        .from(institutionDirectoryTable)
        .where(active)
        .orderBy(institutionDirectoryTable.ownership),
      db
        .selectDistinct({
          value: sql<string>`unnest(${institutionDirectoryTable.degreeLevels} || ${institutionDirectoryTable.degreeTypes})`,
        })
        .from(institutionDirectoryTable)
        .where(active)
        .orderBy(sql`1`),
      db
        .selectDistinct({
          value: sql<string>`unnest(${institutionDirectoryTable.majors})`,
        })
        .from(institutionDirectoryTable)
        .where(active)
        .orderBy(sql`1`),
      db.select({
        code: institutionDirectoryTable.countryCode,
        name: institutionDirectoryTable.country,
        count: sql<number>`count(*)::int`,
      }).from(institutionDirectoryTable).where(active)
        .groupBy(institutionDirectoryTable.countryCode, institutionDirectoryTable.country)
        .orderBy(institutionDirectoryTable.country),
      db.selectDistinct({
        countryCode: institutionDirectoryTable.countryCode,
        code: institutionDirectoryTable.state,
      }).from(institutionDirectoryTable)
        .where(and(active, sql`${institutionDirectoryTable.state} <> ''`))
        .orderBy(institutionDirectoryTable.countryCode, institutionDirectoryTable.state),
      db.selectDistinct({ value: sql<string>`unnest(${institutionDirectoryTable.languages})` })
        .from(institutionDirectoryTable).where(active).orderBy(sql`1`),
      db.selectDistinct({ value: sql<string>`unnest(${institutionDirectoryTable.applicantStatuses})` })
        .from(institutionDirectoryTable).where(active).orderBy(sql`1`),
    ]);

  return {
    institutionTypes: institutionTypes.map((row) => row.value),
    ownerships: ownerships.flatMap((row) => (row.value ? [row.value] : [])),
    degreeLevels: degreeLevels.map((row) => row.value),
    majors: majors.map((row) => row.value),
    countries,
    regions,
    languages: languages.map((row) => row.value),
    applicantStatuses: applicantStatuses.map((row) => row.value),
  };
}

export async function listUniversityFacts(params: ListUniversityFactsParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;
  const where = and(
    eq(institutionFactsTable.institutionId, params.institutionId),
    eq(institutionFactsTable.kind, params.kind ?? "program"),
  );
  const [counts, records] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(institutionFactsTable).where(where),
    db.select().from(institutionFactsTable).where(where)
      .orderBy(institutionFactsTable.title, institutionFactsTable.id)
      .limit(pageSize).offset((page - 1) * pageSize),
  ]);
  return ListUniversityFactsResponse.parse({
    items: records.map((row) => ({
      ...row,
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      importedAt: row.importedAt.toISOString(),
    })),
    total: counts[0]?.count ?? 0, page, pageSize,
  });
}
