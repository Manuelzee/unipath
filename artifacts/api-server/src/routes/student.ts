import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateApplicationTaskBody,
  CreateApplicationTaskResponse,
  DeleteApplicationTaskParams,
  GetStudentDashboardResponse,
  GetStudentProfileResponse,
  ListApplicationTasksResponse,
  ListSavedUniversitiesResponse,
  RemoveSavedUniversityParams,
  SaveStudentProfileBody,
  SaveStudentProfileResponse,
  SaveUniversityBody,
  SaveUniversityResponse,
  UpdateApplicationTaskBody,
  UpdateApplicationTaskParams,
  UpdateApplicationTaskResponse,
} from "@workspace/api-zod";
import {
  applicationTasksTable,
  db,
  savedUniversitiesTable,
  studentProfilesTable,
} from "@workspace/db";
import { findUniversities, findUniversity } from "../lib/universities";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function studentId(req: Parameters<typeof getAuth>[0]): string {
  const userId = getAuth(req).userId;
  if (!userId) throw new Error("Authenticated user ID was not available.");
  return userId;
}

function toTask(task: typeof applicationTasksTable.$inferSelect) {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
  };
}
const PRIORITIES = new Set(["scholarships","affordability","acceptance","major","reputation","internships","career_outcomes","location_climate","close_to_home","campus_life","sports","online","flexible_admissions","international_support","diversity","small_classes","research","graduate_opportunities","housing","accessibility"]);
function profileResponse(profile: typeof studentProfilesTable.$inferSelect) {
  return {
    residenceCountry: profile.residenceCountry, citizenship: profile.citizenship,
    studyCountry: profile.studyCountry, degreeLevel: profile.degreeLevel,
    major: profile.major, grades: profile.grades, annualBudgetUsd: profile.annualBudgetUsd,
    preferredLanguage: profile.preferredLanguage, englishTest: profile.englishTest,
    englishScore: profile.englishScore,
    budgetChoice: profile.budgetChoice ?? (profile.annualBudgetUsd > 0 ? "custom" : "none"),
    budgetCurrency: profile.budgetCurrency, budgetScope: profile.budgetScope,
    customBudget: profile.customBudget ?? (profile.budgetChoice === null && profile.annualBudgetUsd > 0 ? profile.annualBudgetUsd : null),
    startTerm: profile.startTerm, startYear: profile.startYear,
    priorities: profile.priorities, topPriorities: profile.topPriorities,
    preferredLocation: profile.preferredLocation, residenceRegion: profile.residenceRegion,
    applicantStatus: profile.applicantStatus, admissionTrack: profile.admissionTrack,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

router.get("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const [profile] = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, studentId(req)))
    .limit(1);
  res.json(
    GetStudentProfileResponse.parse({
      profile: profile
        ? profileResponse(profile)
        : null,
    }),
  );
});

router.put("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const body = SaveStudentProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const p = body.data;
  if (Object.values(p).some(value => typeof value === "string" && value.length > 200)) {
    res.status(400).json({ error: "Profile text fields must be shorter than 200 characters." });
    return;
  }
  if ((p.priorities && (new Set(p.priorities).size !== p.priorities.length || p.priorities.some(v => !PRIORITIES.has(v)))) ||
    (p.topPriorities && (new Set(p.topPriorities).size !== p.topPriorities.length || p.topPriorities.some(v => !PRIORITIES.has(v)))) ||
    (p.topPriorities && p.priorities && p.topPriorities.some(v => !p.priorities!.includes(v))) ||
    (p.budgetCurrency && !Intl.supportedValuesOf("currency").includes(p.budgetCurrency)) ||
    (p.budgetChoice === "custom" && (!p.customBudget || p.customBudget <= 0)) ||
    (p.startYear && (p.startYear < new Date().getFullYear() || p.startYear > new Date().getFullYear() + 15))) {
    res.status(400).json({ error: "Check your budget, start year, currency, and ranked priorities." });
    return;
  }
  const values = { ...body.data, userId: studentId(req) };
  const [profile] = await db
    .insert(studentProfilesTable)
    .values(values)
    .onConflictDoUpdate({
      target: studentProfilesTable.userId,
      set: { ...body.data, updatedAt: new Date() },
    })
    .returning();
  res.json(SaveStudentProfileResponse.parse(profileResponse(profile)));
});

