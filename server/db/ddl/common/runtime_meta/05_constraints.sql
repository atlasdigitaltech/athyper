ALTER TABLE runtime_meta.tenant_usage_counter
    ADD CONSTRAINT tenant_usage_counter_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE,
    ADD CONSTRAINT tenant_usage_counter_metric_fk
    FOREIGN KEY (usage_metric_id)
    REFERENCES control.usage_metric_catalog (id)
    ON DELETE RESTRICT;

ALTER TABLE runtime_meta.usage_reservation
    ADD CONSTRAINT usage_reservation_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT usage_reservation_metric_fk
        FOREIGN KEY (usage_metric_id) REFERENCES control.usage_metric_catalog(id) ON DELETE RESTRICT,
    ADD CONSTRAINT usage_reservation_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT usage_reservation_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE runtime_meta.authorization_epoch
    ADD CONSTRAINT authorization_epoch_scope_chk CHECK (
        (scope_kind = 'global' AND tenant_id IS NULL AND plane_code IS NULL)
        OR (scope_kind = 'tenant' AND tenant_id IS NOT NULL AND plane_code IS NULL)
        OR (scope_kind = 'plane' AND tenant_id IS NOT NULL AND plane_code IN ('studio', 'neon', 'mesh'))
    ),
    ADD CONSTRAINT authorization_epoch_value_chk CHECK (epoch >= 0),
    ADD CONSTRAINT authorization_epoch_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE runtime_meta.entity_number_counter
    ADD CONSTRAINT entity_number_counter_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_number_counter_policy_fk
        FOREIGN KEY (numbering_policy_id) REFERENCES control.numbering_policy (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_number_counter_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_number_counter_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_number_counter_last_allocated_by_fk
        FOREIGN KEY (last_allocated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE runtime_meta.entity_number_allocation
    ADD CONSTRAINT entity_number_allocation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_number_allocation_policy_fk FOREIGN KEY (numbering_policy_id) REFERENCES control.numbering_policy (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_number_allocation_counter_fk FOREIGN KEY (tenant_id,counter_id) REFERENCES runtime_meta.entity_number_counter (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_number_allocation_actor_fk FOREIGN KEY (allocated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE runtime_meta.release_activation_head ADD CONSTRAINT runtime_release_head_applied_fk FOREIGN KEY(applied_release_id) REFERENCES runtime_meta.applied_release(id) ON DELETE RESTRICT;
ALTER TABLE runtime_meta.release_activation_event ADD CONSTRAINT runtime_release_event_previous_fk FOREIGN KEY(previous_applied_release_id) REFERENCES runtime_meta.applied_release(id) ON DELETE RESTRICT;
ALTER TABLE runtime_meta.release_activation_event ADD CONSTRAINT runtime_release_event_applied_fk FOREIGN KEY(applied_release_id) REFERENCES runtime_meta.applied_release(id) ON DELETE RESTRICT;

ALTER TABLE runtime_meta.entity_contract
    ADD CONSTRAINT runtime_entity_contract_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT;

ALTER TABLE runtime_meta.entity_descriptor
    ADD CONSTRAINT runtime_entity_descriptor_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT runtime_entity_descriptor_contract_fk
        FOREIGN KEY (entity_contract_id) REFERENCES runtime_meta.entity_contract (id) ON DELETE RESTRICT,
    ADD CONSTRAINT runtime_entity_descriptor_applied_release_fk
        FOREIGN KEY (applied_release_id) REFERENCES runtime_meta.applied_release (id) ON DELETE RESTRICT;

ALTER TABLE runtime_meta.applied_release_payload
    ADD CONSTRAINT runtime_applied_release_payload_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT runtime_applied_release_payload_release_fk
        FOREIGN KEY (applied_release_id) REFERENCES runtime_meta.applied_release(id) ON DELETE RESTRICT;
