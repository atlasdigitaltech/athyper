-- Must stay in sync with the CHECK constraint on master.business_partner.partner_category.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('organization', 'Organization', 'master.business_partner_category', 'Legal entity or company',         10),
    ('individual',   'Individual',   'master.business_partner_category', 'Natural person / sole trader',    20),
    ('government',   'Government',   'master.business_partner_category', 'Government body or public sector', 30),
    ('internal',     'Internal',     'master.business_partner_category', 'Intercompany / internal entity',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
