-- ============================================================================
-- document/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "document"."asset_transaction" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."asset_transaction" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."attendance_adjustment_request" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."attendance_adjustment_request" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."attendance_day" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."attendance_day" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_recon_case" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_recon_case" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_recon_case_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_recon_case_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_statement" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_statement" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_statement_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."bank_statement_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."book_posting_derivation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."book_posting_derivation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."commitment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."commitment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."commitment_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."commitment_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."commitment_release_allocation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."commitment_release_allocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."compensation_assignment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."compensation_assignment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."compensation_change" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."compensation_change" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."depreciation_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."depreciation_run" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."depreciation_run_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."depreciation_run_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."depreciation_schedule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."depreciation_schedule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."employee_tax_declaration" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."employee_tax_declaration" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."employee_tax_declaration_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."employee_tax_declaration_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."hr_case" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."hr_case" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."invoice_match_case" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."invoice_match_case" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."invoice_tax_snapshot" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."invoice_tax_snapshot" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."journal_entry" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."journal_entry" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."journal_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."journal_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."journal_line_reference" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."journal_line_reference" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."leave_balance_entry" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."leave_balance_entry" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."leave_request" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."leave_request" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."match_exception" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."match_exception" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."obligation_horizon" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."obligation_horizon" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."offboarding_case" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."offboarding_case" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."onboarding_case" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."onboarding_case" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."operating_organization_resource_company" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."operating_organization_resource_company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."operating_organization_resource_owner" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."operating_organization_resource_owner" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."party_advance_balance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."party_advance_balance" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."payment_entry_allocation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."payment_entry_allocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_period" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_period" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_result" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_result" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_result_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_result_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_run" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_run_employee" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."payroll_run_employee" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."people_request" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."people_request" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."policy_acknowledgment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."policy_acknowledgment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."pricing_component" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."pricing_component" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."render_job" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."render_job" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."render_output" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."render_output" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_opportunity" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_opportunity" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_opportunity_company" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_opportunity_company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_order" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_order" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_order_intercompany_fulfillment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_order_intercompany_fulfillment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_quotation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_quotation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_quotation_allocation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_quotation_allocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_quotation_company" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sales_quotation_company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."schedule_line" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."schedule_line" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."seed_gift" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."seed_gift" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."shift_assignment" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."shift_assignment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_award" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_award" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_award_allocation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_award_allocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_company" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_demand" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_demand" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_intercompany_allocation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."sourcing_event_intercompany_allocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."time_punch" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."time_punch" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."user_profile_update_request" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."user_profile_update_request" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."wht_certificate" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."wht_certificate" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."workflow_request" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."workflow_request" FORCE ROW LEVEL SECURITY;

