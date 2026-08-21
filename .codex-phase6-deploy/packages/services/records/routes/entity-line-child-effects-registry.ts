/**
 * Entity-specific line child effects.
 *
 * These run after a line row is created/updated and are intended for
 * controlled child-row mutations driven by scalar line fields. They complement
 * source-change scalar resolvers; they do not replace them.
 */

import type { Kysely } from "kysely";
import {
  refreshCommitmentHeaderAmounts,
  syncCommitmentLineTaxComponentFromTaxGroup,
} from "@athyper/svc-business";
import { entityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

export interface EntityLineChildEffectContext {
  tenantId:      string;
  parentId:      string;
  lineId:        string;
  principalId:   string | null;
  changedFields: readonly string[];
  mode:          "create" | "update";
}

export interface EntityLineChildEffectResult {
  effects: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityLineChildEffect = (
  db: Kysely<any>,
  ctx: EntityLineChildEffectContext,
) => Promise<EntityLineChildEffectResult>;

const registry = new Map<string, EntityLineChildEffect>();

registry.set("purchase_order", async (db, ctx) => {
  let taxDeleted = 0;
  let taxInserted = 0;
  if (ctx.mode === "create" || ctx.changedFields.includes("tax_group_id")) {
    const result = await syncCommitmentLineTaxComponentFromTaxGroup(db, {
      tenantId:         ctx.tenantId,
      commitmentId:     ctx.parentId,
      commitmentLineId: ctx.lineId,
      principalId:      ctx.principalId,
    });
    taxDeleted = result.deleted;
    taxInserted = result.inserted;
  }
  const header = await refreshCommitmentHeaderAmounts(db, {
    tenantId: ctx.tenantId,
    commitmentId: ctx.parentId,
    principalId: ctx.principalId,
  });
  return {
    effects: {
      tax_pc_deleted:  taxDeleted,
      tax_pc_inserted: taxInserted,
      header_total_amount: header.totalAmount,
      header_scheduled_amount: header.scheduledAmount,
    },
  };
});

registry.set("commitment", registry.get("purchase_order")!);
for (const [name, handler] of registry) entityHandlerRegistryFamily.register("child_effect", name, handler);

export function getEntityLineChildEffect(entityCode: string): EntityLineChildEffect | null {
  return entityHandlerRegistryFamily.resolve<EntityLineChildEffect>("child_effect", entityCode) ?? null;
}
