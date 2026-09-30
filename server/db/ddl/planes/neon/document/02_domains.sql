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

CREATE DOMAIN document.business_partner_requested_role_d AS text
  CHECK (VALUE IN ('supplier', 'customer', 'workforce'));

CREATE DOMAIN document.business_partner_request_kind_d AS text
  CHECK (VALUE IN (
    'new_partner', 'amend_partner', 'add_supplier', 'add_customer',
    'add_workforce', 'assign_organization', 'configure_company', 'change_bank',
    'change_employment', 'deactivate', 'reactivate', 'archive'
  ));

COMMENT ON DOMAIN document.business_partner_requested_role_d IS
  'Governed onboarding role. Workforce is request-only and never enters master.partner_role_d.';

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_series_status_d'
  ) THEN
    CREATE DOMAIN document.attachment_series_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_derivative_status_d'
  ) THEN
    CREATE DOMAIN document.attachment_derivative_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attachment_hold_event_type_d'
  ) THEN
    CREATE DOMAIN document.attachment_hold_event_type_d AS text;
  END IF;
END $$;

ALTER DOMAIN document.attachment_series_status_d DROP CONSTRAINT IF EXISTS attachment_series_status_d_check;
ALTER DOMAIN document.attachment_series_status_d ADD CONSTRAINT attachment_series_status_d_check
    CHECK (VALUE IN ('active', 'expired', 'deleted', 'purge_requested', 'purge_processing', 'purged'));

ALTER DOMAIN document.attachment_derivative_status_d DROP CONSTRAINT IF EXISTS attachment_derivative_status_d_check;
ALTER DOMAIN document.attachment_derivative_status_d ADD CONSTRAINT attachment_derivative_status_d_check
    CHECK (VALUE IN ('pending', 'processing', 'ready', 'quarantined', 'skipped', 'failed', 'deleted'));

ALTER DOMAIN document.attachment_hold_event_type_d DROP CONSTRAINT IF EXISTS attachment_hold_event_type_d_check;
ALTER DOMAIN document.attachment_hold_event_type_d ADD CONSTRAINT attachment_hold_event_type_d_check
    CHECK (VALUE IN ('placed', 'released'));

