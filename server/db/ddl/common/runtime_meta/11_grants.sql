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

REVOKE ALL ON runtime_meta.entity_contract,runtime_meta.entity_descriptor FROM PUBLIC;
REVOKE ALL ON runtime_meta.applied_release_payload FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.trg_guard_applied_release_payload() FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_applied_release_payload(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_active_business_partner_definition(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_entity_projection(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_release_projection(text,uuid,bigint,uuid,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_rollback_release(text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_active_entity_descriptor(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.trg_guard_entity_contract() FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.trg_guard_entity_descriptor() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT USAGE ON SCHEMA runtime_meta TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT USAGE ON SCHEMA runtime_meta TO athyperadmin;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN
    GRANT SELECT ON runtime_meta.entity_contract,runtime_meta.entity_descriptor,runtime_meta.applied_release_payload TO athyper_projection_applier;
    GRANT EXECUTE ON FUNCTION
      runtime_meta.fn_stage_entity_projection(uuid,jsonb),
      runtime_meta.fn_stage_applied_release_payload(uuid,jsonb),
      runtime_meta.fn_stage_release_projection(text,uuid,bigint,uuid,text,jsonb,jsonb),
      runtime_meta.fn_rollback_release(text,uuid,jsonb),
      runtime_meta.fn_active_entity_descriptor(text,text),
      runtime_meta.fn_active_business_partner_definition(text)
      TO athyper_projection_applier;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON runtime_meta.entity_contract,runtime_meta.entity_descriptor,runtime_meta.applied_release_payload TO athyperapp;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_active_entity_descriptor(text,text) TO athyperapp;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_active_business_partner_definition(text) TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL PRIVILEGES ON runtime_meta.entity_contract,runtime_meta.entity_descriptor,runtime_meta.applied_release_payload TO athyperadmin;
    GRANT EXECUTE ON FUNCTION
      runtime_meta.fn_stage_entity_projection(uuid,jsonb),
      runtime_meta.fn_stage_applied_release_payload(uuid,jsonb),
      runtime_meta.fn_stage_release_projection(text,uuid,bigint,uuid,text,jsonb,jsonb),
      runtime_meta.fn_rollback_release(text,uuid,jsonb),
      runtime_meta.fn_active_entity_descriptor(text,text),
      runtime_meta.fn_active_business_partner_definition(text)
      TO athyperadmin;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_owner') THEN
    GRANT USAGE ON SCHEMA runtime_meta TO athyper_projection_owner;
    GRANT SELECT ON runtime_meta.applied_release,runtime_meta.release_activation_head,runtime_meta.release_activation_event TO athyper_projection_owner;
  END IF;
END $$;

REVOKE ALL ON runtime_meta.entity_number_counter,runtime_meta.entity_number_allocation FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.trg_reject_entity_number_allocation_mutation() FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT,INSERT,UPDATE ON runtime_meta.entity_number_counter TO athyperapp;
        GRANT SELECT,INSERT ON runtime_meta.entity_number_allocation TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON runtime_meta.entity_number_counter,runtime_meta.entity_number_allocation TO athyperadmin;
    END IF;
END $$;

REVOKE ALL ON runtime_meta.applied_release,runtime_meta.release_activation_head,runtime_meta.release_activation_event FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_release(text,uuid,bigint,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_verify_release(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_activate_release(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_active_release(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_entity_projection(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_release_projection(text,uuid,bigint,uuid,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_rollback_release(text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_active_entity_descriptor(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_active_business_partner_definition(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.fn_stage_applied_release_payload(uuid,jsonb) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN
    GRANT SELECT ON runtime_meta.applied_release,runtime_meta.release_activation_head,runtime_meta.release_activation_event TO athyper_projection_applier;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_stage_release(text,uuid,bigint,uuid,text,jsonb),runtime_meta.fn_stage_entity_projection(uuid,jsonb),runtime_meta.fn_stage_applied_release_payload(uuid,jsonb),runtime_meta.fn_stage_release_projection(text,uuid,bigint,uuid,text,jsonb,jsonb),runtime_meta.fn_verify_release(uuid,text,jsonb),runtime_meta.fn_activate_release(uuid,jsonb),runtime_meta.fn_rollback_release(text,uuid,jsonb),runtime_meta.fn_active_release(text),runtime_meta.fn_active_entity_descriptor(text,text),runtime_meta.fn_active_business_partner_definition(text) TO athyper_projection_applier;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON runtime_meta.applied_release,runtime_meta.release_activation_head TO athyperapp;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_active_release(text),runtime_meta.fn_active_entity_descriptor(text,text),runtime_meta.fn_active_business_partner_definition(text) TO athyperapp;
  END IF;
END $$;
