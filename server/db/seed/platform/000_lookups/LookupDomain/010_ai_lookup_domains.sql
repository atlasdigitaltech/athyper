-- 010_ai_lookup_domains.sql
-- Registers two AI-specific lookup domains: action codes and document classes.
-- Schema: control | Table: lookup_domain
-- Depends on: 000_lookup_domains.sql
-- Idempotent: ON CONFLICT (code) DO NOTHING

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('control.ai_action_code',
     'AI Action Code',
     'Platform-defined action codes for AI capabilities. Each code maps to a registered '
     'CapabilityHandler in the AI runtime. Non-extensible: new codes require a matching '
     'server-side handler before they can be used.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('control.ai_doc_class',
     'AI Document Class',
     'Document class discriminators used in ai_action_policy and ai_confidence_threshold '
     'scoping. NULL doc_class in those tables acts as a catch-all. Non-extensible: '
     'new classes require schema-level support before they can be targeted.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) DO NOTHING;
