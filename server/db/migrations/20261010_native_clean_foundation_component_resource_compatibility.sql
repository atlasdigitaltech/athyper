BEGIN;
SET LOCAL lock_timeout='5s';
-- The clean-foundation live-read bridge intentionally reinstalls the reviewed
-- resource protocol. Its predecessor did not include the separate UI-component
-- extension, even when the older extension receipt was retained across a local
-- reset. Re-extend the exact verified protocol; no resource, grant or catalogue
-- row is created here.
DO $$
DECLARE r record; body text;
 old_list text := $list$'entity_authoring_descriptor','entity_identity_review','entity_security_manifest','entity_storage_authority'$list$;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('publication.approve_authoring_resource(uuid,text)','e957aa5f788c53835b935c0273ad90f4'),
 ('publication.guard_authoring_resource_source()','8a8f588f9c05574d98d627e68bacd518'),
 ('publication.propose_authoring_resource(jsonb,text)','e17b2558e907aa7d69b53d459349afd1'),
 ('publication.read_authoring_resource(uuid)','bacaea34d899a26d56755ff4198c6a29'),
 ('publication.read_authoring_resource_review(uuid)','ccc09e75f50d9aceddd5ecacfc2e25a5'),
 ('runtime_meta.fn_verify_release(uuid,text,jsonb)','60bdc6f7d5011a2540cea37eede95f1d')
 ) AS source(signature,expected_hash) LOOP
  body := pg_get_functiondef(r.signature::regprocedure);
  IF md5(body)<>r.expected_hash OR position(old_list IN body)=0 THEN
   RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_COMPONENT_RESOURCE_PREDECESSOR_CHANGED: %',r.signature;
  END IF;
  EXECUTE replace(body,old_list,old_list || ',''entity_ui_component''');
 END LOOP;
END $$;
COMMIT;
