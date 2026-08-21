\set ON_ERROR_STOP on
SET app.database_plane = 'studio';
SET app.current_principal_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by)
VALUES('10000000-0000-4000-8000-000000000001','publication_test','Publication Test','Publication Test','publication_test','active','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by)
VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','metadata.entity.invoice',1,'publish','preparing','backward_compatible',repeat('a',64),repeat('b',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO publication.artifact(id,publication_release_id,plane_code,artifact_kind,artifact_uri,content_hash,status,created_by)
VALUES('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','neon','entity_runtime','s3://publication/test',repeat('c',64),'compiled','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

DO $$ BEGIN
  BEGIN
    PERFORM publication.fn_transition_artifact('30000000-0000-4000-8000-000000000001','signed','Ed25519','key-1','signature');
    RAISE EXCEPTION 'expected signing-before-validation rejection';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;

SELECT publication.fn_transition_artifact('30000000-0000-4000-8000-000000000001','validated');
SELECT publication.fn_transition_artifact('30000000-0000-4000-8000-000000000001','signed','Ed25519','key-1','signature');
SELECT publication.fn_transition_release('20000000-0000-4000-8000-000000000001','approved','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT publication.fn_transition_release('20000000-0000-4000-8000-000000000001','published','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT publication.fn_transition_release('20000000-0000-4000-8000-000000000001','published','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

SELECT publication.fn_create_deployment('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','neon','test','neon-1',1,'50000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT publication.fn_create_deployment('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','neon','test','neon-1',1,'50000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

DO $$ DECLARE v_id uuid; v_status text; BEGIN
  SELECT id INTO STRICT v_id FROM publication.deployment WHERE command_id='40000000-0000-4000-8000-000000000001';
  FOREACH v_status IN ARRAY ARRAY['dispatched','received','staged','verified','activated'] LOOP
    PERFORM publication.fn_transition_deployment(v_id,v_status::publication.deployment_status_d,'{}');
    PERFORM publication.fn_transition_deployment(v_id,v_status::publication.deployment_status_d,'{}');
  END LOOP;
  PERFORM publication.fn_acknowledge_activation(v_id,'neon-1',repeat('c',64),'60000000-0000-4000-8000-000000000001','{}');
  PERFORM publication.fn_acknowledge_activation(v_id,'neon-1',repeat('c',64),'60000000-0000-4000-8000-000000000001','{}');
  BEGIN
    PERFORM publication.fn_acknowledge_activation(v_id,'neon-1',repeat('c',64),'60000000-0000-4000-8000-000000000002','{}');
    RAISE EXCEPTION 'expected acknowledgement conflict';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE publication.deployment_acknowledgement SET evidence='{"mutated":true}' WHERE deployment_id=v_id;
    RAISE EXCEPTION 'expected acknowledgement immutability guard';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
END $$;

DO $$
DECLARE v_deployment_id uuid;
BEGIN
  SELECT id INTO STRICT v_deployment_id FROM publication.deployment WHERE command_id='40000000-0000-4000-8000-000000000001';
  IF (SELECT count(*) FROM publication.deployment WHERE command_id='40000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'duplicate deployment'; END IF;
  IF (SELECT count(*) FROM publication.deployment_event WHERE deployment_id=v_deployment_id)<>6 THEN RAISE EXCEPTION 'duplicate deployment events'; END IF;
  IF (SELECT count(*) FROM publication.deployment_acknowledgement WHERE deployment_id=v_deployment_id)<>1 THEN RAISE EXCEPTION 'mutable or duplicate acknowledgement'; END IF;
  IF (SELECT count(*) FROM event.outbox WHERE topic='publication.release.published')<>1 THEN RAISE EXCEPTION 'release outbox mismatch'; END IF;
  IF (SELECT count(*) FROM event.outbox WHERE topic='publication.deployment.requested')<>1 THEN RAISE EXCEPTION 'deployment outbox mismatch'; END IF;
  IF (SELECT count(*) FROM event.outbox WHERE topic IN (
    'publication.deployment.dispatched','publication.deployment.received','publication.deployment.staged',
    'publication.deployment.verified','publication.deployment.activated'
  ))<>5 THEN RAISE EXCEPTION 'deployment transition outbox mismatch'; END IF;
  IF (SELECT count(DISTINCT event_key) FROM event.outbox WHERE topic LIKE 'publication.deployment.%')<>7 THEN
    RAISE EXCEPTION 'deployment outbox keys are not deterministic';
  END IF;
  IF (SELECT count(*) FROM event.outbox WHERE topic='publication.deployment.acknowledged')<>1 THEN RAISE EXCEPTION 'ack outbox mismatch'; END IF;
END $$;

SELECT 'PUBLICATION_AUTHORITY_INTEGRATION_OK' AS result;
