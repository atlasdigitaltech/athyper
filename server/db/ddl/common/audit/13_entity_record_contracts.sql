-- seed-contract-version: 1
-- seed-pack: common.audit.entity-record-contracts
-- seed-pack-version: 1.0.0
-- seed-dataset: master.audit-event-contract
-- seed-data-class: production_reference
-- seed-provenance: {"source":"shared-entity-framework","publisher":"Athyper","source_version":"1","retrieved_at":"2026-09-30","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: master.audit_event_contract(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:6
-- seed-assertions: expected-count,uniqueness,semantic
-- seed-demo-data: false

-- RecordExecution appends these events in the same transaction as the record.
-- Separate contracts retain exact event/operation pairing. No record values are
-- captured, and this catalogue change grants no record or publication authority.
DO $entity_record_contracts$
DECLARE item record; contract_code text; pattern text;
BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Entity record audit contracts require an exact plane';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('created','create'),('patched','update'),('deleted','delete'),
    ('transitioned','execute'),('aggregate_mutated','execute'),('domain_mutated','execute')
  ) AS events(suffix,operation)
  LOOP
    contract_code := 'records_record_' || item.suffix;
    pattern := '^records[.]record[.]' || item.suffix || '$';
    INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,
      default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,
      max_payload_bytes,schema_version,metadata,status)
    VALUES(contract_code,pattern,24,ARRAY[item.operation]::audit.operation_d[],
      'info',ARRAY['user','service_account','system']::audit.actor_type_d[],'tenant',false,'metadata',
      16384,1,'{"owner":"records","purpose":"entity_record_mutation","rawValuesExcluded":true}'::jsonb,'active')
    ON CONFLICT(code) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM master.audit_event_contract WHERE code=contract_code
      AND event_code_pattern=pattern AND priority=24
      AND allowed_operations=ARRAY[item.operation]::audit.operation_d[]
      AND default_severity='info' AND allowed_actor_types=ARRAY['user','service_account','system']::audit.actor_type_d[]
      AND allowed_scope='tenant' AND NOT reason_required AND capture_mode='metadata'
      AND max_payload_bytes=16384 AND schema_version=1
      AND metadata='{"owner":"records","purpose":"entity_record_mutation","rawValuesExcluded":true}'::jsonb
      AND status='active') THEN
      RAISE EXCEPTION 'Entity record audit contract drift: %',contract_code;
    END IF;
  END LOOP;
END $entity_record_contracts$;
