-- Canonical address ROLE (used-for), not physical type — physical lives on
-- master.address.address_type. Same value space is consumed by
-- master.address_link.purpose, document address selections (PR/PO/GR/SE/PI),
-- and document address snapshots — keep them aligned.
-- Sub-classification within a role uses master.address_link.role_qualifier.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── Inbound (buyer-side) ────────────────────────────────────────────────
    ('ship_to',           'Ship To',
     'master.address_purpose',
     'Destination for inbound goods. Used on PR/PO/GR/PI delivery lines. Typical owners: site, warehouse, project, customer.',
     'inbound', 10),

    ('bill_to',           'Bill To',
     'master.address_purpose',
     'Buyer-side identity address for invoices and billing statements. Typical owners: legal_entity, company_code, site, tenant.',
     'inbound', 11),

    ('place_of_service',  'Place of Service',
     'master.address_purpose',
     'Location where services are performed or equipment installed. Used on service entry and service-line documents. Typical owners: site, warehouse, project.',
     'inbound', 12),

    -- ── Outbound (supplier-side) ────────────────────────────────────────────
    ('bill_from',        'Bill From',
     'master.address_purpose',
     'Seller-side identity address for supplier invoices, credit memos, and billing statements. Typical owners: supplier, business_partner, legal_entity, tenant.',
     'outbound', 20),

    ('remit_to',          'Remit To',
     'master.address_purpose',
     'Address where payment is sent (treasury / bank correspondence). Typical owners: supplier, business_partner, employee (payroll), bank_party.',
     'outbound', 21),

    ('ship_from',         'Ship From',
     'master.address_purpose',
     'Origin of inbound goods (supplier dispatch, customs, inbound logistics). Typical owners: supplier, business_partner, warehouse.',
     'outbound', 22),

    -- ── Generic ─────────────────────────────────────────────────────────────
    ('correspondence',    'Correspondence',
     'master.address_purpose',
     'General mailing address for statements, notices, legal, regulatory, tax filings, employee letters, etc. Use role_qualifier to sub-classify (e.g. legal_notice, tax_filing, account_statement, emergency).',
     'generic', 30),

    ('default',           'Default',
     'master.address_purpose',
     'Catch-all fallback used when no specific role applies. Resolved by fn_resolve_address() as the universal fallback. Every owner type allows this purpose.',
     'generic', 99)

) AS v(code, name, domain_code, description, category, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
