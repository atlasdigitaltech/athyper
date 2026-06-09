-- ============================================================================
-- FILE: blueprints/modules/ap_non_po/099_apply.sql
-- Purpose: Record application of pack_ap_non_po for the provisioning tenant
-- Depends on: all prior 010..090 files successfully executed for this tenant
-- Idempotent: ON CONFLICT (tenant_id, blueprint_code) DO UPDATE (bumps version)
-- Session var: SET app.seed_tenant_id = '<tenant_uuid>' before running
-- ============================================================================
-- This file is the "receipt" that the pack was applied. It also runs
-- post-install sanity checks and raises a warning if expected rows are missing.
-- ============================================================================

DO $apply_ap_non_po$
DECLARE
    v_tid            uuid;
    v_tenant_code    text;
    v_sys            uuid := '00000000-0000-0000-0000-000000000000';
    v_version        text := '1.0.0';
    v_profile_count   integer;
    v_config_count    integer;
    v_event_count     integer;
    v_tpl_count       integer;
    v_settle_count    integer;
    v_commit_count    integer;
    v_book_count      integer;
    v_rule_count      integer;
    v_iprr_count      integer;
    v_psr_count       integer;
    v_warnings        text[] := ARRAY[]::text[];
BEGIN

    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT code INTO v_tenant_code FROM master.tenant WHERE id = v_tid;
    IF v_tenant_code IS NULL THEN
        RAISE EXCEPTION '[seed] No tenant found for app.seed_tenant_id = %', v_tid;
    END IF;

    -- Count what we actually seeded for this tenant
    SELECT count(*) INTO v_profile_count
      FROM master.accounting_profile
     WHERE tenant_id = v_tid
       AND code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                    'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE');

    SELECT count(*) INTO v_config_count
      FROM control.acct_profile_config apc
      JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
     WHERE ap.tenant_id = v_tid
       AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                       'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE')
       AND apc.is_active;

    SELECT count(*) INTO v_event_count
      FROM control.acct_profile_event ape
      JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
      JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
     WHERE ap.tenant_id = v_tid
       AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                       'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE');

    SELECT count(*) INTO v_tpl_count
      FROM control.acct_profile_entry_template apet
      JOIN control.acct_profile_event ape ON ape.id = apet.profile_event_id
      JOIN control.acct_profile_config apc ON apc.id = ape.profile_config_id
      JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
     WHERE ap.tenant_id = v_tid
       AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                       'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE');

    SELECT count(*) INTO v_settle_count
      FROM control.acct_profile_settlement_config apsc
      JOIN control.acct_profile_config apc ON apc.id = apsc.profile_config_id
      JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
     WHERE ap.tenant_id = v_tid
       AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                       'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE');

    SELECT count(*) INTO v_commit_count
      FROM control.acct_profile_commitment_config apcc
      JOIN control.acct_profile_config apc ON apc.id = apcc.profile_config_id
      JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
     WHERE ap.tenant_id = v_tid
       AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                       'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE');

    SELECT count(*) INTO v_book_count
      FROM control.acct_profile_book_rule apbr
      JOIN control.acct_profile_config apc ON apc.id = apbr.profile_config_id
      JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
     WHERE ap.tenant_id = v_tid
       AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                       'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE');

    -- Count ALL active classification→intent rules for this tenant.
    -- (Prior query only counted the 3 generic-intent rules, missing 061/062 rules.)
    SELECT count(*) INTO v_rule_count
      FROM control.commodity_classification_to_intent_rule
     WHERE tenant_id = v_tid
       AND is_active  = true;

    SELECT count(*) INTO v_iprr_count
      FROM control.intent_to_accounting_profile_rule iprr
      JOIN control.acct_profile_config apc ON apc.id = iprr.resolved_profile_config_id
      JOIN master.accounting_profile ap ON ap.id = apc.accounting_profile_id
     WHERE iprr.tenant_id = v_tid
       AND ap.code IN ('AP_NON_PO_STANDARD','AP_NON_PO_CAPEX',
                       'AP_ADVANCE_SUPPLIER','AP_RETENTION_RELEASE');

    SELECT count(*) INTO v_psr_count
      FROM control.payment_settlement_rule
     WHERE tenant_id = v_tid
       AND metadata->>'auto_created_by' = 'pack_ap_non_po';

    -- Validate expected minima
    IF v_profile_count < 4 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected 4 accounting profiles, got %s',
            v_tenant_code, v_profile_count);
    END IF;
    IF v_config_count < 4 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected 4 profile configs, got %s',
            v_tenant_code, v_config_count);
    END IF;
    IF v_event_count < 9 THEN  -- 3+3+2+1
        v_warnings := v_warnings || format(
            'Tenant %s: expected >=9 profile events, got %s',
            v_tenant_code, v_event_count);
    END IF;
    IF v_tpl_count < 16 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected >=16 entry templates, got %s',
            v_tenant_code, v_tpl_count);
    END IF;
    IF v_settle_count < 4 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected 4 settlement configs, got %s — run 055_acct_profile_settlement_config.sql',
            v_tenant_code, v_settle_count);
    END IF;
    IF v_commit_count < 4 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected 4 commitment configs, got %s — run 056_acct_profile_commitment_config.sql',
            v_tenant_code, v_commit_count);
    END IF;
    IF v_book_count < 4 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected >=4 book rules (IFRS MIRROR), got %s — run 057_acct_profile_book_rule.sql',
            v_tenant_code, v_book_count);
    END IF;
    IF v_iprr_count < 6 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected >=6 intent→profile rules, got %s',
            v_tenant_code, v_iprr_count);
    END IF;

    -- After 061 + 062 both run, expect >=60 active classification rules per tenant
    -- (20 from 061 roots+leaves + 30 root containers from 060 + >=75 leaves from 062,
    --  minus any that couldn't resolve commodity_category/intent IDs).
    IF v_rule_count < 60 THEN
        v_warnings := v_warnings || format(
            'Tenant %s: expected >=60 classification→intent rules, got %s — '
            'ensure 061 and 062 have been run after 020_spend_categories',
            v_tenant_code, v_rule_count);
    END IF;

    -- Record application (applied even with warnings so retries are idempotent)
    INSERT INTO control.tenant_blueprint_application (
        tenant_id, blueprint_code, applied_version,
        applied_at, applied_by, status, error_detail, metadata,
        created_by
    ) VALUES (
        v_tid, 'pack_ap_non_po', v_version,
        now(), v_sys,
        'applied',
        CASE WHEN cardinality(v_warnings) = 0 THEN NULL
             ELSE array_to_string(v_warnings, E'\n') END,
        jsonb_build_object(
            'profiles',             v_profile_count,
            'configs',              v_config_count,
            'events',               v_event_count,
            'templates',            v_tpl_count,
            'settlement_configs',   v_settle_count,
            'commitment_configs',   v_commit_count,
            'book_rules',           v_book_count,
            'classification_rules', v_rule_count,
            'intent_profile_rules', v_iprr_count,
            'settlement_rules',     v_psr_count,
            'warnings_count',       cardinality(v_warnings)
        ),
        v_sys
    )
    ON CONFLICT (tenant_id, blueprint_code) DO UPDATE
       SET applied_version  = EXCLUDED.applied_version,
           applied_at       = EXCLUDED.applied_at,
           applied_by       = EXCLUDED.applied_by,
           status           = EXCLUDED.status,
           error_detail     = EXCLUDED.error_detail,
           metadata         = EXCLUDED.metadata;

    IF cardinality(v_warnings) > 0 THEN
        RAISE WARNING 'pack_ap_non_po applied with warnings for tenant %: %',
            v_tenant_code, array_to_string(v_warnings, '; ');
    ELSE
        RAISE NOTICE 'pack_ap_non_po applied cleanly for tenant % (% profiles, % configs, % events, % templates, % rules)',
            v_tenant_code, v_profile_count, v_config_count,
            v_event_count, v_tpl_count, v_iprr_count;
    END IF;

END $apply_ap_non_po$;
