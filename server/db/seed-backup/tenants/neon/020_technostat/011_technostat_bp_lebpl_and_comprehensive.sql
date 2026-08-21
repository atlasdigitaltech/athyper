-- ============================================================================
-- FILE:    tenants/neon/020_technostat/011_technostat_bp_lebpl_and_comprehensive.sql
-- Tenant:  technostat (019dedac-e40a-7a67-bd35-d34e3e2bf4bf) / Technostat Group
--
-- Scope (extends 010_technostat_bp_advanced_and_risk.sql):
--
--   Â§LEBPL      legal_entity_business_partner_link
--               4 self_bp rows â€” LE â†” internal BP identity for TKSA/SSK/TEGY/SDTX.
--               This is the ONLY table not covered by any prior seed file.
--
--   Â§SUP-BLK2   supplier_block â€” adds missing block_type variants:
--               CSI @ SDTX : 'procurement' block (active â€” contract renewal hold)
--               GPS         : 'all' block (lifted â€” initial group security vetting hold)
--
--   Â§CUS-BLK2   customer_block â€” adds missing block_type variants:
--               ENI @ TEGY  : 'delivery' block (lifted â€” customs clearance delay)
--               ARD @ TKSA  : 'invoice'  block (active â€” ZATCA ERP integration pending)
--
--   Â§QUAL       UPDATE supplier_qualification + customer_qualification to cover
--               all valid enum values for testing:
--               NTP  supplier: onboarding_status â†’ 'under_review'
--               SCTC customer: credit_status     â†’ 'on_hold'
--               MGI  customer: credit_status     â†’ 'conditional'
--
--   Â§CSSPO-EXP  UPDATE supplier-scoped commodity_category_buy_policy to add missing
--               qualification_status variants:
--               NTP @ TEGY (all categories) â†’ 'expired'  (tax cert lapse)
--               GPS @ SSK  (SC-PROF-AUDIT)  â†’ 'waived'   (emergency procurement)
--
--   Â§RISK-MIT   party_risk_mitigation â€” adds missing mitigation_type variants:
--               'waiver'              (ANIC â€” 6-month ESG policy waiver)
--               'escalation'          (SCTC â€” Board Risk Committee escalation)
--               'conditional_approval'(NTP  â€” existing PO conditional payment approval)
--               'rejection'           (MGI-supplier â€” rejection of scope expansion)
--
--   Â§RISK-EVT   party_risk_review_event â€” adds missing event_type variants:
--               'rejected'   â€” ANIC first-pass submission rejected for insufficient evidence
--               'overridden' â€” SCTC CFO risk-band override for strategic contract
--
-- Full qualification_status coverage after this file:
--   supplier onboarding_status  : pending (SUP-MOTRM3B8 stays in_progress;
--                                          'pending','rejected' not yet demonstrated)
--   customer credit_status      : approved âœ… / on_hold âœ… / conditional âœ…
--   csspo qualification_status  : qualified âœ… / pending âœ… / expired âœ… / waived âœ…
--
-- Block type coverage after this file:
--   supplier_block: payment âœ… / invoice âœ… / procurement âœ… / all âœ…
--   customer_block: credit âœ… / collection âœ… / delivery âœ… / invoice âœ…
--
-- Mitigation type coverage:
--   waiver âœ… / corrective_action âœ… / monitoring âœ… / escalation âœ…
--   conditional_approval âœ… / rejection âœ…
--
-- Review event type coverage:
--   created âœ… / submitted âœ… / approved âœ… / rejected âœ…
--   overridden âœ… / scheduled_review âœ…
--
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING / conditional UPDATE.
-- Depends:    010_technostat_bp_advanced_and_risk.sql
-- ============================================================================


