ALTER TABLE master.atlas_knowledge_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_knowledge_source FORCE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_knowledge_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_knowledge_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_knowledge_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_knowledge_chunk FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON master.atlas_knowledge_source;
DROP POLICY IF EXISTS tenant_read ON master.atlas_knowledge_revision;
DROP POLICY IF EXISTS tenant_read ON master.atlas_knowledge_chunk;
DROP POLICY IF EXISTS admin_write ON master.atlas_knowledge_source;
DROP POLICY IF EXISTS admin_write ON master.atlas_knowledge_revision;
DROP POLICY IF EXISTS admin_write ON master.atlas_knowledge_chunk;

CREATE POLICY tenant_read ON master.atlas_knowledge_source FOR SELECT
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_read ON master.atlas_knowledge_revision FOR SELECT
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_read ON master.atlas_knowledge_chunk FOR SELECT
    USING (tenant_id = shared.current_tenant_id());

CREATE POLICY admin_write ON master.atlas_knowledge_source FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY admin_write ON master.atlas_knowledge_revision FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY admin_write ON master.atlas_knowledge_chunk FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
