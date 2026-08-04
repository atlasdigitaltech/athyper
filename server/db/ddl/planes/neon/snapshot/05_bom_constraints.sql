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