-- ============================================================================
-- Â§LEBPL  legal_entity_business_partner_link
-- Maps each Technostat legal entity to its canonical internal BP identity.
-- self_bp: must link to a business_partner with partner_category = 'internal'.
-- Validated by trigger trg_lebpl_self_bp_guard (per DDL comments in 01b).
-- ============================================================================
DO $lebpl$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    r      record;
BEGIN
    SELECT id INTO v_tid
    FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[lebpl] technostat tenant not found'; END IF;

    -- Loop one company code at a time so each iteration's NOT EXISTS check sees the
    -- rows committed by previous iterations.  A single INSERTâ€¦SELECT evaluates all
    -- NOT EXISTS guards simultaneously (before writing any row), which causes a
    -- constraint violation when two codes share the same legal_entity_id.
    FOR r IN
        SELECT cc.legal_entity_id, bp.id AS bp_id, cc.code AS cc_code
        FROM master.company_code cc
        JOIN master.business_partner bp
            ON bp.tenant_id = v_tid
           AND bp.code = 'INT-' || cc.code
           AND bp.partner_category = 'internal'
        WHERE cc.tenant_id = v_tid
          AND cc.code IN ('TKSA', 'SSK', 'TEGY', 'SDTX')
    LOOP
        INSERT INTO master.legal_entity_business_partner_link
            (tenant_id, legal_entity_id, business_partner_id,
             relationship_type, status, notes, created_by)
        SELECT v_tid, r.legal_entity_id, r.bp_id,
               'self_bp', 'active',
               'Canonical internal BP identity for ' || r.cc_code
                   || ' legal entity â€” seeded by 011_technostat_bp_lebpl_and_comprehensive.',
               v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.legal_entity_business_partner_link
             WHERE tenant_id         = v_tid
               AND legal_entity_id   = r.legal_entity_id
               AND relationship_type = 'self_bp'
               AND status            = 'active'
        );
    END LOOP;

    RAISE NOTICE '[lebpl] legal_entity_business_partner_link self_bp rows seeded';
END $lebpl$;


-- ============================================================================
-- Â§SUP-BLK2  Additional supplier block types
-- CSI @ SDTX : procurement block (active) â€” contract renewal pending committee approval.
-- GPS         : all-types block (lifted 2020-09-15) â€” initial group security vetting hold.
-- ============================================================================
DO $sup_blk2$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_comprehensive_v2"}}'::jsonb;
    v_csi  uuid;
    v_gps  uuid;
    v_has_supplier_qualification  boolean := to_regclass('master.supplier_qualification') IS NOT NULL;
    v_has_supplier_block  boolean := to_regclass('master.supplier_block') IS NOT NULL;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[sup_blk2] technostat tenant not found'; END IF;

    SELECT id INTO v_csi FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SDTX-CSI-001';
    SELECT id INTO v_gps FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-GPS-001';

    -- â”€â”€ CSI @ SDTX: Active procurement block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Contract SOW-2025-CSI-SDTX renewal under SDTX Group Procurement Committee
    -- review. New POs suspended until committee sign-off (expected within 30 days).
    IF v_has_supplier_block AND v_csi IS NOT NULL THEN
        -- Pre-populate supplier_qualification.block_reason BEFORE the INSERT.
        -- Trigger fn_supplier_block_sync fires AFTER INSERT and sets is_blocked=true
        -- for 'procurement'/'all' type active blocks.  The sq_block_reason_chk
        -- constraint (NOT is_blocked OR block_reason IS NOT NULL) fires immediately
        -- inside the trigger, so block_reason must already be non-NULL by that point.
        IF v_has_supplier_qualification THEN
            UPDATE master.supplier_qualification
               SET block_reason = 'Contract SOW-2025-CSI-SDTX renewal pending SDTX '
                                  'Group Procurement Committee approval â€” new POs suspended.',
                   updated_at   = now(),
                   updated_by   = v_sys
             WHERE tenant_id    = v_tid
               AND supplier_id  = v_csi
               AND block_reason IS NULL;
        ELSE
            RAISE NOTICE '[sup_blk2] Skipping supplier_qualification update: table not present in this schema.';
        END IF;

        INSERT INTO master.supplier_block
            (tenant_id, supplier_id, block_type, block_reason,
             blocked_at, blocked_by,
             notes, metadata, status, created_by)
        SELECT
            v_tid, v_csi, 'procurement',
            'Contract SOW-2025-CSI-SDTX renewal under SDTX Group Procurement Committee '
            'review. No new POs may be raised until the renewal SOW is counter-signed. '
            'Existing approved POs and open invoices are unaffected.',
            '2025-04-01 09:00+02'::timestamptz, v_sys,
            'Automated block applied by procurement scheduler on SOW expiry date. '
            'SDTX procurement committee meeting scheduled 2025-04-20. '
            'CSI relationship manager engaged for expedited renewal review.',
            v_meta, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_block
             WHERE tenant_id=v_tid AND supplier_id=v_csi
               AND block_type='procurement' AND lifted_at IS NULL);
    END IF;

    -- â”€â”€ GPS: Historical all-types block (lifted 2020-09-15) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Initial group-wide security and background check vetting during onboarding.
    -- Lifted after satisfactory completion of the group supplier due-diligence review.
    IF v_has_supplier_block AND v_gps IS NOT NULL THEN
        INSERT INTO master.supplier_block
            (tenant_id, supplier_id, block_type, block_reason,
             blocked_at, blocked_by, lifted_at, lifted_by, lift_reason,
             notes, metadata, status, created_by)
        SELECT
            v_tid, v_gps, 'all',
            'Initial Technostat Group supplier onboarding hold. Full procurement, '
            'invoice, and payment block applied pending completion of group security '
            'and background check review for new international supplier.',
            '2020-06-01 08:00+03'::timestamptz, v_sys,
            '2020-09-15 10:00+03'::timestamptz, v_sys,
            'Group Security and Compliance review passed. EY third-party due diligence '
            'report accepted. Technostat Group CFO approved onboarding. All blocks lifted. '
            'GPS approved as strategic global professional services supplier.',
            'Block duration: 106 days. Standard group supplier onboarding hold â€” '
            'applied to all new suppliers above SAR 5M annual spend threshold.',
            v_meta, 'lifted', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_block
             WHERE tenant_id=v_tid AND supplier_id=v_gps
               AND block_type='all');
    END IF;

    RAISE NOTICE '[sup_blk2] supplier_block seeded (CSI procurement active, GPS all lifted)';
