-- Used by: payment_term_clause.application_scope.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('invoice',          'Invoice',          'master.payment_term_application_scope', 'Applied against the total invoice amount',              10),
    ('line',             'Line Item',        'master.payment_term_application_scope', 'Applied per invoice line item',                         20),
    ('total_contract',   'Total Contract',   'master.payment_term_application_scope', 'Applied against the total contract value',              30),
    ('partial_invoice',  'Partial Invoice',  'master.payment_term_application_scope', 'Applied against a partial invoice amount subset',       40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
