-- Expand the plane locale policy to the governed eight-locale registry and
-- persist plane-local catalog qualification evidence.
BEGIN;

ALTER TABLE master.tenant_profile
  ADD COLUMN IF NOT EXISTS locale_catalog_governance jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE master.tenant_profile
  DROP CONSTRAINT IF EXISTS tenant_profile_locale_policy_chk;

ALTER TABLE master.tenant_profile
  ADD CONSTRAINT tenant_profile_locale_policy_chk CHECK (
    cardinality(enabled_locale_codes) BETWEEN 1 AND 8
    AND enabled_locale_codes <@ ARRAY['en','ar','ms','zh-Hans','hi','ta','fr','de']::text[]
    AND 'en' = ANY(enabled_locale_codes)
    AND default_locale_code = ANY(enabled_locale_codes)
    AND fallback_locale_code = 'en'
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'master.tenant_profile'::regclass
       AND conname = 'tenant_profile_locale_catalog_governance_chk'
  ) THEN
    ALTER TABLE master.tenant_profile
      ADD CONSTRAINT tenant_profile_locale_catalog_governance_chk
      CHECK (jsonb_typeof(locale_catalog_governance) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN master.tenant_profile.locale_catalog_governance IS
  'Plane-local catalog lifecycle, coverage, linguistic, layout, and automated-test qualification evidence keyed by canonical locale code.';

COMMIT;
