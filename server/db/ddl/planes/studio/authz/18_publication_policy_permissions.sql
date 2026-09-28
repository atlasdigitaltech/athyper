-- seed-contract-version: 1
-- seed-pack: studio.publication-policy-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.permission;authz.permission_scope_kind
-- seed-data-class: production_reference
-- seed-plane: studio
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code);authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-id-strategy: deterministic-uuid:athyper.authorization.catalog.v2
-- seed-expected-row-count: exact:6
-- seed-assertions: expected-count,semantic
-- seed-demo-data: false
-- Publication authority catalog. No role grants or release activation.
-- Same canonical UUIDs/hashes as the Studio authorization catalog v2.
DO $catalog$
DECLARE r record; module_uuid uuid;
BEGIN
  IF current_setting('app.database_plane',true) IS DISTINCT FROM 'studio' THEN
    RAISE EXCEPTION 'Studio plane required';
  END IF;
  SELECT id INTO STRICT module_uuid FROM control.module WHERE code='meta' AND status='active';
  FOR r IN SELECT * FROM (VALUES
    ('c32e3f0b-aaf0-50a2-bdf5-602e9406c9cf'::uuid,'studio.metadata.contract.publish_automated',false,true,'1aefcd3a2d5a96973cc612efd161221f13bd0b8fe82a92311b8de66bf07b2cfe'),
    ('5068e865-a499-5d06-8704-de3e16bc4e90'::uuid,'studio.metadata.publication_policy.activate',true,true,'46bf67cb39294b5af51704a352dd163d6b25ec15dc1fded606447c2e88b5ce03'),
    ('676e3fdb-526e-5b3a-b06c-724d168fb57c'::uuid,'studio.metadata.publication_policy.create',true,false,'6265d3ce214027ef992a70bf64a37ea584b955a968b45992bdff8b997b3d5f2b')
  ) AS v(id,code,mfa,sod,hash) LOOP
    INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,
      is_shareable,is_delegable,is_overridable,metadata,status,created_by)
    VALUES(r.id,r.code,'system_action',module_uuid,'critical',r.mfa,r.sod,false,false,false,
      jsonb_build_object('_seed',jsonb_build_object('pack','studio.publication-policy','definitionSha256',r.hash)),
      'published','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(canonical_code) DO NOTHING;
    INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
    VALUES(r.id,'tenant','exact','active','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM authz.permission WHERE id=r.id AND canonical_code=r.code AND module_id=module_uuid
      AND permission_kind='system_action' AND risk_tier='critical' AND requires_mfa=r.mfa AND requires_sod=r.sod
      AND NOT is_shareable AND NOT is_delegable AND NOT is_overridable AND status='published')
      OR (SELECT count(*) FROM authz.permission_scope_kind WHERE permission_id=r.id AND status='active')<>1
      OR NOT EXISTS (SELECT 1 FROM authz.permission_scope_kind WHERE permission_id=r.id AND scope_kind='tenant'
        AND propagation_mode='exact' AND status='active') THEN
      RAISE EXCEPTION 'Publication permission catalog drift: %',r.code;
    END IF;
  END LOOP;
END $catalog$;
