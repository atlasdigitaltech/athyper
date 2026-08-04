CREATE INDEX entity_number_counter_policy_ix
    ON runtime_meta.entity_number_counter (tenant_id,numbering_policy_id,reset_bucket,scope_key);
CREATE INDEX entity_number_counter_last_allocation_ix
    ON runtime_meta.entity_number_counter (tenant_id,last_allocation_id)
    WHERE last_allocation_id IS NOT NULL;