END $sup_blk2$;


-- ============================================================================
-- Â§CUS-BLK2  Additional customer block types
-- ENI @ TEGY : delivery block (lifted 2024-11-15) â€” Red Sea customs clearance delay.
-- ARD @ TKSA : invoice block (active) â€” ZATCA Fatoora ERP integration pending.
-- ============================================================================
DO $cus_blk2$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_comprehensive_v2"}}'::jsonb;
    v_eni  uuid;
    v_ard  uuid;
    v_has_customer_block  boolean := to_regclass('master.customer_block') IS NOT NULL;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[cus_blk2] technostat tenant not found'; END IF;

    SELECT id INTO v_eni FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TEGY-ENI-001';
    SELECT id INTO v_ard FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TKSA-ARD-001';

    -- â”€â”€ ENI @ TEGY: Lifted delivery block (Red Sea customs delay) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    IF v_has_customer_block AND v_eni IS NOT NULL THEN
        INSERT INTO master.customer_block
            (tenant_id, customer_id, block_type, block_reason,
             blocked_at, blocked_by, lifted_at, lifted_by, lift_reason,
             notes, metadata, status, created_by)
        SELECT
            v_tid, v_eni, 'delivery',
            'Hardware delivery hold â€” Red Sea trade route disruption affecting '
            'TEGYâ€“ENI project HW consignment (PO TEGY-PO-2024-0441). '
            'Egyptian Customs Authority clearance documentation pending re-routing via Suez.',
            '2024-09-10 08:00+02'::timestamptz, v_sys,
            '2024-11-15 12:00+02'::timestamptz, v_sys,
            'Consignment cleared through Alexandria port 2024-11-14. Updated CBE import '
            'documentation accepted. Delivery block lifted by TEGY logistics coordinator.',
            'Block duration: 66 days. Trade route disruption â€” standard force majeure event. '
            'No credit or relationship impact. SLA penalty waived per contract clause 14.3.',
            v_meta, 'lifted', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id=v_tid AND customer_id=v_eni
               AND block_type='delivery');
    END IF;

    -- â”€â”€ ARD @ TKSA: Active invoice block (ZATCA Fatoora ERP integration) â”€â”€â”€â”€â”€
    IF v_has_customer_block AND v_ard IS NOT NULL THEN
        INSERT INTO master.customer_block
            (tenant_id, customer_id, block_type, block_reason,
             blocked_at, blocked_by,
             notes, metadata, status, created_by)
        SELECT
            v_tid, v_ard, 'invoice',
            'ARD ERP system upgrade to SAP S/4HANA ZATCA-certified e-invoicing '
            'in progress. Manual invoice issuance suspended until TKSA can receive '
            'compliant Fatoora QR-coded e-invoices from ARD''s new ERP integration.',
            '2025-03-01 08:00+03'::timestamptz, v_sys,
            'Technical hold requested by ARD CFO to avoid duplicate invoice processing '
            'during ERP cutover. TKSA AR team processing manual credit notes only. '
            'ARD go-live rescheduled to end of May 2025. Block to be reviewed then.',
            v_meta, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id=v_tid AND customer_id=v_ard
               AND block_type='invoice' AND lifted_at IS NULL);
    END IF;

    RAISE NOTICE '[cus_blk2] customer_block seeded (ENI delivery lifted, ARD invoice active)';
