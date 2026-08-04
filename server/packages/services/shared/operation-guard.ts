/**
 * Shared RBAC guard for entity data operations (export, import, bulk).
 *
 * Originally lived in svc-records. Moved here so svc-finance (and any
 * other downstream service) can reuse the same gate without creating a
 * dependency cycle through svc-records — svc-records imports
 * svc-business + svc-finance + svc-iam + svc-policy and is the natural
 * fan-in for those concerns, so it must not also be a fan-out of this
 * tiny helper.
 *
 * Checks that:
 *  1. An enabled entity_operation row exists for the entity + leaf verb.
 *  2. The current principal has "allow" on the corresponding permission_code.
 *
 * This guard is intentionally separate from entity-operations.route.ts so
 * that the write API routes (export, import, bulk-crud, finance CSV
 * exports) can enforce the same model without going through the
 * operations list endpoint.
 */

import type { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type CheckPermissionBatchFn = (
  db:          AnyDb,
  tenantId:    string,
  principalId: string,
) => Promise<Record<string, { decision: string } | undefined>>;

/**
 * Returns true only when:
 *  - At least one is_enabled=true entity_operation row exists for the entity
 *    whose permission_code ends with `.{operationLeaf}` or equals `{operationLeaf}`.
 *  - checkPermissionBatch resolves that permission_code to "allow".
 *
 * Returns false (deny) when no matching operation is registered, when the
 * principal lacks permission, or when checkPermissionBatch is not wired.
 */
export async function isEntityOperationAllowed(
  db:                   AnyDb,
  entityCode:           string,
  operationLeaf:        string,
  tenantId:             string,
  principalId:          string,
  checkPermissionBatch: CheckPermissionBatchFn | undefined,
): Promise<boolean> {
  if (!checkPermissionBatch) return false;

  // Resolve only the exact catalog operation. Permission suffixes are never
  // interpreted as operations.
  const rows = await db
    .selectFrom("control.entity_operation as eo")
    .innerJoin(
      "control.auth_permission as permission",
      "permission.id",
      "eo.permission_id_v2",
    )
    .select(["permission.canonical_code as permission_code"])
    .where("eo.entity_name" as never, "=" as never, entityCode as never)
    .where("eo.operation_code_v2" as never, "=" as never, operationLeaf as never)
    .where("eo.is_enabled"   as never, "=" as never, true       as never)
    .execute() as { permission_code: string }[];

  const matchingCodes = rows.map((row) => row.permission_code);

  if (matchingCodes.length === 0) return false;

  const decisions = await checkPermissionBatch(db, tenantId, principalId);
  return matchingCodes.some((code) => decisions[code]?.decision === "allow");
}
