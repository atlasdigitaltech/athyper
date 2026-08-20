-- ============================================================================
-- TECHNOSTAT - GL ACCOUNT SEED
-- ============================================================================
-- File:     005_technostat_gl_accounts.sql
-- Purpose:  Materialize the universal IFRS/GAAP framework accounts for
--           Technostat's tenant-local COA-IFRS and COA-GAAP charts.
--
-- The seed runner records universal seeds globally, not once per tenant.
-- Technostat therefore needs to copy the already-seeded framework templates
-- into its own tenant charts before supplier/customer posting overrides can
-- resolve AP, AR, tax, cash, and expense accounts.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_level int;
    v_missing text;
BEGIN
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper'
      AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[005_technostat_gl_accounts] technostat tenant not found';
    END IF;

    CREATE TEMP TABLE tmp_framework_source (
        coa_code text PRIMARY KEY,
        source_coa_id uuid NOT NULL,
        dest_coa_id uuid NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_framework_source (coa_code, source_coa_id, dest_coa_id)
    SELECT DISTINCT ON (lower(d.code)) lower(d.code), s.id, d.id
    FROM master.chart_of_account d
    JOIN LATERAL (
        SELECT src.id
        FROM master.chart_of_account src
        WHERE lower(src.code) = lower(d.code)
          AND EXISTS (
              SELECT 1
              FROM master.gl_account ga
              WHERE ga.tenant_id = src.tenant_id
                AND ga.chart_of_account_id = src.id
                AND ga.node_type = 'posting'
                AND ga.code = CASE
                    WHEN lower(d.code) = 'coa-gaap' THEN 'USGAAP-L-AP-TRADE'
                    ELSE 'IFRS-L-AP-TRADE'
                END
        )
        ORDER BY src.created_at NULLS LAST, src.id
        LIMIT 1
    ) s ON true
    WHERE d.tenant_id = v_tid
      AND lower(d.code) IN ('coa-ifrs', 'coa-gaap')
    ORDER BY lower(d.code), d.created_at NULLS LAST, d.id;

    SELECT string_agg(code, ', ' ORDER BY code)
    INTO v_missing
    FROM master.chart_of_account d
    WHERE d.tenant_id = v_tid
      AND lower(d.code) IN ('coa-ifrs', 'coa-gaap')
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_framework_source s
          WHERE s.coa_code = lower(d.code)
      );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '[005_technostat_gl_accounts] Missing source framework account template(s): %', v_missing;
    END IF;

    FOR v_level IN 1..8 LOOP
        INSERT INTO master.gl_account (
            tenant_id, chart_of_account_id,
            code, name, parent_id, level_no, path,
            description, account_class, node_type, normal_balance,
            subledger_type, currency_code, sort_order,
            metadata, status, created_by
        )
        SELECT
            v_tid,
            m.dest_coa_id,
            src.code,
            src.name,
            dst_parent.id,
            src.level_no,
            src.path,
            src.description,
            src.account_class,
            src.node_type,
            src.normal_balance,
            src.subledger_type,
            src.currency_code,
            src.sort_order,
            src.metadata || jsonb_build_object(
                '_seed', jsonb_build_object(
                    'pack', '005_technostat_gl_accounts',
                    'source_coa_code', m.coa_code,
                    'seeded_at', now()::text
                )
            ),
            'active',
            v_su
        FROM tmp_framework_source m
        JOIN master.gl_account src
          ON src.chart_of_account_id = m.source_coa_id
         AND src.level_no = v_level
        LEFT JOIN master.gl_account src_parent
          ON src_parent.id = src.parent_id
         AND src_parent.tenant_id = src.tenant_id
        LEFT JOIN master.gl_account dst_parent
          ON dst_parent.tenant_id = v_tid
         AND dst_parent.chart_of_account_id = m.dest_coa_id
         AND dst_parent.code = src_parent.code
        ON CONFLICT (tenant_id, chart_of_account_id, code)
        DO UPDATE SET
            name            = EXCLUDED.name,
            parent_id       = EXCLUDED.parent_id,
            level_no        = EXCLUDED.level_no,
            path            = EXCLUDED.path,
            description     = EXCLUDED.description,
            account_class   = EXCLUDED.account_class,
            node_type       = EXCLUDED.node_type,
            normal_balance  = EXCLUDED.normal_balance,
            subledger_type  = EXCLUDED.subledger_type,
            currency_code   = EXCLUDED.currency_code,
            sort_order      = EXCLUDED.sort_order,
            metadata        = master.gl_account.metadata || EXCLUDED.metadata,
            status          = 'active',
            updated_at      = now(),
            updated_by      = v_su
        ;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM master.chart_of_account coa
        JOIN master.gl_account ga
          ON ga.chart_of_account_id = coa.id
         AND ga.tenant_id = coa.tenant_id
        WHERE coa.tenant_id = v_tid
          AND lower(coa.code) = 'coa-ifrs'
          AND ga.code = 'IFRS-L-AP-TRADE'
          AND ga.node_type = 'posting'
          AND ga.is_active = true
    ) OR NOT EXISTS (
        SELECT 1
        FROM master.chart_of_account coa
        JOIN master.gl_account ga
          ON ga.chart_of_account_id = coa.id
         AND ga.tenant_id = coa.tenant_id
        WHERE coa.tenant_id = v_tid
          AND lower(coa.code) = 'coa-gaap'
          AND ga.code = 'USGAAP-L-AP-TRADE'
          AND ga.node_type = 'posting'
          AND ga.is_active = true
    ) THEN
        RAISE EXCEPTION '[005_technostat_gl_accounts] AP trade accounts were not materialized for both IFRS and GAAP';
    END IF;

    RAISE NOTICE '[005_technostat_gl_accounts] materialized IFRS/GAAP framework accounts for technostat';
END $seed$;
