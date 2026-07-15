-- master.template.kind has no CHECK and no lookup-validation trigger — this
-- domain is advisory vocabulary only (UI dropdowns, future trigger attachment).

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('invoice',       'Invoice',        'master.template_kind',
     'Sales or purchase invoice template.',                           10),
    ('credit_note',   'Credit Note',    'master.template_kind',
     'Credit note / credit memo template.',                           20),
    ('debit_note',    'Debit Note',     'master.template_kind',
     'Debit note / debit memo template.',                             30),
    ('statement',     'Statement',      'master.template_kind',
     'Account statement template.',                                   40),
    ('report',        'Report',         'master.template_kind',
     'General-purpose report template.',                              50),
    ('notification',  'Notification',   'master.template_kind',
     'Email or in-app notification template.',                        60),
    ('label',         'Label',          'master.template_kind',
     'Shipping or product label template.',                           70),
    ('generic',       'Generic',        'master.template_kind',
     'Uncategorized / multi-purpose template.',                       80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value lv
    WHERE lv.domain_code = v.domain_code
      AND lv.code = v.code
      AND lv.tenant_id IS NULL
);
