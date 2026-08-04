ALTER TABLE mesh.document_envelope ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_envelope FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_payload ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_payload FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_event FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_acknowledgement ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.document_acknowledgement FORCE ROW LEVEL SECURITY;

CREATE POLICY participant_access ON mesh.document_envelope FOR ALL
    USING (
        sender_tenant_id = shared.current_tenant_id_soft()
        OR receiver_tenant_id = shared.current_tenant_id_soft()
    )
    WITH CHECK (
        sender_tenant_id = shared.current_tenant_id()
        OR receiver_tenant_id = shared.current_tenant_id()
    );
CREATE POLICY seed_write ON mesh.document_envelope
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_access ON mesh.document_payload FOR ALL
    USING (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_payload.envelope_id
           AND shared.current_tenant_id_soft() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_payload.envelope_id
           AND shared.current_tenant_id() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ));
CREATE POLICY seed_write ON mesh.document_payload
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_access ON mesh.document_event FOR ALL
    USING (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_event.envelope_id
           AND shared.current_tenant_id_soft() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_event.envelope_id
           AND shared.current_tenant_id() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ));
CREATE POLICY seed_write ON mesh.document_event
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY participant_access ON mesh.document_acknowledgement FOR ALL
    USING (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_acknowledgement.envelope_id
           AND shared.current_tenant_id_soft() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM mesh.document_envelope e
         WHERE e.id = document_acknowledgement.envelope_id
           AND shared.current_tenant_id() IN (
               e.sender_tenant_id, e.receiver_tenant_id
           )
    ));
CREATE POLICY seed_write ON mesh.document_acknowledgement
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
