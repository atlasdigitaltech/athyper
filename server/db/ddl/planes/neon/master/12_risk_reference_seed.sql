-- seed-contract-version: 1
-- seed-pack: neon.risk-registries
-- seed-pack-version: 1.0.0
-- seed-dataset: master.risk-reference
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 4 risk registry rewrite","publisher":"Athyper","source_version":"wave4-platform-catalog.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: master.risk_dimension(code);master.risk_driver_registry(code);master.risk_source(code);master.risk_model(code,version)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: query:wave4_neon_risk_registries
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
-- Platform risk registries: dimensions, driver types, sources, and scoring models.
-- §5 invariant: master.risk_model_dimension weights MUST sum to 1.00 per (model_code, model_version).

DO $$
BEGIN
    IF current_setting('app.database_plane', true) <> 'neon' THEN
        RAISE EXCEPTION
            '[seed] risk registry is Neon-owned and requires app.database_plane=neon';
    END IF;
END;
$$;

-- §1  master.risk_dimension — dimension taxonomy

INSERT INTO master.risk_dimension
    (code, name, description, category, applicable_contexts, is_knockout, ordinal, is_system_defined, status)
VALUES
    ('esg',           'ESG & Sustainability',
     'Environmental, Social and Governance performance. Includes carbon footprint, labour practices, board governance.',
     'esg',        ARRAY['organization','supplier_role'], false, 10, true, 'active'),

    ('credit',        'Credit & Financial Health',
     'Financial stability, credit ratings, payment capacity, D&B PAYDEX, and liquidity indicators.',
     'credit',     ARRAY['organization','supplier_role','customer_role'], false, 20, true, 'active'),

    ('sanctions',     'Sanctions & Watch-list',
     'OFAC, UN, EU, UK, and FATF watch-list screening. Any active sanction hit is a hard knockout.',
     'compliance',  ARRAY['organization','supplier_role','customer_role','project_engagement'], true, 30, true, 'active'),

    ('compliance',    'Regulatory & Legal Compliance',
     'Licences, certifications, regulatory filings, legal proceedings, debarment status.',
     'compliance',  ARRAY['organization','supplier_role','customer_role'], false, 40, true, 'active'),

    ('operational',   'Operational Risk',
     'Delivery performance, SLA adherence, capacity constraints, single-source dependency.',
     'operational', ARRAY['supplier_role','project_engagement'], false, 50, true, 'active'),

    ('reputational',  'Reputational Risk',
     'Media adverse findings, litigation history, executive misconduct flags, public controversies.',
     'reputational', ARRAY['organization','supplier_role','customer_role'], false, 60, true, 'active'),

    ('data_quality',  'Data & Profile Quality',
     'Completeness of BP master data: identifiers, addresses, bank details, tax registrations.',
     'data_quality', ARRAY['organization','supplier_role','customer_role'], false, 70, true, 'active'),

    ('engagement',    'Project Engagement Risk',
     'Per-engagement risk factors: data sensitivity, jurisdiction, strategic criticality, scope concentration.',
     'engagement',  ARRAY['project_engagement'], false, 80, true, 'active')

ON CONFLICT (code) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,
 applicable_contexts=excluded.applicable_contexts,is_knockout=excluded.is_knockout,ordinal=excluded.ordinal,
 is_system_defined=excluded.is_system_defined,status=excluded.status
WHERE (master.risk_dimension.name,master.risk_dimension.description,master.risk_dimension.category,master.risk_dimension.applicable_contexts,
 master.risk_dimension.is_knockout,master.risk_dimension.ordinal,master.risk_dimension.is_system_defined,master.risk_dimension.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.category,excluded.applicable_contexts,excluded.is_knockout,excluded.ordinal,excluded.is_system_defined,excluded.status);


-- §2  master.risk_driver_registry — common driver type definitions

INSERT INTO master.risk_driver_registry
    (code, name, description, default_dimension_code, default_severity,
     applicable_evidence_types, is_knockout, is_system_defined)
VALUES

-- ESG drivers
('esg_score_low',           'Low ESG Score',
 'Overall ESG score below model threshold (e.g. EcoVadis < 45).',
 'esg',        'high',   ARRAY['score'],               false, true),
('esg_env_critical',        'Critical Environmental Finding',
 'Environmental non-compliance, pollution incident, or failed env audit.',
 'esg',        'critical', ARRAY['finding','alert'],   false, true),
('esg_labour_violation',    'Labour Rights Violation',
 'Confirmed or alleged labour rights / modern slavery finding.',
 'esg',        'high',   ARRAY['finding','alert'],     false, true),
('esg_no_certificate',      'Missing ESG Certificate',
 'Required ESG or sustainability certificate not on file or expired.',
 'esg',        'medium', ARRAY['certificate'],         false, true),

