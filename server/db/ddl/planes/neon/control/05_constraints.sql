ALTER TABLE control.owner_type
    ADD CONSTRAINT owner_type_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE control.owner_type_purpose
    ADD CONSTRAINT owner_type_purpose_owner_type_fk
    FOREIGN KEY (owner_type_id)
    REFERENCES control.owner_type (id)
    ON DELETE RESTRICT;

ALTER TABLE control.org_unit_type
    ADD CONSTRAINT org_unit_type_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;
ALTER TABLE control.org_unit_type
    ADD CONSTRAINT org_unit_type_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
