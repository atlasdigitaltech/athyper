-- Unified document, content, and collaboration domains.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_status_d'
  ) THEN
    CREATE DOMAIN document.attachment_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'comment_content_format_d'
  ) THEN
    CREATE DOMAIN document.comment_content_format_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'comment_visibility_d'
  ) THEN
    CREATE DOMAIN document.comment_visibility_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'content_status_d'
  ) THEN
    CREATE DOMAIN document.content_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'conversation_status_d'
  ) THEN
    CREATE DOMAIN document.conversation_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'multipart_upload_status_d'
  ) THEN
    CREATE DOMAIN document.multipart_upload_status_d AS text;
  END IF;
END $$;

ALTER DOMAIN document.attachment_status_d DROP CONSTRAINT IF EXISTS attachment_status_d_check;
ALTER DOMAIN document.attachment_status_d ADD CONSTRAINT attachment_status_d_check
    CHECK (VALUE IN (
        'pending', 'uploading', 'uploaded', 'processing', 'active',
        'quarantined', 'rejected', 'orphaned', 'archived',
        'expired', 'deleted', 'failed'
    ));

ALTER DOMAIN document.comment_content_format_d DROP CONSTRAINT IF EXISTS comment_content_format_d_check;
ALTER DOMAIN document.comment_content_format_d ADD CONSTRAINT comment_content_format_d_check
    CHECK (VALUE IN ('plain', 'rich_json', 'sanitized_html'));

ALTER DOMAIN document.comment_visibility_d DROP CONSTRAINT IF EXISTS comment_visibility_d_check;
ALTER DOMAIN document.comment_visibility_d ADD CONSTRAINT comment_visibility_d_check
    CHECK (VALUE IN ('public', 'internal', 'private'));

