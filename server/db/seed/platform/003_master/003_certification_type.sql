-- ============================================================================
-- FILE: platform/003_master/003_certification_type.sql
-- Purpose: Canonical platform-wide certification type registry.
--          Covers all 11 certification categories defined in
--          000_lookups/LookupDomain/master/certification_category.sql.
--
-- Scope:    tenant_id = NULL  →  available to all tenants.
--           Tenant-specific types (is_custom = true, tenant_id = <uuid>)
--           are seeded by individual tenant files.
--
-- Not included (tenant-scoped):
--   zatca-einv — Saudi ZATCA Phase 2 (regulatory mandate, KSA-only)
--   Any jurisdiction-specific compliance registrations
--
-- Idempotent: WHERE NOT EXISTS on (tenant_id IS NULL, code).
-- Created by: system user (00000000-0000-0000-0000-000000000000)
-- ============================================================================

INSERT INTO master.certification_type (
    tenant_id, code, name, issuing_body, category, description,
    is_custom, metadata, status, created_by
)
SELECT NULL, v.code, v.name, v.issuing_body, v.category, v.description,
       false,
       '{"_seed":{"pack":"003_certification_type","version":"1.0.0"}}'::jsonb,
       v.status,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES

    -- ── quality ──────────────────────────────────────────────────────────────
    ('iso-9001',
     'ISO 9001 Quality Management Systems',
     'International Organization for Standardization',
     'quality',
     'Specifies requirements for a quality management system (QMS) to demonstrate '
     'consistent provision of conforming products and services and enhance customer satisfaction.',
     'active'),

    -- ── information_security ─────────────────────────────────────────────────
    ('iso-27001',
     'ISO/IEC 27001 Information Security Management',
     'International Organization for Standardization',
     'information_security',
     'Requirements for establishing, implementing, maintaining and continually improving '
     'an information security management system (ISMS).',
     'active'),

    ('soc-2',
     'SOC 2 Service Organisation Controls',
     'American Institute of CPAs (AICPA)',
     'information_security',
     'Audit report on controls relevant to security, availability, processing integrity, '
     'confidentiality, and privacy at service organisations.',
     'active'),

    -- ── esg ──────────────────────────────────────────────────────────────────
    ('iso-26000',
     'ISO 26000 Social Responsibility',
     'International Organization for Standardization',
     'esg',
     'Guidance on social responsibility covering organisational governance, human rights, '
     'labour practices, environment, fair operating practices, consumer issues, '
     'and community involvement.',
     'active'),

    -- ── safety ───────────────────────────────────────────────────────────────
    ('iso-45001',
     'ISO 45001 Occupational Health and Safety Management',
     'International Organization for Standardization',
     'safety',
     'Requirements for an occupational health and safety (OH&S) management system to '
     'prevent work-related injury and ill health.',
     'active'),

    ('ohsas-18001',
     'OHSAS 18001 Occupational Health and Safety Management',
     'BSI Group',
     'safety',
     'Predecessor to ISO 45001; officially withdrawn March 2021. '
     'Legacy certifications may still be in use during the transition period.',
     'deprecated'),

    -- ── food_safety ───────────────────────────────────────────────────────────
    ('iso-22000',
     'ISO 22000 Food Safety Management Systems',
     'International Organization for Standardization',
     'food_safety',
     'Requirements for a food safety management system combining HACCP principles '
     'with prerequisite programmes for organisations in the food chain.',
     'active'),

    ('haccp',
     'HACCP Hazard Analysis and Critical Control Points',
     'Codex Alimentarius Commission',
     'food_safety',
     'Systematic preventive approach to food safety identifying physical, chemical, '
     'and biological hazards in production processes.',
     'active'),

    -- ── halal ─────────────────────────────────────────────────────────────────
    ('halal-gsas',
     'GSAS Halal Certification',
     'Gulf Standardization Organization',
     'halal',
     'GCC Halal Standard (GSO 2055) conformity certification for food products, '
     'food ingredients, and food additives recognised across GCC member states.',
     'active'),

    ('halal-jakim',
     'JAKIM Halal Certification',
     'Department of Islamic Development Malaysia (JAKIM)',
     'halal',
     'Malaysia national Halal certification recognised by OIC member countries '
     'and major Halal import markets globally.',
     'active'),

    -- ── financial ─────────────────────────────────────────────────────────────
    ('pci-dss',
     'PCI DSS Payment Card Industry Data Security Standard',
     'PCI Security Standards Council',
     'financial',
     'Security standard for organisations that handle payment card data to reduce '
     'card fraud through technical and operational requirements.',
     'active'),

    ('soc-1',
     'SOC 1 Service Organisation Controls (ICFR)',
     'American Institute of CPAs (AICPA)',
     'financial',
     'Audit report on internal controls over financial reporting (ICFR) at service '
     'organisations, used by auditors of user entity financial statements.',
     'active'),

    -- ── environmental ─────────────────────────────────────────────────────────
    ('iso-14001',
     'ISO 14001 Environmental Management Systems',
     'International Organization for Standardization',
     'environmental',
     'Requirements for an environmental management system (EMS) to enhance environmental '
     'performance, fulfil compliance obligations, and achieve environmental goals.',
     'active'),

    ('iso-50001',
     'ISO 50001 Energy Management Systems',
     'International Organization for Standardization',
     'environmental',
     'Requirements for an energy management system to improve energy performance, '
     'efficiency, and conservation.',
     'active'),

    -- ── trade_compliance ──────────────────────────────────────────────────────
    ('aeo',
     'AEO Authorised Economic Operator',
     'World Customs Organization',
     'trade_compliance',
     'WCO SAFE Framework accreditation for reliable traders. EU/UK variants: '
     'AEO-C (customs simplifications) and AEO-S (security and safety), '
     'issued by national customs authorities.',
     'active'),

    ('ctpat',
     'C-TPAT Customs-Trade Partnership Against Terrorism',
     'US Customs and Border Protection',
     'trade_compliance',
     'US government–business initiative to strengthen international supply chain '
     'security and improve US border security for participating trade partners.',
     'active'),

    -- ── data_privacy ──────────────────────────────────────────────────────────
    ('iso-27701',
     'ISO/IEC 27701 Privacy Information Management',
     'International Organization for Standardization',
     'data_privacy',
     'Extension to ISO/IEC 27001 and 27002 specifying requirements and guidance for '
     'establishing, implementing, and improving a Privacy Information Management System (PIMS).',
     'active')

) AS v(code, name, issuing_body, category, description, status)
WHERE NOT EXISTS (
    SELECT 1 FROM master.certification_type
     WHERE tenant_id IS NULL AND code = v.code
);
