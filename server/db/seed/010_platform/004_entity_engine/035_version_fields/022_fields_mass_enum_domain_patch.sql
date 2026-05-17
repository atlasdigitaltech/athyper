-- 035_version_fields/022_fields_mass_enum_domain_patch.sql
-- Comprehensive bulk UPDATE: assigns enum_domain_code to all enum/select fields
-- across all platform entities where the lookup domain is definitively known.
-- Covers 54 field → domain mappings (Pass 1) + 4 data_type promotions (Pass 2).
--
-- Why: field registration files (001–016) insert enum fields using
--   CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
-- for enum_config but omit enum_domain_code (absent from INSERT column list).
-- ON CONFLICT DO NOTHING prevents backfill on re-run — this file UPDATEs instead.
--
-- Pass 1: fields already registered as data_type = 'enum' — assign enum_domain_code.
-- Pass 2: fields registered as data_type = 'string' that should be 'enum' —
--         promote data_type + ui_type and assign enum_domain_code.
--
-- Constraint notes:
--   ef_enum_xor_chk: NOT (enum_config IS NOT NULL AND enum_domain_code IS NOT NULL)
--   → always NULL-out enum_config when assigning enum_domain_code.
--
-- Idempotent: IS DISTINCT FROM guard skips already-patched rows.

DO $$
DECLARE
    v_su   uuid    := '00000000-0000-0000-0000-000000000000';
    v_main integer := 0;
    v_type integer := 0;
