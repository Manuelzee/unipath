import snapshot from "../data/us-colleges-2025.json";
import { institutionDirectoryTable } from "@workspace/db";

export type IpedsRecord = {
  unitid: string; name: string; city: string; state: string; website: string;
  admissionsWebsite?: string; applicationWebsite?: string; financialAidWebsite?: string;
  sector: string; institutionType: string; level: string; degreeLevels: string[];
};

export const bundledIpedsRecords: IpedsRecord[] = snapshot;

export function institutionCountry(state: string) {
  const associated: Record<string, string> = {
    FM: "Federated States of Micronesia", MH: "Marshall Islands", PW: "Palau",
  };
  return associated[state]
    ? { country: associated[state], countryCode: state }
    : { country: "United States", countryCode: "US" };
}

function website(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return ["https:", "http:"].includes(url.protocol) && url.hostname.includes(".") &&
      !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function ipedsRow(record: IpedsRecord, updatedAt: Date): typeof institutionDirectoryTable.$inferInsert {
  const ipedsId = Number(record.unitid);
  if (!Number.isInteger(ipedsId) || ipedsId <= 0 || !record.name?.trim()) {
    throw new Error("Invalid source institution identifier or name.");
  }
  const sector = Number(record.sector);
  const ownership = [1, 4, 7].includes(sector) ? "Public" :
    [2, 5, 8].includes(sector) ? "Private nonprofit" :
    [3, 6, 9].includes(sector) ? "Private for-profit" : null;
  return {
    id: `nces-${ipedsId}`, ipedsId, scorecardId: null,
    name: record.name, city: record.city || "", state: record.state || "",
    ...institutionCountry(record.state || ""),
    institutionType: record.institutionType || "Not reported", ownership,
    degreeLevels: record.degreeLevels ?? [], degreeTypes: [], majors: [],
    website: website(record.website), admissionsWebsite: website(record.admissionsWebsite),
    applicationWebsite: website(record.applicationWebsite), financialAidWebsite: website(record.financialAidWebsite),
    tuitionInStateUsd: null, tuitionInStateYear: null, tuitionOutOfStateUsd: null, tuitionOutOfStateYear: null,
    admissionRate: null, admissionRateYear: null, completionRate: null, completionRateYear: null,
    completionRateType: null, pellGrantRate: null, pellGrantRateYear: null, medianDebtUsd: null, medianDebtYear: null,
    dataSource: "NCES IPEDS", dataYear: "2025–26",
    sourceUrl: `https://nces.ed.gov/collegenavigator/?id=${ipedsId}`,
    isActive: true, lastUpdatedAt: updatedAt,
  };
}
