BEGIN;
SET LOCAL lock_timeout = '5s';
-- Retain signed source identities while allowing successive releases to coexist.
CREATE OR REPLACE FUNCTION authz.fn_stage_entity_operation_projection(
    p_applied_release_id uuid,p_tenant_id uuid,p_plane_code text,p_source_release_id uuid,
    p_source_compiled_hash text,p_compiled_json jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz,runtime_meta AS $$
DECLARE v_bindings jsonb:=COALESCE(p_compiled_json->'operation_scope_bindings','[]'::jsonb);
DECLARE v_source_entity_id uuid:=NULLIF(p_compiled_json#>>'{source,entity_id}','')::uuid;
DECLARE v_release_hash text:=p_compiled_json#>>'{source,release_hash}';
DECLARE v_actor uuid:=COALESCE(NULLIF(current_setting('app.current_principal_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid);
DECLARE v_expected integer; DECLARE v_actual integer;
BEGIN
    IF jsonb_typeof(v_bindings)<>'array' THEN RAISE EXCEPTION 'OPERATION_BINDINGS_SHAPE_INVALID' USING ERRCODE='check_violation'; END IF;
    IF jsonb_array_length(v_bindings)=0 THEN RETURN 0; END IF;
    IF v_source_entity_id IS NULL OR v_release_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OPERATION_BINDINGS_SOURCE_INVALID' USING ERRCODE='check_violation'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      WHERE item->>'permissionCode' LIKE 'legacy.%'
         OR array_length(string_to_array(item->>'permissionCode','.'),1)<>4
         OR split_part(item->>'permissionCode','.',1)<>lower(p_plane_code)
         OR split_part(item->>'permissionCode','.',2)='action'
         OR split_part(item->>'permissionCode','.',3)='action'
         OR COALESCE(item->>'permissionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item->>'bindingId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item->>'scopeBindingId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'OPERATION_BINDING_CANONICAL_PERMISSION_REQUIRED' USING ERRCODE='check_violation';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      GROUP BY item->>'sourceEntityOperationId'
      HAVING count(DISTINCT (item->>'permissionId',item->>'permissionCode'))<>1) THEN
      RAISE EXCEPTION 'OPERATION_BINDING_PERMISSION_AMBIGUOUS' USING ERRCODE='check_violation';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      GROUP BY item->>'sourceEntityOperationId',item->>'scopeKind' HAVING count(*)<>1) THEN
      RAISE EXCEPTION 'OPERATION_SCOPE_COORDINATE_AMBIGUOUS' USING ERRCODE='check_violation';
    END IF;
    SELECT count(DISTINCT item->>'sourceEntityOperationId') INTO v_expected FROM jsonb_array_elements(v_bindings) item;
    SELECT count(*) INTO v_actual FROM authz.entity_operation_binding WHERE applied_release_id=p_applied_release_id;
    IF v_actual>0 THEN
      IF v_actual=v_expected AND (SELECT count(*) FROM authz.entity_operation_scope_binding s
          JOIN authz.entity_operation_binding b ON b.id=s.entity_operation_binding_id
          WHERE b.applied_release_id=p_applied_release_id)=jsonb_array_length(v_bindings) THEN
        RETURN v_actual;
      END IF;
      RAISE EXCEPTION 'OPERATION_PROJECTION_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      LEFT JOIN authz.permission p ON p.canonical_code=item->>'permissionCode' AND p.status='published'
        AND p.id=(item->>'permissionId')::uuid
      WHERE p.id IS NULL OR p.permission_kind::text<>COALESCE(item->>'permissionKind','entity_operation')) THEN
      RAISE EXCEPTION 'OPERATION_BINDING_PERMISSION_UNRESOLVED' USING ERRCODE='foreign_key_violation';
    END IF;
    INSERT INTO authz.entity_operation_binding(
      id,tenant_id,applied_release_id,plane_code,source_entity_id,source_entity_operation_id,
      source_release_id,source_release_hash,source_compiled_hash,entity_code,operation_key,
      permission_id,decision_mode,created_by)
    -- Descriptor IDs identify source bindings; projection rows belong to one applied release.
    SELECT DISTINCT ON (item->>'sourceEntityOperationId') md5(p_applied_release_id::text||':operation:'||(item->>'bindingId'))::uuid,p_tenant_id,p_applied_release_id,lower(p_plane_code),
      v_source_entity_id,(item->>'sourceEntityOperationId')::uuid,p_source_release_id,v_release_hash,
      p_source_compiled_hash,item->>'entityCode',item->>'operationKey',p.id,
      (item->>'decisionMode')::authz.operation_decision_mode_d,v_actor
    FROM jsonb_array_elements(v_bindings) item JOIN authz.permission p
      ON p.canonical_code=item->>'permissionCode' AND p.id=(item->>'permissionId')::uuid
    ORDER BY item->>'sourceEntityOperationId',item->>'scopeKind';
    GET DIAGNOSTICS v_actual=ROW_COUNT;
    IF v_actual<>v_expected THEN RAISE EXCEPTION 'OPERATION_BINDING_STAGE_COUNT_MISMATCH' USING ERRCODE='check_violation'; END IF;
    INSERT INTO authz.entity_operation_scope_binding(
      id,entity_operation_binding_id,scope_kind,coordinate_source,coordinate_key,resolver_key,created_by)
    SELECT md5(p_applied_release_id::text||':scope:'||(item->>'scopeBindingId'))::uuid,b.id,(item->>'scopeKind')::authz.scope_kind_d,
      (item->>'coordinateSource')::authz.scope_coordinate_source_d,item->>'coordinateKey',item->>'resolverKey',v_actor
    FROM jsonb_array_elements(v_bindings) item
    JOIN authz.entity_operation_binding b ON b.applied_release_id=p_applied_release_id
      AND b.tenant_id IS NOT DISTINCT FROM p_tenant_id
      AND b.source_entity_operation_id=(item->>'sourceEntityOperationId')::uuid;
    IF (SELECT count(*) FROM authz.entity_operation_scope_binding s JOIN authz.entity_operation_binding b ON b.id=s.entity_operation_binding_id WHERE b.applied_release_id=p_applied_release_id)<>jsonb_array_length(v_bindings) THEN
      RAISE EXCEPTION 'OPERATION_SCOPE_STAGE_COUNT_MISMATCH' USING ERRCODE='check_violation';
    END IF;
    RETURN v_actual;
END; $$;

COMMIT;
