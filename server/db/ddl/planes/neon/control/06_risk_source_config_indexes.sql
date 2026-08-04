CREATE INDEX risk_source_config_enabled_idx
    ON control.risk_source_config (tenant_id, source_code)
    WHERE status = 'active';
CREATE INDEX risk_source_config_connector_idx
    ON control.risk_source_config (tenant_id, connector_instance_id)
    WHERE connector_instance_id IS NOT NULL;
