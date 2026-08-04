ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_item_fk
    FOREIGN KEY (tenant_id, company_code_id, item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE CASCADE;
ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_status_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.item_inventory_policy
    ADD CONSTRAINT item_inventory_policy_active_range_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        item_id WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    )
    WHERE (status = 'active');
