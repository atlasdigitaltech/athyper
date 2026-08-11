\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.database_plane','neon',true);

DO $projection_smoke$
DECLARE
  v_release_one runtime_meta.applied_release;
  v_release_two runtime_meta.applied_release;
  v_active record;
  v_projection jsonb;
BEGIN
  v_projection := jsonb_build_object(
    'contract',jsonb_build_object(
      'id','019fc300-0000-7000-8000-000000000101','tenant_id',NULL,
      'entity_id','019fc300-0000-7000-8000-000000000001','entity_code','projection_smoke',
      'release_id','019fc300-0000-7000-8000-000000000011','revision_id','019fc300-0000-7000-8000-000000000021',
      'release_no',1,'contract_schema_code','athyper.meta_entity','contract_schema_version','5.3',
      'contract_hash',repeat('a',64),'contract_json',jsonb_build_object('release',1),
      'publication_key','metadata.entity.projection_smoke','signature_algorithm','EdDSA',
      'signing_key_id','smoke-key','signature','smoke-signature','published_at','2026-01-01T00:00:00Z'
    ),
    'descriptor',jsonb_build_object(
      'id','019fc300-0000-7000-8000-000000000201','plane_code','neon','descriptor_kind','entity_runtime',
      'descriptor_schema_version','1.1','source_contract_hash',repeat('a',64),'compiled_hash',repeat('b',64),
      'compiled_json',jsonb_build_object('release',1),'compiler_version','projection-smoke/1',
      'compatibility_level','backward_compatible','generated_at','2026-01-01T00:00:00Z'
    )
  );
  SELECT * INTO v_release_one FROM runtime_meta.fn_stage_release_projection(
    'metadata.entity.projection_smoke','019fc300-0000-7000-8000-000000000011',1,
    '019fc300-0000-7000-8000-000000000031',repeat('1',64),'{}'::jsonb,v_projection
  );
  PERFORM runtime_meta.fn_verify_release(v_release_one.id,repeat('1',64),
    '{"signature_verified":true,"manifest_valid":true,"runtime_compatible":true}'::jsonb);
  PERFORM runtime_meta.fn_activate_release(v_release_one.id,'{"smoke":"first"}'::jsonb);
  -- A delivery retry after local activation must remain idempotent so central
  -- acknowledgement can recover without restaging mutable projection content.
  PERFORM runtime_meta.fn_stage_release_projection(
    'metadata.entity.projection_smoke','019fc300-0000-7000-8000-000000000011',1,
    '019fc300-0000-7000-8000-000000000031',repeat('1',64),'{}'::jsonb,v_projection
  );

  v_projection := jsonb_set(v_projection,'{contract,id}','"019fc300-0000-7000-8000-000000000102"');
  v_projection := jsonb_set(v_projection,'{contract,release_id}','"019fc300-0000-7000-8000-000000000012"');
  v_projection := jsonb_set(v_projection,'{contract,revision_id}','"019fc300-0000-7000-8000-000000000022"');
  v_projection := jsonb_set(v_projection,'{contract,release_no}','2');
  v_projection := jsonb_set(v_projection,'{contract,contract_hash}',to_jsonb(repeat('c',64)));
  v_projection := jsonb_set(v_projection,'{contract,contract_json}','{"release":2}');
  v_projection := jsonb_set(v_projection,'{descriptor,id}','"019fc300-0000-7000-8000-000000000202"');
  v_projection := jsonb_set(v_projection,'{descriptor,source_contract_hash}',to_jsonb(repeat('c',64)));
  v_projection := jsonb_set(v_projection,'{descriptor,compiled_hash}',to_jsonb(repeat('d',64)));
  v_projection := jsonb_set(v_projection,'{descriptor,compiled_json}','{"release":2}');
  SELECT * INTO v_release_two FROM runtime_meta.fn_stage_release_projection(
    'metadata.entity.projection_smoke','019fc300-0000-7000-8000-000000000012',2,
    '019fc300-0000-7000-8000-000000000032',repeat('2',64),'{}'::jsonb,v_projection
  );
  PERFORM runtime_meta.fn_verify_release(v_release_two.id,repeat('2',64),
    '{"signature_verified":true,"manifest_valid":true,"runtime_compatible":true}'::jsonb);
  PERFORM runtime_meta.fn_activate_release(v_release_two.id,'{"smoke":"successor"}'::jsonb);

  PERFORM runtime_meta.fn_rollback_release(
    'metadata.entity.projection_smoke',v_release_one.id,'{"reason":"smoke_rollback"}'::jsonb
  );
  SELECT * INTO v_active FROM runtime_meta.fn_active_entity_descriptor(
    'metadata.entity.projection_smoke','entity_runtime'
  );
  IF v_active.release_no <> 1 OR v_active.compiled_hash <> repeat('b',64) THEN
    RAISE EXCEPTION 'Offline active descriptor did not follow atomic rollback';
  END IF;

  BEGIN
    UPDATE runtime_meta.entity_contract SET contract_json='{"tampered":true}'::jsonb
     WHERE id=v_active.entity_contract_id;
    RAISE EXCEPTION 'Entity contract immutability guard did not reject mutation';
  EXCEPTION WHEN integrity_constraint_violation THEN
    NULL;
  END;
END;
$projection_smoke$;

ROLLBACK;
\echo 'RUNTIME_ENTITY_PROJECTION_SMOKE_OK activation=atomic rollback=atomic offline=local immutability=guarded'