END $cus_blk2$;


-- ============================================================================
-- Â§QUAL  Qualification status diversity
-- Updates specific qualification records to cover all valid enum values for
-- comprehensive testing of status-driven workflows.
--
-- supplier_qualification.onboarding_status valid values:
--   'pending' | 'in_progress' | 'under_review' | 'approved' | 'rejected'
--   009 covers: approved (Ã—10) + in_progress (MOTRM3B8)
--   011 adds:   under_review (NTP â€” active block + expired cert = re-qualification triggered)
--
-- customer_qualification.credit_status valid values:
--   'not_assessed' | 'approved' | 'conditional' | 'on_hold' | 'blocked'
--   008 covers: approved (Ã—10)
--   011 adds:   on_hold (SCTC â€” active collection block + KYC overdue)
--               conditional (MGI customer â€” dual-role netting concentration risk)
-- ============================================================================
DO $qual$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_ntp  uuid;
    v_sctc uuid;
    v_mgi  uuid;
    v_has_supplier_qualification  boolean := to_regclass('master.supplier_qualification') IS NOT NULL;
    v_has_customer_qualification boolean := to_regclass('master.customer_qualification') IS NOT NULL;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[qual] technostat tenant not found'; END IF;

    SELECT id INTO v_ntp  FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TEGY-NTP-001';
    SELECT id INTO v_sctc FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SDTX-SCTC-001';
    SELECT id INTO v_mgi  FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-MGI-001';

    -- NTP: Active invoice block (invoice type -> trigger does NOT set is_blocked) + expired
    -- ETA tax clearance cert -> re-qualification review triggered. No block_reason update
    -- needed here; sq_block_reason_chk only fires when is_blocked=true.
    IF v_has_supplier_qualification AND v_ntp IS NOT NULL THEN
        UPDATE master.supplier_qualification
           SET onboarding_status = 'under_review',
               updated_at = now(),
               updated_by = v_sys
         WHERE tenant_id=v_tid AND supplier_id=v_ntp
           AND onboarding_status != 'rejected';
        RAISE NOTICE '[qual] NTP supplier_qualification -> under_review';
    ELSIF NOT v_has_supplier_qualification THEN
        RAISE NOTICE '[qual] Skipping supplier_qualification updates: table not present in this schema.';
    END IF;

    -- SCTC: Active collection block + KYC overdue -> credit status placed on hold
    IF v_has_customer_qualification AND v_sctc IS NOT NULL THEN
        UPDATE master.customer_qualification
           SET credit_status = 'on_hold',
               dunning_hold_reason = 'KYC re-verification overdue. Collection hold active per '
                    'SDTX compliance policy until UBO declarations are resubmitted and verified.',
                updated_at = now(),
                updated_by = v_sys
         WHERE tenant_id=v_tid AND customer_id=v_sctc;
        RAISE NOTICE '[qual] SCTC customer_qualification -> on_hold';
    ELSIF NOT v_has_customer_qualification THEN
        RAISE NOTICE '[qual] Skipping customer_qualification updates: table not present in this schema.';
    END IF;

    -- MGI customer: Dual-role AP/AR netting concentration risk -> conditional credit approval
    IF v_has_customer_qualification AND v_mgi IS NOT NULL THEN
        UPDATE master.customer_qualification
           SET credit_status = 'conditional',
               dunning_hold_reason = 'Conditional approval: AR collection subordinated to '
                   'monthly AP/AR netting cycle. Credit limit valid only within netting framework. '
                   'Standalone dunning requires Treasury pre-approval.',
               updated_at = now(),
               updated_by = v_sys
         WHERE tenant_id=v_tid AND customer_id=v_mgi;
        RAISE NOTICE '[qual] MGI customer_qualification -> conditional';
    ELSIF NOT v_has_customer_qualification THEN
        RAISE NOTICE '[qual] Skipping customer_qualification updates: table not present in this schema.';
    END IF;

    RAISE NOTICE '[qual] qualification status diversity seeded';
