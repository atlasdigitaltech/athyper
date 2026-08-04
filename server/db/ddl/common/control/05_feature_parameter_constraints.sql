ALTER TABLE control.feature_flag_override
    ADD CONSTRAINT feature_flag_override_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT feature_flag_override_feature_flag_fk
    FOREIGN KEY (feature_flag_id)
    REFERENCES control.feature_flag_catalog (id)
    ON DELETE RESTRICT;

ALTER TABLE control.feature_flag_override
    ADD CONSTRAINT feature_flag_override_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        feature_flag_id WITH =,
        tstzrange(effective_from, effective_until, '[)') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.tenant_parameter_value
    ADD CONSTRAINT tenant_parameter_value_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE,
    ADD CONSTRAINT tenant_parameter_value_definition_fk
    FOREIGN KEY (parameter_definition_id)
    REFERENCES control.parameter_definition (id)
    ON DELETE RESTRICT;

ALTER TABLE control.tenant_parameter_value
    ADD CONSTRAINT tenant_parameter_value_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        parameter_definition_id WITH =,
        tstzrange(effective_from, effective_until, '[)') WITH &&
    ) WHERE (status = 'active');
