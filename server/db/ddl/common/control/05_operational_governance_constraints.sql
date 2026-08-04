ALTER TABLE control.connector_instance
    ADD CONSTRAINT connector_instance_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT connector_instance_type_fk
        FOREIGN KEY (connector_type_id) REFERENCES control.connector_type(id),
    ADD CONSTRAINT connector_instance_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT connector_instance_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT connector_instance_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.integration_endpoint
    ADD CONSTRAINT integration_endpoint_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT integration_endpoint_instance_fk
        FOREIGN KEY (tenant_id, connector_instance_id)
        REFERENCES control.connector_instance(tenant_id, id),
    ADD CONSTRAINT integration_endpoint_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT integration_endpoint_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT integration_endpoint_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.webhook_subscription
    ADD CONSTRAINT webhook_subscription_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT webhook_subscription_endpoint_fk
        FOREIGN KEY (tenant_id, integration_endpoint_id)
        REFERENCES control.integration_endpoint(tenant_id, id),
    ADD CONSTRAINT webhook_subscription_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT webhook_subscription_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT webhook_subscription_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_type
    ADD CONSTRAINT cycle_type_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_type_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_type_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_type_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_phase
    ADD CONSTRAINT cycle_phase_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_phase_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_phase_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_phase_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_phase_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_task_category
    ADD CONSTRAINT cycle_task_category_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_category_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_task_category_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_category_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_category_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_task_template
    ADD CONSTRAINT cycle_task_template_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_template_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_phase_fk
        FOREIGN KEY (tenant_id, cycle_type_id, phase_id)
        REFERENCES control.cycle_phase(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_template_category_fk
        FOREIGN KEY (tenant_id, cycle_type_id, category_id)
        REFERENCES control.cycle_task_category(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_template_default_owner_fk
        FOREIGN KEY (tenant_id, default_owner_principal_id)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_task_dependency
    ADD CONSTRAINT cycle_task_dependency_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_dependency_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_task_dependency_predecessor_fk
        FOREIGN KEY (tenant_id, cycle_type_id, predecessor_template_id)
        REFERENCES control.cycle_task_template(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_dependency_successor_fk
        FOREIGN KEY (tenant_id, cycle_type_id, successor_template_id)
        REFERENCES control.cycle_task_template(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_dependency_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_dependency_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_cross_dependency
    ADD CONSTRAINT cycle_cross_dependency_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_cross_dependency_predecessor_type_fk
        FOREIGN KEY (tenant_id, predecessor_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_cross_dependency_predecessor_phase_fk
        FOREIGN KEY (tenant_id, predecessor_type_id, predecessor_phase_id)
        REFERENCES control.cycle_phase(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_cross_dependency_successor_type_fk
        FOREIGN KEY (tenant_id, successor_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_cross_dependency_successor_phase_fk
        FOREIGN KEY (tenant_id, successor_type_id, successor_phase_id)
        REFERENCES control.cycle_phase(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_cross_dependency_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_cross_dependency_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_carryforward_rule
    ADD CONSTRAINT cycle_carryforward_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_carryforward_rule_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_carryforward_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_carryforward_rule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);
