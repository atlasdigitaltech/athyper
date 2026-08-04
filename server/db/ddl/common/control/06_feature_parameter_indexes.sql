CREATE INDEX feature_flag_catalog_active_idx
    ON control.feature_flag_catalog (code)
    WHERE status = 'active';

CREATE INDEX feature_flag_override_resolve_idx
    ON control.feature_flag_override (tenant_id, feature_flag_id, effective_from DESC)
    WHERE status = 'active';

CREATE INDEX parameter_definition_active_idx
    ON control.parameter_definition (sort_order, code)
    WHERE status = 'active';

CREATE INDEX tenant_parameter_value_resolve_idx
    ON control.tenant_parameter_value (tenant_id, parameter_definition_id, effective_from DESC)
    WHERE status = 'active';
