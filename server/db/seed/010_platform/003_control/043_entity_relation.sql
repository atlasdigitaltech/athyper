-- Table-owned seed for control.entity_relation
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/004_entity_engine/070_entity_relations.sql
-- ============================================================

-- 070_entity_relations.sql
-- FK/join relationship declarations for master.* entity versions (version_no = 1).
-- Uses a set-based INSERT joining entity names to resolved entity_version_id values.
-- Idempotent: ON CONFLICT (entity_version_id, name) DO NOTHING
-- Run AFTER: 020_entities/*.sql + 025_entity_versions.sql

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    cnt  int;
BEGIN
    -- Guard: ensure entity versions exist
    IF NOT EXISTS (SELECT 1 FROM control.entity_version ev
                   JOIN control.entity e ON e.id = ev.entity_id
                   WHERE e.entity_code = 'principal' AND e.tenant_id IS NULL AND ev.version_no = 1) THEN
        RAISE EXCEPTION 'entity_version rows missing — run 025_entity_versions.sql first';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Bulk insert: resolve entity_version_id via JOIN on entity.name + version_no
    -- Columns: entity(source), rel_name, kind, target_entity, fk_field, on_del
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO control.entity_relation
        (entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, created_by)
    SELECT
        ev.id,
        r.rel_name,
        r.kind,
        r.target_entity,
        r.fk_field,
        r.on_del,
        v_su
    FROM (VALUES

        -- ── IAM: principal ───────────────────────────────────────────────────
        ('principal', 'tenant',              'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('principal', 'personas',            'has_many',   'principal_persona',      'principal_id', 'cascade'),
        ('principal', 'group_memberships',   'has_many',   'auth_group_member',      'principal_id', 'cascade'),
        ('principal', 'access_grants',       'has_many',   'access_grant',           'principal_id', 'cascade'),
        ('principal', 'delegation_grants',   'has_many',   'delegation_grant',       'grantee_id',  'cascade'),
        ('principal', 'feature_grants',      'has_many',   'principal_feature_grant','principal_id', 'cascade'),

        -- ── IAM: auth_group ──────────────────────────────────────────────────
        ('auth_group', 'tenant',             'belongs_to', 'tenant',                'tenant_id',    'restrict'),
        ('auth_group', 'members',            'has_many',   'auth_group_member',     'auth_group_id', 'cascade'),
        ('auth_group', 'role_assignments',   'has_many',   'auth_group_role',       'auth_group_id', 'cascade'),

        -- ── IAM: team ────────────────────────────────────────────────────────
        ('team', 'tenant',                   'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('team', 'members',                  'has_many',   'team_member',           'team_id',     'cascade'),

        -- ── IAM: access_grant ────────────────────────────────────────────────
        ('access_grant', 'tenant',           'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── IAM: delegation_grant ────────────────────────────────────────────
        ('delegation_grant', 'tenant',       'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('delegation_grant', 'grantee',      'belongs_to', 'principal',             'grantee_id',  'restrict'),

        -- ── IAM: label ───────────────────────────────────────────────────────
        ('label', 'tenant',                  'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── IAM: address ─────────────────────────────────────────────────────
        ('address', 'tenant',                'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── Finance org: legal_entity ─────────────────────────────────────────
        ('legal_entity', 'tenant',           'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('legal_entity', 'company_codes',    'has_many',   'company_code',          'legal_entity_id','restrict'),

        -- ── Finance org: company_code ─────────────────────────────────────────
        ('company_code', 'tenant',           'belongs_to', 'tenant',       'tenant_id',       'restrict'),
        ('company_code', 'legal_entity',     'belongs_to', 'legal_entity', 'legal_entity_id', 'restrict'),
        ('company_code', 'cost_centers',     'has_many',   'cost_center',  'company_code_id', 'restrict'),
        ('company_code', 'profit_centers',   'has_many',   'profit_center','company_code_id', 'restrict'),
        ('company_code', 'sites',            'has_many',   'site',         'company_code_id', 'restrict'),
        ('company_code', 'warehouses',       'has_many',   'warehouse',    'company_code_id', 'restrict'),

        -- ── Finance org: cost_center ──────────────────────────────────────────
        ('cost_center', 'company_code',      'belongs_to', 'company_code',          'company_code_id', 'restrict'),

        -- ── Finance org: profit_center ────────────────────────────────────────
        ('profit_center', 'company_code',    'belongs_to', 'company_code',          'company_code_id', 'restrict'),

        -- ── COA / GL: chart_of_account ────────────────────────────────────────
        ('chart_of_account', 'tenant',       'belongs_to', 'tenant',                'tenant_id',           'restrict'),
        ('chart_of_account', 'gl_accounts',  'has_many',   'gl_account',            'chart_of_account_id', 'restrict'),

        -- ── COA / GL: gl_account ──────────────────────────────────────────────
        ('gl_account', 'chart_of_account',   'belongs_to', 'chart_of_account', 'chart_of_account_id', 'restrict'),
        ('gl_account', 'tenant',             'belongs_to', 'tenant',           'tenant_id',           'restrict'),
        ('gl_account', 'parent',             'belongs_to', 'gl_account',       'parent_id',           'set_null'),

        -- ── Business partners: customer ───────────────────────────────────────
        ('customer', 'tenant',               'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('customer', 'company_profiles',     'has_many',   'company_code_customer_profile','customer_id','cascade'),

        -- ── Business partners: supplier ──────────────────────────────────────
        ('supplier', 'tenant',               'belongs_to', 'tenant',                      'tenant_id',   'restrict'),
        ('supplier', 'company_profiles',     'has_many',   'company_code_supplier_profile','supplier_id', 'cascade'),

        -- ── Business partners: company_code_supplier_profile ─────────────────
        ('company_code_supplier_profile', 'supplier',          'belongs_to', 'supplier',                              'supplier_id',        'restrict'),
        ('company_code_supplier_profile', 'company_code',      'belongs_to', 'company_code',                          'company_code_id',    'restrict'),
        ('company_code_supplier_profile', 'intent_policies',   'has_many',   'company_code_supplier_intent_policy',   'supplier_profile_id','cascade'),
        ('company_code_supplier_profile', 'posting_overrides', 'has_many',   'company_code_supplier_posting_override','supplier_profile_id','cascade'),

        -- ── Business partners: supplier profile child extensions ──────────────
        ('company_code_supplier_intent_policy',   'supplier_profile','belongs_to','company_code_supplier_profile','supplier_profile_id','restrict'),
        ('company_code_supplier_posting_override','supplier_profile','belongs_to','company_code_supplier_profile','supplier_profile_id','restrict'),

        -- ── Business partners: employee ───────────────────────────────────────
        ('employee', 'tenant',               'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('employee', 'principal',            'belongs_to', 'principal',             'principal_id','set_null'),

        -- ── Assets ────────────────────────────────────────────────────────────
        ('asset', 'asset_class',             'belongs_to', 'asset_class',           'asset_class_id', 'restrict'),
        ('asset', 'company_code',            'belongs_to', 'company_code',          'company_code_id','restrict'),
        ('asset', 'books',                   'has_many',   'asset_book',            'asset_id',       'cascade'),
        ('asset', 'components',              'has_many',   'asset_component',       'asset_id',       'cascade'),

        -- ── Dimensions ────────────────────────────────────────────────────────
        ('dimension_value', 'dimension_type','belongs_to', 'dimension_type',        'dimension_type_id','restrict'),
        ('dimension_value', 'parent',        'belongs_to', 'dimension_value',       'parent_id',        'set_null'),

        -- ── Tax ───────────────────────────────────────────────────────────────
        ('tax_type', 'tenant',               'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('tax_jurisdiction', 'tenant',       'belongs_to', 'tenant',                'tenant_id',   'restrict'),

        -- ── Budget ────────────────────────────────────────────────────────────
        ('budget_profile', 'tenant',         'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('budget_allocation', 'budget_profile', 'belongs_to','budget_profile',      'budget_profile_id', 'restrict'),
        ('budget_allocation', 'fiscal_period',  'belongs_to','fiscal_period',       'fiscal_period_id',  'restrict'),
        ('budget_allocation', 'company_code',   'belongs_to','company_code',        'company_code_id',   'restrict'),

        -- ── Project ───────────────────────────────────────────────────────────
        ('project', 'tenant',                'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('project', 'company_code',          'belongs_to', 'company_code',          'company_code_id', 'restrict'),
        ('project', 'items',                 'has_many',   'project_item',          'project_id',      'cascade'),

        -- ── Fiscal period ─────────────────────────────────────────────────────
        ('fiscal_period', 'tenant',          'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('fiscal_period', 'company_code',    'belongs_to', 'company_code',          'company_code_id', 'restrict'),

        -- ── Banking ───────────────────────────────────────────────────────────
        ('bank_account', 'bank_party',       'belongs_to', 'bank_party',            'bank_party_id',   'restrict'),
        ('bank_account', 'tenant',           'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('bank_party', 'accounts',           'has_many',   'bank_account',          'bank_party_id',   'restrict'),

        -- ── Payment terms ─────────────────────────────────────────────────────
        ('payment_term', 'tenant',           'belongs_to', 'tenant',                'tenant_id',       'restrict'),
        ('payment_term', 'clauses',          'has_many',   'payment_term_clause',   'payment_term_id', 'cascade'),
        ('payment_term', 'discount_tiers',   'has_many',   'payment_term_discount_tier','payment_term_id','cascade'),

        -- ── Products ──────────────────────────────────────────────────────────
        ('product', 'tenant',                'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('item', 'tenant',                   'belongs_to', 'tenant',                'tenant_id',   'restrict'),
        ('item', 'commodity_category',       'belongs_to', 'commodity_category',    'commodity_category_id', 'restrict'),

        -- ── DOC: Template & document ──────────────────────────────────────────
        ('template',      'tenant',          'belongs_to', 'tenant',          'tenant_id', 'restrict'),
        ('template',      'bindings',        'has_many',   'template_binding','template_id','cascade'),
        ('document',      'tenant',          'belongs_to', 'tenant',          'tenant_id', 'restrict'),
        ('brand_profile', 'tenant',          'belongs_to', 'tenant',          'tenant_id', 'restrict'),
        ('letterhead',    'tenant',          'belongs_to', 'tenant',          'tenant_id', 'restrict'),
        ('print_profile', 'tenant',          'belongs_to', 'tenant',          'tenant_id', 'restrict'),

        -- ── CMS: content_item ─────────────────────────────────────────────────
        ('content_item', 'tenant',           'belongs_to', 'tenant',                'tenant_id',        'restrict'),
        ('content_item', 'links',            'has_many',   'content_item_link',     'content_item_id',  'cascade'),
        ('content_item', 'access_grants',    'has_many',   'content_item_access_grant','content_item_id','cascade'),

        -- ── UI: dashboard ─────────────────────────────────────────────────────
        ('dashboard', 'tenant',              'belongs_to', 'tenant',                'tenant_id',    'restrict'),
        ('dashboard', 'widgets',             'has_many',   'dashboard_widget',      'dashboard_id', 'cascade'),

        -- ── Finance Org: site (no relations existed) ─────────────────────────────
        ('site',         'tenant',           'belongs_to', 'tenant',             'tenant_id',       'restrict'),
        ('site',         'company_code',     'belongs_to', 'company_code',       'company_code_id', 'restrict'),
        ('site',         'cost_centers',     'has_many',   'cost_center',        'site_id',         'set_null'),
        ('site',         'warehouses',       'has_many',   'warehouse',          'site_id',         'restrict'),

        -- ── Finance Org: warehouse ────────────────────────────────────────────────
        ('warehouse',    'tenant',           'belongs_to', 'tenant',             'tenant_id',       'restrict'),
        ('warehouse',    'site',             'belongs_to', 'site',               'site_id',         'restrict'),

        -- ── Finance Org: business_unit (no relations existed) ────────────────────
        ('business_unit','tenant',           'belongs_to', 'tenant',             'tenant_id',       'restrict'),
        ('business_unit','company_code',     'belongs_to', 'company_code',       'company_code_id', 'restrict'),
        ('business_unit','parent',           'belongs_to', 'business_unit',      'parent_id',       'set_null'),
        ('business_unit','head',             'belongs_to', 'principal',          'bu_head_id',      'set_null'),

        -- ── Finance Org: company_code inverse for business_unit ──────────────────
        ('company_code', 'business_units',   'has_many',   'business_unit',      'company_code_id', 'restrict'),

        -- ── Finance Org: cost_center self-ref + dimension links ───────────────────
        ('cost_center',  'parent',           'belongs_to', 'cost_center',        'parent_id',       'set_null'),
        ('cost_center',  'profit_center',    'belongs_to', 'profit_center',      'profit_center_id','set_null'),
        ('cost_center',  'site',             'belongs_to', 'site',               'site_id',         'set_null'),

        -- ── Finance Org: profit_center self-ref ──────────────────────────────────
        ('profit_center','parent',           'belongs_to', 'profit_center',      'parent_id',       'set_null'),

        -- ── Business Partners: business_partner (no relations existed) ───────────
        ('business_partner','tenant',        'belongs_to', 'tenant',             'tenant_id',           'restrict'),
        ('business_partner','customers',     'has_many',   'customer',           'business_partner_id', 'restrict'),
        ('business_partner','suppliers',     'has_many',   'supplier',           'business_partner_id', 'restrict'),

        -- ── Business Partners: BP link on customer / supplier ─────────────────────
        ('customer',     'business_partner', 'belongs_to', 'business_partner',   'business_partner_id', 'restrict'),
        ('supplier',     'business_partner', 'belongs_to', 'business_partner',   'business_partner_id', 'restrict'),

        -- ── Business Partners: company_code_customer_profile (no relations existed)
        ('company_code_customer_profile','customer',     'belongs_to','customer',     'customer_id',     'restrict'),
        ('company_code_customer_profile','company_code', 'belongs_to','company_code', 'company_code_id', 'restrict'),

        -- ── Assets: asset_class (no relations existed) ────────────────────────────
        ('asset_class',  'tenant',           'belongs_to', 'tenant',             'tenant_id',       'restrict'),
        ('asset_class',  'company_code',     'belongs_to', 'company_code',       'company_code_id', 'restrict'),
        ('asset_class',  'parent',           'belongs_to', 'asset_class',        'parent_id',       'set_null'),
        ('asset_class',  'assets',           'has_many',   'asset',              'asset_class_id',  'restrict'),

        -- ── Assets: asset children ────────────────────────────────────────────────
        ('asset_book',              'asset',          'belongs_to','asset','asset_id',           'cascade'),
        ('asset_component',         'parent_asset',   'belongs_to','asset','parent_asset_id',    'cascade'),
        ('asset_component',         'component_asset','belongs_to','asset','component_asset_id', 'restrict'),
        ('asset_component',         'company_code',   'belongs_to','company_code','company_code_id','restrict'),
        ('asset_assignment_history','asset',          'belongs_to','asset','asset_id',           'cascade'),

        -- ── Dimensions: dimension_type inverse ────────────────────────────────────
        ('dimension_type','tenant',  'belongs_to','tenant',          'tenant_id',         'restrict'),
        ('dimension_type','values',  'has_many',  'dimension_value', 'dimension_type_id', 'restrict'),

        -- ── Dimensions: dimension_set (no relations existed) ──────────────────────
        ('dimension_set', 'tenant',  'belongs_to','tenant',             'tenant_id',        'restrict'),
        ('dimension_set', 'items',   'has_many',  'dimension_set_item', 'dimension_set_id', 'cascade'),

        -- ── Dimensions: dimension_set_item (no relations existed) ─────────────────
        ('dimension_set_item','dimension_set',   'belongs_to','dimension_set',   'dimension_set_id',   'cascade'),
        ('dimension_set_item','dimension_type',  'belongs_to','dimension_type',  'dimension_type_id',  'restrict'),
        ('dimension_set_item','dimension_value', 'belongs_to','dimension_value', 'dimension_value_id', 'restrict'),

        -- ── Dimensions: company_code_intent_policy (no relations existed) ─────────
        ('company_code_intent_policy','company_code','belongs_to','company_code',    'company_code_id','restrict'),
        ('company_code_intent_policy','intent',      'belongs_to','business_intent', 'intent_id',      'restrict'),

        -- ── Dimensions: company_code_dimension_default (no relations existed) ──────
        ('company_code_dimension_default','company_code',    'belongs_to','company_code',    'company_code_id',    'restrict'),
        ('company_code_dimension_default','dimension_type',  'belongs_to','dimension_type',  'dimension_type_id',  'restrict'),
        ('company_code_dimension_default','dimension_value', 'belongs_to','dimension_value', 'dimension_value_id', 'restrict'),

        -- ── IAM: principal_persona ────────────────────────────────────────────────
        ('principal_persona','principal','belongs_to','principal','principal_id','cascade'),

        -- ── IAM: auth_group_member ────────────────────────────────────────────────
        ('auth_group_member','auth_group','belongs_to','auth_group','auth_group_id','cascade'),
        ('auth_group_member','principal', 'belongs_to','principal', 'principal_id', 'cascade'),

        -- ── IAM: auth_group_role ──────────────────────────────────────────────────
        ('auth_group_role',  'auth_group','belongs_to','auth_group','auth_group_id','cascade'),

        -- ── IAM: team_member ──────────────────────────────────────────────────────
        ('team_member',      'team',      'belongs_to','team',      'team_id',      'cascade'),
        ('team_member',      'principal', 'belongs_to','principal', 'principal_id', 'cascade'),

        -- ── IAM: principal_feature_grant ──────────────────────────────────────────
        ('principal_feature_grant','principal','belongs_to','principal','principal_id','cascade'),

        -- ── Banking: bank_account_link (no relations existed) ────────────────────
        ('bank_account_link','bank_account','belongs_to','bank_account','bank_account_id','cascade'),
        ('bank_account_link','company_code','belongs_to','company_code','company_code_id','set_null'),

        -- ── Banking: bank_account_house_config (no relations existed) ────────────
        ('bank_account_house_config','bank_account_link','belongs_to','bank_account_link','bank_account_link_id','cascade'),
        ('bank_account_house_config','gl_account',       'belongs_to','gl_account',       'gl_account_id',       'restrict'),

        -- ── Payment Terms: holiday_calendar (no relations existed) ────────────────
        ('holiday_calendar',    'tenant',          'belongs_to','tenant',             'tenant_id',           'restrict'),
        ('holiday_calendar',    'company_code',    'belongs_to','company_code',       'company_code_id',     'set_null'),
        ('holiday_calendar',    'days',            'has_many',  'holiday_calendar_day','holiday_calendar_id','cascade'),

        -- ── Payment Terms: holiday_calendar_day (no relations existed) ───────────
        ('holiday_calendar_day','holiday_calendar','belongs_to','holiday_calendar','holiday_calendar_id','cascade'),

        -- ── Payment Terms: payment_term_clause (no relations existed) ─────────────
        ('payment_term_clause','payment_term','belongs_to','payment_term','payment_term_id','cascade'),

        -- ── Payment Terms: payment_term_discount_tier (no relations existed) ──────
        ('payment_term_discount_tier','payment_term','belongs_to','payment_term','payment_term_id','cascade'),

        -- ── Products: commodity_category (no relations existed) ───────────────────
        ('commodity_category','tenant', 'belongs_to','tenant',             'tenant_id',            'restrict'),
        ('commodity_category','parent', 'belongs_to','commodity_category', 'parent_id',            'set_null'),
        ('commodity_category','items',  'has_many',  'item',               'commodity_category_id','restrict'),

        -- ── CMS: content_item child entities ──────────────────────────────────────
        ('content_item_link',        'content_item','belongs_to','content_item','content_item_id','cascade'),
        ('content_item_access_grant','content_item','belongs_to','content_item','content_item_id','cascade'),

        -- ── UI: dashboard_widget ──────────────────────────────────────────────────
        ('dashboard_widget','dashboard','belongs_to','dashboard','dashboard_id','cascade'),

        -- ── DOC: template_binding ─────────────────────────────────────────────────
        ('template_binding','template','belongs_to','template','template_id','cascade')

    ) AS r(entity, rel_name, kind, target_entity, fk_field, on_del)
    JOIN control.entity         e  ON e.entity_code = r.entity AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id  = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
    ON CONFLICT (entity_version_id, name) DO NOTHING;

    -- Fix: asset.components had fk_field='asset_id'; asset_component table uses parent_asset_id.
    UPDATE control.entity_relation er
       SET fk_field   = 'parent_asset_id',
           updated_at = now(),
           updated_by = v_su
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE er.entity_version_id = ev.id
       AND e.entity_code = 'asset'
       AND ev.tenant_id IS NULL
       AND er.name = 'components'
       AND er.fk_field = 'asset_id';

    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE 'control.entity_relation: % rows inserted (% total)',
        cnt,
        (SELECT count(*) FROM control.entity_relation);
END $$;


-- ============================================================
-- DOMAIN: entity_relation additions from document registrations
-- ============================================================

-- === SOURCE: 001_document_entities.sql ===
-- Journal entry and journal line relations
DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
INSERT INTO control.entity_relation
    (entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, ui_behavior, created_by)
SELECT ev.id, r.name, r.kind, r.target_entity, r.fk_field, r.on_delete, r.ui_behavior, v_su
FROM (VALUES
    ('journal_entry','lines','has_many','journal_line','journal_entry_id','cascade','{"surface":"lines_tab","min_rows":2,"line_editor":true}'::jsonb),
    ('journal_entry','company_code','belongs_to','company_code','company_code_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_entry','ledger_book','belongs_to','ledger_book','book_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_entry','fiscal_period','belongs_to','fiscal_period','fiscal_period_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_entry','reversal_of','belongs_to','journal_entry','reversal_of_id','set_null','{"readonly":true}'::jsonb),
    ('journal_line','journal_entry','belongs_to','journal_entry','journal_entry_id','cascade','{"parent":true}'::jsonb),
    ('journal_line','references','has_many','journal_line_reference','journal_line_id','cascade','{"surface":"line_reference","optional":true,"editor":"reference_picker"}'::jsonb),
    ('journal_line','gl_account','belongs_to','gl_account','gl_account_id','restrict','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','cost_center','belongs_to','cost_center','cost_center_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','profit_center','belongs_to','profit_center','profit_center_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','project','belongs_to','project','project_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line','site','belongs_to','site','site_id','set_null','{"chooser":"inline_search"}'::jsonb),
    ('journal_line_reference','journal_line','belongs_to','journal_line','journal_line_id','cascade','{"parent":true,"append_only_after_submission":true}'::jsonb)
) AS r(entity_code, name, kind, target_entity, fk_field, on_delete, ui_behavior)
JOIN control.entity e ON e.entity_code = r.entity_code AND e.tenant_id IS NULL
JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
ON CONFLICT (entity_version_id, name) DO NOTHING;
END $$;


-- === SOURCE: 003_document_relations.sql ===
-- Purchase invoice, purchase invoice line, and accounting distribution relations
DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    cnt  int;
BEGIN
    -- Soft guard: skip silently if domain entities have not been seeded yet.
    IF NOT EXISTS (
        SELECT 1 FROM control.entity e
        WHERE e.entity_code = 'purchase_invoice' AND e.tenant_id IS NULL
    ) THEN
        RAISE NOTICE '070_entity_relations (document): purchase_invoice entity not found — skipping';
        RETURN;
    END IF;

    INSERT INTO control.entity_relation
        (tenant_id, entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, created_by)
    SELECT
        NULL,
        ev.id,
        r.rel_name,
        r.kind,
        r.target_entity,
        r.fk_field,
        r.on_del,
        v_su
    FROM (VALUES
        ('purchase_invoice', 'supplier',            'belongs_to', 'supplier',                'supplier_id',          'restrict'),
        ('purchase_invoice', 'purchase_order',     'belongs_to', 'purchase_order',           'commitment_id',        'set_null'),
        ('purchase_invoice', 'lines',              'has_many',   'purchase_invoice_line',    'purchase_invoice_id',  'cascade'),
        ('purchase_invoice', 'journal_entry',      'belongs_to', 'journal_entry',            'ap_je_id',             'set_null'),
        ('purchase_invoice', 'payment_term',       'belongs_to', 'payment_term',             'payment_term_id',      'set_null'),
        ('purchase_invoice_line', 'purchase_invoice',   'belongs_to', 'purchase_invoice',        'purchase_invoice_id',  'cascade'),
        ('purchase_invoice_line', 'commodity_category', 'belongs_to', 'commodity_category',           'commodity_category_id',    'set_null'),
        ('purchase_invoice_line', 'distributions',      'has_many',   'accounting_distribution',  'source_line_id',       'cascade'),
        ('accounting_distribution', 'source_invoice_line', 'belongs_to', 'purchase_invoice_line', 'source_line_id',   'cascade'),
        ('accounting_distribution', 'gl_account',          'belongs_to', 'gl_account',             'gl_account_id',   'set_null'),
        ('accounting_distribution', 'cost_center',         'belongs_to', 'cost_center',            'cost_center_id',  'set_null'),
        ('accounting_distribution', 'project',             'belongs_to', 'project',                'project_id',      'set_null')
    ) AS r(entity, rel_name, kind, target_entity, fk_field, on_del)
    JOIN control.entity         e  ON e.entity_code = r.entity AND e.tenant_id IS NULL
    JOIN control.entity_version ev ON ev.entity_id  = e.id
                                  AND ev.version_no  = 1
                                  AND ev.tenant_id   IS NULL
    ON CONFLICT (entity_version_id, name) DO UPDATE
       SET relation_kind = EXCLUDED.relation_kind,
           target_entity = EXCLUDED.target_entity,
           fk_field = EXCLUDED.fk_field,
           on_delete = EXCLUDED.on_delete,
           updated_at = now(),
           updated_by = v_su;

    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE '070_entity_relations (document): % rows upserted', cnt;
END $$;


-- === SOURCE: 006_document_patches.sql ===
-- Purchase invoice relation repair (duplicate of 003 with stale spend_category ref fixed)
DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_relations int;
BEGIN
    INSERT INTO control.entity_relation
        (tenant_id, entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, created_by)
    SELECT
        NULL,
        ev.id,
        r.rel_name,
        r.kind,
        r.target_entity,
        r.fk_field,
        r.on_del,
        v_su
    FROM (VALUES
        ('purchase_invoice', 'supplier', 'belongs_to', 'supplier', 'supplier_id', 'restrict'),
        ('purchase_invoice', 'purchase_order', 'belongs_to', 'purchase_order', 'commitment_id', 'set_null'),
        ('purchase_invoice', 'lines', 'has_many', 'purchase_invoice_line', 'purchase_invoice_id', 'cascade'),
        ('purchase_invoice', 'journal_entry', 'belongs_to', 'journal_entry', 'ap_je_id', 'set_null'),
        ('purchase_invoice', 'payment_term', 'belongs_to', 'payment_term', 'payment_term_id', 'set_null'),
        ('purchase_invoice_line', 'purchase_invoice', 'belongs_to', 'purchase_invoice', 'purchase_invoice_id', 'cascade'),
        ('purchase_invoice_line', 'commodity_category', 'belongs_to', 'commodity_category', 'commodity_category_id', 'set_null'),
        ('purchase_invoice_line', 'distributions', 'has_many', 'accounting_distribution', 'source_line_id', 'cascade'),
        ('accounting_distribution', 'source_invoice_line', 'belongs_to', 'purchase_invoice_line', 'source_line_id', 'cascade'),
        ('accounting_distribution', 'gl_account', 'belongs_to', 'gl_account', 'gl_account_id', 'set_null'),
        ('accounting_distribution', 'cost_center', 'belongs_to', 'cost_center', 'cost_center_id', 'set_null'),
        ('accounting_distribution', 'project', 'belongs_to', 'project', 'project_id', 'set_null')
    ) AS r(entity, rel_name, kind, target_entity, fk_field, on_del)
    JOIN control.entity e
      ON e.entity_code = r.entity
     AND e.tenant_id IS NULL
    JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.version_no = 1
     AND ev.tenant_id IS NULL
    ON CONFLICT (entity_version_id, name) DO UPDATE
       SET relation_kind = EXCLUDED.relation_kind,
           target_entity = EXCLUDED.target_entity,
           fk_field = EXCLUDED.fk_field,
           on_delete = EXCLUDED.on_delete,
           updated_at = now(),
           updated_by = v_su;

    GET DIAGNOSTICS v_relations = ROW_COUNT;
    RAISE NOTICE '070_entity_relations (document patches): % rows upserted', v_relations;
END $$;


-- ============================================================
-- SOURCE: server/db/seed/010_platform/005_domain_registrations/200_document/001_document_entities.sql
-- ============================================================



-- Copy behavior for Journal Entry is intentionally metadata-owned:
-- entity.display_config enables copy, entity_relation decides which children
-- copy, and entity_field.ui_hint.copy_policy decides per-column treatment.
DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    UPDATE control.entity
       SET display_config = COALESCE(display_config, '{}'::jsonb)
           || jsonb_build_object(
                'copy', jsonb_build_object(
                    'enabled', true,
                    'target_status', 'created',
                    'child_relations', jsonb_build_array('lines'),
                    'numbering_source', 'entity_numbering_config',
                    'sequence_padding', 5
                )
              ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'journal_entry'
       AND tenant_id IS NULL;

    UPDATE control.entity_relation er
       SET ui_behavior = COALESCE(er.ui_behavior, '{}'::jsonb)
           || jsonb_build_object('copy', true, 'copy_strategy', 'clone_children'),
           updated_at = now(),
           updated_by = v_su
      FROM control.entity e
      JOIN control.entity_version ev ON ev.entity_id = e.id
     WHERE e.entity_code = 'journal_entry'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ev.tenant_id IS NULL
       AND er.entity_version_id = ev.id
       AND er.name = 'lines';

    WITH policies(entity_code, field_name, policy) AS (
        VALUES
        -- Header identity/lifecycle/audit
        ('journal_entry','id','reset'),
        ('journal_entry','tenant_id','reset'),
        ('journal_entry','code','regenerate'),
        ('journal_entry','name','derive'),
        ('journal_entry','document_no','regenerate'),
        ('journal_entry','status','target_status'),
        ('journal_entry','is_active','derive'),
        ('journal_entry','created_at','reset'),
        ('journal_entry','created_by','reset'),
        ('journal_entry','updated_at','reset'),
        ('journal_entry','updated_by','reset'),
        ('journal_entry','status_changed_at','reset'),
        ('journal_entry','status_changed_by','reset'),

        -- Header business fields
        ('journal_entry','company_code_id','preserve'),
        ('journal_entry','book_id','preserve'),
        ('journal_entry','fiscal_period_id','preserve'),
        ('journal_entry','fiscal_year','derive'),
        ('journal_entry','period_number','derive'),
        ('journal_entry','document_date','preserve'),
        ('journal_entry','posting_date','preserve'),
        ('journal_entry','source_type','default'),
        ('journal_entry','source_doc_id','exclude'),
        ('journal_entry','transaction_currency','preserve'),
        ('journal_entry','base_currency','derive'),
        ('journal_entry','total_debit','reset'),
        ('journal_entry','total_credit','reset'),
        ('journal_entry','line_count','reset'),
        ('journal_entry','description','preserve'),
        ('journal_entry','is_reversal','default'),
        ('journal_entry','reversal_of_id','exclude'),
        ('journal_entry','reversed_by_id','exclude'),
        ('journal_entry','is_auto_reverse','preserve'),
        ('journal_entry','auto_reverse_date','preserve'),
        ('journal_entry','derived_from_je_id','exclude'),
        ('journal_entry','posting_rule_id','exclude'),
        ('journal_entry','book_idempotency_key','exclude'),
        ('journal_entry','is_prior_period','preserve'),
        ('journal_entry','original_period_year','preserve'),
        ('journal_entry','original_period_number','preserve'),
        ('journal_entry','close_override_id','preserve'),
        ('journal_entry','posted_at','reset'),
        ('journal_entry','posted_by','reset'),
        ('journal_entry','tags','preserve'),
        ('journal_entry','metadata','default'),

        -- Line identity/parent/audit
        ('journal_line','id','reset'),
        ('journal_line','tenant_id','reset'),
        ('journal_line','journal_entry_id','reparent'),
        ('journal_line','created_at','reset'),
        ('journal_line','created_by','reset'),
        ('journal_line','updated_at','reset'),
        ('journal_line','updated_by','reset'),

        -- Line header-denormalized/system fields
        ('journal_line','company_code_id','derive'),
        ('journal_line','book_id','derive'),
        ('journal_line','fiscal_period_id','derive'),
        ('journal_line','fiscal_year','derive'),
        ('journal_line','period_number','derive'),
        ('journal_line','posting_date','derive'),
        ('journal_line','base_currency','derive'),
        ('journal_line','dimension_set_id','derive'),
        ('journal_line','source_doc_line_id','exclude'),
        ('journal_line','posted_at','reset'),
        ('journal_line','posted_by','reset'),
        ('journal_line','metadata','default'),

        -- Line business fields
        ('journal_line','line_no','preserve'),
        ('journal_line','gl_account_id','preserve'),
        ('journal_line','transaction_currency','preserve'),
        ('journal_line','transaction_debit','preserve'),
        ('journal_line','transaction_credit','preserve'),
        ('journal_line','base_debit','preserve'),
        ('journal_line','base_credit','preserve'),
        ('journal_line','exchange_rate','preserve'),
        ('journal_line','cost_center_id','preserve'),
        ('journal_line','profit_center_id','preserve'),
        ('journal_line','project_id','preserve'),
        ('journal_line','site_id','preserve'),
        ('journal_line','party_type','preserve'),
        ('journal_line','party_id','preserve'),
        ('journal_line','subledger_type','preserve'),
        ('journal_line','description','preserve'),
        ('journal_line','tags','preserve')
    )
    UPDATE control.entity_field ef
       SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
           || jsonb_build_object('copy_policy', p.policy),
           updated_at = now(),
           updated_by = v_su
      FROM policies p
      JOIN control.entity e ON e.entity_code = p.entity_code
                            AND e.tenant_id IS NULL
      JOIN control.entity_version ev ON ev.entity_id = e.id
                                    AND ev.version_no = 1
                                    AND ev.tenant_id IS NULL
     WHERE ef.entity_version_id = ev.id
       AND ef.name = p.field_name;
END $$;
