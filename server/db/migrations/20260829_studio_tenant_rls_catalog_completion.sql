BEGIN;

DO $$
BEGIN
    IF current_database() <> 'athyper_studio' THEN
        RAISE EXCEPTION 'studio tenant RLS completion may run only on athyper_studio';
    END IF;
END
$$;

ALTER TABLE document.comment_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_revision FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_access ON document.comment_revision;
CREATE POLICY admin_access ON document.comment_revision
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

ALTER TABLE document.comment_moderation_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.comment_moderation_flag FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_access ON document.comment_moderation_flag;
CREATE POLICY admin_access ON document.comment_moderation_flag
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

ALTER TABLE publication.release ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.release FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON publication.release;
CREATE POLICY tenant_access ON publication.release
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
DROP POLICY IF EXISTS admin_access ON publication.release;
CREATE POLICY admin_access ON publication.release
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

COMMIT;
