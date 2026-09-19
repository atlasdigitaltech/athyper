-- Operating Organization V2: ownership kind, effective capabilities, and
-- closed commercial-model vocabularies. The conditional migration block only
-- supports databases created before the cutover.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='master' AND t.typname='operating_organization_kind_d') THEN
    CREATE DOMAIN master.operating_organization_kind_d AS text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='master' AND t.typname='operating_organization_capability_d') THEN
    CREATE DOMAIN master.operating_organization_capability_d AS text;
  END IF;
END $$;

ALTER DOMAIN master.operating_organization_kind_d DROP CONSTRAINT IF EXISTS operating_organization_kind_d_check;
ALTER DOMAIN master.operating_organization_kind_d ADD CONSTRAINT operating_organization_kind_d_check
  CHECK (VALUE IN ('company_operations','business_operations','shared_operations'));
ALTER DOMAIN master.operating_organization_capability_d DROP CONSTRAINT IF EXISTS operating_organization_capability_d_check;
ALTER DOMAIN master.operating_organization_capability_d ADD CONSTRAINT operating_organization_capability_d_check
  CHECK (VALUE IN ('finance','procurement','people','sales','operations','warehouse','projects'));
ALTER DOMAIN master.buying_model_d DROP CONSTRAINT IF EXISTS buying_model_d_check;
ALTER DOMAIN master.buying_model_d ADD CONSTRAINT buying_model_d_check
  CHECK (VALUE IN ('local','centralized','federated','hybrid'));
ALTER DOMAIN master.selling_model_d DROP CONSTRAINT IF EXISTS selling_model_d_check;
ALTER DOMAIN master.selling_model_d ADD CONSTRAINT selling_model_d_check
  CHECK (VALUE IN ('local','centralized','federated','hybrid'));

ALTER TABLE master.operating_organization
  ADD COLUMN IF NOT EXISTS organization_kind master.operating_organization_kind_d;
DO $migrate_operating_organization_kinds$
DECLARE tenant_record record; actor_id uuid;
BEGIN
  FOR tenant_record IN SELECT DISTINCT tenant_id FROM master.operating_organization LOOP
    SELECT id INTO actor_id FROM master.principal WHERE tenant_id=tenant_record.tenant_id AND status='active' ORDER BY code LIMIT 1;
    IF actor_id IS NULL THEN RAISE EXCEPTION 'Cannot migrate operating organizations for tenant % without an active principal', tenant_record.tenant_id; END IF;
    PERFORM set_config('app.current_principal_id',actor_id::text,true);
    UPDATE master.operating_organization organization
       SET organization_kind = CASE
         WHEN organization.metadata->'context'->>'is_company_default' = 'true'
           OR organization.code LIKE '%-company-operations' THEN 'company_operations'
         WHEN organization.parent_operating_organization_id IS NULL
           AND organization.metadata->'context'->>'is_browse_only' = 'true' THEN 'shared_operations'
         WHEN EXISTS (SELECT 1 FROM master.operating_organization_company_assignment assignment WHERE assignment.tenant_id=organization.tenant_id AND assignment.operating_organization_id=organization.id AND assignment.status='active' GROUP BY assignment.operating_organization_id HAVING count(*) > 1) THEN 'shared_operations'
         ELSE 'business_operations'
       END
     WHERE organization.tenant_id=tenant_record.tenant_id AND organization.organization_kind IS NULL;
  END LOOP;
END;
$migrate_operating_organization_kinds$;
ALTER TABLE master.operating_organization
  ALTER COLUMN organization_kind SET DEFAULT 'business_operations',
  ALTER COLUMN organization_kind SET NOT NULL;

CREATE TABLE IF NOT EXISTS master.operating_organization_capability (
  id uuid NOT NULL DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  operating_organization_id uuid NOT NULL,
  capability_code master.operating_organization_capability_d NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  effective_until date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status master.organization_status_d NOT NULL DEFAULT 'active',
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT operating_organization_capability_pkey PRIMARY KEY(id),
  CONSTRAINT operating_organization_capability_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT operating_organization_capability_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT operating_organization_capability_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
  CONSTRAINT operating_organization_capability_status_audit_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
  CONSTRAINT operating_organization_capability_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE master.operating_organization_capability
  DROP CONSTRAINT IF EXISTS operating_organization_capability_org_fk,
  ADD CONSTRAINT operating_organization_capability_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS operating_organization_capability_tenant_fk,
  ADD CONSTRAINT operating_organization_capability_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS operating_organization_capability_created_by_fk,
  ADD CONSTRAINT operating_organization_capability_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS operating_organization_capability_status_changed_by_fk,
  ADD CONSTRAINT operating_organization_capability_status_changed_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS operating_organization_capability_updated_by_fk,
  ADD CONSTRAINT operating_organization_capability_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS operating_organization_capability_coordinate_uq,
  ADD CONSTRAINT operating_organization_capability_coordinate_uq UNIQUE(tenant_id,operating_organization_id,capability_code,effective_from);
CREATE INDEX IF NOT EXISTS operating_organization_capability_effective_idx ON master.operating_organization_capability(tenant_id,operating_organization_id,capability_code,effective_from,effective_until) WHERE status='active';

-- Migrate the retired compatibility domain only when upgrading an old database.
DO $migrate_operating_organization_capabilities$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='master' AND table_name='operating_organization' AND column_name='domain'
  ) THEN
    EXECUTE $sql$
      INSERT INTO master.operating_organization_capability(tenant_id,operating_organization_id,capability_code,effective_from,metadata,status,created_by)
      SELECT organization.tenant_id,organization.id,
        CASE organization.domain::text WHEN 'procurement' THEN 'procurement' WHEN 'sales' THEN 'sales' WHEN 'finance' THEN 'finance' WHEN 'people' THEN 'people' WHEN 'warehouse' THEN 'warehouse' WHEN 'projects' THEN 'projects' ELSE 'operations' END,
        current_date,jsonb_build_object('migration','operating-organization-v2'),organization.status,organization.created_by
      FROM master.operating_organization organization WHERE organization.domain::text <> 'both'
      ON CONFLICT(tenant_id,operating_organization_id,capability_code,effective_from) DO NOTHING
    $sql$;
    EXECUTE $sql$
      INSERT INTO master.operating_organization_capability(tenant_id,operating_organization_id,capability_code,effective_from,metadata,status,created_by)
      SELECT organization.tenant_id,organization.id,capability.code,current_date,jsonb_build_object('migration','operating-organization-v2'),organization.status,organization.created_by
      FROM master.operating_organization organization
      CROSS JOIN (VALUES ('finance'),('procurement'),('people'),('sales'),('operations'),('warehouse'),('projects')) capability(code)
      WHERE organization.domain::text='both'
      ON CONFLICT(tenant_id,operating_organization_id,capability_code,effective_from) DO NOTHING
    $sql$;
  END IF;
END;
$migrate_operating_organization_capabilities$;
