import { exactObject, parseDevPublicationTarget, requireUuid, type DevPublicationTarget } from "../policy/dev-publication-policy.js";

export const DEV_REVIEW_REASONS = ["BASELINE_REQUIRED", "TARGET_NOT_ENROLLED", "TARGET_MISMATCH", "REFERENCE_SHAPE_INVALID", "UNSUPPORTED_CHANGE", "INVALID_PRESENTATION"] as const;
export type DevReviewReason = typeof DEV_REVIEW_REASONS[number];
/** A machine assessment, explicitly NOT approval, signing evidence or activation authority.
 * Hashes identify canonical JSON inputs under dev-assessment-json/1, not historical
 * release hashes. Receipt authenticity/current authority need a separate future verifier.
 */
export interface DevPublicationAssessment {
  readonly schema: "athyper.dev-publication-assessment/1";
  readonly authority: "none";
  readonly hashSchema: "dev-assessment-json/1";
  readonly policyId: string;
  readonly policyRevision: number;
  readonly policyHash: string;
  readonly candidateHash: string;
  readonly baselineHash: string | null;
  readonly target: DevPublicationTarget;
  readonly initiatingPrincipalId: string;
  readonly assessorId: string;
  readonly assessedAt: string;
  readonly outcome: "eligible" | "review_required";
  readonly reasons: readonly DevReviewReason[];
  readonly changedPaths: readonly string[];
}
export function parseDevPublicationAssessment(value: unknown): DevPublicationAssessment {
  const row = exactObject(value, ["schema", "authority", "hashSchema", "policyId", "policyRevision", "policyHash", "candidateHash", "baselineHash", "target", "initiatingPrincipalId", "assessorId", "assessedAt", "outcome", "reasons", "changedPaths"]);
  if (row.schema !== "athyper.dev-publication-assessment/1" || row.authority !== "none" || row.hashSchema !== "dev-assessment-json/1") throw new TypeError("DEV_ASSESSMENT_VERSION_OR_AUTHORITY_INVALID");
  if (typeof row.policyId !== "string" || !/^[a-z][a-z0-9_.-]{1,126}$/.test(row.policyId)
    || !Number.isSafeInteger(row.policyRevision) || Number(row.policyRevision) < 1) throw new TypeError("DEV_ASSESSMENT_POLICY_INVALID");
  for (const name of ["policyHash", "candidateHash", "baselineHash"]) {
    if (name === "baselineHash" && row[name] === null) continue;
    if (typeof row[name] !== "string" || !/^sha256:[a-f0-9]{64}$/.test(row[name] as string)) throw new TypeError("DEV_ASSESSMENT_HASH_INVALID");
  }
  const target = parseDevPublicationTarget(row.target);
  requireUuid(row.initiatingPrincipalId); requireUuid(row.assessorId);
  if (typeof row.assessedAt !== "string" || !Number.isFinite(Date.parse(row.assessedAt)) || new Date(row.assessedAt).toISOString() !== row.assessedAt) throw new TypeError("DEV_ASSESSMENT_TIME_INVALID");
  if (typeof row.outcome !== "string" || !["eligible", "review_required"].includes(row.outcome) || !Array.isArray(row.reasons)
    || Array.from(row.reasons).some(reason => !DEV_REVIEW_REASONS.includes(reason)) || new Set(row.reasons).size !== row.reasons.length
    || (row.outcome === "eligible" ? row.reasons.length !== 0 || row.baselineHash === null : row.reasons.length === 0)) throw new TypeError("DEV_ASSESSMENT_OUTCOME_INVALID");
  if (row.baselineHash === null && !row.reasons.includes("BASELINE_REQUIRED")) throw new TypeError("DEV_ASSESSMENT_BASELINE_REQUIRED");
  if (!Array.isArray(row.changedPaths) || Array.from(row.changedPaths).some(path => typeof path !== "string" || !/^(?:\/(?:[^~]|~[01])*)*$/.test(path))
    || new Set(row.changedPaths).size !== row.changedPaths.length) throw new TypeError("DEV_ASSESSMENT_PATH_INVALID");
  return Object.freeze({ ...row, target, reasons: Object.freeze([...row.reasons]), changedPaths: Object.freeze([...row.changedPaths]) }) as unknown as DevPublicationAssessment;
}
