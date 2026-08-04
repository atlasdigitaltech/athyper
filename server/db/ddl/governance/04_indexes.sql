-- ============================================================================
-- governance/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX bps_company_book_idx ON governance.book_period_status USING btree (tenant_id, company_code_id, book_id);

CREATE INDEX bps_open_pidx ON governance.book_period_status USING btree (tenant_id, company_code_id, book_id) WHERE status = ANY (ARRAY['open'::text, 'soft_close'::text]);

CREATE INDEX gmod_flag_count_pidx ON governance.comment_moderation USING btree (tenant_id, flag_count DESC, last_flagged_at DESC) WHERE flag_count >= 3 AND is_hidden = false;

CREATE INDEX gmod_hidden_pidx ON governance.comment_moderation USING btree (tenant_id, context_type, comment_id) WHERE is_hidden = true;

CREATE INDEX cdev_active_pidx ON governance.cycle_deviation USING btree (status) WHERE status::text = ANY (ARRAY['OPEN'::character varying, 'PENDING_APPROVAL'::character varying, 'APPROVED'::character varying, 'APPLIED'::character varying]::text[]);

CREATE INDEX cdev_lineage_pidx ON governance.cycle_deviation USING btree (carried_from_id) WHERE carried_from_id IS NOT NULL;

CREATE INDEX cdev_run_type_idx ON governance.cycle_deviation USING btree (cycle_run_id, deviation_type);

CREATE INDEX cdev_task_pidx ON governance.cycle_deviation USING btree (task_id) WHERE task_id IS NOT NULL;

CREATE INDEX cdev_tmpl_pidx ON governance.cycle_deviation USING btree (task_template_id) WHERE task_template_id IS NOT NULL;

CREATE INDEX crun_domain_data_gin ON governance.cycle_run USING gin (domain_data);

CREATE INDEX crun_period_idx ON governance.cycle_run USING btree (tenant_id, cycle_type_id, fiscal_year, period_number);

CREATE INDEX crun_status_idx ON governance.cycle_run USING btree (tenant_id, entity_code, status);

CREATE INDEX ctsk_phase_idx ON governance.cycle_task USING btree (cycle_run_id, phase_id);

CREATE INDEX ctsk_run_status_idx ON governance.cycle_task USING btree (cycle_run_id, status);

CREATE INDEX ctpl_type_active_idx ON governance.cycle_task_template USING btree (cycle_type_id, is_active);

CREATE INDEX ctyp_tenant_active_idx ON governance.cycle_type USING btree (tenant_id, is_active);

CREATE INDEX lh_tenant_status_idx ON governance.legal_hold USING btree (tenant_id, status) WHERE status = 'active'::text;

CREATE INDEX lhm_hold_idx ON governance.legal_hold_manifest USING btree (tenant_id, legal_hold_id);

CREATE INDEX lhm_partition_idx ON governance.legal_hold_manifest USING btree (partition_schema, partition_table, is_released);
