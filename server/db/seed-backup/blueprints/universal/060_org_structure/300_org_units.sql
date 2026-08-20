-- seed-contract-version: 1
-- seed-pack: neon.blueprint.organization-templates
-- seed-pack-version: 2.0.0
-- seed-dataset: control.org-unit-type,master.org-unit
-- seed-data-class: production_reference
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-natural-key: control.org_unit_type(tenant_id,code);master.org_unit(tenant_id,code)
-- seed-assertions: expected-count,orphan,uniqueness,semantic,idempotent-convergence

DO $seed$
DECLARE
  v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id',true)),'')::uuid;
  v_actor uuid := nullif(trim(current_setting('app.current_principal_id',true)),'')::uuid;
  v_root uuid;
  v_division_type uuid;
  v_department_type uuid;
BEGIN
  IF current_setting('app.database_plane',true)<>'neon' OR v_tid IS NULL THEN
    RAISE EXCEPTION '[300_org_units] Neon tenant scope required';
  END IF;
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM master.principal WHERE tenant_id=v_tid AND id=v_actor AND status='active') THEN
    RAISE EXCEPTION '[300_org_units] active tenant-local app.current_principal_id required';
  END IF;

  INSERT INTO control.org_unit_type(id,tenant_id,code,name,description,level_order,metadata,status,created_by)
  VALUES
    (md5('wave5:org-type:'||v_tid||':division')::uuid,v_tid,'division','Division','Top-level operating division.',10,'{"_seed":{"pack":"org_universal","version":"2.0.0"}}','active',v_actor),
    (md5('wave5:org-type:'||v_tid||':department')::uuid,v_tid,'department','Department','Department within an operating division.',20,'{"_seed":{"pack":"org_universal","version":"2.0.0"}}','active',v_actor)
  ON CONFLICT(tenant_id,code) DO UPDATE SET
    name=excluded.name,description=excluded.description,level_order=excluded.level_order,
    metadata=excluded.metadata,status='active',updated_at=now(),updated_by=v_actor
  WHERE (control.org_unit_type.name,control.org_unit_type.description,control.org_unit_type.level_order,
         control.org_unit_type.metadata,control.org_unit_type.status)
    IS DISTINCT FROM (excluded.name,excluded.description,excluded.level_order,excluded.metadata,'active');

  SELECT id INTO v_division_type FROM control.org_unit_type WHERE tenant_id=v_tid AND code='division';
  SELECT id INTO v_department_type FROM control.org_unit_type WHERE tenant_id=v_tid AND code='department';

  INSERT INTO master.org_unit(id,tenant_id,org_unit_type_id,code,name,parent_org_unit_id,sort_order,effective_from,metadata,status,created_by)
  VALUES (md5('wave5:org-unit:'||v_tid||':organization')::uuid,v_tid,v_division_type,'organization','Organization',NULL,0,DATE '2020-01-01','{"_seed":{"pack":"org_universal","version":"2.0.0"}}','active',v_actor)
  ON CONFLICT(tenant_id,code) DO UPDATE SET
    org_unit_type_id=excluded.org_unit_type_id,name=excluded.name,parent_org_unit_id=NULL,
    sort_order=excluded.sort_order,effective_from=excluded.effective_from,metadata=excluded.metadata,
    status='active',updated_at=now(),updated_by=v_actor
  WHERE (master.org_unit.org_unit_type_id,master.org_unit.name,master.org_unit.parent_org_unit_id,
         master.org_unit.sort_order,master.org_unit.effective_from,master.org_unit.metadata,master.org_unit.status)
    IS DISTINCT FROM (excluded.org_unit_type_id,excluded.name,NULL,excluded.sort_order,
                      excluded.effective_from,excluded.metadata,'active');

  SELECT id INTO v_root FROM master.org_unit WHERE tenant_id=v_tid AND code='organization';
  INSERT INTO master.org_unit(id,tenant_id,org_unit_type_id,code,name,parent_org_unit_id,sort_order,effective_from,metadata,status,created_by)
  SELECT md5('wave5:org-unit:'||v_tid||':'||x.code)::uuid,v_tid,v_department_type,x.code,x.name,v_root,x.sort_order,
         DATE '2020-01-01','{"_seed":{"pack":"org_universal","version":"2.0.0"}}','active',v_actor
  FROM (VALUES
    ('administration','Administration',100),('finance','Finance',150),('commercial','Commercial',200),
    ('operations','Operations',300),('support-services','Support Services',400)
  ) x(code,name,sort_order)
  ON CONFLICT(tenant_id,code) DO UPDATE SET
    org_unit_type_id=excluded.org_unit_type_id,name=excluded.name,parent_org_unit_id=excluded.parent_org_unit_id,
    sort_order=excluded.sort_order,effective_from=excluded.effective_from,metadata=excluded.metadata,
    status='active',updated_at=now(),updated_by=v_actor
  WHERE (master.org_unit.org_unit_type_id,master.org_unit.name,master.org_unit.parent_org_unit_id,
         master.org_unit.sort_order,master.org_unit.effective_from,master.org_unit.metadata,master.org_unit.status)
    IS DISTINCT FROM (excluded.org_unit_type_id,excluded.name,excluded.parent_org_unit_id,
                      excluded.sort_order,excluded.effective_from,excluded.metadata,'active');

  IF (SELECT count(*) FROM master.org_unit WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'='org_universal')<>6 THEN
    RAISE EXCEPTION '[300_org_units] expected 6 universal organization rows';
  END IF;
  IF EXISTS (SELECT 1 FROM master.org_unit u LEFT JOIN master.org_unit p ON p.tenant_id=u.tenant_id AND p.id=u.parent_org_unit_id
             WHERE u.tenant_id=v_tid AND u.parent_org_unit_id IS NOT NULL AND p.id IS NULL) THEN
    RAISE EXCEPTION '[300_org_units] orphan organization parent';
  END IF;
END $seed$;
