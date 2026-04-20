-- LookupDomain/master/template_engine.sql
-- Lookup values for domain: master.template_engine
-- Idempotent: WHERE NOT EXISTS guard
--
-- NOTE: master.template.engine has an inline CHECK constraint that uses
-- UPPERCASE values: CHECK (engine IN ('handlebars', 'MJML', 'REACT_PDF')).
-- These lookup codes are lowercase because lookup_value_code_fmt requires it.
-- The lookup domain serves as a UI vocabulary (dropdown labels, descriptions);
-- the inline CHECK on master.template.engine handles DB-level validation
-- independently. No trigger-based lookup validation is attached to
-- master.template.engine.

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
