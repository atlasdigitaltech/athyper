REVOKE ALL ON SCHEMA document FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA document FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA document FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT ON
            document.active_attachment,
            document.active_comment
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            document.attachment,
            document.attachment_quota_usage,
            document.attachment_quota_reservation,
            document.attachment_folder,
            document.attachment_link,
            document.comment,
            document.comment_draft,
            document.comment_feed_cursor,
            document.content_item,
            document.content_item_access_grant,
            document.content_quota_usage,
            document.content_quota_reservation,
            document.conversation,
            document.conversation_participant,
            document.multipart_upload
        TO athyperapp;
        GRANT SELECT, INSERT, DELETE ON
            document.comment_mention,
            document.comment_reaction,
            document.content_item_link
        TO athyperapp;
        GRANT SELECT, INSERT ON snapshot.content_item_version TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA document TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON snapshot.content_item_version TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON document.supplier_registration_invitation TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            document.business_partner_invitation,
            document.business_partner_invitation_applicant_policy,
            document.business_partner_invitation_recovery,
            document.business_partner_request
        TO athyperapp;
        GRANT SELECT, INSERT ON
            document.business_partner_request_evidence,
            document.business_partner_request_validation
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_registration() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_supplier_registration_invitation() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.fn_business_partner_request_approvers(uuid, uuid, uuid, uuid) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.business_partner_invitation,
            document.business_partner_invitation_applicant_policy,
            document.business_partner_invitation_recovery,
            document.business_partner_request,
            document.business_partner_request_evidence,
            document.business_partner_request_validation
        TO athyperadmin;
        GRANT SELECT ON document.supplier_registration_invitation TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_registration() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_guard_supplier_registration_invitation() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.fn_business_partner_request_approvers(uuid, uuid, uuid, uuid) TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            document.workflow_request,
            document.workflow_stage,
            document.commitment,
            document.commitment_line,
            document.purchase_invoice,
            document.purchase_invoice_line,
            document.invoice_match_case,
            document.accounting_distribution,
            document.payment_term_application,
            document.payment_entry,
            document.journal_entry,
            document.journal_line
        TO athyperapp;

        GRANT SELECT, INSERT ON
            document.commitment_release_allocation,
            document.payment_entry_allocation,
            document.journal_line_reference
        TO athyperapp;

        GRANT EXECUTE ON FUNCTION document.trg_increment_row_version() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_company_period() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_commitment_terminal() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_invoice_terminal() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_journal_posted() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_payment_posted() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_commitment_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_commitment_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_release_allocation() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_purchase_invoice_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_purchase_invoice_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_invoice_match_case() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_distribution_posted() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_term_application() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_payment_allocation() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_journal_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_journal_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_journal_posting() TO athyperapp;
        GRANT SELECT ON document.v_party_advance_balance TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.workflow_request,
            document.workflow_stage,
            document.commitment,
            document.commitment_line,
            document.commitment_release_allocation,
            document.purchase_invoice,
            document.purchase_invoice_line,
            document.invoice_match_case,
            document.accounting_distribution,
            document.payment_term_application,
            document.payment_entry,
            document.payment_entry_allocation,
            document.journal_entry,
            document.journal_line,
            document.journal_line_reference
        TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA document TO athyperadmin;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            document.purchase_requisition,
            document.purchase_requisition_line,
            document.purchase_order_confirmation,
            document.delivery_note,
            document.delivery_note_line,
            document.receipt,
            document.receipt_line,
            document.service_sheet,
            document.service_sheet_line
        TO athyperapp;
        GRANT SELECT, INSERT ON document.purchase_order_confirmation_line TO athyperapp;

        GRANT EXECUTE ON FUNCTION document.trg_guard_p2p_header() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_p2p_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_sync_p2p_total() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_fulfillment_capacity() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_confirmation_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.recompute_commitment_schedule(uuid, uuid, uuid) TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_refresh_commitment_schedule() TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.purchase_requisition,
            document.purchase_requisition_line,
            document.purchase_order_confirmation,
            document.purchase_order_confirmation_line,
            document.delivery_note,
            document.delivery_note_line,
            document.receipt,
            document.receipt_line,
            document.service_sheet,
            document.service_sheet_line
        TO athyperadmin;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            document.pricing_component,
            document.schedule_line
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_pricing_component() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_pricing_component_write() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_schedule_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_schedule_capacity() TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.pricing_component,
            document.schedule_line
        TO athyperadmin;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            document.catalog_import,
            document.catalog_import_line,
            document.punchout_cart,
            document.punchout_cart_line,
            document.production_order,
            document.production_order_component,
            document.sales_order,
            document.sales_order_line
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.catalog_import,
            document.catalog_import_line,
            document.punchout_cart,
            document.punchout_cart_line,
            document.production_order,
            document.production_order_component,
            document.sales_order,
            document.sales_order_line
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            document.stocktake,
            document.stocktake_line,
            document.sales_opportunity,
            document.sales_opportunity_company,
            document.sales_quotation,
            document.sales_quotation_company,
            document.sales_quotation_allocation,
            document.sales_order_intercompany_fulfillment
        TO athyperapp;
        GRANT DELETE ON document.stocktake_line TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.stocktake,
            document.stocktake_line,
            document.sales_opportunity,
            document.sales_opportunity_company,
            document.sales_quotation,
            document.sales_quotation_company,
            document.sales_quotation_allocation,
            document.sales_order_intercompany_fulfillment
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT,INSERT,UPDATE ON
            document.bank_statement,
            document.bank_statement_line,
            document.bank_recon_case,
            document.depreciation_run,
            document.depreciation_schedule
        TO athyperapp;
        GRANT SELECT,INSERT ON
            document.bank_recon_case_line,
            document.depreciation_run_line
        TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.bank_statement,
            document.bank_statement_line,
            document.bank_recon_case,
            document.bank_recon_case_line,
            document.depreciation_run,
            document.depreciation_run_line,
            document.depreciation_schedule
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT,INSERT,UPDATE ON
            document.sourcing_event,
            document.sourcing_event_company,
            document.sourcing_event_demand,
            document.sourcing_event_award,
            document.sourcing_event_award_allocation,
            document.sourcing_event_intercompany_allocation
        TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.sourcing_event,
            document.sourcing_event_company,
            document.sourcing_event_demand,
            document.sourcing_event_award,
            document.sourcing_event_award_allocation,
            document.sourcing_event_intercompany_allocation
        TO athyperadmin;
    END IF;
