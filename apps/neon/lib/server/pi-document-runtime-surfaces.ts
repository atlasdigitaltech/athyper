import "server-only";

/**
 * apps/neon — Purchase Invoice document-runtime surface injection.
 *
 * Cleanup Plan v5 §P6 (PI descriptor surface injection).
 *
 * Why injection (not a DDL row in control.entity_surface):
 *   - control.entity_surface does not exist as a stored table. Surfaces
 *     are produced by compileMetaEntityRuntimeDescriptor() from compiled
 *     entity metadata, not stored row-by-row. A generic stored surface
 *     registry is out of scope for the PI cutover; we inject the 4
 *     document-runtime surfaces at descriptor-resolution time.
 *
 * The four surfaces returned here are:
 *   1. document_header         — composer "purchase_invoice"
 *                                (registered in bootstrap-document-runtime.ts);
 *                                sidecar "payment_terms"
 *   2. polymorphic_pc_lines    — bindings purchase_invoice__purchase_invoice_line
 *                                + purchase_invoice__pricing_component
 *                                + purchase_invoice__accounting_distribution
 *                                (seeded by 049_document_runtime_registry.sql);
 *                                lookups pi_discount_condition_types +
 *                                pi_tax_groups (same seed)
 *   3. header_scope_pc_strip   — sibling to (2); reads the same PC binding
 *                                via the DocumentRuntimeContext (no extra fetch)
 *   4. postings_preview        — strategy "ap_invoice"
 *                                (registered in bootstrap-document-runtime.ts)
 *
 * `payment_terms` is a SIDECAR slot, not a 5th surface, per amendment 4.
 */

import type { MetaEntitySurface } from "@athyper/runtime-contracts";

const PI_LINE_BINDING_CODE       = "purchase_invoice__purchase_invoice_line";
const PI_PC_BINDING_CODE         = "purchase_invoice__pricing_component";
const PI_AD_BINDING_CODE         = "purchase_invoice__accounting_distribution";
const PI_DISCOUNT_LOOKUP_CODE    = "pi_discount_condition_types";
const PI_TAX_GROUP_LOOKUP_CODE   = "pi_tax_groups";
const PI_HEADER_COMPOSER_CODE    = "purchase_invoice";
const PI_POSTING_STRATEGY_CODE   = "ap_invoice";
const PI_PAYMENT_TERMS_SIDECAR   = "payment_terms";

/**
 * Returns the 4 document-runtime surfaces for the PI descriptor.
 * Order numbers slot the document_header at the top, the lines grid
 * below it, the header-scope PC strip beneath the lines, and the
 * postings preview as the trailing surface.
 *
 * Order base 1000 keeps these well clear of compiler-emitted surfaces
 * (which start at 1) — no overlap, no need to renumber existing surfaces.
 */
export function buildPurchaseInvoiceDocumentRuntimeSurfaces(): MetaEntitySurface[] {
  return [
    {
      kind:           "document_header",
      key:            "purchase_invoice__document_header",
      label:          "Header",
      order:          1000,
      placement:      "header",
      enabled:        true,
      config: {
        header_composer_code:  PI_HEADER_COMPOSER_CODE,
        amount_summary_fields: [
          { label: "Subtotal",          field: "subtotal_amount",          emphasized: false },
          { label: "Tax",               field: "tax_amount",               emphasized: false },
          { label: "Discount",          field: "discount_amount",          emphasized: false },
          { label: "Retention",         field: "retention_amount",         emphasized: false },
          { label: "Net Payable",       field: "net_payable_amount",       emphasized: true },
        ],
        side_car_slots:        [PI_PAYMENT_TERMS_SIDECAR],
        toolbar_actions:       [],
      },
    },
    {
      kind:           "polymorphic_pc_lines",
      key:            "purchase_invoice__polymorphic_pc_lines",
      label:          "Lines",
      order:          1010,
      placement:      "main",
      enabled:        true,
      config: {
        line_binding_code:              PI_LINE_BINDING_CODE,
        pricing_component_binding_code: PI_PC_BINDING_CODE,
        distribution_binding_code:      PI_AD_BINDING_CODE,
        condition_type_lookup_code:     PI_DISCOUNT_LOOKUP_CODE,
        tax_group_lookup_code:          PI_TAX_GROUP_LOOKUP_CODE,
      },
    },
    {
      kind:           "header_scope_pc_strip",
      key:            "purchase_invoice__header_scope_pc_strip",
      label:          "Header-scope Charges",
      order:          1020,
      placement:      "main",
      enabled:        true,
    },
    {
      kind:           "postings_preview",
      key:            "purchase_invoice__postings_preview",
      label:          "Postings Preview",
      order:          1030,
      placement:      "main",
      enabled:        true,
      config: {
        posting_strategy_code: PI_POSTING_STRATEGY_CODE,
        toolbar_action: {
          code:      "preview_postings",
          label:     "Preview Postings",
          icon:      "ListChecks",
          placement: "secondary",
        },
      },
    },
  ];
}
