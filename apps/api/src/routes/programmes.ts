import { Router, type IRouter, type Request } from "express";
import { and, asc, count, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  ConfirmProgrammeBody, ConfirmProgrammeResponse, CreateProgrammeBody, CreateProgrammeResponse,
  GetAdminProgrammeResponse, GetProgrammeFiltersResponse, GetProgrammeReadinessResponse, GetProgrammeResponse,
  ListAdminProgrammesQueryParams, ListAdminProgrammesResponse, ListProgrammesQueryParams, ListProgrammesResponse,
  ListUniversityProgrammesResponse, UpdateProgrammeBody, UpdateProgrammeResponse,
} from "@workspace/api-zod";
import {
  applicationsTable, db, institutionDirectoryTable as schools, programmesTable as programmes,
  studentDocumentsTable, studentProfilesTable, type ProgrammeRecord,
} from "@workspace/db";
import { getAuth } from "../lib/auth/session";
import { requireAuth } from "../middlewares/requireAuth";
import { requireJson } from "../middlewares/requireJson";
import { requireAdministrator, requireAdminMutationOrigin } from "../lib/admin/security";
import {
  CONFIRMATION_VALID_DAYS, academicFit, documentReadiness, profileGpa, programmeProblem, verificationOf,
} from "../lib/programmes";

const router: IRouter = Router();
const LEVEL_LABEL: Record<string, string> = {
  bachelor: "Bachelor's", master: "Master's", doctoral: "PhD / doctorate", diploma: "Diploma",
  certificate: "Certificate", foundation: "Foundation", other: "Other",
};

const institutionColumns = {
  id: schools.id, name: schools.name, city: schools.city, country: schools.country,
  countryCode: schools.countryCode, website: schools.website,
};
type Institution = { id: string; name: string; city: string; country: string; countryCode: string; website: string | null };
type Row = { programme: ProgrammeRecord; institution: Institution };

function summary({ programme: p, institution }: Row, now = new Date()) {
  return {
    id: p.id, name: p.name, level: p.level, degreeName: p.degreeName, field: p.field, language: p.language,
    durationMonths: p.durationMonths, studyMode: p.studyMode, intakes: p.intakes,
    tuitionAmount: p.tuitionAmount, tuitionCurrency: p.tuitionCurrency, tuitionPeriod: p.tuitionPeriod,
    applicationFeeAmount: p.applicationFeeAmount, applicationFeeCurrency: p.applicationFeeCurrency,
    deadlineType: p.deadlineType, deadline: p.deadline, deadlineNote: p.deadlineNote,
    institution, verification: verificationOf(p, now), updatedAt: p.updatedAt.toISOString(),
  };
}
function detail(row: Row, now = new Date()) {
  const p = row.programme;
  return {
    ...summary(row, now), tuitionNote: p.tuitionNote, academicRequirement: p.academicRequirement,
    languageRequirement: p.languageRequirement, otherRequirements: p.otherRequirements, minimumGpa: p.minimumGpa,
    requiredDocuments: p.requiredDocuments, officialUrl: p.officialUrl, applyUrl: p.applyUrl, sourceUrl: p.sourceUrl,
    confirmationNote: p.confirmationNote,
  };
}
const admin = (row: Row) => ({ ...detail(row), status: row.programme.status, seedKey: row.programme.seedKey, createdAt: row.programme.createdAt.toISOString() });

const selectRows = () => db.select({ programme: programmes, institution: institutionColumns })
  .from(programmes).innerJoin(schools, eq(schools.id, programmes.institutionId));
const published = eq(programmes.status, "published");
const like = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const today = () => new Date().toISOString().slice(0, 10);

/** Open fixed deadlines soonest first, then rolling, then unknown, then passed ones. */
const deadlineOrder = () => sql`case
  when ${programmes.deadlineType} = 'fixed' and ${programmes.deadline} >= ${today()} then 0
  when ${programmes.deadlineType} = 'rolling' then 1
  when ${programmes.deadlineType} = 'unknown' then 2 else 3 end`;

