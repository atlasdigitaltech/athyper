ALTER TABLE snapshot.entity_snapshot_identity
    ADD CONSTRAINT entity_snapshot_identity_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_snapshot_identity
    ADD CONSTRAINT entity_snapshot_identity_previous_fk
    FOREIGN KEY (tenant_id, previous_snapshot_id)
    REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_snapshot_identity
    ADD CONSTRAINT entity_snapshot_identity_captured_by_fk
    FOREIGN KEY (tenant_id, captured_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.entity_snapshot
    ADD CONSTRAINT entity_snapshot_identity_fk
    FOREIGN KEY (tenant_id, snapshot_id, captured_at)
    REFERENCES snapshot.entity_snapshot_identity (tenant_id, id, captured_at)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.subscription_plan_entitlement
    ADD CONSTRAINT subscription_plan_entitlement_plan_fk FOREIGN KEY(subscription_plan_id)
    REFERENCES control.subscription_plan(id) ON DELETE RESTRICT;
