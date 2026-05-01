/**
 * buildLedgerHeaderModel — read-only header builder for the "ledger" page family.
 *
 * Ledger records (LEDGER / LOG / AGGREGATE entity classes) are immutable after posting.
 * Only NAVIGATE operations are surfaced — no edit, no mutating actions.
 *
 * Delegates to buildMasterHeaderModel with editMode=false, isDirty=false,
 * and operations pre-filtered to navigation-only.
 */

import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import type { EntityHeaderModel, HeaderTab } from "../types";
import { buildMasterHeaderModel, type MasterHeaderConfig } from "./buildMasterHeaderModel";

export function buildLedgerHeaderModel(
  entity:     CompiledEntity,
  data:       Record<string, unknown>,
  config:     MasterHeaderConfig,
  tabs:       HeaderTab[] | undefined,
  recordId:   string,
  operations: EntityOperation[] | undefined,
): EntityHeaderModel {
  const navOps = (operations ?? []).filter(
    (op) =>
      op.handler_type === "NAVIGATE" &&
      (op.surface === "DETAIL" || op.surface === "BOTH"),
  );
  return buildMasterHeaderModel(entity, data, config, tabs, recordId, navOps, false, false);
}
