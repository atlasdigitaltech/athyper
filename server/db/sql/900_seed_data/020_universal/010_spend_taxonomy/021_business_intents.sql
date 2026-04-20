-- ============================================================================
-- ATHYPER GROUP — BASE BUSINESS INTENTS
-- ============================================================================
-- File:     021_business_intents.sql
-- Schema:   master.business_intent
-- Purpose:  6 domain roots + 36 generic leaves = 42 intents
-- Depends:  000_tenant/000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §5 Business Intent Taxonomy
-- ============================================================================
-- PACK OWNS: BI-OPEX, BI-CAPEX, BI-COGS, BI-ADMIN, BI-REG, BI-TRANSFER
--            and all BI-*-* leaf codes created by this file
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '021_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── STAGE B: Stage intent data ───────────────────────────────────────
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,           -- NULL for domain roots
        sort_order  smallint NOT NULL DEFAULT 0,
        is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- DOMAIN ROOTS (6)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, sort_order, is_container) VALUES
    ('BI-OPEX',     'Operating Expenditure',      'Day-to-day operational spending',                                'OPEX',          10, true),
    ('BI-CAPEX',    'Capital Expenditure',         'Long-term asset acquisition and improvement',                    'CAPEX',         20, true),
    ('BI-COGS',     'Cost of Sales',               'Direct costs of goods sold or services delivered',               'COST_OF_SALES', 30, true),
    ('BI-ADMIN',    'Administrative Expense',      'General and administrative overhead',                            'ADMIN',         40, true),
    ('BI-REG',      'Regulatory & Compliance',     'Taxes, statutory fees, and compliance-driven costs',             'REGULATORY',    50, true),
    ('BI-TRANSFER', 'Internal Transfer',           'Inter-company charges and cost re-allocations',                  'TRANSFER',      60, true);

    -- ══════════════════════════════════════════════════════════════════════
    -- OPEX LEAVES (14)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-OPEX-IT',     'IT Operating Expense',             'IT hardware, software, cloud, and support costs',               'OPEX', 'IT',           'BI-OPEX', 11),
    ('BI-OPEX-HR',     'HR & People Operating Expense',    'Recruitment, training, benefits, and welfare costs',            'OPEX', 'HR',           'BI-OPEX', 12),
    ('BI-OPEX-FAC',    'Facilities Operating Expense',     'Rent, maintenance, cleaning, and facility management',          'OPEX', 'FACILITIES',   'BI-OPEX', 13),
    ('BI-OPEX-UTIL',   'Utilities Operating Expense',      'Electricity, water, gas consumption costs',                     'OPEX', 'UTILITIES',    'BI-OPEX', 14),
    ('BI-OPEX-FUEL',   'Fuel & Energy Expense',            'Fleet fuel and non-process energy costs',                       'OPEX', 'FUEL',         'BI-OPEX', 15),
    ('BI-OPEX-INS',    'Insurance Expense',                'Property, liability, and employee insurance premiums',          'OPEX', 'INSURANCE',    'BI-OPEX', 16),
    ('BI-OPEX-PROF',   'Professional Services Expense',    'Legal, audit, consulting, and advisory fees',                   'OPEX', 'PROFESSIONAL', 'BI-OPEX', 17),
    ('BI-OPEX-MKTG',   'Marketing & Comms Expense',        'Marketing campaigns, PR, and customer experience costs',        'OPEX', 'MARKETING',    'BI-OPEX', 18),
    ('BI-OPEX-FLEET',  'Fleet Operating Expense',          'Vehicle lease, fuel, and fleet maintenance costs',              'OPEX', 'FLEET',        'BI-OPEX', 19),
    ('BI-OPEX-SAFETY', 'Safety & Security Expense',        'Security services, HSE, and compliance monitoring',             'OPEX', 'SAFETY',       'BI-OPEX', 20),
    ('BI-OPEX-ENV',    'Environmental Expense',            'ESG, waste management, and remediation costs',                  'OPEX', 'ENVIRONMENT',  'BI-OPEX', 21),
    ('BI-OPEX-MRO',    'MRO Expense',                     'Maintenance parts, tools, and repair supplies',                 'OPEX', 'MRO',          'BI-OPEX', 22),
    ('BI-OPEX-MAINT',  'Maintenance Services Expense',    'Planned and reactive maintenance service contracts',             'OPEX', 'MAINTENANCE',  'BI-OPEX', 23),
    ('BI-OPEX-OUTSRC', 'Outsourcing Expense',             'BPO, shared services, and temporary staffing costs',             'OPEX', 'OUTSOURCING',  'BI-OPEX', 24);

    -- ══════════════════════════════════════════════════════════════════════
    -- CAPEX LEAVES (9)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-CAPEX-IT',    'IT Capital Expenditure',           'Servers, network infrastructure, and major software',           'CAPEX', 'IT',             'BI-CAPEX', 21),
    ('BI-CAPEX-PLANT', 'Plant Capital Expenditure',        'New plant construction and major facility upgrades',            'CAPEX', 'PLANT',          'BI-CAPEX', 22),
    ('BI-CAPEX-EQUIP', 'Equipment Capital Expenditure',    'Production equipment and industrial machinery',                 'CAPEX', 'EQUIPMENT',      'BI-CAPEX', 23),
    ('BI-CAPEX-MACH',  'Machinery Capital Expenditure',    'Heavy machinery, CNC, and automated systems',                   'CAPEX', 'MACHINERY',      'BI-CAPEX', 24),
    ('BI-CAPEX-FLEET', 'Fleet Capital Expenditure',        'Vehicle purchases and fleet expansion',                         'CAPEX', 'FLEET',          'BI-CAPEX', 25),
    ('BI-CAPEX-TOOL',  'Tooling Capital Expenditure',      'Dies, moulds, jigs, and special-purpose tooling',               'CAPEX', 'TOOLING',        'BI-CAPEX', 26),
    ('BI-CAPEX-LEASE', 'Lease Capital Expenditure',        'Finance leases capitalised under IFRS 16',                      'CAPEX', 'LEASE',          'BI-CAPEX', 27),
    ('BI-CAPEX-PROP',  'Property Capital Expenditure',     'Land, buildings, and major property renovations',               'CAPEX', 'PROPERTY',       'BI-CAPEX', 28),
    ('BI-CAPEX-INFRA', 'Infrastructure Capital Expenditure','Roads, bridges, utilities, and civil infrastructure',          'CAPEX', 'INFRASTRUCTURE', 'BI-CAPEX', 29);

    -- ══════════════════════════════════════════════════════════════════════
    -- COST_OF_SALES LEAVES (5)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-MAT',     'Material Cost of Sales',          'Raw materials and components consumed in production',           'COST_OF_SALES', 'MATERIAL',    'BI-COGS', 31),
    ('BI-COGS-SUB',     'Subcontracting Cost of Sales',    'Contract manufacturing and assembly outsourcing costs',         'COST_OF_SALES', 'SUBCONTRACT', 'BI-COGS', 32),
    ('BI-COGS-LABOUR',  'Direct Labour Cost of Sales',     'Production wages, overtime, and shift allowances',              'COST_OF_SALES', 'LABOUR',      'BI-COGS', 33),
    ('BI-COGS-OH',      'Overhead Cost of Sales',          'Factory overhead, depreciation, and indirect production costs', 'COST_OF_SALES', 'OVERHEAD',    'BI-COGS', 34),
    ('BI-COGS-FREIGHT', 'Freight Cost of Sales',           'Inbound/outbound freight directly tied to sales',              'COST_OF_SALES', 'FREIGHT',     'BI-COGS', 35);

    -- ══════════════════════════════════════════════════════════════════════
    -- ADMIN LEAVES (3)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-ADMIN-GEN',   'General Admin Expense',            'Office supplies, travel, and miscellaneous admin costs',        'ADMIN', 'GENERAL', 'BI-ADMIN', 41),
    ('BI-ADMIN-LEGAL', 'Legal & Governance Expense',       'In-house legal, board costs, and governance overhead',          'ADMIN', 'LEGAL',   'BI-ADMIN', 42),
    ('BI-ADMIN-AUDIT', 'Audit & Assurance Expense',        'Internal audit, external audit, and compliance assurance',      'ADMIN', 'AUDIT',   'BI-ADMIN', 43);

    -- ══════════════════════════════════════════════════════════════════════
    -- REGULATORY LEAVES (3)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-REG-TAX',  'Tax & Duties',                        'Corporate tax, VAT, withholding tax, and customs duties',       'REGULATORY', 'TAX',         'BI-REG', 51),
    ('BI-REG-COMP', 'Compliance Cost',                     'Regulatory filings, certifications, and licence fees',          'REGULATORY', 'COMPLIANCE',  'BI-REG', 52),
    ('BI-REG-ENV',  'Environmental Compliance Cost',       'Environmental permits, monitoring, and remediation orders',      'REGULATORY', 'ENVIRONMENT', 'BI-REG', 53);

    -- ══════════════════════════════════════════════════════════════════════
    -- TRANSFER LEAVES (2)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-TRANSFER-IC',   'Inter-company Transfer',         'Cross-entity charges at arms-length transfer pricing',          'TRANSFER', 'INTERCOMPANY',  'BI-TRANSFER', 61),
    ('BI-TRANSFER-RECL', 'Cost Reclass / Reallocation',    'Internal cost reallocation between cost centres',               'TRANSFER', 'REALLOCATION',  'BI-TRANSFER', 62);


    -- ── STAGE C: UPSERT domain roots ─────────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        s.domain,
        s.subtype,
        NULL,               -- root: no parent
        0,                  -- root depth
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text,
            'container', true
        )),
        'active',
        v_su
    FROM tmp_bi s
    WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text,
                             'container', true
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.business_intent.name, master.business_intent.description,
           master.business_intent.domain, master.business_intent.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.domain, EXCLUDED.sort_order);

    -- ── STAGE D: UPSERT intent leaves ────────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        s.domain,
        s.subtype,
        p.id,               -- resolved parent
        1,                  -- leaf depth
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_bi s
    JOIN master.business_intent p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.business_intent.name, master.business_intent.description,
           master.business_intent.domain, master.business_intent.subtype,
           master.business_intent.parent_id, master.business_intent.depth,
           master.business_intent.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.domain, EXCLUDED.subtype,
           EXCLUDED.parent_id, EXCLUDED.depth,
           EXCLUDED.sort_order);

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 40 THEN
        RAISE EXCEPTION '[021_base] Business intent load incomplete: expected ≥40, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND parent_id IS NULL
        AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[021_base] Expected 6 domain roots, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND parent_id IS NULL
             AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[021_base] Business intents loaded: % total (6 roots, % leaves)',
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND parent_id IS NOT NULL
         AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