END;
$$;

DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT,INSERT,UPDATE ON
            document.shift_assignment,document.time_punch,document.attendance_day,document.attendance_adjustment_request,
            document.compensation_change,document.employee_tax_declaration,document.employee_tax_declaration_line,
            document.leave_request,document.people_request,document.hr_case,document.onboarding_case,document.offboarding_case,
            document.payroll_period,document.payroll_run,document.payroll_run_employee,document.payroll_result
        TO athyperapp;
        GRANT SELECT,INSERT ON document.leave_balance_entry,document.payroll_result_line TO athyperapp;
        GRANT SELECT,INSERT ON document.policy_acknowledgment TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.shift_assignment,document.time_punch,document.attendance_day,document.attendance_adjustment_request,
            document.compensation_change,document.employee_tax_declaration,document.employee_tax_declaration_line,
            document.leave_request,document.leave_balance_entry,document.people_request,document.hr_case,
            document.onboarding_case,document.offboarding_case,document.payroll_period,document.payroll_run,
            document.payroll_run_employee,document.payroll_result,document.payroll_result_line,
            document.policy_acknowledgment
        TO athyperadmin;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            document.project_task,
            document.project_task_requirement,
            document.budget_profile,
            document.budget_allocation
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.project_task,
            document.project_task_requirement,
            document.budget_profile,
            document.budget_allocation
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON document.planning_scenario, document.planning_scenario_line FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON document.planning_scenario TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON document.planning_scenario_line TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.planning_scenario,
            document.planning_scenario_line
        TO athyperadmin;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT,INSERT,UPDATE ON
            document.asset_transaction,
            document.fx_revaluation_run,
            document.ic_elimination,
            document.match_exception,
            document.netting_batch,
            document.obligation_horizon,
            document.payment_remittance_output,
            document.wht_certificate,
            document.import_request,
            document.import_request_chunk,
            document.intercompany_agreement,
            document.intercompany_transaction,
            document.render_output,
            document.user_profile_update_request
        TO athyperapp;
        GRANT SELECT,INSERT ON document.payment_term_discount_result TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_asset_transaction() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_rollup_match_exceptions() TO athyperapp;
    END IF;

    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.asset_transaction,
            document.fx_revaluation_run,
            document.ic_elimination,
            document.match_exception,
            document.netting_batch,
            document.obligation_horizon,
            document.payment_remittance_output,
            document.payment_term_discount_result,
            document.wht_certificate,
            document.import_request,
            document.import_request_chunk,
            document.intercompany_agreement,
            document.intercompany_transaction,
            document.render_output,
            document.user_profile_update_request
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_validate_asset_transaction() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_rollup_match_exceptions() TO athyperadmin;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            document.attachment_series,
            document.attachment_derivative
        TO athyperapp;
        -- Legal hold: no DELETE allowed through application role
        GRANT SELECT, INSERT, UPDATE ON document.attachment_legal_hold TO athyperapp;
        -- Legal hold events and upload parts: append-only
        GRANT SELECT, INSERT ON
            document.attachment_legal_hold_event,
            document.multipart_upload_part
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.attachment_series,
            document.attachment_legal_hold,
            document.attachment_legal_hold_event,
            document.attachment_derivative,
            document.multipart_upload_part
        TO athyperadmin;
    END IF;
END;
$$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT, INSERT ON document.mesh_business_partner_match, document.mesh_business_partner_acceptance, document.mesh_business_partner_acceptance_event TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON document.mesh_business_partner_match, document.mesh_business_partner_acceptance, document.mesh_business_partner_acceptance_event TO athyperadmin;
    END IF;
END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON document.business_partner_bank_verification TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON document.business_partner_bank_verification TO athyperadmin; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.business_partner_duplicate_resolution TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON document.business_partner_duplicate_resolution TO athyperadmin; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION document.fn_resolve_business_partner_duplicate(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid) TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION document.fn_resolve_business_partner_duplicate(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid) TO athyperadmin; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.supplier_activation_evidence TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON document.supplier_activation_evidence TO athyperadmin; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.supplier_registration_recovery TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON document.supplier_registration_recovery TO athyperadmin; END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.supplier_activation_evidence TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON document.supplier_activation_evidence TO athyperadmin; END IF; END $$;