router.get("/me/saved", requireAuth, async (req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(savedUniversitiesTable)
    .where(eq(savedUniversitiesTable.userId, studentId(req)))
    .orderBy(desc(savedUniversitiesTable.savedAt));
  const universitiesById = await findUniversities(
    entries.map((entry) => entry.universityId),
  );
  const saved = entries.flatMap((entry) => {
    const university = universitiesById.get(entry.universityId);
    if (!university) return [];
    return [
      {
        universityId: entry.universityId,
        savedAt: entry.savedAt.toISOString(),
        university,
      },
    ];
  });
  res.json(ListSavedUniversitiesResponse.parse(saved));
});

router.post("/me/saved", requireAuth, async (req, res): Promise<void> => {
  const body = SaveUniversityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const university = await findUniversity(body.data.universityId);
  if (!university) {
    res.status(404).json({ error: "University listing not found." });
    return;
  }
  const userId = studentId(req);
  const [entry] = await db
    .insert(savedUniversitiesTable)
    .values({ userId, universityId: university.id })
    .onConflictDoUpdate({
      target: [
        savedUniversitiesTable.userId,
        savedUniversitiesTable.universityId,
      ],
      set: { savedAt: new Date() },
    })
    .returning();
  res.status(201).json(
    SaveUniversityResponse.parse({
      universityId: entry.universityId,
      savedAt: entry.savedAt.toISOString(),
      university,
    }),
  );
});

router.delete(
  "/me/saved/:universityId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = RemoveSavedUniversityParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await db
      .delete(savedUniversitiesTable)
      .where(
        and(
          eq(savedUniversitiesTable.userId, studentId(req)),
          eq(savedUniversitiesTable.universityId, params.data.universityId),
        ),
      );
    res.sendStatus(204);
  },
);

router.get("/me/tasks", requireAuth, async (req, res): Promise<void> => {
  const tasks = await db
    .select()
    .from(applicationTasksTable)
    .where(eq(applicationTasksTable.userId, studentId(req)))
    .orderBy(applicationTasksTable.dueDate);
  res.json(ListApplicationTasksResponse.parse(tasks.map(toTask)));
});

router.post("/me/tasks", requireAuth, async (req, res): Promise<void> => {
  const body = CreateApplicationTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (
    !(await findUniversity(body.data.universityId)) &&
    body.data.universityId !== ""
  ) {
    res.status(404).json({ error: "University listing not found." });
    return;
  }
  const [task] = await db
    .insert(applicationTasksTable)
    .values({ ...body.data, userId: studentId(req) })
    .returning();
  res.status(201).json(CreateApplicationTaskResponse.parse(toTask(task)));
});

router.patch(
  "/me/tasks/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateApplicationTaskParams.safeParse(req.params);
    const body = UpdateApplicationTaskBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (
      body.data.universityId !== undefined &&
      body.data.universityId !== "" &&
      !(await findUniversity(body.data.universityId))
    ) {
      res.status(404).json({ error: "University listing not found." });
      return;
    }
    const [task] = await db
      .update(applicationTasksTable)
      .set(body.data)
      .where(
        and(
          eq(applicationTasksTable.id, params.data.id),
          eq(applicationTasksTable.userId, studentId(req)),
        ),
      )
      .returning();
    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    res.json(UpdateApplicationTaskResponse.parse(toTask(task)));
  },
);

router.delete(
  "/me/tasks/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteApplicationTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [task] = await db
      .delete(applicationTasksTable)
      .where(
        and(
          eq(applicationTasksTable.id, params.data.id),
          eq(applicationTasksTable.userId, studentId(req)),
        ),
      )
      .returning();
    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    res.sendStatus(204);
  },
);

router.get("/me/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = studentId(req);
  const [savedEntries, tasks] = await Promise.all([
    db
      .select()
      .from(savedUniversitiesTable)
      .where(eq(savedUniversitiesTable.userId, userId)),
    db
      .select()
      .from(applicationTasksTable)
      .where(eq(applicationTasksTable.userId, userId)),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const completed = tasks.filter((task) => task.completed);
  const open = tasks.filter((task) => !task.completed);
  const upcoming = open
    .filter((task) => task.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)
    .map(toTask);
  res.json(
    GetStudentDashboardResponse.parse({
      savedCount: savedEntries.length,
      openTasks: open.length,
      completedTasks: completed.length,
      upcomingTasks: upcoming,
    }),
  );
});

export default router;
