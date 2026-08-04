-- seed-pack-version: p5-e2-v1
-- Source authorization recipes are Admin metadata. Consumer authz rows are
-- emitted only from immutable release artifacts and are never seeded here.
DO $business_partner_scope$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
    v_entity_id uuid := pg_temp.meta_entity_seed_id('entity:business_partner');
    v_lock bigint;
    v_operation record;
BEGIN
    IF EXISTS (
        SELECT 1 FROM metadata.entity_operation_scope_binding
         WHERE change_set_id = v_change_set_id
    ) THEN
        RETURN;
    END IF;
    SELECT lock_version INTO v_lock FROM metadata.entity_change_set
     WHERE id = v_change_set_id AND status = 'draft';
    IF v_lock IS NULL THEN
        RAISE EXCEPTION '[P5-E2] editable Business Partner draft is missing';
    END IF;
    PERFORM metadata.fn_advance_entity_change_set(v_change_set_id, v_lock, v_actor);
    UPDATE metadata.entity_operation
       SET permission_code = 'neon.business_partner.' || operation_key,
           updated_by = v_actor
     WHERE change_set_id = v_change_set_id
       AND operation_key IN ('create', 'update', 'activate', 'deactivate');

    FOR v_operation IN
        SELECT id, operation_key FROM metadata.entity_operation
         WHERE change_set_id = v_change_set_id AND status = 'active'
         ORDER BY operation_key
    LOOP
        INSERT INTO metadata.entity_operation_scope_binding (
            id, tenant_id, entity_id, change_set_id, entity_operation_id,
            binding_key, target_plane, decision_mode, scope_kind,
            coordinate_source, coordinate_key, resolver_key,
            missing_value_behavior, created_by
        ) VALUES (
            pg_temp.meta_entity_seed_id('operation-scope:business_partner:p2_7_studio_draft:' || v_operation.operation_key || ':neon:tenant'),
            NULL, v_entity_id, v_change_set_id, v_operation.id,
            v_operation.operation_key || '.neon.tenant', 'neon', 'entity_resource',
            'tenant', 'tenant_context', NULL, NULL, 'deny', v_actor
        );
    END LOOP;
END
$business_partner_scope$;

