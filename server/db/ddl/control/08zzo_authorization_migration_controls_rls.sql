-- ============================================================================
-- control/08zzo_authorization_migration_controls_rls.sql
-- Wave 0 control evidence is platform-admin only.
-- ============================================================================

ALTER TABLE control.authorization_capture_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.authorization_capture_source FORCE ROW LEVEL SECURITY;
ALTER TABLE control.authorization_writer_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.authorization_writer_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE control.authorization_anomaly_disposition ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.authorization_anomaly_disposition FORCE ROW LEVEL SECURITY;
ALTER TABLE control.authorization_migration_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.authorization_migration_run FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authorization_capture_source_admin
    ON control.authorization_capture_source;
CREATE POLICY authorization_capture_source_admin
    ON control.authorization_capture_source
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS authorization_capture_source_internal_read
    ON control.authorization_capture_source;
CREATE POLICY authorization_capture_source_internal_read
    ON control.authorization_capture_source
    FOR SELECT TO PUBLIC
    USING (
        current_setting('app.authorization_capture_internal', true) = 'on'
    );

DROP POLICY IF EXISTS authorization_writer_registry_admin
    ON control.authorization_writer_registry;
CREATE POLICY authorization_writer_registry_admin
    ON control.authorization_writer_registry
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS authorization_anomaly_disposition_admin
    ON control.authorization_anomaly_disposition;
CREATE POLICY authorization_anomaly_disposition_admin
    ON control.authorization_anomaly_disposition
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS authorization_migration_run_admin
    ON control.authorization_migration_run;
CREATE POLICY authorization_migration_run_admin
    ON control.authorization_migration_run
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS authorization_migration_run_internal_read
    ON control.authorization_migration_run;
CREATE POLICY authorization_migration_run_internal_read
    ON control.authorization_migration_run
    FOR SELECT TO PUBLIC
    USING (
        current_setting('app.authorization_capture_internal', true) = 'on'
    );

REVOKE ALL ON TABLE
    control.authorization_capture_source,
    control.authorization_writer_registry,
    control.authorization_anomaly_disposition,
    control.authorization_migration_run
FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    control.authorization_capture_source,
    control.authorization_writer_registry,
    control.authorization_anomaly_disposition,
    control.authorization_migration_run
TO athyperadmin;
