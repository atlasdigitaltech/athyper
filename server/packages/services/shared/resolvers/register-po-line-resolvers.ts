/**
 * Resolvers: purchase_order commitment_line snapshot/hydrate resolvers.
 *
 * These resolvers back the on_source_change cascades registered on
 * control.entity_field for commitment_line (see 042c_commitment_contract.sql
 * Block 9). The concrete implementations are stubs today; each stub returns
 * null which the runtime treats as "no patch" — the field keeps its existing
 * value. Real implementations will land in a follow-up sprint.
 *
 * Registering the contract stubs now unblocks:
 *   - verify-resolver-contracts.ts (CI drift check)
 *   - entity_field.defaults.on_source_change references from Block 9
 *
 * Order this module in register-all.ts BEFORE any code that reads the
 * resolver registry (typically last during boot).
 */

import { asResolverCode, type ResolverContract } from "@athyper/cascade";
import { registerResolver, type ServerResolver } from "./registry.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopResolver: ServerResolver<any> = async () => null;

const PR_LINE_SNAPSHOT: ResolverContract = {
  code:            asResolverCode("purchase_requisition_line.snapshot"),
  description:     "Snapshots a purchase_requisition_line into a commitment_line during PR→PO conversion.",
  requiredSources: ["requisition_line_id"],
  outputType:      "object",
  targetEntity:    "commitment_line",
};

const CONTRACT_LINE_SNAPSHOT: ResolverContract = {
  code:            asResolverCode("contract_line.snapshot_pricing"),
  description:     "Snapshots contract-typed commitment_line pricing/tax/tolerance snapshot into a downstream commitment_line.",
  requiredSources: ["parent_contract_line_id"],
  outputType:      "object",
  targetEntity:    "commitment_line",
};

const CATALOG_LINE_SNAPSHOT: ResolverContract = {
  code:            asResolverCode("catalog_line.snapshot_pricing"),
  description:     "Snapshots catalog line pricing into a commitment_line when line_type=catalog.",
  requiredSources: ["item_id"],
  outputType:      "object",
  targetEntity:    "commitment_line",
};

const ITEM_DEFAULT_METADATA: ResolverContract = {
  code:            asResolverCode("item.default_metadata"),
  description:     "Hydrates commodity/business_intent/asset_class/uom/tolerances from master.item for noncatalog lines.",
  requiredSources: ["item_id"],
  outputType:      "object",
  targetEntity:    "commitment_line",
};

const SUPPLIER_PRICE_LIST_EFFECTIVE: ResolverContract = {
  code:            asResolverCode("supplier_price_list.effective_price"),
  description:     "Resolves effective unit_price for (item, supplier, quantity, today) from master.supplier_price_list.",
  requiredSources: ["item_id", "supplier_id", "quantity"],
  outputType:      "object",
  targetEntity:    "commitment_line",
};

export function registerPurchaseOrderLineResolvers(): void {
  registerResolver(PR_LINE_SNAPSHOT,           noopResolver);
  registerResolver(CONTRACT_LINE_SNAPSHOT,     noopResolver);
  registerResolver(CATALOG_LINE_SNAPSHOT,      noopResolver);
  registerResolver(ITEM_DEFAULT_METADATA,      noopResolver);
  registerResolver(SUPPLIER_PRICE_LIST_EFFECTIVE, noopResolver);
}
