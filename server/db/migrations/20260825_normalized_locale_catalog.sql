-- Normalize UI localization across the reference, plane-catalog, and tenant
-- activation layers. Run this migration once against each physical plane DB:
-- athyper_studio, athyper_neon, and athyper_mesh.
BEGIN;

ALTER TABLE master.tenant_profile
    ADD COLUMN IF NOT EXISTS locale_catalog_governance jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO shared.locale (
    code, language_code, country_code, script, name, direction, created_by
) VALUES (
    'zh-Hans', 'zh', NULL, 'Hans', 'Chinese (Simplified)', 'ltr',
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) DO UPDATE
SET language_code = EXCLUDED.language_code,
    country_code = EXCLUDED.country_code,
    script = EXCLUDED.script,
    name = EXCLUDED.name,
    direction = EXCLUDED.direction,
    status = 'active',
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

CREATE TABLE IF NOT EXISTS control.ui_locale_catalog (
    locale_code                text        NOT NULL,
    format_locale_code         text        NOT NULL,
    rollout_wave               smallint    NOT NULL,
    status                     text        NOT NULL DEFAULT 'draft',
    coverage_pct               smallint    NOT NULL DEFAULT 0,
    linguistic_review_passed   boolean     NOT NULL DEFAULT false,
    layout_review_passed       boolean     NOT NULL DEFAULT false,
    automated_tests_passed     boolean     NOT NULL DEFAULT false,
    qualified                  boolean GENERATED ALWAYS AS (
        status = 'qualified' AND coverage_pct = 100
        AND linguistic_review_passed AND layout_review_passed
        AND automated_tests_passed
    ) STORED,
    review_evidence            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT ui_locale_catalog_pkey PRIMARY KEY (locale_code),
    CONSTRAINT ui_locale_catalog_locale_fk FOREIGN KEY (locale_code) REFERENCES shared.locale(code),
    CONSTRAINT ui_locale_catalog_format_locale_fk FOREIGN KEY (format_locale_code) REFERENCES shared.locale(code),
    CONSTRAINT ui_locale_catalog_wave_chk CHECK (rollout_wave BETWEEN 0 AND 3),
    CONSTRAINT ui_locale_catalog_status_chk CHECK (status IN ('draft','translating','review','qualified','retired')),
    CONSTRAINT ui_locale_catalog_coverage_chk CHECK (coverage_pct BETWEEN 0 AND 100),
    CONSTRAINT ui_locale_catalog_evidence_chk CHECK (jsonb_typeof(review_evidence) = 'object'),
    CONSTRAINT ui_locale_catalog_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE IF NOT EXISTS master.tenant_locale_activation (
    tenant_id       uuid        NOT NULL,
    locale_code     text        NOT NULL,
    enabled         boolean     NOT NULL DEFAULT false,
    is_default      boolean     NOT NULL DEFAULT false,
    is_fallback     boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,
    CONSTRAINT tenant_locale_activation_pkey PRIMARY KEY (tenant_id, locale_code),
    CONSTRAINT tenant_locale_activation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    CONSTRAINT tenant_locale_activation_catalog_fk FOREIGN KEY (locale_code) REFERENCES control.ui_locale_catalog(locale_code),
    CONSTRAINT tenant_locale_activation_default_enabled_chk CHECK (NOT is_default OR enabled),
    CONSTRAINT tenant_locale_activation_fallback_enabled_chk CHECK (NOT is_fallback OR enabled),
    CONSTRAINT tenant_locale_activation_english_fallback_chk CHECK (NOT is_fallback OR locale_code = 'en'),
    CONSTRAINT tenant_locale_activation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE INDEX IF NOT EXISTS ui_locale_catalog_rollout_idx
    ON control.ui_locale_catalog (rollout_wave, status, locale_code);
CREATE INDEX IF NOT EXISTS tenant_locale_activation_enabled_idx
    ON master.tenant_locale_activation (tenant_id, locale_code) WHERE enabled;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_locale_activation_one_default_uq
    ON master.tenant_locale_activation (tenant_id) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_locale_activation_one_fallback_uq
    ON master.tenant_locale_activation (tenant_id) WHERE is_fallback;

ALTER TABLE master.tenant_profile DROP CONSTRAINT IF EXISTS tenant_profile_locale_policy_chk;
ALTER TABLE master.tenant_profile ADD CONSTRAINT tenant_profile_locale_policy_chk CHECK (
    cardinality(enabled_locale_codes) BETWEEN 1 AND 8
    AND enabled_locale_codes <@ ARRAY['en','ar','ms','zh-Hans','hi','ta','fr','de']::text[]
    AND 'en' = ANY(enabled_locale_codes)
    AND default_locale_code = ANY(enabled_locale_codes)
    AND fallback_locale_code = 'en'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='master.tenant_profile'::regclass
          AND conname='tenant_profile_locale_catalog_governance_chk'
    ) THEN
        ALTER TABLE master.tenant_profile
            ADD CONSTRAINT tenant_profile_locale_catalog_governance_chk
            CHECK (jsonb_typeof(locale_catalog_governance) = 'object');
    END IF;
END $$;

INSERT INTO control.ui_locale_catalog (
    locale_code, format_locale_code, rollout_wave, status, coverage_pct,
    linguistic_review_passed, layout_review_passed, automated_tests_passed,
    review_evidence, created_by
) VALUES
    ('en',      'en-US', 0, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell"}', '00000000-0000-0000-0000-000000000000'),
    ('ar',      'ar-SA', 1, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell","rtl":true}', '00000000-0000-0000-0000-000000000000'),
    ('ms',      'ms-MY', 1, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell"}', '00000000-0000-0000-0000-000000000000'),
    ('zh-Hans', 'zh-CN', 1, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell"}', '00000000-0000-0000-0000-000000000000'),
    ('hi',      'hi-IN', 2, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell"}', '00000000-0000-0000-0000-000000000000'),
    ('ta',      'ta-IN', 2, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell"}', '00000000-0000-0000-0000-000000000000'),
    ('fr',      'fr-FR', 3, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell"}', '00000000-0000-0000-0000-000000000000'),
    ('de',      'de-DE', 3, 'qualified', 100, true, true, true, '{"qualificationSource":"foundation-demo","catalogScope":"platform-shell"}', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (locale_code) DO UPDATE
SET format_locale_code = EXCLUDED.format_locale_code,
    rollout_wave = EXCLUDED.rollout_wave,
    status = EXCLUDED.status,
    coverage_pct = EXCLUDED.coverage_pct,
    linguistic_review_passed = EXCLUDED.linguistic_review_passed,
    layout_review_passed = EXCLUDED.layout_review_passed,
    automated_tests_passed = EXCLUDED.automated_tests_passed,
    review_evidence = control.ui_locale_catalog.review_evidence || EXCLUDED.review_evidence,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

-- Preserve existing tenant choices before applying the explicit demo policy.
INSERT INTO master.tenant_locale_activation (
    tenant_id, locale_code, enabled, is_default, is_fallback, created_by
)
SELECT profile.tenant_id, catalog.locale_code,
       catalog.locale_code = ANY(profile.enabled_locale_codes),
       catalog.locale_code = profile.default_locale_code,
       catalog.locale_code = profile.fallback_locale_code,
       '00000000-0000-0000-0000-000000000000'
FROM master.tenant_profile profile
CROSS JOIN control.ui_locale_catalog catalog
ON CONFLICT (tenant_id, locale_code) DO NOTHING;

-- The three well-known demo tenants receive all eight catalogs in every plane.
WITH demo_tenant(tenant_id, tenant_code) AS (VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, 'athyper'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'technostat'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'cirrusatlantic')
)
INSERT INTO master.tenant_locale_activation (
    tenant_id, locale_code, enabled, is_default, is_fallback, created_by
)
SELECT tenant.id, catalog.locale_code, true,
       catalog.locale_code = 'en', catalog.locale_code = 'en',
       '00000000-0000-0000-0000-000000000000'
FROM demo_tenant expected
JOIN master.tenant tenant ON tenant.id = expected.tenant_id AND lower(tenant.code) = expected.tenant_code
CROSS JOIN control.ui_locale_catalog catalog
ON CONFLICT (tenant_id, locale_code) DO UPDATE
SET enabled = true,
    is_default = EXCLUDED.is_default,
    is_fallback = EXCLUDED.is_fallback,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

WITH governance AS (
    SELECT jsonb_object_agg(locale_code, jsonb_build_object(
        'status', status,
        'coveragePct', coverage_pct,
        'linguisticReviewPassed', linguistic_review_passed,
        'layoutReviewPassed', layout_review_passed,
        'automatedTestsPassed', automated_tests_passed
    )) AS value
    FROM control.ui_locale_catalog
), demo_tenant(tenant_id, tenant_code) AS (VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, 'athyper'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'technostat'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'cirrusatlantic')
)
UPDATE master.tenant_profile profile
SET enabled_locale_codes = ARRAY['en','ar','ms','zh-Hans','hi','ta','fr','de']::text[],
    default_locale_code = 'en',
    fallback_locale_code = 'en',
    locale_catalog_governance = governance.value,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM governance, demo_tenant expected, master.tenant tenant
WHERE profile.tenant_id = tenant.id
  AND tenant.id = expected.tenant_id
  AND lower(tenant.code) = expected.tenant_code;

ALTER TABLE control.ui_locale_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.ui_locale_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_locale_activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_locale_activation FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='control' AND tablename='ui_locale_catalog' AND policyname='ui_locale_catalog_read') THEN
        CREATE POLICY ui_locale_catalog_read ON control.ui_locale_catalog FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='control' AND tablename='ui_locale_catalog' AND policyname='ui_locale_catalog_seed_write') THEN
        CREATE POLICY ui_locale_catalog_seed_write ON control.ui_locale_catalog FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='master' AND tablename='tenant_locale_activation' AND policyname='tenant_locale_activation_read') THEN
        CREATE POLICY tenant_locale_activation_read ON master.tenant_locale_activation FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='master' AND tablename='tenant_locale_activation' AND policyname='tenant_locale_activation_seed_write') THEN
        CREATE POLICY tenant_locale_activation_seed_write ON master.tenant_locale_activation FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='control' AND tablename='ui_locale_catalog' AND policyname='ui_locale_catalog_runtime_write') THEN
            CREATE POLICY ui_locale_catalog_runtime_write ON control.ui_locale_catalog FOR INSERT TO athyperapp WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='control' AND tablename='ui_locale_catalog' AND policyname='ui_locale_catalog_runtime_update') THEN
            CREATE POLICY ui_locale_catalog_runtime_update ON control.ui_locale_catalog FOR UPDATE TO athyperapp USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='master' AND tablename='tenant_locale_activation' AND policyname='tenant_locale_activation_write') THEN
            CREATE POLICY tenant_locale_activation_write ON master.tenant_locale_activation FOR ALL TO athyperapp USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());
        END IF;
        GRANT SELECT, INSERT, UPDATE ON control.ui_locale_catalog TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON master.tenant_locale_activation TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.ui_locale_catalog, master.tenant_locale_activation TO athyperadmin;
    END IF;
