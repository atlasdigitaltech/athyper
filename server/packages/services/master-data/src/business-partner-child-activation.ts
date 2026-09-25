import { MasterDataError } from "./errors.js";

export const childActivationKinds = [
  "identifier", "tax_registration", "relationship", "governance_relation",
  "commodity_capability", "commodity_classification", "industry_classification",
  "certificate_evidence",
] as const;

/** Capture only coordinates. Fingerprints and lifecycle authority are server-owned. */
export function parseChildActivation(value: unknown) {
  const invalid = () => new MasterDataError(400, "BP_CHILD_ACTIVATION_INVALID", "Select 1–50 distinct draft child records for activation");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const proposal = value as Record<string, unknown>;
  if (Object.keys(proposal).some(key => !["schema", "items"].includes(key)) ||
      proposal.schema !== "athyper.bp-child-activation/1" ||
      !Array.isArray(proposal.items) || !proposal.items.length || proposal.items.length > 50) throw invalid();
  const seen = new Set<string>();
  const items = proposal.items.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
    const item = value as Record<string, unknown>;
    if (Object.keys(item).some(key => !["kind", "id", "attachmentId"].includes(key)) ||
        !childActivationKinds.includes(item.kind as never) || typeof item.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id)) throw invalid();
    const id = item.id.toLowerCase(), kind = item.kind as typeof childActivationKinds[number];
    if (kind === "certificate_evidence" ? typeof item.attachmentId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.attachmentId) : item.attachmentId !== undefined) throw invalid();
    if (seen.has(`${kind}:${id}`)) throw invalid();
    seen.add(`${kind}:${id}`);
    return { kind, id, ...(kind === "certificate_evidence" ? { attachmentId: String(item.attachmentId).toLowerCase() } : {}) };
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { schema: "athyper.bp-child-activation/1" as const, items };
}
