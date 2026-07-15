import "server-only";

import type { MetaEntitySurface } from "@athyper/runtime-contracts";

/**
 * Builds descriptor-driven identity panels backed by document header fields
 * and live joins to the master identity tables.
 */

export const PROCUREMENT_ENTITY_CODES = [
  "purchase_requisition",
  "commitment",
  "purchase_order",
  "receipt",
  "service_sheet",
  "purchase_invoice",
] as const;

export type ProcurementEntityCode = typeof PROCUREMENT_ENTITY_CODES[number];

export interface IdentitySummaryBuilderOpts {
  /** Override label (default: "Identity"). */
  label?: string;
  /** Override placement order (default: 15). */
  order?: number;
  /** Buyer side owner type (default: "company_code"). */
  buyerOwnerType?: "company_code" | "customer";
  /** Seller side owner type (default: "supplier"). */
  sellerOwnerType?: "supplier" | "company_code";
}

export function buildIdentitySummarySurface(
  entityCode: ProcurementEntityCode,
  opts: IdentitySummaryBuilderOpts = {},
): MetaEntitySurface {
  return {
    kind:      "document_identity_summary",
    key:       `${entityCode}__document_identity_summary`,
    label:     opts.label ?? "Identity",
    order:     opts.order ?? 15,
    placement: "main",
    enabled:   true,
    config: {
      buyer_owner_type:  opts.buyerOwnerType  ?? "company_code",
      seller_owner_type: opts.sellerOwnerType ?? "supplier",
      doc_entity_code:   entityCode,
      docType:           entityCode,
    },
  };
}

export const buildIdentityPanelV2Surface = buildIdentitySummarySurface;
