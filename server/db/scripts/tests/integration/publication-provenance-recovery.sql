\set ON_ERROR_STOP on
BEGIN;
-- Fixture schema access (archive restore fixtures may omit original ACLs).
GRANT USAGE ON SCHEMA metadata,shared TO athyperapp;
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
DO $$ DECLARE id uuid; p jsonb; expires timestamptz:=clock_timestamp()+interval '30 minutes'; BEGIN
 p:=jsonb_build_object('schema','athyper.publication-recovery/1','tenantId','44444444-4444-4444-8444-444444444444','releaseId','22222222-2222-4222-8222-222222222222','entityCode','business_partner','artifactHash',repeat('a',64),'backupHash',repeat('b',64));
 id:=metadata.fn_import_publication_recovery('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','business_partner',repeat('a',64),repeat('b',64),p,'Integration fixture recovery',expires);
 IF id<>metadata.fn_import_publication_recovery('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','business_partner',repeat('a',64),repeat('b',64),p,'Integration fixture recovery',expires) THEN RAISE EXCEPTION 'idempotence failed'; END IF;
 BEGIN
  PERFORM metadata.fn_import_publication_recovery('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','business_partner',repeat('a',64),repeat('b',64),p||'{"extra":true}', 'Integration fixture recovery',expires);
  RAISE EXCEPTION 'expected import conflict';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RECOVERY_IMPORT_CONFLICT' THEN RAISE; END IF; END;
 BEGIN
  UPDATE metadata.publication_recovery_archive SET reason='Changed recovery reason' WHERE source_release_id='22222222-2222-4222-8222-222222222222';
  RAISE EXCEPTION 'expected immutable archive';
 EXCEPTION WHEN integrity_constraint_violation THEN IF SQLERRM<>'publication_recovery_archive is append-only' THEN RAISE; END IF; END;
 PERFORM metadata.fn_revoke_publication_recovery(id,'Integration fixture revocation');
END $$;
SET SESSION AUTHORIZATION athyper_runtime;
SELECT set_config('app.publication_recovery','true',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM metadata.publication_recovery_archive) THEN RAISE EXCEPTION 'tenant read failed'; END IF;
 IF has_function_privilege(current_user,'metadata.fn_import_publication_recovery(uuid,uuid,text,text,text,jsonb,text,timestamp with time zone)','EXECUTE') THEN RAISE EXCEPTION 'application can import'; END IF;
 IF has_table_privilege(current_user,'metadata.publication_recovery_archive','INSERT') THEN RAISE EXCEPTION 'application can forge archive'; END IF;
 IF has_function_privilege(current_user,'metadata.fn_revoke_publication_recovery(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'application can change recovery authority'; END IF;
END $$;
SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM metadata.publication_recovery_archive) OR EXISTS(SELECT 1 FROM metadata.publication_recovery_revocation) THEN RAISE EXCEPTION 'cross-tenant recovery evidence visible'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
