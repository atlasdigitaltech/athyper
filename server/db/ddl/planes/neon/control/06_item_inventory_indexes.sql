CREATE INDEX item_inventory_policy_item_idx
    ON control.item_inventory_policy (
        tenant_id, company_code_id, item_id, status, effective_from, effective_to
    );
CREATE INDEX item_inventory_policy_created_by_idx
    ON control.item_inventory_policy (tenant_id, created_by);
