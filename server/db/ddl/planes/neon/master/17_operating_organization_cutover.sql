-- Final V2 cutover: ownership kind and effective capabilities replace legacy
-- domain; profile behavior no longer carries a duplicate organization type.
ALTER TABLE master.procurement_organization_profile DROP COLUMN IF EXISTS organization_type;
ALTER TABLE master.sales_organization_profile DROP COLUMN IF EXISTS organization_type;
ALTER TABLE master.operating_organization DROP COLUMN IF EXISTS domain;
DROP INDEX IF EXISTS master.operating_organization_domain_status_idx;
CREATE INDEX IF NOT EXISTS operating_organization_kind_status_idx
  ON master.operating_organization (tenant_id, organization_kind, status, code);

DO $rename_capability_triggers$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='master.procurement_organization_profile'::regclass AND tgname='trg_procurement_organization_profile_domain') THEN
    ALTER TRIGGER trg_procurement_organization_profile_domain ON master.procurement_organization_profile RENAME TO trg_procurement_organization_profile_capability;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='master.sales_organization_profile'::regclass AND tgname='trg_sales_organization_profile_domain') THEN
    ALTER TRIGGER trg_sales_organization_profile_domain ON master.sales_organization_profile RENAME TO trg_sales_organization_profile_capability;
  END IF;
END;
$rename_capability_triggers$;
