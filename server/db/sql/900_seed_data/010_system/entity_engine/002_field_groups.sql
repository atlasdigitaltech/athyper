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
