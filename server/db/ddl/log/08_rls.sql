-- ============================================================================
-- log/08_rls.sql
-- Concept: Audit RLS — log data isolation and admin access policies
-- Depends on: 04_tables/006_log.sql, 05_pre_constraint_functions/001_shared.sql
-- RLS for all 26 consolidated log tables.
--
-- Two policy groups:
--
--   STANDARD (25 tables) — business and system logs tenants are allowed to read:
--     tenant_read   FOR SELECT  — rows for calling tenant  (current_tenant_id_soft)
--     tenant_insert FOR INSERT  — calling tenant only      (current_tenant_id)
--     admin_read    FOR SELECT TO athyperadmin — cross-tenant
--     admin_write   FOR ALL    TO athyperadmin — full DML
--     NO UPDATE / DELETE for tenant role — append-only invariant enforced at policy level.
--
--   RESTRICTED (1 table) — password_history:
--     NO tenant_read policy — hash values NEVER exposed to tenant sessions.
--     tenant_insert allowed — auth middleware inserts in tenant context.
--     admin_read / admin_write — auth engine + compliance tooling only.
--
-- Pattern matches event.outbox RLS (11_rls_policies/007_event.sql).
-- current_tenant_id_soft() returns NULL when GUC unset — zero rows, never raises.
-- ============================================================================
-- current_tenant_id()      raises   when GUC unset — prevents anonymous inserts.


-- ============================================================================
-- Macro: ENABLE + FORCE RLS, then DROP all policies, then CREATE.
-- Keeps this file fully idempotent on re-runs.
-- ============================================================================


