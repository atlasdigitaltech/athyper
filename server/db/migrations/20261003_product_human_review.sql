BEGIN;
-- Human product review shares native Entity drafts and lifecycle triggers.
-- No SECURITY DEFINER, global graph writes, machine approval or publication grant.
CREATE TABLE IF NOT EXISTS metadata.entity_product_review_receipt (
 authority_tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 request_id uuid NOT NULL,
 change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id),
 actor_id uuid NOT NULL REFERENCES master.principal(id),
 action text NOT NULL CHECK (action IN ('adopt','submit','approve')),
 expected_revision bigint NOT NULL CHECK (expected_revision >= 0),
 contract_hash text NOT NULL CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(authority_tenant_id,request_id),
 CHECK ((receipt->>'changeSetId'=change_set_id::text AND receipt->>'actorId'=actor_id::text
   AND receipt->>'requestId'=request_id::text AND receipt->>'action'=action
   AND receipt->>'expectedRevision'=expected_revision::text AND receipt->>'expectedContractHash'=contract_hash
   AND receipt->>'revision'=(expected_revision+CASE WHEN action='adopt' THEN 0 ELSE 1 END)::text
   AND receipt->>'status'=CASE action WHEN 'adopt' THEN 'draft' WHEN 'submit' THEN 'in_review' ELSE 'approved' END) IS TRUE)
);
ALTER TABLE metadata.entity_product_review_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_product_review_receipt FORCE ROW LEVEL SECURITY;
DO $review$
DECLARE t text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
  GRANT USAGE ON SCHEMA metadata TO athyper_control_api;
  -- A fixed inventory of native graph tables, not all tables in a schema.
  FOREACH t IN ARRAY ARRAY[
   'entity','entity_change_set','entity_release','entity_runtime_profile','entity_field','entity_key','entity_key_field',
   'entity_search_profile','entity_search_field','entity_relation','entity_relation_target','entity_relation_field',
   'entity_operation','entity_operation_permission','entity_operation_rule','entity_operation_scope_binding',
   'entity_operation_context_requirement','entity_change_case_binding','entity_field_reference_binding',
   'entity_materialization_binding','entity_materialization_field_mapping','entity_surface','entity_surface_section',
   'entity_surface_field_binding','entity_surface_operation','entity_flow','entity_flow_step','entity_lifecycle_binding',
   'entity_lifecycle_operation_binding','entity_policy_binding','entity_capability','entity_field_policy_binding',
   'entity_numbering_binding','entity_contract_test_case'] LOOP
   EXECUTE format('GRANT SELECT ON metadata.%I TO athyper_control_api',t);
   EXECUTE format('DROP POLICY IF EXISTS control_product_read ON metadata.%I',t);
   EXECUTE format('CREATE POLICY control_product_read ON metadata.%I FOR SELECT TO athyper_control_api USING(tenant_id IS NULL)',t);
  END LOOP;
  GRANT SELECT ON metadata.entity_class_profile TO athyper_control_api;
  GRANT EXECUTE ON FUNCTION metadata.current_actor_id(uuid) TO athyper_control_api;
  GRANT SELECT,INSERT ON metadata.entity_product_review_receipt TO athyper_control_api;
  REVOKE UPDATE,DELETE,TRUNCATE ON metadata.entity_product_review_receipt FROM athyper_control_api;
  DROP POLICY IF EXISTS control_product_receipt_read ON metadata.entity_product_review_receipt;
  CREATE POLICY control_product_receipt_read ON metadata.entity_product_review_receipt FOR SELECT TO athyper_control_api
   USING(authority_tenant_id=shared.current_tenant_id_soft());
  DROP POLICY IF EXISTS control_product_receipt_insert ON metadata.entity_product_review_receipt;
  CREATE POLICY control_product_receipt_insert ON metadata.entity_product_review_receipt FOR INSERT TO athyper_control_api
   WITH CHECK(authority_tenant_id=shared.current_tenant_id_soft() AND actor_id=master.current_principal_id_soft()
    AND EXISTS(SELECT 1 FROM master.principal p JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id
     WHERE p.id=actor_id AND p.tenant_id=authority_tenant_id AND p.status='active' AND p.principal_type='user'
      AND b.service_client_id IS NULL AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api' AND b.status='active')
    AND EXISTS(SELECT 1 FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
     WHERE c.id=change_set_id AND c.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system'
      AND c.lock_version=expected_revision AND ((action IN ('adopt','submit') AND c.status='draft')
       OR (action='approve' AND c.status='in_review' AND c.created_by<>actor_id AND c.submitted_by<>actor_id)))
    AND (action='adopt' OR EXISTS(SELECT 1 FROM metadata.entity_product_review_receipt prior
      WHERE prior.authority_tenant_id=entity_product_review_receipt.authority_tenant_id
       AND prior.change_set_id=entity_product_review_receipt.change_set_id
       AND prior.contract_hash=entity_product_review_receipt.contract_hash
       AND ((entity_product_review_receipt.action='submit' AND prior.action='adopt'
         AND prior.actor_id=entity_product_review_receipt.actor_id AND prior.expected_revision=entity_product_review_receipt.expected_revision)
        OR (entity_product_review_receipt.action='approve' AND prior.action='submit'
         AND prior.actor_id<>entity_product_review_receipt.actor_id AND prior.expected_revision=entity_product_review_receipt.expected_revision-1)))));
  GRANT UPDATE(status,status_changed_by) ON metadata.entity_change_set TO athyper_control_api;
  DROP POLICY IF EXISTS control_product_transition ON metadata.entity_change_set;
  CREATE POLICY control_product_transition ON metadata.entity_change_set FOR UPDATE TO athyper_control_api
   USING(tenant_id IS NULL AND status IN ('draft','in_review'))
   WITH CHECK(tenant_id IS NULL AND status_changed_by=master.current_principal_id_soft()
    AND EXISTS(SELECT 1 FROM metadata.entity_product_review_receipt r WHERE r.change_set_id=id
     AND r.authority_tenant_id=shared.current_tenant_id_soft() AND r.actor_id=master.current_principal_id_soft()
     AND r.expected_revision=lock_version-1
     AND ((r.action='submit' AND status='in_review') OR (r.action='approve' AND status='approved'))));
 END IF;
END $review$;
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,
 allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('entity_product_human_review','^metadata[.]entity[.]product[.]review$',25,ARRAY['execute']::audit.operation_d[],
 'critical',ARRAY['user']::audit.actor_type_d[],'tenant',false,'metadata',16384,1,
 '{"owner":"meta-entity-authoring","purpose":"human_product_review"}'::jsonb,'active') ON CONFLICT(code) DO NOTHING;

COMMIT;
