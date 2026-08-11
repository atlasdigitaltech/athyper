ALTER TABLE master.audit_reason_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.audit_reason_code FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.audit_reason_code FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY seed_write ON master.audit_reason_code FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        EXECUTE
            'CREATE POLICY admin_access ON master.audit_reason_code '
            'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)';
    END IF;
END;
$$;

ALTER TABLE audit.export_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.export_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON audit.export_request FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE audit.export_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.export_manifest FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read_insert ON audit.export_manifest FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE audit.integrity_check_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.integrity_check_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read_insert ON audit.integrity_check_evidence FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE audit.legal_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.legal_hold FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON audit.legal_hold FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE audit.legal_hold_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.legal_hold_manifest FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read_insert ON audit.legal_hold_manifest FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

ALTER TABLE audit.retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.retention_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON audit.retention_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

DO $$
DECLARE v_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        FOREACH v_table IN ARRAY ARRAY['export_request','export_manifest','integrity_check_evidence','legal_hold','legal_hold_manifest','retention_policy']
        LOOP
            EXECUTE format('CREATE POLICY admin_access ON audit.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
        END LOOP;
    END IF;
END;
$$;

ALTER TABLE audit.authorization_decision_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.authorization_decision_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON audit.authorization_decision_evidence FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY tenant_insert ON audit.authorization_decision_evidence FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND plane_code =
            current_setting('app.database_plane')::audit.plane_code_d
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        EXECUTE
            'CREATE POLICY admin_read_insert '
            'ON audit.authorization_decision_evidence '
            'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)';
    END IF;
END;
$$;

ALTER TABLE audit.security_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.security_event FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON audit.security_event FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY tenant_insert ON audit.security_event FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND plane_code =
            current_setting('app.database_plane')::audit.plane_code_d
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        EXECUTE
            'CREATE POLICY admin_read_insert ON audit.security_event '
            'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)';
    END IF;
END;
$$;

ALTER TABLE audit.hash_anchor ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.hash_anchor FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON audit.hash_anchor FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY tenant_insert ON audit.hash_anchor FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND plane_code =
            current_setting('app.database_plane')::audit.plane_code_d
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        EXECUTE
            'CREATE POLICY admin_read_insert ON audit.hash_anchor '
            'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)';
    END IF;
END;
$$;

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON audit.audit_log FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY tenant_insert ON audit.audit_log FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND plane_code =
            current_setting('app.database_plane')::audit.plane_code_d
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        EXECUTE
            'CREATE POLICY admin_read_insert ON audit.audit_log '
            'FOR ALL TO athyperadmin USING (true) WITH CHECK (true)';
    END IF;
END;
$$;
