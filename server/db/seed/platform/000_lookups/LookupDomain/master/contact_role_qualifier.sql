-- Sub-classifier inside a contact_link.purpose. NOT DB-enforced — service may
-- validate against this seed but free-text is allowed.
-- Auth purposes (login/recovery/mfa/verification) FORBID role_qualifier via
-- contact_link_auth_no_qualifier_chk — none of these values apply there.
-- Shared vocabulary with master.address_role_qualifier where the qualifier
-- carries the same meaning (tax_filing, legal_notice, emergency).

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── Sub-classification within 'correspondence' ──────────────────────────
    ('legal_notice',       'Legal Notice',
     'master.contact_role_qualifier',
     'Statutory demands, service of process, formal legal correspondence channel.',
     'correspondence', 10),

    ('regulatory_filing',  'Regulatory Filing',
     'master.contact_role_qualifier',
     'Contact channel filed with regulators, licensors, or government authorities.',
     'correspondence', 11),

    ('tax_filing',         'Tax Filing',
     'master.contact_role_qualifier',
     'Tax authority correspondence channel (VAT, GST, SST filings).',
     'correspondence', 12),

    ('account_statement',  'Account Statement',
     'master.contact_role_qualifier',
     'Periodic account statements and financial summaries delivery channel.',
     'correspondence', 13),

    ('emergency',          'Emergency Contact',
     'master.contact_role_qualifier',
     'Next-of-kin / emergency contact channel (employee, principal contexts). '
     'May be a phone number or alternate email.',
     'correspondence', 14),

    ('payslip',            'Payslip',
     'master.contact_role_qualifier',
     'Payroll-statement delivery channel for employees. Distinct from remit_to '
     '(which routes the payment itself).',
     'correspondence', 15),

    -- ── Sub-classification within 'support' ─────────────────────────────────
    ('escalation',         'Escalation',
     'master.contact_role_qualifier',
     'Management / escalation channel when first-line support fails.',
     'support', 20),

    ('vip',                'VIP / Strategic',
     'master.contact_role_qualifier',
     'Premium or strategic-account dedicated support channel.',
     'support', 21),

    -- ── Sub-classification within 'notification' ────────────────────────────
    ('dispatch_alert',     'Dispatch Alert',
     'master.contact_role_qualifier',
     'High-priority warehouse / logistics notification stream (separate from '
     'general operational notifications).',
     'notification', 30),

    ('treasury',           'Treasury',
     'master.contact_role_qualifier',
     'Treasury-specific operational events (payment runs, FX, settlement).',
     'notification', 31)

    ,('accounts_payable',  'Accounts Payable',
     'master.contact_role_qualifier',
     'Invoice, supplier-query, and payment-correspondence contact.',
     'correspondence', 40)
    ,('accounts_receivable', 'Accounts Receivable',
     'master.contact_role_qualifier',
     'Billing, collection, and customer-account correspondence contact.',
     'correspondence', 41)
    ,('tax',               'Tax',
     'master.contact_role_qualifier',
     'Tax operations and authority correspondence contact.',
     'correspondence', 42)
    ,('legal',             'Legal',
     'master.contact_role_qualifier',
     'General legal contact distinct from the formal legal-notice channel.',
     'correspondence', 43)
    ,('compliance',        'Compliance',
     'master.contact_role_qualifier',
     'Regulatory, audit, and compliance contact.',
     'correspondence', 44)
    ,('bank_reconciliation', 'Bank Reconciliation',
     'master.contact_role_qualifier',
     'Operational bank reconciliation notifications and exceptions.',
     'notification', 45)
    ,('payment_notification', 'Payment Notification',
     'master.contact_role_qualifier',
     'Payment-run, settlement, and remittance notification channel.',
     'notification', 46)
    ,('collection_notification', 'Collection Notification',
     'master.contact_role_qualifier',
     'Collection and overdue-account notification channel.',
     'notification', 47)

) AS v(code, name, domain_code, description, category, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
