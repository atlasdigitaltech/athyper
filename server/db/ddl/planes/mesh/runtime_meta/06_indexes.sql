CREATE UNIQUE INDEX entity_contract_current_uq
    ON runtime_meta.entity_contract (entity_id)
    WHERE status = 'published';

CREATE INDEX entity_contract_code_version_idx
    ON runtime_meta.entity_contract (entity_code, version_no DESC);
