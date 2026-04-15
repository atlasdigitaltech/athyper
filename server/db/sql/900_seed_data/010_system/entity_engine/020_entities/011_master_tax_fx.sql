-- 020_entities/011_master_tax_fx.sql
-- Entities 81–83: Tax, FX & Treasury
-- Depends on: shared.module rows (ACC, TREASURY)

DO $$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_acc     text;
    v_treasury text;
BEGIN
    SELECT id::text INTO v_acc     FROM shared.module WHERE code = 'ACC';
    SELECT id::text INTO v_treasury FROM shared.module WHERE code = 'TREASURY';

    -- ── 81. tax_jurisdiction ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'tax_jurisdiction', 'TAXJ', 'tax_jurisdiction', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'tax_jurisdiction',
        'Tax Jurisdiction', 'Tax Jurisdictions', 'landmark', 'orange',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 82. tax_type ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'tax_type', 'TAXTP', 'tax_type', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'tax_type',
        'Tax Type', 'Tax Types', 'percent', 'orange',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 83. fx_rate ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_treasury, 'fx_rate', 'FXR', 'fx_rate', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'locked', 'master', 'fx_rate',
        'FX Rate', 'FX Rates', 'arrow-right-left', 'orange',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
