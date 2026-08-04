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
