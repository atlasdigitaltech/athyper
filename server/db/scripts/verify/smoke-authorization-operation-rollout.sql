DO $$
DECLARE b record; rejected_id uuid;
BEGIN
  IF to_regclass('ops.authorization_operation_rollout') IS NULL
     OR to_regclass('ops.authorization_parity_certification') IS NULL THEN
    RAISE EXCEPTION 'P5-E6 rollout tables are missing';
  END IF;
  SELECT plane_code,entity_code,source_entity_operation_id,source_release_hash,
         source_compiled_hash AS source_artifact_hash INTO b
    FROM authz.entity_operation_binding WHERE status='published' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P5-E6 pilot binding is missing'; END IF;
  SELECT ops.certify_authorization_operation_parity(b.plane_code,b.entity_code,
    b.source_entity_operation_id,b.source_release_hash,b.source_artifact_hash,
    '00000000-0000-0000-0000-000000000000'::uuid) INTO rejected_id;
  IF NOT EXISTS (SELECT 1 FROM ops.authorization_parity_certification
    WHERE id=rejected_id AND status='rejected' AND sample_count < 1000) THEN
    RAISE EXCEPTION 'P5-E6 sub-threshold evidence was not rejected';
  END IF;
  BEGIN
    PERFORM ops.set_authorization_operation_rollout(b.plane_code,b.entity_code,
      b.source_entity_operation_id,b.source_release_hash,b.source_artifact_hash,
      'active','00000000-0000-0000-0000-000000000000'::uuid,
      'negative activation smoke',NULL);
    RAISE EXCEPTION 'P5-E6 unsafe activation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%qualified_certification_required%' THEN RAISE; END IF;
  END;
  PERFORM ops.set_authorization_operation_rollout(b.plane_code,b.entity_code,
    b.source_entity_operation_id,b.source_release_hash,b.source_artifact_hash,
    'shadow','00000000-0000-0000-0000-000000000000'::uuid,
    'P5-E5 qualification observation',NULL);
  IF NOT EXISTS (SELECT 1 FROM ops.authorization_operation_rollout
    WHERE plane_code=b.plane_code AND source_entity_operation_id=b.source_entity_operation_id AND mode='shadow') THEN
    RAISE EXCEPTION 'P5-E6 shadow transition was not persisted';
  END IF;
END $$;
