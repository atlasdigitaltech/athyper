CREATE INDEX connector_instance_type_idx
    ON control.connector_instance (connector_type_id);
CREATE INDEX connector_instance_tenant_status_idx
    ON control.connector_instance (tenant_id, status);
CREATE INDEX integration_endpoint_instance_idx
    ON control.integration_endpoint (tenant_id, connector_instance_id);
CREATE INDEX webhook_subscription_endpoint_idx
    ON control.webhook_subscription (tenant_id, integration_endpoint_id);
CREATE INDEX webhook_subscription_topics_gin
    ON control.webhook_subscription USING gin (topics);

CREATE INDEX cycle_type_tenant_status_idx
    ON control.cycle_type (tenant_id, status);
CREATE INDEX cycle_phase_type_idx
    ON control.cycle_phase (tenant_id, cycle_type_id, sort_order);
CREATE INDEX cycle_task_category_type_idx
    ON control.cycle_task_category (tenant_id, cycle_type_id, sort_order);
CREATE INDEX cycle_task_template_phase_idx
    ON control.cycle_task_template (tenant_id, cycle_type_id, phase_id, sort_order);
CREATE INDEX cycle_task_template_category_idx
    ON control.cycle_task_template (tenant_id, cycle_type_id, category_id);
CREATE INDEX cycle_task_template_default_owner_idx
    ON control.cycle_task_template (tenant_id, default_owner_principal_id)
    WHERE default_owner_principal_id IS NOT NULL;
CREATE INDEX cycle_task_dependency_successor_idx
    ON control.cycle_task_dependency (tenant_id, cycle_type_id, successor_template_id);
CREATE INDEX cycle_cross_dependency_successor_idx
    ON control.cycle_cross_dependency
       (tenant_id, successor_type_id, successor_phase_id);
CREATE INDEX cycle_carryforward_rule_type_idx
    ON control.cycle_carryforward_rule (tenant_id, cycle_type_id);
