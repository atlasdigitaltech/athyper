ALTER TABLE control.network_document_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.network_document_type FORCE ROW LEVEL SECURITY;

CREATE POLICY active_read ON control.network_document_type
    FOR SELECT USING (status = 'active');

CREATE POLICY seed_write ON control.network_document_type
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
