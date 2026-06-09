-- ============================================================================
-- CIRRUSATLANTIC - LEDGER BOOKS + COMPANY-BOOK ASSIGNMENTS
-- ============================================================================
-- Design: One statutory book per company (currency + framework from company).
--         One shared group management book (MYR, IFRS).
-- Depends: active company codes with functional_currency/regulatory_framework.
-- ============================================================================

DO $seed$
DECLARE
    v_tid        uuid;
    v_su         uuid := '00000000-0000-0000-0000-000000000000';
    v_meta       jsonb := '{"_seed": {"pack": "311_org", "version": "2.0.0"}}'::jsonb;
    v_cc         record;
    v_mgmt       uuid;
    v_book       uuid;
    v_active_ccs int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        SELECT id INTO v_tid
        FROM master.tenant
        WHERE realm_key = 'athyper'
          AND code = 'cirrusatlantic';
    END IF;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[311_ledger_books] cirrusatlantic tenant not found';
    END IF;

    SELECT count(*) INTO v_active_ccs
    FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_category' AND code = 'statutory')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_category "statutory" missing from lookup'; END IF;

    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_category' AND code = 'management')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_category "management" missing from lookup'; END IF;

    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_close_mode' AND code = 'unified')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_close_mode "unified" missing from lookup'; END IF;

    IF EXISTS (
        SELECT 1
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid
          AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1
              FROM control.lookup_value lv
              WHERE lv.domain_code = 'master.ledger_book_standard'
                AND lv.code = COALESCE(cc.regulatory_framework, 'ifrs')
          )
    ) THEN
        RAISE EXCEPTION '311 FAIL: company regulatory_framework value not in ledger_book_standard lookup';
    END IF;

    INSERT INTO master.ledger_book
        (tenant_id, code, name, description, category, reporting_standard,
         base_currency_code, is_primary, is_auto_post, is_manual_je_allowed,
         is_reversal_allowed, close_mode, sort_order, status, created_by, metadata)
    VALUES
        (v_tid, 'BOOK-MGMT-GROUP', 'Group Management', 'Management reporting in MYR',
         'management', 'ifrs', 'MYR', false, true, true, true, 'unified',
         900, 'active', v_su, v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name               = EXCLUDED.name,
        description        = EXCLUDED.description,
        category           = EXCLUDED.category,
        reporting_standard = EXCLUDED.reporting_standard,
        base_currency_code = EXCLUDED.base_currency_code,
        close_mode         = EXCLUDED.close_mode,
        updated_at         = now(),
        updated_by         = v_su
    WHERE (master.ledger_book.name, master.ledger_book.description,
           master.ledger_book.category, master.ledger_book.reporting_standard,
           master.ledger_book.base_currency_code, master.ledger_book.close_mode)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.category, EXCLUDED.reporting_standard,
           EXCLUDED.base_currency_code, EXCLUDED.close_mode);

    SELECT id INTO v_mgmt
    FROM master.ledger_book
    WHERE tenant_id = v_tid AND code = 'BOOK-MGMT-GROUP';

    FOR v_cc IN
        SELECT id, code, name, functional_currency,
               COALESCE(regulatory_framework, 'ifrs') AS framework
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
            name               = EXCLUDED.name,
            description        = EXCLUDED.description,
            category           = EXCLUDED.category,
            reporting_standard = EXCLUDED.reporting_standard,
            base_currency_code = EXCLUDED.base_currency_code,
            close_mode         = EXCLUDED.close_mode,
            updated_at         = now(),
            updated_by         = v_su
        WHERE (master.ledger_book.name, master.ledger_book.description,
               master.ledger_book.category, master.ledger_book.reporting_standard,
               master.ledger_book.base_currency_code, master.ledger_book.close_mode)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.description,
               EXCLUDED.category, EXCLUDED.reporting_standard,
               EXCLUDED.base_currency_code, EXCLUDED.close_mode);

        SELECT id INTO v_book
        FROM master.ledger_book
        WHERE tenant_id = v_tid AND code = v_cc.code || '-BOOK-STAT';

        INSERT INTO master.company_code_book_assignment
            (tenant_id, company_code_id, book_id,
             effective_from, priority, status, created_by, metadata)
        VALUES
            (v_tid, v_cc.id, v_book,
             '2025-01-01', 10, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
            effective_from = EXCLUDED.effective_from,
            priority       = EXCLUDED.priority,
            status         = 'active',
            updated_at     = now(),
            updated_by     = v_su;

        UPDATE master.company_code
           SET default_ledger_book_id = v_book,
               updated_at = now(),
               updated_by = v_su
         WHERE id = v_cc.id
           AND tenant_id = v_tid
           AND default_ledger_book_id IS NULL;

        INSERT INTO master.company_code_book_assignment
            (tenant_id, company_code_id, book_id,
             effective_from, priority, status, created_by, metadata)
        VALUES
            (v_tid, v_cc.id, v_mgmt,
             '2025-01-01', 5, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
            effective_from = EXCLUDED.effective_from,
            priority       = EXCLUDED.priority,
            status         = 'active',
            updated_at     = now(),
            updated_by     = v_su;
    END LOOP;

    IF (SELECT count(*) FROM master.ledger_book
        WHERE tenant_id = v_tid AND category = 'statutory'
          AND metadata->'_seed'->>'pack' = '311_org') != v_active_ccs
    THEN
        RAISE EXCEPTION '311 FAIL: statutory book count does not match active company count';
    END IF;

    RAISE NOTICE '311: cirrusatlantic ledger books aligned to common company-code pattern';
END $seed$;
