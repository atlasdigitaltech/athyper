CREATE INDEX contact_person_owner_idx
    ON master.contact_person (tenant_id, owner_type_id, owner_id, status);
CREATE UNIQUE INDEX contact_person_owner_primary_uq
    ON master.contact_person (tenant_id, owner_type_id, owner_id)
    WHERE is_primary AND status = 'active';
CREATE INDEX contact_person_name_idx
    ON master.contact_person (tenant_id, lower(contact_name));

CREATE INDEX contact_person_role_contact_idx
    ON master.contact_person_role (tenant_id, contact_person_id, role_code);
CREATE UNIQUE INDEX contact_person_role_current_uq
    ON master.contact_person_role (tenant_id, contact_person_id, role_code)
    WHERE effective_until IS NULL;
CREATE UNIQUE INDEX contact_person_role_primary_uq
    ON master.contact_person_role (tenant_id, contact_person_id)
    WHERE is_primary AND effective_until IS NULL;
