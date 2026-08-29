-- seed-contract-version: 1
-- seed-pack: common.control.ui-locale-catalog
-- seed-pack-version: 1.0.0
-- seed-dataset: control.ui_locale_catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Athyper supported UI locale catalog","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-28","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.ui_locale_catalog(locale_code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:8
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
-- Plane-local catalog metadata. Qualification values establish the demo
-- foundation contract; product catalog owners remain responsible for evidence.

DO $guard$ BEGIN
  IF current_setting('app.database_plane',true) NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'UI locale catalog seed requires an application plane';
  END IF;
END $guard$;

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
    updated_at = now(),
    updated_by = EXCLUDED.created_by
WHERE (control.ui_locale_catalog.format_locale_code,control.ui_locale_catalog.rollout_wave)
  IS DISTINCT FROM (EXCLUDED.format_locale_code,EXCLUDED.rollout_wave);

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.ui_locale_catalog WHERE locale_code IN ('en','ar','ms','zh-Hans','hi','ta','fr','de')) <> 8 THEN RAISE EXCEPTION 'UI locale expected-count mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM control.ui_locale_catalog WHERE locale_code IN ('en','ar','ms','zh-Hans','hi','ta','fr','de') AND nullif(btrim(format_locale_code),'') IS NULL) THEN RAISE EXCEPTION 'UI locale orphan format coordinate'; END IF;
  IF EXISTS (SELECT locale_code FROM control.ui_locale_catalog WHERE locale_code IN ('en','ar','ms','zh-Hans','hi','ta','fr','de') GROUP BY locale_code HAVING count(*)<>1) THEN RAISE EXCEPTION 'UI locale uniqueness mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM control.ui_locale_catalog WHERE locale_code IN ('en','ar','ms','zh-Hans','hi','ta','fr','de') AND (status<>'qualified' OR coverage_pct<>100 OR NOT linguistic_review_passed OR NOT layout_review_passed OR NOT automated_tests_passed)) THEN RAISE EXCEPTION 'UI locale semantic mismatch'; END IF;
END $assertions$;
