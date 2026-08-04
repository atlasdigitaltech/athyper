CREATE INDEX ix_entity_contract_revision_entity
    ON snapshot.entity_contract_revision (tenant_id, entity_id, captured_at DESC);

CREATE INDEX ix_entity_contract_revision_change_set
    ON snapshot.entity_contract_revision (change_set_id, revision_no DESC);

CREATE INDEX ix_entity_contract_revision_parent
    ON snapshot.entity_contract_revision (parent_revision_id)
    WHERE parent_revision_id IS NOT NULL;

CREATE INDEX ix_entity_contract_revision_contract_hash
    ON snapshot.entity_contract_revision (contract_hash);

CREATE INDEX ix_entity_contract_revision_audit_event
    ON snapshot.entity_contract_revision (audit_event_id)
    WHERE audit_event_id IS NOT NULL;