-- —— §1  audit_log ———————————————————————————————————————————————————————
ALTER TABLE log.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.audit_log;
DROP POLICY IF EXISTS tenant_insert ON log.audit_log;
DROP POLICY IF EXISTS admin_read    ON log.audit_log;
DROP POLICY IF EXISTS admin_write   ON log.audit_log;
CREATE POLICY tenant_read   ON log.audit_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.audit_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.audit_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.audit_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §2  security_event_log ——————————————————————————————————————————————
-- Tenants can read their own security events (user-facing security dashboard).
ALTER TABLE log.security_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.security_event_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.security_event_log;
DROP POLICY IF EXISTS tenant_insert ON log.security_event_log;
DROP POLICY IF EXISTS admin_read    ON log.security_event_log;
DROP POLICY IF EXISTS admin_write   ON log.security_event_log;
CREATE POLICY tenant_read   ON log.security_event_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.security_event_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.security_event_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.security_event_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §3  permission_decision_log —————————————————————————————————————————
-- Tenants read own decisions for access certification and self-service audit.
ALTER TABLE log.permission_decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.permission_decision_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.permission_decision_log;
DROP POLICY IF EXISTS tenant_insert ON log.permission_decision_log;
DROP POLICY IF EXISTS admin_read    ON log.permission_decision_log;
DROP POLICY IF EXISTS admin_write   ON log.permission_decision_log;
CREATE POLICY tenant_read   ON log.permission_decision_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.permission_decision_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.permission_decision_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.permission_decision_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §4  field_access_log ————————————————————————————————————————————————
-- Tenants read own field access rows (GDPR data access report, self-service).
ALTER TABLE log.field_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.field_access_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.field_access_log;
DROP POLICY IF EXISTS tenant_insert ON log.field_access_log;
DROP POLICY IF EXISTS admin_read    ON log.field_access_log;
DROP POLICY IF EXISTS admin_write   ON log.field_access_log;
CREATE POLICY tenant_read   ON log.field_access_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.field_access_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.field_access_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.field_access_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §5  password_history — RESTRICTED ———————————————————————————————————
-- NO tenant_read: hash values MUST NEVER be exposed to tenant sessions.
-- Auth engine (running as athyperadmin) reads hashes for reuse checks.
-- Tenant insert only — auth middleware fires in tenant context on password change.
ALTER TABLE log.password_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.password_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.password_history;   -- intentionally absent
DROP POLICY IF EXISTS tenant_insert ON log.password_history;
DROP POLICY IF EXISTS admin_read    ON log.password_history;
DROP POLICY IF EXISTS admin_write   ON log.password_history;
-- No tenant_read created — principals cannot select their own hash history.
CREATE POLICY tenant_insert ON log.password_history FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.password_history FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.password_history FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §6  attachment_access_log ————————————————————————————————————————————
ALTER TABLE log.attachment_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.attachment_access_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.attachment_access_log;
DROP POLICY IF EXISTS tenant_insert ON log.attachment_access_log;
DROP POLICY IF EXISTS admin_read    ON log.attachment_access_log;
DROP POLICY IF EXISTS admin_write   ON log.attachment_access_log;
CREATE POLICY tenant_read   ON log.attachment_access_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.attachment_access_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.attachment_access_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.attachment_access_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §7  share_audit_log —————————————————————————————————————————————————
ALTER TABLE log.share_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.share_audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.share_audit_log;
DROP POLICY IF EXISTS tenant_insert ON log.share_audit_log;
DROP POLICY IF EXISTS admin_read    ON log.share_audit_log;
DROP POLICY IF EXISTS admin_write   ON log.share_audit_log;
CREATE POLICY tenant_read   ON log.share_audit_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.share_audit_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.share_audit_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.share_audit_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §8  entity_lifecycle_log ————————————————————————————————————————————
ALTER TABLE log.entity_lifecycle_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.entity_lifecycle_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.entity_lifecycle_log;
DROP POLICY IF EXISTS tenant_insert ON log.entity_lifecycle_log;
DROP POLICY IF EXISTS admin_read    ON log.entity_lifecycle_log;
DROP POLICY IF EXISTS admin_write   ON log.entity_lifecycle_log;
CREATE POLICY tenant_read   ON log.entity_lifecycle_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.entity_lifecycle_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.entity_lifecycle_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.entity_lifecycle_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §9  workflow_event_log ——————————————————————————————————————————————
ALTER TABLE log.workflow_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.workflow_event_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.workflow_event_log;
DROP POLICY IF EXISTS tenant_insert ON log.workflow_event_log;
DROP POLICY IF EXISTS admin_read    ON log.workflow_event_log;
DROP POLICY IF EXISTS admin_write   ON log.workflow_event_log;
CREATE POLICY tenant_read   ON log.workflow_event_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.workflow_event_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.workflow_event_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.workflow_event_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §10  close_override_log —————————————————————————————————————————————
ALTER TABLE log.close_override_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.close_override_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.close_override_log;
DROP POLICY IF EXISTS tenant_insert ON log.close_override_log;
DROP POLICY IF EXISTS admin_read    ON log.close_override_log;
DROP POLICY IF EXISTS admin_write   ON log.close_override_log;
CREATE POLICY tenant_read   ON log.close_override_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.close_override_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.close_override_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.close_override_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §11  job_log ————————————————————————————————————————————————————————
-- System log — tenants can read their own job history (observability).
ALTER TABLE log.job_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.job_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.job_log;
DROP POLICY IF EXISTS tenant_insert ON log.job_log;
DROP POLICY IF EXISTS admin_read    ON log.job_log;
DROP POLICY IF EXISTS admin_write   ON log.job_log;
CREATE POLICY tenant_read   ON log.job_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.job_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.job_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.job_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §12  policy_evaluation_log ——————————————————————————————————————————
-- System log — tenants can inspect their own policy evaluations (transparency).
ALTER TABLE log.policy_evaluation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.policy_evaluation_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.policy_evaluation_log;
DROP POLICY IF EXISTS tenant_insert ON log.policy_evaluation_log;
DROP POLICY IF EXISTS admin_read    ON log.policy_evaluation_log;
DROP POLICY IF EXISTS admin_write   ON log.policy_evaluation_log;
CREATE POLICY tenant_read   ON log.policy_evaluation_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.policy_evaluation_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.policy_evaluation_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.policy_evaluation_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §13  hash_anchor ————————————————————————————————————————————————————
-- System log — tenants can read their own tamper-evidence anchors for verification.
ALTER TABLE log.hash_anchor ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.hash_anchor FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.hash_anchor;
DROP POLICY IF EXISTS tenant_insert ON log.hash_anchor;
DROP POLICY IF EXISTS admin_read    ON log.hash_anchor;
DROP POLICY IF EXISTS admin_write   ON log.hash_anchor;
CREATE POLICY tenant_read   ON log.hash_anchor FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.hash_anchor FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.hash_anchor FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.hash_anchor FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §14  dimension_resolution_log ———————————————————————————————————————
ALTER TABLE log.dimension_resolution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.dimension_resolution_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.dimension_resolution_log;
DROP POLICY IF EXISTS tenant_insert ON log.dimension_resolution_log;
DROP POLICY IF EXISTS admin_read    ON log.dimension_resolution_log;
DROP POLICY IF EXISTS admin_write   ON log.dimension_resolution_log;
CREATE POLICY tenant_read   ON log.dimension_resolution_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.dimension_resolution_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.dimension_resolution_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.dimension_resolution_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §15  activity_log ———————————————————————————————————————————————————
ALTER TABLE log.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.activity_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.activity_log;
DROP POLICY IF EXISTS tenant_insert ON log.activity_log;
DROP POLICY IF EXISTS admin_read    ON log.activity_log;
DROP POLICY IF EXISTS admin_write   ON log.activity_log;
CREATE POLICY tenant_read   ON log.activity_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.activity_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.activity_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.activity_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §16  close_activity_log —————————————————————————————————————————————
ALTER TABLE log.close_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.close_activity_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.close_activity_log;
DROP POLICY IF EXISTS tenant_insert ON log.close_activity_log;
DROP POLICY IF EXISTS admin_read    ON log.close_activity_log;
DROP POLICY IF EXISTS admin_write   ON log.close_activity_log;
CREATE POLICY tenant_read   ON log.close_activity_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.close_activity_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.close_activity_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.close_activity_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §17  export_log —————————————————————————————————————————————————————
ALTER TABLE log.export_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.export_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.export_log;
DROP POLICY IF EXISTS tenant_insert ON log.export_log;
DROP POLICY IF EXISTS admin_read    ON log.export_log;
DROP POLICY IF EXISTS admin_write   ON log.export_log;
CREATE POLICY tenant_read   ON log.export_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.export_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.export_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.export_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §18  comment_retention_log ——————————————————————————————————————————
ALTER TABLE log.comment_retention_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.comment_retention_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.comment_retention_log;
DROP POLICY IF EXISTS tenant_insert ON log.comment_retention_log;
DROP POLICY IF EXISTS admin_read    ON log.comment_retention_log;
DROP POLICY IF EXISTS admin_write   ON log.comment_retention_log;
CREATE POLICY tenant_read   ON log.comment_retention_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.comment_retention_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.comment_retention_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.comment_retention_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §19  search_history —————————————————————————————————————————————————
ALTER TABLE log.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.search_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.search_history;
DROP POLICY IF EXISTS tenant_insert ON log.search_history;
DROP POLICY IF EXISTS admin_read    ON log.search_history;
DROP POLICY IF EXISTS admin_write   ON log.search_history;
CREATE POLICY tenant_read   ON log.search_history FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.search_history FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.search_history FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.search_history FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §20  ai_inference_log ———————————————————————————————————————————————
ALTER TABLE log.ai_inference_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.ai_inference_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.ai_inference_log;
DROP POLICY IF EXISTS tenant_insert ON log.ai_inference_log;
DROP POLICY IF EXISTS admin_read    ON log.ai_inference_log;
DROP POLICY IF EXISTS admin_write   ON log.ai_inference_log;
CREATE POLICY tenant_read   ON log.ai_inference_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.ai_inference_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.ai_inference_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.ai_inference_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- Atlas request-level ledger.
ALTER TABLE log.ai_agent_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.ai_agent_run FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.ai_agent_run;
DROP POLICY IF EXISTS tenant_insert ON log.ai_agent_run;
DROP POLICY IF EXISTS admin_read    ON log.ai_agent_run;
DROP POLICY IF EXISTS admin_write   ON log.ai_agent_run;
CREATE POLICY tenant_read   ON log.ai_agent_run FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.ai_agent_run FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.ai_agent_run FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.ai_agent_run FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- Atlas provider/tool/retrieval call ledger.
ALTER TABLE log.ai_agent_call ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.ai_agent_call FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.ai_agent_call;
DROP POLICY IF EXISTS tenant_insert ON log.ai_agent_call;
DROP POLICY IF EXISTS admin_read    ON log.ai_agent_call;
DROP POLICY IF EXISTS admin_write   ON log.ai_agent_call;
CREATE POLICY tenant_read   ON log.ai_agent_call FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.ai_agent_call FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.ai_agent_call FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.ai_agent_call FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §21  ai_monitoring_log ——————————————————————————————————————————————
ALTER TABLE log.ai_monitoring_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.ai_monitoring_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.ai_monitoring_log;
DROP POLICY IF EXISTS tenant_insert ON log.ai_monitoring_log;
DROP POLICY IF EXISTS admin_read    ON log.ai_monitoring_log;
DROP POLICY IF EXISTS admin_write   ON log.ai_monitoring_log;
CREATE POLICY tenant_read   ON log.ai_monitoring_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.ai_monitoring_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.ai_monitoring_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.ai_monitoring_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §22  ai_feedback_log ————————————————————————————————————————————————
ALTER TABLE log.ai_feedback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.ai_feedback_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.ai_feedback_log;
DROP POLICY IF EXISTS tenant_insert ON log.ai_feedback_log;
DROP POLICY IF EXISTS admin_read    ON log.ai_feedback_log;
DROP POLICY IF EXISTS admin_write   ON log.ai_feedback_log;
CREATE POLICY tenant_read   ON log.ai_feedback_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.ai_feedback_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.ai_feedback_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.ai_feedback_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §23  ai_calibration_log —————————————————————————————————————————————
ALTER TABLE log.ai_calibration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.ai_calibration_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.ai_calibration_log;
DROP POLICY IF EXISTS tenant_insert ON log.ai_calibration_log;
DROP POLICY IF EXISTS admin_read    ON log.ai_calibration_log;
DROP POLICY IF EXISTS admin_write   ON log.ai_calibration_log;
CREATE POLICY tenant_read   ON log.ai_calibration_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.ai_calibration_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.ai_calibration_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.ai_calibration_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §24  ai_call_transcript —————————————————————————————————————————————
ALTER TABLE log.ai_call_transcript ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.ai_call_transcript FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.ai_call_transcript;
DROP POLICY IF EXISTS tenant_insert ON log.ai_call_transcript;
DROP POLICY IF EXISTS admin_read    ON log.ai_call_transcript;
DROP POLICY IF EXISTS admin_write   ON log.ai_call_transcript;
CREATE POLICY tenant_read   ON log.ai_call_transcript FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.ai_call_transcript FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.ai_call_transcript FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.ai_call_transcript FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §25  kpi_execution_log ——————————————————————————————————————————————
ALTER TABLE log.kpi_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.kpi_execution_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.kpi_execution_log;
DROP POLICY IF EXISTS tenant_insert ON log.kpi_execution_log;
DROP POLICY IF EXISTS admin_read    ON log.kpi_execution_log;
DROP POLICY IF EXISTS admin_write   ON log.kpi_execution_log;
CREATE POLICY tenant_read   ON log.kpi_execution_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.kpi_execution_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.kpi_execution_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.kpi_execution_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §26  workspace_usage_metric —————————————————————————————————————————
-- System log — tenants can read their own usage metrics (quota dashboard).
ALTER TABLE log.workspace_usage_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.workspace_usage_metric FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.workspace_usage_metric;
DROP POLICY IF EXISTS tenant_insert ON log.workspace_usage_metric;
DROP POLICY IF EXISTS admin_read    ON log.workspace_usage_metric;
DROP POLICY IF EXISTS admin_write   ON log.workspace_usage_metric;
CREATE POLICY tenant_read   ON log.workspace_usage_metric FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.workspace_usage_metric FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.workspace_usage_metric FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.workspace_usage_metric FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §27  notification_delivery_attempt (append-only with redaction carve-out) ——
-- Tenant can UPDATE (immutability trigger restricts to redaction fields only).
-- DELETE blocked entirely by trigger — no DELETE policy for any role.
ALTER TABLE log.notification_delivery_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.notification_delivery_attempt FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.notification_delivery_attempt;
DROP POLICY IF EXISTS tenant_insert ON log.notification_delivery_attempt;
DROP POLICY IF EXISTS tenant_update ON log.notification_delivery_attempt;
DROP POLICY IF EXISTS admin_read    ON log.notification_delivery_attempt;
DROP POLICY IF EXISTS admin_write   ON log.notification_delivery_attempt;

