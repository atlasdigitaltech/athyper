CREATE INDEX tenant_usage_counter_metric_idx
    ON runtime_meta.tenant_usage_counter (usage_metric_id, tenant_id);

CREATE UNIQUE INDEX authorization_epoch_global_uq
    ON runtime_meta.authorization_epoch (scope_kind) WHERE scope_kind = 'global';
CREATE UNIQUE INDEX authorization_epoch_tenant_uq
    ON runtime_meta.authorization_epoch (tenant_id) WHERE scope_kind = 'tenant';
CREATE UNIQUE INDEX authorization_epoch_plane_uq
    ON runtime_meta.authorization_epoch (tenant_id, plane_code) WHERE scope_kind = 'plane';

CREATE INDEX entity_number_counter_policy_ix
    ON runtime_meta.entity_number_counter (tenant_id,numbering_policy_id,reset_bucket,scope_key);
CREATE INDEX entity_number_counter_last_allocation_ix
    ON runtime_meta.entity_number_counter (tenant_id,last_allocation_id)
    WHERE last_allocation_id IS NOT NULL;

CREATE INDEX runtime_applied_release_status_idx ON runtime_meta.applied_release(publication_key,status,source_release_no DESC);
CREATE INDEX runtime_release_activation_event_idx ON runtime_meta.release_activation_event(publication_key,activated_at DESC,id);
