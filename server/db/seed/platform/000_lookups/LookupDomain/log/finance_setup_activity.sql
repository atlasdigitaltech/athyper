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
    ('finance_setup.controls_bulk_updated',
     'Company Controls Bulk Updated',
     'log.activity_type',
     'Posting and dimension controls were applied to a governed set of Company GL Accounts.',
     213),
    ('finance_setup.chart_assignment_changed',
     'Chart Assignment Changed',
     'log.activity_type',
     'A company_code_chart_assignment was activated, promoted to primary, or reassigned.',
     203),
    ('finance_setup.book_assignment_changed',
     'Book Assignment Changed',
     'log.activity_type',
     'A Company Book assignment or explicit Company default Book was changed.',
     204),
    ('finance_setup.house_bank_toggled',
     'House Bank Toggled',
     'log.activity_type',
     'A bank_account_house_config was activated or deactivated.',
     205),
    ('finance_setup.fiscal_calendar_created', 'Fiscal Calendar Created', 'log.activity_type',
     'A fiscal-calendar version was created.', 206),
    ('finance_setup.fiscal_calendar_updated', 'Fiscal Calendar Updated', 'log.activity_type',
     'A fiscal-calendar draft or successor version was updated.', 207),
    ('finance_setup.fiscal_calendar_assigned', 'Fiscal Calendar Assigned', 'log.activity_type',
     'A fiscal-calendar version was assigned to a company.', 208),
    ('finance_setup.fiscal_periods_generated', 'Fiscal Periods Generated', 'log.activity_type',
     'Fiscal periods and governance book gates were generated.', 209),
    ('finance_setup.posting_role_map_assigned', 'Posting Role Account Assigned', 'log.activity_type',
     'A posting role was assigned to a GL account for a company and ledger book.', 210),
    ('finance_setup.posting_role_map_updated', 'Posting Role Account Updated', 'log.activity_type',
     'A posting-role account assignment was superseded by a new version.', 211),
    ('finance_setup.posting_role_map_retired', 'Posting Role Account Retired', 'log.activity_type',
     'A posting-role account assignment was retired.', 212),
    ('finance_setup.fx_policy_saved', 'FX Policy Saved', 'log.activity_type',
     'An approved or draft FX resolution policy was created or changed.', 214),
    ('finance_setup.fx_rates_imported', 'FX Rates Imported', 'log.activity_type',
     'A validated batch of FX rates was posted and matching active keys were superseded.', 215),
    ('finance_setup.tax_group_version_saved', 'Tax Group Version Saved', 'log.activity_type',
     'A governed Tax Group Version and its ordered components were saved.', 216),
    ('finance_setup.tax_registration_saved', 'Tax Registration Saved', 'log.activity_type',
     'An effective Legal Entity or Company Tax Registration was saved.', 217),
    ('finance_setup.wht_threshold_saved', 'WHT Threshold Saved', 'log.activity_type',
     'An effective withholding-tax threshold was saved.', 218),
    ('finance_setup.payment_term_saved', 'Payment Term Saved', 'log.activity_type',
     'A Payment Term aggregate version was saved.', 219),
    ('finance_setup.payment_policy_saved', 'Payment Policy Saved', 'log.activity_type',
     'A Company payment-method policy was saved.', 220),
    ('finance_setup.interface_binding_saved', 'Interface Binding Saved', 'log.activity_type',
     'A deterministic payment interface binding was saved.', 221),
    ('finance_setup.settlement_rule_saved', 'Settlement Rule Saved', 'log.activity_type',
     'A payment settlement accounting rule was saved.', 222),
    ('finance_setup.house_bank_saved', 'House Bank Saved', 'log.activity_type',
     'A governed House Bank aggregate was created or updated.', 223),
    ('finance_setup.bank_link_ended', 'Bank Link Ended', 'log.activity_type',
     'A Company Bank Account Link was ended after lifecycle checks.', 224),
    ('finance_setup.bank_account_verified', 'Bank Account Verified', 'log.activity_type',
     'A Bank Account verification status was recorded.', 225),
    ('finance_setup.bank_interface_tested', 'Bank Interface Tested', 'log.activity_type',
     'A secure Bank Interface connection test was recorded without credential material.', 226)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
