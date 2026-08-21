import type { P2pParentEntityType } from "./entity-dispatch.js";

export const P2P_HEADER_BUNDLES = {
  identity: ["id", "tenant_id", "code", "name", "company_code_id"],
  requester: ["requested_by", "workflow_request_id", "approved_at", "approved_by"],
  versioning: ["row_version", "version_number", "previous_version_id", "is_current_version", "supersedes_at"],
  lifecycle: ["terminal_status", "status_source", "status", "is_active", "status_changed_at", "status_changed_by"],
  audit: ["created_at", "created_by", "updated_at", "updated_by", "tags", "metadata"],
  currency: ["currency_code", "base_currency_code", "exchange_rate", "fx_rate_snapshot"],
  fiscal: ["fiscal_year", "period_number"],
} as const;

export const P2P_LINE_BUNDLES = {
  identity: ["id", "tenant_id", "company_code_id", "line_no"],
  itemIdentity: ["item_id", "item_description", "uom_code"],
  itemNature: ["procurement_type", "line_type"],
  classification: ["commodity_category_id", "business_intent_id", "classification_decision", "asset_class_id"],
  pricing: ["quantity", "unit_price", "price_unit", "currency_code", "net_amount", "gross_amount"],
  tax: [
    "tax_amount",
    "withholding_tax_amount",
    "tax_group_id",
    "withholding_tax_group_id",
    "to_tax_jurisdiction_id",
    "from_tax_jurisdiction_id",
  ],
  address: [
    "site_id",
    "warehouse_id",
    "storage_location",
    "shipto_address_id",
    "billto_address_id",
    "billfrom_address_id",
    "supplier_id",
    "shipfrom_address_id",
    "remitto_address_id",
  ],
  audit: ["created_at", "created_by", "updated_at", "updated_by"],
} as const;

type HeaderBundleKey = keyof typeof P2P_HEADER_BUNDLES;
type LineBundleKey = keyof typeof P2P_LINE_BUNDLES;

export interface EntityFieldProfile {
  headerBundles: readonly HeaderBundleKey[];
  headerExtras: readonly string[];
  lineBundles: readonly LineBundleKey[];
  lineExtras: readonly string[];
}

