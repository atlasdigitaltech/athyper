REVOKE ALL ON SCHEMA publication FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA publication FROM PUBLIC;
REVOKE ALL ON FUNCTION publication.fn_transition_deployment(uuid,publication.deployment_status_d,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION publication.fn_acknowledge_activation(uuid,text,text,uuid,jsonb) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_publication_service') THEN
        GRANT USAGE ON SCHEMA publication TO athyper_publication_service;
        GRANT SELECT,INSERT ON publication.release,publication.entity_release_link,publication.artifact,publication.deployment TO athyper_publication_service;
        GRANT SELECT,INSERT ON publication.deployment_event,publication.deployment_acknowledgement TO athyper_publication_service;
        GRANT EXECUTE ON FUNCTION publication.fn_transition_deployment(uuid,publication.deployment_status_d,jsonb) TO athyper_publication_service;
        GRANT EXECUTE ON FUNCTION publication.fn_acknowledge_activation(uuid,text,text,uuid,jsonb) TO athyper_publication_service;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_applier') THEN
        GRANT USAGE ON SCHEMA publication TO athyper_projection_applier;
        GRANT SELECT ON publication.release,publication.artifact,publication.deployment TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION publication.fn_acknowledge_activation(uuid,text,text,uuid,jsonb) TO athyper_projection_applier;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA publication TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA publication TO athyperadmin;
    END IF;
END;
$$;
