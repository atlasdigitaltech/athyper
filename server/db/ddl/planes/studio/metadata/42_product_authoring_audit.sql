-- seed-contract-version: 1
-- seed-pack: studio.metadata.product-authoring-audit
-- seed-pack-version: 1.0.0
-- seed-dataset: master.audit-event-contract
-- seed-data-class: production_reference
-- seed-provenance: {"source":"shared-entity-framework","publisher":"Athyper","source_version":"1","retrieved_at":"2026-10-08","license":"internal"}
-- seed-plane: studio
-- seed-tenant-scope: none
-- seed-natural-key: master.audit_event_contract(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:2
-- seed-assertions: expected-count,uniqueness,semantic
-- seed-demo-data: false

-- Exact shared product-authoring audit vocabulary. No human grants or approvals.
DO $product_authoring_audit$
DECLARE suffix text; contract_code text; pattern text;
BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'STUDIO_REQUIRED'; END IF;
 FOREACH suffix IN ARRAY ARRAY['enrollment','review'] LOOP
  contract_code:='metadata_product_'||suffix;
  pattern:='^metadata[.]entity[.]product[.]'||suffix||'$';
  INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,
    default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,
    max_payload_bytes,schema_version,metadata,status)
  VALUES(contract_code,pattern,24,ARRAY['execute']::audit.operation_d[],
    'critical',ARRAY['user']::audit.actor_type_d[],'tenant',false,'metadata',
    16384,1,'{"owner":"entity-authoring","rawValuesExcluded":true}'::jsonb,'active')
  ON CONFLICT(code) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM master.audit_event_contract WHERE code=contract_code
    AND event_code_pattern=pattern AND priority=24 AND allowed_operations=ARRAY['execute']::audit.operation_d[]
    AND default_severity='critical' AND allowed_actor_types=ARRAY['user']::audit.actor_type_d[]
    AND allowed_scope='tenant' AND NOT reason_required AND capture_mode='metadata'
    AND max_payload_bytes=16384 AND schema_version=1
    AND metadata='{"owner":"entity-authoring","rawValuesExcluded":true}'::jsonb AND status='active') THEN
    RAISE EXCEPTION 'PRODUCT_AUTHORING_AUDIT_CONTRACT_DRIFT: %',contract_code;
  END IF;
 END LOOP;
END $product_authoring_audit$;