router.get("/programmes", async (req, res): Promise<void> => {
  const input = ListProgrammesQueryParams.safeParse({
    ...req.query, ...(req.query.confirmedOnly !== undefined ? { confirmedOnly: req.query.confirmedOnly === "true" } : {}),
  });
  if (!input.success) { res.status(400).json({ error: "Check the search filters." }); return; }
  const f = input.data;
  const conditions: SQL[] = [published];
  const search = f.search?.trim();
  if (search) conditions.push(or(ilike(programmes.name, like(search)), ilike(programmes.field, like(search)),
    ilike(programmes.degreeName, like(search)), ilike(schools.name, like(search)))!);
  if (f.countryCode) conditions.push(eq(schools.countryCode, f.countryCode));
  if (f.level) conditions.push(eq(programmes.level, f.level));
  if (f.field?.trim()) conditions.push(eq(programmes.field, f.field.trim()));
  if (f.language?.trim()) conditions.push(eq(programmes.language, f.language.trim()));
  if (f.confirmedOnly) conditions.push(gt(programmes.confirmedAt, new Date(Date.now() - CONFIRMATION_VALID_DAYS * 86_400_000)));
  const where = and(...conditions);
  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 12;
  const order = f.sort === "name" ? [asc(programmes.name)]
    : f.sort === "updated" ? [desc(programmes.checkedAt), desc(programmes.updatedAt)]
    : [deadlineOrder(), asc(programmes.deadline), asc(programmes.name)];
  const [rows, [total]] = await Promise.all([
    selectRows().where(where).orderBy(...order, asc(programmes.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: count() }).from(programmes).innerJoin(schools, eq(schools.id, programmes.institutionId)).where(where),
  ]);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(ListProgrammesResponse.parse({ items: rows.map(row => summary(row)), total: total.n, page, pageSize }));
});

router.get("/programmes/filters", async (_req, res): Promise<void> => {
  const base = () => db.select({ n: count() }).from(programmes).innerJoin(schools, eq(schools.id, programmes.institutionId));
  const [countries, levels, fields, languages, [total], [confirmed]] = await Promise.all([
    db.select({ value: schools.countryCode, label: schools.country, count: count() }).from(programmes)
      .innerJoin(schools, eq(schools.id, programmes.institutionId)).where(published)
      .groupBy(schools.countryCode, schools.country).orderBy(schools.country),
    db.select({ value: programmes.level, count: count() }).from(programmes).where(published).groupBy(programmes.level),
    db.select({ value: programmes.field, count: count() }).from(programmes).where(published).groupBy(programmes.field).orderBy(programmes.field),
    db.select({ value: programmes.language, count: count() }).from(programmes)
      .where(and(published, sql`${programmes.language} is not null`)).groupBy(programmes.language).orderBy(programmes.language),
    base().where(published),
    base().where(and(published, gt(programmes.confirmedAt, new Date(Date.now() - CONFIRMATION_VALID_DAYS * 86_400_000)))),
  ]);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(GetProgrammeFiltersResponse.parse({
    total: total.n, confirmed: confirmed.n,
    countries,
    levels: Object.keys(LEVEL_LABEL).flatMap(id => { const row = levels.find(l => l.value === id); return row ? [{ value: id, label: LEVEL_LABEL[id], count: row.count }] : []; }),
    fields: fields.map(r => ({ value: r.value, label: r.value, count: r.count })),
    languages: languages.map(r => ({ value: r.value!, label: r.value!, count: r.count })),
  }));
});

const programmeId = (req: Request) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 && id < 2 ** 31 ? id : null;
};

router.get("/programmes/:id", async (req, res): Promise<void> => {
  const id = programmeId(req);
  const [row] = id ? await selectRows().where(and(eq(programmes.id, id), published)).limit(1) : [];
  if (!row) { res.status(404).json({ error: "This programme is not listed." }); return; }
  // Same field first, then the same level in the same country.
  const similar = await selectRows().where(and(published, sql`${programmes.id} <> ${row.programme.id}`,
    or(eq(programmes.field, row.programme.field), and(eq(programmes.level, row.programme.level), eq(schools.countryCode, row.institution.countryCode)))))
    .orderBy(sql`case when ${programmes.field} = ${row.programme.field} then 0 else 1 end`, asc(programmes.name)).limit(4);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(GetProgrammeResponse.parse({ programme: detail(row), similar: similar.map(r => summary(r)) }));
});

