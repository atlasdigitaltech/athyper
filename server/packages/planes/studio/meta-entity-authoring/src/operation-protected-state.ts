import { sql, type Kysely } from "kysely";
import {
  AuthoringPolicyError,
  type MetaEntityOperation,
} from "@athyper/server-contract-meta-entity-authoring";

interface StoredOperationProtection {
  readonly id: string;
  readonly requires_mfa: boolean;
}

/** Called only after the owning change-set row lock has been acquired.
 * The client cannot supply initialization evidence. New operations require a
 * separately qualified governed initialization path, not a database default.
 */
export async function preserveOperationProtectedState(
  db: Kysely<Record<string, never>>,
  changeSetId: string,
  operations: readonly MetaEntityOperation[],
): Promise<readonly MetaEntityOperation[]> {
  if (!operations.length) return operations;
  const stored = await sql<StoredOperationProtection>`
    SELECT o.id,o.requires_mfa
    FROM metadata.entity_operation o
    JOIN metadata.entity_change_set cs ON cs.id=o.change_set_id
      AND cs.entity_id=o.entity_id
      AND cs.tenant_id IS NOT DISTINCT FROM o.tenant_id
    WHERE cs.id=${changeSetId}::uuid
    FOR UPDATE OF o`.execute(db);
  const byId = new Map(stored.rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  return operations.map((operation) => {
    if (!operation.id || seen.has(operation.id)) {
      throw new AuthoringPolicyError(
        "OPERATION_PROTECTED_IDENTITY_REQUIRED",
        "Each operation requires its unique existing draft-owned identity; reload the saved graph.",
      );
    }
    seen.add(operation.id);
    const existing = byId.get(operation.id);
    if (!existing || typeof existing.requires_mfa !== "boolean") {
      throw new AuthoringPolicyError(
        "OPERATION_PROTECTED_SOURCE_REQUIRED",
        "This operation has no verified stored protected state in this draft. A governed initialization source must be qualified before it can be created.",
      );
    }
    if (
      operation.requiresMfa !== undefined &&
      operation.requiresMfa !== existing.requires_mfa
    ) {
      throw new AuthoringPolicyError(
        "OPERATION_PROTECTED_STATE_CHANGE_FORBIDDEN",
        "Ordinary authoring saves cannot change an operation's protected MFA setting.",
      );
    }
    return { ...operation, requiresMfa: existing.requires_mfa };
  });
}
