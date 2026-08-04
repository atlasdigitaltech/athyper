ALTER TABLE runtime_meta.entity_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.entity_contract FORCE ROW LEVEL SECURITY;

CREATE POLICY runtime_read ON runtime_meta.entity_contract
    FOR SELECT USING (true);

CREATE POLICY publication_sync ON runtime_meta.entity_contract
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
