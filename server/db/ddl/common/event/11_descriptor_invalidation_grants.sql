REVOKE ALL ON event.descriptor_invalidation_outbox FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE
            ON event.descriptor_invalidation_outbox TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES
            ON event.descriptor_invalidation_outbox TO athyperadmin;
    END IF;
END;
$$;
