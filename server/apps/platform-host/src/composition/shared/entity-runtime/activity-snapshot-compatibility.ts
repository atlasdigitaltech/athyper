import { canonicalJson } from "@athyper/server-service-records";

/** Compare the record interpretation, not the release-specific artifact hash.
 * Caller must obtain historical artifacts from verified, previously activated,
 * tenant-scoped immutable payloads. Current admission and field authorization
 * remain mandatory. This is exact equivalence, not a schema migration mapper. */
export function equivalentSnapshotRecordContract(previous: unknown, current: unknown): boolean {
  function shape(value: unknown) {
    if (!value || typeof value !== "object") return;
    const artifact = value as Record<string, any>;
    const d = artifact.content?.descriptor;
    if (artifact.artifactType !== "runtime_contract" || !d
      || typeof artifact.entityCode !== "string" || typeof artifact.plane !== "string"
      || typeof d.source?.entity_id !== "string" || !d.storage
      || !Array.isArray(d.fields) || !d.fields.length
      || typeof d.schema !== "string") return;
    return {
      entityId: d.source.entity_id,
      entityCode: artifact.entityCode,
      plane: artifact.plane,
      schema: d.schema,
      storage: d.storage,
      // Include all field constraints/bindings; even a same-key type change is
      // incompatible. Presentation-only releases may change other artifacts.
      fields: d.fields,
    };
  }
  const a = shape(previous), b = shape(current);
  return !!a && !!b && canonicalJson(a) === canonicalJson(b);
}
