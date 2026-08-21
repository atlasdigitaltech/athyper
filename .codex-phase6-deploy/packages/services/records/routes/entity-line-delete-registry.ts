/**
 * Entity-specific line-delete registry.
 *
 * Any entity that has polymorphic children (schedule_line, pricing_component,
 * accounting_distribution) MUST register a handler here. The generic
 * db.deleteFrom(linesTable) path used by records.route.ts would leave orphans
 * and fail the DB-level BLOCK-DELETE triggers.
 *
 * Handler contract:
 *   - Reads current line state under FOR UPDATE
 *   - Enforces lifecycle-usage guard (draft + received/invoiced/released = 0)
 *   - Cleans children in transaction
 *   - Deletes the line
 *   - Throws typed errors carrying .status for HTTP mapping
 *
 * DB trigger error mapping (belt-and-suspenders):
 *   SQLSTATE CL010 → 409 (schedule_line orphan)
 *   SQLSTATE CL011 → 409 (accounting_distribution orphan)
 *   SQLSTATE CL012 → 409 (pricing_component orphan)
 */

import type { Kysely } from "kysely";
import {
  deleteCommitmentLine,
  CommitmentLineHasUsageError,
  CommitmentNotDeletableError,
  CommitmentLineNotFoundError,
  MissingTenantError,
} from "@athyper/svc-business";
import { entityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

export interface EntityLineDeleteContext {
  tenantId:    string;
  parentId:    string;
  lineId:      string;
  principalId: string | null;
}

export interface EntityLineDeleteResult {
  cleanup: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityLineDeleter = (
  db: Kysely<any>,
  ctx: EntityLineDeleteContext,
) => Promise<EntityLineDeleteResult>;

const registry = new Map<string, EntityLineDeleter>();

registry.set("purchase_order", async (db, ctx) => {
  try {
    const result = await deleteCommitmentLine(db, {
      tenantId:         ctx.tenantId,
      commitmentId:     ctx.parentId,
      commitmentLineId: ctx.lineId,
      principalId:      ctx.principalId,
    });
    return { cleanup: {
      schedule_retired: result.scheduleRetired,
      ad_deleted:       result.adDeleted,
      pc_deleted:       result.pcDeleted,
    }};
  } catch (err) {
    // Typed errors from the service already carry .status + .code — rethrow.
    if (err instanceof MissingTenantError
     || err instanceof CommitmentLineNotFoundError
     || err instanceof CommitmentLineHasUsageError
     || err instanceof CommitmentNotDeletableError) {
      throw err;
    }
    // Map DB block-trigger SQLSTATEs to 409 (defensive; service should prevent).
    const anyErr = err as Error & { code?: string };
    if (anyErr.code === "CL010" || anyErr.code === "CL011" || anyErr.code === "CL012") {
      const httpErr = new Error(anyErr.message) as Error & { status: number; code: string };
      httpErr.status = 409;
      httpErr.code   = anyErr.code;
      throw httpErr;
    }
    throw err;
  }
});

// Alias: 'commitment' is the underlying entity code; 'purchase_order' is the view.
registry.set("commitment", registry.get("purchase_order")!);
for (const [name, handler] of registry) entityHandlerRegistryFamily.register("child_delete", name, handler);

export function getEntityLineDeleter(entityCode: string): EntityLineDeleter | null {
  return entityHandlerRegistryFamily.resolve<EntityLineDeleter>("child_delete", entityCode) ?? null;
}
