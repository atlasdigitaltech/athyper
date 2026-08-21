REVOKE ALL ON SCHEMA publication FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA publication FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA publication FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_publication_service') THEN
    GRANT USAGE ON SCHEMA publication TO athyper_publication_service;
    GRANT SELECT,INSERT ON publication.release,publication.entity_release_link,publication.artifact,publication.artifact_compilation TO athyper_publication_service;
    GRANT SELECT ON publication.deployment,publication.deployment_event,publication.deployment_acknowledgement TO athyper_publication_service;
    GRANT EXECUTE ON FUNCTION publication.fn_transition_release(uuid,publication.release_status_d,uuid,uuid,jsonb),
      publication.fn_transition_artifact(uuid,publication.artifact_status_d,text,text,text),
      publication.fn_create_deployment(uuid,uuid,text,text,text,integer,uuid,uuid),
      publication.fn_transition_deployment(uuid,publication.deployment_status_d,jsonb),
      publication.fn_acknowledge_activation(uuid,text,text,uuid,jsonb)
      TO athyper_publication_service;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN
    GRANT USAGE ON SCHEMA publication TO athyper_projection_applier;
    GRANT SELECT ON publication.release,publication.artifact,publication.deployment TO athyper_projection_applier;
    GRANT EXECUTE ON FUNCTION publication.fn_acknowledge_activation(uuid,text,text,uuid,jsonb) TO athyper_projection_applier;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT USAGE ON SCHEMA publication TO athyperadmin;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA publication TO athyperadmin;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA publication TO athyperadmin;
  END IF;
END; $$;
