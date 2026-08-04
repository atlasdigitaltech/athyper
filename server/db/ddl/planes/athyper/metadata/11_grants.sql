REVOKE ALL ON SCHEMA metadata FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA metadata FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA metadata FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA metadata TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            metadata.entity,
            metadata.entity_change_set
        TO athyperapp;
        GRANT SELECT, INSERT ON metadata.entity_release TO athyperapp;
        GRANT SELECT ON metadata.entity_publication_status TO athyperapp;
        GRANT EXECUTE ON FUNCTION metadata.current_actor_id(uuid) TO athyperapp;
        GRANT EXECUTE ON FUNCTION metadata.fn_compute_entity_release_hash(
            uuid, uuid, uuid, uuid, bigint, text,
            metadata.entity_release_kind_d, uuid, uuid, text, text, text, text,
            metadata.compatibility_level_d, text[], text, text, text, uuid,
            timestamptz, uuid
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA metadata TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA metadata TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA metadata TO athyperadmin;
    END IF;
END;
$$;
