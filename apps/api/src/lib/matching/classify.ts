/**
 * Blueprint match classifications. A classification is decision support,
 * never an admission prediction. Hard requirements are evaluated separately
 * and a high preference score can never override an unmet one.
 */
export type MatchClassification =
  | "strong_match"
  | "potential_match"
  | "requirements_not_met"
  | "insufficient_information";

export interface ClassificationInput {
  /** 0-100: weighted share of criteria positively supported by verified evidence. */
  score: number;
  /** 0-100: weighted share of criteria that could be checked at all. */
  evidenceCoverage: number;
  /** Verified hard requirements that the student's profile does not satisfy. */
  unmetRequirements: string[];
  /** Criteria that could not be checked, for the explanation text. */
  missingInformation: string[];
  /**
   * Set only when every core criterion the student chose (study country,
   * degree level, field of study) is supported by verified records; lists
   * those criteria for the explanation. Empty or absent otherwise.
   */
  supportedCoreCriteria?: string[];
}

export const CLASSIFICATION_THRESHOLDS = {
  /** Minimum preference score for a strong match. */
  strongScore: 70,
  /** A strong match also needs most criteria actually checked. */
  strongCoverage: 60,
  /** Below this coverage there is not enough verified information to judge. */
  minimumCoverage: 40,
} as const;

export const CLASSIFICATION_RANK: Record<MatchClassification, number> = {
  strong_match: 0,
  potential_match: 1,
  insufficient_information: 2,
  requirements_not_met: 3,
};

const list = (items: string[], max = 3) => {
  const shown = items.slice(0, max);
  const more = items.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` and ${more} more` : "");
};

export function classifyMatch(input: ClassificationInput): { classification: MatchClassification; reason: string } {
  const { score, evidenceCoverage, unmetRequirements, missingInformation } = input;
  if (unmetRequirements.length > 0) {
    return {
      classification: "requirements_not_met",
      reason: `Verified information shows a requirement is not met: ${list(unmetRequirements)}. A high preference score does not override this.`,
    };
  }
  if (score >= CLASSIFICATION_THRESHOLDS.strongScore && evidenceCoverage >= CLASSIFICATION_THRESHOLDS.strongCoverage) {
    return {
      classification: "strong_match",
      reason: "Available verified information indicates a strong fit across your key criteria. Confirm requirements with the institution.",
    };
  }
  // Core fit is verified: the program may fit even though other requirements
  // (costs, intake, admission criteria) still need confirmation.
  const core = input.supportedCoreCriteria ?? [];
  if (core.length) {
    const named = core.length > 1 ? `${core.slice(0, -1).join(", ")} and ${core.at(-1)}` : core[0];
    return {
      classification: "potential_match",
      reason: `Your ${named} ${core.length > 1 ? "are" : "is"} supported by verified records${missingInformation.length ? `; these still need confirmation: ${list(missingInformation)}` : ""}.`,
    };
  }
  if (evidenceCoverage < CLASSIFICATION_THRESHOLDS.minimumCoverage) {
    return {
      classification: "insufficient_information",
      reason: `Only ${Math.round(evidenceCoverage)}% of your criteria could be checked against current verified records${missingInformation.length ? ` (missing: ${list(missingInformation)})` : ""}.`,
    };
  }
  return {
    classification: "potential_match",
    reason: missingInformation.length
      ? `The school may fit, but these need confirmation: ${list(missingInformation)}.`
      : "The school may fit some of your criteria, but not all of them are supported by verified records.",
  };
}