SELECT pg_temp.seed_meta_entity_graph(
    'document_envelope',
    'process',
    jsonb_build_object(
        'schema_version', '2.0',
        'runtime_profile', jsonb_build_object(
            'profile_key', 'default', 'backing_kind', 'table',
            'storage_plane', 'mesh', 'storage_schema', 'mesh',
            'storage_object', 'document_envelope', 'api_exposure', 'api',
            'read_mode', 'generic', 'write_mode', 'facade',
            'read_handler_key', NULL, 'write_handler_key', 'mesh.document_envelope',
            'create_mode', 'direct', 'concurrency_mode', 'none',
            'record_version_field_key', NULL, 'tenant_field_key', 'sender_tenant_id',
            'soft_delete_field_key', NULL, 'draft_ttl_hours', NULL
        ),
        'fields', $json$[
          {"field_key":"id","description":"Stable envelope identifier.","data_type":"uuid","type_config":{"kind":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"id","default_spec":{"kind":"resolver","resolver_key":"shared.uuidv7","apply_on":["create"]},"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"envelope_code","description":"Globally unique exchange envelope code.","data_type":"string","type_config":{"kind":"string","max_length":127},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"envelope_code","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"network_relationship_id","description":"Relationship authorizing the exchange.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"network_relationship_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"document_type_id","description":"Published document type coordinate.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"document_type_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"document_direction","description":"Inbound or outbound exchange direction.","data_type":"enum","type_config":{"kind":"enum","domain_code":"mesh.document_direction_d"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"document_direction","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"sender_tenant_id","description":"Sender tenant boundary.","data_type":"uuid","type_config":{"kind":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"sender_tenant_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"sender_account_id","description":"Sender Mesh network account.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"sender_account_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"receiver_tenant_id","description":"Receiver tenant boundary.","data_type":"uuid","type_config":{"kind":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"receiver_tenant_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"receiver_account_id","description":"Receiver Mesh network account.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"receiver_account_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"entity_id","description":"Published Meta Entity coordinate.","data_type":"uuid","type_config":{"kind":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"entity_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"entity_version_id","description":"Frozen Entity release/version coordinate.","data_type":"uuid","type_config":{"kind":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"entity_version_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"entity_contract_hash","description":"Frozen Entity contract hash.","data_type":"string","type_config":{"kind":"string","min_length":64,"max_length":64,"pattern":"^[a-f0-9]{64}$"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"entity_contract_hash","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"business_key","description":"Optional sender business key.","data_type":"string","type_config":{"kind":"string","max_length":512},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"write_once","storage_path":"business_key","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"correlation_id","description":"Cross-service correlation coordinate.","data_type":"string","type_config":{"kind":"string","max_length":256},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"write_once","storage_path":"correlation_id","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"idempotency_key","description":"Sender-scoped idempotency coordinate.","data_type":"string","type_config":{"kind":"string","max_length":512},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"idempotency_key","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"status","description":"Envelope processing state.","data_type":"enum","type_config":{"kind":"enum","domain_code":"mesh.document_envelope_status_d"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"status","default_spec":{"kind":"static","value":"received","apply_on":["create"]},"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"status_changed_at","description":"Last status transition time.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"status_changed_at","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"status_changed_by","description":"Last status transition principal.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"status_changed_by","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"received_at","description":"Mesh receipt timestamp.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"received_at","default_spec":{"kind":"current_time","apply_on":["create"]},"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"processed_at","description":"Terminal processing timestamp.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"processed_at","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"metadata","description":"Non-authoritative exchange metadata.","data_type":"json","type_config":{"kind":"json","schema_code":"athyper.integration-metadata.v1"},"cardinality":"one","value_origin":"stored","write_mode":"mutable","storage_path":"metadata","default_spec":{"kind":"static","value":{},"apply_on":["create"]},"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"created_at","description":"Creation timestamp.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"created_at","default_spec":{"kind":"current_time","apply_on":["create"]},"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"created_by","description":"Creating principal.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"one","value_origin":"stored","write_mode":"write_once","storage_path":"created_by","default_spec":{"kind":"principal","apply_on":["create"]},"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"updated_at","description":"Last update timestamp.","data_type":"datetime","type_config":{"kind":"datetime","timezone_mode":"utc"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"updated_at","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"},
          {"field_key":"updated_by","description":"Last update principal.","data_type":"reference","type_config":{"kind":"reference","identifier_type":"uuid"},"cardinality":"zero_or_one","value_origin":"stored","write_mode":"read_only","storage_path":"updated_by","default_spec":null,"computation_spec":null,"validation_spec":null,"status":"active"}
        ]$json$::jsonb,
        'keys', $json$[
          {"key_key":"document_envelope_pk","key_kind":"primary","uniqueness_scope":"global","null_semantics":"not_allowed","status":"active","fields":[{"field_key":"id","position":1}]},
          {"key_key":"document_envelope_code","key_kind":"natural","uniqueness_scope":"global","null_semantics":"not_allowed","status":"active","fields":[{"field_key":"envelope_code","position":1}]},
          {"key_key":"document_envelope_idempotency","key_kind":"idempotency","uniqueness_scope":"global","null_semantics":"not_allowed","status":"active","fields":[{"field_key":"sender_tenant_id","position":1},{"field_key":"sender_account_id","position":2},{"field_key":"idempotency_key","position":3}]}
        ]$json$::jsonb,
        'search_profiles', $json$[
          {"search_key":"document_envelope_lookup","search_kind":"keyword","query_operator":"or","minimum_query_length":2,"language_code":null,"normalization_mode":"casefold","is_default":true,"status":"active","fields":[{"field_key":"envelope_code","position":1,"match_mode":"prefix","weight":10},{"field_key":"business_key","position":2,"match_mode":"contains","weight":7},{"field_key":"correlation_id","position":3,"match_mode":"exact","weight":6}]}
        ]$json$::jsonb,
        'relations', '[]'::jsonb
    ),
    'p5_e2_initial',
    false
);

DO $document_envelope_operations$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_entity_id uuid := pg_temp.meta_entity_seed_id('entity:document_envelope');
    v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:document_envelope:p5_e2_initial');
    v_operation record;
BEGIN
    IF EXISTS (SELECT 1 FROM metadata.entity_operation WHERE change_set_id=v_change_set_id) THEN RETURN; END IF;
    INSERT INTO metadata.entity_operation (
        id,tenant_id,entity_id,change_set_id,operation_key,operation_kind,label,
        description,handler_key,permission_code,execution_mode,idempotency_mode,
        requires_mfa,audit_event_code,created_by
    ) VALUES
      (pg_temp.meta_entity_seed_id('operation:document_envelope:p5_e2_initial:read'),NULL,v_entity_id,v_change_set_id,'read','read','Read envelope','Reads an envelope visible to a participating account.','mesh.document_envelope.read','mesh.document_envelope.read','synchronous','none',false,'mesh.document_envelope.read',v_actor),
      (pg_temp.meta_entity_seed_id('operation:document_envelope:p5_e2_initial:publish'),NULL,v_entity_id,v_change_set_id,'publish','create','Publish envelope','Publishes an immutable exchange envelope.','mesh.document_envelope.publish','mesh.document_envelope.publish','synchronous','required',false,'mesh.document_envelope.published',v_actor),
      (pg_temp.meta_entity_seed_id('operation:document_envelope:p5_e2_initial:acknowledge'),NULL,v_entity_id,v_change_set_id,'acknowledge','execute','Acknowledge envelope','Records a receiver acknowledgement.','mesh.document_envelope.acknowledge','mesh.document_envelope.acknowledge','synchronous','required',false,'mesh.document_envelope.acknowledged',v_actor),
      (pg_temp.meta_entity_seed_id('operation:document_envelope:p5_e2_initial:replay'),NULL,v_entity_id,v_change_set_id,'replay','execute','Replay envelope','Requests replay through the delivery runtime.','mesh.document_envelope.replay','mesh.document_envelope.replay','asynchronous','required',true,'mesh.document_envelope.replay_requested',v_actor);

    FOR v_operation IN SELECT id,operation_key FROM metadata.entity_operation WHERE change_set_id=v_change_set_id LOOP
      INSERT INTO metadata.entity_operation_scope_binding (
        id,tenant_id,entity_id,change_set_id,entity_operation_id,binding_key,target_plane,
        decision_mode,scope_kind,coordinate_source,coordinate_key,resolver_key,
        missing_value_behavior,created_by
      ) VALUES (
        pg_temp.meta_entity_seed_id('operation-scope:document_envelope:p5_e2_initial:'||v_operation.operation_key||':mesh:network_account'),
        NULL,v_entity_id,v_change_set_id,v_operation.id,v_operation.operation_key||'.mesh.network_account',
        'mesh','entity_resource','network_account',
        CASE WHEN v_operation.operation_key='publish' THEN 'request_field'
             WHEN v_operation.operation_key='acknowledge' THEN 'request_field'
             ELSE 'relation_resolver' END,
        CASE WHEN v_operation.operation_key='publish' THEN 'sender_account_id'
             WHEN v_operation.operation_key='acknowledge' THEN 'responder_account_id'
             ELSE NULL END,
        CASE WHEN v_operation.operation_key IN ('read','replay') THEN 'mesh.document_envelope.actor_account' ELSE NULL END,
        'deny',v_actor
      );
    END LOOP;
END
$document_envelope_operations$;
