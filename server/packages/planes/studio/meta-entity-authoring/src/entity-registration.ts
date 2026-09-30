import type { MetaEntityAuthoringRepository } from "@athyper/server-contract-meta-entity-authoring";
type Registration = NonNullable<
  Parameters<MetaEntityAuthoringRepository["createDraft"]>[0]["registration"]
>;

/** Explicit draft identity registration. Never a publication, global definition,
 * or authorization ownership decision. Runtime ownership belongs to its profile. */
export function parseEntityRegistration(
  value: unknown,
): Registration | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Entity registration object required");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(",") !==
      "entityClass,moduleCode,ownershipModel,schemaVersion" ||
    row.schemaVersion !== 1 ||
    typeof row.moduleCode !== "string" ||
    !/^[a-z][a-z0-9_]{1,62}$/.test(row.moduleCode) ||
    typeof row.entityClass !== "string" ||
    ![
      "business",
      "configuration",
      "reference",
      "process",
      "projection",
      "technical",
    ].includes(row.entityClass) ||
    typeof row.ownershipModel !== "string" ||
    !["tenant", "overlay"].includes(row.ownershipModel)
  )
    throw new TypeError("Invalid entity registration v1");
  return { ...row } as Registration;
}