ALTER TABLE "document"."workflow_stage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "document"."workflow_stage" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "document"."asset_transaction"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."asset_transaction"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."asset_transaction"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."asset_transaction"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."asset_transaction"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."asset_transaction"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."attendance_adjustment_request"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."attendance_adjustment_request"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."attendance_adjustment_request"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."attendance_adjustment_request"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."attendance_adjustment_request"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."attendance_adjustment_request"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."attendance_day"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."attendance_day"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."attendance_day"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."attendance_day"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."attendance_day"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."attendance_day"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."bank_recon_case"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."bank_recon_case"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."bank_recon_case"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."bank_recon_case"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."bank_recon_case"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."bank_recon_case_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."bank_recon_case_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."bank_recon_case_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."bank_recon_case_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "document"."bank_statement"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."bank_statement"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."bank_statement"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."bank_statement"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."bank_statement"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."bank_statement_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."bank_statement_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."bank_statement_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."bank_statement_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."bank_statement_line"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."book_posting_derivation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."book_posting_derivation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."book_posting_derivation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."book_posting_derivation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."book_posting_derivation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."commitment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."commitment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."commitment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."commitment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."commitment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."commitment_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."commitment_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."commitment_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."commitment_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."commitment_line"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."commitment_release_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."commitment_release_allocation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."commitment_release_allocation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."commitment_release_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."commitment_release_allocation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."compensation_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."compensation_assignment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."compensation_assignment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."compensation_assignment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."compensation_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."compensation_assignment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."compensation_change"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."compensation_change"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."compensation_change"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."compensation_change"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."compensation_change"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."compensation_change"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."depreciation_run"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."depreciation_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."depreciation_run"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."depreciation_run"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."depreciation_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."depreciation_run"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."depreciation_run_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."depreciation_run_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."depreciation_run_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."depreciation_run_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "document"."depreciation_schedule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."depreciation_schedule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."depreciation_schedule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."depreciation_schedule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."depreciation_schedule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."employee_tax_declaration"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."employee_tax_declaration"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."employee_tax_declaration"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."employee_tax_declaration"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."employee_tax_declaration"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."employee_tax_declaration"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."employee_tax_declaration_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."employee_tax_declaration_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."employee_tax_declaration_line"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."employee_tax_declaration_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."employee_tax_declaration_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."employee_tax_declaration_line"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."hr_case"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."hr_case"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."hr_case"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."hr_case"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."hr_case"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."hr_case"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."invoice_match_case"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."invoice_match_case"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."invoice_match_case"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."invoice_match_case"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."invoice_match_case"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."invoice_tax_snapshot"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."invoice_tax_snapshot"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."invoice_tax_snapshot"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."invoice_tax_snapshot"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "document"."journal_entry"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."journal_entry"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."journal_entry"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."journal_entry"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."journal_entry"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."journal_entry"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."journal_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."journal_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."journal_line"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."journal_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."journal_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."journal_line"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."journal_line_reference"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."journal_line_reference"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."journal_line_reference"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."journal_line_reference"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."journal_line_reference"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."journal_line_reference"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."leave_balance_entry"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."leave_balance_entry"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."leave_balance_entry"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."leave_balance_entry"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."leave_balance_entry"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."leave_balance_entry"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."leave_request"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."leave_request"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."leave_request"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."leave_request"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."leave_request"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."leave_request"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."match_exception"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."match_exception"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."match_exception"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."match_exception"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."match_exception"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."obligation_horizon"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."obligation_horizon"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."obligation_horizon"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."obligation_horizon"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."obligation_horizon"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."offboarding_case"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."offboarding_case"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."offboarding_case"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."offboarding_case"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."offboarding_case"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."offboarding_case"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."onboarding_case"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."onboarding_case"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."onboarding_case"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."onboarding_case"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."onboarding_case"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."onboarding_case"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."operating_organization_resource_company"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."operating_organization_resource_company"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."operating_organization_resource_company"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."operating_organization_resource_company"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."operating_organization_resource_company"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."operating_organization_resource_company"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."operating_organization_resource_owner"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."operating_organization_resource_owner"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."operating_organization_resource_owner"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."operating_organization_resource_owner"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."operating_organization_resource_owner"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."operating_organization_resource_owner"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."party_advance_balance"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."party_advance_balance"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."party_advance_balance"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."party_advance_balance"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."party_advance_balance"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."payment_entry_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."payment_entry_allocation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."payment_entry_allocation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."payment_entry_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "document"."payroll_period"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."payroll_period"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."payroll_period"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."payroll_period"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."payroll_period"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."payroll_period"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."payroll_result"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."payroll_result"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."payroll_result"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."payroll_result"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."payroll_result"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."payroll_result"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."payroll_result_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."payroll_result_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."payroll_result_line"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."payroll_result_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."payroll_result_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."payroll_result_line"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."payroll_run"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."payroll_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."payroll_run"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."payroll_run"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."payroll_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."payroll_run"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."payroll_run_employee"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."payroll_run_employee"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."payroll_run_employee"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."payroll_run_employee"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."payroll_run_employee"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."payroll_run_employee"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."people_request"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."people_request"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."people_request"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."people_request"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."people_request"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."people_request"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."policy_acknowledgment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."policy_acknowledgment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."policy_acknowledgment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."policy_acknowledgment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."policy_acknowledgment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."policy_acknowledgment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."pricing_component"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "tenant_insert" ON "document"."pricing_component"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."pricing_component"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_update" ON "document"."pricing_component"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."render_job"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."render_job"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."render_job"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."render_job"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."render_job"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."render_output"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."render_output"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."render_output"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."render_output"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."render_output"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sales_opportunity"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sales_opportunity"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sales_opportunity"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sales_opportunity"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sales_opportunity"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sales_opportunity"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sales_opportunity_company"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sales_opportunity_company"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sales_opportunity_company"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sales_opportunity_company"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sales_opportunity_company"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sales_opportunity_company"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sales_order"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sales_order"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sales_order"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sales_order"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sales_order"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sales_order"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sales_order_intercompany_fulfillment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sales_order_intercompany_fulfillment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sales_order_intercompany_fulfillment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sales_order_intercompany_fulfillment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sales_order_intercompany_fulfillment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sales_order_intercompany_fulfillment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sales_quotation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sales_quotation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sales_quotation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sales_quotation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sales_quotation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sales_quotation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sales_quotation_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sales_quotation_allocation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sales_quotation_allocation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sales_quotation_allocation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sales_quotation_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sales_quotation_allocation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sales_quotation_company"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sales_quotation_company"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sales_quotation_company"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sales_quotation_company"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sales_quotation_company"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sales_quotation_company"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."schedule_line"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."schedule_line"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."schedule_line"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."schedule_line"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."schedule_line"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."seed_gift"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."seed_gift"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."seed_gift"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."seed_gift"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."seed_gift"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."seed_gift"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."shift_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."shift_assignment"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."shift_assignment"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."shift_assignment"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."shift_assignment"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."shift_assignment"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sourcing_event"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sourcing_event"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sourcing_event"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sourcing_event"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sourcing_event"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sourcing_event"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sourcing_event_award"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sourcing_event_award"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sourcing_event_award"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sourcing_event_award"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sourcing_event_award"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sourcing_event_award"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sourcing_event_award_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sourcing_event_award_allocation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sourcing_event_award_allocation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sourcing_event_award_allocation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sourcing_event_award_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sourcing_event_award_allocation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sourcing_event_company"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sourcing_event_company"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sourcing_event_company"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sourcing_event_company"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sourcing_event_company"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sourcing_event_company"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sourcing_event_demand"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sourcing_event_demand"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sourcing_event_demand"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sourcing_event_demand"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sourcing_event_demand"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sourcing_event_demand"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."sourcing_event_intercompany_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."sourcing_event_intercompany_allocation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."sourcing_event_intercompany_allocation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."sourcing_event_intercompany_allocation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."sourcing_event_intercompany_allocation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."sourcing_event_intercompany_allocation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."time_punch"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."time_punch"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "document"."time_punch"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "document"."time_punch"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."time_punch"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."time_punch"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."user_profile_update_request"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "tenant_insert" ON "document"."user_profile_update_request"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."user_profile_update_request"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_update" ON "document"."user_profile_update_request"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "document"."wht_certificate"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."wht_certificate"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."wht_certificate"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."wht_certificate"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."workflow_request"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."workflow_request"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."workflow_request"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."workflow_request"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."workflow_request"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "document"."workflow_stage"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "document"."workflow_stage"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "document"."workflow_stage"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "document"."workflow_stage"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "document"."workflow_stage"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

