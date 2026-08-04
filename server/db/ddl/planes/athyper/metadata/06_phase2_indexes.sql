CREATE INDEX ix_entity_runtime_profile_entity
    ON metadata.entity_runtime_profile (tenant_id, entity_id, change_set_id);

CREATE INDEX ix_entity_field_change_set_status
    ON metadata.entity_field (tenant_id, change_set_id, status, field_key);

CREATE INDEX ix_entity_field_storage_path
    ON metadata.entity_field (tenant_id, change_set_id, storage_path)
    WHERE storage_path IS NOT NULL;

CREATE INDEX ix_entity_field_replacement
    ON metadata.entity_field (tenant_id, change_set_id, replacement_field_key)
    WHERE replacement_field_key IS NOT NULL;

CREATE UNIQUE INDEX ux_entity_key_active_primary
    ON metadata.entity_key (tenant_id, change_set_id)
    NULLS NOT DISTINCT
    WHERE key_kind = 'primary' AND status = 'active';

CREATE INDEX ix_entity_key_change_set
    ON metadata.entity_key (tenant_id, change_set_id, status, key_kind, key_key);

CREATE INDEX ix_entity_key_field_field
    ON metadata.entity_key_field (tenant_id, entity_field_id, entity_key_id);

CREATE UNIQUE INDEX ux_entity_search_profile_default
    ON metadata.entity_search_profile (tenant_id, change_set_id)
    NULLS NOT DISTINCT
    WHERE is_default AND status = 'active';

CREATE INDEX ix_entity_search_profile_change_set
    ON metadata.entity_search_profile (tenant_id, change_set_id, status, search_key);

CREATE INDEX ix_entity_search_field_field
    ON metadata.entity_search_field (tenant_id, entity_field_id, entity_search_profile_id);

CREATE INDEX ix_entity_relation_change_set
    ON metadata.entity_relation (tenant_id, change_set_id, status, relation_key);

CREATE INDEX ix_entity_relation_inverse
    ON metadata.entity_relation (tenant_id, change_set_id, inverse_relation_key)
    WHERE inverse_relation_key IS NOT NULL;

CREATE INDEX ix_entity_relation_target_entity
    ON metadata.entity_relation_target (tenant_id, target_entity_id, target_key_key);

CREATE UNIQUE INDEX ux_entity_relation_target_default
    ON metadata.entity_relation_target (tenant_id, entity_relation_id)
    NULLS NOT DISTINCT
    WHERE is_default;

CREATE INDEX ix_entity_relation_field_source
    ON metadata.entity_relation_field (tenant_id, source_field_id, entity_relation_target_id);
