-- ============================================================================
-- CIRRUSATLANTIC — LEDGER BOOKS AND COMPANY ASSIGNMENTS
-- ============================================================================
-- seed-pack-version: 3.0.0
-- Dataset:  cirrusatlantic.ledger-books
-- Plane:    neon
-- Depends:  cirrusatlantic.organization-root 2.1.0
-- Natural keys: ledger_book(tenant_id,code);
--               company_code_book_assignment(tenant_id,company_code_id,book_id,effective_from)
-- Idempotent: convergent updates; identity and created_* are preserved
-- ============================================================================

DO $catl_ledger_books$
DECLARE
    v_tid   uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    v_actor uuid;
    v_cc    record;
    v_book_id uuid;
    v_expected integer;
    v_metadata constant jsonb :=
        '{"_seed":{"pack":"cirrusatlantic.ledger-books","version":"3.0.0"}}'::jsonb;
BEGIN
    IF v_tid IS NULL THEN
        SELECT id
          INTO v_tid
          FROM master.tenant
         WHERE realm_key = 'athyper'
           AND code = 'cirrusatlantic';
    END IF;

    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.tenant WHERE id = v_tid AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[311_ledger_books] active CirrusAtlantic tenant scope required';
    END IF;

    SELECT id
      INTO v_actor
      FROM master.principal
     WHERE tenant_id = v_tid
       AND code = 'seed-service'
       AND principal_type = 'service_account'
       AND status = 'active';

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal
         WHERE tenant_id = v_tid AND id = v_actor AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[311_ledger_books] active tenant-local seed actor required';
    END IF;

    SELECT count(*)
      INTO v_expected
      FROM master.company_code
     WHERE tenant_id = v_tid
       AND status = 'active';

    IF v_expected = 0 THEN
        RAISE EXCEPTION '[311_ledger_books] at least one active company code required';
    END IF;

    FOR v_cc IN
        SELECT id, code, name, functional_currency
          FROM master.company_code
         WHERE tenant_id = v_tid
           AND status = 'active'
         ORDER BY code
    LOOP
        -- Each company owns one statutory and one management book. The company
        -- remains the authority for functional currency and fiscal calendar.
        INSERT INTO master.ledger_book (
                id, tenant_id, code, name, description, category,
                reporting_standard, base_currency_code, is_primary,
                is_auto_post, is_approval_required, is_manual_je_allowed,
                is_reversal_allowed, close_mode, sort_order, metadata,
                status, created_by
            ) VALUES
            (
                md5('neon:ledger-book:' || v_tid || ':' || v_cc.code || ':statutory')::uuid,
                v_tid, v_cc.code || '-book-stat', v_cc.name || ' Statutory',
                'Statutory accounting book for ' || v_cc.code,
                'statutory', 'ifrs', v_cc.functional_currency, true,
                true, false, true, true, 'unified', 10, v_metadata,
                'active', v_actor
            ),
            (
                md5('neon:ledger-book:' || v_tid || ':' || v_cc.code || ':management')::uuid,
                v_tid, v_cc.code || '-book-mgmt', v_cc.name || ' Management',
                'Management reporting book for ' || v_cc.code,
                'management', 'ifrs', v_cc.functional_currency, false,
                true, false, true, true, 'unified', 20, v_metadata,
                'active', v_actor
            )
            ON CONFLICT (tenant_id, code) DO UPDATE SET
                name                   = EXCLUDED.name,
                description            = EXCLUDED.description,
                category               = EXCLUDED.category,
                reporting_standard     = EXCLUDED.reporting_standard,
                base_currency_code     = EXCLUDED.base_currency_code,
                is_primary             = EXCLUDED.is_primary,
                is_auto_post           = EXCLUDED.is_auto_post,
                is_approval_required   = EXCLUDED.is_approval_required,
                is_manual_je_allowed   = EXCLUDED.is_manual_je_allowed,
                is_reversal_allowed    = EXCLUDED.is_reversal_allowed,
                close_mode             = EXCLUDED.close_mode,
                sort_order             = EXCLUDED.sort_order,
                metadata               = master.ledger_book.metadata || EXCLUDED.metadata,
                status                 = EXCLUDED.status,
                updated_at             = now(),
                updated_by             = v_actor
            WHERE (
                master.ledger_book.name,
                master.ledger_book.description,
                master.ledger_book.category,
                master.ledger_book.reporting_standard,
                master.ledger_book.base_currency_code,
                master.ledger_book.is_primary,
                master.ledger_book.is_auto_post,
                master.ledger_book.is_approval_required,
                master.ledger_book.is_manual_je_allowed,
                master.ledger_book.is_reversal_allowed,
                master.ledger_book.close_mode,
                master.ledger_book.sort_order,
                master.ledger_book.metadata,
                master.ledger_book.status
            ) IS DISTINCT FROM (
                EXCLUDED.name,
                EXCLUDED.description,
                EXCLUDED.category,
                EXCLUDED.reporting_standard,
                EXCLUDED.base_currency_code,
                EXCLUDED.is_primary,
                EXCLUDED.is_auto_post,
                EXCLUDED.is_approval_required,
                EXCLUDED.is_manual_je_allowed,
                EXCLUDED.is_reversal_allowed,
                EXCLUDED.close_mode,
                EXCLUDED.sort_order,
                master.ledger_book.metadata || EXCLUDED.metadata,
                EXCLUDED.status
            );

        FOR v_book_id IN
            SELECT id
              FROM master.ledger_book
             WHERE tenant_id = v_tid
               AND code IN (v_cc.code || '-book-stat', v_cc.code || '-book-mgmt')
               AND status = 'active'
             ORDER BY code
        LOOP
            INSERT INTO master.company_code_book_assignment (
                id, tenant_id, company_code_id, book_id, effective_from,
                priority, conflict_strategy, metadata, status, created_by
            )
            SELECT
                md5('neon:company-book-assignment:' || v_tid || ':' || v_cc.id || ':' || v_book_id || ':2025-01-01')::uuid,
                v_tid, v_cc.id, v_book_id, DATE '2025-01-01',
                CASE book.category WHEN 'statutory' THEN 10 ELSE 5 END,
                'highest_priority', v_metadata, 'active', v_actor
              FROM master.ledger_book book
             WHERE book.tenant_id = v_tid
               AND book.id = v_book_id
            ON CONFLICT (tenant_id, company_code_id, book_id, effective_from)
            DO UPDATE SET
                priority          = EXCLUDED.priority,
                conflict_strategy = EXCLUDED.conflict_strategy,
                metadata          = master.company_code_book_assignment.metadata || EXCLUDED.metadata,
                status            = EXCLUDED.status,
                updated_at        = now(),
                updated_by        = v_actor
            WHERE (
                master.company_code_book_assignment.priority,
                master.company_code_book_assignment.conflict_strategy,
                master.company_code_book_assignment.metadata,
                master.company_code_book_assignment.status
            ) IS DISTINCT FROM (
                EXCLUDED.priority,
                EXCLUDED.conflict_strategy,
                master.company_code_book_assignment.metadata || EXCLUDED.metadata,
                EXCLUDED.status
            );
        END LOOP;
    END LOOP;

    IF (
        SELECT count(*)
          FROM master.company_code_book_assignment assignment
          JOIN master.ledger_book book
            ON book.tenant_id = assignment.tenant_id
           AND book.id = assignment.book_id
         WHERE assignment.tenant_id = v_tid
           AND assignment.status = 'active'
           AND book.status = 'active'
           AND book.category IN ('statutory', 'management')
           AND assignment.effective_from = DATE '2025-01-01'
           AND assignment.metadata->'_seed'->>'pack' = 'cirrusatlantic.ledger-books'
    ) <> v_expected * 2 THEN
        RAISE EXCEPTION '[311_ledger_books] company/book assignment assertion failed';
    END IF;

    RAISE NOTICE '[311_ledger_books] % active company codes assigned to statutory and management books',
        v_expected;
END
$catl_ledger_books$;