GRANT EXECUTE ON FUNCTION "document".cleanup_expired_render_outputs(p_tenant_id uuid, p_retention_days integer, p_batch_size integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "document".cleanup_expired_render_outputs(p_tenant_id uuid, p_retention_days integer, p_batch_size integer) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "document".cleanup_expired_render_outputs(p_tenant_id uuid, p_retention_days integer, p_batch_size integer) TO athyperapp;

GRANT EXECUTE ON FUNCTION "document".compute_attachment_lineage(p_tenant_id uuid, p_attachment_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "document".compute_attachment_lineage(p_tenant_id uuid, p_attachment_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "document".compute_attachment_lineage(p_tenant_id uuid, p_attachment_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "document".resolve_template_binding(p_tenant_id uuid, p_entity_name text, p_operation text, p_variant text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "document".resolve_template_binding(p_tenant_id uuid, p_entity_name text, p_operation text, p_variant text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "document".resolve_template_binding(p_tenant_id uuid, p_entity_name text, p_operation text, p_variant text) TO athyperapp;

GRANT DELETE ON TABLE "document"."accounting_distribution" TO athyperadmin;

GRANT INSERT ON TABLE "document"."accounting_distribution" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."accounting_distribution" TO athyperadmin;

GRANT SELECT ON TABLE "document"."accounting_distribution" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."accounting_distribution" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."accounting_distribution" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."accounting_distribution" TO athyperadmin;

GRANT SELECT ON TABLE "document"."accounting_distribution" TO athyperapp;

GRANT DELETE ON TABLE "document"."asset_transaction" TO athyperadmin;

GRANT INSERT ON TABLE "document"."asset_transaction" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."asset_transaction" TO athyperadmin;

GRANT SELECT ON TABLE "document"."asset_transaction" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."asset_transaction" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."asset_transaction" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."asset_transaction" TO athyperadmin;

GRANT SELECT ON TABLE "document"."asset_transaction" TO athyperapp;

GRANT DELETE ON TABLE "document"."attendance_adjustment_request" TO athyperadmin;

GRANT INSERT ON TABLE "document"."attendance_adjustment_request" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."attendance_adjustment_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."attendance_adjustment_request" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."attendance_adjustment_request" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."attendance_adjustment_request" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."attendance_adjustment_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."attendance_adjustment_request" TO athyperapp;

GRANT DELETE ON TABLE "document"."attendance_day" TO athyperadmin;

GRANT INSERT ON TABLE "document"."attendance_day" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."attendance_day" TO athyperadmin;

GRANT SELECT ON TABLE "document"."attendance_day" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."attendance_day" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."attendance_day" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."attendance_day" TO athyperadmin;

GRANT SELECT ON TABLE "document"."attendance_day" TO athyperapp;

GRANT DELETE ON TABLE "document"."bank_recon_case" TO athyperadmin;

GRANT INSERT ON TABLE "document"."bank_recon_case" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."bank_recon_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_recon_case" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."bank_recon_case" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."bank_recon_case" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."bank_recon_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_recon_case" TO athyperapp;

GRANT DELETE ON TABLE "document"."bank_recon_case_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."bank_recon_case_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."bank_recon_case_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_recon_case_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."bank_recon_case_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."bank_recon_case_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."bank_recon_case_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_recon_case_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."bank_statement" TO athyperadmin;

GRANT INSERT ON TABLE "document"."bank_statement" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."bank_statement" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_statement" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."bank_statement" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."bank_statement" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."bank_statement" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_statement" TO athyperapp;

GRANT DELETE ON TABLE "document"."bank_statement_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."bank_statement_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."bank_statement_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_statement_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."bank_statement_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."bank_statement_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."bank_statement_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."bank_statement_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."book_posting_derivation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."book_posting_derivation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."book_posting_derivation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."book_posting_derivation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."book_posting_derivation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."book_posting_derivation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."book_posting_derivation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."book_posting_derivation" TO athyperapp;

GRANT DELETE ON TABLE "document"."command_log" TO athyperadmin;

GRANT INSERT ON TABLE "document"."command_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."command_log" TO athyperadmin;

GRANT SELECT ON TABLE "document"."command_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."command_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."command_log" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."command_log" TO athyperadmin;

GRANT SELECT ON TABLE "document"."command_log" TO athyperapp;

GRANT DELETE ON TABLE "document"."commitment" TO athyperadmin;

GRANT INSERT ON TABLE "document"."commitment" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."commitment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."commitment" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."commitment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."commitment" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."commitment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."commitment" TO athyperapp;

GRANT DELETE ON TABLE "document"."commitment_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."commitment_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."commitment_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."commitment_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."commitment_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."commitment_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."commitment_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."commitment_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."commitment_release_allocation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."commitment_release_allocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."commitment_release_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."commitment_release_allocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."commitment_release_allocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."commitment_release_allocation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."commitment_release_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."commitment_release_allocation" TO athyperapp;

GRANT DELETE ON TABLE "document"."compensation_assignment" TO athyperadmin;

GRANT INSERT ON TABLE "document"."compensation_assignment" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."compensation_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."compensation_assignment" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."compensation_assignment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."compensation_assignment" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."compensation_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."compensation_assignment" TO athyperapp;

GRANT DELETE ON TABLE "document"."compensation_change" TO athyperadmin;

GRANT INSERT ON TABLE "document"."compensation_change" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."compensation_change" TO athyperadmin;

GRANT SELECT ON TABLE "document"."compensation_change" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."compensation_change" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."compensation_change" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."compensation_change" TO athyperadmin;

GRANT SELECT ON TABLE "document"."compensation_change" TO athyperapp;

GRANT DELETE ON TABLE "document"."delivery_note" TO athyperadmin;

GRANT INSERT ON TABLE "document"."delivery_note" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."delivery_note" TO athyperadmin;

GRANT SELECT ON TABLE "document"."delivery_note" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."delivery_note" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."delivery_note" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."delivery_note" TO athyperadmin;

GRANT SELECT ON TABLE "document"."delivery_note" TO athyperapp;

GRANT DELETE ON TABLE "document"."delivery_note_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."delivery_note_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."delivery_note_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."delivery_note_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."delivery_note_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."delivery_note_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."delivery_note_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."delivery_note_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."depreciation_run" TO athyperadmin;

GRANT INSERT ON TABLE "document"."depreciation_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."depreciation_run" TO athyperadmin;

GRANT SELECT ON TABLE "document"."depreciation_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."depreciation_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."depreciation_run" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."depreciation_run" TO athyperadmin;

GRANT SELECT ON TABLE "document"."depreciation_run" TO athyperapp;

GRANT DELETE ON TABLE "document"."depreciation_run_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."depreciation_run_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."depreciation_run_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."depreciation_run_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."depreciation_run_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."depreciation_run_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."depreciation_run_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."depreciation_run_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."depreciation_schedule" TO athyperadmin;

GRANT INSERT ON TABLE "document"."depreciation_schedule" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."depreciation_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "document"."depreciation_schedule" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."depreciation_schedule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."depreciation_schedule" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."depreciation_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "document"."depreciation_schedule" TO athyperapp;

GRANT DELETE ON TABLE "document"."doc_attachment" TO athyperadmin;

GRANT INSERT ON TABLE "document"."doc_attachment" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."doc_attachment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."doc_attachment" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."doc_attachment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."doc_attachment" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."doc_attachment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."doc_attachment" TO athyperapp;

GRANT DELETE ON TABLE "document"."employee_tax_declaration" TO athyperadmin;

GRANT INSERT ON TABLE "document"."employee_tax_declaration" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."employee_tax_declaration" TO athyperadmin;

GRANT SELECT ON TABLE "document"."employee_tax_declaration" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."employee_tax_declaration" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."employee_tax_declaration" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."employee_tax_declaration" TO athyperadmin;

GRANT SELECT ON TABLE "document"."employee_tax_declaration" TO athyperapp;

GRANT DELETE ON TABLE "document"."employee_tax_declaration_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."employee_tax_declaration_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."employee_tax_declaration_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."employee_tax_declaration_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."employee_tax_declaration_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."employee_tax_declaration_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."employee_tax_declaration_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."employee_tax_declaration_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."forecast_scenario" TO athyperadmin;

GRANT INSERT ON TABLE "document"."forecast_scenario" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."forecast_scenario" TO athyperadmin;

GRANT SELECT ON TABLE "document"."forecast_scenario" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."forecast_scenario" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."forecast_scenario" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."forecast_scenario" TO athyperadmin;

GRANT SELECT ON TABLE "document"."forecast_scenario" TO athyperapp;

GRANT DELETE ON TABLE "document"."fx_revaluation_run" TO athyperadmin;

GRANT INSERT ON TABLE "document"."fx_revaluation_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."fx_revaluation_run" TO athyperadmin;

GRANT SELECT ON TABLE "document"."fx_revaluation_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."fx_revaluation_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."fx_revaluation_run" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."fx_revaluation_run" TO athyperadmin;

GRANT SELECT ON TABLE "document"."fx_revaluation_run" TO athyperapp;

GRANT DELETE ON TABLE "document"."hr_case" TO athyperadmin;

GRANT INSERT ON TABLE "document"."hr_case" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."hr_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."hr_case" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."hr_case" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."hr_case" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."hr_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."hr_case" TO athyperapp;

GRANT DELETE ON TABLE "document"."ic_elimination" TO athyperadmin;

GRANT INSERT ON TABLE "document"."ic_elimination" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."ic_elimination" TO athyperadmin;

GRANT SELECT ON TABLE "document"."ic_elimination" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."ic_elimination" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."ic_elimination" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."ic_elimination" TO athyperadmin;

GRANT SELECT ON TABLE "document"."ic_elimination" TO athyperapp;

GRANT DELETE ON TABLE "document"."import_request" TO athyperadmin;

GRANT INSERT ON TABLE "document"."import_request" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."import_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."import_request" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."import_request" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."import_request" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."import_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."import_request" TO athyperapp;

GRANT DELETE ON TABLE "document"."import_request_chunk" TO athyperadmin;

GRANT INSERT ON TABLE "document"."import_request_chunk" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."import_request_chunk" TO athyperadmin;

GRANT SELECT ON TABLE "document"."import_request_chunk" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."import_request_chunk" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."import_request_chunk" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."import_request_chunk" TO athyperadmin;

GRANT SELECT ON TABLE "document"."import_request_chunk" TO athyperapp;

GRANT DELETE ON TABLE "document"."intercompany_agreement" TO athyperadmin;

GRANT INSERT ON TABLE "document"."intercompany_agreement" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."intercompany_agreement" TO athyperadmin;

GRANT SELECT ON TABLE "document"."intercompany_agreement" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."intercompany_agreement" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."intercompany_agreement" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."intercompany_agreement" TO athyperadmin;

GRANT SELECT ON TABLE "document"."intercompany_agreement" TO athyperapp;

GRANT DELETE ON TABLE "document"."intercompany_transaction" TO athyperadmin;

GRANT INSERT ON TABLE "document"."intercompany_transaction" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."intercompany_transaction" TO athyperadmin;

GRANT SELECT ON TABLE "document"."intercompany_transaction" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."intercompany_transaction" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."intercompany_transaction" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."intercompany_transaction" TO athyperadmin;

GRANT SELECT ON TABLE "document"."intercompany_transaction" TO athyperapp;

GRANT DELETE ON TABLE "document"."invoice_match_case" TO athyperadmin;

GRANT INSERT ON TABLE "document"."invoice_match_case" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."invoice_match_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."invoice_match_case" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."invoice_match_case" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."invoice_match_case" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."invoice_match_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."invoice_match_case" TO athyperapp;

GRANT DELETE ON TABLE "document"."invoice_tax_snapshot" TO athyperadmin;

GRANT INSERT ON TABLE "document"."invoice_tax_snapshot" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."invoice_tax_snapshot" TO athyperadmin;

GRANT SELECT ON TABLE "document"."invoice_tax_snapshot" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."invoice_tax_snapshot" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."invoice_tax_snapshot" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."invoice_tax_snapshot" TO athyperadmin;

GRANT SELECT ON TABLE "document"."invoice_tax_snapshot" TO athyperapp;

GRANT DELETE ON TABLE "document"."journal_entry" TO athyperadmin;

GRANT INSERT ON TABLE "document"."journal_entry" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."journal_entry" TO athyperadmin;

GRANT SELECT ON TABLE "document"."journal_entry" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."journal_entry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."journal_entry" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."journal_entry" TO athyperadmin;

GRANT SELECT ON TABLE "document"."journal_entry" TO athyperapp;

GRANT DELETE ON TABLE "document"."journal_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."journal_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."journal_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."journal_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."journal_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."journal_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."journal_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."journal_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."journal_line_reference" TO athyperadmin;

GRANT INSERT ON TABLE "document"."journal_line_reference" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."journal_line_reference" TO athyperadmin;

GRANT SELECT ON TABLE "document"."journal_line_reference" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."journal_line_reference" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."journal_line_reference" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."journal_line_reference" TO athyperadmin;

GRANT SELECT ON TABLE "document"."journal_line_reference" TO athyperapp;

GRANT DELETE ON TABLE "document"."leave_balance_entry" TO athyperadmin;

GRANT INSERT ON TABLE "document"."leave_balance_entry" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."leave_balance_entry" TO athyperadmin;

GRANT SELECT ON TABLE "document"."leave_balance_entry" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."leave_balance_entry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."leave_balance_entry" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."leave_balance_entry" TO athyperadmin;

GRANT SELECT ON TABLE "document"."leave_balance_entry" TO athyperapp;

GRANT DELETE ON TABLE "document"."leave_request" TO athyperadmin;

GRANT INSERT ON TABLE "document"."leave_request" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."leave_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."leave_request" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."leave_request" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."leave_request" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."leave_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."leave_request" TO athyperapp;

GRANT DELETE ON TABLE "document"."match_exception" TO athyperadmin;

GRANT INSERT ON TABLE "document"."match_exception" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."match_exception" TO athyperadmin;

GRANT SELECT ON TABLE "document"."match_exception" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."match_exception" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."match_exception" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."match_exception" TO athyperadmin;

GRANT SELECT ON TABLE "document"."match_exception" TO athyperapp;

GRANT DELETE ON TABLE "document"."netting_batch" TO athyperadmin;

GRANT INSERT ON TABLE "document"."netting_batch" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."netting_batch" TO athyperadmin;

GRANT SELECT ON TABLE "document"."netting_batch" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."netting_batch" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."netting_batch" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."netting_batch" TO athyperadmin;

GRANT SELECT ON TABLE "document"."netting_batch" TO athyperapp;

GRANT DELETE ON TABLE "document"."obligation_horizon" TO athyperadmin;

GRANT INSERT ON TABLE "document"."obligation_horizon" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."obligation_horizon" TO athyperadmin;

GRANT SELECT ON TABLE "document"."obligation_horizon" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."obligation_horizon" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."obligation_horizon" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."obligation_horizon" TO athyperadmin;

GRANT SELECT ON TABLE "document"."obligation_horizon" TO athyperapp;

GRANT DELETE ON TABLE "document"."offboarding_case" TO athyperadmin;

GRANT INSERT ON TABLE "document"."offboarding_case" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."offboarding_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."offboarding_case" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."offboarding_case" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."offboarding_case" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."offboarding_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."offboarding_case" TO athyperapp;

GRANT DELETE ON TABLE "document"."onboarding_case" TO athyperadmin;

GRANT INSERT ON TABLE "document"."onboarding_case" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."onboarding_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."onboarding_case" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."onboarding_case" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."onboarding_case" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."onboarding_case" TO athyperadmin;

GRANT SELECT ON TABLE "document"."onboarding_case" TO athyperapp;

GRANT DELETE ON TABLE "document"."operating_organization_resource_company" TO athyperadmin;

GRANT INSERT ON TABLE "document"."operating_organization_resource_company" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."operating_organization_resource_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."operating_organization_resource_company" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."operating_organization_resource_company" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."operating_organization_resource_company" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."operating_organization_resource_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."operating_organization_resource_company" TO athyperapp;

GRANT DELETE ON TABLE "document"."operating_organization_resource_owner" TO athyperadmin;

GRANT INSERT ON TABLE "document"."operating_organization_resource_owner" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."operating_organization_resource_owner" TO athyperadmin;

GRANT SELECT ON TABLE "document"."operating_organization_resource_owner" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."operating_organization_resource_owner" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."operating_organization_resource_owner" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."operating_organization_resource_owner" TO athyperadmin;

GRANT SELECT ON TABLE "document"."operating_organization_resource_owner" TO athyperapp;

GRANT DELETE ON TABLE "document"."party_advance_balance" TO athyperadmin;

GRANT INSERT ON TABLE "document"."party_advance_balance" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."party_advance_balance" TO athyperadmin;

GRANT SELECT ON TABLE "document"."party_advance_balance" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."party_advance_balance" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."party_advance_balance" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."party_advance_balance" TO athyperadmin;

GRANT SELECT ON TABLE "document"."party_advance_balance" TO athyperapp;

GRANT DELETE ON TABLE "document"."payment_entry" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payment_entry" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payment_entry" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_entry" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payment_entry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payment_entry" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payment_entry" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_entry" TO athyperapp;

GRANT DELETE ON TABLE "document"."payment_entry_allocation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payment_entry_allocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payment_entry_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_entry_allocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payment_entry_allocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payment_entry_allocation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payment_entry_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_entry_allocation" TO athyperapp;

GRANT DELETE ON TABLE "document"."payment_remittance_output" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payment_remittance_output" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payment_remittance_output" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_remittance_output" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payment_remittance_output" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payment_remittance_output" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payment_remittance_output" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_remittance_output" TO athyperapp;

GRANT DELETE ON TABLE "document"."payment_term_application" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payment_term_application" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payment_term_application" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_term_application" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payment_term_application" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payment_term_application" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payment_term_application" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_term_application" TO athyperapp;

GRANT DELETE ON TABLE "document"."payment_term_discount_result" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payment_term_discount_result" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payment_term_discount_result" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_term_discount_result" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payment_term_discount_result" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payment_term_discount_result" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payment_term_discount_result" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payment_term_discount_result" TO athyperapp;

GRANT DELETE ON TABLE "document"."payroll_period" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payroll_period" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payroll_period" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_period" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payroll_period" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payroll_period" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payroll_period" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_period" TO athyperapp;

GRANT DELETE ON TABLE "document"."payroll_result" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payroll_result" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payroll_result" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_result" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payroll_result" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payroll_result" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payroll_result" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_result" TO athyperapp;

GRANT DELETE ON TABLE "document"."payroll_result_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payroll_result_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payroll_result_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_result_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payroll_result_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payroll_result_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payroll_result_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_result_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."payroll_run" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payroll_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payroll_run" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payroll_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payroll_run" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payroll_run" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_run" TO athyperapp;

GRANT DELETE ON TABLE "document"."payroll_run_employee" TO athyperadmin;

GRANT INSERT ON TABLE "document"."payroll_run_employee" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."payroll_run_employee" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_run_employee" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."payroll_run_employee" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."payroll_run_employee" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."payroll_run_employee" TO athyperadmin;

GRANT SELECT ON TABLE "document"."payroll_run_employee" TO athyperapp;

GRANT DELETE ON TABLE "document"."people_request" TO athyperadmin;

GRANT INSERT ON TABLE "document"."people_request" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."people_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."people_request" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."people_request" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."people_request" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."people_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."people_request" TO athyperapp;

GRANT DELETE ON TABLE "document"."policy_acknowledgment" TO athyperadmin;

GRANT INSERT ON TABLE "document"."policy_acknowledgment" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."policy_acknowledgment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."policy_acknowledgment" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."policy_acknowledgment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."policy_acknowledgment" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."policy_acknowledgment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."policy_acknowledgment" TO athyperapp;

GRANT DELETE ON TABLE "document"."pricing_component" TO athyperadmin;

GRANT INSERT ON TABLE "document"."pricing_component" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."pricing_component" TO athyperadmin;

GRANT SELECT ON TABLE "document"."pricing_component" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."pricing_component" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."pricing_component" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."pricing_component" TO athyperadmin;

GRANT SELECT ON TABLE "document"."pricing_component" TO athyperapp;

GRANT DELETE ON TABLE "document"."purchase_invoice" TO athyperadmin;

GRANT INSERT ON TABLE "document"."purchase_invoice" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."purchase_invoice" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_invoice" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."purchase_invoice" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."purchase_invoice" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."purchase_invoice" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_invoice" TO athyperapp;

GRANT DELETE ON TABLE "document"."purchase_invoice_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."purchase_invoice_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."purchase_invoice_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_invoice_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."purchase_invoice_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."purchase_invoice_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."purchase_invoice_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_invoice_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."purchase_order" TO athyperadmin;

GRANT INSERT ON TABLE "document"."purchase_order" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."purchase_order" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_order" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."purchase_order" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."purchase_order" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."purchase_order" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_order" TO athyperapp;

GRANT DELETE ON TABLE "document"."purchase_order_confirmation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."purchase_order_confirmation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."purchase_order_confirmation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_order_confirmation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."purchase_order_confirmation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."purchase_order_confirmation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."purchase_order_confirmation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_order_confirmation" TO athyperapp;

GRANT DELETE ON TABLE "document"."purchase_order_confirmation_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."purchase_order_confirmation_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."purchase_order_confirmation_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_order_confirmation_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."purchase_order_confirmation_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."purchase_order_confirmation_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."purchase_order_confirmation_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_order_confirmation_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."purchase_requisition" TO athyperadmin;

GRANT INSERT ON TABLE "document"."purchase_requisition" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."purchase_requisition" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_requisition" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."purchase_requisition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."purchase_requisition" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."purchase_requisition" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_requisition" TO athyperapp;

GRANT DELETE ON TABLE "document"."purchase_requisition_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."purchase_requisition_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."purchase_requisition_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_requisition_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."purchase_requisition_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."purchase_requisition_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."purchase_requisition_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."purchase_requisition_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."receipt" TO athyperadmin;

GRANT INSERT ON TABLE "document"."receipt" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."receipt" TO athyperadmin;

GRANT SELECT ON TABLE "document"."receipt" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."receipt" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."receipt" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."receipt" TO athyperadmin;

GRANT SELECT ON TABLE "document"."receipt" TO athyperapp;

GRANT DELETE ON TABLE "document"."receipt_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."receipt_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."receipt_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."receipt_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."receipt_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."receipt_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."receipt_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."receipt_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."render_job" TO athyperadmin;

GRANT INSERT ON TABLE "document"."render_job" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."render_job" TO athyperadmin;

GRANT SELECT ON TABLE "document"."render_job" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."render_job" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."render_job" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."render_job" TO athyperadmin;

GRANT SELECT ON TABLE "document"."render_job" TO athyperapp;

GRANT DELETE ON TABLE "document"."render_output" TO athyperadmin;

GRANT INSERT ON TABLE "document"."render_output" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."render_output" TO athyperadmin;

GRANT SELECT ON TABLE "document"."render_output" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."render_output" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."render_output" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."render_output" TO athyperadmin;

GRANT SELECT ON TABLE "document"."render_output" TO athyperapp;

GRANT DELETE ON TABLE "document"."sales_opportunity" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sales_opportunity" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sales_opportunity" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_opportunity" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sales_opportunity" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sales_opportunity" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sales_opportunity" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_opportunity" TO athyperapp;

GRANT DELETE ON TABLE "document"."sales_opportunity_company" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sales_opportunity_company" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sales_opportunity_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_opportunity_company" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sales_opportunity_company" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sales_opportunity_company" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sales_opportunity_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_opportunity_company" TO athyperapp;

GRANT DELETE ON TABLE "document"."sales_order" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sales_order" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sales_order" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_order" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sales_order" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sales_order" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sales_order" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_order" TO athyperapp;

GRANT DELETE ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_order_intercompany_fulfillment" TO athyperapp;

GRANT DELETE ON TABLE "document"."sales_quotation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sales_quotation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sales_quotation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_quotation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sales_quotation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sales_quotation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sales_quotation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_quotation" TO athyperapp;

GRANT DELETE ON TABLE "document"."sales_quotation_allocation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sales_quotation_allocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sales_quotation_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_quotation_allocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sales_quotation_allocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sales_quotation_allocation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sales_quotation_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_quotation_allocation" TO athyperapp;

GRANT DELETE ON TABLE "document"."sales_quotation_company" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sales_quotation_company" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sales_quotation_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_quotation_company" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sales_quotation_company" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sales_quotation_company" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sales_quotation_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sales_quotation_company" TO athyperapp;

GRANT DELETE ON TABLE "document"."schedule_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."schedule_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."schedule_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."schedule_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."schedule_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."schedule_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."schedule_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."schedule_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."seed_gift" TO athyperadmin;

GRANT INSERT ON TABLE "document"."seed_gift" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."seed_gift" TO athyperadmin;

GRANT SELECT ON TABLE "document"."seed_gift" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."seed_gift" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."seed_gift" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."seed_gift" TO athyperadmin;

GRANT SELECT ON TABLE "document"."seed_gift" TO athyperapp;

GRANT DELETE ON TABLE "document"."service_sheet" TO athyperadmin;

GRANT INSERT ON TABLE "document"."service_sheet" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."service_sheet" TO athyperadmin;

GRANT SELECT ON TABLE "document"."service_sheet" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."service_sheet" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."service_sheet" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."service_sheet" TO athyperadmin;

GRANT SELECT ON TABLE "document"."service_sheet" TO athyperapp;

GRANT DELETE ON TABLE "document"."service_sheet_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."service_sheet_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."service_sheet_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."service_sheet_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."service_sheet_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."service_sheet_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."service_sheet_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."service_sheet_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."shift_assignment" TO athyperadmin;

GRANT INSERT ON TABLE "document"."shift_assignment" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."shift_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."shift_assignment" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."shift_assignment" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."shift_assignment" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."shift_assignment" TO athyperadmin;

GRANT SELECT ON TABLE "document"."shift_assignment" TO athyperapp;

GRANT DELETE ON TABLE "document"."sourcing_event" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sourcing_event" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sourcing_event" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sourcing_event" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sourcing_event" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sourcing_event" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event" TO athyperapp;

GRANT DELETE ON TABLE "document"."sourcing_event_award" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sourcing_event_award" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sourcing_event_award" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_award" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sourcing_event_award" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sourcing_event_award" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sourcing_event_award" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_award" TO athyperapp;

GRANT DELETE ON TABLE "document"."sourcing_event_award_allocation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sourcing_event_award_allocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sourcing_event_award_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_award_allocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sourcing_event_award_allocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sourcing_event_award_allocation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sourcing_event_award_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_award_allocation" TO athyperapp;

GRANT DELETE ON TABLE "document"."sourcing_event_company" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sourcing_event_company" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sourcing_event_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_company" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sourcing_event_company" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sourcing_event_company" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sourcing_event_company" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_company" TO athyperapp;

GRANT DELETE ON TABLE "document"."sourcing_event_demand" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sourcing_event_demand" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sourcing_event_demand" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_demand" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sourcing_event_demand" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sourcing_event_demand" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sourcing_event_demand" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_demand" TO athyperapp;

GRANT DELETE ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperadmin;

GRANT INSERT ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperadmin;

GRANT SELECT ON TABLE "document"."sourcing_event_intercompany_allocation" TO athyperapp;

GRANT DELETE ON TABLE "document"."stocktake" TO athyperadmin;

GRANT INSERT ON TABLE "document"."stocktake" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."stocktake" TO athyperadmin;

GRANT SELECT ON TABLE "document"."stocktake" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."stocktake" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."stocktake" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."stocktake" TO athyperadmin;

GRANT SELECT ON TABLE "document"."stocktake" TO athyperapp;

GRANT DELETE ON TABLE "document"."stocktake_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."stocktake_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."stocktake_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."stocktake_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."stocktake_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."stocktake_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."stocktake_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."stocktake_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperadmin;

GRANT INSERT ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperadmin;

GRANT SELECT ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperadmin;

GRANT SELECT ON TABLE "document"."supplier_rebuild_orphan_quarantine" TO athyperapp;

GRANT DELETE ON TABLE "document"."time_punch" TO athyperadmin;

GRANT INSERT ON TABLE "document"."time_punch" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."time_punch" TO athyperadmin;

GRANT SELECT ON TABLE "document"."time_punch" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."time_punch" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."time_punch" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."time_punch" TO athyperadmin;

GRANT SELECT ON TABLE "document"."time_punch" TO athyperapp;

GRANT DELETE ON TABLE "document"."user_profile_update_request" TO athyperadmin;

GRANT INSERT ON TABLE "document"."user_profile_update_request" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."user_profile_update_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."user_profile_update_request" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."user_profile_update_request" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."user_profile_update_request" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."user_profile_update_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."user_profile_update_request" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_ap_invoice_summary" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_ap_invoice_summary" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_ap_invoice_summary" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_ap_invoice_summary" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_ap_invoice_summary" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_ap_invoice_summary" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_ap_invoice_summary" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_ap_invoice_summary" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_ap_settlement_graph" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_ap_settlement_graph" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_ap_settlement_graph" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_ap_settlement_graph" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_ap_settlement_graph" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_ap_settlement_graph" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_ap_settlement_graph" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_ap_settlement_graph" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_ap_settlement_summary" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_ap_settlement_summary" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_ap_settlement_summary" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_ap_settlement_summary" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_ap_settlement_summary" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_ap_settlement_summary" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_ap_settlement_summary" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_ap_settlement_summary" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_commitment_line_pricing_summary" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_current_accounting_distribution" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_current_accounting_distribution" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_current_accounting_distribution" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_current_accounting_distribution" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_current_accounting_distribution" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_current_accounting_distribution" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_current_accounting_distribution" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_current_accounting_distribution" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_current_pricing_component" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_current_pricing_component" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_current_pricing_component" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_current_pricing_component" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_current_pricing_component" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_current_pricing_component" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_current_pricing_component" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_current_pricing_component" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_current_schedule_line" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_current_schedule_line" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_current_schedule_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_current_schedule_line" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_current_schedule_line" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_current_schedule_line" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_current_schedule_line" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_current_schedule_line" TO athyperapp;

GRANT DELETE ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperadmin;

GRANT INSERT ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "document"."v_invoice_retention_release_schedule" TO athyperapp;

GRANT DELETE ON TABLE "document"."wht_certificate" TO athyperadmin;

GRANT INSERT ON TABLE "document"."wht_certificate" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."wht_certificate" TO athyperadmin;

GRANT SELECT ON TABLE "document"."wht_certificate" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."wht_certificate" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."wht_certificate" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."wht_certificate" TO athyperadmin;

GRANT SELECT ON TABLE "document"."wht_certificate" TO athyperapp;

GRANT DELETE ON TABLE "document"."workflow_request" TO athyperadmin;

GRANT INSERT ON TABLE "document"."workflow_request" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."workflow_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."workflow_request" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."workflow_request" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."workflow_request" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."workflow_request" TO athyperadmin;

GRANT SELECT ON TABLE "document"."workflow_request" TO athyperapp;

GRANT DELETE ON TABLE "document"."workflow_stage" TO athyperadmin;

GRANT INSERT ON TABLE "document"."workflow_stage" TO athyperadmin;

GRANT REFERENCES ON TABLE "document"."workflow_stage" TO athyperadmin;

GRANT SELECT ON TABLE "document"."workflow_stage" TO athyperadmin;

GRANT TRIGGER ON TABLE "document"."workflow_stage" TO athyperadmin;

GRANT TRUNCATE ON TABLE "document"."workflow_stage" TO athyperadmin;

GRANT UPDATE ON TABLE "document"."workflow_stage" TO athyperadmin;

GRANT SELECT ON TABLE "document"."workflow_stage" TO athyperapp;
