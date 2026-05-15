-- ============================================================================
-- 340_asset_classes.sql  Asset book policies - demo tenant wrapper
-- ============================================================================
-- The asset class taxonomy is seeded universally by:
--   020_universal/040_assets/340_asset_classes.sql
--
-- The IFRS_DEFAULT policy template is seeded universally by:
--   020_universal/040_assets/341_asset_class_book_policy_templates.sql
--
-- This tenant seed only provisions concrete company/book policies from that
-- template after company codes and ledger books exist.
-- ============================================================================

DO $seed$
DECLARE
    v_tid            uuid;
    v_su             uuid := '00000000-0000-0000-0000-000000000000';
    v_result         jsonb;
    v_company_count  int;
    v_template_count int;
    v_expected_count int;
    v_policy_count   int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[340_asset_policy] Tenant ATHYPER not found';
    END IF;

    SELECT count(*) INTO v_company_count
    FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    IF v_company_count = 0 THEN
        RAISE EXCEPTION '[340_asset_policy] No active company codes found';
    END IF;

    SELECT count(*) INTO v_template_count
    FROM control.asset_class_book_policy_template
    WHERE tenant_id IS NULL
      AND template_code = 'IFRS_DEFAULT'
      AND status = 'active';

    IF v_template_count != 24 THEN
        RAISE EXCEPTION '[340_asset_policy] Expected 24 IFRS_DEFAULT template rows, got %', v_template_count;
    END IF;

    IF (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid) < 16 THEN
        RAISE EXCEPTION '[340_asset_policy] Asset class taxonomy not seeded - run 020_universal/040_assets/340_asset_classes.sql first';
    END IF;

    SELECT control.provision_asset_policies(
        v_tid,
        NULL,
        'IFRS_DEFAULT',
        '2025-01-01'::date,
        v_su,
        true
    )
    INTO v_result;

    v_expected_count := v_company_count * v_template_count;

    SELECT count(*) INTO v_policy_count
    FROM control.asset_class_book_policy
    WHERE tenant_id = v_tid
      AND effective_from = '2025-01-01'::date
      AND metadata->'_provision'->>'template_code' = 'IFRS_DEFAULT';

    IF v_policy_count != v_expected_count THEN
        RAISE EXCEPTION '[340_asset_policy] Expected % provisioned policies, got %. Result=%',
            v_expected_count, v_policy_count, v_result;
    END IF;

    IF EXISTS (
        SELECT id
        FROM control.asset_class_book_policy
        WHERE tenant_id = v_tid
          AND metadata->'_provision'->>'template_code' = 'IFRS_DEFAULT'
          AND is_depreciable = true
          AND depreciation_method <> 'no_depreciation'
          AND (
              acquisition_posting_role_code IS NULL
              OR accum_depr_posting_role_code IS NULL
              OR depr_expense_posting_role_code IS NULL
          )
    ) THEN
        RAISE EXCEPTION '[340_asset_policy] Depreciable policy missing core posting roles';
    END IF;

    IF EXISTS (
        SELECT p.id, p.book_code, p.company_code_id
        FROM control.asset_class_book_policy p
        WHERE p.tenant_id = v_tid
          AND p.metadata->'_provision'->>'template_code' = 'IFRS_DEFAULT'
          AND NOT EXISTS (
              SELECT 1
              FROM master.company_code_book_assignment ba
              JOIN master.ledger_book lb
                ON lb.id = ba.book_id
               AND lb.tenant_id = ba.tenant_id
              WHERE ba.tenant_id = p.tenant_id
                AND ba.company_code_id = p.company_code_id
                AND lb.code = p.book_code
                AND ba.status = 'active'
          )
    ) THEN
        RAISE EXCEPTION '[340_asset_policy] Policy book_code not assigned to its company via book_assignment';
    END IF;

    RAISE NOTICE '[340_asset_policy] OK: % policies provisioned from IFRS_DEFAULT across % companies. Result=%',
        v_policy_count, v_company_count, v_result;
END $seed$;