END $qual$;



-- ============================================================================
-- Â§CSSPO-EXP  Spend policy qualification_status diversity
-- commodity_category_buy_policy.metadata.qualification_status valid values:
--   'qualified' | 'pending' | 'expired' | 'waived'
--   010 covers: qualified + pending
--   011 adds:   expired (NTP@TEGY â€” tax cert lapse invalidates spend approvals)
--               waived  (GPS@SSK SC-PROF-AUDIT â€” emergency procurement waiver)
-- ============================================================================
DO $csspo_exp$
DECLARE
    v_tid       uuid;
    v_sys       uuid := '00000000-0000-0000-0000-000000000000';
    v_prof_ntp  uuid;
    v_prof_gps  uuid;
    v_sc_audit  uuid;
    v_rows_exp  integer;
    v_rows_waiv integer;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[csspo_exp] technostat tenant not found'; END IF;

    -- NTP @ TEGY profile
    SELECT p.id INTO v_prof_ntp
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id AND s.tenant_id=v_tid
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.supplier_code='SUP-TEGY-NTP-001' AND cc.code='TEGY';

    -- GPS @ SSK profile
    SELECT p.id INTO v_prof_gps
    FROM master.company_code_supplier_profile p
    JOIN master.supplier s ON s.id=p.supplier_id AND s.tenant_id=v_tid
    JOIN master.company_code cc ON cc.id=p.company_code_id
    WHERE s.supplier_code='SUP-GLB-GPS-001' AND cc.code='SSK';

    -- Audit category ID
    SELECT id INTO v_sc_audit
    FROM master.commodity_category
    WHERE tenant_id=v_tid AND code='SC-PROF-AUDIT';

    -- NTP@TEGY: expire all buy policy rows (tax cert lapsed â†’ invoice block active)
    IF v_prof_ntp IS NOT NULL THEN
        UPDATE control.commodity_category_buy_policy
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('qualification_status', 'expired'),
               updated_at = now(),
               updated_by = v_sys
         WHERE tenant_id=v_tid
           AND scope_type = 'SUPPLIER_PROFILE'
           AND scope_id = v_prof_ntp
           AND COALESCE(metadata->>'qualification_status', 'qualified') IN ('qualified', 'pending');
        GET DIAGNOSTICS v_rows_exp = ROW_COUNT;
        RAISE NOTICE '[csspo_exp] NTP@TEGY: % buy policy rows â†’ expired', v_rows_exp;
    END IF;

    -- GPS@SSK SC-PROF-AUDIT: waived for emergency procurement period
    IF v_prof_gps IS NOT NULL AND v_sc_audit IS NOT NULL THEN
        UPDATE control.commodity_category_buy_policy
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('qualification_status', 'waived'),
               updated_at = now(),
               updated_by = v_sys
         WHERE tenant_id=v_tid
           AND scope_type = 'SUPPLIER_PROFILE'
           AND scope_id = v_prof_gps
           AND commodity_category_id = v_sc_audit
           AND COALESCE(metadata->>'qualification_status', 'qualified') = 'qualified';
        GET DIAGNOSTICS v_rows_waiv = ROW_COUNT;
        RAISE NOTICE '[csspo_exp] GPS@SSK SC-PROF-AUDIT: % row(s) â†’ waived', v_rows_waiv;
    END IF;

    RAISE NOTICE '[csspo_exp] CSSPO qualification_status diversity seeded';
