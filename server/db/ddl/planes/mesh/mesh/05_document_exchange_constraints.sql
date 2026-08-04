ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_relationship_fk
    FOREIGN KEY (network_relationship_id)
    REFERENCES mesh.network_relationship (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_sender_fk
    FOREIGN KEY (sender_tenant_id, sender_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_receiver_fk
    FOREIGN KEY (receiver_tenant_id, receiver_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_type_fk
    FOREIGN KEY (document_type_id)
    REFERENCES control.network_document_type (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_entity_contract_fk
    FOREIGN KEY (entity_id, entity_version_id, entity_contract_hash)
    REFERENCES runtime_meta.entity_contract (
        entity_id, id, entity_contract_hash
    ) ON DELETE RESTRICT;

ALTER TABLE mesh.document_envelope
    ADD CONSTRAINT document_envelope_created_by_fk
    FOREIGN KEY (sender_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_payload
    ADD CONSTRAINT document_payload_envelope_fk
    FOREIGN KEY (envelope_id)
    REFERENCES mesh.document_envelope (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_payload
    ADD CONSTRAINT document_payload_created_by_fk
    FOREIGN KEY (created_by_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_envelope_fk
    FOREIGN KEY (envelope_id)
    REFERENCES mesh.document_envelope (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_actor_account_fk
    FOREIGN KEY (actor_tenant_id, actor_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_actor_principal_fk
    FOREIGN KEY (actor_tenant_id, actor_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_event
    ADD CONSTRAINT document_event_created_by_fk
    FOREIGN KEY (created_by_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_envelope_fk
    FOREIGN KEY (envelope_id)
    REFERENCES mesh.document_envelope (id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_responder_fk
    FOREIGN KEY (responder_tenant_id, responder_account_id)
    REFERENCES mesh.network_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_responder_principal_fk
    FOREIGN KEY (responder_tenant_id, responder_principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE mesh.document_acknowledgement
    ADD CONSTRAINT document_acknowledgement_created_by_fk
    FOREIGN KEY (responder_tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
