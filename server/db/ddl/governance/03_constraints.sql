-- ============================================================================
-- governance/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "book_period_status_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."comment_moderation"
  ADD CONSTRAINT "gmod_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_cross_dependency"
  ADD CONSTRAINT "cxdep_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_task_category"
  ADD CONSTRAINT "ctcat_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "ctdep_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."legal_hold_manifest"
  ADD CONSTRAINT "lhm_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "preserved_identity_migration_receipt_v2_pkey" PRIMARY KEY (manifest_id);

ALTER TABLE ONLY "governance"."report_pack"
  ADD CONSTRAINT "rp_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "book_period_status_composite_uq" UNIQUE (tenant_id, company_code_id, book_id, fiscal_year, period_number);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "book_period_status_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "governance"."comment_moderation"
  ADD CONSTRAINT "gmod_unique" UNIQUE (tenant_id, context_type, comment_id);

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_rule_uq" UNIQUE (tenant_id, cycle_type_id, deviation_type);

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_natural_uq" UNIQUE (tenant_id, cycle_run_id, cert_code, cert_version);

ALTER TABLE ONLY "governance"."cycle_cross_dependency"
  ADD CONSTRAINT "cxdep_edge_uq" UNIQUE (tenant_id, predecessor_type_id, predecessor_phase_id, successor_type_id, successor_phase_id);

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_code_uq" UNIQUE (tenant_id, cycle_type_id, phase_code);

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_order_uq" UNIQUE (tenant_id, cycle_type_id, sort_order);

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_tenant_type_id_uq" UNIQUE (tenant_id, cycle_type_id, id);

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_natural_uq" UNIQUE (tenant_id, entity_code, cycle_type_id, fiscal_year, period_number, run_number);

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_natural_uq" UNIQUE (tenant_id, cycle_run_id, task_code);

ALTER TABLE ONLY "governance"."cycle_task_category"
  ADD CONSTRAINT "ctcat_code_uq" UNIQUE (tenant_id, cycle_type_id, category_code);

ALTER TABLE ONLY "governance"."cycle_task_category"
  ADD CONSTRAINT "ctcat_tenant_type_id_uq" UNIQUE (tenant_id, cycle_type_id, id);

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "ctdep_edge_uq" UNIQUE (tenant_id, cycle_type_id, entity_code, predecessor_template_id, successor_template_id);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_code_uq" UNIQUE (tenant_id, entity_code, cycle_type_id, task_code);

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_code_uq" UNIQUE (tenant_id, type_code);

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_code_uq" UNIQUE (tenant_id, hold_code);

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "governance"."legal_hold_manifest"
  ADD CONSTRAINT "lhm_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "governance"."legal_hold_manifest"
  ADD CONSTRAINT "lhm_unique" UNIQUE (tenant_id, legal_hold_id, partition_schema, partition_table);

ALTER TABLE ONLY "governance"."report_pack"
  ADD CONSTRAINT "rp_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "bps_period_range_chk" CHECK (period_number >= 0 AND period_number <= 16);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "bps_reopen_count_chk" CHECK (reopen_count >= 0);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "bps_status_chk" CHECK (status = ANY (ARRAY['future'::text, 'open'::text, 'soft_close'::text, 'hard_close'::text]));

ALTER TABLE ONLY "governance"."comment_moderation"
  ADD CONSTRAINT "gmod_count_chk" CHECK (flag_count >= 0);

