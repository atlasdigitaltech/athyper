-- 020_entities/014_master_payment_terms.sql
-- Entities 92–96: Payment Terms & Calendar
-- Depends on: shared.module rows (PAY)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pay text;
BEGIN
    SELECT id::text INTO v_pay FROM shared.module WHERE code = 'PAY';

    -- ── 92. holiday_calendar ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'holiday_calendar', 'HOLCAL', 'holiday_calendar', 'MASTER', 'system', 'ent', 'table',
        'full', 'config', 'controlled', 'master', 'holiday_calendar',
        'Holiday Calendar', 'Holiday Calendars', 'calendar-days', 'slate',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 93. holiday_calendar_day ─────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'holiday_calendar_day', 'HOLCALD', 'holiday_calendar_day', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'locked', 'master', 'holiday_calendar_day',
        'Holiday', 'Holidays', 'sun', 'slate',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 94. payment_term ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'payment_term', 'PMTT', 'payment_term', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_term',
        'Payment Term', 'Payment Terms', 'clock', 'slate',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 95. payment_term_clause ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'payment_term_clause', 'PMTTC', 'payment_term_clause', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_term_clause',
        'Payment Term Clause', 'Payment Term Clauses', 'file-text', 'slate',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 96. payment_term_discount_tier ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'payment_term_discount_tier', 'PMTTDT', 'payment_term_discount_tier', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_term_discount_tier',
        'Discount Tier', 'Discount Tiers', 'percent', 'slate',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
