-- seed-contract-version: 1
-- seed-pack: common.control.ui-locale-catalog
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-demo-data: false
-- Plane-local catalog metadata. Qualification values establish the demo
-- foundation contract; product catalog owners remain responsible for evidence.

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
    updated_by = EXCLUDED.created_by;
