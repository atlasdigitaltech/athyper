/** Explicit response contracts, including the two historically published v1 shapes. */
export function partnerSectionContract(section: Record<string, any>): "certificates" | "legacy-combined" | "qualifications" | "restrictions" | undefined {
  const handler = section.dataBinding?.handlerKey;
  const supported = ["neon.bp.section.certificates.v1", "neon.bp.section.qualifications-certificates.v1", "neon.bp.section.qualifications.v2", "neon.bp.section.restrictions.v1"];
  if (!supported.includes(handler)) return undefined;
  const children = section.childCollections ?? [];
  const fields = section.fieldBindings ?? [];
  const child = (key: string, core: string) => children.some((c: any) => c.key === key && c.coreRef === core);
  const field = (key: string) => fields.some((f: any) => f.fieldKey === key);
  if (!Array.isArray(children) || !Array.isArray(fields) || section.dataBinding.ownerEntityCode !== "business_partner")
    throw Error("PARTNER_SECTION_CONTRACT_MISMATCH");
  if (handler === "neon.bp.section.certificates.v1" && section.sectionKey === "certificates" && section.coreRef === "certification/core.json" && children.length === 1 && child("certifications", "certification/core.json")) return "certificates";
  if (section.sectionKey === "qualifications-certificates" && section.coreRef === "business_partner_qualification/core.json") {
    if (handler === "neon.bp.section.qualifications-certificates.v1" && children.length === 2 && child("qualifications", "business_partner_qualification/core.json") && child("certifications", "certification/core.json") && !fields.length) return "legacy-combined";
    // Transitional v1 decision publications remain readable until their metadata is upgraded.
    if (["neon.bp.section.qualifications-certificates.v1", "neon.bp.section.qualifications.v2"].includes(handler) && !children.length && field("decision") && field("coverage")) return "qualifications";
  }
  if (handler === "neon.bp.section.restrictions.v1" && section.sectionKey === "restrictions" && section.coreRef === "business_partner_restriction/core.json" && !children.length && field("status") && field("coverage")) return "restrictions";
  throw Error("PARTNER_SECTION_CONTRACT_MISMATCH");
}

export function validatePartnerSectionPublication(artifacts: readonly Record<string, any>[]): void {
  for (const artifact of artifacts) {
    if (!String(artifact.artifactKey).startsWith("business_partner/")) continue;
    const kind = partnerSectionContract(artifact);
    if (kind === "qualifications" && artifact.dataBinding.handlerKey !== "neon.bp.section.qualifications.v2")
      throw Error("PARTNER_QUALIFICATIONS_V2_REQUIRED");
    if (["certificates", "restrictions", "qualifications-certificates"].includes(artifact.sectionKey) && !kind)
      throw Error("PARTNER_SECTION_HANDLER_UNSUPPORTED");
  }
}
