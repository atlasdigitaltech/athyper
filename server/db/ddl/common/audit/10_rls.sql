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
