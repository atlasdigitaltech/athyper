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

CREATE INDEX contact_person_role_contact_idx
    ON master.contact_person_role (tenant_id, contact_person_id, role_code);
ALTER TABLE master.contact_person_role ADD CONSTRAINT contact_person_role_period_excl
 EXCLUDE USING gist (tenant_id WITH =,contact_person_id WITH =,role_code WITH =,
 COALESCE(address_link_id,'00000000-0000-0000-0000-000000000000'::uuid) WITH =,
 daterange(effective_from,effective_until,'[)') WITH &&);
ALTER TABLE master.contact_person_role ADD CONSTRAINT contact_person_role_primary_period_excl
 EXCLUDE USING gist (tenant_id WITH =,contact_person_id WITH =,
 COALESCE(address_link_id,'00000000-0000-0000-0000-000000000000'::uuid) WITH =,
 daterange(effective_from,effective_until,'[)') WITH &&) WHERE (is_primary);