router.get("/universities/:id/programmes", async (req, res): Promise<void> => {
  const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.id, String(req.params.id))).limit(1);
  if (!school) { res.status(404).json({ error: "University listing not found." }); return; }
  const rows = await selectRows().where(and(published, eq(programmes.institutionId, school.id)))
    .orderBy(asc(programmes.level), asc(programmes.name));
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(ListUniversityProgrammesResponse.parse({ items: rows.map(r => summary(r)) }));
});

router.get("/me/programmes/:id/readiness", requireAuth, async (req, res): Promise<void> => {
  const id = programmeId(req);
  const [row] = id ? await selectRows().where(and(eq(programmes.id, id), published)).limit(1) : [];
  if (!row) { res.status(404).json({ error: "This programme is not listed." }); return; }
  const userId = getAuth(req).userId!;
  const [documents, [profile], [tracked]] = await Promise.all([
    db.select({ kind: studentDocumentsTable.kind, title: studentDocumentsTable.title }).from(studentDocumentsTable)
      .where(eq(studentDocumentsTable.userId, userId)),
    db.select({ grades: studentProfilesTable.grades, gradingScale: studentProfilesTable.gradingScale }).from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, userId)).limit(1),
    db.select({ id: applicationsTable.id }).from(applicationsTable).where(and(eq(applicationsTable.userId, userId),
      eq(applicationsTable.universityId, row.programme.institutionId),
      sql`lower(${applicationsTable.programName}) = lower(${row.programme.name})`)).limit(1),
  ]);
  const readiness = documentReadiness(row.programme.requiredDocuments, documents);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetProgrammeReadinessResponse.parse({
    documents: readiness.items, requiredCount: readiness.requiredCount, readyCount: readiness.readyCount,
    academic: academicFit(row.programme.minimumGpa, profile ? profileGpa(profile.grades, profile.gradingScale) : null),
    trackedApplicationId: tracked?.id ?? null,
  }));
});

// ---------- Administrators ----------
const adminOnly = [requireAuth, requireAdministrator, requireAdminMutationOrigin];
const text = (value: string | null | undefined) => value?.trim() || null;

type Input = ReturnType<typeof CreateProgrammeBody.parse>;
/** The stored form of a programme input; strings trimmed, empty optional text becomes null. */
function values(input: Input) {
  return {
    institutionId: input.institutionId.trim(), name: input.name.trim(), level: input.level,
    degreeName: text(input.degreeName), field: input.field.trim(), language: text(input.language),
    durationMonths: input.durationMonths ?? null, studyMode: input.studyMode ?? null,
    intakes: [...new Set(input.intakes.map(i => i.trim()).filter(Boolean))],
    tuitionAmount: input.tuitionAmount ?? null, tuitionCurrency: text(input.tuitionCurrency), tuitionPeriod: input.tuitionPeriod ?? null,
    tuitionNote: text(input.tuitionNote), applicationFeeAmount: input.applicationFeeAmount ?? null,
    applicationFeeCurrency: text(input.applicationFeeCurrency), deadlineType: input.deadlineType,
    deadline: input.deadline ?? null, deadlineNote: text(input.deadlineNote),
    academicRequirement: text(input.academicRequirement), languageRequirement: text(input.languageRequirement),
    otherRequirements: text(input.otherRequirements), minimumGpa: input.minimumGpa ?? null,
    requiredDocuments: input.requiredDocuments.map(d => ({ kind: d.kind, need: d.need, note: text(d.note) })),
    officialUrl: input.officialUrl.trim(), applyUrl: text(input.applyUrl), sourceUrl: input.sourceUrl.trim(),
    checkedAt: input.checkedAt, status: input.status,
  };
}
type Values = ReturnType<typeof values>;

async function checked(body: unknown, parse: typeof CreateProgrammeBody.safeParse): Promise<{ values: Values } | { error: string }> {
  const input = parse(body);
  if (!input.success) return { error: `Check the programme details: ${input.error.issues.slice(0, 3).map(i => `${i.path.join(".") || "form"}: ${i.message}`).join("; ")}.` };
  const v = values(input.data);
  const problem = programmeProblem(v);
  if (problem) return { error: problem };
  const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.id, v.institutionId)).limit(1);
  if (!school) return { error: "Choose a university from the directory." };
  return { values: v };
}

