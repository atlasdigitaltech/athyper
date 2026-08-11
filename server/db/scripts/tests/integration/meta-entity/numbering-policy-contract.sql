DO $$
DECLARE v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'control' AND table_name = 'numbering_policy'
       AND column_name = ANY (ARRAY[
        'tenant_id','policy_code','policy_revision','format_template','sequence_width',
        'start_value','increment_by','maximum_value','scope_kind','reset_kind','timezone_code'
       ]);
    IF v_count <> 11 THEN RAISE EXCEPTION 'Numbering policy contract columns are incomplete: %', v_count; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
         WHERE namespace.nspname='control' AND relation.relname='numbering_policy'
           AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) THEN RAISE EXCEPTION 'control.numbering_policy must force RLS'; END IF;

    SELECT count(*) INTO v_count
      FROM pg_trigger AS trigger JOIN pg_class AS relation ON relation.oid=trigger.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
     WHERE namespace.nspname='control' AND relation.relname='numbering_policy' AND NOT trigger.tgisinternal;
    IF v_count <> 3 THEN RAISE EXCEPTION 'Expected 3 numbering policy triggers; found %', v_count; END IF;

    SELECT count(*) INTO v_count
      FROM pg_proc AS procedure JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='control'
       AND procedure.proname=ANY(ARRAY['trg_validate_numbering_policy','trg_guard_numbering_policy'])
       AND EXISTS (SELECT 1 FROM unnest(coalesce(procedure.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%');
    IF v_count <> 2 THEN RAISE EXCEPTION 'Numbering policy functions must fix search_path'; END IF;

END $$;

DO $$
DECLARE v_id uuid := shared.uuidv7(); v_rejected boolean := false;
BEGIN
    INSERT INTO control.numbering_policy (
      id,tenant_id,policy_code,policy_revision,name,format_template,sequence_width,
      scope_kind,reset_kind,timezone_code,status,activated_at,activated_by,created_by
    ) VALUES (
      v_id,NULL,'smoke.primary_number',1,'Smoke policy','SMK-{yyyy}-{seq}',5,
      'tenant','calendar_year','UTC','active',now(),
      '00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000'
    );
    BEGIN
      UPDATE control.numbering_policy SET format_template='CHANGED-{seq}',updated_by='00000000-0000-0000-0000-000000000000'
       WHERE id=v_id;
    EXCEPTION WHEN integrity_constraint_violation THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Active numbering policy mutation was accepted'; END IF;
    v_rejected := false;
    BEGIN
      INSERT INTO control.numbering_policy (
        tenant_id,policy_code,policy_revision,name,format_template,created_by
      ) VALUES (NULL,'smoke.invalid',1,'Invalid smoke','BAD-{unknown}',
        '00000000-0000-0000-0000-000000000000');
    EXCEPTION WHEN check_violation THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Unknown numbering token was accepted'; END IF;
END $$;
\echo 'NUMBERING_POLICY_CONTRACT_SMOKE_OK columns=11 triggers=3 functions=2'
