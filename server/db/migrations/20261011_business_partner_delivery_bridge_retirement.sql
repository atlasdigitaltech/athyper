-- Retire the empty Neon/Mesh Business Partner profile-delivery bridge without
-- touching shared Business Partner, Entity, publication, or bank-disclosure data.
DO $retire$
DECLARE
  relation text;
  populated boolean;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'document.mesh_profile_change_case',
    'document.mesh_business_partner_acceptance_event',
    'document.mesh_business_partner_acceptance',
    'document.mesh_business_partner_match',
    'document.mesh_profile_change_resolution',
    'control.mesh_bank_account_projection',
    'control.mesh_business_partner_account_link',
    'control.mesh_business_partner_profile_projection',
    'snapshot.mesh_business_partner_profile_received',
    'control.mesh_business_partner_profile_processing_attempt',
    'control.mesh_business_partner_profile_inbox',
    'mesh.business_partner_delivery_acknowledgement'
  ] LOOP
    IF to_regclass(relation) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', relation);
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s)', relation) INTO populated;
      IF populated THEN
        RAISE EXCEPTION 'BUSINESS_PARTNER_DELIVERY_BRIDGE_RETIREMENT_REQUIRES_EMPTY_TABLE: %', relation;
      END IF;
    END IF;
  END LOOP;
END $retire$;

DO $retire$
DECLARE
  relation text;
BEGIN
  -- Dependents precede the profile inbox and snapshot sources. No CASCADE is
  -- used so an undeclared remaining consumer blocks this retirement.
  FOREACH relation IN ARRAY ARRAY[
    'document.mesh_profile_change_case',
    'document.mesh_business_partner_acceptance_event',
    'document.mesh_business_partner_acceptance',
    'document.mesh_business_partner_match',
    'document.mesh_profile_change_resolution',
    'control.mesh_bank_account_projection',
    'control.mesh_business_partner_account_link',
    'control.mesh_business_partner_profile_projection',
    'snapshot.mesh_business_partner_profile_received',
    'control.mesh_business_partner_profile_processing_attempt',
    'control.mesh_business_partner_profile_inbox',
    'mesh.business_partner_delivery_acknowledgement'
  ] LOOP
    IF to_regclass(relation) IS NOT NULL THEN
      EXECUTE format('DROP TABLE %s', relation);
    END IF;
  END LOOP;

  IF to_regprocedure('master.command_materialize_mesh_profile_change_case(uuid,uuid,bigint,text,uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION master.command_materialize_mesh_profile_change_case(uuid,uuid,bigint,text,uuid,uuid)';
  END IF;
  IF to_regprocedure('document.trg_mesh_profile_resolution_immutable()') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION document.trg_mesh_profile_resolution_immutable()';
  END IF;
  IF to_regprocedure('control.trg_guard_mesh_business_partner_profile_evidence()') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION control.trg_guard_mesh_business_partner_profile_evidence()';
  END IF;
  IF to_regprocedure('control.trg_guard_mesh_business_partner_profile_projection()') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION control.trg_guard_mesh_business_partner_profile_projection()';
  END IF;
  IF to_regprocedure('control.trg_guard_mesh_business_partner_account_link()') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION control.trg_guard_mesh_business_partner_account_link()';
  END IF;
  IF to_regprocedure('control.trg_guard_mesh_bank_account_projection()') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION control.trg_guard_mesh_bank_account_projection()';
  END IF;
  IF to_regprocedure('snapshot.trg_guard_mesh_business_partner_profile_received()') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION snapshot.trg_guard_mesh_business_partner_profile_received()';
  END IF;
  IF to_regprocedure('snapshot.mesh_business_partner_profile_payload_is_safe(jsonb)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION snapshot.mesh_business_partner_profile_payload_is_safe(jsonb)';
  END IF;
  IF to_regprocedure('mesh.trg_delivery_acknowledgement_immutable()') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION mesh.trg_delivery_acknowledgement_immutable()';
  END IF;
  IF to_regclass('runtime_meta.release_activation_head') IS NOT NULL
     AND to_regprocedure('runtime_meta.trg_guard_business_partner_definition_head()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS runtime_business_partner_definition_head_guard ON runtime_meta.release_activation_head';
    EXECUTE 'DROP FUNCTION runtime_meta.trg_guard_business_partner_definition_head()';
  END IF;
  IF to_regprocedure('runtime_meta.fn_active_business_partner_definition(text)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION runtime_meta.fn_active_business_partner_definition(text)';
  END IF;
END $retire$;