const adminRow = async (id: number) => (await selectRows().where(eq(programmes.id, id)).limit(1))[0];

router.get("/admin/programmes", ...adminOnly, async (req, res): Promise<void> => {
  const input = ListAdminProgrammesQueryParams.safeParse(req.query);
  if (!input.success) { res.status(400).json({ error: "Check the filters." }); return; }
  const conditions: SQL[] = [];
  const search = input.data.search?.trim();
  if (search) conditions.push(or(ilike(programmes.name, like(search)), ilike(schools.name, like(search)), ilike(programmes.field, like(search)))!);
  if (input.data.status) conditions.push(eq(programmes.status, input.data.status));
  const rows = await selectRows().where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(programmes.updatedAt), desc(programmes.id)).limit(200);
  res.json(ListAdminProgrammesResponse.parse({ items: rows.map(admin) }));
});

router.get("/admin/programmes/:id", ...adminOnly, async (req, res): Promise<void> => {
  const id = programmeId(req);
  const row = id ? await adminRow(id) : undefined;
  if (!row) { res.status(404).json({ error: "Programme not found." }); return; }
  res.json(GetAdminProgrammeResponse.parse(admin(row)));
});

router.post("/admin/programmes", ...adminOnly, requireJson, async (req, res): Promise<void> => {
  const result = await checked(req.body, CreateProgrammeBody.safeParse);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  const userId = getAuth(req).userId!;
  const [created] = await db.insert(programmes).values({ ...result.values, createdBy: userId, updatedBy: userId }).returning({ id: programmes.id });
  req.log.info({ programmeId: created.id }, "Programme created");
  res.status(201).json(CreateProgrammeResponse.parse(admin((await adminRow(created.id))!)));
});

/** Details the university confirmed; changing any of them clears the confirmation. */
const FACTS: Array<keyof Values> = ["institutionId", "name", "level", "degreeName", "field", "language", "durationMonths", "studyMode",
  "intakes", "tuitionAmount", "tuitionCurrency", "tuitionPeriod", "tuitionNote", "applicationFeeAmount", "applicationFeeCurrency",
  "deadlineType", "deadline", "deadlineNote", "academicRequirement", "languageRequirement", "otherRequirements", "minimumGpa",
  "requiredDocuments", "officialUrl", "applyUrl"];
export const factsChanged = (before: Partial<Values>, after: Values) =>
  FACTS.some(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));

router.put("/admin/programmes/:id", ...adminOnly, requireJson, async (req, res): Promise<void> => {
  const id = programmeId(req);
  const existing = id ? await adminRow(id) : undefined;
  if (!existing) { res.status(404).json({ error: "Programme not found." }); return; }
  const result = await checked(req.body, UpdateProgrammeBody.safeParse);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  const changed = factsChanged(existing.programme as unknown as Partial<Values>, result.values);
  await db.update(programmes).set({
    ...result.values, updatedBy: getAuth(req).userId!, updatedAt: new Date(),
    ...(changed ? { confirmedAt: null, confirmedBy: null, confirmationNote: null } : {}),
  }).where(eq(programmes.id, existing.programme.id));
  res.json(UpdateProgrammeResponse.parse(admin((await adminRow(existing.programme.id))!)));
});

router.post("/admin/programmes/:id/confirmation", ...adminOnly, requireJson, async (req, res): Promise<void> => {
  const id = programmeId(req);
  const body = ConfirmProgrammeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Say how the university confirmed (for example, an email from the admissions office and its date)." }); return; }
  const existing = id ? await adminRow(id) : undefined;
  if (!existing) { res.status(404).json({ error: "Programme not found." }); return; }
  const userId = getAuth(req).userId!;
  await db.update(programmes).set({ confirmedAt: new Date(), confirmedBy: userId, confirmationNote: body.data.note.trim(), updatedBy: userId, updatedAt: new Date() })
    .where(eq(programmes.id, existing.programme.id));
  req.log.info({ programmeId: existing.programme.id }, "Programme confirmed by the university");
  res.json(ConfirmProgrammeResponse.parse(admin((await adminRow(existing.programme.id))!)));
});

export default router;
