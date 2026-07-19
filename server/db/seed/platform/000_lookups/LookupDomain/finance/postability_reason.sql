-- =============================================================================
-- postability_reason.sql — canonical reason-code registry for finance posting
--
-- SINGLE SOURCE OF TRUTH for reason codes surfaced by:
--   • PeriodPostability.reasonCode
--   • AccountPostability.reasonCodes[]
--   • FinanceSetupConflict.reasonCode
--   • Notification templates that reference posting blockers
--   • Workflow gate policies that key on posting-eligibility reasons
--
-- Metadata contract (per row):
--   severity   → 'info' | 'warning' | 'blocker'
--   chip_hint  → 'postable' | 'adjustment_only' | 'read_only' | 'locked'
--   scope_kind → 'period' | 'account' | 'both'
--
-- Adding a new reason: insert one row here; UI/backend/notifications pick it up
-- automatically via the useReasonCodeCatalog client hook.
-- =============================================================================


INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'finance.postability_reason',
       'Finance Postability Reason',
       'Canonical reason codes surfaced by periodPostability, accountPostability, and finance-setup conflicts. Shared enum registry — UI, backend, notifications, and workflow gates all resolve reason strings via this domain.',
       'finance', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'finance.postability_reason'
);


INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, metadata, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true,
       jsonb_build_object(
           'severity',   v.severity,
           'chip_hint',  v.chip_hint,
           'scope_kind', v.scope_kind
       ),
       'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── period-scope ────────────────────────────────────────────────────────
    ('period_open',                'Period open',                        'finance.postability_reason',
     'Period is open for posting.',
     10, 'info',    'postable',         'period'),
    ('period_adjustment_only',     'Period adjustment-only',             'finance.postability_reason',
     'Period is soft-closed; only adjustment postings allowed.',
     20, 'warning', 'adjustment_only',  'period'),
    ('period_hard_closed',         'Period hard-closed',                 'finance.postability_reason',
     'Period is hard-closed; no postings permitted.',
     30, 'blocker', 'locked',           'period'),
    ('period_not_opened',          'Period not opened',                  'finance.postability_reason',
     'Period has not been opened yet.',
     40, 'blocker', 'locked',           'period'),
    ('book_period_missing',        'Book period missing',                'finance.postability_reason',
     'No book_period_status row for this book+period — treated as future/locked.',
     50, 'blocker', 'locked',           'period'),

    -- ── account-scope ───────────────────────────────────────────────────────
    ('control_missing',            'Company control missing',            'finance.postability_reason',
     'No company_code_gl_account row for this account.',
     60, 'blocker', 'locked',           'account'),
    ('control_blocked_manual',     'Blocked for manual posting',         'finance.postability_reason',
     'blocked_for_manual=true on the company control.',
     70, 'warning', 'adjustment_only',  'account'),
    ('control_blocked_auto',       'Blocked for auto posting',           'finance.postability_reason',
     'blocked_for_auto=true on the company control.',
     80, 'warning', 'adjustment_only',  'account'),
    ('control_posting_disallowed', 'Posting disallowed on control',      'finance.postability_reason',
     'posting_allowed=false on the company control.',
     90, 'blocker', 'locked',           'account'),
    ('gl_account_inactive',        'GL account inactive',                'finance.postability_reason',
     'gl_account.status is not active.',
     100, 'blocker', 'locked',          'account'),
    ('gl_account_not_posting',     'GL account is header/summary',       'finance.postability_reason',
     'gl_account.node_type is not posting (header/summary node).',
     110, 'info',    'read_only',       'account'),

    -- ── both scopes ─────────────────────────────────────────────────────────
    ('chart_assignment_inactive',  'Chart assignment inactive',          'finance.postability_reason',
     'company_code_chart_assignment.status <> active for the operating assignment.',
     120, 'blocker', 'locked',          'both'),
    ('posting_role_unknown', 'Posting role unknown', 'finance.postability_reason',
     'The supplied role does not resolve to an active canonical posting role.',
     130, 'blocker', 'locked', 'account'),
    ('posting_role_book_not_assigned', 'Posting-role book not assigned', 'finance.postability_reason',
     'The requested ledger book is not actively assigned to the company on the resolution date.',
     140, 'blocker', 'locked', 'account'),
    ('posting_role_mapping_missing', 'Posting-role mapping missing', 'finance.postability_reason',
     'A required posting role has no effective GL-account assignment for the company and book.',
     150, 'blocker', 'locked', 'account'),
    ('posting_role_account_not_postable', 'Posting-role account not postable', 'finance.postability_reason',
     'The mapped GL account is inactive, non-posting, or blocked for automatic posting.',
     160, 'blocker', 'locked', 'account'),
    ('posting_role_normal_balance_mismatch', 'Posting-role normal balance mismatch', 'finance.postability_reason',
     'The mapped GL account normal balance is incompatible with the canonical posting role.',
     170, 'blocker', 'locked', 'account'),
    ('posting_role_resolved', 'Posting role resolved', 'finance.postability_reason',
     'The canonical role resolved to an effective postable GL account.',
     180, 'info', 'postable', 'account'),
    ('posting_role_not_required', 'Posting role not required', 'finance.postability_reason',
     'The role is available in the catalog but is not required by active company policies.',
     190, 'info', 'read_only', 'account')
) AS v(code, name, domain_code, description, sort_order, severity, chip_hint, scope_kind)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
