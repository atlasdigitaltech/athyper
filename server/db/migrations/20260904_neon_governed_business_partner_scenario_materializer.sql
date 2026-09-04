-- G5 supplier/customer governed-case materializer. The canonical function file
-- is deliberately replayed so clean builds and supported upgrades compile the
-- exact same command body.
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'athyper_neon'
     OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'G5 Business Partner scenario materializer requires the NEON plane';
  END IF;
  IF to_regprocedure('document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid)') IS NULL
     OR to_regprocedure('control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'G5 preflight: G1 lifecycle and G2 authority commands must be installed first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE
  execution uuid:=NULLIF(current_setting('app.entity_case_command_execution_id',true),'')::uuid;
  tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);
BEGIN
  IF execution IS NULL OR NOT EXISTS(
    SELECT 1 FROM event.command_execution e
     WHERE e.id=execution AND e.tenant_id=tenant
       AND e.command_code IN('entity.case.draft.write','entity.case.validation','entity.case.lifecycle',
         'entity.case.materialize.internal_business_partner','entity.case.materialize.business_partner_role')
       AND e.status='processing'
       AND e.actor_principal_id=master.current_principal_id_soft()
  ) THEN
    RAISE EXCEPTION 'Entity case mutations require the governed command'
      USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

\ir ../ddl/planes/neon/master/07_g5_business_partner_materializer.sql

REVOKE ALL ON FUNCTION master.command_materialize_business_partner_role_case(
  uuid,uuid,bigint,text,uuid,uuid
) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT EXECUTE ON FUNCTION master.command_materialize_business_partner_role_case(
      uuid,uuid,bigint,text,uuid,uuid
    ) TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT EXECUTE ON FUNCTION master.command_materialize_business_partner_role_case(
      uuid,uuid,bigint,text,uuid,uuid
    ) TO athyperadmin;
  END IF;
END $$;

COMMIT;
