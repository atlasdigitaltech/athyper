-- =============================================================================
-- finance_setup_activity.sql — activity_domain + activity_type entries used
-- by the Finance Setup Workbench mutation service (Phase 2).
--
-- Consumed by writeFinanceSetupAudit() → log.activity_log inserts.
-- =============================================================================


-- Register the finance_setup activity domain (idempotent).
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('finance_setup', 'Finance Setup', 'log.activity_domain',
     'Configuration activity performed through the Finance Setup Workbench '
     '(GL controls, chart/book assignments, house-bank toggles).', 200)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);


-- Register the specific activity types.
INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('finance_setup.control_assigned',
     'Company Control Assigned',
     'log.activity_type',
     'A company_code_gl_account row was created to assign posting controls to a GL account.',
     200),
    ('finance_setup.control_updated',
     'Company Control Updated',
     'log.activity_type',
     'A company_code_gl_account row was updated (posting flags, requires_*, reconciliation type, tax category).',
     201),
    ('finance_setup.control_deactivated',
     'Company Control Deactivated',
     'log.activity_type',
     'A company_code_gl_account row was soft-deactivated (posting_allowed=false).',
     202),
    ('finance_setup.chart_assignment_changed',
     'Chart Assignment Changed',
     'log.activity_type',
     'A company_code_chart_assignment was activated, promoted to primary, or reassigned.',
     203),
    ('finance_setup.book_assignment_changed',
     'Book Assignment Changed',
     'log.activity_type',
     'A ledger_book primary flag or status was changed.',
     204),
    ('finance_setup.house_bank_toggled',
     'House Bank Toggled',
     'log.activity_type',
     'A bank_account_house_config was activated or deactivated.',
     205)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
