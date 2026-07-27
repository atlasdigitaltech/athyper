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
  personaId:   string,
) => Promise<Record<string, { decision: string } | undefined>>;

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

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

  // Find enabled operation rows for this entity, match by leaf verb.
  const rows = await db
    .selectFrom("control.entity_operation as eo")
    .select(["eo.permission_code"])
    .where("eo.entity_name" as never, "=" as never, entityCode as never)
    .where("eo.is_enabled"   as never, "=" as never, true       as never)
    .execute() as { permission_code: string }[];

  const matchingCodes = rows
    .map((r) => r.permission_code)
    .filter((code) => code === operationLeaf || code.endsWith(`.${operationLeaf}`));

  if (matchingCodes.length === 0) return false;

  // Resolve the principal's persona (same pattern as entity-operations.route.ts).
  const personaRow = await db
    .selectFrom("master.principal_persona as pp" as never)
    .select(["pp.persona_id"] as never[])
    .where("pp.tenant_id"   as never, "=" as never, tenantId    as never)
    .where("pp.principal_id" as never, "=" as never, principalId as never)
    .executeTakeFirst() as { persona_id: string } | undefined;

  const personaId = personaRow?.persona_id ?? ZERO_UUID;

  const decisions = await checkPermissionBatch(db, tenantId, principalId, personaId);
  return matchingCodes.some((code) => decisions[code]?.decision === "allow");
}
