-- 020_entities/004_master_doc_template.sql
-- Entities 41–48: Document & Template Framework
-- Depends on: shared.module rows (DOC, WFL)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_doc text;
    v_wfl text;
BEGIN
    SELECT id::text INTO v_doc FROM shared.module WHERE code = 'DOC';
    SELECT id::text INTO v_wfl FROM shared.module WHERE code = 'WFL';

    -- ── 41. document ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'document', 'MDOC', 'document', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'document',
        'Document', 'Documents', 'file-text', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 42. brand_profile ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'brand_profile', 'BRAND', 'brand_profile', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'brand_profile',
        'Brand Profile', 'Brand Profiles', 'palette', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 43. letterhead ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'letterhead', 'LHD', 'letterhead', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'letterhead',
        'Letterhead', 'Letterheads', 'scroll', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 44. template ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'template', 'TMPL', 'template', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'template',
        'Template', 'Templates', 'layout-template', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 45. template_binding ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'template_binding', 'TMPLB', 'template_binding', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'template_binding',
        'Template Binding', 'Template Bindings', 'link-2', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 46. entity_document_link ─────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'entity_document_link', 'EDOC', 'entity_document_link', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'entity_document_link',
        'Entity Document Link', 'Entity Document Links', 'file-symlink', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 47. lifecycle_instance ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_wfl, 'lifecycle_instance', 'LCINS', 'lifecycle_instance', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'locked', 'master', 'lifecycle_instance',
        'Lifecycle Instance', 'Lifecycle Instances', 'git-commit', 'teal',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 48. print_profile ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_doc, 'print_profile', 'PRFIL', 'print_profile', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'print_profile',
        'Print Profile', 'Print Profiles', 'printer', 'violet',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