-- Credit drivers
('credit_score_low',        'Low Credit Score',
 'D&B PAYDEX or internal credit score below acceptable threshold.',
 'credit',     'high',   ARRAY['score'],               false, true),
('credit_rating_subinv',    'Sub-Investment Grade Rating',
 'External credit rating below investment grade (BB+ and below).',
 'credit',     'high',   ARRAY['score'],               false, true),
('payment_history_poor',    'Poor Payment History',
 'Consistent late payments, delinquency flag, or bankruptcy history.',
 'credit',     'high',   ARRAY['score','finding'],     false, true),
('credit_limit_exceeded',   'Credit Limit Exceeded',
 'Outstanding exposure exceeds approved credit limit.',
 'credit',     'medium', ARRAY['alert'],               false, true),

-- Sanctions / compliance drivers
('sanctions_hit_active',    'Active Sanctions Hit',
 'BP or affiliated party found on an active OFAC, UN, EU, or UK sanctions list.',
 'sanctions',  'critical', ARRAY['sanction_hit'],      true,  true),
('sanctions_hit_pep',       'Politically Exposed Person (PEP)',
 'BP or UBO identified as a politically exposed person.',
 'sanctions',  'high',   ARRAY['alert','finding'],     false, true),
('aml_kyc_failed',          'AML / KYC Failed',
 'Anti-money laundering or Know Your Customer check failed or expired.',
 'compliance', 'high',   ARRAY['finding','questionnaire'], false, true),
('debarment_listed',        'Debarment / Exclusion Listed',
 'BP listed on a government or institutional debarment registry.',
 'compliance', 'critical', ARRAY['alert'],             true,  true),
('licence_expired',         'Required Licence Expired',
 'A mandatory operating licence, permit, or certification has expired.',
 'compliance', 'high',   ARRAY['certificate'],         false, true),

-- Operational drivers
('delivery_score_low',      'Low Delivery Performance',
 'Supplier delivery score below acceptable threshold in evaluation period.',
 'operational','medium', ARRAY['score','questionnaire'], false, true),
('single_source_risk',      'Single-Source Dependency',
 'This supplier is the sole source for a critical category with no approved alternate.',
 'operational','high',   ARRAY['engagement'],          false, true),
('capacity_constraint',     'Capacity Constraint Flagged',
 'Supplier has indicated or demonstrated capacity constraints for the required scope.',
 'operational','medium', ARRAY['questionnaire','finding'], false, true),

-- Data quality drivers
('missing_tax_id',          'Missing Tax Identification',
 'BP has no tax ID or VAT number registered — required for invoicing.',
 'data_quality','medium', ARRAY[]::text[],              false, true),
('missing_bank_details',    'Missing Bank / Payment Details',
 'No verified bank account on file — blocks payment processing.',
 'data_quality','medium', ARRAY[]::text[],              false, true),
('missing_address',         'Missing Registered Address',
 'No registered or legal address on file.',
 'data_quality','low',   ARRAY[]::text[],              false, true),
('incomplete_governance',   'Incomplete Ownership / UBO Data',
 'Governance relations (shareholders, directors, UBOs) not fully declared.',
 'data_quality','medium', ARRAY[]::text[],              false, true),

-- Engagement drivers
('high_data_sensitivity',   'High Data Sensitivity Scope',
 'Engagement involves access to highly sensitive data (PII, financial, IP).',
 'engagement', 'high',   ARRAY['engagement'],          false, true),
('high_risk_jurisdiction',  'High-Risk Jurisdiction',
 'Engagement or delivery originates from a jurisdiction on the FATF or watch-list.',
 'engagement', 'high',   ARRAY['engagement'],          false, true),
('strategic_concentration', 'Strategic Concentration Risk',
 'BP accounts for > 30% of spend or revenue in a critical category.',
 'engagement', 'high',   ARRAY['engagement'],          false, true)

ON CONFLICT (code) DO UPDATE SET name=excluded.name,description=excluded.description,
 default_dimension_code=excluded.default_dimension_code,default_severity=excluded.default_severity,
 applicable_evidence_types=excluded.applicable_evidence_types,is_knockout=excluded.is_knockout,
 is_system_defined=excluded.is_system_defined
WHERE (master.risk_driver_registry.name,master.risk_driver_registry.description,master.risk_driver_registry.default_dimension_code,
 master.risk_driver_registry.default_severity,master.risk_driver_registry.applicable_evidence_types,master.risk_driver_registry.is_knockout,master.risk_driver_registry.is_system_defined)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.default_dimension_code,excluded.default_severity,excluded.applicable_evidence_types,excluded.is_knockout,excluded.is_system_defined);


-- §3  master.risk_source — signal origin registry

INSERT INTO master.risk_source
    (code, name, description, source_type, provider_category, trust_level, refresh_mode, status)
