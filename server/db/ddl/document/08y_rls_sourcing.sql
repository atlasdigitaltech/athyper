-- ============================================================================
-- RLS for sourcing documents
-- ============================================================================

DO $sourcing_rls$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'sourcing_event',
        'sourcing_event_company',
        'sourcing_event_demand',
        'sourcing_event_award',
        'sourcing_event_award_allocation',
        'sourcing_event_intercompany_allocation'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_read ON document.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON document.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_update ON document.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON document.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS admin_read ON document.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS admin_write ON document.%I', table_name);
        EXECUTE format('CREATE POLICY tenant_read ON document.%I FOR SELECT USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft())', table_name);
        EXECUTE format('CREATE POLICY tenant_insert ON document.%I FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id())', table_name);
        EXECUTE format('CREATE POLICY tenant_update ON document.%I FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id())', table_name);
        EXECUTE format('CREATE POLICY tenant_delete ON document.%I FOR DELETE USING (tenant_id = shared.current_tenant_id())', table_name);
        EXECUTE format('CREATE POLICY admin_read ON document.%I FOR SELECT TO athyperadmin USING (true)', table_name);
        EXECUTE format('CREATE POLICY admin_write ON document.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', table_name);
    END LOOP;
END;
$sourcing_rls$;
