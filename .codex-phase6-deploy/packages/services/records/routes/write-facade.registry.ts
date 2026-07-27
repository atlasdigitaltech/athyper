/**
 * Write-facade registry — thin adapter between the generic records route
 * and view-backed entity write services that live in the business package.
 *
 * Eligibility for facade dispatch is intentionally narrow:
 *   table.backing_type !== 'table'
 *   AND table.feature_flags.write_facade === '<RegisteredName>'
 *   AND action === 'create'
 *
 * Nothing else. PATCH/DELETE on view-backed entities still return 403
 * (ENTITY_WRITE_FACADE_UNSUPPORTED_ACTION) until a real need surfaces.
 * Lifecycle transitions on view-backed entities go through the action
 * dispatcher, not generic PATCH.
 */

import type { Kysely } from "kysely";
import {
  createPurchaseOrderViaFacade,
  type PurchaseOrderFacadeOutcome,
} from "@athyper/svc-business";
import { entityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type WriteFacadeAction = "create";

export type WriteFacadeOutcome = PurchaseOrderFacadeOutcome;

export interface WriteFacadeCreateArgs {
  db:          AnyDb;
  tenantId:    string;
  principalId: string;
  input:       Record<string, unknown>;
}

export interface WriteFacade {
  create(args: WriteFacadeCreateArgs): Promise<WriteFacadeOutcome>;
}

const BUILTIN_WRITE_FACADES: Record<string, WriteFacade> = {
  PurchaseOrderFacade: {
    create: ({ db, tenantId, principalId, input }) =>
      createPurchaseOrderViaFacade(db, { tenantId, principalId, input }),
  },
};

for (const [name, facade] of Object.entries(BUILTIN_WRITE_FACADES)) {
  entityHandlerRegistryFamily.register("write_facade", name, facade);
}

export function getWriteFacade(name: string): WriteFacade | undefined {
  return entityHandlerRegistryFamily.resolve<WriteFacade>("write_facade", name);
}

export function isWriteFacadeRegistered(name: string): boolean {
  return getWriteFacade(name) !== undefined;
}

export function listWriteFacades(): string[] {
  return entityHandlerRegistryFamily.list("write_facade");
}
