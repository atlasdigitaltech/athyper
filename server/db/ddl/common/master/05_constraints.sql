ALTER TABLE master.contact_person
    ADD CONSTRAINT contact_person_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_owner_type_fk
    FOREIGN KEY (owner_type_id) REFERENCES control.owner_type (id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.contact_person_role
    ADD CONSTRAINT contact_person_role_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_role_contact_fk
    FOREIGN KEY (tenant_id, contact_person_id)
    REFERENCES master.contact_person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_role_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_role_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
