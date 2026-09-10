BEGIN;
SET LOCAL ROLE athyperapp;
SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true),
       set_config('app.current_principal_id','22222222-2222-4222-8222-222222222222',true);
DO $qualification$
DECLARE
 tenant uuid := '11111111-1111-4111-8111-111111111111';
 actor uuid := '22222222-2222-4222-8222-222222222222';
 entity uuid := gen_random_uuid();
 module uuid;
 change_set uuid;
 revision uuid;
 release uuid;
 first_release uuid;
 head uuid;
 n integer;
BEGIN
 SELECT id INTO STRICT module FROM control.module WHERE code='fnd' AND status='active';
 INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,created_by)
 VALUES(entity,tenant,module,'ci_release_'||replace(entity::text,'-',''),'business','tenant',actor);
 FOR n IN 1..3 LOOP
  change_set := gen_random_uuid(); revision := gen_random_uuid(); release := gen_random_uuid();
  INSERT INTO metadata.entity_change_set(id,tenant_id,entity_id,change_set_code,title,base_release_id,created_by)
  VALUES(change_set,tenant,entity,'ci_release_'||n,'CI release qualification',head,actor);
  INSERT INTO snapshot.entity_contract_revision(id,tenant_id,entity_id,change_set_id,revision_no,base_release_id,contract_schema_code,contract_schema_version,contract_json,validation_status,captured_by)
  VALUES(revision,tenant,entity,change_set,1,head,'athyper.entity-contract','1.0.0',jsonb_build_object('fixtureVersion',CASE WHEN n=2 THEN 2 ELSE 1 END),'valid',actor);
  BEGIN
   INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,supersedes_release_id,target_planes,published_by)
   VALUES(release,tenant,entity,change_set,revision,n,head,ARRAY['neon'],actor);
   RAISE EXCEPTION 'Unapproved release was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  UPDATE metadata.entity_change_set SET status='in_review' WHERE id=change_set;
  UPDATE metadata.entity_change_set SET status='approved' WHERE id=change_set;
  BEGIN
   UPDATE metadata.entity_change_set SET title='mutated approved contract' WHERE id=change_set;
   RAISE EXCEPTION 'Approved change set was mutable';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  IF n>1 THEN
   BEGIN
    INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,supersedes_release_id,target_planes,published_by)
    VALUES(release,tenant,entity,change_set,revision,n+1,head,ARRAY['neon'],actor);
    RAISE EXCEPTION 'Nonconsecutive release was accepted';
   EXCEPTION WHEN serialization_failure THEN NULL;
   END;
  END IF;
  INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,supersedes_release_id,release_kind,rollback_of_release_id,target_planes,published_by)
  VALUES(release,tenant,entity,change_set,revision,n,head,CASE WHEN n=3 THEN 'rollback' ELSE 'publish' END,CASE WHEN n=3 THEN first_release END,ARRAY['neon'],actor);
  IF n=1 THEN first_release:=release; END IF;
  head:=release;
  IF (SELECT status FROM metadata.entity_change_set WHERE id=change_set)<>'published' THEN RAISE EXCEPTION 'Release did not seal its change set'; END IF;
  BEGIN
   UPDATE metadata.entity_release SET publication_reason='emergency mutation' WHERE id=release;
   RAISE EXCEPTION 'Application role mutated release';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
   DELETE FROM metadata.entity_release WHERE id=release;
   RAISE EXCEPTION 'Application role deleted release';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 IF (SELECT count(*) FROM metadata.entity_release WHERE entity_id=entity)<>3 THEN RAISE EXCEPTION 'Expected publish, successor and rollback evidence'; END IF;
 IF (SELECT contract_hash FROM metadata.entity_release WHERE id=head) IS DISTINCT FROM (SELECT contract_hash FROM metadata.entity_release WHERE id=first_release) THEN RAISE EXCEPTION 'Rollback did not reproduce original contract'; END IF;
END $qualification$;
RESET ROLE;
-- A privileged writer still cannot bypass the append-only trigger.
DO $immutable$
DECLARE selected uuid;
BEGIN
 SELECT id INTO STRICT selected FROM metadata.entity_release WHERE entity_id IN (SELECT id FROM metadata.entity WHERE entity_code LIKE 'ci_release_%') ORDER BY release_no LIMIT 1;
 BEGIN
  UPDATE metadata.entity_release SET publication_reason='emergency mutation' WHERE id=selected;
  RAISE EXCEPTION 'Privileged mutation bypassed immutable release guard';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  DELETE FROM metadata.entity_release WHERE id=selected;
  RAISE EXCEPTION 'Privileged deletion bypassed immutable release guard';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $immutable$;
ROLLBACK;
