-- ============================================================================
-- 311_ledger_books.sql â€” Ledger books + company-book assignments
-- ============================================================================
-- Design: One statutory book per company (correct currency + framework)
--         One shared group management book (MYR, IFRS, for consolidation)
-- Each company gets: 1 statutory assignment + 1 management assignment = 2
-- Total: 17 statutory books + 1 management = 18 books, 34 assignments
-- Depends: 199 (company_codes with functional_currency, regulatory_framework)
-- ============================================================================

DO $seed$
DECLARE
    v_tid    uuid;
    v_su     uuid := '00000000-0000-0000-0000-000000000000';
    v_meta   jsonb := '{"_seed": {"pack": "311_org", "version": "2.0.0"}}'::jsonb;
    v_cc     record;
    v_mgmt   uuid;
    v_book   uuid;
    v_active_cos int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    SELECT count(*) INTO v_active_cos FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    -- PREREQUISITE: Verify lookup values exist (hard fail â€” triggers will
    -- reject the INSERT anyway, so fail early with a clear message)
    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_category' AND code = 'statutory')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_category "statutory" missing from lookup'; END IF;

    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_category' AND code = 'management')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_category "management" missing from lookup'; END IF;

    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_close_mode' AND code = 'unified')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_close_mode "unified" missing from lookup'; END IF;

    -- Verify every company's regulatory_framework is accepted by
    -- the ledger_book_standard lookup before we use it as reporting_standard
    IF EXISTS (
        SELECT cc.code, (CASE WHEN cc.country_code = 'US' THEN 'gaap' ELSE 'ifrs' END) AS fw
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM control.lookup_value lv
              WHERE lv.domain_code = 'master.ledger_book_standard'
                AND lv.code = (CASE WHEN cc.country_code = 'US' THEN 'gaap' ELSE 'ifrs' END))
    ) THEN RAISE EXCEPTION '311 FAIL: company regulatory_framework value not in ledger_book_standard lookup: %',
        (SELECT string_agg(DISTINCT (CASE WHEN cc.country_code = 'US' THEN 'gaap' ELSE 'ifrs' END), ', ')
         FROM master.company_code cc
         WHERE cc.tenant_id = v_tid AND cc.status = 'active'
           AND NOT EXISTS (
               SELECT 1 FROM control.lookup_value lv
               WHERE lv.domain_code = 'master.ledger_book_standard'
                 AND lv.code = (CASE WHEN cc.country_code = 'US' THEN 'gaap' ELSE 'ifrs' END)));
    END IF;

    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    -- STAGE A: Group management book (shared, MYR, IFRS)
    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    INSERT INTO master.ledger_book
        (tenant_id, code, name, description, category, reporting_standard,
         base_currency_code, is_primary, is_auto_post, is_manual_je_allowed,
         is_reversal_allowed, close_mode, sort_order, status, created_by, metadata)
    VALUES
        (v_tid, 'BOOK-MGMT-GROUP', 'Group Management', 'Management reporting in MYR',
         'management', 'ifrs', 'MYR', false, true, true, true, 'unified',
         900, 'active', v_su, v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, base_currency_code = EXCLUDED.base_currency_code,
        updated_at = now(), updated_by = v_su
    WHERE (master.ledger_book.name, master.ledger_book.base_currency_code)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.base_currency_code);

    SELECT id INTO v_mgmt FROM master.ledger_book
    WHERE tenant_id = v_tid AND code = 'BOOK-MGMT-GROUP';

    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    -- STAGE B: Per-company statutory books
    -- One book per company, using company's functional_currency and framework
    -- Code: {COMPANY}-BOOK-STAT
    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    FOR v_cc IN
        SELECT id, code, name, functional_currency,
               (CASE WHEN country_code = 'US' THEN 'gaap' ELSE 'ifrs' END) AS framework
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        INSERT INTO master.ledger_book
            (tenant_id, code, name, description, category, reporting_standard,
             base_currency_code, is_primary, is_auto_post, is_manual_je_allowed,
             is_reversal_allowed, close_mode, sort_order, status, created_by, metadata)
        VALUES
            (v_tid,
             v_cc.code || '-BOOK-STAT',
             v_cc.name || ' Statutory',
             'Statutory book for ' || v_cc.code || ' (' || v_cc.functional_currency || ')',
             'statutory', v_cc.framework, v_cc.functional_currency,
             false, true, true, true, 'unified',
             10, 'active', v_su,
             jsonb_build_object('_seed', jsonb_build_object(
                 'pack', '311_org', 'version', '2.0.0',
                 'company_code', v_cc.code, 'seeded_at', now()::text
             )))
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            base_currency_code = EXCLUDED.base_currency_code,
            reporting_standard = EXCLUDED.reporting_standard,
            updated_at = now(), updated_by = v_su
        WHERE (master.ledger_book.name, master.ledger_book.description,
               master.ledger_book.base_currency_code, master.ledger_book.reporting_standard)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.description,
               EXCLUDED.base_currency_code, EXCLUDED.reporting_standard);

        -- Statutory book assignment (priority 10)
        SELECT id INTO v_book FROM master.ledger_book
        WHERE tenant_id = v_tid AND code = v_cc.code || '-BOOK-STAT';

        INSERT INTO master.company_code_book_assignment
            (tenant_id, company_code_id, book_id,
             effective_from, priority, status, created_by, metadata)
        VALUES
            (v_tid, v_cc.id, v_book,
             '2025-01-01', 10, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
            priority = EXCLUDED.priority,
            updated_at = now(), updated_by = v_su
        WHERE master.company_code_book_assignment.priority
           IS DISTINCT FROM EXCLUDED.priority;

        -- Stamp default_ledger_book_id on the company for direct lookup
        UPDATE master.company_code
           SET default_ledger_book_id = v_book,
               updated_at = now(), updated_by = v_su
         WHERE id = v_cc.id AND tenant_id = v_tid
           AND default_ledger_book_id IS NULL;

        -- Group management book assignment (priority 5)
        INSERT INTO master.company_code_book_assignment
            (tenant_id, company_code_id, book_id,
             effective_from, priority, status, created_by, metadata)
        VALUES
            (v_tid, v_cc.id, v_mgmt,
             '2025-01-01', 5, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
            priority = EXCLUDED.priority,
            updated_at = now(), updated_by = v_su
        WHERE master.company_code_book_assignment.priority
           IS DISTINCT FROM EXCLUDED.priority;
    END LOOP;

    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    -- ASSERTIONS
    -- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    -- A1: Statutory book count = active companies (one per company)
    IF (SELECT count(*) FROM master.ledger_book
        WHERE tenant_id = v_tid AND category = 'statutory')
       != v_active_cos
    THEN RAISE EXCEPTION '311 FAIL: expected % statutory books, got %',
        v_active_cos,
        (SELECT count(*) FROM master.ledger_book
         WHERE tenant_id = v_tid AND category = 'statutory');
    END IF;

    -- A1b: Exactly 1 management book
    IF (SELECT count(*) FROM master.ledger_book
        WHERE tenant_id = v_tid AND category = 'management') != 1
    THEN RAISE EXCEPTION '311 FAIL: expected 1 management book'; END IF;

    -- A2: Every active company has exactly 1 statutory book assignment
    IF EXISTS (
        SELECT ba.company_code_id, count(*)
        FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE ba.tenant_id = v_tid AND lb.category = 'statutory'
        GROUP BY ba.company_code_id HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '311 FAIL: company with != 1 statutory book assignment'; END IF;

    -- A3: Every active company has the management book assignment
    IF EXISTS (
        SELECT cc.code FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM master.company_code_book_assignment ba
              WHERE ba.tenant_id = v_tid AND ba.company_code_id = cc.id
                AND ba.book_id = v_mgmt)
    ) THEN RAISE EXCEPTION '311 FAIL: company missing management book assignment'; END IF;

    -- A4: Every statutory book's currency matches its company's functional_currency
    IF EXISTS (
        SELECT lb.code, lb.base_currency_code, cc.functional_currency
        FROM master.ledger_book lb
        JOIN master.company_code_book_assignment ba
            ON ba.book_id = lb.id AND ba.tenant_id = lb.tenant_id
        JOIN master.company_code cc
            ON cc.id = ba.company_code_id AND cc.tenant_id = ba.tenant_id
        WHERE lb.tenant_id = v_tid AND lb.category = 'statutory'
          AND lb.base_currency_code != cc.functional_currency
    ) THEN RAISE EXCEPTION '311 FAIL: statutory book currency mismatch with company'; END IF;

    -- A5: Statutory + management assignments = expected
    IF (SELECT count(*) FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE ba.tenant_id = v_tid AND lb.category IN ('statutory', 'management'))
       != v_active_cos * 2
    THEN RAISE EXCEPTION '311 FAIL: expected % statutory+management assignments, got %',
        v_active_cos * 2,
        (SELECT count(*) FROM master.company_code_book_assignment ba
         JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
         WHERE ba.tenant_id = v_tid AND lb.category IN ('statutory', 'management'));
    END IF;

    RAISE NOTICE '311: % books (% statutory + 1 management), % assignments (2 per company)',
        (SELECT count(*) FROM master.ledger_book WHERE tenant_id = v_tid),
        v_active_cos,
        (SELECT count(*) FROM master.company_code_book_assignment WHERE tenant_id = v_tid);
END $seed$;

