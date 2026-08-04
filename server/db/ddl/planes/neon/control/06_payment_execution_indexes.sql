CREATE INDEX payment_execution_profile_connector_idx
    ON control.payment_execution_profile (tenant_id, connector_instance_id)
    WHERE connector_instance_id IS NOT NULL;

CREATE INDEX payment_execution_profile_active_rail_idx
    ON control.payment_execution_profile (tenant_id, payment_rail_code, delivery_mode)
    WHERE status = 'active';
