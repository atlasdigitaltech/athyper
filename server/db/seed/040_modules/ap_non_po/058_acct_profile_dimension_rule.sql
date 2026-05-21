-- ============================================================================
-- FILE: blueprint/058_acct_profile_dimension_rule.sql
-- Purpose: Dimension derivation rules per AP Non-PO profile
-- Depends on: control.acct_profile_config (030), master.dimension_type (tenant)
-- Idempotent: DELETE pack rows + INSERT (table has no natural unique key)
-- ============================================================================
-- Seeded rules (skipped silently if the dimension_type code is not found):
--   COST_CENTER  — FROM_DOCUMENT, DERIVE_IF_MISSING, priority 10 (all events)
--   DEPARTMENT   — FROM_DOCUMENT, OPTIONAL,          priority 20 (all events)
--   PROJECT      — FROM_LINE,     OPTIONAL,           priority 30 (ORDER_APPROVAL + ADVANCE_PAID)
--
-- FROM_DOCUMENT: engine reads cost_center / department from the invoice header
-- FROM_LINE:     engine reads project dimension from each invoice line
-- ============================================================================

DO $seed_ap_dim_rules$
DECLARE
    v_cfg       record;
    v_dim_cc    uuid;
    v_dim_dept  uuid;
    v_dim_proj  uuid;
    v_sys       uuid    := '00000000-0000-0000-0000-000000000000';
    v_tid       uuid;
    v_deleted   integer := 0;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Resolve dimension_type IDs for this tenant
    SELECT id INTO v_dim_cc   FROM master.dimension_type WHERE tenant_id = v_tid AND code = 'COST_CENTER'  LIMIT 1;
    SELECT id INTO v_dim_dept FROM master.dimension_type WHERE tenant_id = v_tid AND code = 'DEPARTMENT'   LIMIT 1;
    SELECT id INTO v_dim_proj FROM master.dimension_type WHERE tenant_id = v_tid AND code = 'PROJECT'      LIMIT 1;

    IF v_dim_cc IS NULL AND v_dim_dept IS NULL AND v_dim_proj IS NULL THEN
        RAISE NOTICE 'blueprint/058_acct_profile_dimension_rule: no dimension types (COST_CENTER/DEPARTMENT/PROJECT) found for tenant % — skipping', v_tid;
        RETURN;
    END IF;

    FOR v_cfg IN
        SELECT apc.id AS config_id, apc.tenant_id, ap.code AS profile_code
          FROM control.acct_profile_config apc
          JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
         WHERE ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                           'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE')
           AND ap.tenant_id = v_tid
           AND apc.is_active = true
    LOOP
        -- Clean existing pack-owned dimension rules for this config before re-inserting
        DELETE FROM control.acct_profile_dimension_rule
         WHERE profile_config_id = v_cfg.config_id
           AND tenant_id         = v_cfg.tenant_id;

        GET DIAGNOSTICS v_deleted = ROW_COUNT;

        -- COST_CENTER: derive from invoice header (all events)
        IF v_dim_cc IS NOT NULL THEN
            INSERT INTO control.acct_profile_dimension_rule (
                tenant_id, profile_config_id,
                dimension_type_id, derive_source, behavior,
                is_required, applies_to_events, applies_to_books,
                priority, status, created_by, metadata
            ) VALUES (
                v_cfg.tenant_id, v_cfg.config_id,
                v_dim_cc, 'FROM_DOCUMENT', 'DERIVE_IF_MISSING',
                false, NULL, NULL,
                10, 'active', v_sys,
                '{"description":"Derive cost centre from invoice header cost_center field; stamp on all JE lines"}'::jsonb
            );
        END IF;

        -- DEPARTMENT: derive from invoice header (all events)
        IF v_dim_dept IS NOT NULL THEN
            INSERT INTO control.acct_profile_dimension_rule (
                tenant_id, profile_config_id,
                dimension_type_id, derive_source, behavior,
                is_required, applies_to_events, applies_to_books,
                priority, status, created_by, metadata
            ) VALUES (
                v_cfg.tenant_id, v_cfg.config_id,
                v_dim_dept, 'FROM_DOCUMENT', 'OPTIONAL',
                false, NULL, NULL,
                20, 'active', v_sys,
                '{"description":"Derive department from invoice header department field; optional stamp on JE lines"}'::jsonb
            );
        END IF;

        -- PROJECT: derive from invoice line (posting events only — no project on informational events)
        IF v_dim_proj IS NOT NULL THEN
            INSERT INTO control.acct_profile_dimension_rule (
                tenant_id, profile_config_id,
                dimension_type_id, derive_source, behavior,
                is_required,
                applies_to_events,
                applies_to_books,
                priority, status, created_by, metadata
            ) VALUES (
                v_cfg.tenant_id, v_cfg.config_id,
                v_dim_proj, 'FROM_LINE', 'OPTIONAL',
                false,
                ARRAY['ORDER_APPROVAL','ADVANCE_PAID'],
                NULL,
                30, 'active', v_sys,
                '{"description":"Derive project from invoice line project dimension; applied only on JE-posting events"}'::jsonb
            );
        END IF;

        RAISE NOTICE 'blueprint/058_acct_profile_dimension_rule: profile % — deleted % stale rules, re-inserted fresh rules',
            v_cfg.profile_code, v_deleted;
    END LOOP;

    RAISE NOTICE 'blueprint/058_acct_profile_dimension_rule: complete for tenant %', v_tid;
END $seed_ap_dim_rules$;