export const P2P_FIELD_PROFILE: Record<P2pParentEntityType, EntityFieldProfile> = {
  purchase_requisition: {
    headerBundles: ["identity", "requester", "versioning", "lifecycle", "audit", "currency", "fiscal"],
    headerExtras: ["requisition_number", "requisition_type", "responsible_person_id", "payment_term_id", "budget_check_result", "encumbrance_je_id", "total_amount"],
    lineBundles: ["identity", "itemIdentity", "itemNature", "classification", "pricing", "tax", "address", "audit"],
    lineExtras: ["purchase_requisition_id", "status", "required_by_date", "committed_quantity", "suggested_supplier_ids", "over_delivery_tolerance", "under_delivery_tolerance"],
  },
  commitment: {
    headerBundles: ["identity", "requester", "versioning", "lifecycle", "audit", "currency", "fiscal"],
    headerExtras: ["commitment_type", "party_type", "party_id", "parent_commitment_id", "release_sequence_no", "responsible_person_id", "document_date", "effective_date", "expiry_date", "fx_policy", "payment_term_id", "budget_check_result", "encumbrance_je_id", "total_amount", "scheduled_amount", "released_amount", "fulfilled_amount", "invoiced_amount", "paid_amount", "renewal_terms", "renewal_count", "renewed_from_id"],
    lineBundles: ["identity", "itemIdentity", "itemNature", "classification", "pricing", "tax", "address", "audit"],
    lineExtras: ["commitment_id", "requisition_line_id", "parent_contract_line_id", "status", "required_by_date", "released_quantity", "released_amount", "received_quantity", "invoiced_quantity", "over_delivery_tolerance", "under_delivery_tolerance"],
  },
  purchase_order: {
    headerBundles: ["identity", "requester", "versioning", "lifecycle", "audit", "currency", "fiscal"],
    headerExtras: ["commitment_type", "party_type", "party_id", "parent_commitment_id", "release_sequence_no", "responsible_person_id", "document_date", "effective_date", "expiry_date", "fx_policy", "payment_term_id", "budget_check_result", "encumbrance_je_id", "total_amount", "scheduled_amount", "released_amount", "fulfilled_amount", "invoiced_amount", "paid_amount"],
    lineBundles: ["identity", "itemIdentity", "itemNature", "classification", "pricing", "tax", "address", "audit"],
    lineExtras: ["commitment_id", "requisition_line_id", "parent_contract_line_id", "status", "required_by_date", "released_quantity", "released_amount", "received_quantity", "invoiced_quantity", "over_delivery_tolerance", "under_delivery_tolerance"],
  },
  purchase_order_confirmation: {
    headerBundles: ["identity", "versioning", "lifecycle", "audit"],
    headerExtras: ["confirmation_number", "commitment_id", "supplier_id", "supplier_reference_number", "supplier_confirmation_date", "confirmation_type", "document_date", "currency_code", "confirmed_total_amount", "amendment_commitment_id"],
    lineBundles: ["identity", "audit"],
    lineExtras: ["confirmation_id", "commitment_line_id", "confirmed_quantity", "confirmed_unit_price", "confirmed_delivery_date", "quantity_variance", "price_variance", "line_status", "supplier_notes"],
  },
  delivery_note: {
    headerBundles: ["identity", "versioning", "lifecycle", "audit"],
    headerExtras: ["delivery_note_number", "commitment_id", "supplier_id", "supplier_delivery_note_no", "supplier_dispatch_date", "delivery_date", "expected_arrival_date", "actual_arrival_date", "delivery_site_id", "delivery_warehouse_id", "currency_code", "total_amount"],
    lineBundles: ["identity", "itemIdentity", "audit"],
    lineExtras: ["delivery_note_id", "commitment_line_id", "shipped_quantity", "received_quantity", "damaged_quantity", "rejected_quantity", "accepted_quantity", "lot_number", "serial_numbers", "batch_number", "expiry_date"],
  },
  receipt: {
    headerBundles: ["identity", "requester", "versioning", "lifecycle", "audit", "currency", "fiscal"],
    headerExtras: ["supplier_id", "commitment_id", "delivery_note_id", "received_date", "posting_date", "total_amount", "accrual_je_id"],
    lineBundles: ["identity", "itemIdentity", "pricing", "tax", "address", "audit"],
    lineExtras: ["receipt_id", "commitment_line_id", "delivery_note_line_id", "received_quantity", "accepted_quantity", "rejected_quantity", "lot_number", "serial_numbers", "batch_number", "expiry_date", "inventory_movement_id", "asset_class_id"],
  },
  service_sheet: {
    headerBundles: ["identity", "requester", "versioning", "lifecycle", "audit", "currency", "fiscal"],
    headerExtras: ["service_sheet_number", "supplier_id", "commitment_id", "service_date", "posting_date", "service_period_from", "service_period_to", "total_amount", "accrual_je_id", "accepted_by", "accepted_at"],
    lineBundles: ["identity", "itemIdentity", "pricing", "tax", "address", "audit"],
    lineExtras: ["service_sheet_id", "commitment_line_id", "completion_pct", "milestone_name"],
  },
  purchase_invoice: {
    headerBundles: ["identity", "requester", "versioning", "lifecycle", "audit", "currency", "fiscal"],
    headerExtras: ["invoice_source", "invoice_type", "supplier_id", "commitment_id", "supplier_invoice_number", "supplier_invoice_date", "posting_date", "received_date", "baseline_date", "due_date", "tax_mode", "match_type", "match_status", "total_amount", "tax_amount", "withholding_tax_amount", "payable_amount", "retention_amount", "advance_deduction_amount", "paid_amount", "outstanding_amount", "payment_term_id", "budget_check_result", "ap_je_id"],
    lineBundles: ["identity", "itemIdentity", "itemNature", "classification", "pricing", "tax", "address", "audit"],
    lineExtras: ["purchase_invoice_id", "commitment_line_id", "receipt_line_id", "service_sheet_line_id", "required_by_date", "matched_quantity", "match_status"],
  },
  payment_entry: {
    headerBundles: ["identity", "audit", "currency", "fiscal"],
    headerExtras: [
      "payment_number", "payment_type", "payment_direction", "supplier_id", "supplier_name",
      "payment_method_id", "bank_account_id", "supplier_bank_link_id", "payment_reference",
      "bank_reference", "check_number", "document_date", "posting_date", "value_date",
      "payment_amount", "base_amount", "payment_currency_code", "payment_exchange_rate",
      "payment_fx_rate_snapshot", "payment_currency_amount", "payment_je_id", "is_posted",
      "posted_at", "posted_by", "is_reversal", "reversal_of_id", "reversal_reason",
      "workflow_request_id", "approved_at", "approved_by", "payment_run_id", "is_batch_payment",
      "is_printed", "is_transmitted", "transmission_status", "is_voided", "voided_at",
      "voided_by", "void_reason", "cleared_date", "line_count", "notes", "status",
      "is_active", "status_changed_at", "status_changed_by",
    ],
    lineBundles: [],
    lineExtras: [
      "id", "tenant_id", "payment_entry_id", "line_no", "purchase_invoice_id", "commitment_id",
      "currency_code", "allocated_amount", "discount_amount", "withholding_tax_amount",
      "advance_recovery_amount", "retention_amount", "net_payment_amount", "base_currency_code",
      "exchange_rate", "base_amount", "fx_gain_loss", "is_discount_taken", "discount_due_date",
      "payment_term_application_id", "notes", "metadata", "created_at", "created_by",
    ],
  },
};
