-- is_extensible = true: tenants may add custom trigger events.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.payment_term_trigger_event',
       'Payment term trigger event',
       'Events that trigger payment term milestones: PO approval, contract signing, invoice, etc. '
       'Tenant-extensible.',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.payment_term_trigger_event'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('on_po_approval',       'On PO Approval',       'master.payment_term_trigger_event', 'Triggered when the purchase order is approved',  10),
    ('on_contract_signing',  'On Contract Signing',  'master.payment_term_trigger_event', 'Triggered when the contract is signed',           20),
    ('on_mobilization',      'On Mobilization',      'master.payment_term_trigger_event', 'Triggered when mobilization begins',              30),
    ('on_first_delivery',    'On First Delivery',    'master.payment_term_trigger_event', 'Triggered on the first delivery of goods',        40),
    ('on_invoice',           'On Invoice',           'master.payment_term_trigger_event', 'Triggered when the invoice is received',          50),
    ('on_payment',           'On Payment',           'master.payment_term_trigger_event', 'Triggered when the payment is made',              60),
    ('on_final_acceptance',  'On Final Acceptance',  'master.payment_term_trigger_event', 'Triggered when final acceptance is confirmed',    70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
