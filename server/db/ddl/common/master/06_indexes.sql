CREATE INDEX contact_person_owner_idx
    ON master.contact_person (tenant_id, owner_type_id, owner_id, status);
CREATE UNIQUE INDEX contact_person_owner_primary_uq
    ON master.contact_person (tenant_id, owner_type_id, owner_id)
    WHERE is_primary AND status = 'active';
CREATE INDEX contact_person_name_idx
    ON master.contact_person (tenant_id, lower(contact_name));

CREATE INDEX address_event_subject_idx
    ON master.address_event (tenant_id, subject_address_id, occurred_at DESC);

CREATE INDEX address_event_related_idx
    ON master.address_event (tenant_id, related_address_id, occurred_at DESC)
    WHERE related_address_id IS NOT NULL;

CREATE INDEX address_event_type_idx
    ON master.address_event (tenant_id, event_type, occurred_at DESC);

CREATE INDEX address_event_correlation_idx
    ON master.address_event (tenant_id, correlation_id, occurred_at DESC)
    WHERE correlation_id IS NOT NULL;


    WHERE status = 'active';

    WHERE is_primary AND status = 'active';

    WHERE status = 'active';





    WHERE evidence_hash IS NOT NULL;




CREATE INDEX contact_person_role_contact_idx
    ON master.contact_person_role (tenant_id, contact_person_id, role_code);
CREATE UNIQUE INDEX contact_person_role_current_uq
    ON master.contact_person_role (tenant_id, contact_person_id, role_code)
    WHERE effective_until IS NULL;
CREATE UNIQUE INDEX contact_person_role_primary_uq
    ON master.contact_person_role (tenant_id, contact_person_id)
    WHERE is_primary AND effective_until IS NULL;
