\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
DO $$ DECLARE prior uuid; next_id uuid:=shared.uuidv7(); p jsonb; expiry timestamptz:=clock_timestamp()+interval '30 minutes'; BEGIN
 p:=jsonb_build_object('schema','athyper.publication-recovery/1','tenantId','44444444-4444-4444-8444-444444444444','releaseId','33333333-2222-4222-8222-222222222222','entityCode','business_partner','artifactHash',repeat('a',64),'backupHash',repeat('b',64),'currentCatalogHash',repeat('c',64));
 prior:=metadata.fn_import_publication_recovery('44444444-4444-4444-8444-444444444444','33333333-2222-4222-8222-222222222222','business_partner',repeat('a',64),repeat('b',64),p,'Successor integration fixture',expiry);
 BEGIN
  PERFORM metadata.fn_succeed_publication_recovery(next_id,prior,p,'Successor integration fixture',expiry);
  RAISE EXCEPTION 'expected active predecessor denial';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RECOVERY_PRIOR_STILL_ACTIVE' THEN RAISE; END IF; END;
 PERFORM metadata.fn_revoke_publication_recovery(prior,'Reviewed prerequisite recovery');
 BEGIN
  PERFORM metadata.fn_succeed_publication_recovery(next_id,prior,p||'{"extra":true}', 'Successor integration fixture',expiry);
  RAISE EXCEPTION 'expected changed evidence denial';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RECOVERY_SUCCESSOR_EVIDENCE_CHANGED' THEN RAISE; END IF; END;
 p:=p||jsonb_build_object('currentCatalogHash',repeat('d',64));
 IF metadata.fn_succeed_publication_recovery(next_id,prior,p,'Successor integration fixture',expiry)<>next_id THEN RAISE EXCEPTION 'successor failed'; END IF;
 IF metadata.fn_succeed_publication_recovery(next_id,prior,p,'Successor integration fixture',expiry)<>next_id THEN RAISE EXCEPTION 'idempotence failed'; END IF;
 BEGIN
  PERFORM metadata.fn_succeed_publication_recovery(shared.uuidv7(),prior,p,'Successor integration fixture',expiry);
  RAISE EXCEPTION 'expected fork denial';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RECOVERY_SUCCESSOR_EXISTS' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM metadata.publication_recovery_archive a WHERE source_release_id='33333333-2222-4222-8222-222222222222' AND NOT EXISTS(SELECT 1 FROM metadata.publication_recovery_archive s WHERE s.supersedes_id=a.id))<>1 THEN RAISE EXCEPTION 'terminal permit ambiguous'; END IF;
 IF NOT EXISTS(SELECT 1 FROM metadata.publication_recovery_revocation WHERE archive_id=prior) THEN RAISE EXCEPTION 'revocation lost'; END IF;
END $$;
SET SESSION AUTHORIZATION athyper_runtime;
DO $$ BEGIN
 IF has_function_privilege(current_user,'metadata.fn_succeed_publication_recovery(uuid,uuid,jsonb,text,timestamp with time zone)','EXECUTE') THEN RAISE EXCEPTION 'runtime can issue successor'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
