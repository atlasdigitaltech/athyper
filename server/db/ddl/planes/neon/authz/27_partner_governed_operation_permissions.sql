-- Dedicated command/transfer gates still enforced by their owning services.
-- Catalog only: no roles, assignments, user grants, or activation changes.
-- Contract: governance/policy/reviews/business-partner-reset-runtime-catalog.proposal.dev.json
-- Do not restore the retired bp_target read aliases with this migration.
DO $$
DECLARE definition record; existing authz.permission%ROWTYPE; module_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('neon.bp.governed-operation-catalog.v1',0));
 FOR definition IN SELECT * FROM (VALUES
  ('7e7406e7-6095-5cbb-872c-55bdcd6c1021'::uuid,'neon.relationship.bp_target.import','bp','low',false,ARRAY['tenant']::text[]),
  ('7e7406e7-6095-5cbb-872c-55bdcd6c1022'::uuid,'neon.relationship.bp_target.export','bp','low',false,ARRAY['tenant']::text[]),
  ('7e7406e7-6095-5cbb-872c-55bdcd6c1023'::uuid,'neon.relationship.bp_target.configure_company','bp','medium',false,ARRAY['company_code','operating_organization']::text[]),
  ('7e7406e7-6095-5cbb-872c-55bdcd6c1024'::uuid,'neon.relationship.bp_target.qualification_company','fnd','critical',true,ARRAY['company_code','operating_organization']::text[])
 ) d(id,code,module_code,risk,sod,scopes)
 LOOP
  SELECT id INTO STRICT module_id FROM control.module WHERE code=definition.module_code AND status='active';
  SELECT * INTO existing FROM authz.permission WHERE canonical_code=definition.code FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
    is_shareable,is_delegable,is_overridable,metadata,status,created_by)
   VALUES(definition.id,definition.code,'entity_operation',module_id,definition.risk::authz.risk_tier_d,false,definition.sod,
    false,false,false,'{"_seed":{"pack":"neon.bp-governed-operation-catalog","version":"1.0.0"},"grantsIncluded":false}'::jsonb,
    'published','00000000-0000-0000-0000-000000000000'::uuid)
   RETURNING * INTO existing;
   INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
   SELECT existing.id,scope::authz.scope_kind_d,'exact','active','00000000-0000-0000-0000-000000000000'::uuid
   FROM unnest(definition.scopes) scope;
  END IF;
  -- Existing definitions must match; never silently widen a catalog already in use.
  IF existing.permission_kind<>'entity_operation' OR existing.module_id<>module_id OR existing.status<>'published'
   OR existing.risk_tier::text<>definition.risk OR existing.requires_mfa OR existing.requires_sod<>definition.sod
   OR existing.is_shareable OR existing.is_delegable OR existing.is_overridable
   OR (SELECT array_agg(scope_kind::text ORDER BY scope_kind::text) FROM authz.permission_scope_kind
       WHERE permission_id=existing.id AND status='active') IS DISTINCT FROM definition.scopes
   OR EXISTS(SELECT 1 FROM authz.permission_scope_kind WHERE permission_id=existing.id AND status='active' AND propagation_mode<>'exact')
  THEN RAISE EXCEPTION 'BP_GOVERNED_OPERATION_CATALOG_DRIFT: %',definition.code; END IF;
 END LOOP;
END $$;
