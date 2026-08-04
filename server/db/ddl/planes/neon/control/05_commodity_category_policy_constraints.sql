ALTER TABLE control.commodity_category_buy_policy
    ADD CONSTRAINT cc_buy_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cc_buy_policy_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_supplier_profile_fk
        FOREIGN KEY (
            tenant_id, company_code_id, company_code_supplier_profile_id
        ) REFERENCES master.company_code_supplier_profile(
            tenant_id, company_code_id, id
        ),
    ADD CONSTRAINT cc_buy_policy_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_buy_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.commodity_category_sell_policy
    ADD CONSTRAINT cc_sell_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cc_sell_policy_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_customer_profile_fk
        FOREIGN KEY (
            tenant_id, company_code_id, company_code_customer_profile_id
        ) REFERENCES master.company_code_customer_profile(
            tenant_id, company_code_id, id
        ),
    ADD CONSTRAINT cc_sell_policy_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id)
        REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_sell_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.commodity_category_inventory_policy
    ADD CONSTRAINT cc_inventory_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cc_inventory_policy_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cc_inventory_policy_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

-- Active policy intervals cannot overlap. Nullable scope coordinates use
-- separate partial exclusions so NULL tenant-level scopes remain protected.
ALTER TABLE control.commodity_category_inventory_policy
    ADD CONSTRAINT cc_inventory_tenant_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT cc_inventory_company_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL);

ALTER TABLE control.commodity_category_buy_policy
    ADD CONSTRAINT cc_buy_tenant_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT cc_buy_company_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL
             AND company_code_supplier_profile_id IS NULL),
    ADD CONSTRAINT cc_buy_supplier_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_supplier_profile_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_supplier_profile_id IS NOT NULL),
    ADD CONSTRAINT cc_buy_tenant_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NULL),
    ADD CONSTRAINT cc_buy_company_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NOT NULL
             AND company_code_supplier_profile_id IS NULL),
    ADD CONSTRAINT cc_buy_supplier_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_supplier_profile_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default
             AND company_code_supplier_profile_id IS NOT NULL);

ALTER TABLE control.commodity_category_sell_policy
    ADD CONSTRAINT cc_sell_tenant_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT cc_sell_company_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL
             AND company_code_customer_profile_id IS NULL),
    ADD CONSTRAINT cc_sell_customer_intent_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_customer_profile_id WITH =, business_intent_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND company_code_customer_profile_id IS NOT NULL),
    ADD CONSTRAINT cc_sell_tenant_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NULL),
    ADD CONSTRAINT cc_sell_company_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =, company_code_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default AND company_code_id IS NOT NULL
             AND company_code_customer_profile_id IS NULL),
    ADD CONSTRAINT cc_sell_customer_default_period_excl EXCLUDE USING gist (
        tenant_id WITH =, commodity_category_id WITH =,
        company_code_customer_profile_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active' AND is_default
             AND company_code_customer_profile_id IS NOT NULL);
