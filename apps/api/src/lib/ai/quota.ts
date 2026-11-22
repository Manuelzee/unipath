import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { aiUsageTable, db } from "@workspace/db";
import { planFor, planLimits } from "../entitlements";

/** Start of the current UTC day; quotas reset at 00:00 UTC. */
export function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function usageToday(userId: string) {
  const plan = await planFor(userId);
  const { aiDailyRequests: dailyLimit } = planLimits(plan);
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(aiUsageTable)
    .where(and(eq(aiUsageTable.userId, userId), eq(aiUsageTable.outcome, "ok"), gte(aiUsageTable.createdAt, utcDayStart())));
  const usedToday = row?.count ?? 0;
  return { plan, dailyLimit, usedToday, remainingToday: Math.max(0, dailyLimit - usedToday) };
}

export async function recordUsage(userId: string, kind: "chat" | "essay_review", outcome: "ok" | "provider_error",
  tokens: { promptTokens: number | null; completionTokens: number | null } = { promptTokens: null, completionTokens: null }) {
  await db.insert(aiUsageTable).values({ userId, kind, outcome, ...tokens });
}

/** An opaque per-user reference for the provider's abuse monitoring. */
export function providerUserRef(userId: string) {
  return createHash("sha256").update(`unipath:${userId}`).digest("hex").slice(0, 32);
}
