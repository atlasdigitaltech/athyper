-- Authoritative state machine for master.contact_marketing_consent.status.
-- Marketing-send path MUST treat 'opted_in' as the ONLY value that permits delivery.
--
-- Typical transitions:
--   unknown               → pending_double_opt_in   (form intake)
--   pending_double_opt_in → opted_in                (confirmation click)
--   pending_double_opt_in → opted_out               (timeout / decline)
--   opted_in              → opted_out               (unsubscribe / admin)
--   opted_out             → pending_double_opt_in   (re-opt-in, fresh consent required)

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('opted_in',              'Opted In',
     'master.marketing_consent_status',
     'Owner has affirmatively consented to receive marketing communications. '
     'ONLY value that permits send-path delivery. Requires evidence of consent '
     '(consent_text + consent_source captured at status_changed_at).',
     'consented', 10),

    ('opted_out',             'Opted Out',
     'master.marketing_consent_status',
     'Owner has withdrawn consent or never consented. Send-path MUST suppress '
     'all marketing for this owner (or the channel scope if partial). '
     'Re-opt-in requires a fresh double-opt-in cycle.',
     'suppressed', 20),

    ('pending_double_opt_in', 'Pending Double Opt-In',
     'master.marketing_consent_status',
     'Initial consent captured but not yet confirmed via second-factor '
     '(email link click, SMS keyword, etc.). Send-path treats as suppressed '
     'until confirmed.',
     'pending', 30),

    ('unknown',               'Unknown',
     'master.marketing_consent_status',
     'No consent record exists or status was reset by import without provenance. '
     'Send-path treats as suppressed. Used as the default initial state for '
     'imported records pending first contact.',
     'pending', 40)
) AS v(code, name, domain_code, description, category, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
