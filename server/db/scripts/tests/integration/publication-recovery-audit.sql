\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),
 set_config('app.current_principal_id','e545079f-4992-4f2e-bc92-8038a8dd9a22',true),
 set_config('app.current_actor_type','service_account',true);
DO $$ DECLARE event_id uuid; BEGIN
 event_id:=audit.append_event('metadata.publication_recovery.activation_authorized','execute','publication');
 IF NOT EXISTS(SELECT 1 FROM audit.audit_log WHERE id=event_id AND severity='critical'
 AND event_contract_code='metadata_publication_recovery' AND actor_type='service_account')
 THEN RAISE EXCEPTION 'recovery audit contract mismatch'; END IF;
 PERFORM set_config('app.current_actor_type','user',true);
 BEGIN
  PERFORM audit.append_event('metadata.publication_recovery.activation_authorized','execute','publication');
  RAISE EXCEPTION 'human recovery audit accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'Actor type user is not allowed by audit contract metadata_publication_recovery' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;
