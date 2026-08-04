CREATE INDEX cc_buy_policy_resolution_idx
    ON control.commodity_category_buy_policy (
        tenant_id, commodity_category_id, company_code_id,
        company_code_supplier_profile_id, effective_from DESC
    ) WHERE status = 'active';
CREATE INDEX cc_buy_policy_intent_idx
    ON control.commodity_category_buy_policy (tenant_id, business_intent_id)
    WHERE status = 'active';
CREATE INDEX cc_buy_policy_created_by_idx
    ON control.commodity_category_buy_policy (tenant_id, created_by);

CREATE INDEX cc_sell_policy_resolution_idx
    ON control.commodity_category_sell_policy (
        tenant_id, commodity_category_id, company_code_id,
        company_code_customer_profile_id, effective_from DESC
    ) WHERE status = 'active';
CREATE INDEX cc_sell_policy_intent_idx
    ON control.commodity_category_sell_policy (tenant_id, business_intent_id)
    WHERE status = 'active';
CREATE INDEX cc_sell_policy_created_by_idx
    ON control.commodity_category_sell_policy (tenant_id, created_by);

CREATE INDEX cc_inventory_policy_resolution_idx
    ON control.commodity_category_inventory_policy (
        tenant_id, commodity_category_id, company_code_id, effective_from DESC
    ) WHERE status = 'active';
CREATE INDEX cc_inventory_policy_created_by_idx
    ON control.commodity_category_inventory_policy (tenant_id, created_by);
