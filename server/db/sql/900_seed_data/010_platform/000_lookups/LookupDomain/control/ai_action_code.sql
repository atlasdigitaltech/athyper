-- LookupDomain/control/ai_action_code.sql
-- Lookup values for domain: control.ai_action_code
-- 8 platform-defined action codes matching §13.4 of the AI foundation design.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('extract_document',
     'Extract Document',
     'control.ai_action_code',
     'Parse a structured document (PDF, image, XLSX) into typed JSON output. '
     'Initial consumers: procurement invoices, expense receipts, supplier onboarding docs. '
     'Consumer ceiling: assist (cannot be lifted to auto for financial documents).',
     10),

    ('classify',
     'Classify',
     'control.ai_action_code',
     'Pick the best-matching class from a fixed taxonomy given a free-text or structured input. '
     'Used by: procurement spend-category resolution, journal account suggestion. '
     'Consumer ceiling: auto for non-posting classification, assist for journal accounts.',
     20),

    ('suggest',
     'Suggest',
     'control.ai_action_code',
     'Return ranked suggestions with per-suggestion confidence scores. '
     'Suggestions never auto-execute — the user always selects. '
     'Consumer ceiling: auto (suggestions are inherently human-gated).',
     30),

    ('autofill',
     'Autofill',
     'control.ai_action_code',
     'Pre-populate form fields from context (prior records, supplier profile, document history). '
     'Consumer ceiling: assist — user must confirm pre-filled values before commit.',
     40),

    ('extract_entity',
     'Extract Entity',
     'control.ai_action_code',
     'Pull named entities (parties, dates, amounts, references) from free-form text. '
     'Used in journal narration parsing, meeting note extraction. '
     'Consumer ceiling: assist.',
     50),

    ('match_record',
     'Match Record',
     'control.ai_action_code',
     'Fuzzy-match an input against existing records (suppliers, customers, chart of accounts). '
     'Non-posting operation; matched record is presented for confirmation. '
     'Consumer ceiling: auto (no record modification until user confirms).',
     60),

    ('summarize',
     'Summarize',
     'control.ai_action_code',
     'Condense long-form content (meeting notes, audit trails, policy documents) into a summary. '
     'Read-only operation. Consumer ceiling: auto.',
     70),

    ('translate',
     'Translate',
     'control.ai_action_code',
     'Translate source content to a target locale, preserving domain terminology. '
     'Used for multi-locale invoice processing. '
     'Consumer ceiling: auto.',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
