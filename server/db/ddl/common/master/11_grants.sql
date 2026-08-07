DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            master.contact_person,
            master.contact_person_role
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            master.contact_person,
            master.contact_person_role
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            master.trg_normalize_contact_person(),
            master.trg_validate_contact_person_owner(),
            master.trg_guard_contact_person_identity(),
            master.trg_validate_contact_person_role(),
            master.trg_guard_contact_person_role()
        TO athyperadmin;
    END IF;
END;
$$;
