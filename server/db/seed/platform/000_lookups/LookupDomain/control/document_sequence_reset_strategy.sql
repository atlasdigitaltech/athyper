INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'control.document_sequence_reset_strategy',
       'Document sequence reset strategy',
       'When the document sequence counter resets to zero. '
       'Engine-governed — not tenant-extensible.',
       'control', false, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'control.document_sequence_reset_strategy'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('none',
     'None (continuous)',
     'control.document_sequence_reset_strategy',
     'Counter never resets. Grows continuously across fiscal years. '
     'Produces globally unique numbers for the lifetime of the config.',
     10),
    ('yearly',
     'Yearly',
     'control.document_sequence_reset_strategy',
     'Counter resets to zero at the start of each fiscal year. '
     'One counter row per (config, fiscal_year). period_number = 0.',
     20),
    ('monthly',
     'Monthly',
     'control.document_sequence_reset_strategy',
     'Counter resets to zero at the start of each fiscal period. '
     'One counter row per (config, fiscal_year, period_number).',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
