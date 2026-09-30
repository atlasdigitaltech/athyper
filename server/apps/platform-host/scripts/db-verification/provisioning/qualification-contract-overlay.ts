import { validatePartnerSectionPublication } from "../../../src/composition/spaces/neon/partner-section-contract.js";
export const qualificationContractArtifactKeys = ["business_partner/presentation.section.qualifications-certificates"] as const;
/** Upgrade only the decision handler binding, never repurpose a historical combined section. */
export function qualificationContractOverlay(baseline: readonly Record<string, any>[], sources: readonly Record<string, any>[]) {
  const key = qualificationContractArtifactKeys[0];
  if (sources.length !== 1 || sources[0]?.artifactKey !== key || sources[0]?.dataBinding?.handlerKey !== "neon.bp.section.qualifications.v2") throw Error("QUALIFICATION_CONTRACT_SOURCE_INVALID");
  const result = structuredClone([...baseline]);
  const section = result.find(a => a.artifactKey === key);
  if (!section || section.childCollections?.length) throw Error("QUALIFICATION_CONTRACT_BASELINE_INVALID");
  section.dataBinding.handlerKey = sources[0].dataBinding.handlerKey;
  validatePartnerSectionPublication(result);
  return result;
}
