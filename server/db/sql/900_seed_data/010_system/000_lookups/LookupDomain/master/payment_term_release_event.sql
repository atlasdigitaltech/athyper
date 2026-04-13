-- LookupDomain/master/payment_term_release_event.sql
-- Lookup domain + values for master.payment_term_release_event
-- is_extensible = true — tenants may add custom release events.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.payment_term_release_event',
       'Payment term release event',
       'Events that trigger retention release: practical completion, final acceptance, DLP expiry, etc. '
       'Tenant-extensible.',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'master.payment_term_release_event'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('practical_completion',  'Practical Completion',  'master.payment_term_release_event', 'Released upon practical completion of works',       10),
    ('final_acceptance',      'Final Acceptance',      'master.payment_term_release_event', 'Released upon final acceptance',                    20),
    ('dlp_expiry',            'DLP Expiry',            'master.payment_term_release_event', 'Released when defects liability period expires',    30),
    ('warranty_expiry',       'Warranty Expiry',       'master.payment_term_release_event', 'Released when warranty period expires',             40),
    ('custom_milestone',      'Custom Milestone',      'master.payment_term_release_event', 'Released on a custom-defined milestone',            50),
    ('gazette_notification',  'Gazette Notification',  'master.payment_term_release_event', 'Released upon gazette notification',                60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
