import { adzunaProvider } from "./adzuna";
import type { JobProvider } from "./types";

/** Add Jooble or a university career portal adapter here; routes need no change. */
export const jobProviders: readonly JobProvider[] = [adzunaProvider];

export const getProvider = (id: string) => jobProviders.find(p => p.id === id);
export * from "./types";