BEGIN

    -- ══════════════════════════════════════════════════════════════════════════
    -- PASS 1 — Fields with data_type = 'enum':
    --          assign enum_domain_code, clear enum_config.
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE control.entity_field ef
    SET
        enum_domain_code = mapping.domain,
        enum_config      = NULL,
        updated_at       = now(),
        updated_by       = v_su
    FROM (VALUES
        -- ── IAM / Identity (001_fields_identity) ──────────────────────────────
        ('tenant',                         'subscription',        'master.tenant_subscription'),
        ('principal',                      'principal_type',      'master.principal_type'),
        ('contact_link',                   'channel_type',        'master.contact_link_channel_type'),
        ('contact_link',                   'purpose',             'master.contact_link_purpose'),
        ('address',                        'address_type',        'master.address_type'),
        ('address_link',                   'purpose',             'master.address_purpose'),
        ('delegation_grant',               'scope_type',          'master.delegation_scope'),
        -- ── Notifications (002_fields_notifications) ──────────────────────────
        ('notification',                   'channel',             'notification.channel'),
        ('notification',                   'category',            'notification.category'),
        ('notification',                   'priority',            'notification.priority'),
        -- ── Template / Document (004_fields_doc_template) ─────────────────────
        ('template',                       'kind',                'master.template_kind'),
        ('template',                       'engine',              'master.template_engine'),
        -- ── Finance Org (005_fields_finance_org) ──────────────────────────────
        -- cost_center: field name='cost_center_type', column_name='cost_center_category'
        -- profit_center: field name='pc_type', column_name='profit_center_type'
        ('legal_entity',                   'entity_type',         'master.legal_entity_type'),
        ('cost_center',                    'cost_center_category','master.cost_center_category'),
        ('cost_center',                    'node_type',           'master.cost_center_node_type'),
        ('profit_center',                  'profit_center_type',  'master.profit_center_type'),
        ('warehouse',                      'warehouse_type',      'master.warehouse_type'),
        -- ── COA / GL (006_fields_coa_gl) ──────────────────────────────────────
        -- chart_of_account: field name='coa_type', column_name='framework'
        -- gl_account: field name='account_nature', column_name='account_class'
        ('chart_of_account',               'framework',           'master.chart_of_account_framework'),
        ('gl_account_type',                'account_class',       'master.gl_account_class'),
        ('gl_account_type',                'normal_balance',      'master.gl_account_balance'),
        ('gl_account',                     'account_class',       'master.gl_account_class'),
        ('gl_account',                     'node_type',           'master.gl_account_node_type'),
        ('gl_account',                     'normal_balance',      'master.gl_account_balance'),
        -- ── Project / Fiscal (007_fields_project_fiscal) ──────────────────────
        ('project',                        'project_type',        'master.project_type'),
        ('project_item',                   'item_type',           'master.project_item_type'),
        ('fiscal_period',                  'period_type',         'master.fiscal_period_type'),
        -- ── Business Partners (008_fields_partners) ───────────────────────────
        ('customer',                       'customer_type',       'master.customer_type'),
        ('supplier',                       'supplier_type',       'master.supplier_type'),
        ('employee',                       'employment_type',     'master.employment_type'),
        -- ── Assets (009_fields_assets) ────────────────────────────────────────
        ('asset_class',                    'asset_nature',        'master.asset_nature'),
        ('asset',                          'retirement_type',     'master.asset_retirement_type'),
        ('asset_book',                     'book_type',           'master.asset_book_type'),
        ('asset_book',                     'depreciation_method', 'master.depreciation_method'),
        ('asset_assignment_history',       'assignment_type',     'master.asset_assignment_type'),
        -- ── Dimensions (010_fields_dimensions) ────────────────────────────────
        ('dimension_type',                 'category',            'master.dimension_type_category'),
        -- ── Banking (013_fields_banking) ──────────────────────────────────────
        ('bank_party',                     'institution_type',    'master.bank_party_institution_type'),
        ('bank_account',                   'account_id_type',     'master.bank_account_id_type'),
        ('bank_account',                   'account_nature',      'master.bank_account_nature'),
        ('bank_account_house_config',      'usage_type',          'master.bank_account_usage_type'),
        ('bank_account_house_config',      'reconciliation_mode', 'master.bank_account_reconciliation_mode'),
        ('payment_method',                 'direction',           'master.payment_method_direction'),
        ('payment_method',                 'instrument_mode',     'master.payment_method_instrument_mode'),
        -- ── Payment Terms (014_fields_payment_terms) ──────────────────────────
        ('payment_term',                   'base_event',          'master.payment_term_trigger_event'),
        ('payment_term',                   'term_category',       'master.payment_term_category'),
        ('payment_term_clause',            'recovery_method',     'master.payment_term_recovery_method'),
        -- ── UI / CMS / Notifications (016_fields_ui) ──────────────────────────
        ('principal_ui_profile',           'appearance_mode',     'ui.appearance_mode'),
        ('principal_ui_profile',           'density_code',        'ui.density'),
        ('saved_view',                     'scope',               'ui.view_scope'),
        ('dashboard',                      'scope',               'ui.dashboard_scope'),
        ('dashboard_widget',               'widget_type_code',    'ui.widget_type'),
        ('principal_notification_preference','channel',           'notification.channel'),
        ('principal_notification_preference','frequency_code',    'notification.digest_frequency'),
        ('content_item',                   'kind',                'master.content_item_kind'),
        ('content_item_link',              'relation_type',       'master.content_item_link_relation_type')
    ) AS mapping(ename, col, domain),
    control.entity_version ev,
    control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id         = e.id
      AND e.name               = mapping.ename
      AND ef.column_name       = mapping.col
      AND ev.version_no        = 1
      AND e.tenant_id          IS NULL
      AND ef.enum_domain_code IS DISTINCT FROM mapping.domain;

    GET DIAGNOSTICS v_main = ROW_COUNT;
    RAISE NOTICE 'Pass 1 (enum_domain_code only): % rows updated', v_main;

    -- ══════════════════════════════════════════════════════════════════════════
    -- PASS 2 — Fields registered as data_type = 'string' that should be 'enum'.
    --          Promote data_type + ui_type and assign enum_domain_code.
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE control.entity_field ef
    SET
        data_type        = 'enum',
        ui_type          = 'select',
        enum_domain_code = patch.domain,
        enum_config      = NULL,
        updated_at       = now(),
        updated_by       = v_su
    FROM (VALUES
        -- ledger_book.category: registered as data_type='string', ui_type='select'
        ('ledger_book',   'category',             'master.ledger_book_category'),
        -- gl_account.subledger_type: registered as data_type='string', ui_type='text'
        ('gl_account',    'subledger_type',        'master.gl_account_subledger'),
        -- company_code.fiscal_year_variant: registered as data_type='string', ui_type='text'
        ('company_code',  'fiscal_year_variant',   'master.company_code_fy_variant'),
        -- company_code.regulatory_framework: registered as data_type='string', ui_type='text'
        ('company_code',  'regulatory_framework',  'master.company_code_framework')
    ) AS patch(ename, col, domain),
    control.entity_version ev,
    control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id         = e.id
      AND e.name               = patch.ename
      AND ef.column_name       = patch.col
      AND ev.version_no        = 1
      AND e.tenant_id          IS NULL
      AND ef.enum_domain_code IS DISTINCT FROM patch.domain;

    GET DIAGNOSTICS v_type = ROW_COUNT;
    RAISE NOTICE 'Pass 2 (data_type promotion + enum_domain_code): % rows updated', v_type;

    RAISE NOTICE 'Mass enum domain patch complete: % + % = % total field updates',
        v_main, v_type, v_main + v_type;

END $$;