END $$;

REVOKE ALL ON control.ui_locale_catalog, master.tenant_locale_activation FROM PUBLIC;

DO $$
DECLARE
    demo_count integer;
    activation_count integer;
BEGIN
    SELECT count(*) INTO demo_count FROM master.tenant
    WHERE (id, lower(code)) IN (
        ('11111111-1111-4111-8111-111111111111'::uuid, 'athyper'),
        ('22222222-2222-4222-8222-222222222222'::uuid, 'technostat'),
        ('44444444-4444-4444-8444-444444444444'::uuid, 'cirrusatlantic')
    );
    IF demo_count = 3 THEN
        SELECT count(*) INTO activation_count
        FROM master.tenant_locale_activation
        WHERE tenant_id IN (
            '11111111-1111-4111-8111-111111111111'::uuid,
            '22222222-2222-4222-8222-222222222222'::uuid,
            '44444444-4444-4444-8444-444444444444'::uuid
        ) AND enabled;
        IF activation_count <> 24 THEN
            RAISE EXCEPTION 'Expected 24 enabled demo tenant locale activations in this plane, found %', activation_count;
        END IF;
    END IF;
END $$;

COMMENT ON TABLE control.ui_locale_catalog IS
    'Plane-local qualification and review evidence for each platform UI catalog; locale identity is owned by shared.locale.';
COMMENT ON TABLE master.tenant_locale_activation IS
    'Tenant activation, default, and emergency fallback selection for plane-qualified UI catalogs.';

COMMIT;
