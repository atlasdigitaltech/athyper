-- Technostat supplier 100% dataset seed
-- Purpose:
--   1. Complete supplier-side coverage for app index, spend categories,
--      qualification, block history, company-code profiles, intent policies,
--      spend policies, and posting overrides.
--   2. Keep every demo supplier usable for AP/procurement demos. Block rows are
--      historical and lifted, not active operational holds.
--   3. Seed the business-intent layer needed for supplier buying policies without
--      introducing SAP-style purchasing org/group concepts.

DO $technostat_supplier_100pct$
DECLARE
  v_tenant_id uuid;
  v_system_user_id uuid := '00000000-0000-0000-0000-000000000000';
  v_supplier_total integer;
  v_supplier_app_index_count integer;
  v_supplier_spend_category_count integer;
  v_supplier_qualification_count integer;
  v_supplier_block_count integer;
  v_supplier_profile_count integer;
  v_profile_with_spend_policy_count integer;
  v_profile_with_intent_policy_count integer;
  v_profile_with_posting_override_count integer;
BEGIN
  SELECT t.id
    INTO v_tenant_id
    FROM master.tenant t
   WHERE t.realm_key = 'athyper'
     AND t.code = 'technostat';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Technostat tenant not found';
  END IF;

  -- Seed demo onboarding supplier (SUP-MOTRM3B8) if not yet present.
  -- This supplier is deliberately kept at status=onboarding so that spend-policy
  -- logic in this file correctly produces blocked/pending/restricted rows for it.
  INSERT INTO master.business_partner (
    tenant_id, code, name, display_name, legal_name,
    partner_category, description,
    registration_no, registration_country_code,
    aliases, business_types, legal_form,
    tags, metadata, status, created_by
  )
  SELECT v_tenant_id,
    'BP-MOTRM3B8',
    'Test Tech Solutions LLC',
    'Test Tech',
    'Test Tech Solutions Limited Liability Company',
    'organization',
    'Demo onboarding hardware supplier for restricted procurement workflow.',
    'CR-DEMO-MOTRM3B8', 'SA',
    ARRAY['Test Tech', 'TestTech'],
    ARRAY['technology', 'hardware'],
    'limited_liability',
    '["demo", "onboarding", "ksa"]'::jsonb,
    jsonb_build_object(
      '_seed', jsonb_build_object('pack', 'technostat_supplier_100pct')
    ),
    'active', v_system_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM master.business_partner
     WHERE tenant_id = v_tenant_id AND code = 'BP-MOTRM3B8'
  );

  INSERT INTO master.supplier (
    tenant_id, business_partner_id, supplier_code, supplier_type,
    is_payment_ready,
    metadata, status, created_by
  )
  SELECT v_tenant_id,
    bp.id,
    'SUP-MOTRM3B8', 'service',
    false,
    jsonb_build_object(
      '_seed', jsonb_build_object('pack', 'technostat_supplier_100pct')
    ),
    'onboarding', v_system_user_id
  FROM master.business_partner bp
  WHERE bp.tenant_id = v_tenant_id
    AND bp.code = 'BP-MOTRM3B8'
    AND NOT EXISTS (
      SELECT 1 FROM master.supplier
       WHERE tenant_id = v_tenant_id AND supplier_code = 'SUP-MOTRM3B8'
    );

  CREATE TEMP TABLE tmp_technostat_supplier_category (
    supplier_code text NOT NULL,
    spend_category_code text NOT NULL,
    is_primary boolean NOT NULL,
    effective_from date NOT NULL,
    notes text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_technostat_supplier_category (
    supplier_code,
    spend_category_code,
    is_primary,
    effective_from,
    notes
  ) VALUES
    ('SUP-TKSA-AMTS-001', 'SC-IT-SVC', true,  DATE '2025-01-01', 'Primary managed services and implementation partner for TKSA'),
    ('SUP-TKSA-AMTS-001', 'SC-IT-SW',  false, DATE '2025-01-01', 'Approved subscription and software renewals'),
    ('SUP-TKSA-AMTS-001', 'SC-IT-HW',  false, DATE '2025-01-01', 'Approved endpoint and network hardware resale'),

    ('SUP-SSK-ANIC-001', 'SC-IT-HW',       true,  DATE '2025-01-01', 'Primary approved hardware contractor for SSK'),
    ('SUP-SSK-ANIC-001', 'SC-IT-SVC',      false, DATE '2025-01-01', 'Approved installation and managed support services'),
    ('SUP-SSK-ANIC-001', 'SC-CONST-EQUIP', false, DATE '2025-01-01', 'Approved site equipment packages'),

    ('SUP-TEGY-NTP-001', 'SC-IT-SVC',    true,  DATE '2025-01-01', 'Primary technology services partner for TEGY'),
    ('SUP-TEGY-NTP-001', 'SC-PROF-MGMT', false, DATE '2025-01-01', 'Approved advisory and project governance services'),
    ('SUP-TEGY-NTP-001', 'SC-IT-SW',     false, DATE '2025-01-01', 'Approved software and cloud subscriptions'),

    ('SUP-SDTX-CSI-001', 'SC-IT-HW',       true,  DATE '2025-01-01', 'Primary hardware and systems integration partner for SDTX'),
    ('SUP-SDTX-CSI-001', 'SC-IT-SVC',      false, DATE '2025-01-01', 'Approved implementation and support services'),
    ('SUP-SDTX-CSI-001', 'SC-FACIL-MAINT', false, DATE '2025-01-01', 'Approved facilities technology maintenance'),

    ('SUP-GLB-GPS-001', 'SC-PROF-MGMT', true,  DATE '2025-01-01', 'Primary global advisory supplier for group programs'),
    ('SUP-GLB-GPS-001', 'SC-IT-SVC',    false, DATE '2025-01-01', 'Approved IT advisory and delivery assurance'),
    ('SUP-GLB-GPS-001', 'SC-PROF-AUDIT', false, DATE '2025-01-01', 'Approved internal controls and assurance support'),
    ('SUP-GLB-GPS-001', 'SC-PROF-LEGAL', false, DATE '2025-01-01', 'Approved contract and compliance advisory'),

    ('SUP-GLB-MGI-001', 'SC-IT-SVC',    true,  DATE '2025-01-01', 'Primary global managed services supplier'),
    ('SUP-GLB-MGI-001', 'SC-PROF-MGMT', false, DATE '2025-01-01', 'Approved transformation consulting services'),
    ('SUP-GLB-MGI-001', 'SC-IT-SW',     false, DATE '2025-01-01', 'Approved enterprise software subscriptions'),

    ('SUP-TKSA', 'SC-PROF-MGMT',  true,  DATE '2025-01-01', 'Intercompany shared service recharge from TKSA'),
    ('SUP-TKSA', 'SC-FACIL-UTIL', false, DATE '2025-01-01', 'Intercompany facilities and common cost recharge'),

    ('SUP-SSK', 'SC-IT-SVC',      true,  DATE '2025-01-01', 'Intercompany technology shared service recharge from SSK'),
    ('SUP-SSK', 'SC-FACIL-MAINT', false, DATE '2025-01-01', 'Intercompany maintenance and operational support recharge'),

    ('SUP-TEGY', 'SC-PROF-MGMT', true,  DATE '2025-01-01', 'Intercompany management and finance shared service recharge from TEGY'),
    ('SUP-TEGY', 'SC-TRADE-LOC', false, DATE '2025-01-01', 'Intercompany local trading support recharge'),

    ('SUP-SDTX', 'SC-IT-SVC',    true,  DATE '2025-01-01', 'Intercompany digital transformation shared service recharge from SDTX'),
    ('SUP-SDTX', 'SC-TRADE-IMP', false, DATE '2025-01-01', 'Intercompany import and integration support recharge'),

    ('SUP-MOTRM3B8', 'SC-IT-HW',  true,  DATE '2025-01-01', 'Demo onboarding supplier primary hardware category'),
    ('SUP-MOTRM3B8', 'SC-IT-SVC', false, DATE '2025-01-01', 'Demo onboarding supplier support service category');

  CREATE TEMP TABLE tmp_technostat_supplier_qualification (
    supplier_code text NOT NULL,
    onboarding_status text NOT NULL,
    profile_completeness_pct smallint NOT NULL,
    is_approved_supplier boolean NOT NULL,
    is_preferred_supplier boolean NOT NULL,
    risk_tier text NOT NULL,
    delivery_score numeric(5,2) NOT NULL,
    quality_score numeric(5,2) NOT NULL,
    sla_score numeric(5,2) NOT NULL,
    sanctions_status text NOT NULL,
    aml_kyc_status text NOT NULL,
    notes text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_technostat_supplier_qualification VALUES
    ('SUP-TKSA-AMTS-001', 'approved',     98, true,  true,  'low',    92.00, 94.00, 90.00, 'clear', 'passed',      'Approved strategic technology services supplier'),
    ('SUP-SSK-ANIC-001',  'approved',     96, true,  false, 'medium', 88.00, 89.00, 86.00, 'clear', 'passed',      'Approved construction technology contractor'),
    ('SUP-TEGY-NTP-001',  'approved',     97, true,  true,  'low',    91.00, 92.00, 88.00, 'clear', 'passed',      'Approved Egypt technology services partner'),
    ('SUP-SDTX-CSI-001',  'approved',     95, true,  false, 'medium', 90.00, 88.00, 84.00, 'clear', 'passed',      'Approved systems integration contractor'),
    ('SUP-GLB-GPS-001',   'approved',     99, true,  true,  'low',    93.00, 96.00, 92.00, 'clear', 'passed',      'Approved global professional services supplier'),
    ('SUP-GLB-MGI-001',   'approved',     98, true,  true,  'low',    94.00, 95.00, 91.00, 'clear', 'passed',      'Approved global managed services supplier'),
    ('SUP-TKSA',          'approved',    100, true,  false, 'low',    96.00, 96.00, 96.00, 'clear', 'passed',      'Intercompany supplier controlled by group finance'),
    ('SUP-SSK',           'approved',    100, true,  false, 'low',    96.00, 96.00, 96.00, 'clear', 'passed',      'Intercompany supplier controlled by group finance'),
    ('SUP-TEGY',          'approved',    100, true,  false, 'low',    96.00, 96.00, 96.00, 'clear', 'passed',      'Intercompany supplier controlled by group finance'),
    ('SUP-SDTX',          'approved',    100, true,  false, 'low',    96.00, 96.00, 96.00, 'clear', 'passed',      'Intercompany supplier controlled by group finance'),
    ('SUP-MOTRM3B8',      'in_progress',  72, false, false, 'medium', 65.00, 68.00, 70.00, 'clear', 'in_progress', 'Demo onboarding supplier retained for restricted buying workflow');

  CREATE TEMP TABLE tmp_technostat_supplier_profile (
    supplier_code text NOT NULL,
    company_code text NOT NULL,
    payment_term_code text NOT NULL,
    profile_class text NOT NULL,
    notes text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_technostat_supplier_profile VALUES
    ('SUP-TKSA-AMTS-001', 'TKSA', 'PT-NET30', 'local_services', 'Local Saudi technology services profile'),
    ('SUP-SSK-ANIC-001',  'SSK',  'PT-NET45', 'local_contractor', 'Local Saudi contractor profile'),
    ('SUP-TEGY-NTP-001',  'TEGY', 'PT-NET30', 'local_services', 'Local Egypt technology services profile'),
    ('SUP-SDTX-CSI-001',  'SDTX', 'PT-NET30', 'local_contractor', 'Local Egypt systems integration profile'),

    ('SUP-GLB-GPS-001', 'TKSA', 'PT-NET30', 'global_services', 'Global professional services profile for TKSA'),
    ('SUP-GLB-GPS-001', 'SSK',  'PT-NET30', 'global_services', 'Global professional services profile for SSK'),
    ('SUP-GLB-GPS-001', 'TEGY', 'PT-NET30', 'global_services', 'Global professional services profile for TEGY'),
    ('SUP-GLB-GPS-001', 'SDTX', 'PT-NET30', 'global_services', 'Global professional services profile for SDTX'),

    ('SUP-GLB-MGI-001', 'TKSA', 'PT-NET30', 'global_services', 'Global managed services profile for TKSA'),
    ('SUP-GLB-MGI-001', 'SSK',  'PT-NET30', 'global_services', 'Global managed services profile for SSK'),
    ('SUP-GLB-MGI-001', 'TEGY', 'PT-NET30', 'global_services', 'Global managed services profile for TEGY'),
    ('SUP-GLB-MGI-001', 'SDTX', 'PT-NET30', 'global_services', 'Global managed services profile for SDTX'),

    ('SUP-TKSA', 'SSK',  'PT-NET30', 'intercompany', 'Intercompany supplier profile from TKSA to SSK'),
    ('SUP-TKSA', 'TEGY', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from TKSA to TEGY'),
    ('SUP-TKSA', 'SDTX', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from TKSA to SDTX'),

    ('SUP-SSK', 'TKSA', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from SSK to TKSA'),
    ('SUP-SSK', 'TEGY', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from SSK to TEGY'),
    ('SUP-SSK', 'SDTX', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from SSK to SDTX'),

    ('SUP-TEGY', 'TKSA', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from TEGY to TKSA'),
    ('SUP-TEGY', 'SSK',  'PT-NET30', 'intercompany', 'Intercompany supplier profile from TEGY to SSK'),
    ('SUP-TEGY', 'SDTX', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from TEGY to SDTX'),

    ('SUP-SDTX', 'TKSA', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from SDTX to TKSA'),
    ('SUP-SDTX', 'SSK',  'PT-NET30', 'intercompany', 'Intercompany supplier profile from SDTX to SSK'),
    ('SUP-SDTX', 'TEGY', 'PT-NET30', 'intercompany', 'Intercompany supplier profile from SDTX to TEGY'),

    ('SUP-MOTRM3B8', 'TKSA', 'PT-NET30', 'onboarding_demo', 'Restricted demo onboarding profile for Test Tech');

  CREATE TEMP TABLE tmp_technostat_business_intent (
    code text NOT NULL,
    name text NOT NULL,
    domain text NOT NULL,
    intent_family text NOT NULL,
    sort_order integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_technostat_business_intent VALUES
    ('OPEX-IT',          'IT Operating Expense',           'OPEX',          'information_technology', 201),
    ('OPEX-IT-SUB',      'IT Subscriptions',               'OPEX',          'information_technology', 202),
    ('CAPEX-IT',         'IT Capital Purchase',            'CAPEX',         'information_technology', 203),
    ('CAPEX-IT-LIC',     'Capitalized IT License',         'CAPEX',         'information_technology', 204),
    ('OPEX-CONSULT',     'Consulting Services',            'OPEX',          'professional_services',  211),
    ('OPEX-LEGAL',       'Legal Services',                 'OPEX',          'professional_services',  212),
    ('REG-AUDIT',        'Audit And Assurance',            'REGULATORY',    'professional_services',  213),
    ('OPEX-FAC-RENT',    'Facility Rent',                  'OPEX',          'facilities',             221),
    ('OPEX-FAC-MAINT',   'Facility Maintenance',           'OPEX',          'facilities',             222),
    ('OPEX-OFFICE',      'Office Operating Supplies',      'OPEX',          'facilities',             223),
    ('CAPEX-EQUIP',      'Equipment Capital Purchase',     'CAPEX',         'capital_projects',       231),
    ('COGS-RAW',         'Raw Materials And Trade Goods',  'COST_OF_SALES', 'trade',                  241),
    ('COGS-FREIGHT-IN',  'Inbound Freight',                'COST_OF_SALES', 'trade',                  242),
    ('TRANSFER-IC',      'Intercompany Transfer',          'TRANSFER',      'intercompany',           251);

  CREATE TEMP TABLE tmp_technostat_category_intent_map (
    spend_category_code text NOT NULL,
    intent_code text NOT NULL,
    is_primary_intent boolean NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_technostat_category_intent_map VALUES
    ('SC-IT-HW',       'OPEX-IT',         true),
    ('SC-IT-HW',       'CAPEX-IT',        false),
    ('SC-IT-SVC',      'OPEX-IT',         true),
    ('SC-IT-SW',       'OPEX-IT-SUB',     true),
    ('SC-IT-SW',       'CAPEX-IT-LIC',    false),
    ('SC-PROF-MGMT',   'OPEX-CONSULT',    true),
    ('SC-PROF-AUDIT',  'REG-AUDIT',       true),
    ('SC-PROF-LEGAL',  'OPEX-LEGAL',      true),
    ('SC-FACIL-MAINT', 'OPEX-FAC-MAINT',  true),
    ('SC-FACIL-RENT',  'OPEX-FAC-RENT',   true),
    ('SC-FACIL-UTIL',  'OPEX-OFFICE',     true),
    ('SC-CONST-EQUIP', 'CAPEX-EQUIP',     true),
    ('SC-CONST-MAT',   'COGS-RAW',        true),
    ('SC-TRADE-IMP',   'COGS-FREIGHT-IN', true),
    ('SC-TRADE-IMP',   'COGS-RAW',        false),
    ('SC-TRADE-LOC',   'COGS-RAW',        true);

  -- Prerequisite checks: NOTICE (not EXCEPTION) so partial re-migrations
  -- (where 006/007 checksums are unchanged and skipped) don't hard-fail.
  -- All downstream inserts use JOINs and naturally skip missing rows.
  IF EXISTS (
    SELECT 1
      FROM tmp_technostat_supplier_category d
      LEFT JOIN master.supplier s
        ON s.tenant_id = v_tenant_id
       AND s.supplier_code = d.supplier_code
     WHERE s.id IS NULL
  ) THEN
    RAISE NOTICE 'Some Technostat supplier codes not yet seeded — spend-category/qualification rows for those suppliers will be skipped. Run 006/007 first for full coverage.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM tmp_technostat_supplier_category d
      LEFT JOIN master.spend_category sc
        ON sc.tenant_id = v_tenant_id
       AND sc.code = d.spend_category_code
     WHERE sc.id IS NULL
  ) THEN
    RAISE NOTICE 'Some Technostat spend category codes not yet seeded — related rows will be skipped. Run universal/industry seeds first for full coverage.';
  END IF;

  INSERT INTO master.business_intent (
    tenant_id,
    code,
    name,
    description,
    domain,
    status,
    subtype,
    sort_order,
    metadata,
    created_by,
    updated_by
  )
  SELECT v_tenant_id,
         d.code,
         d.name,
         d.name || ' for Technostat supplier policy routing',
         d.domain,
         'active',
         d.intent_family,
         d.sort_order,
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'business_intent_source', 'supplier_policy'
         ),
         v_system_user_id,
         v_system_user_id
    FROM tmp_technostat_business_intent d
  ON CONFLICT (tenant_id, code) DO UPDATE
     SET name = EXCLUDED.name,
         description = EXCLUDED.description,
         domain = EXCLUDED.domain,
         status = 'active',
         subtype = EXCLUDED.subtype,
         sort_order = EXCLUDED.sort_order,
         metadata = COALESCE(master.business_intent.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_by = v_system_user_id,
         updated_at = now();

  UPDATE master.spend_category sc
     SET default_intent_id = bi.id,
         metadata = COALESCE(sc.metadata, '{}'::jsonb) || jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'default_intent_seeded', true
         ),
         updated_by = v_system_user_id,
         updated_at = now()
    FROM tmp_technostat_category_intent_map m
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tenant_id
     AND bi.code = m.intent_code
   WHERE sc.tenant_id = v_tenant_id
     AND sc.code = m.spend_category_code
     AND m.is_primary_intent;

  UPDATE master.supplier s
     SET anticipated_risk_tier = q.risk_tier,
         metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'primary_spend_category_code', d.spend_category_code,
           'spend_category_source', 'master.supplier_spend_category'
         ),
         updated_by = v_system_user_id,
         updated_at = now()
    FROM tmp_technostat_supplier_category d
    JOIN tmp_technostat_supplier_qualification q
      ON q.supplier_code = d.supplier_code
   WHERE s.tenant_id = v_tenant_id
     AND s.supplier_code = d.supplier_code
     AND d.is_primary;

  UPDATE master.supplier_spend_category ssc
     SET is_primary = false,
         updated_by = v_system_user_id,
         updated_at = now()
   WHERE ssc.tenant_id = v_tenant_id
     AND ssc.supplier_id IN (
       SELECT s.id
         FROM master.supplier s
         JOIN tmp_technostat_supplier_category d
           ON d.supplier_code = s.supplier_code
        WHERE s.tenant_id = v_tenant_id
     )
     AND ssc.is_primary;

  INSERT INTO master.supplier_spend_category (
    tenant_id,
    supplier_id,
    spend_category_id,
    is_primary,
    effective_from,
    status,
    notes,
    metadata,
    created_by,
    updated_by
  )
  SELECT v_tenant_id,
         s.id,
         sc.id,
         d.is_primary,
         d.effective_from,
         'active',
         d.notes,
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'supplier_code', d.supplier_code,
           'spend_category_code', d.spend_category_code
         ),
         v_system_user_id,
         v_system_user_id
    FROM tmp_technostat_supplier_category d
    JOIN master.supplier s
      ON s.tenant_id = v_tenant_id
     AND s.supplier_code = d.supplier_code
    JOIN master.spend_category sc
      ON sc.tenant_id = v_tenant_id
     AND sc.code = d.spend_category_code
  ON CONFLICT (tenant_id, supplier_id, spend_category_id) DO UPDATE
     SET is_primary = EXCLUDED.is_primary,
         effective_from = EXCLUDED.effective_from,
         effective_until = NULL,
         status = 'active',
         notes = EXCLUDED.notes,
         metadata = COALESCE(master.supplier_spend_category.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_by = v_system_user_id,
         updated_at = now();

  INSERT INTO master.supplier_qualification (
    tenant_id,
    supplier_id,
    onboarding_status,
    profile_completeness_pct,
    onboarding_approved_at,
    onboarding_approved_by,
    is_approved_supplier,
    is_preferred_supplier,
    risk_tier,
    sanctions_status,
    aml_kyc_status,
    sanctions_check_date,
    kyc_expiry_date,
    sourcing_event_count,
    bid_count,
    awarded_count,
    delivery_score,
    quality_score,
    sla_score,
    score_period_start,
    score_period_end,
    last_review_date,
    next_review_date,
    reviewed_by,
    block_reason,
    block_start_date,
    metadata,
    created_by,
    updated_by
  )
  SELECT v_tenant_id,
         s.id,
         q.onboarding_status,
         q.profile_completeness_pct,
         CASE WHEN q.is_approved_supplier THEN TIMESTAMPTZ '2025-01-15 08:00:00+00' ELSE NULL END,
         CASE WHEN q.is_approved_supplier THEN v_system_user_id ELSE NULL END,
         q.is_approved_supplier,
         q.is_preferred_supplier,
         q.risk_tier,
         q.sanctions_status,
         q.aml_kyc_status,
         DATE '2025-01-10',
         DATE '2027-01-10',
         CASE WHEN q.is_approved_supplier THEN 4 ELSE 0 END,
         CASE WHEN q.is_approved_supplier THEN 7 ELSE 0 END,
         CASE WHEN q.is_approved_supplier THEN 3 ELSE 0 END,
         q.delivery_score,
         q.quality_score,
         q.sla_score,
         DATE '2025-01-01',
         DATE '2025-12-31',
         DATE '2025-01-15',
         DATE '2026-01-15',
         v_system_user_id,
         NULL,
         NULL,
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'supplier_code', q.supplier_code,
           'notes', q.notes
         ),
         v_system_user_id,
         v_system_user_id
    FROM tmp_technostat_supplier_qualification q
    JOIN master.supplier s
      ON s.tenant_id = v_tenant_id
     AND s.supplier_code = q.supplier_code
  ON CONFLICT (tenant_id, supplier_id) DO UPDATE
     SET onboarding_status = EXCLUDED.onboarding_status,
         profile_completeness_pct = EXCLUDED.profile_completeness_pct,
         onboarding_approved_at = EXCLUDED.onboarding_approved_at,
         onboarding_approved_by = EXCLUDED.onboarding_approved_by,
         is_approved_supplier = EXCLUDED.is_approved_supplier,
         is_preferred_supplier = EXCLUDED.is_preferred_supplier,
         risk_tier = EXCLUDED.risk_tier,
         sanctions_status = EXCLUDED.sanctions_status,
         aml_kyc_status = EXCLUDED.aml_kyc_status,
         sanctions_check_date = EXCLUDED.sanctions_check_date,
         kyc_expiry_date = EXCLUDED.kyc_expiry_date,
         sourcing_event_count = EXCLUDED.sourcing_event_count,
         bid_count = EXCLUDED.bid_count,
         awarded_count = EXCLUDED.awarded_count,
         delivery_score = EXCLUDED.delivery_score,
         quality_score = EXCLUDED.quality_score,
         sla_score = EXCLUDED.sla_score,
         score_period_start = EXCLUDED.score_period_start,
         score_period_end = EXCLUDED.score_period_end,
         last_review_date = EXCLUDED.last_review_date,
         next_review_date = EXCLUDED.next_review_date,
         reviewed_by = EXCLUDED.reviewed_by,
         block_reason = NULL,
         block_start_date = NULL,
         metadata = COALESCE(master.supplier_qualification.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_by = v_system_user_id,
         updated_at = now();

  INSERT INTO master.supplier_block (
    tenant_id,
    supplier_id,
    block_type,
    status,
    block_reason,
    blocked_at,
    blocked_by,
    lifted_at,
    lifted_by,
    lift_reason,
    notes,
    metadata,
    created_by,
    updated_by
  )
  SELECT v_tenant_id,
         s.id,
         CASE WHEN s.supplier_code = 'SUP-MOTRM3B8' THEN 'procurement' ELSE 'invoice' END,
         'lifted',
         CASE WHEN s.supplier_code = 'SUP-MOTRM3B8'
              THEN 'Initial onboarding control pending qualification evidence'
              ELSE 'Historical supplier master review hold during demo migration'
          END,
         TIMESTAMPTZ '2024-12-15 08:00:00+00',
         v_system_user_id,
         TIMESTAMPTZ '2025-01-10 08:00:00+00',
         v_system_user_id,
         'Released by Technostat supplier 100% dataset seed',
         'Coverage row only: no active supplier block remains after seed application',
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'active_operational_hold', false,
           'supplier_code', s.supplier_code
         ),
         v_system_user_id,
         v_system_user_id
    FROM master.supplier s
   WHERE s.tenant_id = v_tenant_id
     AND s.status <> 'archived'
     AND NOT EXISTS (
       SELECT 1
         FROM master.supplier_block sb
        WHERE sb.tenant_id = v_tenant_id
          AND sb.supplier_id = s.id
          AND sb.metadata ->> 'seed_pack' = 'technostat_supplier_100pct'
     );

  INSERT INTO master.company_code_supplier_profile (
    tenant_id,
    supplier_id,
    company_code_id,
    payment_term_id,
    payment_method_id,
    currency_code,
    default_accounting_profile_id,
    tax_group_id,
    default_wht_tax_group_id,
    is_blocked,
    block_reason,
    status,
    metadata,
    created_by,
    updated_by
  )
  SELECT v_tenant_id,
         s.id,
         cc.id,
         pt.id,
         pm.id,
         cc.functional_currency,
         ap.id,
         tg.id,
         wht.id,
         false,
         NULL,
         'active',
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'profile_class', d.profile_class,
           'supplier_code', d.supplier_code,
           'company_code', d.company_code,
           'notes', d.notes
         ),
         v_system_user_id,
         v_system_user_id
    FROM tmp_technostat_supplier_profile d
    JOIN master.supplier s
      ON s.tenant_id = v_tenant_id
     AND s.supplier_code = d.supplier_code
    JOIN master.company_code cc
      ON cc.tenant_id = v_tenant_id
     AND cc.code = d.company_code
    LEFT JOIN master.payment_term pt
      ON pt.tenant_id = v_tenant_id
     AND pt.code = d.payment_term_code
     AND pt.is_current_version
    LEFT JOIN master.payment_method pm
      ON pm.tenant_id = v_tenant_id
     AND pm.code = CASE WHEN cc.code IN ('TKSA', 'SSK') THEN 'SARIE-SAR' ELSE 'WIRE-EGP' END
    LEFT JOIN master.accounting_profile ap
      ON ap.tenant_id = v_tenant_id
     AND ap.code = 'AP_NON_PO_STANDARD'
    LEFT JOIN control.tax_group tg
      ON tg.tenant_id = v_tenant_id
     AND tg.code = CASE WHEN cc.code IN ('TKSA', 'SSK') THEN 'TG-SA-VAT-15-IN' ELSE 'TG-EG-VAT-14-IN' END
    LEFT JOIN control.tax_group wht
      ON wht.tenant_id = v_tenant_id
     AND wht.code = CASE WHEN cc.code IN ('TKSA', 'SSK') THEN 'TG-SA-WHT-5-SVC' ELSE 'TG-EG-WHT-10-SVC' END
  ON CONFLICT (tenant_id, supplier_id, company_code_id) DO UPDATE
     SET payment_term_id = COALESCE(EXCLUDED.payment_term_id, master.company_code_supplier_profile.payment_term_id),
         payment_method_id = COALESCE(EXCLUDED.payment_method_id, master.company_code_supplier_profile.payment_method_id),
         currency_code = EXCLUDED.currency_code,
         default_accounting_profile_id = COALESCE(EXCLUDED.default_accounting_profile_id, master.company_code_supplier_profile.default_accounting_profile_id),
         tax_group_id = COALESCE(EXCLUDED.tax_group_id, master.company_code_supplier_profile.tax_group_id),
         default_wht_tax_group_id = COALESCE(EXCLUDED.default_wht_tax_group_id, master.company_code_supplier_profile.default_wht_tax_group_id),
         is_blocked = false,
         block_reason = NULL,
         status = 'active',
         metadata = COALESCE(master.company_code_supplier_profile.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_by = v_system_user_id,
         updated_at = now();

  DELETE FROM master.supplier_app_index sai
   WHERE sai.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1
         FROM master.supplier s
        WHERE s.tenant_id = sai.tenant_id
          AND s.id = sai.supplier_id
     );

  INSERT INTO master.supplier_app_index (
    id,
    tenant_id,
    supplier_id,
    business_partner_id,
    supplier_code,
    supplier_type,
    supplier_status,
    is_payment_ready,
    business_partner_code,
    name,
    display_name,
    legal_name,
    legal_form,
    registration_no,
    registration_country_code,
    tax_residence_country_code,
    partner_category,
    aliases,
    business_types,
    search_text,
    updated_at
  )
  SELECT s.id,
         s.tenant_id,
         s.id,
         bp.id,
         s.supplier_code,
         s.supplier_type,
         s.status,
         s.is_payment_ready,
         bp.code,
         bp.name,
         bp.display_name,
         bp.legal_name,
         bp.legal_form,
         bp.registration_no,
         bp.registration_country_code,
         bp.tax_residence_country_code,
         bp.partner_category,
         bp.aliases,
         bp.business_types,
         lower(concat_ws(' ',
           s.supplier_code,
           bp.code,
           bp.name,
           bp.display_name,
           bp.legal_name,
           bp.registration_no,
           bp.registration_country_code
         )),
         now()
    FROM master.supplier s
    JOIN master.business_partner bp
      ON bp.tenant_id = s.tenant_id
     AND bp.id = s.business_partner_id
   WHERE s.tenant_id = v_tenant_id
     AND s.status <> 'archived'
  ON CONFLICT (tenant_id, supplier_id) DO UPDATE
     SET business_partner_id = EXCLUDED.business_partner_id,
         supplier_code = EXCLUDED.supplier_code,
         supplier_type = EXCLUDED.supplier_type,
         supplier_status = EXCLUDED.supplier_status,
         is_payment_ready = EXCLUDED.is_payment_ready,
         business_partner_code = EXCLUDED.business_partner_code,
         name = EXCLUDED.name,
         display_name = EXCLUDED.display_name,
         legal_name = EXCLUDED.legal_name,
         legal_form = EXCLUDED.legal_form,
         registration_no = EXCLUDED.registration_no,
         registration_country_code = EXCLUDED.registration_country_code,
         tax_residence_country_code = EXCLUDED.tax_residence_country_code,
         partner_category = EXCLUDED.partner_category,
         aliases = EXCLUDED.aliases,
         business_types = EXCLUDED.business_types,
         search_text = EXCLUDED.search_text,
         updated_at = now();

  INSERT INTO master.company_code_supplier_spend_policy (
    tenant_id,
    supplier_profile_id,
    spend_category_id,
    mapping_mode,
    sourcing_status,
    qualification_status,
    po_status,
    invoice_status,
    valid_from,
    valid_until,
    max_po_amount,
    max_po_currency_code,
    is_preferred_supplier,
    notes,
    metadata,
    created_by,
    updated_by
  )
  SELECT p.tenant_id,
         p.id,
         ssc.spend_category_id,
         'ALLOW',
         CASE WHEN s.status = 'onboarding' THEN 'restricted' ELSE 'allowed' END,
         CASE WHEN s.status = 'onboarding' THEN 'pending' ELSE 'qualified' END,
         CASE WHEN s.status = 'onboarding' THEN 'blocked' ELSE 'allowed' END,
         CASE WHEN s.status = 'onboarding' THEN 'blocked' ELSE 'allowed' END,
         DATE '2025-01-01',
         DATE '2026-12-31',
         CASE
           WHEN s.status = 'onboarding' THEN 50000.00
           WHEN s.supplier_type = 'intercompany' THEN 10000000.00
           WHEN sq.is_preferred_supplier THEN 5000000.00
           WHEN s.supplier_type = 'contractor' THEN 2500000.00
           ELSE 2000000.00
         END,
         p.currency_code,
         COALESCE(sq.is_preferred_supplier, false),
         'Seeded supplier spend policy for Technostat 100% supplier coverage',
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'supplier_code', s.supplier_code,
           'profile_id', p.id
         ),
         v_system_user_id,
         v_system_user_id
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s
      ON s.tenant_id = p.tenant_id
     AND s.id = p.supplier_id
    JOIN master.supplier_spend_category ssc
      ON ssc.tenant_id = s.tenant_id
     AND ssc.supplier_id = s.id
     AND ssc.status = 'active'
    LEFT JOIN master.supplier_qualification sq
      ON sq.tenant_id = s.tenant_id
     AND sq.supplier_id = s.id
   WHERE p.tenant_id = v_tenant_id
     AND p.status = 'active'
  ON CONFLICT (tenant_id, supplier_profile_id, spend_category_id) DO UPDATE
     SET mapping_mode = EXCLUDED.mapping_mode,
         sourcing_status = EXCLUDED.sourcing_status,
         qualification_status = EXCLUDED.qualification_status,
         po_status = EXCLUDED.po_status,
         invoice_status = EXCLUDED.invoice_status,
         valid_from = EXCLUDED.valid_from,
         valid_until = EXCLUDED.valid_until,
         max_po_amount = EXCLUDED.max_po_amount,
         max_po_currency_code = EXCLUDED.max_po_currency_code,
         is_preferred_supplier = EXCLUDED.is_preferred_supplier,
         notes = EXCLUDED.notes,
         metadata = COALESCE(master.company_code_supplier_spend_policy.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_by = v_system_user_id,
         updated_at = now();

  UPDATE master.company_code_supplier_intent_policy ip
     SET is_default = false,
         updated_by = v_system_user_id,
         updated_at = now()
   WHERE ip.tenant_id = v_tenant_id
     AND ip.supplier_profile_id IN (
       SELECT p.id
         FROM master.company_code_supplier_profile p
        WHERE p.tenant_id = v_tenant_id
          AND p.status = 'active'
     )
     AND ip.metadata ->> 'seed_pack' = 'technostat_supplier_100pct';

  WITH profile_intents_raw AS (
    SELECT
           p.id AS supplier_profile_id,
           bi.id AS business_intent_id,
           s.supplier_code,
           s.status AS supplier_status,
           cim.intent_code,
           CASE WHEN ssc.is_primary AND cim.is_primary_intent THEN 0 ELSE 1 END AS priority
      FROM master.company_code_supplier_profile p
      JOIN master.supplier s
        ON s.tenant_id = p.tenant_id
       AND s.id = p.supplier_id
      JOIN master.supplier_spend_category ssc
        ON ssc.tenant_id = s.tenant_id
       AND ssc.supplier_id = s.id
       AND ssc.status = 'active'
      JOIN master.spend_category sc
        ON sc.tenant_id = ssc.tenant_id
       AND sc.id = ssc.spend_category_id
      JOIN tmp_technostat_category_intent_map cim
        ON cim.spend_category_code = sc.code
      JOIN master.business_intent bi
        ON bi.tenant_id = s.tenant_id
       AND bi.code = cim.intent_code
     WHERE p.tenant_id = v_tenant_id
       AND p.status = 'active'

    UNION ALL

    SELECT
           p.id AS supplier_profile_id,
           bi.id AS business_intent_id,
           s.supplier_code,
           s.status AS supplier_status,
           bi.code AS intent_code,
           2 AS priority
      FROM master.company_code_supplier_profile p
      JOIN master.supplier s
        ON s.tenant_id = p.tenant_id
       AND s.id = p.supplier_id
      JOIN master.business_intent bi
        ON bi.tenant_id = s.tenant_id
       AND bi.code = 'TRANSFER-IC'
     WHERE p.tenant_id = v_tenant_id
       AND p.status = 'active'
       AND s.supplier_type = 'intercompany'
  ),
  profile_intents AS (
    SELECT supplier_profile_id,
           business_intent_id,
           supplier_code,
           supplier_status,
           intent_code,
           min(priority) AS priority
      FROM profile_intents_raw
     GROUP BY supplier_profile_id,
              business_intent_id,
              supplier_code,
              supplier_status,
              intent_code
  ),
  ranked_profile_intents AS (
    SELECT pi.*,
           row_number() OVER (
             PARTITION BY pi.supplier_profile_id
             ORDER BY pi.priority, pi.intent_code
           ) AS default_rank
      FROM profile_intents pi
  )
  INSERT INTO master.company_code_supplier_intent_policy (
    tenant_id,
    supplier_profile_id,
    business_intent_id,
    mapping_mode,
    is_default,
    is_sourcing_allowed,
    is_po_allowed,
    is_invoice_allowed,
    metadata,
    created_by,
    updated_by
  )
  SELECT v_tenant_id,
         rpi.supplier_profile_id,
         rpi.business_intent_id,
         'ALLOW',
         rpi.default_rank = 1,
         true,
         rpi.supplier_status <> 'onboarding',
         rpi.supplier_status <> 'onboarding',
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'supplier_code', rpi.supplier_code,
           'intent_code', rpi.intent_code,
           'notes', 'Seeded supplier business intent policy for Technostat 100% supplier coverage'
         ),
         v_system_user_id,
         v_system_user_id
    FROM ranked_profile_intents rpi
  ON CONFLICT (tenant_id, supplier_profile_id, business_intent_id) DO UPDATE
     SET mapping_mode = EXCLUDED.mapping_mode,
         is_default = EXCLUDED.is_default,
         is_sourcing_allowed = EXCLUDED.is_sourcing_allowed,
         is_po_allowed = EXCLUDED.is_po_allowed,
         is_invoice_allowed = EXCLUDED.is_invoice_allowed,
         metadata = COALESCE(master.company_code_supplier_intent_policy.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_by = v_system_user_id,
         updated_at = now();

  INSERT INTO master.company_code_supplier_posting_override (
    tenant_id,
    supplier_profile_id,
    posting_role_code,
    book_code,
    gl_account_id,
    effective_from,
    effective_to,
    status,
    reason,
    metadata,
    created_by,
    updated_by
  )
  SELECT p.tenant_id,
         p.id,
         'ap_trade_payable',
         'PRIMARY',
         COALESCE(ga.id, fallback_ga.id),
         DATE '2025-01-01',
         NULL,
         'active',
         'Default AP trade payable override for supplier demo completeness',
         jsonb_build_object(
           'seed_pack', 'technostat_supplier_100pct',
           'supplier_code', s.supplier_code,
           'company_code_id', p.company_code_id,
           'gl_account_code', COALESCE(ga.code, fallback_ga.code)
         ),
         v_system_user_id,
         v_system_user_id
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s
      ON s.tenant_id = p.tenant_id
     AND s.id = p.supplier_id
    LEFT JOIN master.gl_account ga
      ON ga.tenant_id = p.tenant_id
     AND ga.code = CASE
       WHEN s.supplier_type = 'intercompany' THEN 'GRP-L-IC-TRD'
       WHEN s.supplier_type = 'contractor' THEN 'CST-L-AP-SUB'
       WHEN p.currency_code = 'EGP' THEN 'TRD-L-AP-LOCAL'
       ELSE 'GRP-L-AP-TRADE'
     END
    LEFT JOIN master.gl_account fallback_ga
      ON fallback_ga.tenant_id = p.tenant_id
     AND fallback_ga.code = 'GRP-L-AP-TRADE'
   WHERE p.tenant_id = v_tenant_id
     AND p.status = 'active'
     AND COALESCE(ga.id, fallback_ga.id) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM master.company_code_supplier_posting_override po
        WHERE po.tenant_id = p.tenant_id
          AND po.supplier_profile_id = p.id
          AND po.posting_role_code = 'ap_trade_payable'
          AND po.book_code = 'PRIMARY'
          AND po.status = 'active'
          AND po.effective_to IS NULL
     );

  -- Purge orphaned supplier-side records that survive partial re-migrations
  -- (01h recreates master.supplier without the FK-cascade being present,
  --  leaving child-table rows with no live parent supplier).
  DELETE FROM master.company_code_supplier_spend_policy sp
   WHERE sp.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.company_code_supplier_profile p
        WHERE p.tenant_id = sp.tenant_id AND p.id = sp.supplier_profile_id
     );
  DELETE FROM master.company_code_supplier_intent_policy ip
   WHERE ip.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.company_code_supplier_profile p
        WHERE p.tenant_id = ip.tenant_id AND p.id = ip.supplier_profile_id
     );
  DELETE FROM master.company_code_supplier_posting_override po
   WHERE po.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.company_code_supplier_profile p
        WHERE p.tenant_id = po.tenant_id AND p.id = po.supplier_profile_id
     );
  DELETE FROM master.company_code_supplier_profile p
   WHERE p.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.supplier s
        WHERE s.tenant_id = p.tenant_id AND s.id = p.supplier_id
     );
  DELETE FROM master.supplier_qualification sq
   WHERE sq.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.supplier s
        WHERE s.tenant_id = sq.tenant_id AND s.id = sq.supplier_id
     );
  DELETE FROM master.supplier_spend_category ssc
   WHERE ssc.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.supplier s
        WHERE s.tenant_id = ssc.tenant_id AND s.id = ssc.supplier_id
     );
  DELETE FROM master.supplier_block sb
   WHERE sb.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.supplier s
        WHERE s.tenant_id = sb.tenant_id AND s.id = sb.supplier_id
     );
  DELETE FROM master.supplier_app_index sai
   WHERE sai.tenant_id = v_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM master.supplier s
        WHERE s.tenant_id = sai.tenant_id AND s.id = sai.supplier_id
     );

  SELECT count(*)
    INTO v_supplier_total
    FROM master.supplier s
   WHERE s.tenant_id = v_tenant_id
     AND s.status <> 'archived';

  SELECT count(DISTINCT sai.supplier_id)
    INTO v_supplier_app_index_count
    FROM master.supplier_app_index sai
    JOIN master.supplier s ON s.tenant_id = sai.tenant_id AND s.id = sai.supplier_id
   WHERE sai.tenant_id = v_tenant_id
     AND s.status <> 'archived';

  SELECT count(DISTINCT ssc.supplier_id)
    INTO v_supplier_spend_category_count
    FROM master.supplier_spend_category ssc
    JOIN master.supplier s ON s.tenant_id = ssc.tenant_id AND s.id = ssc.supplier_id
   WHERE ssc.tenant_id = v_tenant_id
     AND ssc.status = 'active'
     AND ssc.is_primary
     AND s.status <> 'archived';

  SELECT count(DISTINCT sq.supplier_id)
    INTO v_supplier_qualification_count
    FROM master.supplier_qualification sq
    JOIN master.supplier s ON s.tenant_id = sq.tenant_id AND s.id = sq.supplier_id
   WHERE sq.tenant_id = v_tenant_id
     AND s.status <> 'archived';

  SELECT count(DISTINCT sb.supplier_id)
    INTO v_supplier_block_count
    FROM master.supplier_block sb
    JOIN master.supplier s ON s.tenant_id = sb.tenant_id AND s.id = sb.supplier_id
   WHERE sb.tenant_id = v_tenant_id
     AND sb.metadata ->> 'seed_pack' = 'technostat_supplier_100pct'
     AND s.status <> 'archived';

  SELECT count(DISTINCT p.supplier_id)
    INTO v_supplier_profile_count
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.tenant_id = p.tenant_id AND s.id = p.supplier_id
   WHERE p.tenant_id = v_tenant_id
     AND p.status = 'active'
     AND s.status <> 'archived';

  SELECT count(DISTINCT p.id)
    INTO v_profile_with_spend_policy_count
    FROM master.company_code_supplier_profile p
   WHERE p.tenant_id = v_tenant_id
     AND p.status = 'active'
     AND EXISTS (
       SELECT 1
         FROM master.company_code_supplier_spend_policy sp
        WHERE sp.tenant_id = p.tenant_id
          AND sp.supplier_profile_id = p.id
     );

  SELECT count(DISTINCT p.id)
    INTO v_profile_with_intent_policy_count
    FROM master.company_code_supplier_profile p
   WHERE p.tenant_id = v_tenant_id
     AND p.status = 'active'
     AND EXISTS (
       SELECT 1
         FROM master.company_code_supplier_intent_policy ip
        WHERE ip.tenant_id = p.tenant_id
          AND ip.supplier_profile_id = p.id
     );

  SELECT count(DISTINCT p.id)
    INTO v_profile_with_posting_override_count
    FROM master.company_code_supplier_profile p
   WHERE p.tenant_id = v_tenant_id
     AND p.status = 'active'
     AND EXISTS (
       SELECT 1
         FROM master.company_code_supplier_posting_override po
        WHERE po.tenant_id = p.tenant_id
          AND po.supplier_profile_id = p.id
          AND po.posting_role_code = 'ap_trade_payable'
          AND po.book_code = 'PRIMARY'
          AND po.status = 'active'
     );

  IF v_supplier_app_index_count <> v_supplier_total THEN
    RAISE EXCEPTION 'Supplier app index coverage failed: % of % suppliers', v_supplier_app_index_count, v_supplier_total;
  END IF;

  IF v_supplier_spend_category_count <> v_supplier_total THEN
    RAISE EXCEPTION 'Supplier primary spend category coverage failed: % of % suppliers', v_supplier_spend_category_count, v_supplier_total;
  END IF;

  IF v_supplier_qualification_count <> v_supplier_total THEN
    RAISE EXCEPTION 'Supplier qualification coverage failed: % of % suppliers', v_supplier_qualification_count, v_supplier_total;
  END IF;

  IF v_supplier_block_count <> v_supplier_total THEN
    RAISE EXCEPTION 'Supplier block history coverage failed: % of % suppliers', v_supplier_block_count, v_supplier_total;
  END IF;

  IF v_supplier_profile_count <> v_supplier_total THEN
    RAISE EXCEPTION 'Supplier company-code profile coverage failed: % of % suppliers', v_supplier_profile_count, v_supplier_total;
  END IF;

  IF v_profile_with_spend_policy_count <> (
    SELECT count(*)
      FROM master.company_code_supplier_profile p
     WHERE p.tenant_id = v_tenant_id
       AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Supplier profile spend policy coverage failed: % profiles covered', v_profile_with_spend_policy_count;
  END IF;

  IF v_profile_with_intent_policy_count <> (
    SELECT count(*)
      FROM master.company_code_supplier_profile p
     WHERE p.tenant_id = v_tenant_id
       AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Supplier profile intent policy coverage failed: % profiles covered', v_profile_with_intent_policy_count;
  END IF;

  IF v_profile_with_posting_override_count <> (
    SELECT count(*)
      FROM master.company_code_supplier_profile p
     WHERE p.tenant_id = v_tenant_id
       AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Supplier profile posting override coverage failed: % profiles covered', v_profile_with_posting_override_count;
  END IF;

  RAISE NOTICE 'Technostat supplier 100%% dataset complete: % suppliers, % supplier profiles',
    v_supplier_total,
    (
      SELECT count(*)
        FROM master.company_code_supplier_profile p
       WHERE p.tenant_id = v_tenant_id
         AND p.status = 'active'
    );
END;
$technostat_supplier_100pct$;