ALTER DOMAIN document.content_status_d DROP CONSTRAINT IF EXISTS content_status_d_check;
ALTER DOMAIN document.content_status_d ADD CONSTRAINT content_status_d_check
    CHECK (VALUE IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'));

ALTER DOMAIN document.conversation_status_d DROP CONSTRAINT IF EXISTS conversation_status_d_check;
ALTER DOMAIN document.conversation_status_d ADD CONSTRAINT conversation_status_d_check
    CHECK (VALUE IN ('active', 'archived', 'deleted'));

ALTER DOMAIN document.multipart_upload_status_d DROP CONSTRAINT IF EXISTS multipart_upload_status_d_check;
ALTER DOMAIN document.multipart_upload_status_d ADD CONSTRAINT multipart_upload_status_d_check
    CHECK (VALUE IN ('initiated', 'uploading', 'completed', 'aborted', 'expired', 'failed'));

-- Neon finance and procure-to-pay document vocabularies.

CREATE DOMAIN document.workflow_request_status_d AS text
    CHECK (VALUE IN ('pending','active','approved','rejected','escalated','cancelled'));
CREATE DOMAIN document.workflow_decision_d AS text
    CHECK (VALUE IN ('approve','reject','escalate','cancel'));
CREATE DOMAIN document.workflow_stage_mode_d AS text
    CHECK (VALUE IN ('serial','parallel'));
CREATE DOMAIN document.workflow_stage_status_d AS text
    CHECK (VALUE IN ('pending','active','completed','skipped','cancelled'));

CREATE DOMAIN document.commitment_type_d AS text
    CHECK (VALUE IN (
        'purchase_order','contract','lease','subscription','standing_order',
        'framework_agreement','grant_award','internal_order'
    ));
CREATE DOMAIN document.commitment_status_d AS text
    CHECK (VALUE IN (
        'draft','pending_approval','approved','active','suspended',
        'closed','cancelled','expired','rejected'
    ));
CREATE DOMAIN document.commitment_line_status_d AS text
    CHECK (VALUE IN ('open','closed','cancelled'));
CREATE DOMAIN document.procurement_type_d AS text
    CHECK (VALUE IN ('goods','services'));
CREATE DOMAIN document.commercial_line_type_d AS text
    CHECK (VALUE IN ('contract','catalog','marketplace','noncatalog'));
CREATE DOMAIN document.fx_policy_d AS text
    CHECK (VALUE IN ('spot_on_event','fixed_at_commitment','manual_contract_rate'));
CREATE DOMAIN document.budget_check_result_d AS text
    CHECK (VALUE IN ('passed','warned','override','blocked','exempt'));
CREATE DOMAIN document.release_allocation_kind_d AS text
    CHECK (VALUE IN ('release','reversal'));

CREATE DOMAIN document.distribution_basis_d AS text
    CHECK (VALUE IN ('percent','amount','quantity'));
CREATE DOMAIN document.distribution_amount_status_d AS text
    CHECK (VALUE IN ('provisional','final','posted'));
CREATE DOMAIN document.account_resolution_source_d AS text
    CHECK (VALUE IN ('pending','override','profile','fallback'));

CREATE DOMAIN document.purchase_invoice_source_d AS text
    CHECK (VALUE IN ('po_based','contract_based','non_po','one_time_supplier'));
CREATE DOMAIN document.purchase_invoice_type_d AS text
    CHECK (VALUE IN (
        'standard','credit_note','debit_note','advance',
        'retention_release','self_billed','final'
    ));
CREATE DOMAIN document.purchase_invoice_direction_d AS text
    CHECK (VALUE IN ('payable','credit'));
CREATE DOMAIN document.purchase_invoice_status_d AS text
    CHECK (VALUE IN (
        'proforma','draft','pending_approval','approved','posted',
        'on_hold','cancelled','rejected'
    ));
CREATE DOMAIN document.tax_mode_d AS text
    CHECK (VALUE IN ('exclusive','inclusive','out_of_scope'));
CREATE DOMAIN document.invoice_match_type_d AS text
    CHECK (VALUE IN ('three_way','two_way','no_match','evaluated_receipt'));
CREATE DOMAIN document.invoice_match_status_d AS text
    CHECK (VALUE IN ('unmatched','partially_matched','fully_matched','exception'));
CREATE DOMAIN document.invoice_match_result_d AS text
    CHECK (VALUE IN (
        'pending','matched','matched_with_tolerance',
        'exception','force_matched','rejected'
    ));
CREATE DOMAIN document.invoice_match_case_status_d AS text
    CHECK (VALUE IN ('pending','in_progress','completed','exception','resolved','cancelled'));

CREATE DOMAIN document.term_application_status_d AS text
    CHECK (VALUE IN ('applied','skipped','clamped','exhausted','not_yet_eligible','reversed'));
CREATE DOMAIN document.term_application_type_d AS text
    CHECK (VALUE IN (
        'advance','advance_recovery','retention',
        'retention_release','due_date','discount'
    ));
CREATE DOMAIN document.override_decision_d AS text
    CHECK (VALUE IN ('approve','reject','escalate'));

CREATE DOMAIN document.payment_type_d AS text
    CHECK (VALUE IN (
        'standard','advance','retention_release','partial',
        'final','down_payment','urgent','netting'
    ));
CREATE DOMAIN document.payment_direction_d AS text
    CHECK (VALUE IN ('outbound','inbound'));
CREATE DOMAIN document.payment_status_d AS text
    CHECK (VALUE IN (
        'draft','pending_approval','approved','posted',
        'transmitted','cleared','cancelled','rejected'
    ));
CREATE DOMAIN document.payment_allocation_kind_d AS text
    CHECK (VALUE IN ('allocation','reversal'));

CREATE DOMAIN document.journal_status_d AS text
    CHECK (VALUE IN ('draft','pending_approval','approved','posted','rejected','cancelled'));
CREATE DOMAIN document.journal_reference_kind_d AS text
    CHECK (VALUE IN (
        'source','settlement','matching','clearing',
        'capitalization','tax','budget','other'
    ));

-- Neon procure-to-pay authoring, supplier evidence, and fulfillment vocabulary.

CREATE DOMAIN document.requisition_type_d AS text
    CHECK (VALUE IN ('standard','urgent','blanket','framework_call_off','capex'));
CREATE DOMAIN document.requisition_priority_d AS text
    CHECK (VALUE IN ('low','normal','high','urgent'));
CREATE DOMAIN document.requisition_status_d AS text
    CHECK (VALUE IN ('draft','pending_approval','approved','rejected','partially_converted','fully_converted','closed','cancelled'));
CREATE DOMAIN document.requisition_line_status_d AS text
    CHECK (VALUE IN ('open','partially_converted','converted','cancelled'));

CREATE DOMAIN document.confirmation_type_d AS text
    CHECK (VALUE IN ('FULL_CONFIRM','PARTIAL_CONFIRM','CHANGE_PROPOSAL','REJECTION'));
CREATE DOMAIN document.confirmation_status_d AS text
    CHECK (VALUE IN ('received','confirmed','changes_proposed','changes_accepted','changes_rejected','rejected','cancelled'));
CREATE DOMAIN document.confirmation_line_status_d AS text
    CHECK (VALUE IN ('confirmed','changed','rejected','partial'));

CREATE DOMAIN document.delivery_note_status_d AS text
    CHECK (VALUE IN ('draft','in_transit','arrived','partially_receipted','fully_receipted','returned','cancelled'));
CREATE DOMAIN document.inspection_status_d AS text
    CHECK (VALUE IN ('pending','in_progress','passed','partially_accepted','failed','waived'));

CREATE DOMAIN document.receipt_status_d AS text
    CHECK (VALUE IN ('draft','pending_approval','approved','posted','reversed','cancelled','rejected'));
CREATE DOMAIN document.service_sheet_status_d AS text
    CHECK (VALUE IN ('draft','pending_acceptance','accepted','pending_approval','approved','posted','reversed','cancelled','rejected'));

-- Polymorphic pricing and schedule child-carrier vocabularies.

CREATE DOMAIN document.pricing_source_type_d AS text
    CHECK (VALUE IN (
        'purchase_requisition_line','commitment_line','purchase_invoice_line',
        'receipt_line','service_sheet_line'
    ));

CREATE DOMAIN document.pricing_entry_level_d AS text
    CHECK (VALUE IN ('header', 'line'));

CREATE DOMAIN document.pricing_origin_d AS text
    CHECK (VALUE IN ('manual', 'inherited', 'vendor_default', 'system_resolved'));

CREATE DOMAIN document.schedule_source_type_d AS text
    CHECK (VALUE IN ('purchase_requisition_line','commitment_line','purchase_invoice_line'));

CREATE DOMAIN document.schedule_kind_d AS text
    CHECK (VALUE IN ('delivery', 'billing_milestone', 'release_window'));

CREATE DOMAIN document.schedule_fulfillment_status_d AS text
    CHECK (VALUE IN ('open', 'partial', 'fulfilled', 'closed', 'cancelled'));

CREATE DOMAIN document.schedule_status_d AS text
    CHECK (VALUE IN ('active', 'superseded', 'retired', 'cancelled'));

CREATE DOMAIN document.schedule_status_source_d AS text
    CHECK (VALUE IN ('manual', 'derived', 'system', 'terminal'));

CREATE DOMAIN document.schedule_terminal_status_d AS text
    CHECK (VALUE IN ('CANCELED', 'CLOSED', 'REJECTED'));

CREATE DOMAIN document.catalog_import_status_d AS text
    CHECK (VALUE IN (
        'received', 'validating', 'matching', 'pending_review',
        'partially_approved', 'approved', 'rejected', 'published', 'failed'
    ));

CREATE DOMAIN document.item_match_status_d AS text
    CHECK (VALUE IN (
        'unmatched', 'candidate_found', 'matched', 'conflict',
        'new_item_required', 'ignored'
    ));

CREATE DOMAIN document.item_match_method_d AS text
    CHECK (VALUE IN (
        'external_reference', 'gtin', 'manufacturer_part_number',
        'supplier_item_mapping', 'exact_code', 'manual', 'future_algorithm'
    ));

CREATE DOMAIN document.catalog_review_decision_d AS text
    CHECK (VALUE IN (
        'map_existing_item', 'create_product_and_item',
        'reject', 'park'
    ));

CREATE DOMAIN document.punchout_cart_status_d AS text
    CHECK (VALUE IN (
        'returned', 'matching', 'ready', 'converted', 'expired', 'rejected'
    ));

CREATE DOMAIN document.production_order_status_d AS text
    CHECK (VALUE IN (
        'draft', 'released', 'in_progress', 'completed',
        'cancelled', 'closed'
    ));

CREATE DOMAIN document.sales_order_status_d AS text
    CHECK (VALUE IN (
        'draft', 'confirmed', 'partially_fulfilled',
        'fulfilled', 'cancelled', 'closed'
    ));

CREATE DOMAIN document.stocktake_status_d AS text
    CHECK (VALUE IN ('planned', 'in_progress', 'completed', 'cancelled'));

CREATE DOMAIN document.stocktake_type_d AS text
    CHECK (VALUE IN ('full', 'cycle', 'spot'));

CREATE DOMAIN document.sales_opportunity_status_d AS text
    CHECK (VALUE IN ('draft', 'qualified', 'proposal', 'won', 'lost', 'cancelled'));

CREATE DOMAIN document.sales_participation_role_d AS text
    CHECK (VALUE IN ('lead_seller', 'participant', 'fulfillment'));

CREATE DOMAIN document.sales_participation_status_d AS text
    CHECK (VALUE IN ('active', 'removed'));

CREATE DOMAIN document.sales_quotation_status_d AS text
    CHECK (VALUE IN ('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled'));

CREATE DOMAIN document.sales_quotation_allocation_status_d AS text
    CHECK (VALUE IN ('planned', 'converted', 'cancelled'));

CREATE DOMAIN document.intercompany_fulfillment_status_d AS text
    CHECK (VALUE IN ('planned', 'posted', 'cancelled'));

CREATE DOMAIN document.bank_statement_status_d AS text
    CHECK (VALUE IN ('imported', 'matching', 'reconciled', 'signed_off', 'archived', 'rejected'));

CREATE DOMAIN document.bank_statement_source_format_d AS text
    CHECK (VALUE IN ('csv', 'ofx', 'mt940', 'bai2', 'camt053', 'camt054', 'api', 'manual'));

CREATE DOMAIN document.bank_transaction_type_d AS text
    CHECK (VALUE IN ('payment', 'receipt', 'fee', 'interest', 'fx', 'transfer', 'reversal', 'other'));

CREATE DOMAIN document.bank_reconciliation_status_d AS text
    CHECK (VALUE IN ('unmatched', 'partially_matched', 'matched', 'exception', 'excluded'));

CREATE DOMAIN document.bank_recon_case_type_d AS text
    CHECK (VALUE IN ('exact_match', 'amount_match', 'near_match', 'manual', 'exception', 'bank_charge', 'fx_difference'));

CREATE DOMAIN document.bank_recon_case_status_d AS text
    CHECK (VALUE IN ('open', 'matched', 'signed_off', 'voided'));

CREATE DOMAIN document.bank_recon_side_d AS text
    CHECK (VALUE IN ('payment', 'statement'));

CREATE DOMAIN document.depreciation_run_status_d AS text
    CHECK (VALUE IN ('planned', 'running', 'calculated', 'posted', 'failed', 'cancelled'));

CREATE DOMAIN document.depreciation_line_status_d AS text
    CHECK (VALUE IN ('calculated', 'posted', 'error'));

CREATE DOMAIN document.depreciation_schedule_status_d AS text
    CHECK (VALUE IN ('planned', 'posted', 'cancelled'));

CREATE DOMAIN document.sourcing_event_type_d AS text
    CHECK (VALUE IN ('rfi','rfq','rfp','reverse_auction'));
CREATE DOMAIN document.sourcing_buying_model_d AS text
    CHECK (VALUE IN ('federated','central_buyer'));
CREATE DOMAIN document.sourcing_event_status_d AS text
    CHECK (VALUE IN ('draft','published','evaluation','awarded','closed','cancelled'));
CREATE DOMAIN document.sourcing_company_role_d AS text
    CHECK (VALUE IN ('lead_buyer','participant','beneficiary'));
CREATE DOMAIN document.sourcing_company_status_d AS text
    CHECK (VALUE IN ('active','removed'));
CREATE DOMAIN document.sourcing_demand_status_d AS text
    CHECK (VALUE IN ('included','withdrawn','partially_awarded','awarded','converted'));
CREATE DOMAIN document.sourcing_award_status_d AS text
    CHECK (VALUE IN ('recommended','approved','rejected','converted','cancelled'));
CREATE DOMAIN document.sourcing_award_allocation_status_d AS text
    CHECK (VALUE IN ('planned','converted','cancelled'));
CREATE DOMAIN document.sourcing_intercompany_status_d AS text
    CHECK (VALUE IN ('planned','posted','cancelled'));

CREATE DOMAIN document.hr_approval_status_d AS text
    CHECK (VALUE IN ('draft','submitted','approved','rejected','cancelled','withdrawn'));
CREATE DOMAIN document.attendance_day_status_d AS text
    CHECK (VALUE IN ('open','approved','locked','voided'));
CREATE DOMAIN document.attendance_punch_type_d AS text
    CHECK (VALUE IN ('in','out','break_start','break_end'));
CREATE DOMAIN document.attendance_punch_source_d AS text
    CHECK (VALUE IN ('manual','biometric','mobile','rfid','kiosk','system','integration'));
CREATE DOMAIN document.attendance_punch_status_d AS text
    CHECK (VALUE IN ('accepted','rejected','voided'));
CREATE DOMAIN document.shift_assignment_status_d AS text
    CHECK (VALUE IN ('scheduled','worked','adjusted','cancelled'));
CREATE DOMAIN document.leave_quantity_unit_d AS text
    CHECK (VALUE IN ('day','hour'));
CREATE DOMAIN document.hr_case_priority_d AS text
    CHECK (VALUE IN ('low','normal','high','urgent'));
CREATE DOMAIN document.hr_case_status_d AS text
    CHECK (VALUE IN ('open','in_progress','pending','resolved','closed','cancelled'));
CREATE DOMAIN document.people_case_status_d AS text
    CHECK (VALUE IN ('draft','active','completed','cancelled'));
CREATE DOMAIN document.employee_tax_declaration_status_d AS text
    CHECK (VALUE IN ('draft','submitted','approved','rejected','withdrawn','superseded'));
CREATE DOMAIN document.payroll_period_status_d AS text
    CHECK (VALUE IN ('open','processing','closed','locked'));
CREATE DOMAIN document.payroll_run_type_d AS text
    CHECK (VALUE IN ('regular','offcycle','correction','final'));
CREATE DOMAIN document.payroll_run_status_d AS text
    CHECK (VALUE IN ('draft','calculating','calculated','approved','posted','cancelled','reversed'));
CREATE DOMAIN document.payroll_run_employee_status_d AS text
    CHECK (VALUE IN ('included','excluded','calculated','error'));
CREATE DOMAIN document.payroll_result_status_d AS text
    CHECK (VALUE IN ('calculating','calculated','approved','posted','voided'));
CREATE DOMAIN document.policy_acknowledgment_channel_d AS text
    CHECK (VALUE IN ('self_service','administrator','workflow','integration','paper','other'));

CREATE DOMAIN document.project_task_type_d AS text
    CHECK (VALUE IN ('task', 'milestone', 'review', 'approval', 'handoff'));

CREATE DOMAIN document.project_task_status_d AS text
    CHECK (VALUE IN ('draft', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled'));

CREATE DOMAIN document.project_requirement_status_d AS text
    CHECK (VALUE IN ('planned', 'reserved', 'issued', 'partially_consumed', 'consumed', 'cancelled'));

CREATE DOMAIN document.budget_type_d AS text
    CHECK (VALUE IN ('baseline', 'forecast', 'supplemental'));

CREATE DOMAIN document.budget_profile_status_d AS text
    CHECK (VALUE IN ('draft', 'submitted', 'approved', 'active', 'closed', 'cancelled'));

CREATE DOMAIN document.budget_allocation_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'frozen', 'closed', 'cancelled'));

CREATE DOMAIN document.overspend_policy_d AS text
    CHECK (VALUE IN ('block', 'warn', 'allow'));

CREATE DOMAIN document.planning_scenario_status_d AS text
    CHECK (VALUE IN ('draft', 'in_review', 'approved', 'superseded', 'cancelled'));

CREATE DOMAIN document.planning_line_source_d AS text
    CHECK (VALUE IN ('manual', 'driver', 'import', 'carry_forward'));

-- Desired-state domains for the first legacy document movement wave.

CREATE DOMAIN document.asset_transaction_status_d AS text
    CHECK (VALUE IN ('draft','posted','reversed','cancelled'));
CREATE DOMAIN document.asset_transaction_type_d AS text
    CHECK (VALUE IN (
        'capitalize','depreciate','revalue_up','revalue_down','impair',
        'impair_reverse','transfer','retire','dispose','adjust_cost',
        'adjust_life','split','merge'
    ));

CREATE DOMAIN document.fx_revaluation_run_status_d AS text
    CHECK (VALUE IN ('draft','calculated','posted','reversed','cancelled'));
CREATE DOMAIN document.fx_rate_source_d AS text
    CHECK (VALUE IN ('MANUAL','MARKET','CENTRAL_BANK','PROVIDER','SYSTEM'));

CREATE DOMAIN document.intercompany_agreement_type_d AS text
    CHECK (VALUE IN ('GOODS','SERVICES','LOAN','ROYALTY','MANAGEMENT_FEE','COST_SHARING','OTHER'));
CREATE DOMAIN document.transfer_pricing_method_d AS text
    CHECK (VALUE IN ('CUP','COST_PLUS','RESALE_MINUS','TNMM','PROFIT_SPLIT','COMPARABLE_PROFIT','OTHER'));
CREATE DOMAIN document.intercompany_conflict_strategy_d AS text
    CHECK (VALUE IN ('HIGHEST_PRIORITY','MOST_SPECIFIC','ERROR_ON_CONFLICT'));
CREATE DOMAIN document.intercompany_agreement_status_d AS text
    CHECK (VALUE IN ('draft','active','suspended','superseded','expired','cancelled'));

CREATE DOMAIN document.intercompany_transaction_type_d AS text
    CHECK (VALUE IN (
        'RECHARGE','PURCHASE','SALE','LOAN_DRAWDOWN','LOAN_REPAYMENT',
        'ROYALTY','MANAGEMENT_FEE','COST_ALLOCATION','DIVIDEND','OTHER'
    ));
CREATE DOMAIN document.intercompany_match_status_d AS text
    CHECK (VALUE IN ('UNMATCHED','MATCHED','DISPUTED','PARTIALLY_MATCHED'));
CREATE DOMAIN document.intercompany_transaction_status_d AS text
    CHECK (VALUE IN ('draft','created','posted','netted','settled','disputed','cancelled','reversed'));

CREATE DOMAIN document.ic_elimination_type_d AS text
    CHECK (VALUE IN (
        'REVENUE_EXPENSE','RECEIVABLE_PAYABLE','INVENTORY_MARKUP','IC_PROFIT',
        'MINORITY_INTEREST','INVESTMENT','DIVIDEND','LOAN','OTHER'
    ));
CREATE DOMAIN document.ic_approval_route_d AS text
    CHECK (VALUE IN ('AUTO','STANDARD','ENHANCED','MANUAL'));
CREATE DOMAIN document.ic_elimination_status_d AS text
    CHECK (VALUE IN ('calculated','approved','posted','reversed','rejected','cancelled'));

CREATE DOMAIN document.match_exception_type_d AS text
    CHECK (VALUE IN (
        'PRICE_VARIANCE','QUANTITY_VARIANCE','AMOUNT_VARIANCE','MISSING_RECEIPT',
        'DUPLICATE_INVOICE','TAX_VARIANCE','FX_VARIANCE','RETENTION_VARIANCE',
        'ADVANCE_RECOVERY_MISMATCH'
    ));
CREATE DOMAIN document.match_exception_resolution_d AS text
    CHECK (VALUE IN (
        'ACCEPTED','FORCE_MATCHED','CREDIT_NOTE_REQUESTED','WRITTEN_OFF',
        'PRICE_ADJUSTMENT','QUANTITY_ADJUSTMENT','REJECTED'
    ));
CREATE DOMAIN document.match_exception_status_d AS text
    CHECK (VALUE IN ('open','pending_approval','approved','rejected','force_matched','written_off','cancelled'));

CREATE DOMAIN document.netting_direction_d AS text
    CHECK (VALUE IN ('A_TO_B','B_TO_A','ZERO'));
CREATE DOMAIN document.netting_batch_status_d AS text
    CHECK (VALUE IN ('draft','calculated','approved','settled','cancelled'));

CREATE DOMAIN document.obligation_tier_d AS text
    CHECK (VALUE IN ('PLANNED','FORECAST','RESERVED','COMMITTED','CONSUMED'));
CREATE DOMAIN document.obligation_spread_method_d AS text
    CHECK (VALUE IN ('EVEN','FRONT_LOADED','BACK_LOADED','MILESTONE','CUSTOM'));
CREATE DOMAIN document.obligation_source_type_d AS text
    CHECK (VALUE IN ('CONTRACT','PO','SUBSCRIPTION','LEASE','FORECAST_MODEL','MANUAL'));
CREATE DOMAIN document.obligation_horizon_status_d AS text
    CHECK (VALUE IN ('active','cancelled','superseded'));

CREATE DOMAIN document.remittance_delivery_method_d AS text
    CHECK (VALUE IN ('EMAIL','PORTAL','EDI','FAX','PRINT','API'));
CREATE DOMAIN document.remittance_delivery_status_d AS text
    CHECK (VALUE IN ('pending','sent','delivered','failed','bounced'));
CREATE DOMAIN document.payment_remittance_status_d AS text
    CHECK (VALUE IN ('draft','generated','sent','delivered','failed','cancelled'));

CREATE DOMAIN document.payment_discount_application_status_d AS text
    CHECK (VALUE IN ('QUALIFIED','NOT_QUALIFIED','PARTIAL','WAIVED','EXPIRED','REVERSED'));

CREATE DOMAIN document.wht_certificate_status_d AS text
    CHECK (VALUE IN ('draft','issued','voided'));

CREATE DOMAIN document.import_file_format_d AS text
    CHECK (VALUE IN ('csv','xlsx','tsv'));
CREATE DOMAIN document.import_mode_d AS text
    CHECK (VALUE IN ('create','update','upsert'));
CREATE DOMAIN document.import_request_status_d AS text
    CHECK (VALUE IN ('uploaded','processing','completed','failed','cancelled'));
CREATE DOMAIN document.import_chunk_status_d AS text
    CHECK (VALUE IN ('pending','queued','processing','completed','failed','cancelled'));

CREATE DOMAIN document.render_output_status_d AS text
    CHECK (VALUE IN ('QUEUED','RENDERING','RENDERED','DELIVERED','FAILED','ARCHIVED','REVOKED'));

CREATE DOMAIN document.render_failure_category_d AS text
    CHECK (VALUE IN ('transient','timeout','permanent','crash'));

CREATE DOMAIN document.profile_update_priority_d AS text
    CHECK (VALUE IN ('low','normal','high','urgent'));
CREATE DOMAIN document.profile_update_request_status_d AS text
    CHECK (VALUE IN ('draft','submitted','awaiting_approval','revision_requested','approved','rejected','cancelled'));
