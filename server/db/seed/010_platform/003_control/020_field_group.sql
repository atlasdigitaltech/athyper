-- Table-owned seed for control.field_group
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/004_entity_engine/002_field_groups.sql
-- ============================================================

-- 900_seed_data/010_system/entity_engine/002_field_groups.sql
-- Seed: 11 standard field groups (UI section groupings for canonical fields)
-- Schema: control | Table: field_group
-- Phase 1 — Foundation. No FK dependencies.
-- Idempotent: PRIMARY KEY (group_key) — ON CONFLICT DO NOTHING

INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES
    -- §1  Core identity — id, code, name, tenant ownership
    ('identity',
     'Identity',
     'Primary identifier, business code, display name, and tenant ownership.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     100),

    -- §2  Descriptive profile — description, type, category metadata
    ('profile',
     'Profile',
     'Descriptive fields: description, classification type, display overrides.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     200),

    -- §3  Contact details — email, phone, address cross-links
    ('contact',
     'Contact',
     'Contact information: email addresses, phone numbers, linked addresses.',
     ARRAY['MASTER'],
     300),

    -- §4  FK reference fields — foreign-key lookups to related master records
    ('reference',
     'References',
     'Foreign-key references to related entities (parent org, owner, assignee).',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','DIMENSION'],
     400),

    -- §5  Business dates — effective_from/to, due dates, period bounds
    ('dates',
     'Dates',
     'Business-critical date fields: validity periods, due dates, effective dates.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DIMENSION'],
     500),

    -- §6  Financial — amounts, currencies, exchange rates, monetary policy
    ('financial',
     'Financial',
     'Monetary values, currency codes, exchange rates, amount fields.',
     ARRAY['MASTER','DOCUMENT','LEDGER'],
     600),

    -- §7  Classification — category, segment, intent, taxonomy, spend class
    ('classification',
     'Classification',
     'Taxonomy fields: category, segment, intent, commodity, spend class.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     700),

    -- §8  Configuration — policy, settings, JSONB config bags
    ('config',
     'Configuration',
     'Policy settings, JSONB configuration bags, system-controlled flags.',
     ARRAY['CONTROL'],
     800),

    -- §9  Status & metadata — lifecycle status, is_active, jsonb metadata, tags
    ('metadata',
     'Metadata',
     'Lifecycle status, active flag, extensible JSONB metadata bag, tag array.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     900),

    -- §10 Audit trail — creation and last-update timestamps + actor references
    ('audit',
     'Audit',
     'Row-level audit trail: created/updated timestamps and actor identifiers.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     950),

    -- §11 Workflow — lifecycle state, approval state, transition history
    ('workflow',
     'Workflow',
     'Lifecycle and workflow fields: current state, approval status, deadline.',
     ARRAY['MASTER','DOCUMENT'],
     990)

ON CONFLICT (group_key) DO NOTHING;


-- ============================================================
-- Domain field_group additions
-- ============================================================

-- === SOURCE: 100_master/001_supplier.sql ===
-- Supplier profile groups: keep Profile business-readable and avoid duplicating
-- data that is now surfaced in the header or dedicated child tabs.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES
    ('supplier_core_identity',   'Core Identity',   'Supplier legal and display identity fields.', ARRAY['MASTER'], 110),
    ('supplier_registration',    'Registration',    'Supplier registration jurisdiction and references.', ARRAY['MASTER'], 120),
    ('supplier_classification',  'Classification',  'Supplier classifications used for sourcing and segmentation.', ARRAY['MASTER'], 130),
    ('supplier_company_profile', 'Company Profile', 'Company size and public profile fields.', ARRAY['MASTER'], 140),
    ('supplier_descriptions',    'Description',     'Short and long business descriptions.', ARRAY['MASTER'], 150)
ON CONFLICT (group_key) DO UPDATE
SET label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order;


-- === SOURCE: 200_document/001_document_entities.sql ===
-- Compact Journal Entry detail/edit overview.
-- The document detail page groups by entity_field.ui_hint.group_key and hides
-- fields with ui_type='hidden'. Keep the business header in one group, while
-- removing duplicate totals and technical controls from the primary card stack.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES (
    'header',
    'Header',
    'Primary business header fields shown on document detail/edit pages.',
    ARRAY['DOCUMENT'],
    20
)
ON CONFLICT (group_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order = EXCLUDED.sort_order;


-- === SOURCE: 200_document/003_document_relations.sql ===
-- New procurement-specific groups; extend applies_to_classes on existing ones.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES
    ('item',       'Item',       'Item identification, quantity and unit pricing fields.',      ARRAY['DOCUMENT_RELATION'], 155),
    ('tax',        'Tax',        'Tax and withholding tax amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 610),
    ('discount',   'Discount',   'Discount percentage and amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 630),
    ('retention',  'Retention',  'Retention percentage and retention amount fields.',           ARRAY['DOCUMENT','DOCUMENT_RELATION'], 650),
    ('dimensions', 'Dimensions', 'Cost centre, profit centre, project and site dimensions.',   ARRAY['DOCUMENT','DOCUMENT_RELATION'], 670),
    ('matching',   'Matching',   'Source document references: PO line, GR line, SES line.',    ARRAY['DOCUMENT_RELATION'], 690)
ON CONFLICT (group_key) DO UPDATE
    SET label              = EXCLUDED.label,
        description        = EXCLUDED.description,
        applies_to_classes = EXCLUDED.applies_to_classes,
        sort_order         = EXCLUDED.sort_order;


-- Extend 'financial' and 'classification' groups to cover DOCUMENT_RELATION class.
UPDATE control.field_group
SET applies_to_classes = applies_to_classes || ARRAY['DOCUMENT_RELATION']
WHERE group_key IN ('financial', 'classification')
  AND NOT ('DOCUMENT_RELATION' = ANY(applies_to_classes));
