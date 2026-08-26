-- Plane-local tenant language policy. Studio is the authoring surface, while
-- each target plane remains the runtime authority for its projected policy.
BEGIN;

ALTER TABLE master.tenant_profile
  ADD COLUMN IF NOT EXISTS enabled_locale_codes text[] NOT NULL DEFAULT ARRAY['en']::text[],
  ADD COLUMN IF NOT EXISTS default_locale_code text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS fallback_locale_code text NOT NULL DEFAULT 'en';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='master.tenant_profile'::regclass AND conname='tenant_profile_locale_policy_chk') THEN
    ALTER TABLE master.tenant_profile ADD CONSTRAINT tenant_profile_locale_policy_chk CHECK (
      cardinality(enabled_locale_codes) BETWEEN 1 AND 8
      AND enabled_locale_codes <@ ARRAY['en','ar','ms','zh-Hans','hi','ta','fr','de']::text[]
      AND 'en' = ANY(enabled_locale_codes)
      AND default_locale_code = ANY(enabled_locale_codes)
      AND fallback_locale_code = 'en'
    );
  END IF;
END $$;

COMMENT ON COLUMN master.tenant_profile.enabled_locale_codes IS 'Catalog-qualified UI locales activated for this tenant in this physical plane.';
COMMENT ON COLUMN master.tenant_profile.default_locale_code IS 'Plane default used when the principal has no enabled preference.';
COMMENT ON COLUMN master.tenant_profile.fallback_locale_code IS 'Guaranteed enabled fallback catalog locale.';
COMMIT;
