/**
 * Date-based reminders from the student's own tracker: application deadlines
 * and plan tasks that are coming up or were recently missed. Nothing is stored;
 * the list is computed on request. No database access, so it can be unit-tested.
 */

/** Days ahead to remind about, and days after a missed date to keep showing it. */
export const DEADLINE_WINDOW = { ahead: 30, behind: 7 } as const;
export const TASK_WINDOW = { ahead: 14, behind: 7 } as const;
/** Statuses after which an application deadline no longer needs a reminder. */
const DONE = new Set(["submitted", "under_review", "accepted", "rejected", "waitlisted"]);

export interface ApplicationInput { id: number; status: string; deadline: string | null; programName: string | null; universityName: string | null }
export interface TaskInput { id: number; title: string; dueDate: string; completed: boolean; applicationId: number | null }
export interface Notification { id: string; kind: "deadline" | "task"; title: string; detail: string; date: string; daysAway: number; href: string }

/** Whole days from `today` to `date` (both YYYY-MM-DD, compared as UTC dates). */
export function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function when(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function buildNotifications(applications: ApplicationInput[], tasks: TaskInput[], today: string): Notification[] {
  const items: Notification[] = [];
  for (const a of applications) {
    if (!a.deadline || DONE.has(a.status)) continue;
    const days = daysBetween(today, a.deadline);
    if (days > DEADLINE_WINDOW.ahead || days < -DEADLINE_WINDOW.behind) continue;
    const what = [a.programName?.trim(), a.universityName?.trim()].filter(Boolean).join(" at ") || "An application";
    items.push({
      id: `deadline-${a.id}-${a.deadline}`, kind: "deadline", date: a.deadline, daysAway: days, href: "/applications",
      title: days < 0 ? `Deadline passed ${when(days)}` : `Deadline ${when(days)}`,
      detail: `${what}. This is the deadline you recorded; confirm it on the university's website.`,
    });
  }
  for (const t of tasks) {
    if (t.completed) continue;
    const days = daysBetween(today, t.dueDate);
    if (days > TASK_WINDOW.ahead || days < -TASK_WINDOW.behind) continue;
    items.push({
      id: `task-${t.id}-${t.dueDate}`, kind: "task", date: t.dueDate, daysAway: days,
      href: t.applicationId ? "/applications" : "/dashboard",
      title: days < 0 ? `Overdue: ${t.title}` : `Due ${when(days)}: ${t.title}`,
      detail: days < 0 ? `This step was due ${when(days)}. Mark it done or choose a new date.` : "A step in your plan.",
    });
  }
  // Missed dates first (most recent first), then upcoming ones (soonest first).
  return items.sort((x, y) => {
    const late = (n: Notification) => n.daysAway < 0;
    if (late(x) !== late(y)) return late(x) ? -1 : 1;
    return late(x) ? y.daysAway - x.daysAway : x.daysAway - y.daysAway || x.id.localeCompare(y.id);
  });
}
