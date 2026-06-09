-- Table-owned seed for control.field_group
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.
--
-- columns:   field grid column count for UI (FieldsRenderer) and print (EntityPrintTemplate).
--            1=single, 2=two-col, 3=three-col (default).
-- page_span: in two_column print mode — 'half' (default) participates in left/right split;
--            'full' renders at full page width above the split zone.


-- ============================================================
-- SOURCE: server/db/seed/platform/004_entity_engine/002_field_groups.sql
-- ============================================================

-- Seed: 11 standard field groups (UI section groupings for canonical fields)
-- Schema: control | Table: field_group
-- Phase 1 — Foundation. No FK dependencies.
-- Idempotent: ON CONFLICT DO UPDATE to propagate columns/page_span to existing rows.

INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    -- §1  Core identity — id, code, name, tenant ownership
    --     2-col: code + name typically pair well side-by-side
    ('identity',
     'Identity',
     'Primary identifier, business code, display name, and tenant ownership.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     100, 2, 'half'),

    -- §2  Descriptive profile — description, type, category metadata
    --     2-col: mixed short and medium-length fields
    ('profile',
     'Profile',
     'Descriptive fields: description, classification type, display overrides.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     200, 2, 'half'),

    -- §3  Contact details — email, phone, address cross-links
    --     2-col: label+value pairs, usually 4-6 fields
    ('contact',
     'Contact',
     'Contact information: email addresses, phone numbers, linked addresses.',
     ARRAY['MASTER'],
     300, 2, 'half'),

    -- §4  FK reference fields — foreign-key lookups to related master records
    --     3-col: many short reference pickers in a dense grid
    ('reference',
     'References',
     'Foreign-key references to related entities (parent org, owner, assignee).',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','DIMENSION'],
     400, 3, 'half'),

    -- §5  Business dates — effective_from/to, due dates, period bounds
    --     3-col: date fields are compact and suit 3-up display
    ('dates',
     'Dates',
     'Business-critical date fields: validity periods, due dates, effective dates.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DIMENSION'],
     500, 3, 'half'),

    -- §6  Financial — amounts, currencies, exchange rates, monetary policy
    --     2-col: amounts need space for currency + value
    ('financial',
     'Financial',
     'Monetary values, currency codes, exchange rates, amount fields.',
     ARRAY['MASTER','DOCUMENT','LEDGER'],
     600, 2, 'half'),

    -- §7  Classification — category, segment, intent, taxonomy, spend class
    --     3-col: short taxonomy codes, dense grid works well
    ('classification',
     'Classification',
     'Taxonomy fields: category, segment, intent, commodity, spend class.',
     ARRAY['MASTER','CONTROL','REFERENCE','DIMENSION'],
     700, 3, 'half'),

    -- §8  Configuration — policy, settings, JSONB config bags
    --     1-col: JSONB/long-form config values need full width
    ('config',
     'Configuration',
     'Policy settings, JSONB configuration bags, system-controlled flags.',
     ARRAY['CONTROL'],
     800, 1, 'full'),

    -- §9  Status & metadata — lifecycle status, is_active, jsonb metadata, tags
    --     2-col: a mix of flag, enum, and freeform fields
    ('metadata',
     'Metadata',
     'Lifecycle status, active flag, extensible JSONB metadata bag, tag array.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     900, 2, 'half'),

    -- §10 Audit trail — creation and last-update timestamps + actor references
    --     3-col: four compact timestamp/actor fields
    ('audit',
     'Audit',
     'Row-level audit trail: created/updated timestamps and actor identifiers.',
     ARRAY['MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION','REFERENCE','RELATION','LOG','DIMENSION','AGGREGATE'],
     950, 3, 'half'),

    -- §11 Workflow — lifecycle state, approval state, transition history
    --     2-col: state + deadline fields pair naturally
    ('workflow',
     'Workflow',
     'Lifecycle and workflow fields: current state, approval status, deadline.',
     ARRAY['MASTER','DOCUMENT'],
     990, 2, 'half')

ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- ============================================================
-- Domain field_group additions
-- ============================================================

-- === SOURCE: 100_master/001_supplier.sql ===
-- Supplier profile groups: keep Profile business-readable and avoid duplicating
-- data that is now surfaced in the header or dedicated child tabs.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('supplier_core_identity',   'Core Identity',   'Supplier legal and display identity fields.',                  ARRAY['MASTER'], 110, 2, 'half'),
    ('supplier_registration',    'Registration',    'Supplier registration jurisdiction and references.',            ARRAY['MASTER'], 120, 2, 'half'),
    ('supplier_classification',  'Classification',  'Supplier classifications used for sourcing and segmentation.', ARRAY['MASTER'], 130, 3, 'half'),
    ('supplier_company_profile', 'Company Profile', 'Company size and public profile fields.',                      ARRAY['MASTER'], 140, 2, 'half'),
    ('supplier_descriptions',    'Description',     'Short and long business descriptions.',                        ARRAY['MASTER'], 150, 1, 'half')
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- === SOURCE: 200_document/001_document_entities.sql ===
-- Compact Journal Entry detail/edit overview.
-- The document detail page groups by entity_field.ui_hint.group_key and hides
-- fields with ui_type='hidden'. Keep the business header in one group, while
-- removing duplicate totals and technical controls from the primary card stack.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES (
    'header',
    'Header',
    'Primary business header fields shown on document detail/edit pages.',
    ARRAY['DOCUMENT'],
    20, 2, 'half'
)
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- === SOURCE: 200_document/003_document_relations.sql ===
-- New procurement-specific groups; extend applies_to_classes on existing ones.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order, columns, page_span)
VALUES
    ('item',       'Item',       'Item identification, quantity and unit pricing fields.',      ARRAY['DOCUMENT_RELATION'], 155, 3, 'half'),
    ('tax',        'Tax',        'Tax and withholding tax amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 610, 3, 'half'),
    ('discount',   'Discount',   'Discount percentage and amount fields.',                      ARRAY['DOCUMENT','DOCUMENT_RELATION'], 630, 3, 'half'),
    ('retention',  'Retention',  'Retention percentage and retention amount fields.',           ARRAY['DOCUMENT','DOCUMENT_RELATION'], 650, 3, 'half'),
    ('dimensions', 'Dimensions', 'Cost centre, profit centre, project and site dimensions.',   ARRAY['DOCUMENT','DOCUMENT_RELATION'], 670, 2, 'half'),
    ('matching',   'Matching',   'Source document references: PO line, GR line, SES line.',    ARRAY['DOCUMENT_RELATION'], 690, 3, 'half')
ON CONFLICT (group_key) DO UPDATE SET
    label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;


-- Extend 'financial' and 'classification' groups to cover DOCUMENT_RELATION class.
UPDATE control.field_group
SET applies_to_classes = applies_to_classes || ARRAY['DOCUMENT_RELATION']
WHERE group_key IN ('financial', 'classification')
  AND NOT ('DOCUMENT_RELATION' = ANY(applies_to_classes));