VALUES
    ('ecovadis',               'EcoVadis',
     'ESG/CSR rating platform. Provides scored assessments across environment, labour, ethics, procurement.',
     'external_provider', 'esg',        5, 'api',    'active'),

    ('dun_bradstreet',         'Dun & Bradstreet',
     'Global credit ratings, PAYDEX scores, financial strength, and payment history.',
     'external_provider', 'credit',     5, 'api',    'active'),

    ('refinitiv_wcc',          'Refinitiv World-Check',
     'Sanctions, PEP, adverse media, and watch-list screening (LSEG).',
     'external_provider', 'sanctions',  5, 'api',    'active'),

    ('ofac_sdn',               'OFAC SDN List',
     'US Treasury Office of Foreign Assets Control — Specially Designated Nationals list.',
     'external_provider', 'sanctions',  5, 'file',   'active'),

    ('internal_system',        'Internal System',
     'Signals computed from internal BP master data: completeness, performance counters, AR metrics.',
     'internal_system',   'compliance', 3, 'event',  'active'),

    ('manual_review',          'Manual Risk Review',
     'Risk assessment conducted by an internal risk analyst or procurement manager.',
     'manual',            'compliance', 3, 'manual', 'active'),

    ('supplier_questionnaire', 'Supplier Questionnaire',
     'Structured self-assessment questionnaire submitted by the supplier during onboarding or review.',
     'workflow',          'compliance', 2, 'event',  'active'),

    ('customer_questionnaire', 'Customer Questionnaire',
     'Structured self-assessment questionnaire submitted by the customer.',
     'workflow',          'compliance', 2, 'event',  'active')

ON CONFLICT (code) DO UPDATE SET name=excluded.name,description=excluded.description,source_type=excluded.source_type,
 provider_category=excluded.provider_category,trust_level=excluded.trust_level,refresh_mode=excluded.refresh_mode,status=excluded.status
WHERE (master.risk_source.name,master.risk_source.description,master.risk_source.source_type,master.risk_source.provider_category,
 master.risk_source.trust_level,master.risk_source.refresh_mode,master.risk_source.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.source_type,excluded.provider_category,excluded.trust_level,excluded.refresh_mode,excluded.status);


-- §4  master.risk_model — scoring model registry

INSERT INTO master.risk_model
    (code, version, name, description, applicable_context, scoring_algorithm,
     risk_band_thresholds, effective_from, status)
VALUES
    ('standard_org',        '1.0',
     'Standard Organization Risk Model v1.0',
     'Entity-level risk assessment. Covers ESG, credit, sanctions, compliance, reputational, and data quality.',
     'organization', 'weighted_average',
     '{"critical":[0,24],"high":[25,49],"medium":[50,74],"low":[75,100]}'::jsonb,
     '2026-01-01', 'active'),

    ('standard_supplier',   '1.0',
     'Standard Supplier Role Risk Model v1.0',
     'Procurement-context risk. Adds operational performance and engagement dimensions on top of org risk.',
     'supplier_role', 'weighted_average',
     '{"critical":[0,24],"high":[25,49],"medium":[50,74],"low":[75,100]}'::jsonb,
     '2026-01-01', 'active'),

    ('standard_customer',   '1.0',
     'Standard Customer Role Risk Model v1.0',
     'AR-context risk. Focused on credit capacity, payment behaviour, and KYC/AML compliance.',
     'customer_role', 'weighted_average',
     '{"critical":[0,24],"high":[25,49],"medium":[50,74],"low":[75,100]}'::jsonb,
     '2026-01-01', 'active'),

    ('project_engagement',  '1.0',
     'Project Engagement Risk Model v1.0',
     'Per-engagement risk. Covers sanctions, operational, data sensitivity, jurisdiction, and concentration.',
     'project_engagement', 'weighted_average',
     '{"critical":[0,24],"high":[25,49],"medium":[50,74],"low":[75,100]}'::jsonb,
     '2026-01-01', 'active')

ON CONFLICT (code, version) DO UPDATE SET name=excluded.name,description=excluded.description,
 applicable_context=excluded.applicable_context,scoring_algorithm=excluded.scoring_algorithm,
 risk_band_thresholds=excluded.risk_band_thresholds,effective_from=excluded.effective_from,status=excluded.status
WHERE (master.risk_model.name,master.risk_model.description,master.risk_model.applicable_context,master.risk_model.scoring_algorithm,
 master.risk_model.risk_band_thresholds,master.risk_model.effective_from,master.risk_model.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.applicable_context,excluded.scoring_algorithm,excluded.risk_band_thresholds,excluded.effective_from,excluded.status);


-- §5  master.risk_model_dimension — weights per model (must sum to 1.00 per model/version)