-- neon-plane document status and enum domains
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'account_resolution_source_d'
  ) THEN
    CREATE DOMAIN document.account_resolution_source_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'asset_transaction_status_d'
  ) THEN
    CREATE DOMAIN document.asset_transaction_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'asset_transaction_type_d'
  ) THEN
    CREATE DOMAIN document.asset_transaction_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attendance_day_status_d'
  ) THEN
    CREATE DOMAIN document.attendance_day_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attendance_punch_source_d'
  ) THEN
    CREATE DOMAIN document.attendance_punch_source_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attendance_punch_status_d'
  ) THEN
    CREATE DOMAIN document.attendance_punch_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'attendance_punch_type_d'
  ) THEN
    CREATE DOMAIN document.attendance_punch_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'bank_recon_case_status_d'
  ) THEN
    CREATE DOMAIN document.bank_recon_case_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'bank_recon_case_type_d'
  ) THEN
    CREATE DOMAIN document.bank_recon_case_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'bank_recon_side_d'
  ) THEN
    CREATE DOMAIN document.bank_recon_side_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'bank_reconciliation_status_d'
  ) THEN
    CREATE DOMAIN document.bank_reconciliation_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'bank_statement_source_format_d'
  ) THEN
    CREATE DOMAIN document.bank_statement_source_format_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'bank_statement_status_d'
  ) THEN
    CREATE DOMAIN document.bank_statement_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'bank_transaction_type_d'
  ) THEN
    CREATE DOMAIN document.bank_transaction_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'budget_allocation_status_d'
  ) THEN
    CREATE DOMAIN document.budget_allocation_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'budget_check_result_d'
  ) THEN
    CREATE DOMAIN document.budget_check_result_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'budget_profile_status_d'
  ) THEN
    CREATE DOMAIN document.budget_profile_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'budget_type_d'
  ) THEN
    CREATE DOMAIN document.budget_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'catalog_import_status_d'
  ) THEN
    CREATE DOMAIN document.catalog_import_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'catalog_review_decision_d'
  ) THEN
    CREATE DOMAIN document.catalog_review_decision_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'commercial_line_type_d'
  ) THEN
    CREATE DOMAIN document.commercial_line_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'commitment_line_status_d'
  ) THEN
    CREATE DOMAIN document.commitment_line_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'commitment_status_d'
  ) THEN
    CREATE DOMAIN document.commitment_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'commitment_type_d'
  ) THEN
    CREATE DOMAIN document.commitment_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'confirmation_line_status_d'
  ) THEN
    CREATE DOMAIN document.confirmation_line_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'confirmation_status_d'
  ) THEN
    CREATE DOMAIN document.confirmation_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'confirmation_type_d'
  ) THEN
    CREATE DOMAIN document.confirmation_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'delivery_note_status_d'
  ) THEN
    CREATE DOMAIN document.delivery_note_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'depreciation_line_status_d'
  ) THEN
    CREATE DOMAIN document.depreciation_line_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'depreciation_run_status_d'
  ) THEN
    CREATE DOMAIN document.depreciation_run_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'depreciation_schedule_status_d'
  ) THEN
    CREATE DOMAIN document.depreciation_schedule_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'distribution_amount_status_d'
  ) THEN
    CREATE DOMAIN document.distribution_amount_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'distribution_basis_d'
  ) THEN
    CREATE DOMAIN document.distribution_basis_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'employee_tax_declaration_status_d'
  ) THEN
    CREATE DOMAIN document.employee_tax_declaration_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'fx_policy_d'
  ) THEN
    CREATE DOMAIN document.fx_policy_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'fx_rate_source_d'
  ) THEN
    CREATE DOMAIN document.fx_rate_source_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'fx_revaluation_run_status_d'
  ) THEN
    CREATE DOMAIN document.fx_revaluation_run_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'hr_approval_status_d'
  ) THEN
    CREATE DOMAIN document.hr_approval_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'hr_case_priority_d'
  ) THEN
    CREATE DOMAIN document.hr_case_priority_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'hr_case_status_d'
  ) THEN
    CREATE DOMAIN document.hr_case_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'ic_approval_route_d'
  ) THEN
    CREATE DOMAIN document.ic_approval_route_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'ic_elimination_status_d'
  ) THEN
    CREATE DOMAIN document.ic_elimination_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'ic_elimination_type_d'
  ) THEN
    CREATE DOMAIN document.ic_elimination_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'import_chunk_status_d'
  ) THEN
    CREATE DOMAIN document.import_chunk_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'import_file_format_d'
  ) THEN
    CREATE DOMAIN document.import_file_format_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'import_mode_d'
  ) THEN
    CREATE DOMAIN document.import_mode_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'import_request_status_d'
  ) THEN
    CREATE DOMAIN document.import_request_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'inspection_status_d'
  ) THEN
    CREATE DOMAIN document.inspection_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'intercompany_agreement_status_d'
  ) THEN
    CREATE DOMAIN document.intercompany_agreement_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'intercompany_agreement_type_d'
  ) THEN
    CREATE DOMAIN document.intercompany_agreement_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'intercompany_conflict_strategy_d'
  ) THEN
    CREATE DOMAIN document.intercompany_conflict_strategy_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'intercompany_fulfillment_status_d'
  ) THEN
    CREATE DOMAIN document.intercompany_fulfillment_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'intercompany_match_status_d'
  ) THEN
    CREATE DOMAIN document.intercompany_match_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'intercompany_transaction_status_d'
  ) THEN
    CREATE DOMAIN document.intercompany_transaction_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'intercompany_transaction_type_d'
  ) THEN
    CREATE DOMAIN document.intercompany_transaction_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'invoice_match_case_status_d'
  ) THEN
    CREATE DOMAIN document.invoice_match_case_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'invoice_match_result_d'
  ) THEN
    CREATE DOMAIN document.invoice_match_result_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'invoice_match_status_d'
  ) THEN
    CREATE DOMAIN document.invoice_match_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'invoice_match_type_d'
  ) THEN
    CREATE DOMAIN document.invoice_match_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'item_match_method_d'
  ) THEN
    CREATE DOMAIN document.item_match_method_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'item_match_status_d'
  ) THEN
    CREATE DOMAIN document.item_match_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'journal_reference_kind_d'
  ) THEN
    CREATE DOMAIN document.journal_reference_kind_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'journal_status_d'
  ) THEN
    CREATE DOMAIN document.journal_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'leave_quantity_unit_d'
  ) THEN
    CREATE DOMAIN document.leave_quantity_unit_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'match_exception_resolution_d'
  ) THEN
    CREATE DOMAIN document.match_exception_resolution_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'match_exception_status_d'
  ) THEN
    CREATE DOMAIN document.match_exception_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'match_exception_type_d'
  ) THEN
    CREATE DOMAIN document.match_exception_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'netting_batch_status_d'
  ) THEN
    CREATE DOMAIN document.netting_batch_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'netting_direction_d'
  ) THEN
    CREATE DOMAIN document.netting_direction_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'obligation_horizon_status_d'
  ) THEN
    CREATE DOMAIN document.obligation_horizon_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'obligation_source_type_d'
  ) THEN
    CREATE DOMAIN document.obligation_source_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'obligation_spread_method_d'
  ) THEN
    CREATE DOMAIN document.obligation_spread_method_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'obligation_tier_d'
  ) THEN
    CREATE DOMAIN document.obligation_tier_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'override_decision_d'
  ) THEN
    CREATE DOMAIN document.override_decision_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'overspend_policy_d'
  ) THEN
    CREATE DOMAIN document.overspend_policy_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payment_allocation_kind_d'
  ) THEN
    CREATE DOMAIN document.payment_allocation_kind_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payment_direction_d'
  ) THEN
    CREATE DOMAIN document.payment_direction_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payment_discount_application_status_d'
  ) THEN
    CREATE DOMAIN document.payment_discount_application_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payment_remittance_status_d'
  ) THEN
    CREATE DOMAIN document.payment_remittance_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payment_status_d'
  ) THEN
    CREATE DOMAIN document.payment_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payment_type_d'
  ) THEN
    CREATE DOMAIN document.payment_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payroll_period_status_d'
  ) THEN
    CREATE DOMAIN document.payroll_period_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payroll_result_status_d'
  ) THEN
    CREATE DOMAIN document.payroll_result_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payroll_run_employee_status_d'
  ) THEN
    CREATE DOMAIN document.payroll_run_employee_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payroll_run_status_d'
  ) THEN
    CREATE DOMAIN document.payroll_run_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'payroll_run_type_d'
  ) THEN
    CREATE DOMAIN document.payroll_run_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'people_case_status_d'
  ) THEN
    CREATE DOMAIN document.people_case_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'planning_line_source_d'
  ) THEN
    CREATE DOMAIN document.planning_line_source_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'planning_scenario_status_d'
  ) THEN
    CREATE DOMAIN document.planning_scenario_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'policy_acknowledgment_channel_d'
  ) THEN
    CREATE DOMAIN document.policy_acknowledgment_channel_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'pricing_entry_level_d'
  ) THEN
    CREATE DOMAIN document.pricing_entry_level_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'pricing_origin_d'
  ) THEN
    CREATE DOMAIN document.pricing_origin_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'pricing_source_type_d'
  ) THEN
    CREATE DOMAIN document.pricing_source_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'procurement_type_d'
  ) THEN
    CREATE DOMAIN document.procurement_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'production_order_status_d'
  ) THEN
    CREATE DOMAIN document.production_order_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'profile_update_priority_d'
  ) THEN
    CREATE DOMAIN document.profile_update_priority_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'profile_update_request_status_d'
  ) THEN
    CREATE DOMAIN document.profile_update_request_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'project_requirement_status_d'
  ) THEN
    CREATE DOMAIN document.project_requirement_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'project_task_status_d'
  ) THEN
    CREATE DOMAIN document.project_task_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'project_task_type_d'
  ) THEN
    CREATE DOMAIN document.project_task_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'punchout_cart_status_d'
  ) THEN
    CREATE DOMAIN document.punchout_cart_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'purchase_invoice_direction_d'
  ) THEN
    CREATE DOMAIN document.purchase_invoice_direction_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'purchase_invoice_source_d'
  ) THEN
    CREATE DOMAIN document.purchase_invoice_source_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'purchase_invoice_status_d'
  ) THEN
    CREATE DOMAIN document.purchase_invoice_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'purchase_invoice_type_d'
  ) THEN
    CREATE DOMAIN document.purchase_invoice_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'receipt_status_d'
  ) THEN
    CREATE DOMAIN document.receipt_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'release_allocation_kind_d'
  ) THEN
    CREATE DOMAIN document.release_allocation_kind_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'remittance_delivery_method_d'
  ) THEN
    CREATE DOMAIN document.remittance_delivery_method_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'remittance_delivery_status_d'
  ) THEN
    CREATE DOMAIN document.remittance_delivery_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'render_failure_category_d'
  ) THEN
    CREATE DOMAIN document.render_failure_category_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'render_output_status_d'
  ) THEN
    CREATE DOMAIN document.render_output_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'requisition_line_status_d'
  ) THEN
    CREATE DOMAIN document.requisition_line_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'requisition_priority_d'
  ) THEN
    CREATE DOMAIN document.requisition_priority_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'requisition_status_d'
  ) THEN
    CREATE DOMAIN document.requisition_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'requisition_type_d'
  ) THEN
    CREATE DOMAIN document.requisition_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sales_opportunity_status_d'
  ) THEN
    CREATE DOMAIN document.sales_opportunity_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sales_order_status_d'
  ) THEN
    CREATE DOMAIN document.sales_order_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sales_participation_role_d'
  ) THEN
    CREATE DOMAIN document.sales_participation_role_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sales_participation_status_d'
  ) THEN
    CREATE DOMAIN document.sales_participation_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sales_quotation_allocation_status_d'
  ) THEN
    CREATE DOMAIN document.sales_quotation_allocation_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sales_quotation_status_d'
  ) THEN
    CREATE DOMAIN document.sales_quotation_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'schedule_fulfillment_status_d'
  ) THEN
    CREATE DOMAIN document.schedule_fulfillment_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'schedule_kind_d'
  ) THEN
    CREATE DOMAIN document.schedule_kind_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'schedule_source_type_d'
  ) THEN
    CREATE DOMAIN document.schedule_source_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'schedule_status_d'
  ) THEN
    CREATE DOMAIN document.schedule_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'schedule_status_source_d'
  ) THEN
    CREATE DOMAIN document.schedule_status_source_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'schedule_terminal_status_d'
  ) THEN
    CREATE DOMAIN document.schedule_terminal_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'service_sheet_status_d'
  ) THEN
    CREATE DOMAIN document.service_sheet_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'shift_assignment_status_d'
  ) THEN
    CREATE DOMAIN document.shift_assignment_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_award_allocation_status_d'
  ) THEN
    CREATE DOMAIN document.sourcing_award_allocation_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_award_status_d'
  ) THEN
    CREATE DOMAIN document.sourcing_award_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_buying_model_d'
  ) THEN
    CREATE DOMAIN document.sourcing_buying_model_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_company_role_d'
  ) THEN
    CREATE DOMAIN document.sourcing_company_role_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_company_status_d'
  ) THEN
    CREATE DOMAIN document.sourcing_company_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_demand_status_d'
  ) THEN
    CREATE DOMAIN document.sourcing_demand_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_event_status_d'
  ) THEN
    CREATE DOMAIN document.sourcing_event_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_event_type_d'
  ) THEN
    CREATE DOMAIN document.sourcing_event_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'sourcing_intercompany_status_d'
  ) THEN
    CREATE DOMAIN document.sourcing_intercompany_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'stocktake_status_d'
  ) THEN
    CREATE DOMAIN document.stocktake_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'stocktake_type_d'
  ) THEN
    CREATE DOMAIN document.stocktake_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'tax_mode_d'
  ) THEN
    CREATE DOMAIN document.tax_mode_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'term_application_status_d'
  ) THEN
    CREATE DOMAIN document.term_application_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'term_application_type_d'
  ) THEN
    CREATE DOMAIN document.term_application_type_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'transfer_pricing_method_d'
  ) THEN
    CREATE DOMAIN document.transfer_pricing_method_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'wht_certificate_status_d'
  ) THEN
    CREATE DOMAIN document.wht_certificate_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'workflow_decision_d'
  ) THEN
    CREATE DOMAIN document.workflow_decision_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'workflow_request_status_d'
  ) THEN
    CREATE DOMAIN document.workflow_request_status_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'workflow_stage_mode_d'
  ) THEN
    CREATE DOMAIN document.workflow_stage_mode_d AS text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'document' AND t.typname = 'workflow_stage_status_d'
  ) THEN
    CREATE DOMAIN document.workflow_stage_status_d AS text;
  END IF;
END $$;
