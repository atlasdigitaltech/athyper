ALTER TABLE control.notification_template ADD CONSTRAINT notification_template_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE control.notification_routing_rule ADD CONSTRAINT notification_routing_rule_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
