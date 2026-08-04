CREATE INDEX asset_transaction_asset_book_idx ON document.asset_transaction(tenant_id,asset_id,asset_book_id);
CREATE INDEX asset_transaction_company_period_idx ON document.asset_transaction(tenant_id,company_code_id,fiscal_year,period_number);
CREATE INDEX asset_transaction_journal_idx ON document.asset_transaction(tenant_id,reference_je_id) WHERE reference_je_id IS NOT NULL;
CREATE INDEX asset_transaction_run_idx ON document.asset_transaction(tenant_id,depreciation_run_id) WHERE depreciation_run_id IS NOT NULL;
CREATE INDEX asset_transaction_type_idx ON document.asset_transaction(tenant_id,company_code_id,txn_type);

CREATE UNIQUE INDEX fx_revaluation_run_idempotency_uq ON document.fx_revaluation_run(tenant_id,company_code_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX fx_revaluation_run_period_idx ON document.fx_revaluation_run(tenant_id,company_code_id,fiscal_year,period_number);
CREATE INDEX fx_revaluation_run_status_idx ON document.fx_revaluation_run(tenant_id,status,revaluation_date DESC);

CREATE INDEX intercompany_agreement_pair_idx ON document.intercompany_agreement(tenant_id,source_company_code_id,dest_company_code_id,agreement_type) WHERE status='active';
CREATE INDEX intercompany_agreement_supersedes_idx ON document.intercompany_agreement(tenant_id,supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX intercompany_transaction_pair_period_idx ON document.intercompany_transaction(tenant_id,source_company_code_id,dest_company_code_id,fiscal_year,period_number);
CREATE INDEX intercompany_transaction_agreement_idx ON document.intercompany_transaction(tenant_id,agreement_id) WHERE agreement_id IS NOT NULL;
CREATE INDEX intercompany_transaction_match_idx ON document.intercompany_transaction(tenant_id,match_status) WHERE match_status IN ('UNMATCHED','DISPUTED');
CREATE INDEX intercompany_transaction_netting_idx ON document.intercompany_transaction(tenant_id,netting_batch_id) WHERE netting_batch_id IS NOT NULL;

CREATE INDEX ic_elimination_pair_period_idx ON document.ic_elimination(tenant_id,source_company_code_id,counterparty_company_code_id,fiscal_year,period_number);
CREATE INDEX ic_elimination_group_idx ON document.ic_elimination(tenant_id,consolidation_group,fiscal_year,period_number);
CREATE INDEX ic_elimination_approval_idx ON document.ic_elimination(tenant_id,approval_route,status) WHERE status='calculated' AND approval_route IN ('ENHANCED','MANUAL');

CREATE INDEX match_exception_case_idx ON document.match_exception(tenant_id,invoice_match_case_id);
CREATE INDEX match_exception_open_line_idx ON document.match_exception(tenant_id,invoice_line_id) WHERE status='open';
CREATE INDEX match_exception_workflow_idx ON document.match_exception(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;

CREATE UNIQUE INDEX netting_batch_idempotency_uq ON document.netting_batch(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX netting_batch_pair_period_idx ON document.netting_batch(tenant_id,company_code_a_id,company_code_b_id,fiscal_year,period_number);
CREATE INDEX netting_batch_status_idx ON document.netting_batch(tenant_id,status,batch_date DESC);

CREATE UNIQUE INDEX obligation_horizon_scope_uq ON document.obligation_horizon(tenant_id,commitment_id,coalesce(schedule_id,'00000000-0000-0000-0000-000000000000'::uuid),fiscal_year);
CREATE INDEX obligation_horizon_company_year_idx ON document.obligation_horizon(tenant_id,company_code_id,fiscal_year);
CREATE INDEX obligation_horizon_active_tier_idx ON document.obligation_horizon(tenant_id,fiscal_year,obligation_tier) WHERE is_active;

CREATE INDEX payment_remittance_output_payment_idx ON document.payment_remittance_output(tenant_id,payment_entry_id);
CREATE INDEX payment_remittance_output_delivery_idx ON document.payment_remittance_output(tenant_id,delivery_status) WHERE delivery_status IN ('pending','failed','bounced');
CREATE INDEX payment_remittance_output_render_idx ON document.payment_remittance_output(tenant_id,render_output_id) WHERE render_output_id IS NOT NULL;

CREATE UNIQUE INDEX payment_term_discount_result_application_uq ON document.payment_term_discount_result(tenant_id,payment_id,invoice_id,coalesce(qualified_tier_no,0)) WHERE NOT is_reversal;
CREATE INDEX payment_term_discount_result_invoice_idx ON document.payment_term_discount_result(tenant_id,invoice_id,created_at DESC);
CREATE INDEX payment_term_discount_result_reverses_idx ON document.payment_term_discount_result(tenant_id,reverses_id) WHERE reverses_id IS NOT NULL;

CREATE INDEX wht_certificate_active_period_idx ON document.wht_certificate(tenant_id,company_code_id,period_from,period_to) WHERE status<>'voided';
CREATE INDEX wht_certificate_counterparty_idx ON document.wht_certificate(tenant_id,company_code_id,counterparty_id);
CREATE INDEX wht_certificate_source_gin ON document.wht_certificate USING gin(source_transaction_ids);

CREATE INDEX import_request_submitter_idx ON document.import_request(tenant_id,submitted_by,created_at DESC);
CREATE INDEX import_request_status_idx ON document.import_request(tenant_id,status,created_at DESC);
CREATE INDEX import_request_entity_idx ON document.import_request(tenant_id,entity_name,created_at DESC);
CREATE INDEX import_request_chunk_claim_idx ON document.import_request_chunk(tenant_id,status,created_at)
    WHERE status IN ('pending','queued','failed');
CREATE INDEX import_request_chunk_request_idx ON document.import_request_chunk(tenant_id,import_request_id,chunk_index);
CREATE INDEX import_request_chunk_job_idx ON document.import_request_chunk(job_id) WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX render_output_active_dedup_uq ON document.render_output(tenant_id,entity_name,entity_id,operation,variant,locale,input_payload_hash)
    WHERE status IN ('QUEUED','RENDERING') AND input_payload_hash IS NOT NULL;
CREATE INDEX render_output_queue_idx ON document.render_output(tenant_id,status,created_at) WHERE status IN ('QUEUED','RENDERING');
CREATE INDEX render_output_entity_idx ON document.render_output(tenant_id,entity_name,entity_id,created_at DESC);
CREATE INDEX render_output_retry_idx ON document.render_output(tenant_id,last_attempt_at)
    WHERE status IN ('QUEUED','RENDERING','FAILED');
CREATE INDEX render_output_failure_idx ON document.render_output(tenant_id,failure_category,last_attempt_at DESC)
    WHERE status='FAILED';
CREATE INDEX render_output_trace_idx ON document.render_output(trace_id) WHERE trace_id IS NOT NULL;

CREATE UNIQUE INDEX user_profile_update_request_one_active_uq ON document.user_profile_update_request(tenant_id,principal_id) WHERE is_active;
CREATE INDEX user_profile_update_request_status_idx ON document.user_profile_update_request(tenant_id,status,created_at DESC);
CREATE INDEX user_profile_update_request_workflow_idx ON document.user_profile_update_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX user_profile_update_request_scope_gin ON document.user_profile_update_request USING gin(request_scope);