ALTER TABLE ONLY "governance"."comment_moderation"
  ADD CONSTRAINT "gmod_hidden_chk" CHECK (is_hidden = false AND hidden_at IS NULL AND hidden_by IS NULL OR is_hidden = true AND hidden_at IS NOT NULL AND hidden_by IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_action_chk" CHECK (action::text = ANY (ARRAY['FORCE_CLOSE'::character varying, 'AUTO_CARRY'::character varying, 'EXPIRE'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_dev_type_chk" CHECK (deviation_type::text = ANY (ARRAY['EXCEPTION'::character varying, 'OVERRIDE'::character varying, 'WAIVER'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_max_count_chk" CHECK (max_carry_count IS NULL OR max_carry_count > 0);

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_status_chk" CHECK (status::text = ANY (ARRAY['DRAFT'::character varying, 'PENDING_REVIEW'::character varying, 'CERTIFIED'::character varying, 'ATTESTED'::character varying, 'SUPERSEDED'::character varying, 'REVOKED'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_type_chk" CHECK (cert_type::text = ANY (ARRAY['STANDARD'::character varying, 'WITH_EXCEPTIONS'::character varying, 'QUALIFIED'::character varying, 'INTERIM'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_cross_dependency"
  ADD CONSTRAINT "cxdep_no_self_chk" CHECK (predecessor_type_id <> successor_type_id OR predecessor_phase_id <> successor_phase_id);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_cat_ref_chk" CHECK (scope::text <> 'CATEGORY'::text OR task_category IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_decision_chk" CHECK ((status::text <> ALL (ARRAY['APPROVED'::character varying, 'REJECTED'::character varying]::text[])) OR decision_notes IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_gate_scope_chk" CHECK (scope::text <> 'GATE'::text OR applies_to_phase_id IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_impact_type_chk" CHECK (impact_type::text = ANY (ARRAY['TASK_BLOCKER'::character varying, 'GATE_BLOCKER'::character varying, 'DATA_QUALITY'::character varying, 'PROCESS'::character varying, 'EXTERNAL'::character varying, 'IMMATERIAL'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_resolution_chk" CHECK ((status::text <> ALL (ARRAY['RESOLVED'::character varying, 'ACCEPTED'::character varying]::text[])) OR resolution_notes IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_scope_chk" CHECK (scope::text = ANY (ARRAY['TASK'::character varying, 'CATEGORY'::character varying, 'GATE'::character varying, 'PERIOD'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_severity_chk" CHECK (severity::text = ANY (ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_status_chk" CHECK (status::text = ANY (ARRAY['OPEN'::character varying, 'PENDING_APPROVAL'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'APPLIED'::character varying, 'RESOLVED'::character varying, 'ACCEPTED'::character varying, 'DEFERRED'::character varying, 'EXPIRED'::character varying, 'REVOKED'::character varying, 'CARRIED_FORWARD'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_task_scope_chk" CHECK (scope::text <> 'TASK'::text OR task_id IS NOT NULL OR task_template_id IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_type_chk" CHECK (deviation_type::text = ANY (ARRAY['EXCEPTION'::character varying, 'OVERRIDE'::character varying, 'WAIVER'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_dates_chk" CHECK (cycle_start_date <= cycle_target_date);

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_status_chk" CHECK (status::text = ANY (ARRAY['PLANNED'::character varying, 'OPEN'::character varying, 'IN_PROGRESS'::character varying, 'PHASE_GATE'::character varying, 'COMPLETED'::character varying, 'CERTIFIED'::character varying, 'CLOSED'::character varying, 'REOPENED'::character varying, 'CANCELLED'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_completion_chk" CHECK (status::text <> 'COMPLETED'::text OR completed_by IS NOT NULL AND completed_at IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_completion_cln_chk" CHECK (status::text = 'COMPLETED'::text OR completed_by IS NULL);

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_failure_chk" CHECK (status::text <> 'FAILED'::text OR failure_reason IS NOT NULL AND failed_at IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_failure_cln_chk" CHECK (status::text = 'FAILED'::text OR failure_reason IS NULL);

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_status_chk" CHECK (status::text = ANY (ARRAY['PENDING'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'BLOCKED'::character varying, 'FAILED'::character varying, 'DEVIATED'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "ctdep_dep_type_chk" CHECK (dependency_type::text = ANY (ARRAY['FINISH_TO_START'::character varying, 'FINISH_TO_FINISH'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "ctdep_no_self_chk" CHECK (predecessor_template_id <> successor_template_id);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_completion_mode_chk" CHECK (completion_mode::text = ANY (ARRAY['MANUAL'::character varying, 'SYSTEM'::character varying, 'HYBRID'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_dur_positive_chk" CHECK (estimated_duration_min IS NULL OR estimated_duration_min > 0);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_severity_chk" CHECK (severity IS NULL OR (severity::text = ANY (ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying]::text[])));

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_sla_positive_chk" CHECK (sla_hours IS NULL OR sla_hours > 0);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_system_handler_chk" CHECK (completion_mode::text = 'MANUAL'::text OR system_check_handler IS NOT NULL);

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_domain_chk" CHECK (domain::text = ANY (ARRAY['FINANCE'::character varying, 'HR'::character varying, 'INVENTORY'::character varying, 'WAREHOUSE'::character varying, 'PROCUREMENT'::character varying, 'PROJECT'::character varying, 'SUPPLIER'::character varying, 'SAFETY'::character varying, 'COMPLIANCE'::character varying, 'CUSTOM'::character varying]::text[]));

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_frequency_chk" CHECK (frequency::text = ANY (ARRAY['DAILY'::character varying, 'WEEKLY'::character varying, 'BIWEEKLY'::character varying, 'SEMI_MONTHLY'::character varying, 'MONTHLY'::character varying, 'QUARTERLY'::character varying, 'SEMI_ANNUAL'::character varying, 'ANNUAL'::character varying, 'AD_HOC'::character varying]::text[]));

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_date_range_chk" CHECK (scope_date_from IS NULL OR scope_date_to IS NULL OR scope_date_from <= scope_date_to);

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_effectivity_chk" CHECK (effective_to IS NULL OR effective_from <= effective_to);

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_release_chk" CHECK (status <> 'released'::text OR release_date IS NOT NULL AND released_by IS NOT NULL AND release_reason IS NOT NULL);

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_scope_chk" CHECK (scope_entity_type IS NOT NULL OR scope_date_from IS NOT NULL OR scope_log_schemas IS NOT NULL);

ALTER TABLE ONLY "governance"."legal_hold"
  ADD CONSTRAINT "lh_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'released'::text, 'expired'::text]));

ALTER TABLE ONLY "governance"."legal_hold_manifest"
  ADD CONSTRAINT "lhm_range_chk" CHECK (partition_range_lo < partition_range_hi);

ALTER TABLE ONLY "governance"."legal_hold_manifest"
  ADD CONSTRAINT "lhm_release_chk" CHECK (is_released = false AND released_at IS NULL OR is_released = true AND released_at IS NOT NULL);

ALTER TABLE ONLY "governance"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "preserved_identity_migration_receipt_v2_count_chk" CHECK (identity_count > 0 AND inserted_count >= 0 AND exact_match_count >= 0 AND (inserted_count + exact_match_count) = identity_count);

ALTER TABLE ONLY "governance"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "preserved_identity_migration_receipt_v2_hash_chk" CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'::text AND manifest_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "governance"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "preserved_identity_migration_receipt_v2_plane_chk" CHECK (plane_code = 'neon'::text);

ALTER TABLE ONLY "governance"."preserved_identity_migration_receipt_v2"
  ADD CONSTRAINT "preserved_identity_migration_receipt_v2_ticket_chk" CHECK (btrim(approval_ticket) <> ''::text);

ALTER TABLE ONLY "governance"."report_pack"
  ADD CONSTRAINT "rp_format_chk" CHECK (format = ANY (ARRAY['html'::text, 'pdf'::text, 'xlsx'::text]));

ALTER TABLE ONLY "governance"."report_pack"
  ADD CONSTRAINT "rp_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'generating'::text, 'ready'::text, 'failed'::text]));

ALTER TABLE ONLY "governance"."report_pack"
  ADD CONSTRAINT "rp_storage_chk" CHECK ((status = ANY (ARRAY['pending'::text, 'generating'::text, 'failed'::text])) OR storage_key IS NOT NULL);

ALTER TABLE ONLY "governance"."report_pack"
  ADD CONSTRAINT "rp_type_chk" CHECK (report_type = ANY (ARRAY['cycle_summary'::text, 'deviation_summary'::text, 'certification_summary'::text, 'task_status'::text, 'compliance_dashboard'::text]));

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "bps_book_fk" FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book(tenant_id, id);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "bps_company_fk" FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "bps_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id);

ALTER TABLE ONLY "governance"."book_period_status"
  ADD CONSTRAINT "bps_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."comment_moderation"
  ADD CONSTRAINT "gmod_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."comment_moderation"
  ADD CONSTRAINT "gmod_hidden_by_fk" FOREIGN KEY (hidden_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."comment_moderation"
  ADD CONSTRAINT "gmod_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_carryforward_rule"
  ADD CONSTRAINT "ccfr_type_fk" FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES governance.cycle_type(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_attested_by_fk" FOREIGN KEY (attested_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_certified_by_fk" FOREIGN KEY (certified_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_run_fk" FOREIGN KEY (tenant_id, cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "ccert_workflow_request_fk" FOREIGN KEY (workflow_request_id) REFERENCES document.workflow_request(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_certification"
  ADD CONSTRAINT "cycle_certification_superseded_by_id_fkey" FOREIGN KEY (superseded_by_id) REFERENCES governance.cycle_certification(id);

ALTER TABLE ONLY "governance"."cycle_cross_dependency"
  ADD CONSTRAINT "cxdep_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_cross_dependency"
  ADD CONSTRAINT "cxdep_pred_phase_fk" FOREIGN KEY (tenant_id, predecessor_type_id, predecessor_phase_id) REFERENCES governance.cycle_phase(tenant_id, cycle_type_id, id);

ALTER TABLE ONLY "governance"."cycle_cross_dependency"
  ADD CONSTRAINT "cxdep_succ_phase_fk" FOREIGN KEY (tenant_id, successor_type_id, successor_phase_id) REFERENCES governance.cycle_phase(tenant_id, cycle_type_id, id);

ALTER TABLE ONLY "governance"."cycle_cross_dependency"
  ADD CONSTRAINT "cxdep_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_assigned_to_fk" FOREIGN KEY (assigned_to) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_requested_by_fk" FOREIGN KEY (requested_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_resolved_by_fk" FOREIGN KEY (resolved_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_run_fk" FOREIGN KEY (tenant_id, cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cdev_workflow_request_fk" FOREIGN KEY (workflow_request_id) REFERENCES document.workflow_request(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cycle_deviation_applies_to_phase_id_fkey" FOREIGN KEY (applies_to_phase_id) REFERENCES governance.cycle_phase(id);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cycle_deviation_carried_from_id_fkey" FOREIGN KEY (carried_from_id) REFERENCES governance.cycle_deviation(id);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cycle_deviation_task_id_fkey" FOREIGN KEY (task_id) REFERENCES governance.cycle_task(id);

ALTER TABLE ONLY "governance"."cycle_deviation"
  ADD CONSTRAINT "cycle_deviation_task_template_id_fkey" FOREIGN KEY (task_template_id) REFERENCES governance.cycle_task_template(id);

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_type_fk" FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES governance.cycle_type(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_phase"
  ADD CONSTRAINT "cph_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_cancelled_by_fk" FOREIGN KEY (cancelled_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_certified_by_fk" FOREIGN KEY (certified_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_completed_by_fk" FOREIGN KEY (completed_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_phase_fk" FOREIGN KEY (tenant_id, cycle_type_id, current_phase_id) REFERENCES governance.cycle_phase(tenant_id, cycle_type_id, id);

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_started_by_fk" FOREIGN KEY (started_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_type_fk" FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES governance.cycle_type(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_run"
  ADD CONSTRAINT "crun_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_assigned_to_fk" FOREIGN KEY (assigned_to) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_completed_by_fk" FOREIGN KEY (completed_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_run_fk" FOREIGN KEY (tenant_id, cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "ctsk_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_task"
  ADD CONSTRAINT "cycle_task_template_id_fkey" FOREIGN KEY (template_id) REFERENCES governance.cycle_task_template(id);

ALTER TABLE ONLY "governance"."cycle_task_category"
  ADD CONSTRAINT "ctcat_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_task_category"
  ADD CONSTRAINT "ctcat_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_task_category"
  ADD CONSTRAINT "ctcat_type_fk" FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES governance.cycle_type(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "ctdep_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "ctdep_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "ctdep_type_fk" FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES governance.cycle_type(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "cycle_task_dependency_predecessor_template_id_fkey" FOREIGN KEY (predecessor_template_id) REFERENCES governance.cycle_task_template(id);

ALTER TABLE ONLY "governance"."cycle_task_dependency"
  ADD CONSTRAINT "cycle_task_dependency_successor_template_id_fkey" FOREIGN KEY (successor_template_id) REFERENCES governance.cycle_task_template(id);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_category_fk" FOREIGN KEY (tenant_id, cycle_type_id, category_id) REFERENCES governance.cycle_task_category(tenant_id, cycle_type_id, id);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_default_owner_fk" FOREIGN KEY (default_owner_user_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_phase_fk" FOREIGN KEY (tenant_id, cycle_type_id, phase_id) REFERENCES governance.cycle_phase(tenant_id, cycle_type_id, id);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_type_fk" FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES governance.cycle_type(tenant_id, id);

ALTER TABLE ONLY "governance"."cycle_task_template"
  ADD CONSTRAINT "ctpl_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "governance"."cycle_type"
  ADD CONSTRAINT "ctyp_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "governance"."legal_hold_manifest"
  ADD CONSTRAINT "lhm_hold_fk" FOREIGN KEY (tenant_id, legal_hold_id) REFERENCES governance.legal_hold(tenant_id, id) ON DELETE CASCADE;
