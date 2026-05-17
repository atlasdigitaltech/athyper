-- ============================================================================
-- 020_universal/070_people/310_job_classification.sql
-- Universal HR Job Classification Seed
--
-- Covers: job_family · job_function · career_band · career_level ·
--         pay_grade · designation · job
--
-- Design:
--   · Industry-agnostic templates covering 15 families and ~66 functions
--   · 9 career bands (Entry → C-Suite) with 19 levels
--   · 15 pay grades (G01–G15); amounts intentionally omitted — configure
--     min/midpoint/max per currency and market benchmark separately
--   · ~48 designations covering the full IC + management + C-suite ladder
--   · 80 representative jobs covering all major families and career paths
--   · Fully idempotent: ON CONFLICT (tenant_id, code) DO UPDATE
--
-- Usage:
--   SET app.seed_tenant_id = '<tenant-uuid>';
--   \i 310_job_classification.sql
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := 'universal_hr_classification';
    v_ver  text := '1.0.0';
    v_n    int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    RAISE NOTICE '[%] Starting job classification seed for tenant %', v_pack, v_tid;

    -- ========================================================================
    -- JOB FAMILIES  (15 industry-agnostic families)
    -- ========================================================================
    INSERT INTO master.job_family (id, tenant_id, code, name, description, status, created_by)
    VALUES
        (shared.uuidv7(), v_tid, 'tech_engineering',   'Technology & Engineering',
         'Software, infrastructure, data, hardware, and platform engineering.',             'active', v_su),
        (shared.uuidv7(), v_tid, 'finance_accounting', 'Finance & Accounting',
         'Financial planning, accounting, treasury, tax, audit, and procurement.',          'active', v_su),
        (shared.uuidv7(), v_tid, 'human_resources',    'Human Resources & People',
         'Talent acquisition, HR business partnering, compensation, and L&D.',             'active', v_su),
        (shared.uuidv7(), v_tid, 'sales_growth',       'Sales & Business Development',
         'Revenue generation via direct sales, partnerships, and account management.',      'active', v_su),
        (shared.uuidv7(), v_tid, 'marketing_comms',    'Marketing & Communications',
         'Brand, digital marketing, product marketing, content, and PR.',                  'active', v_su),
        (shared.uuidv7(), v_tid, 'operations_sc',      'Operations & Supply Chain',
         'Supply chain, logistics, manufacturing, facilities, and quality management.',     'active', v_su),
        (shared.uuidv7(), v_tid, 'legal_compliance',   'Legal & Compliance',
         'Corporate legal, contracts, IP, regulatory compliance, and data privacy.',        'active', v_su),
        (shared.uuidv7(), v_tid, 'customer_success',   'Customer Success & Support',
         'Customer onboarding, support, success management, and community.',               'active', v_su),
        (shared.uuidv7(), v_tid, 'research_dev',       'Research & Development',
         'Applied research, product development, and innovation.',                         'active', v_su),
        (shared.uuidv7(), v_tid, 'data_analytics',     'Data & Analytics',
         'Data science, BI, ML engineering, and data governance.',                         'active', v_su),
        (shared.uuidv7(), v_tid, 'admin_facilities',   'Administration & Facilities',
         'Executive support, records management, facility services, and travel.',           'active', v_su),
        (shared.uuidv7(), v_tid, 'healthcare_medical', 'Healthcare & Medical',
         'Clinical, nursing, pharmacy, diagnostics, and allied health roles.',             'active', v_su),
        (shared.uuidv7(), v_tid, 'creative_design',    'Creative & Design',
         'UX, visual design, video production, and architecture.',                         'active', v_su),
        (shared.uuidv7(), v_tid, 'security_risk',      'Risk, Security & Audit',
         'Enterprise risk, internal controls, business continuity, and fraud.',            'active', v_su),
        (shared.uuidv7(), v_tid, 'executive_mgmt',     'Executive & General Management',
         'C-suite leadership and cross-functional general management.',                    'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            description = EXCLUDED.description,
            updated_at = now(),
            updated_by = v_su
        WHERE (master.job_family.name, master.job_family.description)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] job_family: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- JOB FUNCTIONS  (~66 functions spanning all 15 families)
    -- ========================================================================
    INSERT INTO master.job_function (id, tenant_id, code, name, job_family_id, description, status, created_by)
    SELECT shared.uuidv7(), v_tid, x.code, x.name,
           (SELECT id FROM master.job_family WHERE tenant_id = v_tid AND code = x.family),
           x.description, 'active', v_su
    FROM (VALUES
        -- Technology & Engineering
        ('sw_engineering',     'tech_engineering',   'Software Engineering',
         'Design, develop, and maintain software systems and applications.'),
        ('devops_infra',       'tech_engineering',   'DevOps & Infrastructure',
         'Cloud platforms, CI/CD pipelines, reliability, and platform operations.'),
        ('data_engineering',   'tech_engineering',   'Data Engineering',
         'Build and maintain data pipelines, warehouses, and streaming systems.'),
        ('cybersecurity',      'tech_engineering',   'Cybersecurity & InfoSec',
         'Protect systems, networks, and data assets; manage incident response.'),
        ('it_support',         'tech_engineering',   'IT Support & Systems',
         'End-user support, system administration, and IT operations.'),
        ('qa_testing',         'tech_engineering',   'Quality Assurance & Testing',
         'Test strategy, automation frameworks, and quality control.'),
        ('platform_arch',      'tech_engineering',   'Platform & Architecture',
         'Technical architecture, system design, and platform engineering standards.'),
        ('embedded_systems',   'tech_engineering',   'Embedded & Systems Engineering',
         'Firmware, embedded software, and hardware/software integration.'),
        ('network_telecom',    'tech_engineering',   'Network & Telecom Engineering',
         'Network design, protocols, connectivity, and telecommunications.'),
        -- Finance & Accounting
        ('fin_planning',       'finance_accounting', 'Financial Planning & Analysis',
         'Budgeting, forecasting, variance analysis, and management reporting.'),
        ('accounting',         'finance_accounting', 'Accounting & Reporting',
         'Statutory accounting, GL, AP/AR, period close, and financial reporting.'),
        ('treasury',           'finance_accounting', 'Treasury & Cash Management',
         'Cash flow, liquidity management, hedging, and banking relationships.'),
        ('tax',                'finance_accounting', 'Tax & Regulatory',
         'Corporate tax, indirect tax, regulatory filings, and transfer pricing.'),
        ('procurement',        'finance_accounting', 'Procurement & Sourcing',
         'Vendor selection, contract negotiation, and strategic sourcing.'),
        ('internal_audit',     'finance_accounting', 'Internal Audit',
         'Risk-based auditing, controls assessment, and internal assurance.'),
        -- Human Resources
        ('talent_acquisition', 'human_resources',    'Talent Acquisition',
         'Full-cycle recruitment, sourcing, employer branding, and hiring.'),
        ('hr_bp',              'human_resources',    'HR Business Partnering',
         'Strategic HR advisory, employee relations, and organisational design.'),
        ('comp_benefits',      'human_resources',    'Compensation & Benefits',
         'Total rewards strategy, payroll governance, and benefits administration.'),
        ('learning_dev',       'human_resources',    'Learning & Development',
         'Training design, capability building, and leadership development.'),
        ('hr_ops',             'human_resources',    'HR Operations & Systems',
         'HRIS management, process design, and employee lifecycle administration.'),
        ('people_analytics',   'human_resources',    'People Analytics',
         'Workforce data, headcount reporting, and predictive people analytics.'),
        -- Sales & Business Development
        ('enterprise_sales',   'sales_growth',       'Enterprise Sales',
         'New business development and expansion for large enterprise accounts.'),
        ('smb_sales',          'sales_growth',       'SMB & Mid-Market Sales',
         'Sales motion for small and mid-market commercial customers.'),
        ('partnerships',       'sales_growth',       'Partnerships & Alliances',
         'Channel partners, strategic alliances, and co-sell programmes.'),
        ('sales_ops',          'sales_growth',       'Sales Operations & Enablement',
         'CRM, analytics, quota setting, territory design, and readiness.'),
        ('account_mgmt',       'sales_growth',       'Account Management',
         'Customer retention, upsell, cross-sell, and renewal management.'),
        ('presales',           'sales_growth',       'PreSales & Solution Engineering',
         'Technical demonstrations, RFP responses, and deal support.'),
        -- Marketing & Communications
        ('brand_comms',        'marketing_comms',    'Brand & Communications',
         'Brand strategy, corporate communications, and reputation management.'),
        ('digital_marketing',  'marketing_comms',    'Digital Marketing',
         'SEO/SEM, paid media, email marketing, and social media.'),
        ('product_marketing',  'marketing_comms',    'Product Marketing',
         'Go-to-market planning, positioning, competitive intelligence, and launches.'),
        ('content_editorial',  'marketing_comms',    'Content & Editorial',
         'Content strategy, copywriting, editorial, and thought leadership.'),
        ('events',             'marketing_comms',    'Events & Experiential',
         'Conference planning, field marketing, and event production.'),
        -- Operations & Supply Chain
        ('supply_chain_mgmt',  'operations_sc',      'Supply Chain Management',
         'End-to-end planning, supplier management, and inventory optimisation.'),
        ('logistics',          'operations_sc',       'Logistics & Distribution',
         'Transportation, warehousing, last-mile delivery, and customs.'),
        ('manufacturing',      'operations_sc',       'Manufacturing & Production',
         'Production planning, shop-floor management, and process improvement.'),
        ('facilities',         'operations_sc',       'Facilities Management',
         'Workplace services, space planning, and real estate management.'),
        ('quality_mgmt',       'operations_sc',       'Quality Management',
         'Quality standards, process control, and certification compliance.'),
        ('hse',                'operations_sc',       'Health, Safety & Environment',
         'Occupational health, safety programmes, and environmental compliance.'),
        -- Legal & Compliance
        ('corporate_legal',    'legal_compliance',   'Corporate Legal',
         'Corporate governance, M&A, entity management, and board matters.'),
        ('contracts',          'legal_compliance',   'Contracts & Commercial',
         'Commercial contract drafting, negotiation, and lifecycle management.'),
        ('ip_patents',         'legal_compliance',   'IP, Patents & Trademarks',
         'Intellectual property protection, licensing, and patent prosecution.'),
        ('employment_law',     'legal_compliance',   'Employment & Labour Law',
         'Labour relations, employment litigation, and HR legal advisory.'),
        ('reg_compliance',     'legal_compliance',   'Regulatory & Compliance',
         'Regulatory monitoring, licensing, and compliance programme management.'),
        ('data_privacy',       'legal_compliance',   'Data Privacy & Protection',
         'GDPR, PDPA, LGPD, data subject rights, and privacy-by-design.'),
        -- Customer Success & Support
        ('cust_support',       'customer_success',   'Customer Support',
         'Inbound issue resolution, helpdesk, and tier-1 customer support.'),
        ('cust_success_mgmt',  'customer_success',   'Customer Success Management',
         'Proactive account health management and customer value realisation.'),
        ('technical_support',  'customer_success',   'Technical Support',
         'Tier-2/tier-3 technical troubleshooting and escalation management.'),
        ('implementation',     'customer_success',   'Implementation & Onboarding',
         'Customer deployment, configuration, and go-live programme management.'),
        -- Research & Development
        ('applied_research',   'research_dev',       'Applied Research',
         'Translating scientific research into practical product applications.'),
        ('product_dev',        'research_dev',       'Product Development',
         'New product ideation, prototyping, and structured development cycles.'),
        ('innovation',         'research_dev',       'Innovation & Labs',
         'Emerging technology evaluation and disruptive innovation initiatives.'),
        -- Data & Analytics
        ('data_science',       'data_analytics',     'Data Science & Machine Learning',
         'Statistical modelling, ML prototyping, and experimentation design.'),
        ('bi_reporting',       'data_analytics',     'BI & Reporting',
         'Dashboards, KPI reporting, and business intelligence tool management.'),
        ('data_governance',    'data_analytics',     'Data Governance & Quality',
         'Data cataloguing, lineage tracking, quality standards, and stewardship.'),
        ('ai_ml_eng',          'data_analytics',     'AI/ML Engineering',
         'Production ML systems, MLOps, and AI platform engineering.'),
        -- Administration & Facilities
        ('exec_support',       'admin_facilities',   'Executive & Admin Support',
         'EA/PA services, calendar management, and office coordination.'),
        ('records_mgmt',       'admin_facilities',   'Records & Document Management',
         'Records retention, archiving, and document control governance.'),
        -- Healthcare & Medical
        ('clinical_medicine',  'healthcare_medical', 'Clinical Medicine',
         'Physician services, clinical diagnosis, and patient treatment.'),
        ('nursing',            'healthcare_medical', 'Nursing & Patient Care',
         'Bedside nursing, care coordination, and patient advocacy.'),
        ('pharmacy',           'healthcare_medical', 'Pharmacy',
         'Drug dispensing, medication review, and pharmaceutical care.'),
        ('diagnostics',        'healthcare_medical', 'Diagnostics & Imaging',
         'Laboratory testing, radiology, and diagnostic service delivery.'),
        ('allied_health',      'healthcare_medical', 'Allied Health',
         'Physiotherapy, occupational therapy, and allied health professions.'),
        -- Creative & Design
        ('ux_design',          'creative_design',    'UX & Product Design',
         'User research, interaction design, prototyping, and usability testing.'),
        ('graphic_visual',     'creative_design',    'Graphic & Visual Design',
         'Visual identity, illustration, and print/digital design production.'),
        ('video_media',        'creative_design',    'Video & Media Production',
         'Video production, editing, animation, and motion graphics.'),
        -- Risk, Security & Audit
        ('enterprise_risk',    'security_risk',      'Enterprise Risk Management',
         'Risk identification, quantification, and mitigation frameworks.'),
        ('internal_controls',  'security_risk',      'Internal Controls',
         'Control design, testing, and SOX/ICFR compliance assurance.'),
        ('business_continuity','security_risk',      'Business Continuity',
         'BCP/DRP planning, testing, and organisational resilience.'),
        -- Executive & General Management
        ('executive_leadership','executive_mgmt',    'Executive Leadership',
         'C-suite strategic leadership with enterprise-wide accountability.'),
        ('general_management', 'executive_mgmt',     'General Management',
         'P&L ownership and cross-functional business unit leadership.')
    ) AS x(code, family, name, description)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name          = EXCLUDED.name,
            description   = EXCLUDED.description,
            job_family_id = EXCLUDED.job_family_id,
            updated_at    = now(),
            updated_by    = v_su
        WHERE (master.job_function.name, master.job_function.description,
               master.job_function.job_family_id)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description,
                                EXCLUDED.job_family_id);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] job_function: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- CAREER BANDS  (9 tiers from Entry to C-Suite)
    -- ========================================================================
    INSERT INTO master.career_band (id, tenant_id, code, name, sort_order, status, created_by)
    VALUES
        (shared.uuidv7(), v_tid, 'ENTRY',      'Entry Level',       10, 'active', v_su),
        (shared.uuidv7(), v_tid, 'DEVELOPING', 'Developing',        20, 'active', v_su),
        (shared.uuidv7(), v_tid, 'PROFESSIONAL','Professional',     30, 'active', v_su),
        (shared.uuidv7(), v_tid, 'SENIOR',     'Senior',            40, 'active', v_su),
        (shared.uuidv7(), v_tid, 'LEAD',       'Lead / Principal',  50, 'active', v_su),
        (shared.uuidv7(), v_tid, 'MANAGEMENT', 'Management',        60, 'active', v_su),
        (shared.uuidv7(), v_tid, 'SR_MGMT',    'Senior Management', 70, 'active', v_su),
        (shared.uuidv7(), v_tid, 'EXECUTIVE',  'Executive',         80, 'active', v_su),
        (shared.uuidv7(), v_tid, 'C_SUITE',    'C-Suite',           90, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order,
            updated_at = now(),
            updated_by = v_su
        WHERE (master.career_band.name, master.career_band.sort_order)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.sort_order);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] career_band: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- CAREER LEVELS  (19 levels spanning all bands)
    -- ========================================================================
    INSERT INTO master.career_level (id, tenant_id, code, name, career_band_id, level_no, sort_order, status, created_by)
    SELECT shared.uuidv7(), v_tid, x.code, x.name,
           (SELECT id FROM master.career_band WHERE tenant_id = v_tid AND code = x.band),
           x.lvl_no, x.sort_order, 'active', v_su
    FROM (VALUES
        ('E1',  'Entry Level 1',         'ENTRY',       1, 10),
        ('E2',  'Entry Level 2',         'ENTRY',       2, 20),
        ('D1',  'Developing Level 1',    'DEVELOPING',  1, 30),
        ('D2',  'Developing Level 2',    'DEVELOPING',  2, 40),
        ('P1',  'Professional Level 1',  'PROFESSIONAL',1, 50),
        ('P2',  'Professional Level 2',  'PROFESSIONAL',2, 60),
        ('P3',  'Professional Level 3',  'PROFESSIONAL',3, 70),
        ('S1',  'Senior Level 1',        'SENIOR',      1, 80),
        ('S2',  'Senior Level 2',        'SENIOR',      2, 90),
        ('L1',  'Lead Level 1',          'LEAD',        1, 100),
        ('L2',  'Principal / Staff',     'LEAD',        2, 110),
        ('M1',  'Manager Level 1',       'MANAGEMENT',  1, 120),
        ('M2',  'Manager Level 2',       'MANAGEMENT',  2, 130),
        ('M3',  'Senior Manager',        'MANAGEMENT',  3, 140),
        ('SM1', 'Director',              'SR_MGMT',     1, 150),
        ('SM2', 'Senior Director',       'SR_MGMT',     2, 160),
        ('EX1', 'Vice President',        'EXECUTIVE',   1, 170),
        ('EX2', 'Senior / Exec VP',      'EXECUTIVE',   2, 180),
        ('C1',  'C-Suite Executive',     'C_SUITE',     1, 190)
    ) AS x(code, name, band, lvl_no, sort_order)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            level_no   = EXCLUDED.level_no,
            sort_order = EXCLUDED.sort_order,
            updated_at = now(),
            updated_by = v_su
        WHERE (master.career_level.name, master.career_level.level_no, master.career_level.sort_order)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.level_no, EXCLUDED.sort_order);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] career_level: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- PAY GRADES  (G01–G15)
    -- Amounts are intentionally NULL — configure min/midpoint/max per
    -- currency/country/market benchmark in a separate localisation seed.
    -- grade_set='universal' groups all grades from this pack.
    -- ========================================================================
    INSERT INTO master.pay_grade (id, tenant_id, code, name, grade_set, status, created_by)
    VALUES
        (shared.uuidv7(), v_tid, 'G01', 'Grade 01 — Intern / Trainee',          'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G02', 'Grade 02 — Junior Entry',               'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G03', 'Grade 03 — Associate / Analyst I',      'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G04', 'Grade 04 — Associate / Analyst II',     'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G05', 'Grade 05 — Professional I',             'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G06', 'Grade 06 — Professional II',            'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G07', 'Grade 07 — Professional III',           'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G08', 'Grade 08 — Senior I',                   'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G09', 'Grade 09 — Senior II',                  'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G10', 'Grade 10 — Lead / Principal',           'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G11', 'Grade 11 — Staff / Distinguished',      'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G12', 'Grade 12 — Manager',                    'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G13', 'Grade 13 — Senior Manager',             'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G14', 'Grade 14 — Director / VP',              'universal', 'active', v_su),
        (shared.uuidv7(), v_tid, 'G15', 'Grade 15 — Executive / C-Suite',        'universal', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            grade_set  = EXCLUDED.grade_set,
            updated_at = now(),
            updated_by = v_su
        WHERE (master.pay_grade.name, master.pay_grade.grade_set)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.grade_set);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] pay_grade: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- DESIGNATIONS  (~48 universal job title labels)
    -- ========================================================================
    INSERT INTO master.designation (id, tenant_id, code, name, description, status, created_by)
    VALUES
        -- ── Entry / Intern tier ───────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'intern',             'Intern',
         'Short-term industry placement for students or recent graduates.',                                'active', v_su),
        (shared.uuidv7(), v_tid, 'trainee',            'Trainee',
         'Structured programme participant building foundational functional skills.',                     'active', v_su),
        (shared.uuidv7(), v_tid, 'apprentice',         'Apprentice',
         'Work-based learner combining on-the-job training with formal qualification.',                   'active', v_su),
        (shared.uuidv7(), v_tid, 'graduate_associate', 'Graduate Associate',
         'Recent graduate in a rotational or early-career development programme.',                        'active', v_su),
        -- ── Developing tier ──────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'junior_associate',   'Junior Associate',
         'Early-career professional developing core competencies.',                                       'active', v_su),
        (shared.uuidv7(), v_tid, 'associate',          'Associate',
         'Foundation-level professional contributing to team deliverables.',                              'active', v_su),
        (shared.uuidv7(), v_tid, 'analyst',            'Analyst',
         'Analytical professional supporting data-driven business decisions.',                            'active', v_su),
        (shared.uuidv7(), v_tid, 'coordinator',        'Coordinator',
         'Coordinates activities, schedules, and process workflows.',                                     'active', v_su),
        (shared.uuidv7(), v_tid, 'assistant',          'Assistant',
         'Provides administrative or functional support to a team or executive.',                         'active', v_su),
        -- ── Professional tier ─────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'specialist',         'Specialist',
         'Subject-matter professional applying expertise to complex problems.',                           'active', v_su),
        (shared.uuidv7(), v_tid, 'consultant',         'Consultant',
         'Advisory professional delivering analysis, recommendations, and solutions.',                    'active', v_su),
        (shared.uuidv7(), v_tid, 'engineer',           'Engineer',
         'Technical professional designing, building, or maintaining systems.',                           'active', v_su),
        (shared.uuidv7(), v_tid, 'officer',            'Officer',
         'Professional with defined ownership and accountability in a domain.',                           'active', v_su),
        -- ── Senior tier ───────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'senior_analyst',     'Senior Analyst',
         'Experienced analyst independently leading analysis and mentoring juniors.',                     'active', v_su),
        (shared.uuidv7(), v_tid, 'senior_specialist',  'Senior Specialist',
         'Deep-domain specialist with broad impact and informal peer leadership.',                        'active', v_su),
        (shared.uuidv7(), v_tid, 'senior_consultant',  'Senior Consultant',
         'Experienced advisor managing complex engagements and client relationships.',                    'active', v_su),
        (shared.uuidv7(), v_tid, 'senior_engineer',    'Senior Engineer',
         'Experienced engineer contributing to architecture decisions and mentoring.',                     'active', v_su),
        (shared.uuidv7(), v_tid, 'senior_associate',   'Senior Associate',
         'Experienced associate leading workstreams with increasing independence.',                       'active', v_su),
        -- ── Lead / Principal tier ─────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'lead',               'Lead',
         'Technical or functional lead guiding a team or work stream.',                                  'active', v_su),
        (shared.uuidv7(), v_tid, 'technical_lead',     'Technical Lead',
         'Engineering lead setting technical direction for a squad or service area.',                    'active', v_su),
        (shared.uuidv7(), v_tid, 'principal',          'Principal',
         'Senior IC with significant influence on architecture and strategy.',                           'active', v_su),
        (shared.uuidv7(), v_tid, 'staff_engineer',     'Staff Engineer',
         'Distinguished IC driving cross-team engineering standards and platforms.',                     'active', v_su),
        (shared.uuidv7(), v_tid, 'subject_matter_expert','Subject Matter Expert',
         'Recognised deep expert consulted for critical decisions in a domain.',                         'active', v_su),
        (shared.uuidv7(), v_tid, 'architect',          'Architect',
         'Designs complex system or solution architectures at enterprise scale.',                        'active', v_su),
        -- ── Management tier ───────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'team_leader',        'Team Leader',
         'First-line supervisor of a small team (typically 3–8 people).',                               'active', v_su),
        (shared.uuidv7(), v_tid, 'supervisor',         'Supervisor',
         'Operational supervisor ensuring day-to-day team performance and compliance.',                  'active', v_su),
        (shared.uuidv7(), v_tid, 'manager',            'Manager',
         'People manager owning team objectives, performance, and career development.',                  'active', v_su),
        (shared.uuidv7(), v_tid, 'senior_manager',     'Senior Manager',
         'Experienced manager overseeing multiple teams or a broad functional sub-area.',               'active', v_su),
        (shared.uuidv7(), v_tid, 'department_head',    'Department Head',
         'Owner of a defined department with full functional and budgetary accountability.',            'active', v_su),
        -- ── Senior Management tier ────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'director',           'Director',
         'Functional director with budget ownership and multi-team leadership.',                        'active', v_su),
        (shared.uuidv7(), v_tid, 'senior_director',    'Senior Director',
         'Senior functional director with broader strategic scope or multiple sub-functions.',          'active', v_su),
        (shared.uuidv7(), v_tid, 'head_of',            'Head of [Function]',
         'Senior functional owner equivalent to Director; used in specialist domains.',                 'active', v_su),
        -- ── Executive tier ────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'vice_president',     'Vice President',
         'Cross-functional leader with P&L or major programme accountability.',                         'active', v_su),
        (shared.uuidv7(), v_tid, 'senior_vp',          'Senior Vice President',
         'SVP with wide regional, divisional, or multi-function responsibility.',                       'active', v_su),
        (shared.uuidv7(), v_tid, 'executive_vp',       'Executive Vice President',
         'EVP with enterprise-level strategic and operational authority.',                              'active', v_su),
        (shared.uuidv7(), v_tid, 'general_manager',    'General Manager',
         'P&L owner of a discrete business unit, market, or geography.',                              'active', v_su),
        (shared.uuidv7(), v_tid, 'managing_director',  'Managing Director',
         'Legal entity head or senior market leader with full operational control.',                    'active', v_su),
        -- ── C-Suite ───────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'ceo',  'Chief Executive Officer',
         'Highest executive accountable for overall strategy, performance, and stakeholders.',          'active', v_su),
        (shared.uuidv7(), v_tid, 'coo',  'Chief Operating Officer',
         'Responsible for day-to-day operational execution of the enterprise.',                        'active', v_su),
        (shared.uuidv7(), v_tid, 'cfo',  'Chief Financial Officer',
         'Accountable for financial strategy, controls, reporting, and capital allocation.',            'active', v_su),
        (shared.uuidv7(), v_tid, 'cto',  'Chief Technology Officer',
         'Owns technology vision, engineering excellence, and product engineering delivery.',           'active', v_su),
        (shared.uuidv7(), v_tid, 'chro', 'Chief Human Resources Officer',
         'Leads people strategy, talent, culture, and organisational effectiveness.',                  'active', v_su),
        (shared.uuidv7(), v_tid, 'cmo',  'Chief Marketing Officer',
         'Sets marketing vision; drives brand, demand generation, and GTM strategy.',                  'active', v_su),
        (shared.uuidv7(), v_tid, 'cio',  'Chief Information Officer',
         'Accountable for IT strategy, enterprise systems, and digital transformation.',               'active', v_su),
        (shared.uuidv7(), v_tid, 'cro',  'Chief Revenue Officer',
         'Owns end-to-end revenue — sales, partnerships, and customer success.',                       'active', v_su),
        (shared.uuidv7(), v_tid, 'cpo',  'Chief Product Officer',
         'Leads product strategy, roadmap, and product management function.',                          'active', v_su),
        (shared.uuidv7(), v_tid, 'clo',  'Chief Legal Officer',
         'Heads legal, compliance, governance, and enterprise risk functions.',                        'active', v_su),
        (shared.uuidv7(), v_tid, 'cdo',  'Chief Data Officer',
         'Responsible for enterprise data strategy, governance, and analytics.',                       'active', v_su),
        (shared.uuidv7(), v_tid, 'ciso', 'Chief Information Security Officer',
         'Owns cybersecurity strategy, incident response, and information risk management.',           'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name        = EXCLUDED.name,
            description = EXCLUDED.description,
            updated_at  = now(),
            updated_by  = v_su
        WHERE (master.designation.name, master.designation.description)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] designation: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- JOBS  (80 composite profiles — family → function → band → level →
    --        grade → designation)
    -- Each row uses subqueries to resolve FK IDs, keeping codes readable
    -- and eliminating brittle UUID literals.
    -- ========================================================================
    INSERT INTO master.job (
        id, tenant_id, code, name,
        job_family_id, job_function_id,
        career_band_id, career_level_id, pay_grade_id, designation_id,
        description, status, created_by
    )
    SELECT
        shared.uuidv7(), v_tid, x.code, x.name,
        (SELECT id FROM master.job_family   WHERE tenant_id = v_tid AND code = x.fam),
        (SELECT id FROM master.job_function WHERE tenant_id = v_tid AND code = x.fn),
        (SELECT id FROM master.career_band  WHERE tenant_id = v_tid AND code = x.band),
        (SELECT id FROM master.career_level WHERE tenant_id = v_tid AND code = x.lvl),
        (SELECT id FROM master.pay_grade    WHERE tenant_id = v_tid AND code = x.grade),
        (SELECT id FROM master.designation  WHERE tenant_id = v_tid AND code = x.dsgn),
        x.description, 'active', v_su
    FROM (VALUES

        -- ── Technology & Engineering (21 jobs) ───────────────────────────
        ('jr_software_engineer',        'Junior Software Engineer',
         'tech_engineering','sw_engineering',  'ENTRY',      'E2', 'G02','engineer',
         'Entry-level developer working on feature development and bug fixes under guidance.'),

        ('software_engineer',           'Software Engineer',
         'tech_engineering','sw_engineering',  'DEVELOPING', 'D1', 'G03','engineer',
         'Full-cycle developer contributing features, code reviews, and unit tests.'),

        ('software_engineer_ii',        'Software Engineer II',
         'tech_engineering','sw_engineering',  'PROFESSIONAL','P1','G05','engineer',
         'Independently designs and delivers software components with minimal oversight.'),

        ('sr_software_engineer',        'Senior Software Engineer',
         'tech_engineering','sw_engineering',  'SENIOR',     'S1', 'G08','senior_engineer',
         'Technical leader within a squad, driving quality standards and best practices.'),

        ('staff_software_engineer',     'Staff Software Engineer',
         'tech_engineering','sw_engineering',  'LEAD',       'L1', 'G10','staff_engineer',
         'Cross-team engineer shaping architecture and solving high-impact problems.'),

        ('principal_software_engineer', 'Principal Software Engineer',
         'tech_engineering','platform_arch',   'LEAD',       'L2', 'G11','principal',
         'Organisation-wide technical authority; shapes engineering strategy and standards.'),

        ('engineering_manager',         'Engineering Manager',
         'tech_engineering','sw_engineering',  'MANAGEMENT', 'M1', 'G12','manager',
         'People manager for 5–10 engineers; owns team delivery, growth, and culture.'),

        ('sr_engineering_manager',      'Senior Engineering Manager',
         'tech_engineering','sw_engineering',  'MANAGEMENT', 'M3', 'G13','senior_manager',
         'Manager of managers or lead for multiple squads across a product area.'),

        ('director_engineering',        'Director of Engineering',
         'tech_engineering','sw_engineering',  'SR_MGMT',    'SM1','G14','director',
         'Engineering org leader; drives roadmap, headcount planning, and engineering culture.'),

        ('vp_engineering',              'Vice President of Engineering',
         'tech_engineering','sw_engineering',  'EXECUTIVE',  'EX1','G15','vice_president',
         'Engineering executive with enterprise-wide product delivery accountability.'),

        ('cto',                         'Chief Technology Officer',
         'tech_engineering','platform_arch',   'C_SUITE',    'C1', 'G15','cto',
         'Sets technology vision; leads engineering, infrastructure, and product engineering.'),

        ('devops_engineer',             'DevOps Engineer',
         'tech_engineering','devops_infra',    'PROFESSIONAL','P1','G05','engineer',
         'Designs and maintains CI/CD pipelines, IaC, and cloud platform reliability.'),

        ('sr_devops_engineer',          'Senior DevOps Engineer',
         'tech_engineering','devops_infra',    'SENIOR',     'S1', 'G08','senior_engineer',
         'Leads platform reliability, observability stack, and infrastructure evolution.'),

        ('data_engineer',               'Data Engineer',
         'tech_engineering','data_engineering','PROFESSIONAL','P1','G05','engineer',
         'Builds and optimises data pipelines, ETL processes, and warehouse models.'),

        ('sr_data_engineer',            'Senior Data Engineer',
         'tech_engineering','data_engineering','SENIOR',     'S1', 'G08','senior_engineer',
         'Architects data platforms and governs data quality across engineering teams.'),

        ('qa_engineer',                 'QA Engineer',
         'tech_engineering','qa_testing',      'PROFESSIONAL','P1','G05','engineer',
         'Designs test strategies, writes automation, and gates software quality.'),

        ('sr_qa_engineer',              'Senior QA Engineer',
         'tech_engineering','qa_testing',      'SENIOR',     'S1', 'G08','senior_engineer',
         'Leads quality engineering practice and test automation frameworks.'),

        ('cybersecurity_analyst',       'Cybersecurity Analyst',
         'tech_engineering','cybersecurity',   'PROFESSIONAL','P1','G05','analyst',
         'Monitors threats, performs vulnerability assessments, and responds to incidents.'),

        ('sr_cybersecurity_engineer',   'Senior Cybersecurity Engineer',
         'tech_engineering','cybersecurity',   'SENIOR',     'S1', 'G08','senior_engineer',
         'Designs security controls; leads penetration testing and red-team programmes.'),

        ('solutions_architect',         'Solutions Architect',
         'tech_engineering','platform_arch',   'LEAD',       'L1', 'G10','architect',
         'Designs end-to-end technical solutions aligning business needs with technology.'),

        ('it_support_specialist',       'IT Support Specialist',
         'tech_engineering','it_support',      'DEVELOPING', 'D1', 'G03','specialist',
         'Provides end-user hardware, software, and network troubleshooting support.'),

        -- ── Finance & Accounting (10 jobs) ───────────────────────────────
        ('financial_analyst',           'Financial Analyst',
         'finance_accounting','fin_planning',  'DEVELOPING', 'D2', 'G04','analyst',
         'Supports budgeting, forecasting, and variance analysis cycles.'),

        ('sr_financial_analyst',        'Senior Financial Analyst',
         'finance_accounting','fin_planning',  'PROFESSIONAL','P2','G06','senior_analyst',
         'Independently leads FP&A cycles and partners with business unit leaders.'),

        ('finance_manager',             'Finance Manager',
         'finance_accounting','fin_planning',  'MANAGEMENT', 'M1', 'G12','manager',
         'Manages the finance team; owns reporting cycles and business insights delivery.'),

        ('finance_director',            'Finance Director',
         'finance_accounting','fin_planning',  'SR_MGMT',    'SM1','G14','director',
         'Heads the finance function; strategic business partner to C-suite.'),

        ('cfo',                         'Chief Financial Officer',
         'executive_mgmt','executive_leadership','C_SUITE',  'C1', 'G15','cfo',
         'Accountable for financial strategy, capital allocation, and regulatory compliance.'),

        ('accountant',                  'Accountant',
         'finance_accounting','accounting',    'PROFESSIONAL','P1','G05','specialist',
         'Prepares financial statements, manages GL entries, and ensures reporting accuracy.'),

        ('sr_accountant',               'Senior Accountant',
         'finance_accounting','accounting',    'SENIOR',     'S1', 'G08','senior_specialist',
         'Leads month-end close, reconciliations, and external audit support.'),

        ('tax_specialist',              'Tax Specialist',
         'finance_accounting','tax',           'PROFESSIONAL','P2','G06','specialist',
         'Prepares and reviews tax filings; advises on planning and transfer pricing.'),

        ('internal_auditor',            'Internal Auditor',
         'finance_accounting','internal_audit','PROFESSIONAL','P1','G05','specialist',
         'Conducts risk-based audits and evaluates internal control effectiveness.'),

        ('procurement_specialist',      'Procurement Specialist',
         'finance_accounting','procurement',   'PROFESSIONAL','P1','G05','specialist',
         'Manages vendor relationships, sourcing, and contract negotiation.'),

        -- ── Human Resources (9 jobs) ─────────────────────────────────────
        ('hr_coordinator',              'HR Coordinator',
         'human_resources','hr_ops',           'DEVELOPING', 'D1', 'G03','coordinator',
         'Handles employee lifecycle admin, onboarding coordination, and HRIS data entry.'),

        ('recruiter',                   'Recruiter',
         'human_resources','talent_acquisition','PROFESSIONAL','P1','G05','specialist',
         'Manages full-cycle recruitment for assigned roles and business units.'),

        ('sr_recruiter',                'Senior Recruiter',
         'human_resources','talent_acquisition','SENIOR',    'S1', 'G08','senior_specialist',
         'Leads complex senior hiring; builds talent pipelines and advises hiring managers.'),

        ('hr_business_partner',         'HR Business Partner',
         'human_resources','hr_bp',            'SENIOR',     'S1', 'G08','senior_specialist',
         'Embedded HR partner supporting a business unit on people strategy and relations.'),

        ('comp_benefits_specialist',    'Compensation & Benefits Specialist',
         'human_resources','comp_benefits',    'PROFESSIONAL','P2','G06','specialist',
         'Designs and administers total rewards programmes and benefits structures.'),

        ('hr_manager',                  'HR Manager',
         'human_resources','hr_bp',            'MANAGEMENT', 'M1', 'G12','manager',
         'Leads the HR team; partners with leadership on people strategy and engagement.'),

        ('hr_director',                 'HR Director',
         'human_resources','hr_bp',            'SR_MGMT',    'SM1','G14','director',
         'Heads the HR function; drives organisational design, culture, and talent.'),

        ('chro',                        'Chief Human Resources Officer',
         'executive_mgmt','executive_leadership','C_SUITE',  'C1', 'G15','chro',
         'Sets people strategy and leads talent, culture, and total rewards at enterprise level.'),

        ('ld_specialist',               'L&D Specialist',
         'human_resources','learning_dev',     'PROFESSIONAL','P1','G05','specialist',
         'Designs and delivers training programmes and digital learning content.'),

        -- ── Sales & Business Development (8 jobs) ────────────────────────
        ('sales_development_rep',       'Sales Development Representative',
         'sales_growth','enterprise_sales',    'ENTRY',      'E2', 'G02','associate',
         'Qualifies inbound and outbound leads to build the commercial sales pipeline.'),

        ('account_executive',           'Account Executive',
         'sales_growth','enterprise_sales',    'PROFESSIONAL','P2','G06','specialist',
         'Owns the full sales cycle from discovery to close for assigned accounts.'),

        ('sr_account_executive',        'Senior Account Executive',
         'sales_growth','enterprise_sales',    'SENIOR',     'S1', 'G08','senior_specialist',
         'Manages large strategic accounts and navigates complex enterprise procurement.'),

        ('sales_manager',               'Sales Manager',
         'sales_growth','enterprise_sales',    'MANAGEMENT', 'M1', 'G12','manager',
         'Coaches a team of AEs; owns team quota attainment and pipeline health.'),

        ('regional_sales_director',     'Regional Sales Director',
         'sales_growth','enterprise_sales',    'SR_MGMT',    'SM1','G14','director',
         'Leads regional sales organisation and drives territory revenue strategy.'),

        ('vp_sales',                    'Vice President of Sales',
         'sales_growth','enterprise_sales',    'EXECUTIVE',  'EX1','G15','vice_president',
         'Owns revenue targets and strategy across a major business or geographic segment.'),

        ('cro',                         'Chief Revenue Officer',
         'executive_mgmt','executive_leadership','C_SUITE',  'C1', 'G15','cro',
         'Accountable for end-to-end revenue — sales, partnerships, and customer success.'),

        ('partnerships_manager',        'Partnerships Manager',
         'sales_growth','partnerships',        'MANAGEMENT', 'M1', 'G12','manager',
         'Develops and manages strategic channel and alliance partnerships.'),

        -- ── Marketing & Communications (6 jobs) ──────────────────────────
        ('marketing_coordinator',       'Marketing Coordinator',
         'marketing_comms','brand_comms',      'DEVELOPING', 'D1', 'G03','coordinator',
         'Supports campaign execution, events, content production, and reporting.'),

        ('marketing_specialist',        'Marketing Specialist',
         'marketing_comms','digital_marketing','PROFESSIONAL','P1','G05','specialist',
         'Executes digital marketing campaigns and analyses channel performance.'),

        ('content_writer',              'Content Writer',
         'marketing_comms','content_editorial','PROFESSIONAL','P1','G05','specialist',
         'Creates high-quality content for web, social, and thought leadership channels.'),

        ('product_marketing_manager',   'Product Marketing Manager',
         'marketing_comms','product_marketing','MANAGEMENT', 'M1', 'G12','manager',
         'Leads GTM planning, competitive positioning, and product launch execution.'),

        ('marketing_director',          'Marketing Director',
         'marketing_comms','brand_comms',      'SR_MGMT',    'SM1','G14','director',
         'Owns marketing strategy, brand, and demand generation function.'),

        ('cmo',                         'Chief Marketing Officer',
         'executive_mgmt','executive_leadership','C_SUITE',  'C1', 'G15','cmo',
         'Sets marketing vision; drives brand equity, demand, and customer acquisition.'),

        -- ── Operations & Supply Chain (6 jobs) ───────────────────────────
        ('operations_analyst',          'Operations Analyst',
         'operations_sc','supply_chain_mgmt',  'PROFESSIONAL','P1','G05','analyst',
         'Analyses operations data to identify process improvement opportunities.'),

        ('operations_manager',          'Operations Manager',
         'operations_sc','supply_chain_mgmt',  'MANAGEMENT', 'M1', 'G12','manager',
         'Manages day-to-day operations for a department or facility.'),

        ('sr_operations_manager',       'Senior Operations Manager',
         'operations_sc','supply_chain_mgmt',  'MANAGEMENT', 'M3', 'G13','senior_manager',
         'Oversees multiple operational sub-functions and drives strategic improvement.'),

        ('operations_director',         'Operations Director',
         'operations_sc','supply_chain_mgmt',  'SR_MGMT',    'SM1','G14','director',
         'Heads the operations function; owns KPIs and partners with C-suite on strategy.'),

        ('coo',                         'Chief Operating Officer',
         'executive_mgmt','general_management','C_SUITE',    'C1', 'G15','coo',
         'Accountable for end-to-end operational delivery and execution across the enterprise.'),

        ('logistics_coordinator',       'Logistics Coordinator',
         'operations_sc','logistics',          'DEVELOPING', 'D1', 'G03','coordinator',
         'Coordinates shipments, carrier relationships, and delivery schedules.'),

        -- ── Legal & Compliance (5 jobs) ───────────────────────────────────
        ('legal_counsel',               'Legal Counsel',
         'legal_compliance','corporate_legal', 'SENIOR',     'S1', 'G08','officer',
         'Provides legal advice, drafts and reviews contracts, and manages regulatory matters.'),

        ('sr_legal_counsel',            'Senior Legal Counsel',
         'legal_compliance','corporate_legal', 'LEAD',       'L1', 'G10','senior_specialist',
         'Leads complex legal matters; supports M&A transactions and commercial deals.'),

        ('compliance_officer',          'Compliance Officer',
         'legal_compliance','reg_compliance',  'PROFESSIONAL','P2','G06','officer',
         'Monitors regulatory requirements and manages the compliance programme.'),

        ('data_privacy_officer',        'Data Privacy Officer',
         'legal_compliance','data_privacy',    'SENIOR',     'S1', 'G08','officer',
         'Ensures compliance with GDPR, PDPA, LGPD, and other data protection laws.'),

        ('general_counsel',             'General Counsel',
         'legal_compliance','corporate_legal', 'SR_MGMT',    'SM2','G14','senior_director',
         'Heads the legal department; serves as chief legal advisor to the board.'),

        -- ── Customer Success & Support (5 jobs) ──────────────────────────
        ('customer_support_specialist', 'Customer Support Specialist',
         'customer_success','cust_support',    'DEVELOPING', 'D1', 'G03','specialist',
         'Resolves customer queries across chat, email, and phone channels.'),

        ('customer_success_manager',    'Customer Success Manager',
         'customer_success','cust_success_mgmt','PROFESSIONAL','P2','G06','specialist',
         'Manages a portfolio of accounts; drives adoption, health scores, and retention.'),

        ('sr_customer_success_manager', 'Senior Customer Success Manager',
         'customer_success','cust_success_mgmt','SENIOR',    'S1', 'G08','senior_manager',
         'Owns strategic accounts and mentors junior CSMs on playbook execution.'),

        ('director_customer_success',   'Director of Customer Success',
         'customer_success','cust_success_mgmt','SR_MGMT',   'SM1','G14','director',
         'Leads the CS organisation; owns NRR, churn targets, and CS team structure.'),

        ('implementation_consultant',   'Implementation Consultant',
         'customer_success','implementation',  'PROFESSIONAL','P1','G05','consultant',
         'Configures and deploys products at customer sites; manages go-live readiness.'),

        -- ── Data & Analytics (5 jobs) ─────────────────────────────────────
        ('data_analyst',                'Data Analyst',
         'data_analytics','bi_reporting',      'PROFESSIONAL','P1','G05','analyst',
         'Transforms raw data into actionable insights via analysis and dashboards.'),

        ('sr_data_analyst',             'Senior Data Analyst',
         'data_analytics','bi_reporting',      'SENIOR',     'S1', 'G08','senior_analyst',
         'Leads analytical workstreams; advises business teams on data strategy.'),

        ('data_scientist',              'Data Scientist',
         'data_analytics','data_science',      'PROFESSIONAL','P2','G06','specialist',
         'Builds statistical models and ML prototypes to solve business problems.'),

        ('sr_data_scientist',           'Senior Data Scientist',
         'data_analytics','data_science',      'SENIOR',     'S1', 'G08','senior_specialist',
         'Leads modelling projects; operationalises and monitors ML solutions.'),

        ('ml_engineer',                 'Machine Learning Engineer',
         'data_analytics','ai_ml_eng',         'SENIOR',     'S1', 'G08','engineer',
         'Develops, trains, and deploys production ML models and MLOps pipelines.'),

        -- ── Research & Development (2 jobs) ───────────────────────────────
        ('research_associate',          'Research Associate',
         'research_dev','applied_research',    'PROFESSIONAL','P1','G05','associate',
         'Conducts experiments, literature reviews, and data collection for R&D projects.'),

        ('research_scientist',          'Research Scientist',
         'research_dev','applied_research',    'SENIOR',     'S1', 'G08','specialist',
         'Leads research programmes; designs experiments and publishes findings.'),

        -- ── Administration & Facilities (2 jobs) ─────────────────────────
        ('executive_assistant',         'Executive Assistant',
         'admin_facilities','exec_support',    'PROFESSIONAL','P1','G05','assistant',
         'Provides high-level EA support: calendars, travel, board prep, and correspondence.'),

        ('office_manager',              'Office Manager',
         'admin_facilities','facilities',      'MANAGEMENT', 'M1', 'G12','manager',
         'Manages day-to-day office operations, vendor relationships, and facilities.'),

        -- ── Healthcare & Medical (3 jobs) ─────────────────────────────────
        ('registered_nurse',            'Registered Nurse',
         'healthcare_medical','nursing',       'PROFESSIONAL','P1','G05','specialist',
         'Delivers evidence-based patient care; coordinates with clinical teams.'),

        ('clinical_pharmacist',         'Clinical Pharmacist',
         'healthcare_medical','pharmacy',      'PROFESSIONAL','P2','G06','specialist',
         'Reviews prescriptions, counsels patients, and ensures safe medication use.'),

        ('medical_officer',             'Medical Officer',
         'healthcare_medical','clinical_medicine','SENIOR',  'S1', 'G08','officer',
         'Provides clinical assessment, diagnosis, and treatment within a healthcare setting.'),

        -- ── Creative & Design (2 jobs) ────────────────────────────────────
        ('ux_designer',                 'UX Designer',
         'creative_design','ux_design',        'PROFESSIONAL','P1','G05','specialist',
         'Conducts user research; creates wireframes, prototypes, and interaction designs.'),

        ('sr_ux_designer',              'Senior UX Designer',
         'creative_design','ux_design',        'SENIOR',     'S1', 'G08','senior_specialist',
         'Leads UX strategy for product areas; mentors designers and drives design systems.'),

        -- ── Executive & General Management (3 jobs) ───────────────────────
        ('general_manager',             'General Manager',
         'executive_mgmt','general_management','EXECUTIVE',  'EX1','G15','general_manager',
         'Owns P&L and full operational leadership of a discrete business unit.'),

        ('managing_director',           'Managing Director',
         'executive_mgmt','general_management','EXECUTIVE',  'EX2','G15','managing_director',
         'Legal entity head with enterprise-level decision authority and board accountability.'),

        ('ceo',                         'Chief Executive Officer',
         'executive_mgmt','executive_leadership','C_SUITE',  'C1', 'G15','ceo',
         'Highest executive; accountable to the board for strategy and enterprise performance.')

    ) AS x(code, name, fam, fn, band, lvl, grade, dsgn, description)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name            = EXCLUDED.name,
            description     = EXCLUDED.description,
            job_family_id   = EXCLUDED.job_family_id,
            job_function_id = EXCLUDED.job_function_id,
            career_band_id  = EXCLUDED.career_band_id,
            career_level_id = EXCLUDED.career_level_id,
            pay_grade_id    = EXCLUDED.pay_grade_id,
            designation_id  = EXCLUDED.designation_id,
            updated_at      = now(),
            updated_by      = v_su
        WHERE (master.job.name, master.job.description,
               master.job.job_family_id, master.job.job_function_id,
               master.job.career_band_id, master.job.career_level_id,
               master.job.pay_grade_id, master.job.designation_id)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description,
                                EXCLUDED.job_family_id, EXCLUDED.job_function_id,
                                EXCLUDED.career_band_id, EXCLUDED.career_level_id,
                                EXCLUDED.pay_grade_id, EXCLUDED.designation_id);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] job: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- ASSERTIONS
    -- ========================================================================
    SELECT COUNT(*) INTO v_n FROM master.job_family WHERE tenant_id = v_tid;
    IF v_n < 15 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 15 job_family rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.job_function WHERE tenant_id = v_tid;
    IF v_n < 60 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 60 job_function rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.career_band WHERE tenant_id = v_tid;
    IF v_n < 9 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected 9 career_band rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.career_level WHERE tenant_id = v_tid;
    IF v_n < 19 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 19 career_level rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.pay_grade WHERE tenant_id = v_tid;
    IF v_n < 15 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected 15 pay_grade rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.designation WHERE tenant_id = v_tid;
    IF v_n < 40 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 40 designation rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.job WHERE tenant_id = v_tid;
    IF v_n < 75 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 75 job rows, found %', v_pack, v_n;
    END IF;

    -- Validate: no job has a NULL job_function_id (catches subquery misses from code typos)
    SELECT COUNT(*) INTO v_n
    FROM master.job
    WHERE tenant_id = v_tid AND job_function_id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % jobs have NULL job_function_id — check function codes', v_pack, v_n;
    END IF;

    -- Validate: no job has a broken job_function FK (catches stale / orphaned UUIDs)
    SELECT COUNT(*) INTO v_n
    FROM master.job j
    LEFT JOIN master.job_function jf
           ON jf.tenant_id = j.tenant_id AND jf.id = j.job_function_id
    WHERE j.tenant_id  = v_tid
      AND j.job_function_id IS NOT NULL
      AND jf.id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % jobs have a broken job_function_id FK', v_pack, v_n;
    END IF;

    -- Validate: no job has a NULL career_level_id
    SELECT COUNT(*) INTO v_n
    FROM master.job
    WHERE tenant_id = v_tid AND career_level_id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % jobs have NULL career_level_id — check level codes', v_pack, v_n;
    END IF;

    -- Validate: no job has a broken career_level FK
    SELECT COUNT(*) INTO v_n
    FROM master.job j
    LEFT JOIN master.career_level cl
           ON cl.tenant_id = j.tenant_id AND cl.id = j.career_level_id
    WHERE j.tenant_id  = v_tid
      AND j.career_level_id IS NOT NULL
      AND cl.id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % jobs have a broken career_level_id FK', v_pack, v_n;
    END IF;

    RAISE NOTICE '[%] All assertions passed', v_pack;
    RAISE NOTICE '[%] Summary — families: %, functions: %, bands: %, levels: %, grades: %, designations: %, jobs: %',
        v_pack,
        (SELECT COUNT(*) FROM master.job_family  WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.job_function WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.career_band  WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.career_level WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.pay_grade    WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.designation  WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.job          WHERE tenant_id = v_tid);

END $seed$;
