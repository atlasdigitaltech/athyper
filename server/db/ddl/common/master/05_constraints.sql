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

ALTER TABLE master.address
    ADD CONSTRAINT address_timezone_fk
    FOREIGN KEY (timezone_code)
    REFERENCES shared.timezone (code) ON DELETE RESTRICT;

ALTER TABLE master.address
    ADD CONSTRAINT address_state_region_fk
    FOREIGN KEY (country_code, state_region_code)
    REFERENCES shared.state_region (country_code, code) ON DELETE RESTRICT;

ALTER TABLE master.address
    ADD CONSTRAINT address_current_validation_event_fk
    FOREIGN KEY (tenant_id, current_validation_event_id)
    REFERENCES master.address_event (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.address_event
    ADD CONSTRAINT address_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT address_event_subject_address_fk
    FOREIGN KEY (tenant_id, subject_address_id)
    REFERENCES master.address (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT address_event_related_address_fk
    FOREIGN KEY (tenant_id, related_address_id)
    REFERENCES master.address (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT address_event_evidence_event_fk
    FOREIGN KEY (tenant_id, evidence_event_id)
    REFERENCES master.address_event (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT address_event_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.address_link
    ADD CONSTRAINT address_link_usage_denied_by_fk
    FOREIGN KEY (tenant_id, usage_denied_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
