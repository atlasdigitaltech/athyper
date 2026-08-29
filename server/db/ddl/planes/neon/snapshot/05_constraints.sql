ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES master.template (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_locale_fk
    FOREIGN KEY (locale_code)
    REFERENCES shared.locale (code)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.template_version
    ADD CONSTRAINT template_version_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.bom
    ADD CONSTRAINT bom_snapshot_source_fk
    FOREIGN KEY (tenant_id, source_bom_id)
    REFERENCES master.bom (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom
    ADD CONSTRAINT bom_snapshot_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom
    ADD CONSTRAINT bom_snapshot_output_item_fk
    FOREIGN KEY (tenant_id, company_code_id, output_item_id)
    REFERENCES master.item (tenant_id, company_code_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom
    ADD CONSTRAINT bom_snapshot_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom
    ADD CONSTRAINT bom_snapshot_released_by_fk
    FOREIGN KEY (tenant_id, released_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom
    ADD CONSTRAINT bom_snapshot_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE snapshot.bom_component
    ADD CONSTRAINT bom_component_snapshot_parent_fk
    FOREIGN KEY (tenant_id, bom_snapshot_id)
    REFERENCES snapshot.bom (tenant_id, id) ON DELETE CASCADE;
ALTER TABLE snapshot.bom_component
    ADD CONSTRAINT bom_component_snapshot_source_fk
    FOREIGN KEY (tenant_id, source_bom_component_id)
    REFERENCES master.bom_component (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom_component
    ADD CONSTRAINT bom_component_snapshot_item_fk
    FOREIGN KEY (tenant_id, component_item_id)
    REFERENCES master.item (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom_component
    ADD CONSTRAINT bom_component_snapshot_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code) ON DELETE RESTRICT;
ALTER TABLE snapshot.bom_component
    ADD CONSTRAINT bom_component_snapshot_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE snapshot.mesh_business_partner_profile_received
    ADD CONSTRAINT mesh_bp_profile_received_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bp_profile_received_inbox_fk FOREIGN KEY (tenant_id, inbox_event_id)
    REFERENCES control.mesh_business_partner_profile_inbox (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT mesh_bp_profile_received_by_fk FOREIGN KEY (tenant_id, received_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE snapshot.mesh_bank_account_disclosure_received
  ADD CONSTRAINT mesh_bank_disclosure_received_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bank_disclosure_received_inbox_fk FOREIGN KEY(tenant_id,inbox_event_id) REFERENCES control.mesh_bank_account_disclosure_inbox(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT mesh_bank_disclosure_received_actor_fk FOREIGN KEY(tenant_id,received_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
