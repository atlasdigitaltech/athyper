-- ============================================================================
-- log/03_constraints.sql
-- Concept: Audit FKs — log → core tables FK graph
-- Depends on: 04_tables/006_log.sql
-- ============================================================================
-- FK constraints for all 26 consolidated log tables.
-- All wrapped in DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ON DELETE RESTRICT  — audit accountability FKs (principal, actor on audit records)
-- ON DELETE SET NULL  — optional context FKs (OU, optional actor references)
-- ON DELETE CASCADE   — tenant FK (tenant deleted — all its log rows gone)
-- Partitioned tables: FKs defined on parent, propagate to all child partitions.


-- —— §1  audit_log ———————————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.audit_log ADD CONSTRAINT audit_log_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.audit_log ADD CONSTRAINT audit_log_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.audit_log ADD CONSTRAINT audit_log_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- reason_code → master.change_reason_code. SET NULL so deleting a custom tenant
-- reason doesn't cascade-corrupt historical audit rows (the row still tells
-- you "someone overrode an account here", just without the controlled label).
DO $$ BEGIN ALTER TABLE log.audit_log ADD CONSTRAINT audit_log_reason_code_fk
    FOREIGN KEY (reason_code) REFERENCES master.change_reason_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §2  security_event_log ——————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.security_event_log ADD CONSTRAINT sel_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.security_event_log ADD CONSTRAINT sel_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §3  permission_decision_log —————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_permission_fk
    FOREIGN KEY (permission_id) REFERENCES shared.permission (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_feature_fk
    FOREIGN KEY (feature_id) REFERENCES shared.enterprise_feature (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_grant_fk
    FOREIGN KEY (matched_grant_id) REFERENCES master.access_grant (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_role_fk
    FOREIGN KEY (matched_role_id) REFERENCES shared.role (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_group_fk
    FOREIGN KEY (matched_group_id) REFERENCES master.auth_group (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.permission_decision_log ADD CONSTRAINT pdl_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §4  field_access_log ————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.field_access_log ADD CONSTRAINT fal_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.field_access_log ADD CONSTRAINT fal_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.field_access_log ADD CONSTRAINT fal_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §5  password_history —————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.password_history ADD CONSTRAINT ph_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.password_history ADD CONSTRAINT ph_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.password_history ADD CONSTRAINT ph_changed_by_fk
    FOREIGN KEY (changed_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §6  attachment_access_log ————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.attachment_access_log ADD CONSTRAINT aal_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.attachment_access_log ADD CONSTRAINT aal_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.attachment_access_log ADD CONSTRAINT aal_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §7  share_audit_log —————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.share_audit_log ADD CONSTRAINT sal_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.share_audit_log ADD CONSTRAINT sal_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.share_audit_log ADD CONSTRAINT sal_target_principal_fk
    FOREIGN KEY (target_principal_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.share_audit_log ADD CONSTRAINT sal_target_group_fk
    FOREIGN KEY (target_group_id) REFERENCES master.auth_group (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.share_audit_log ADD CONSTRAINT sal_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.share_audit_log ADD CONSTRAINT sal_grant_fk
    FOREIGN KEY (access_grant_id) REFERENCES master.access_grant (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §8  entity_lifecycle_log ————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.entity_lifecycle_log ADD CONSTRAINT ell_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.entity_lifecycle_log ADD CONSTRAINT ell_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.entity_lifecycle_log ADD CONSTRAINT ell_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §9  workflow_event_log ——————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.workflow_event_log ADD CONSTRAINT wel_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.workflow_event_log ADD CONSTRAINT wel_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §10  close_override_log —————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.close_override_log ADD CONSTRAINT col_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.close_override_log ADD CONSTRAINT col_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.close_override_log ADD CONSTRAINT col_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §11  job_log ————————————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.job_log ADD CONSTRAINT jl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §12  policy_evaluation_log ——————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.policy_evaluation_log ADD CONSTRAINT pel_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.policy_evaluation_log ADD CONSTRAINT pel_module_fk
    FOREIGN KEY (module_id) REFERENCES shared.module (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §13  hash_anchor ————————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.hash_anchor ADD CONSTRAINT ha_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §14  dimension_resolution_log ———————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.dimension_resolution_log ADD CONSTRAINT drl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §15  activity_log ———————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.activity_log ADD CONSTRAINT al_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.activity_log ADD CONSTRAINT al_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.activity_log ADD CONSTRAINT al_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §16  close_activity_log —————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.close_activity_log ADD CONSTRAINT cal_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.close_activity_log ADD CONSTRAINT cal_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.close_activity_log ADD CONSTRAINT cal_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- close_period_id FK intentionally omitted — added in Phase 4 once ledger.close_period exists.
-- DO $$ BEGIN ALTER TABLE log.close_activity_log ADD CONSTRAINT cal_close_period_fk
--     FOREIGN KEY (close_period_id) REFERENCES ledger.close_period (id) ON DELETE SET NULL;
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §17  export_log —————————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.export_log ADD CONSTRAINT el_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.export_log ADD CONSTRAINT el_actor_fk
    FOREIGN KEY (actor_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.export_log ADD CONSTRAINT el_cc_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §18  comment_retention_log ——————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.comment_retention_log ADD CONSTRAINT crl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.comment_retention_log ADD CONSTRAINT crl_executor_fk
    FOREIGN KEY (executed_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §19  search_history —————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.search_history ADD CONSTRAINT sh_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.search_history ADD CONSTRAINT sh_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §20  ai_inference_log ———————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.ai_inference_log ADD CONSTRAINT ail_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.ai_inference_log ADD CONSTRAINT ail_reversed_by_fk
    FOREIGN KEY (reversed_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.ai_inference_log ADD CONSTRAINT ail_accepted_by_fk
    FOREIGN KEY (accepted_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Atlas agent request and call ledgers.
ALTER TABLE log.ai_agent_run
    ADD COLUMN IF NOT EXISTS provider_account_class text;
ALTER TABLE log.ai_agent_call
    ADD COLUMN IF NOT EXISTS provider_account_class text;

ALTER TABLE log.ai_agent_run
    DROP CONSTRAINT IF EXISTS aar_provider_account_class_chk;
ALTER TABLE log.ai_agent_run
    ADD CONSTRAINT aar_provider_account_class_chk CHECK (
        provider_account_class IS NULL
        OR provider_account_class IN (
            'platform_unverified',
            'platform_paid',
            'developer_free',
            'tenant_paid',
            'tenant_byok',
            'local',
            'test'
        )
    );

ALTER TABLE log.ai_agent_call
    DROP CONSTRAINT IF EXISTS aac_provider_account_class_chk;
ALTER TABLE log.ai_agent_call
    ADD CONSTRAINT aac_provider_account_class_chk CHECK (
        provider_account_class IS NULL
        OR provider_account_class IN (
            'platform_unverified',
            'platform_paid',
            'developer_free',
            'tenant_paid',
            'tenant_byok',
            'local',
            'test'
        )
    );

ALTER TABLE log.ai_agent_run DROP CONSTRAINT IF EXISTS aar_tenant_fk;
ALTER TABLE log.ai_agent_run ADD CONSTRAINT aar_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;

ALTER TABLE log.ai_agent_run DROP CONSTRAINT IF EXISTS aar_principal_fk;
ALTER TABLE log.ai_agent_run ADD CONSTRAINT aar_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE log.ai_agent_call DROP CONSTRAINT IF EXISTS aac_tenant_fk;
ALTER TABLE log.ai_agent_call ADD CONSTRAINT aac_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;

DO $$ BEGIN ALTER TABLE log.ai_agent_call ADD CONSTRAINT aac_run_fk
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES log.ai_agent_run (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §21  ai_monitoring_log ——————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.ai_monitoring_log ADD CONSTRAINT aml_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §22  ai_feedback_log ————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.ai_feedback_log ADD CONSTRAINT afl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.ai_feedback_log ADD CONSTRAINT afl_submitted_by_fk
    FOREIGN KEY (submitted_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §23  ai_calibration_log —————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.ai_calibration_log ADD CONSTRAINT acl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.ai_calibration_log ADD CONSTRAINT acl_calibrated_by_fk
    FOREIGN KEY (calibrated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §24  ai_call_transcript —————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.ai_call_transcript ADD CONSTRAINT act_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.ai_call_transcript ADD CONSTRAINT act_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §25  kpi_execution_log ——————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.kpi_execution_log ADD CONSTRAINT kel_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §26  workspace_usage_metric —————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.workspace_usage_metric ADD CONSTRAINT wum_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.workspace_usage_metric ADD CONSTRAINT wum_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES shared.workspace (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §27  notification_delivery_attempt ——————————————————————————————————
DO $$ BEGIN ALTER TABLE log.notification_delivery_attempt ADD CONSTRAINT nda_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE log.notification_delivery_attempt ADD CONSTRAINT nda_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §28  log.render_dlq ———————————————————————————————————————————————————
-- Note: render_dlq_tenant_fk is defined in 06_constraints/009_snapshot.sql
DO $$ BEGIN ALTER TABLE log.render_dlq ADD CONSTRAINT render_dlq_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §CAL  log.cycle_audit_log ————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE log.cycle_audit_log ADD CONSTRAINT cal_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