-- standard_org v1.0  (6 dimensions, sum = 1.00)
INSERT INTO master.risk_model_dimension
    (model_code, model_version, dimension_code, weight, is_required, is_knockout, ordinal)
VALUES
    ('standard_org', '1.0', 'sanctions',    0.25, true,  true,  10),
    ('standard_org', '1.0', 'compliance',   0.20, true,  false, 20),
    ('standard_org', '1.0', 'credit',       0.20, true,  false, 30),
    ('standard_org', '1.0', 'esg',          0.15, false, false, 40),
    ('standard_org', '1.0', 'reputational', 0.12, false, false, 50),
    ('standard_org', '1.0', 'data_quality', 0.08, true,  false, 60)
ON CONFLICT (model_code, model_version, dimension_code) DO UPDATE SET weight=excluded.weight,
 is_required=excluded.is_required,is_knockout=excluded.is_knockout,ordinal=excluded.ordinal
WHERE (master.risk_model_dimension.weight,master.risk_model_dimension.is_required,master.risk_model_dimension.is_knockout,master.risk_model_dimension.ordinal)
 IS DISTINCT FROM (excluded.weight,excluded.is_required,excluded.is_knockout,excluded.ordinal);


-- standard_supplier v1.0  (7 dimensions, sum = 1.00)
INSERT INTO master.risk_model_dimension
    (model_code, model_version, dimension_code, weight, is_required, is_knockout, ordinal)
VALUES
    ('standard_supplier', '1.0', 'sanctions',    0.20, true,  true,  10),
    ('standard_supplier', '1.0', 'compliance',   0.18, true,  false, 20),
    ('standard_supplier', '1.0', 'credit',       0.15, true,  false, 30),
    ('standard_supplier', '1.0', 'operational',  0.20, true,  false, 40),
    ('standard_supplier', '1.0', 'esg',          0.15, false, false, 50),
    ('standard_supplier', '1.0', 'reputational', 0.07, false, false, 60),
    ('standard_supplier', '1.0', 'data_quality', 0.05, true,  false, 70)
ON CONFLICT (model_code, model_version, dimension_code) DO UPDATE SET weight=excluded.weight,
 is_required=excluded.is_required,is_knockout=excluded.is_knockout,ordinal=excluded.ordinal
WHERE (master.risk_model_dimension.weight,master.risk_model_dimension.is_required,master.risk_model_dimension.is_knockout,master.risk_model_dimension.ordinal)
 IS DISTINCT FROM (excluded.weight,excluded.is_required,excluded.is_knockout,excluded.ordinal);


-- standard_customer v1.0  (5 dimensions, sum = 1.00)
INSERT INTO master.risk_model_dimension
    (model_code, model_version, dimension_code, weight, is_required, is_knockout, ordinal)
VALUES
    ('standard_customer', '1.0', 'sanctions',    0.25, true,  true,  10),
    ('standard_customer', '1.0', 'credit',       0.35, true,  false, 20),
    ('standard_customer', '1.0', 'compliance',   0.20, true,  false, 30),
    ('standard_customer', '1.0', 'reputational', 0.10, false, false, 40),
    ('standard_customer', '1.0', 'data_quality', 0.10, true,  false, 50)
ON CONFLICT (model_code, model_version, dimension_code) DO UPDATE SET weight=excluded.weight,
 is_required=excluded.is_required,is_knockout=excluded.is_knockout,ordinal=excluded.ordinal
WHERE (master.risk_model_dimension.weight,master.risk_model_dimension.is_required,master.risk_model_dimension.is_knockout,master.risk_model_dimension.ordinal)
 IS DISTINCT FROM (excluded.weight,excluded.is_required,excluded.is_knockout,excluded.ordinal);


-- project_engagement v1.0  (4 dimensions, sum = 1.00)
INSERT INTO master.risk_model_dimension
    (model_code, model_version, dimension_code, weight, is_required, is_knockout, ordinal)
VALUES
    ('project_engagement', '1.0', 'sanctions',  0.30, true,  true,  10),
    ('project_engagement', '1.0', 'operational', 0.25, true,  false, 20),
    ('project_engagement', '1.0', 'compliance',  0.25, true,  false, 30),
    ('project_engagement', '1.0', 'engagement',  0.20, true,  false, 40)
ON CONFLICT (model_code, model_version, dimension_code) DO UPDATE SET weight=excluded.weight,
 is_required=excluded.is_required,is_knockout=excluded.is_knockout,ordinal=excluded.ordinal
WHERE (master.risk_model_dimension.weight,master.risk_model_dimension.is_required,master.risk_model_dimension.is_knockout,master.risk_model_dimension.ordinal)
 IS DISTINCT FROM (excluded.weight,excluded.is_required,excluded.is_knockout,excluded.ordinal);
