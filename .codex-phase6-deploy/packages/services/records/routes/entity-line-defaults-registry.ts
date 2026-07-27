/**
 * Entity-specific line-defaults registry.
 *
 * Invoked from records.route.ts createLineHandler AFTER the line INSERT has
 * been committed inside the same transaction. Handlers are responsible for
 * idempotent default creation (AD, PC copy, etc.).
 *
 * See:
 *   commitment-line-defaults.service.ts → applyCommitmentLineDefaults
 */

import type { Kysely } from "kysely";
import { applyCommitmentLineDefaults } from "@athyper/svc-business";
import { entityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

export interface EntityLineDefaultsContext {
  tenantId:    string;
  parentId:    string;
  lineId:      string;
  principalId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityLineDefaulter = (
  db: Kysely<any>,
  ctx: EntityLineDefaultsContext,
) => Promise<void>;

const registry = new Map<string, EntityLineDefaulter>();

registry.set("purchase_order", async (db, ctx) => {
  await applyCommitmentLineDefaults(db, {
    tenantId:         ctx.tenantId,
    commitmentId:     ctx.parentId,
    commitmentLineId: ctx.lineId,
    principalId:      ctx.principalId,
  });
});

registry.set("commitment", registry.get("purchase_order")!);
for (const [name, handler] of registry) entityHandlerRegistryFamily.register("child_defaults", name, handler);

export function getEntityLineDefaulter(entityCode: string): EntityLineDefaulter | null {
  return entityHandlerRegistryFamily.resolve<EntityLineDefaulter>("child_defaults", entityCode) ?? null;
}
