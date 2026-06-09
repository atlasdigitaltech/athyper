-- ============================================================================
-- 341_payment_terms.sql — Payment term catalog with clauses & discount tiers
-- ============================================================================
-- Tables: master.payment_term, master.payment_term_clause,
--         master.payment_term_discount_tier
-- Scope:  28 terms covering standard, construction, trade, government, lease,
--         subscription, and advanced scenarios (multi-tier discounts,
--         flexible clauses, compound advance+retention, partial release)
-- Depends: platform/099_tenant_bootstrap (tenant must exist)
-- ============================================================================
-- DDL CONSTRAINT REMINDERS (bugs found and fixed from v1):
--   due_date_flexibility: 'FIXED' | 'FLEXIBLE' (NOT 'STRICT')
--   base_event: INVOICE_DATE|GR_DATE|SERVICE_ENTRY_DATE|DELIVERY_DATE|
--               CERTIFIED_DATE|CONTRACT_DATE (NOT 'ORDER_DATE')
--   term_category: standard|construction|government|subscription|lease|trade
--   trigger_event: on_po_approval|on_contract_signing|on_mobilization|
--                  on_first_delivery|on_invoice|on_payment|on_final_acceptance
--   release_event: practical_completion|final_acceptance|dlp_expiry|
--                  warranty_expiry|custom_milestone|gazette_notification
--   recovery_method: pro_rata|lump_sum_first|milestone_based|equal_installment
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_meta    jsonb := '{"_seed": {"pack": "341_org", "version": "2.0.0"}}'::jsonb;
    v_pt_id   uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 1. PAYMENT TERM HEADERS (28 terms)
    -- ══════════════════════════════════════════════════════════════════════

    DROP TABLE IF EXISTS _pt;
    CREATE TEMP TABLE _pt (
        code text, name text, description text,
        applicable_to text, base_event text, due_rule_type text,
        due_days int, due_day_of_month int, grace_days int,
        due_date_flexibility text, business_day_convention text,
        month_offset int, term_category text, installment_count int,
        sort_order int
    ) ON COMMIT DROP;

    INSERT INTO _pt VALUES
    -- ─── IMMEDIATE / CASH ───────────────────────────────────────────────
    ('PT-IMMEDIATE', 'Immediate Payment',        'Due on invoice date (0 days)',
     'BOTH','INVOICE_DATE','NET_DAYS', 0, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 10),
    ('PT-COD',       'Cash on Delivery',         'Due on delivery of goods/services',
     'BOTH','DELIVERY_DATE','COD',     NULL,NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 20),
    ('PT-PREPAID',   'Prepaid / Advance Payment','Full payment before contract execution',
     'PURCHASE','CONTRACT_DATE','PREPAID',NULL,NULL,0,'FIXED',NULL,      NULL,'standard', NULL, 30),
    ('PT-CIA',       'Cash in Advance',          'Payment due before shipment',
     'PURCHASE','INVOICE_DATE','NET_DAYS', 0, NULL, 0,'FIXED',NULL,      NULL,'standard', NULL, 35),

    -- ─── STANDARD NET TERMS ─────────────────────────────────────────────
    ('PT-NET7',      'Net 7 Days',               'Payment due 7 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS', 7, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 100),
    ('PT-NET14',     'Net 14 Days',              'Payment due 14 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS',14, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 105),
    ('PT-NET30',     'Net 30 Days',              'Standard 30-day payment term',
     'BOTH','INVOICE_DATE','NET_DAYS',30, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 110),
    ('PT-NET45',     'Net 45 Days',              'Payment due 45 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS',45, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 115),
    ('PT-NET60',     'Net 60 Days',              'Payment due 60 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS',60, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 120),
    ('PT-NET90',     'Net 90 Days',              'Extended 90-day term for key suppliers',
     'BOTH','INVOICE_DATE','NET_DAYS',90, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 130),
    ('PT-NET120',    'Net 120 Days',             'Extended term for large capital purchases',
     'PURCHASE','INVOICE_DATE','NET_DAYS',120,NULL,0,'FIXED','FOLLOWING',NULL,'standard', NULL, 140),

    -- ─── PAYMENT ON START OF MONTH ──────────────────────────────────────
    ('PT-SOM',       'Start of Month',           'Due on 1st of current month (prepay-style for recurring services)',
     'BOTH','INVOICE_DATE','FIXED_DAY',NULL, 1,  0,'FIXED','PRECEDING', 0,  'standard',    NULL, 155),

    -- ─── END-OF-MONTH TERMS ─────────────────────────────────────────────
    ('PT-EOM',       'End of Month',             'Due at end of invoice month',
     'BOTH','INVOICE_DATE','EOM',     NULL,NULL, 0,'FIXED','FOLLOWING', 0,  'standard', NULL, 200),
    ('PT-EOM30',     'End of Month + 30',        'Due 30 days after end of invoice month',
     'BOTH','INVOICE_DATE','EOM',      30, NULL, 0,'FIXED','FOLLOWING', 0,  'standard', NULL, 210),
    ('PT-EOM60',     'End of Month + 60',        'Due 60 days after end of invoice month',
     'BOTH','INVOICE_DATE','EOM',      60, NULL, 0,'FIXED','FOLLOWING', 0,  'standard', NULL, 220),

    -- ─── FIXED DAY TERMS ────────────────────────────────────────────────
    ('PT-FIXED15',   'Due 15th Next Month',      'Due on 15th of following month',
     'BOTH','INVOICE_DATE','FIXED_DAY',NULL,15,  0,'FIXED','FOLLOWING', 1,  'standard', NULL, 250),

    -- ─── DISCOUNT TERMS (multi-tier) ────────────────────────────────────
    ('PT-2-10-N30',  '2/10 Net 30',             'Classic: 2% discount if paid in 10 days, else net 30',
     'BOTH','INVOICE_DATE','NET_DAYS',30, NULL, 0,'FIXED','FOLLOWING', NULL,'trade',    NULL, 300),
    ('PT-3TIER-N60', '3-Tier Discount Net 60',  '3%/10d, 2%/20d, 1%/30d — else net 60',
     'BOTH','INVOICE_DATE','NET_DAYS',60, NULL, 0,'FIXED','FOLLOWING', NULL,'trade',    NULL, 310),

    -- ─── CONSTRUCTION TERMS (retention + advance) ───────────────────────
    ('PT-CONST-60',  'Construction Net 60',      'Net 60 from certified date, 10% retention → DLP release',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',60,NULL,0,'FIXED','FOLLOWING',NULL,'construction',NULL,400),
    ('PT-CONST-ADV', 'Construction Advance + Retention','15% mobilization advance + 5% retention, both clauses',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',45,NULL,0,'FIXED','FOLLOWING',NULL,'construction',NULL,410),
    ('PT-CONST-GOV', 'Construction Government', 'Net 60 from certified, 10% retention, partial 50% at practical completion',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',60,NULL,7,'FIXED','FOLLOWING',NULL,'construction',NULL,420),
    ('PT-CONST-2TR','Construction 2-Tranche Retention',
     'Net 45 from certified, 10% retention: 50% released at PC, 50% released 1yr after PC due 1st of month',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',45,NULL,0,'FIXED','FOLLOWING',NULL,'construction',NULL,430),

    -- ─── MANUFACTURING ADVANCE TERMS ────────────────────────────────────
    ('PT-MFG-ADV',   'Manufacturing 20% Advance','Net 30, 20% advance on PO approval, pro-rata recovery',
     'PURCHASE','INVOICE_DATE','NET_DAYS',30,NULL, 0,'FIXED','FOLLOWING',NULL,'standard',  NULL,500),
    ('PT-MFG-ADV-FLEX','Manufacturing Flexible Advance','Net 30, 10-30% flexible advance, milestone recovery',
     'PURCHASE','INVOICE_DATE','NET_DAYS',30,NULL, 0,'FLEXIBLE','FOLLOWING',NULL,'standard',NULL,510),

    -- ─── GOVERNMENT TERMS ───────────────────────────────────────────────
    ('PT-GOV-60',    'Government Net 60',        'Net 60 from certified date with 7-day grace',
     'BOTH','CERTIFIED_DATE','NET_DAYS',60,NULL, 7,'FIXED','FOLLOWING', NULL,'government', NULL,600),
    ('PT-GOV-90',    'Government Net 90',        'Extended government term with 14-day grace',
     'BOTH','CERTIFIED_DATE','NET_DAYS',90,NULL,14,'FIXED','FOLLOWING', NULL,'government', NULL,610),

    -- ─── LEASE TERMS ────────────────────────────────────────────────────
    ('PT-LEASE-MTH', 'Monthly Lease',            'Due 1st of each month, starting next month',
     'BOTH','INVOICE_DATE','FIXED_DAY',NULL, 1,  0,'FIXED','FOLLOWING', 1,  'lease',      NULL,700),

    -- ─── SUBSCRIPTION TERMS ─────────────────────────────────────────────
    ('PT-SUB-ANNUAL','Annual Subscription',      'Due on invoice date, single payment, NET 0',
     'SALE','INVOICE_DATE','NET_DAYS',  0, NULL, 0,'FIXED',NULL,        NULL,'subscription',1,  800);


    -- trg_pt_immutable and trg_ptc_immutable block business-column changes when the
    -- parent term status is not draft. Set existing active terms to draft first so
    -- the upserts below (and all clause/tier upserts that follow) are permitted.
    UPDATE master.payment_term
       SET status = 'draft', updated_at = now(), updated_by = v_su
     WHERE tenant_id = v_tid
       AND code IN (SELECT code FROM _pt)
       AND version = 1
       AND status != 'draft';

    -- UPSERT into master.payment_term
    INSERT INTO master.payment_term
        (tenant_id, code, name, description,
         applicable_to, base_event, due_rule_type,
         due_days, due_day_of_month, grace_days,
         due_date_flexibility, business_day_convention, holiday_calendar_id,
         month_offset, term_category, installment_count,
         version, is_current_version, effective_from,
         sort_order, metadata, status, created_by)
    SELECT
        v_tid, s.code, s.name, s.description,
        s.applicable_to, s.base_event, s.due_rule_type,
        s.due_days, s.due_day_of_month, s.grace_days,
        s.due_date_flexibility, s.business_day_convention, NULL,
        COALESCE(s.month_offset, 0), s.term_category, s.installment_count,
        1, true, '2025-01-01'::date,
        s.sort_order, v_meta, 'draft', v_su
    FROM _pt s
    ON CONFLICT ON CONSTRAINT pt_tenant_code_ver_uq DO UPDATE SET
        name                    = EXCLUDED.name,
        description             = EXCLUDED.description,
        applicable_to           = EXCLUDED.applicable_to,
        base_event              = EXCLUDED.base_event,
        due_rule_type           = EXCLUDED.due_rule_type,
        due_days                = EXCLUDED.due_days,
        due_day_of_month        = EXCLUDED.due_day_of_month,
        grace_days              = EXCLUDED.grace_days,
        due_date_flexibility    = EXCLUDED.due_date_flexibility,
        business_day_convention = EXCLUDED.business_day_convention,
        month_offset            = EXCLUDED.month_offset,
        term_category           = EXCLUDED.term_category,
        installment_count       = EXCLUDED.installment_count,
        sort_order              = EXCLUDED.sort_order,
        metadata                = EXCLUDED.metadata,
        updated_at              = now(),
        updated_by              = v_su
    WHERE (master.payment_term.name, master.payment_term.description,
           master.payment_term.applicable_to, master.payment_term.base_event,
           master.payment_term.due_rule_type, master.payment_term.due_days,
           master.payment_term.due_day_of_month, master.payment_term.grace_days,
           master.payment_term.due_date_flexibility, master.payment_term.business_day_convention,
           master.payment_term.month_offset, master.payment_term.term_category,
           master.payment_term.installment_count, master.payment_term.sort_order,
           master.payment_term.metadata)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.applicable_to, EXCLUDED.base_event,
           EXCLUDED.due_rule_type, EXCLUDED.due_days,
           EXCLUDED.due_day_of_month, EXCLUDED.grace_days,
           EXCLUDED.due_date_flexibility, EXCLUDED.business_day_convention,
           EXCLUDED.month_offset, EXCLUDED.term_category,
           EXCLUDED.installment_count, EXCLUDED.sort_order,
           EXCLUDED.metadata);


    -- ══════════════════════════════════════════════════════════════════════
    -- 2. CLAUSES — Phase A: ADVANCE and RETENTION (no settles reference)
    -- ══════════════════════════════════════════════════════════════════════

    -- ── PT-CONST-60: 10% retention ──────────────────────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-60' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-10', 'RETENTION', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 10.00, 'FIXED',
         'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        sequence_no   = EXCLUDED.sequence_no,
        default_pct   = EXCLUDED.default_pct,
        trigger_event = EXCLUDED.trigger_event,
        updated_at    = now(), updated_by = v_su
    WHERE (master.payment_term_clause.default_pct,
           master.payment_term_clause.trigger_event,
           master.payment_term_clause.sequence_no)
       IS DISTINCT FROM
          (EXCLUDED.default_pct,
           EXCLUDED.trigger_event,
           EXCLUDED.sequence_no);

    -- ── PT-CONST-ADV: 15% mobilization advance + 5% retention ──────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES
    (v_tid, v_pt_id, 'ADV-15', 'ADVANCE', 1,
     NULL, 'HEADER', 'GROSS', 'PERCENT', 15.00, 'FIXED',
     'on_mobilization', v_meta, true, v_su),
    (v_tid, v_pt_id, 'RET-5', 'RETENTION', 2,
     NULL, 'HEADER', 'GROSS', 'PERCENT', 5.00, 'FIXED',
     'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        sequence_no   = EXCLUDED.sequence_no,
        default_pct   = EXCLUDED.default_pct,
        trigger_event = EXCLUDED.trigger_event,
        updated_at    = now(), updated_by = v_su
    WHERE (master.payment_term_clause.default_pct,
           master.payment_term_clause.trigger_event,
           master.payment_term_clause.sequence_no)
       IS DISTINCT FROM
          (EXCLUDED.default_pct,
           EXCLUDED.trigger_event,
           EXCLUDED.sequence_no);

    -- ── PT-CONST-GOV: 10% retention with 50% partial release ───────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-GOV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-10-GOV', 'RETENTION', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 10.00, 'FIXED',
         'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        sequence_no   = EXCLUDED.sequence_no,
        default_pct   = EXCLUDED.default_pct,
        trigger_event = EXCLUDED.trigger_event,
        updated_at    = now(), updated_by = v_su
    WHERE (master.payment_term_clause.default_pct,
           master.payment_term_clause.trigger_event,
           master.payment_term_clause.sequence_no)
       IS DISTINCT FROM
          (EXCLUDED.default_pct,
           EXCLUDED.trigger_event,
           EXCLUDED.sequence_no);

    -- ── PT-CONST-2TR: 10% retention ────────────────────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-2TR' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-10-2TR', 'RETENTION', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 10.00, 'FIXED',
         'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        sequence_no   = EXCLUDED.sequence_no,
        default_pct   = EXCLUDED.default_pct,
        trigger_event = EXCLUDED.trigger_event,
        updated_at    = now(), updated_by = v_su
    WHERE (master.payment_term_clause.default_pct,
           master.payment_term_clause.trigger_event,
           master.payment_term_clause.sequence_no)
       IS DISTINCT FROM
          (EXCLUDED.default_pct,
           EXCLUDED.trigger_event,
           EXCLUDED.sequence_no);

    -- ── PT-MFG-ADV: 20% advance ────────────────────────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-20', 'ADVANCE', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 20.00, 'FIXED',
         'on_po_approval', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        sequence_no   = EXCLUDED.sequence_no,
        default_pct   = EXCLUDED.default_pct,
        trigger_event = EXCLUDED.trigger_event,
        updated_at    = now(), updated_by = v_su
    WHERE (master.payment_term_clause.default_pct,
           master.payment_term_clause.trigger_event,
           master.payment_term_clause.sequence_no)
       IS DISTINCT FROM
          (EXCLUDED.default_pct,
           EXCLUDED.trigger_event,
           EXCLUDED.sequence_no);

    -- ── PT-MFG-ADV-FLEX: 10-30% flexible advance ───────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV-FLEX' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         min_pct, max_pct,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-FLEX', 'ADVANCE', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 20.00, 'FLEXIBLE',
         10.00, 30.00,
         'on_po_approval', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        default_pct = EXCLUDED.default_pct,
        min_pct = EXCLUDED.min_pct, max_pct = EXCLUDED.max_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.default_pct,
           master.payment_term_clause.min_pct, master.payment_term_clause.max_pct)
       IS DISTINCT FROM
          (EXCLUDED.default_pct, EXCLUDED.min_pct, EXCLUDED.max_pct);


    -- ══════════════════════════════════════════════════════════════════════
    -- 3. CLAUSES — Phase B: RECOVERY and RELEASE (settles references)
    -- ══════════════════════════════════════════════════════════════════════

    -- ── PT-CONST-60: retention release at DLP expiry (180 days) ─────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-60' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE', 'RETENTION_RELEASE', 2,
         'RET-10', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'dlp_expiry', 180,
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        sequence_no         = EXCLUDED.sequence_no,
        default_pct         = EXCLUDED.default_pct,
        release_event       = EXCLUDED.release_event,
        release_delay_days  = EXCLUDED.release_delay_days,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.sequence_no)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code,
           EXCLUDED.default_pct,
           EXCLUDED.release_event,
           EXCLUDED.release_delay_days,
           EXCLUDED.sequence_no);

    -- ── PT-CONST-ADV: advance recovery (pro-rata) + retention release ───
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         recovery_method,
         recovery_start_after_pct, recovery_end_before_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-RECOVER', 'ADVANCE_RECOVERY', 3,
         'ADV-15', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'pro_rata',
         10.00, 90.00,  -- recover between 10% and 90% completion
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code          = EXCLUDED.settles_clause_code,
        recovery_method              = EXCLUDED.recovery_method,
        recovery_start_after_pct     = EXCLUDED.recovery_start_after_pct,
        recovery_end_before_pct      = EXCLUDED.recovery_end_before_pct,
        default_pct                  = EXCLUDED.default_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.recovery_method,
           master.payment_term_clause.recovery_start_after_pct,
           master.payment_term_clause.recovery_end_before_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.recovery_method,
           EXCLUDED.recovery_start_after_pct, EXCLUDED.recovery_end_before_pct);

    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE-ADV', 'RETENTION_RELEASE', 4,
         'RET-5', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'warranty_expiry', 365,  -- 1 year warranty period
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        sequence_no         = EXCLUDED.sequence_no,
        default_pct         = EXCLUDED.default_pct,
        release_event       = EXCLUDED.release_event,
        release_delay_days  = EXCLUDED.release_delay_days,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.sequence_no)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code,
           EXCLUDED.default_pct,
           EXCLUDED.release_event,
           EXCLUDED.release_delay_days,
           EXCLUDED.sequence_no);

    -- ── PT-CONST-GOV: Two-tranche retention release ───────────────────
    -- Tranche A: 50% of retention released at practical completion (immediate)
    -- Tranche B: 50% of retention released 1 year after practical completion,
    --            due on 1st of the following month
    -- Both settle the same RET-10-GOV retention clause.
    -- The engine sums released amounts across tranches — total cannot exceed
    -- the original retained amount (enforced by cumulative_cap_pct = 50 each).
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-GOV' AND version = 1;

    -- Tranche A: 50% at practical completion
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE-50A', 'RETENTION_RELEASE', 2,
         'RET-10-GOV', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 0,   -- immediate release at PC
         50.00,                       -- cap: cannot exceed 50% of retained amount
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct);

    -- Tranche B: 50% at 1 year after practical completion, 1st of month
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE-50B', 'RETENTION_RELEASE', 3,
         'RET-10-GOV', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 365, -- 1 year after practical completion
         100.00,                      -- cumulative cap: full retention now released
         '{"_seed": {"pack": "341_org", "version": "2.0.0", "due_day_rule": "first_of_following_month"}}'::jsonb,
         true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        metadata = EXCLUDED.metadata,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct,
           master.payment_term_clause.metadata)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct, EXCLUDED.metadata);

    -- ── PT-CONST-2TR: Two-tranche retention release ────────────────────
    -- Tranche A: 50% of retention released at practical completion
    -- Tranche B: 50% released 1 year after PC, due 1st of following month
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-2TR' AND version = 1;

    -- Tranche A: 50% at practical completion (immediate)
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-REL-PC', 'RETENTION_RELEASE', 2,
         'RET-10-2TR', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 0,
         50.00,
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct);

    -- Tranche B: 50% at 1 year after PC, due 1st of following month
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-REL-1YR', 'RETENTION_RELEASE', 3,
         'RET-10-2TR', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 365,
         100.00,
         '{"_seed": {"pack": "341_org", "version": "2.0.0", "due_day_rule": "first_of_following_month"}}'::jsonb,
         true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        metadata = EXCLUDED.metadata,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct,
           master.payment_term_clause.metadata)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct, EXCLUDED.metadata);

    -- ── PT-MFG-ADV: advance recovery (pro-rata from each invoice) ───────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         recovery_method,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-RECOVER', 'ADVANCE_RECOVERY', 2,
         'ADV-20', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'pro_rata',
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        recovery_method     = EXCLUDED.recovery_method,
        default_pct         = EXCLUDED.default_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.recovery_method,
           master.payment_term_clause.default_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.recovery_method,
           EXCLUDED.default_pct);

    -- ── PT-MFG-ADV-FLEX: milestone-based recovery ──────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV-FLEX' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         recovery_method,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-RECOVER-FLEX', 'ADVANCE_RECOVERY', 2,
         'ADV-FLEX', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'milestone_based',
         100.00,  -- cap at 100% of advance
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        recovery_method = EXCLUDED.recovery_method,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.recovery_method,
           master.payment_term_clause.cumulative_cap_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.recovery_method,
           EXCLUDED.cumulative_cap_pct);


    -- ══════════════════════════════════════════════════════════════════════
    -- 4. DISCOUNT TIERS
    -- ══════════════════════════════════════════════════════════════════════

    -- ── PT-2-10-N30: single tier — 2% within 10 days ───────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-2-10-N30' AND version = 1;
    INSERT INTO master.payment_term_discount_tier
        (tenant_id, payment_term_id, tier_no, qualify_within_days,
         discount_pct, discount_fixed, discount_basis_mode, is_best_only,
         metadata, created_by)
    VALUES (v_tid, v_pt_id, 1, 10, 2.00, NULL, 'GROSS', true, v_meta, v_su)
    ON CONFLICT (payment_term_id, tier_no) DO UPDATE SET
        qualify_within_days = EXCLUDED.qualify_within_days,
        discount_pct = EXCLUDED.discount_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_discount_tier.qualify_within_days,
           master.payment_term_discount_tier.discount_pct)
       IS DISTINCT FROM
          (EXCLUDED.qualify_within_days, EXCLUDED.discount_pct);

    -- ── PT-3TIER-N60: 3 tiers — 3%/10d, 2%/20d, 1%/30d ────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-3TIER-N60' AND version = 1;
    INSERT INTO master.payment_term_discount_tier
        (tenant_id, payment_term_id, tier_no, qualify_within_days,
         discount_pct, discount_fixed, discount_basis_mode, is_best_only,
         metadata, created_by)
    VALUES
    (v_tid, v_pt_id, 1, 10, 3.00, NULL, 'GROSS', true, v_meta, v_su),
    (v_tid, v_pt_id, 2, 20, 2.00, NULL, 'GROSS', true, v_meta, v_su),
    (v_tid, v_pt_id, 3, 30, 1.00, NULL, 'GROSS', true, v_meta, v_su)
    ON CONFLICT (payment_term_id, tier_no) DO UPDATE SET
        qualify_within_days = EXCLUDED.qualify_within_days,
        discount_pct = EXCLUDED.discount_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_discount_tier.qualify_within_days,
           master.payment_term_discount_tier.discount_pct)
       IS DISTINCT FROM
          (EXCLUDED.qualify_within_days, EXCLUDED.discount_pct);


    -- Activate all seeded payment terms now that clauses and tiers are set.
    UPDATE master.payment_term
       SET status = 'active', updated_at = now(), updated_by = v_su
     WHERE tenant_id = v_tid
       AND code IN (SELECT code FROM _pt)
       AND version = 1
       AND status = 'draft';

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Total payment terms >= 28
    IF (SELECT count(*) FROM master.payment_term
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org') < 28
    THEN RAISE EXCEPTION '341 FAIL: expected >= 28 payment terms, got %',
        (SELECT count(*) FROM master.payment_term
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org');
    END IF;

    -- A2: All seeded terms are version 1, current, active
    IF EXISTS (
        SELECT code FROM master.payment_term
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org'
          AND (version != 1 OR is_current_version != true OR status != 'active')
    ) THEN RAISE EXCEPTION '341 FAIL: seeded term not v1/current/active'; END IF;

    -- A3: PT-CONST-60 has exactly 2 clauses (RETENTION + RETENTION_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-60' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 2
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-60 expected 2 clauses'; END IF;

    -- A4: PT-CONST-ADV has 4 clauses (ADV + RET + ADV_RECOVER + RET_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-ADV' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 4
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-ADV expected 4 clauses, got %',
        (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id);
    END IF;

    -- A5: PT-CONST-GOV has 3 clauses (RETENTION + 2 tranche RETENTION_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-GOV' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 3
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-GOV expected 3 clauses, got %',
        (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id);
    END IF;

    -- A5b: PT-CONST-2TR has 3 clauses (RETENTION + 2 tranche RETENTION_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-2TR' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 3
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-2TR expected 3 clauses, got %',
        (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id);
    END IF;

    -- A6: PT-MFG-ADV has 2 clauses, PT-MFG-ADV-FLEX has 2 clauses
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 2
    THEN RAISE EXCEPTION '341 FAIL: PT-MFG-ADV expected 2 clauses'; END IF;

    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV-FLEX' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 2
    THEN RAISE EXCEPTION '341 FAIL: PT-MFG-ADV-FLEX expected 2 clauses'; END IF;

    -- A7: PT-2-10-N30 has 1 tier, PT-3TIER-N60 has 3 tiers
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-2-10-N30' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_discount_tier WHERE payment_term_id = v_pt_id) != 1
    THEN RAISE EXCEPTION '341 FAIL: PT-2-10-N30 expected 1 tier'; END IF;

    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-3TIER-N60' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_discount_tier WHERE payment_term_id = v_pt_id) != 3
    THEN RAISE EXCEPTION '341 FAIL: PT-3TIER-N60 expected 3 tiers'; END IF;

    -- A8: Every ADVANCE_RECOVERY settles an ADVANCE, every RETENTION_RELEASE settles a RETENTION
    IF EXISTS (
        SELECT c.clause_code FROM master.payment_term_clause c
        JOIN master.payment_term_clause s
          ON s.payment_term_id = c.payment_term_id AND s.clause_code = c.settles_clause_code
        JOIN master.payment_term p ON p.id = c.payment_term_id
        WHERE p.tenant_id = v_tid
          AND c.clause_type = 'ADVANCE_RECOVERY' AND s.clause_type != 'ADVANCE'
    ) THEN RAISE EXCEPTION '341 FAIL: ADVANCE_RECOVERY settles non-ADVANCE'; END IF;

    IF EXISTS (
        SELECT c.clause_code FROM master.payment_term_clause c
        JOIN master.payment_term_clause s
          ON s.payment_term_id = c.payment_term_id AND s.clause_code = c.settles_clause_code
        JOIN master.payment_term p ON p.id = c.payment_term_id
        WHERE p.tenant_id = v_tid
          AND c.clause_type = 'RETENTION_RELEASE' AND s.clause_type != 'RETENTION'
    ) THEN RAISE EXCEPTION '341 FAIL: RETENTION_RELEASE settles non-RETENTION'; END IF;

    -- A9: Flexible advance has min_pct < max_pct
    IF EXISTS (
        SELECT clause_code FROM master.payment_term_clause c
        JOIN master.payment_term p ON p.id = c.payment_term_id
        WHERE p.tenant_id = v_tid AND c.flexibility_mode = 'FLEXIBLE'
          AND (c.min_pct IS NULL OR c.max_pct IS NULL OR c.min_pct >= c.max_pct)
    ) THEN RAISE EXCEPTION '341 FAIL: FLEXIBLE clause with invalid min/max bounds'; END IF;

    -- A10: DDL constraint compliance
    IF EXISTS (
        SELECT code FROM master.payment_term
        WHERE tenant_id = v_tid AND status = 'active'
          AND due_rule_type = 'NET_DAYS' AND due_days IS NULL
    ) THEN RAISE EXCEPTION '341 FAIL: NET_DAYS with NULL due_days'; END IF;

    IF EXISTS (
        SELECT code FROM master.payment_term
        WHERE tenant_id = v_tid AND status = 'active'
          AND due_rule_type IN ('COD','PREPAID') AND due_days IS NOT NULL
    ) THEN RAISE EXCEPTION '341 FAIL: COD/PREPAID with due_days set'; END IF;

    RAISE NOTICE '341: % payment terms, % clauses, % discount tiers',
        (SELECT count(*) FROM master.payment_term WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org'),
        (SELECT count(*) FROM master.payment_term_clause c
         JOIN master.payment_term p ON c.payment_term_id = p.id
         WHERE p.tenant_id = v_tid AND p.metadata->'_seed'->>'pack' = '341_org'),
        (SELECT count(*) FROM master.payment_term_discount_tier d
         JOIN master.payment_term p ON d.payment_term_id = p.id
         WHERE p.tenant_id = v_tid AND p.metadata->'_seed'->>'pack' = '341_org');
END $seed$;
