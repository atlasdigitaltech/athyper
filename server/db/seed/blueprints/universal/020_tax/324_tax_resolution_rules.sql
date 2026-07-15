-- Universal control.tax_resolution_rule rows (Phase 3c shape — 4 jurisdictional
-- scopes billto/shipto/billfrom/shipfrom, scope_doc_entity_codes as text[],
-- requires_shipto_shipfrom_match/_mismatch predicates).
-- Pattern: one rule per (country × direction). India GST intra/inter-state split
-- is made via the shipto/shipfrom match predicate.
-- Priority convention:
--   200 strict (intra-state India, IGST inter-state)
--   150 inter-state IGST (no jurisdiction match, mismatch predicate)
--   100 country default (intra-country same-side bill/ship)
--    50 fallback / wildcard

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "324_org", "version": "3.0.0"}}'::jsonb;

    -- Doc-entity arrays for purchase chain vs sales chain
    v_pi_arr text[] := ARRAY['purchase_invoice','purchase_order','receipt','service_sheet','purchase_requisition'];
    v_si_arr text[] := ARRAY['sales_invoice','sales_order'];
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- C0: Remove stale rules not in the current canonical set
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM control.tax_resolution_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = '324_org'
      AND code NOT IN (
        'TRR-AE-VAT-INPUT','TRR-AE-VAT-OUTPUT',
        'TRR-SA-VAT-INPUT','TRR-SA-VAT-OUTPUT',
        'TRR-SG-GST-INPUT','TRR-SG-GST-OUTPUT',
        'TRR-GB-VAT-INPUT','TRR-GB-VAT-OUTPUT',
        'TRR-DE-UST-INPUT','TRR-DE-UST-OUTPUT',
        'TRR-JP-CT-INPUT', 'TRR-JP-CT-OUTPUT',
        'TRR-PH-VAT-INPUT','TRR-PH-VAT-OUTPUT',
        'TRR-ZA-VAT-INPUT','TRR-ZA-VAT-OUTPUT',
        'TRR-TW-VAT-INPUT','TRR-TW-VAT-OUTPUT',
        'TRR-CA-HST-INPUT','TRR-CA-HST-OUTPUT',
        'TRR-MY-SST-OUTPUT',
        'TRR-US-CA-SALES-OUTPUT',
        'TRR-QA-EXEMPT-INPUT',
        'TRR-IN-TN-GST-INPUT','TRR-IN-MH-GST-INPUT','TRR-IN-IGST-INPUT',
        'TRR-IN-TN-GST-OUTPUT','TRR-IN-MH-GST-OUTPUT','TRR-IN-IGST-OUTPUT'
      );

    -- ══════════════════════════════════════════════════════════════════════
    -- INSERT canonical rules via lookup CTEs that resolve codes to UUIDs.
    -- ══════════════════════════════════════════════════════════════════════
    WITH tj AS (
        SELECT code, id FROM master.tax_jurisdiction WHERE tenant_id = v_tid
    ),
    tg AS (
        SELECT code, id FROM control.tax_group WHERE tenant_id = v_tid
    ),
    -- Columns: code, name, target_tg_code, billto_jur_code, billfrom_jur_code,
    --          shipto_jur_code, shipfrom_jur_code, require_match, require_mismatch,
    --          entity_codes (purchase | sales), priority
    rules(code, name, target_tg, billto_code, billfrom_code, shipto_code, shipfrom_code,
          require_match, require_mismatch, entity_set, priority) AS (VALUES
        -- ─── SINGLE-VAT COUNTRIES (intra-country same-side) ──────────────
        ('TRR-AE-VAT-INPUT',  'AE intra-country Purchase → VAT 5% input',  'TG-AE-VAT-5-IN',
            'TJ-AE','TJ-AE',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-AE-VAT-OUTPUT', 'AE intra-country Sales → VAT 5% output',    'TG-AE-VAT-5-OUT',
            'TJ-AE','TJ-AE',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-SA-VAT-INPUT',  'SA intra-country Purchase → VAT 15% input', 'TG-SA-VAT-15-IN',
            'TJ-SA','TJ-SA',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-SA-VAT-OUTPUT', 'SA intra-country Sales → VAT 15% output',   'TG-SA-VAT-15-OUT',
            'TJ-SA','TJ-SA',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-SG-GST-INPUT',  'SG intra-country Purchase → GST 9% input',  'TG-SG-GST-9-IN',
            'TJ-SG','TJ-SG',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-SG-GST-OUTPUT', 'SG intra-country Sales → GST 9% output',    'TG-SG-GST-9-OUT',
            'TJ-SG','TJ-SG',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-GB-VAT-INPUT',  'GB intra-country Purchase → VAT 20% input', 'TG-GB-VAT-20-IN',
            'TJ-GB','TJ-GB',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-GB-VAT-OUTPUT', 'GB intra-country Sales → VAT 20% output',   'TG-GB-VAT-20-OUT',
            'TJ-GB','TJ-GB',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-DE-UST-INPUT',  'DE intra-country Purchase → USt 19% input', 'TG-DE-UST-19-IN',
            'TJ-DE','TJ-DE',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-DE-UST-OUTPUT', 'DE intra-country Sales → USt 19% output',   'TG-DE-UST-19-OUT',
            'TJ-DE','TJ-DE',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-JP-CT-INPUT',   'JP intra-country Purchase → CT 10% input',  'TG-JP-CT-10-IN',
            'TJ-JP','TJ-JP',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-JP-CT-OUTPUT',  'JP intra-country Sales → CT 10% output',    'TG-JP-CT-10-OUT',
            'TJ-JP','TJ-JP',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-PH-VAT-INPUT',  'PH intra-country Purchase → VAT 12% input', 'TG-PH-VAT-12-IN',
            'TJ-PH','TJ-PH',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-PH-VAT-OUTPUT', 'PH intra-country Sales → VAT 12% output',   'TG-PH-VAT-12-OUT',
            'TJ-PH','TJ-PH',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-ZA-VAT-INPUT',  'ZA intra-country Purchase → VAT 15% input', 'TG-ZA-VAT-15-IN',
            'TJ-ZA','TJ-ZA',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-ZA-VAT-OUTPUT', 'ZA intra-country Sales → VAT 15% output',   'TG-ZA-VAT-15-OUT',
            'TJ-ZA','TJ-ZA',NULL,NULL, false,false, 'sales',    100::smallint),

        ('TRR-TW-VAT-INPUT',  'TW intra-country Purchase → VAT 5% input',  'TG-TW-VAT-5-IN',
            'TJ-TW','TJ-TW',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-TW-VAT-OUTPUT', 'TW intra-country Sales → VAT 5% output',    'TG-TW-VAT-5-OUT',
            'TJ-TW','TJ-TW',NULL,NULL, false,false, 'sales',    100::smallint),

        -- ─── CANADA (HST default) ────────────────────────────────────────
        ('TRR-CA-HST-INPUT',  'CA intra-country Purchase → HST 13% input',  'TG-CA-HST-13-IN',
            'TJ-CA','TJ-CA',NULL,NULL, false,false, 'purchase', 100::smallint),
        ('TRR-CA-HST-OUTPUT', 'CA intra-country Sales → HST 13% output',    'TG-CA-HST-13-OUT',
            'TJ-CA','TJ-CA',NULL,NULL, false,false, 'sales',    100::smallint),

        -- ─── MALAYSIA (SST output only) ──────────────────────────────────
        ('TRR-MY-SST-OUTPUT', 'MY intra-country Sales → SST 10%',           'TG-MY-SST-SALES-10',
            'TJ-MY','TJ-MY',NULL,NULL, false,false, 'sales',    100::smallint),

        -- ─── US California (sub-jurisdiction sales) ──────────────────────
        ('TRR-US-CA-SALES-OUTPUT', 'US-CA Sales → 7.25%',                   'TG-US-CA-SALES',
            'TJ-US-CA','TJ-US-CA',NULL,NULL, false,false, 'sales', 100::smallint),

        -- ─── QATAR (no indirect tax — exempt input) ──────────────────────
        ('TRR-QA-EXEMPT-INPUT', 'QA intra-country Purchase → exempt',       'TG-QA-EXEMPT',
            'TJ-QA','TJ-QA',NULL,NULL, false,false, 'purchase', 100::smallint),

        -- ─── INDIA: intra-state (TN, MH) ─────────────────────────────────
        -- Intra-state: ship-to AND ship-from in same Indian state → CGST + SGST.
        -- Driven by the requires_shipto_shipfrom_match predicate.
        ('TRR-IN-TN-GST-INPUT', 'IN-TN intra-state Purchase → CGST+SGST 18%','TG-IN-TN-GST-18-IN',
            NULL,NULL,'TJ-IN-TN',NULL, true,false, 'purchase', 200::smallint),
        ('TRR-IN-MH-GST-INPUT', 'IN-MH intra-state Purchase → CGST+SGST 18%','TG-IN-MH-GST-18-IN',
            NULL,NULL,'TJ-IN-MH',NULL, true,false, 'purchase', 200::smallint),
        ('TRR-IN-TN-GST-OUTPUT','IN-TN intra-state Sales → CGST+SGST 18%',   'TG-IN-TN-GST-18-OUT',
            NULL,NULL,'TJ-IN-TN',NULL, true,false, 'sales',    200::smallint),
        ('TRR-IN-MH-GST-OUTPUT','IN-MH intra-state Sales → CGST+SGST 18%',   'TG-IN-MH-GST-18-OUT',
            NULL,NULL,'TJ-IN-MH',NULL, true,false, 'sales',    200::smallint),

        -- ─── INDIA: inter-state (mismatch predicate) ─────────────────────
        ('TRR-IN-IGST-INPUT',  'IN inter-state Purchase → IGST 18%',         'TG-IN-IGST-18-IN',
            NULL,NULL,NULL,NULL, false,true,  'purchase', 150::smallint),
        ('TRR-IN-IGST-OUTPUT', 'IN inter-state Sales → IGST 18%',            'TG-IN-IGST-18-OUT',
            NULL,NULL,NULL,NULL, false,true,  'sales',    150::smallint)
    )
    INSERT INTO control.tax_resolution_rule (
        tenant_id, code, name,
        resolved_tax_group_id,
        scope_billto_jurisdiction_id,
        scope_billfrom_jurisdiction_id,
        scope_shipto_jurisdiction_id,
        scope_shipfrom_jurisdiction_id,
        scope_doc_entity_codes,
        requires_shipto_shipfrom_match,
        requires_shipto_shipfrom_mismatch,
        priority,
        effective_from,
        status, created_by, metadata
    )
    SELECT
        v_tid,
        r.code, r.name,
        tg_target.id,
        tj_billto.id,
        tj_billfrom.id,
        tj_shipto.id,
        tj_shipfrom.id,
        CASE r.entity_set
            WHEN 'purchase' THEN v_pi_arr
            WHEN 'sales'    THEN v_si_arr
            ELSE NULL
        END,
        r.require_match,
        r.require_mismatch,
        r.priority,
        '2025-01-01'::date,
        'active', v_su, v_meta
    FROM rules r
    JOIN tg AS tg_target  ON tg_target.code = r.target_tg
    LEFT JOIN tj AS tj_billto   ON tj_billto.code   = r.billto_code
    LEFT JOIN tj AS tj_billfrom ON tj_billfrom.code = r.billfrom_code
    LEFT JOIN tj AS tj_shipto   ON tj_shipto.code   = r.shipto_code
    LEFT JOIN tj AS tj_shipfrom ON tj_shipfrom.code = r.shipfrom_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                              = EXCLUDED.name,
        resolved_tax_group_id             = EXCLUDED.resolved_tax_group_id,
        scope_billto_jurisdiction_id      = EXCLUDED.scope_billto_jurisdiction_id,
        scope_billfrom_jurisdiction_id    = EXCLUDED.scope_billfrom_jurisdiction_id,
        scope_shipto_jurisdiction_id      = EXCLUDED.scope_shipto_jurisdiction_id,
        scope_shipfrom_jurisdiction_id    = EXCLUDED.scope_shipfrom_jurisdiction_id,
        scope_doc_entity_codes            = EXCLUDED.scope_doc_entity_codes,
        requires_shipto_shipfrom_match    = EXCLUDED.requires_shipto_shipfrom_match,
        requires_shipto_shipfrom_mismatch = EXCLUDED.requires_shipto_shipfrom_mismatch,
        priority                          = EXCLUDED.priority,
        updated_at = now(), updated_by = v_su
    WHERE (control.tax_resolution_rule.name,
           control.tax_resolution_rule.resolved_tax_group_id,
           control.tax_resolution_rule.scope_billto_jurisdiction_id,
           control.tax_resolution_rule.scope_billfrom_jurisdiction_id,
           control.tax_resolution_rule.scope_shipto_jurisdiction_id,
           control.tax_resolution_rule.scope_shipfrom_jurisdiction_id,
           control.tax_resolution_rule.scope_doc_entity_codes,
           control.tax_resolution_rule.requires_shipto_shipfrom_match,
           control.tax_resolution_rule.requires_shipto_shipfrom_mismatch,
           control.tax_resolution_rule.priority)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.resolved_tax_group_id,
           EXCLUDED.scope_billto_jurisdiction_id, EXCLUDED.scope_billfrom_jurisdiction_id,
           EXCLUDED.scope_shipto_jurisdiction_id, EXCLUDED.scope_shipfrom_jurisdiction_id,
           EXCLUDED.scope_doc_entity_codes,
           EXCLUDED.requires_shipto_shipfrom_match, EXCLUDED.requires_shipto_shipfrom_mismatch,
           EXCLUDED.priority);

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: minimum rule count
    IF (SELECT count(*) FROM control.tax_resolution_rule WHERE tenant_id = v_tid) < 26
    THEN RAISE EXCEPTION '324 FAIL: expected >=26 resolution rules, got %',
        (SELECT count(*) FROM control.tax_resolution_rule WHERE tenant_id = v_tid);
    END IF;

    -- A2: every active rule resolves to an active tax_group
    IF EXISTS (
        SELECT trr.code FROM control.tax_resolution_rule trr
        LEFT JOIN control.tax_group tg ON tg.id = trr.resolved_tax_group_id AND tg.tenant_id = trr.tenant_id
        WHERE trr.tenant_id = v_tid AND trr.status = 'active'
          AND (tg.id IS NULL OR tg.status <> 'active')
    ) THEN RAISE EXCEPTION '324 FAIL: rule resolves to missing or inactive tax_group: %',
        (SELECT string_agg(trr.code, ', ' ORDER BY trr.code) FROM control.tax_resolution_rule trr
          LEFT JOIN control.tax_group tg ON tg.id = trr.resolved_tax_group_id AND tg.tenant_id = trr.tenant_id
          WHERE trr.tenant_id = v_tid AND trr.status = 'active'
            AND (tg.id IS NULL OR tg.status <> 'active'));
    END IF;

    -- A3: predicate conflict defended by CHECK; verify just in case
    IF EXISTS (
        SELECT 1 FROM control.tax_resolution_rule
        WHERE tenant_id = v_tid
          AND requires_shipto_shipfrom_match AND requires_shipto_shipfrom_mismatch
    ) THEN RAISE EXCEPTION '324 FAIL: rule with both match and mismatch predicates';
    END IF;

    RAISE NOTICE '324: % tax resolution rules seeded (purchase: %, sales: %, intra: %, inter: %)',
        (SELECT count(*) FROM control.tax_resolution_rule WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.tax_resolution_rule
          WHERE tenant_id = v_tid AND 'purchase_invoice' = ANY(scope_doc_entity_codes)),
        (SELECT count(*) FROM control.tax_resolution_rule
          WHERE tenant_id = v_tid AND 'sales_invoice'    = ANY(scope_doc_entity_codes)),
        (SELECT count(*) FROM control.tax_resolution_rule
          WHERE tenant_id = v_tid AND requires_shipto_shipfrom_match),
        (SELECT count(*) FROM control.tax_resolution_rule
          WHERE tenant_id = v_tid AND requires_shipto_shipfrom_mismatch);
END $seed$;
