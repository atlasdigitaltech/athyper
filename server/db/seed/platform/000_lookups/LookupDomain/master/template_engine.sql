-- Codes are lowercase (lookup_value_code_fmt) but master.template.engine CHECK uses
-- mixed case ('handlebars','MJML','REACT_PDF'). No lookup-validation trigger attached —
-- this domain only supplies UI labels; the inline CHECK is the source of truth.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('handlebars',  'Handlebars',  'master.template_engine',
     'Handlebars templating engine for HTML/text output.',             10),
    ('mjml',        'MJML',        'master.template_engine',
     'MJML responsive email framework.',                               20),
    ('react_pdf',   'React PDF',   'master.template_engine',
     'React-PDF engine for programmatic PDF generation.',              30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value lv
    WHERE lv.domain_code = v.domain_code
      AND lv.code = v.code
      AND lv.tenant_id IS NULL
);