END $csspo_exp$;


-- ============================================================================
-- Â§RISK-MIT  Additional party_risk_mitigation types
-- Adds the four mitigation_type variants not yet present in 010:
--   'waiver'              â€” ANIC ESG documentation waiver (6-month grace)
--   'escalation'          â€” SCTC PEP/KYC escalated to Board Risk Committee
--   'conditional_approval'â€” NTP payment approval for existing POs only (during block)
--   'rejection'           â€” MGI supplier: scope expansion rejected by risk committee
-- ============================================================================
-- ============================================================================
-- Â§RISK-MIT  Additional party_risk_mitigation types
-- Adds the four mitigation_type variants not yet present in 010:
--   'waiver'              â€” ANIC ESG documentation waiver (6-month grace)
--   'escalation'          â€” SCTC PEP/KYC escalated to Board Risk Committee
--   'conditional_approval'â€” NTP payment approval for existing POs only (during block)
--   'rejection'           â€” MGI supplier: scope expansion rejected by risk committee
-- ============================================================================
DO $risk_mit$
DECLARE
    v_tid       uuid;
    v_actor     uuid;
    v_bp_anic   uuid; v_ass_anic uuid;
    v_bp_sctc   uuid; v_ass_sctc uuid;
    v_bp_ntp    uuid; v_ass_ntp  uuid;
    v_bp_mgi    uuid; v_ass_mgi  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[risk_mit] technostat tenant not found'; END IF;

    -- Resolve BPs
    SELECT id INTO v_bp_anic FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-02';
    SELECT id INTO v_bp_sctc FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-02';
    SELECT id INTO v_bp_ntp  FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-EGY-01';
    SELECT id INTO v_bp_mgi  FROM master.business_partner WHERE tenant_id=v_tid AND code='BOTH-GLB-01';

    -- Resolve assessments (look up approved supplier/customer assessments from 010)
    SELECT id INTO v_ass_anic
    FROM master.party_risk_assessment
    WHERE tenant_id=v_tid AND subject_type='supplier'
      AND business_partner_id=v_bp_anic AND status='approved'
    ORDER BY version DESC LIMIT 1;

    SELECT id INTO v_ass_sctc
    FROM master.party_risk_assessment
    WHERE tenant_id=v_tid AND subject_type='customer'
      AND business_partner_id=v_bp_sctc AND status='approved'
    ORDER BY version DESC LIMIT 1;

    SELECT id INTO v_ass_ntp
    FROM master.party_risk_assessment
    WHERE tenant_id=v_tid AND subject_type='supplier'
      AND business_partner_id=v_bp_ntp AND status='approved'
    ORDER BY version DESC LIMIT 1;

    SELECT id INTO v_ass_mgi
    FROM master.party_risk_assessment
    WHERE tenant_id=v_tid AND subject_type='supplier'
      AND business_partner_id=v_bp_mgi AND status='approved'
    ORDER BY version DESC LIMIT 1;

    SELECT id INTO v_actor
    FROM master.principal
    WHERE tenant_id=v_tid AND status='active'
    ORDER BY code LIMIT 1;

    IF v_actor IS NULL THEN
        RAISE NOTICE '[risk_mit] Skipping party_risk_mitigation rows: no active principal in tenant.';
    END IF;

    IF v_actor IS NOT NULL AND v_ass_anic IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_anic, v_ass_anic, 'waiver',
            'ESG Documentation Waiver â€” ANIC 6-Month Grace Period',
            'SSK Procurement Committee granted a 6-month waiver of the ESG Policy Document '
            'submission requirement. Rationale: ANIC is a construction-sector SME with no '
            'prior ESG programme; the corrective action plan (monitoring mitigation) is already '
            'in place and adequately controls the risk. Waiver is one-time and expires Sep 2025. '
            'ESG score threshold of 45 applies from Oct 2025 onwards.',
            'approved', '2025-09-30'::date, v_actor, v_actor, '2025-03-05 16:00+03'::timestamptz, v_actor
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_anic
               AND mitigation_type='waiver');
    END IF;

    IF v_actor IS NOT NULL AND v_ass_sctc IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_sctc, v_ass_sctc, 'escalation',
            'SDTX Board Risk Committee Escalation â€” SCTC PEP & KYC',
            'High-risk designation (PEP + KYC non-renewal) escalated to SDTX Board Risk Committee (BRC) '
            'as required by SDTX AML policy for government-affiliated entities with PEP exposure. '
            'BRC to determine whether to continue or exit the SCTC customer relationship at '
            'their Q2 2025 meeting. Outcome required before collection block can be lifted.',
            'in_progress', '2025-06-30'::date, v_actor, v_actor, '2025-02-28 16:00+02'::timestamptz, v_actor
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_sctc
               AND mitigation_type='escalation');
    END IF;

    IF v_actor IS NOT NULL AND v_ass_ntp IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_ntp, v_ass_ntp, 'conditional_approval',
            'Conditional Payment Approval â€” NTP Existing POs Only',
            'TEGY CFO conditionally approved payment processing for invoices under '
            'pre-existing POs (issued before 2025-04-01) only. New PO issuance and '
            'new invoice posting remain blocked until ETA tax clearance certificate is renewed. '
            'Condition expires 2025-06-30 regardless of renewal status. Finance team to monitor '
            'outstanding PO balance (EGP ~3.2M) against this window.',
            'approved', '2025-06-30'::date, v_actor, v_actor, '2025-04-15 15:00+02'::timestamptz, v_actor
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_ntp
               AND mitigation_type='conditional_approval');
    END IF;

    IF v_actor IS NOT NULL AND v_ass_mgi IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_mgi, v_ass_mgi, 'rejection',
            'Rejection â€” MGI Scope Expansion to Critical Infrastructure Projects',
            'Group Risk Committee rejected the proposed scope expansion for MGI to cover '
            'TKSA critical infrastructure projects (datacentre build-out). Rationale: '
            'medium risk band (score 68), dual-role AP/AR netting exposure, and insufficient '
            'ISMS/ISO 27001 certification for critical-infrastructure classification. '
            'Current managed-services and consulting scope remains approved. Expansion '
            'may be resubmitted after ISO 27001 certification (expected Q4 2025).',
            'approved', NULL, v_actor, v_actor, '2025-03-15 11:00+03'::timestamptz, v_actor
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_mgi
               AND mitigation_type='rejection');
    END IF;

    RAISE NOTICE '[risk_mit] party_risk_mitigation diversity seeded (waiver/escalation/conditional_approval/rejection)';
