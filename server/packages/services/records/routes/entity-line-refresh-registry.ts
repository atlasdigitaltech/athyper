/**
 * Entity-specific line-refresh registry.
 *
 * Invoked from records.route.ts patchLineHandler AFTER the line UPDATE has
 * been applied inside the same transaction. Handlers refresh system-owned
 * children (AD distributed amounts, PC computed amounts) whose derivation
 * depends on the line's mutable fields.
 *
 * See:
 *   commitment-line-defaults.service.ts → refreshCommitmentLineChildren
 */

import type { Kysely } from "kysely";
import { refreshCommitmentLineChildren } from "@athyper/svc-business";
import { entityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

export interface EntityLineRefreshContext {
  tenantId:    string;
  parentId:    string;
  lineId:      string;
  principalId: string | null;
}

export interface EntityLineRefreshResult {
  refresh: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityLineRefresher = (
  db: Kysely<any>,
  ctx: EntityLineRefreshContext,
) => Promise<EntityLineRefreshResult>;

const registry = new Map<string, EntityLineRefresher>();

registry.set("purchase_order", async (db, ctx) => {
  const result = await refreshCommitmentLineChildren(db, {
    tenantId:         ctx.tenantId,
    commitmentLineId: ctx.lineId,
    principalId:      ctx.principalId,
  });
  return { refresh: {
    ad_refreshed: result.adRefreshed,
    pc_refreshed: result.pcRefreshed,
  }};
});

registry.set("commitment", registry.get("purchase_order")!);
for (const [name, handler] of registry) entityHandlerRegistryFamily.register("child_refresh", name, handler);

export function getEntityLineRefresher(entityCode: string): EntityLineRefresher | null {
  return entityHandlerRegistryFamily.resolve<EntityLineRefresher>("child_refresh", entityCode) ?? null;
}
