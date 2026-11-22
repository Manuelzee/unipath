/**
 * Server-side plan entitlements. The browser never decides access.
 *
 * Billing is deliberately not connected (see routes/billing.ts), so no student
 * can hold a paid plan yet and every account resolves to "free". Every tool
 * that works today stays available on Free; paid plans only raise limits once a
 * verified provider subscription exists. Prices live in the frontend catalog and
 * are unchanged.
 */
export type PlanId = "free" | "student-plus" | "premium";

export interface PlanLimits {
  /** Successful AI assistant and essay-review requests per UTC day. */
  aiDailyRequests: number;
}

function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 && value <= 10_000 ? value : fallback;
}

export function planLimits(plan: PlanId): PlanLimits {
  switch (plan) {
    case "premium": return { aiDailyRequests: envLimit("AI_DAILY_LIMIT_PREMIUM", 100) };
    case "student-plus": return { aiDailyRequests: envLimit("AI_DAILY_LIMIT_PLUS", 40) };
    default: return { aiDailyRequests: envLimit("AI_DAILY_LIMIT_FREE", 15) };
  }
}

/**
 * Resolve the student's plan. Returns "free" until a payment provider is
 * connected and a verified, active subscription record exists for this user.
 */
export async function planFor(_userId: string): Promise<PlanId> {
  return "free";
}
