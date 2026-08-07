REVOKE ALL ON runtime_meta.tenant_usage_counter FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON runtime_meta.tenant_usage_counter TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON runtime_meta.tenant_usage_counter TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON runtime_meta.authorization_epoch FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON runtime_meta.authorization_epoch TO athyperapp; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON runtime_meta.authorization_epoch TO athyperadmin; END IF;
END $$;

REVOKE ALL ON runtime_meta.entity_number_counter FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT,INSERT,UPDATE ON runtime_meta.entity_number_counter TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON runtime_meta.entity_number_counter TO athyperadmin;
    END IF;
END $$;

REVOKE ALL ON runtime_meta.applied_release,runtime_meta.release_activation_head,runtime_meta.release_activation_event FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_release(text,uuid,bigint,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_verify_release(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_activate_release(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_active_release(text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN
    GRANT SELECT ON runtime_meta.applied_release,runtime_meta.release_activation_head,runtime_meta.release_activation_event TO athyper_projection_applier;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_stage_release(text,uuid,bigint,uuid,text,jsonb),runtime_meta.fn_verify_release(uuid,text,jsonb),runtime_meta.fn_activate_release(uuid,jsonb),runtime_meta.fn_active_release(text) TO athyper_projection_applier;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_active_release(text) TO athyperapp;
  END IF;
END $$;
