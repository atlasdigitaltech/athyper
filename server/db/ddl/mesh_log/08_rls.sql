-- ============================================================================
-- mesh_log/08_rls.sql
-- Mesh log row-level security.
-- ============================================================================
-- Account-scoped readers see their own account logs. Workers and provisioning
-- set app.mesh_admin or use athyperadmin for writes and cross-account reads.

ALTER TABLE mesh_log.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.security_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.access_decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.attachment_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.delivery_attempt_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.job_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.hash_anchor ENABLE ROW LEVEL SECURITY;

ALTER TABLE mesh_log.audit_event FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.security_event_log FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.access_decision_log FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.attachment_access_log FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.delivery_attempt_log FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.job_log FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.dlq FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_log.hash_anchor FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mesh_log_audit_event_read ON mesh_log.audit_event;
CREATE POLICY mesh_log_audit_event_read ON mesh_log.audit_event
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code = mesh.current_account_code()
        OR actor_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_log_audit_event_admin ON mesh_log.audit_event;
CREATE POLICY mesh_log_audit_event_admin ON mesh_log.audit_event
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_log_security_event_read ON mesh_log.security_event_log;
CREATE POLICY mesh_log_security_event_read ON mesh_log.security_event_log
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_log_security_event_admin ON mesh_log.security_event_log;
CREATE POLICY mesh_log_security_event_admin ON mesh_log.security_event_log
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_log_access_decision_read ON mesh_log.access_decision_log;
CREATE POLICY mesh_log_access_decision_read ON mesh_log.access_decision_log
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_log_access_decision_admin ON mesh_log.access_decision_log;
CREATE POLICY mesh_log_access_decision_admin ON mesh_log.access_decision_log
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_log_attachment_access_read ON mesh_log.attachment_access_log;
CREATE POLICY mesh_log_attachment_access_read ON mesh_log.attachment_access_log
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_log_attachment_access_admin ON mesh_log.attachment_access_log;
CREATE POLICY mesh_log_attachment_access_admin ON mesh_log.attachment_access_log
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_log_delivery_attempt_read ON mesh_log.delivery_attempt_log;
CREATE POLICY mesh_log_delivery_attempt_read ON mesh_log.delivery_attempt_log
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_log_delivery_attempt_admin ON mesh_log.delivery_attempt_log;
CREATE POLICY mesh_log_delivery_attempt_admin ON mesh_log.delivery_attempt_log
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_log_job_log_read ON mesh_log.job_log;
CREATE POLICY mesh_log_job_log_read ON mesh_log.job_log
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_log_job_log_admin ON mesh_log.job_log;
CREATE POLICY mesh_log_job_log_admin ON mesh_log.job_log
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_log_dlq_admin ON mesh_log.dlq;
CREATE POLICY mesh_log_dlq_admin ON mesh_log.dlq
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_log_hash_anchor_read ON mesh_log.hash_anchor;
CREATE POLICY mesh_log_hash_anchor_read ON mesh_log.hash_anchor
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_log_hash_anchor_admin ON mesh_log.hash_anchor;
CREATE POLICY mesh_log_hash_anchor_admin ON mesh_log.hash_anchor
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());
