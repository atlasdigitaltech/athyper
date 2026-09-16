import { record, rows, type Inspection, type Json } from "./workbench-model";
export function matchingActivation(
  inspection: Inspection,
  tracking: Json,
  target: Json,
): boolean {
  return Boolean(
    inspection.hash &&
    rows(tracking.targets).filter((t) => t.plane === target.plane).length ===
      1 &&
    tracking.releaseId === inspection.id &&
    tracking.contractHash === inspection.hash &&
    target.state === "active" &&
    target.releaseId === inspection.id &&
    target.contractHash === inspection.hash &&
    target.descriptorSourceHash === inspection.hash &&
    typeof target.appliedReleaseId === "string" &&
    target.appliedReleaseId &&
    typeof target.descriptorHash === "string" &&
    target.descriptorHash,
  );
}
/** Imported observations are not signed attestations; validate their coordinates before display. */
export function proofMismatch(
  inspection: Inspection,
  tracking: Json,
  evidence: Json,
): string | undefined {
  const targets = rows(tracking.targets).filter((t) => t.plane === "neon");
  const target = targets[0];
  if (
    targets.length !== 1 ||
    !target ||
    !matchingActivation(inspection, tracking, target)
  )
    return "The selected release is not confirmed active in Neon.";
  if (
    evidence.schema !== "athyper.studio-workbench-neon-verification/2" ||
    evidence.passed !== true
  )
    return "A successful version 2 browser observation is required.";
  if (
    evidence.releaseId !== inspection.id ||
    evidence.contractHash !== inspection.hash ||
    !tracking.tenantId ||
    evidence.tenantId !== tracking.tenantId
  )
    return "The observation belongs to a different release, contract or tenant.";
  const observed = record(evidence.target);
  if (
    observed.releaseId !== target.releaseId ||
    observed.descriptorHash !== target.descriptorHash ||
    observed.appliedReleaseId !== target.appliedReleaseId ||
    observed.activatedAt !== target.activatedAt ||
    evidence.runtimeDescriptorHash !== target.descriptorHash
  )
    return "The observation does not match the current Neon activation and runtime descriptor.";
  if (
    !evidence.surfaceKey ||
    !evidence.fieldKey ||
    typeof evidence.expectedText !== "string" ||
    !evidence.expectedText ||
    typeof evidence.observedAt !== "string" ||
    !Number.isFinite(Date.parse(evidence.observedAt))
  )
    return "The observation is missing surface, field, text or time coordinates.";
  const surfaces = rows(inspection.data.surfaces).filter(
    (s) => s.surfaceKey === evidence.surfaceKey,
  );
  const fields = rows(inspection.data.fields).filter(
    (f) => f.fieldKey === evidence.fieldKey,
  );
  const bindings = rows(inspection.data.surfaceFieldBindings).filter(
    (b) =>
      b.entitySurfaceId === surfaces[0]?.id &&
      b.entityFieldId === fields[0]?.id,
  );
  if (
    surfaces.length !== 1 ||
    fields.length !== 1 ||
    bindings.length !== 1 ||
    (bindings[0]?.labelOverride ?? fields[0]?.fieldKey) !==
      evidence.expectedText
  )
    return "The observed label does not match the selected stored surface field.";
  return undefined;
}
