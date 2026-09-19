DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            master.contact_person,
            master.contact_person_role,
            master.address,
            master.address_link,
            master.address_event
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            master.contact_person,
            master.contact_person_role,
            master.address,
            master.address_link,
            master.address_event
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            master.trg_normalize_contact_person(),
            master.trg_validate_contact_person_owner(),
            master.trg_guard_contact_person_identity(),
            master.trg_validate_contact_person_role(),
            master.trg_guard_contact_person_role(),
            master.trg_normalize_address(),
            master.trg_validate_address_postal_code(),
            master.trg_validate_address_link_usage(),
            master.trg_validate_address_link_target_status(),
            master.trg_guard_address_identity(),
            master.trg_guard_address_event_immutable()
        TO athyperadmin;
    END IF;
END;
$$;