END $risk_mit$;


-- ============================================================================
-- Â§RISK-EVT  Additional party_risk_review_event types
-- Adds 'rejected' and 'overridden' event_type variants for complete coverage.
-- ============================================================================
DO $risk_evt$
DECLARE
    v_tid     uuid;
    v_actor   uuid;
    v_bp_anic uuid; v_ass_anic uuid;
    v_bp_sctc uuid; v_ass_sctc uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[risk_evt] technostat tenant not found'; END IF;

    SELECT id INTO v_bp_anic FROM master.business_partner WHERE tenant_id=v_tid AND code='SUP-KSA-02';
    SELECT id INTO v_bp_sctc FROM master.business_partner WHERE tenant_id=v_tid AND code='CUS-EGY-02';

    SELECT id INTO v_ass_anic
    FROM master.party_risk_assessment
    WHERE tenant_id=v_tid AND subject_type='supplier'
      AND business_partner_id=v_bp_anic AND status='approved'
    ORDER BY version DESC LIMIT 1;

    SELECT id INTO v_ass_sctc
    FROM master.party_risk_assessment
    WHERE tenant_id=v_tid AND subject_type='customer'
      AND business_partner_id=v_bp_sctc AND status='approved'
    ORDER BY version DESC LIMIT 1;

    SELECT id INTO v_actor
    FROM master.principal
    WHERE tenant_id=v_tid AND status='active'
    ORDER BY code LIMIT 1;

    IF v_actor IS NULL THEN
        RAISE NOTICE '[risk_evt] Skipping party_risk_review_event rows: no active principal in tenant.';
    END IF;

    IF v_actor IS NOT NULL AND v_ass_anic IS NOT NULL THEN
        INSERT INTO master.party_risk_review_event
            (tenant_id, assessment_id, event_type, actor_id, actor_type,
             prior_status, new_status, prior_risk_band, new_risk_band, comment, created_at)
        SELECT v_tid, v_ass_anic, 'submitted', v_actor, 'user',
            'draft', 'pending_review', NULL, NULL,
            'First submission by risk analyst. ESG evidence section incomplete â€” '
            'questionnaire not yet received from ANIC.',
            '2025-03-01 08:00+03'::timestamptz
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_review_event
             WHERE tenant_id=v_tid AND assessment_id=v_ass_anic
               AND event_type='submitted'
               AND created_at = '2025-03-01 08:00+03'::timestamptz);
    END IF;

    IF v_actor IS NOT NULL AND v_ass_anic IS NOT NULL THEN
        INSERT INTO master.party_risk_review_event
            (tenant_id, assessment_id, event_type, actor_id, actor_type,
             prior_status, new_status, prior_risk_band, new_risk_band, comment, created_at)
        SELECT v_tid, v_ass_anic, 'rejected', v_actor, 'user',
            'pending_review', 'draft', NULL, NULL,
            'Rejected by SSK Procurement Manager. Reason: ESG dimension coverage only 60% â€” '
            'ANIC self-assessment questionnaire not submitted. Assessment returned to draft '
            'for evidence completion before resubmission. ANIC compliance contact notified.',
            '2025-03-01 10:00+03'::timestamptz
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_review_event
             WHERE tenant_id=v_tid AND assessment_id=v_ass_anic
               AND event_type='rejected');
    END IF;

    IF v_actor IS NOT NULL AND v_ass_sctc IS NOT NULL THEN
        INSERT INTO master.party_risk_review_event
            (tenant_id, assessment_id, event_type, actor_id, actor_type,
             prior_status, new_status, prior_risk_band, new_risk_band, comment, created_at)
        SELECT v_tid, v_ass_sctc, 'overridden', v_actor, 'user',
            'approved', 'approved', 'high', 'high',
            'CFO override â€” SDTX strategic contract SCTC-ICT-2025 (EGP 12,000,000 Suez Canal '
            'ICT Modernisation). High risk band acknowledged and accepted in writing per SDTX '
            'Board Risk Committee minute BRC-2025-003 dated 2025-03-10. Collection block '
            'maintained; individual contract invoices approved via CFO sign-off workflow. '
            'Override is contract-specific; global collection block and KYC hold remain active.',
            '2025-03-12 14:00+02'::timestamptz
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_review_event
             WHERE tenant_id=v_tid AND assessment_id=v_ass_sctc
               AND event_type='overridden');
    END IF;

    RAISE NOTICE '[risk_evt] party_risk_review_event diversity seeded (rejected + overridden)';
END $risk_evt$;
