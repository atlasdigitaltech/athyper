import type { EntityAuthorizationProfileV1 } from "./entity-authorization.js";
/** Separately versioned admission contract. It must be bound into a new signed
 * release; existing v1 profiles and intersection adapters do not opt in. */
export interface EntityCanonicalReadAdmissionV1 {
  readonly schemaVersion: 1;
  readonly kind: "entity_canonical_read_admission";
  readonly entityCode: string;
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly profileHash: string;
  readonly reviewRevision: string;
  readonly transitions: readonly {
    readonly operationKey: string;
    readonly sourcePermissionCode: string;
    readonly targetPermissionCode: string;
  }[];
}
const hash = /^[a-f0-9]{64}$/,
  name = /^[a-z][a-z0-9_.-]{0,159}$/;
function exact(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error("CANONICAL_ADMISSION_INVALID");
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).length !== keys.length ||
    Object.keys(object).some((k) => !keys.includes(k))
  )
    throw Error("CANONICAL_ADMISSION_INVALID");
  return object;
}
export function parseEntityCanonicalReadAdmission(
  raw: unknown,
  profile: EntityAuthorizationProfileV1,
  profileHash: string,
): EntityCanonicalReadAdmissionV1 {
  const value = exact(raw, [
    "schemaVersion",
    "kind",
    "entityCode",
    "planeKey",
    "profileHash",
    "reviewRevision",
    "transitions",
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "entity_canonical_read_admission" ||
    value.entityCode !== profile.entityCode ||
    value.planeKey !== profile.planeKey ||
    typeof value.profileHash !== "string" ||
    !hash.test(value.profileHash) ||
    value.profileHash !== profileHash ||
    typeof value.reviewRevision !== "string" ||
    !hash.test(value.reviewRevision) ||
    !Array.isArray(value.transitions) ||
    !value.transitions.length ||
    value.transitions.length > 256
  )
    throw Error("CANONICAL_ADMISSION_INVALID");
  const seen = new Set<string>();
  const transitions = value.transitions.map((raw) => {
    const row = exact(raw, [
      "operationKey",
      "sourcePermissionCode",
      "targetPermissionCode",
    ]);
    for (const key of Object.keys(row))
      if (typeof row[key] !== "string" || !name.test(row[key] as string))
        throw Error("CANONICAL_ADMISSION_INVALID");
    const operation = profile.operations.find(
      (o) => o.key === row.operationKey,
    );
    if (
      !operation ||
      operation.effect !== "read" ||
      profile.deferredOperations?.includes(operation.key) ||
      operation.permissionCode !== row.targetPermissionCode ||
      row.sourcePermissionCode === row.targetPermissionCode ||
      seen.has(operation.key)
    )
      throw Error("CANONICAL_ADMISSION_OPERATION_INVALID");
    seen.add(operation.key);
    return Object.freeze({
      ...row,
    }) as EntityCanonicalReadAdmissionV1["transitions"][number];
  });
  if (
    transitions.some(
      (row) =>
        profile.operations.find(
          (operation) => operation.key === row.operationKey,
        )?.requiresParentRead,
    ) &&
    !seen.has(profile.recordReadOperation)
  )
    throw Error("CANONICAL_ADMISSION_PARENT_READ_REQUIRED");
  return Object.freeze({
    ...value,
    transitions: Object.freeze(transitions),
  }) as unknown as EntityCanonicalReadAdmissionV1;
}
