import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import bundle from "../data/directory-seed.json";
import type { institutionDirectoryTable, institutionFactsTable } from "@workspace/db";

type Institution = typeof institutionDirectoryTable.$inferInsert;
type Fact = typeof institutionFactsTable.$inferInsert;
type SerializedInstitution = Omit<Institution, "lastUpdatedAt" | "lastVerifiedAt" | "dliVerifiedAt"> & {
  lastUpdatedAt: string; lastVerifiedAt?: string | null; dliVerifiedAt?: string | null;
};
type SerializedFact = Omit<Fact, "lastVerifiedAt" | "importedAt"> & {
  lastVerifiedAt?: string | null; importedAt: string;
};

function date(value: string | null | undefined) {
  if (!value) return null;
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error("Invalid timestamp in the source snapshot.");
  return result;
}

function decode() {
  const bytes = gunzipSync(Buffer.from(bundle.gzipBase64, "base64"), { maxOutputLength: 50 * 1024 * 1024 });
  if (createHash("sha256").update(bytes).digest("hex") !== bundle.sha256) {
    throw new Error("Directory source snapshot checksum failed. No import was attempted.");
  }
  const parsed = JSON.parse(bytes.toString("utf8")) as {
    format: string; exportedAt: string; institutions: SerializedInstitution[]; facts: SerializedFact[];
    sources: { source: string; sourceUrl: string; reportingYear?: string; release?: string; scope?: string }[];
  };
  if (parsed.format !== "unipath-directory-snapshot-v1" ||
    parsed.institutions.length !== bundle.counts.institutions || parsed.facts.length !== bundle.counts.facts) {
    throw new Error("Directory source snapshot manifest does not match its records.");
  }
  const ids = new Set(parsed.institutions.map((row) => row.id));
  if (ids.size !== parsed.institutions.length ||
    new Set(parsed.facts.map((row) => row.id)).size !== parsed.facts.length ||
    parsed.facts.some((row) => !ids.has(row.institutionId))) {
    throw new Error("Directory source snapshot contains duplicate IDs or orphan facts.");
  }
  const institutions: Institution[] = parsed.institutions.map((row) => ({
    ...row, lastUpdatedAt: date(row.lastUpdatedAt)!,
    lastVerifiedAt: date(row.lastVerifiedAt), dliVerifiedAt: date(row.dliVerifiedAt),
  }));
  const facts: Fact[] = parsed.facts.map((row) => ({
    ...row, lastVerifiedAt: date(row.lastVerifiedAt), importedAt: date(row.importedAt)!,
  }));
  return { institutions, facts, sources: parsed.sources, exportedAt: parsed.exportedAt,
    fingerprint: bundle.sha256, counts: bundle.counts };
}

// Decode and verify once per process. The small compressed bundle ships in the API build.
export const directorySnapshot = decode();
