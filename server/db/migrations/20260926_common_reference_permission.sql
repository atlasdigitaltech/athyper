-- Common reference capability: catalog only; no grants or release activation.
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
         OR (split_part(item->>'permissionCode','.',1)<>lower(p_plane_code)
             AND item->>'permissionCode'<>'common.platform.reference.view')
         OR split_part(item->>'permissionCode','.',2)='action'
         OR split_part(item->>'permissionCode','.',3)='action'
         OR COALESCE(item->>'permissionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item->>'bindingId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item->>'scopeBindingId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'OPERATION_BINDING_CANONICAL_PERMISSION_REQUIRED' USING ERRCODE='check_violation';
    END IF;
    -- Exact shared capability exception, never a common.* wildcard. The signed
    -- descriptor must enroll a read-only shared entity; grants stay plane-local.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_bindings) item
      WHERE item->>'permissionCode'='common.platform.reference.view') THEN
      IF p_compiled_json->>'referenceCapability' IS DISTINCT FROM 'common.platform.reference.view'
         OR p_compiled_json->>'planeKey' IS DISTINCT FROM lower(p_plane_code)
         OR p_compiled_json#>>'{storage,schema}' IS DISTINCT FROM 'shared'
         OR p_compiled_json#>>'{storage,tenantField}' IS NOT NULL
         OR jsonb_typeof(p_compiled_json->'operations') IS DISTINCT FROM 'object'
         OR jsonb_typeof(p_compiled_json->'fields') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'COMMON_REFERENCE_DESCRIPTOR_REQUIRED' USING ERRCODE='check_violation';
      END IF;
      IF jsonb_array_length(p_compiled_json->'fields')=0
         OR p_compiled_json->'operations'='{}'::jsonb
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_compiled_json->'fields') field
           WHERE field->'writableOn' IS DISTINCT FROM '[]'::jsonb)
         OR EXISTS (SELECT 1 FROM jsonb_each(p_compiled_json->'operations') operation
           WHERE operation.key NOT IN ('list','read','view')
             OR operation.value->>'permissionCode' IS DISTINCT FROM 'common.platform.reference.view')
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_bindings) item
           WHERE item->>'permissionCode' IS DISTINCT FROM 'common.platform.reference.view'
             OR item->>'permissionKind' IS DISTINCT FROM 'capability'
             OR COALESCE(item->>'operationKey','') NOT IN ('list','read','view')
             OR item->>'entityCode' IS DISTINCT FROM p_compiled_json->>'entityCode'
             OR item->>'scopeKind' IS DISTINCT FROM 'tenant'
             OR item->>'coordinateSource' IS DISTINCT FROM 'tenant_context'
             OR item->>'coordinateKey' IS NOT NULL OR item->>'resolverKey' IS NOT NULL) THEN
        RAISE EXCEPTION 'COMMON_REFERENCE_READ_ONLY_BINDING_REQUIRED' USING ERRCODE='check_violation';
      END IF;
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

-- seed-contract-version: 1
-- seed-pack: common.reference-view-permission
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Authorization Catalog v2 common reference capability","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-09-26","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:2
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- Catalog only. No role grants, memberships, SQL SELECT grants or activation.
DO $$ BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common reference permission requires an exact local plane';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM control.module WHERE code='fnd' AND status='active') THEN
    RAISE EXCEPTION 'Common reference permission requires the active fnd module';
  END IF;
END $$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
  requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT '51f45819-773a-566d-a4bc-69784c28afb2'::uuid,'common.platform.reference.view',
  'capability',module.id,'low',false,false,false,false,false,
  '{"namespace":"common","capability":"read_only_shared_reference","_seed":{"pack":"common.reference-view-permission","version":"1.0.0"}}'::jsonb,
  'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module WHERE module.code='fnd' AND module.status='active'
ON CONFLICT (canonical_code) DO NOTHING;

INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
VALUES ('51f45819-773a-566d-a4bc-69784c28afb2','tenant','exact','active','00000000-0000-0000-0000-000000000000')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM authz.permission p JOIN control.module m ON m.id=p.module_id
    WHERE p.id='51f45819-773a-566d-a4bc-69784c28afb2' AND p.canonical_code='common.platform.reference.view'
      AND p.permission_kind='capability' AND p.status='published' AND p.risk_tier='low'
      AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable
      AND NOT p.is_delegable AND NOT p.is_overridable AND m.code='fnd')
    OR (SELECT count(*) FROM authz.permission_scope_kind WHERE permission_id='51f45819-773a-566d-a4bc-69784c28afb2' AND status='active')<>1
    OR NOT EXISTS (SELECT 1 FROM authz.permission_scope_kind WHERE permission_id='51f45819-773a-566d-a4bc-69784c28afb2' AND scope_kind='tenant' AND propagation_mode='exact' AND status='active') THEN
    RAISE EXCEPTION 'Common reference permission catalog conflict';
  END IF;
END $$;