CREATE POLICY tenant_read   ON log.notification_delivery_attempt
    FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.notification_delivery_attempt
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- UPDATE allowed at RLS level; immutability trigger restricts actual columns
CREATE POLICY tenant_update ON log.notification_delivery_attempt
    FOR UPDATE USING     (tenant_id = shared.current_tenant_id())
              WITH CHECK (tenant_id = shared.current_tenant_id());
-- NO tenant_delete policy — trigger blocks DELETE before RLS is even checked
CREATE POLICY admin_read    ON log.notification_delivery_attempt
    FOR SELECT TO athyperadmin USING (true);
-- Admin write includes purge operations (hard-delete of rows with purge_after set)
CREATE POLICY admin_write   ON log.notification_delivery_attempt
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- =============================================================================
-- §28  DOCUMENT · PRINT · BRANDING  —  log RLS policies
-- =============================================================================

-- ── log.render_dlq ─────────────────────────────────────────────────────────
-- Append-only: no tenant_update policy (matches log.audit_log pattern)
ALTER TABLE log.render_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.render_dlq FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.render_dlq;
DROP POLICY IF EXISTS tenant_insert ON log.render_dlq;
DROP POLICY IF EXISTS admin_read    ON log.render_dlq;
DROP POLICY IF EXISTS admin_write   ON log.render_dlq;
CREATE POLICY tenant_read   ON log.render_dlq FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.render_dlq FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.render_dlq FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.render_dlq FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §CAL  log.cycle_audit_log —————————————————————————————————————————————
-- Append-only: no tenant_update or tenant_delete policies.
ALTER TABLE log.cycle_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.cycle_audit_log FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.cycle_audit_log;
DROP POLICY IF EXISTS tenant_insert ON log.cycle_audit_log;
DROP POLICY IF EXISTS admin_read    ON log.cycle_audit_log;
DROP POLICY IF EXISTS admin_write   ON log.cycle_audit_log;
CREATE POLICY tenant_read   ON log.cycle_audit_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.cycle_audit_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.cycle_audit_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.cycle_audit_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- §14  log.resolution_log — append-only audit trail
-- No tenant UPDATE/DELETE — append-only invariant enforced at policy level
-- (immutability trigger in 09_triggers is the second line of defence).
-- ============================================================================
ALTER TABLE log.resolution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE log.resolution_log FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON log.resolution_log;
DROP POLICY IF EXISTS tenant_insert ON log.resolution_log;
DROP POLICY IF EXISTS admin_read    ON log.resolution_log;
DROP POLICY IF EXISTS admin_write   ON log.resolution_log;
CREATE POLICY tenant_read   ON log.resolution_log FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON log.resolution_log FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON log.resolution_log FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON log.resolution_log FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- EXPLICIT DENY: append-only invariant — tenant UPDATE/DELETE forbidden
-- ============================================================================
-- All log tables are append-only. Rather than relying on "no policy = implicit deny",
-- add explicit USING(false) policies so UPDATE/DELETE return a clear policy violation
-- instead of silently affecting 0 rows.

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'log'
          AND tablename NOT IN ('schema_provisions')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_deny_update ON log.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_deny_delete ON log.%I', t);
        EXECUTE format('CREATE POLICY tenant_deny_update ON log.%I FOR UPDATE USING (false)', t);
        EXECUTE format('CREATE POLICY tenant_deny_delete ON log.%I FOR DELETE USING (false)', t);
    END LOOP;
END $$;
