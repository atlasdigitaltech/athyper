/* ============================================================================
   Athyper v2.3 — Ledger Book Seed Data (Demo Tenants)
   Dependencies: 192_ledger_book.sql, core.tenant
   Run after: 290_seed_demo_finance.sql

   Seeds standard accounting books for all demo tenants:
     STAT  — Statutory ledger (primary, default)
     TAX   — Tax-basis ledger
     MGMT  — Management reporting ledger
     IFRS  — IFRS reporting ledger
     LOCAL — Local GAAP ledger
   ============================================================================ */

DO $$
DECLARE
    v_tenant UUID;
    v_code   TEXT;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- ====================================================================
        -- Ledger Books — master registry
        -- ====================================================================
        INSERT INTO fin.ledger_book (
            tenant_id, book_code, book_name, description,
            category, reporting_standard, base_currency_code,
            is_primary, auto_post, requires_approval, close_mode,
            allow_manual_je, allow_reversal, sort_order, color_code
        ) VALUES
            -- STAT: Primary statutory ledger — the default book for all transactions
            (v_tenant, 'STAT', 'Statutory Ledger',
             'Primary statutory accounting book for legal and regulatory compliance. '
             'All source transactions post here first.',
             'STATUTORY', 'LOCAL_GAAP', 'USD',
             TRUE, TRUE, FALSE, 'UNIFIED',
             TRUE, TRUE, 10, '#2563EB'),

            -- TAX: Tax-basis accounting
            (v_tenant, 'TAX', 'Tax Ledger',
             'Tax-basis accounting book. Captures tax-specific recognition, '
             'depreciation (e.g., MACRS), and timing differences from statutory.',
             'TAX', 'TAX_LOCAL', 'USD',
             FALSE, TRUE, FALSE, 'INDEPENDENT',
             TRUE, TRUE, 20, '#DC2626'),

            -- MGMT: Management reporting
            (v_tenant, 'MGMT', 'Management Ledger',
             'Internal management reporting book. Supports non-GAAP metrics, '
             'segment reporting, and KPI-driven views without statutory constraints.',
             'MANAGEMENT', 'MANAGEMENT', 'USD',
             FALSE, TRUE, FALSE, 'UNIFIED',
             TRUE, TRUE, 30, '#059669'),

            -- IFRS: International Financial Reporting Standards
            (v_tenant, 'IFRS', 'IFRS Ledger',
             'IFRS reporting book for international compliance. Captures IFRS 15 '
             '(revenue), IFRS 16 (leases), IFRS 9 (financial instruments), '
             'and fair-value adjustments.',
             'REGULATORY', 'IFRS', 'USD',
             FALSE, TRUE, TRUE, 'INDEPENDENT',
             TRUE, TRUE, 40, '#7C3AED'),

            -- LOCAL: Local GAAP ledger
            (v_tenant, 'LOCAL', 'Local GAAP Ledger',
             'Local jurisdiction GAAP reporting book. Used when the primary statutory '
             'book follows a different standard (e.g., IFRS entity needing local GAAP '
             'for tax filings or regulatory submissions).',
             'REGULATORY', 'LOCAL_GAAP', 'USD',
             FALSE, FALSE, FALSE, 'INDEPENDENT',
             TRUE, TRUE, 50, '#D97706')

        ON CONFLICT (tenant_id, book_code) DO NOTHING;

        -- ====================================================================
        -- Book Assignments — assign books to the default entity
        -- ====================================================================
        -- All demo tenants get STAT + TAX + MGMT active by default
        -- IFRS and LOCAL are assigned but inactive (opt-in)
        INSERT INTO fin.book_assignment (
            tenant_id, entity_code, book_code, is_active, effective_from
        ) VALUES
            (v_tenant, 'DEFAULT', 'STAT',  TRUE,  '2024-01-01'),
            (v_tenant, 'DEFAULT', 'TAX',   TRUE,  '2024-01-01'),
            (v_tenant, 'DEFAULT', 'MGMT',  TRUE,  '2024-01-01'),
            (v_tenant, 'DEFAULT', 'IFRS',  FALSE, '2024-01-01'),
            (v_tenant, 'DEFAULT', 'LOCAL', FALSE, '2024-01-01')
        ON CONFLICT (tenant_id, entity_code, book_code) DO NOTHING;

        -- ====================================================================
        -- Book Posting Rules — standard derivation rules
        -- ====================================================================
        -- Rule: Mirror STAT postings to TAX book (with potential overrides)
        INSERT INTO fin.book_posting_rule (
            tenant_id, entity_code, rule_code, rule_name, description,
            source_book_code, target_book_code,
            account_strategy, amount_strategy, recognition_timing,
            priority, is_active
        ) VALUES
            -- STAT → TAX: mirror all postings (tax-specific adjustments done via manual JE)
            (v_tenant, 'DEFAULT', 'STAT-TO-TAX-MIRROR', 'Statutory to Tax Mirror',
             'Mirrors statutory journal entries to the tax book. Tax-specific adjustments '
             '(depreciation timing, non-deductible items) are handled via manual JE or '
             'book-specific posting rules.',
             'STAT', 'TAX',
             'SAME', 'MIRROR', 'SIMULTANEOUS',
             10, TRUE),

            -- STAT → MGMT: mirror all postings
            (v_tenant, 'DEFAULT', 'STAT-TO-MGMT-MIRROR', 'Statutory to Management Mirror',
             'Mirrors statutory journal entries to the management book for internal reporting.',
             'STAT', 'MGMT',
             'SAME', 'MIRROR', 'SIMULTANEOUS',
             10, TRUE),

            -- STAT → IFRS: mirror (IFRS adjustments via separate posting rules or manual JE)
            (v_tenant, 'DEFAULT', 'STAT-TO-IFRS-MIRROR', 'Statutory to IFRS Mirror',
             'Mirrors statutory journal entries to the IFRS book. Standard-specific '
             'adjustments (IFRS 15/16/9) handled via targeted posting rules.',
             'STAT', 'IFRS',
             'SAME', 'MIRROR', 'SIMULTANEOUS',
             10, TRUE)

        ON CONFLICT (tenant_id, entity_code, rule_code, version) DO NOTHING;

    END LOOP;
END $$;
