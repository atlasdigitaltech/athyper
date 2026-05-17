-- 2026-05-17: Rename commodity category workbench parameter code.
-- Keeps tenant overrides by copying old spend-category values to the new code.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
    INSERT INTO control.parameter_definition (
        code,
        namespace,
        display_name,
        description,
        owner_model,
        control_level,
        tenant_visibility,
        data_type,
        unit,
        default_value,
        product_value,
        min_value,
        max_value,
        allowed_values,
        runtime_reload,
        cache_ttl_seconds,
        is_security_sensitive,
        is_runtime_reloadable,
        is_enabled,
        sort_order,
        metadata,
        status,
        created_by
    )
    VALUES (
        'workbench.supply_chain.commodity_category_tree_batch_size',
        'workbench.supply_chain',
        'Commodity category tree batch size',
        'Maximum number of commodity-category hierarchy rows loaded per tree request in the supply-chain workbench Explorer.',
        'product',
        'tenant_configurable',
        'configurable',
        'integer',
        'rows',
        '500'::jsonb,
        '500'::jsonb,
        '50'::jsonb,
        '1000'::jsonb,
        NULL,
        'immediate',
        300,
        false,
        true,
        true,
        10,
        jsonb_build_object(
            'source', 'packages/domain/finance/finance-workbench/src/hooks/useTaxonomyWorkbenches.ts',
            'scope', 'hierarchy_tree_only',
            'fallback_constant', 'DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE',
            'legacy_code', 'workbench.supply_chain.spend_category_tree_batch_size'
        ),
        'active',
        v_su
    )
    ON CONFLICT (code) DO UPDATE SET
        namespace             = EXCLUDED.namespace,
        display_name          = EXCLUDED.display_name,
        description           = EXCLUDED.description,
        control_level         = EXCLUDED.control_level,
        tenant_visibility     = EXCLUDED.tenant_visibility,
        data_type             = EXCLUDED.data_type,
        unit                  = EXCLUDED.unit,
        default_value         = EXCLUDED.default_value,
        product_value         = EXCLUDED.product_value,
        min_value             = EXCLUDED.min_value,
        max_value             = EXCLUDED.max_value,
        allowed_values        = EXCLUDED.allowed_values,
        runtime_reload        = EXCLUDED.runtime_reload,
        cache_ttl_seconds     = EXCLUDED.cache_ttl_seconds,
        is_security_sensitive = EXCLUDED.is_security_sensitive,
        is_runtime_reloadable = EXCLUDED.is_runtime_reloadable,
        is_enabled            = EXCLUDED.is_enabled,
        sort_order            = EXCLUDED.sort_order,
        metadata              = EXCLUDED.metadata,
        status                = 'active',
        updated_at            = now(),
        updated_by            = v_su;

    INSERT INTO master.tenant_parameter_value (
        tenant_id,
        parameter_code,
        override_enabled,
        value,
        reason,
        effective_from,
        effective_to,
        metadata,
        status,
        created_by,
        updated_at,
        updated_by
    )
    SELECT
        tenant_id,
        'workbench.supply_chain.commodity_category_tree_batch_size',
        override_enabled,
        value,
        reason,
        effective_from,
        effective_to,
        COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('migrated_from', parameter_code),
        status,
        created_by,
        now(),
        v_su
    FROM master.tenant_parameter_value
    WHERE parameter_code = 'workbench.supply_chain.spend_category_tree_batch_size'
    ON CONFLICT (tenant_id, parameter_code) DO NOTHING;

    UPDATE control.parameter_definition
       SET status = 'deprecated',
           tenant_visibility = 'hidden',
           metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('replaced_by', 'workbench.supply_chain.commodity_category_tree_batch_size'),
           updated_at = now(),
           updated_by = v_su
     WHERE code = 'workbench.supply_chain.spend_category_tree_batch_size';

    UPDATE master.tenant_parameter_value old_value
       SET status = 'deprecated',
           metadata = COALESCE(old_value.metadata, '{}'::jsonb)
                      || jsonb_build_object('replaced_by', 'workbench.supply_chain.commodity_category_tree_batch_size'),
           updated_at = now(),
           updated_by = v_su
     WHERE old_value.parameter_code = 'workbench.supply_chain.spend_category_tree_batch_size'
       AND EXISTS (
           SELECT 1
           FROM master.tenant_parameter_value new_value
           WHERE new_value.tenant_id = old_value.tenant_id
             AND new_value.parameter_code = 'workbench.supply_chain.commodity_category_tree_batch_size'
       );
END $$;
