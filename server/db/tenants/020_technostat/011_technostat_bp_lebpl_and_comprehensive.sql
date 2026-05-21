-- ============================================================================
-- FILE:    040_tenants/020_technostat/011_technostat_bp_lebpl_and_comprehensive.sql
-- Tenant:  technostat (019dedac-e40a-7a67-bd35-d34e3e2bf4bf) / Technostat Group
--
-- Scope (extends 010_technostat_bp_advanced_and_risk.sql):
--
--   §LEBPL      legal_entity_business_partner_link
--               4 self_bp rows — LE ↔ internal BP identity for TKSA/SSK/TEGY/SDTX.
--               This is the ONLY table not covered by any prior seed file.
--
--   §SUP-BLK2   supplier_block — adds missing block_type variants:
--               CSI @ SDTX : 'procurement' block (active — contract renewal hold)
--               GPS         : 'all' block (lifted — initial group security vetting hold)
--
--   §CUS-BLK2   customer_block — adds missing block_type variants:
--               ENI @ TEGY  : 'delivery' block (lifted — customs clearance delay)
--               ARD @ TKSA  : 'invoice'  block (active — ZATCA ERP integration pending)
--
--   §QUAL       UPDATE supplier_qualification + customer_qualification to cover
--               all valid enum values for testing:
--               NTP  supplier: onboarding_status → 'under_review'
--               SCTC customer: credit_status     → 'on_hold'
--               MGI  customer: credit_status     → 'conditional'
--
--   §CSSPO-EXP  UPDATE supplier-scoped commodity_category_buy_policy to add missing
--               qualification_status variants:
--               NTP @ TEGY (all categories) → 'expired'  (tax cert lapse)
--               GPS @ SSK  (SC-PROF-AUDIT)  → 'waived'   (emergency procurement)
--
--   §RISK-MIT   party_risk_mitigation — adds missing mitigation_type variants:
--               'waiver'              (ANIC — 6-month ESG policy waiver)
--               'escalation'          (SCTC — Board Risk Committee escalation)
--               'conditional_approval'(NTP  — existing PO conditional payment approval)
--               'rejection'           (MGI-supplier — rejection of scope expansion)
--
--   §RISK-EVT   party_risk_review_event — adds missing event_type variants:
--               'rejected'   — ANIC first-pass submission rejected for insufficient evidence
--               'overridden' — SCTC CFO risk-band override for strategic contract
--
-- Full qualification_status coverage after this file:
--   supplier onboarding_status  : pending (SUP-MOTRM3B8 stays in_progress;
--                                          'pending','rejected' not yet demonstrated)
--   customer credit_status      : approved ✅ / on_hold ✅ / conditional ✅
--   csspo qualification_status  : qualified ✅ / pending ✅ / expired ✅ / waived ✅
--
-- Block type coverage after this file:
--   supplier_block: payment ✅ / invoice ✅ / procurement ✅ / all ✅
--   customer_block: credit ✅ / collection ✅ / delivery ✅ / invoice ✅
--
-- Mitigation type coverage:
--   waiver ✅ / corrective_action ✅ / monitoring ✅ / escalation ✅
--   conditional_approval ✅ / rejection ✅
--
-- Review event type coverage:
--   created ✅ / submitted ✅ / approved ✅ / rejected ✅
--   overridden ✅ / scheduled_review ✅
--
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING / conditional UPDATE.
-- Depends:    010_technostat_bp_advanced_and_risk.sql
-- ============================================================================


-- ============================================================================
-- §LEBPL  legal_entity_business_partner_link
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
    -- rows committed by previous iterations.  A single INSERT…SELECT evaluates all
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
                   || ' legal entity — seeded by 011_technostat_bp_lebpl_and_comprehensive.',
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
-- §SUP-BLK2  Additional supplier block types
-- CSI @ SDTX : procurement block (active) — contract renewal pending committee approval.
-- GPS         : all-types block (lifted 2020-09-15) — initial group security vetting hold.
-- ============================================================================
DO $sup_blk2$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_comprehensive_v2"}}'::jsonb;
    v_csi  uuid;
    v_gps  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[sup_blk2] technostat tenant not found'; END IF;

    SELECT id INTO v_csi FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-SDTX-CSI-001';
    SELECT id INTO v_gps FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-GLB-GPS-001';

    -- ── CSI @ SDTX: Active procurement block ─────────────────────────────────
    -- Contract SOW-2025-CSI-SDTX renewal under SDTX Group Procurement Committee
    -- review. New POs suspended until committee sign-off (expected within 30 days).
    IF v_csi IS NOT NULL THEN
        -- Pre-populate supplier_qualification.block_reason BEFORE the INSERT.
        -- Trigger fn_supplier_block_sync fires AFTER INSERT and sets is_blocked=true
        -- for 'procurement'/'all' type active blocks.  The sq_block_reason_chk
        -- constraint (NOT is_blocked OR block_reason IS NOT NULL) fires immediately
        -- inside the trigger, so block_reason must already be non-NULL by that point.
        UPDATE master.supplier_qualification
           SET block_reason = 'Contract SOW-2025-CSI-SDTX renewal pending SDTX '
                              'Group Procurement Committee approval — new POs suspended.',
               updated_at   = now(),
               updated_by   = v_sys
         WHERE tenant_id    = v_tid
           AND supplier_id  = v_csi
           AND block_reason IS NULL;

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

    -- ── GPS: Historical all-types block (lifted 2020-09-15) ──────────────────
    -- Initial group-wide security and background check vetting during onboarding.
    -- Lifted after satisfactory completion of the group supplier due-diligence review.
    IF v_gps IS NOT NULL THEN
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
            'Block duration: 106 days. Standard group supplier onboarding hold — '
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
-- §CUS-BLK2  Additional customer block types
-- ENI @ TEGY : delivery block (lifted 2024-11-15) — Red Sea customs clearance delay.
-- ARD @ TKSA : invoice block (active) — ZATCA Fatoora ERP integration pending.
-- ============================================================================
DO $cus_blk2$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed":{"pack":"tksa_bp_comprehensive_v2"}}'::jsonb;
    v_eni  uuid;
    v_ard  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[cus_blk2] technostat tenant not found'; END IF;

    SELECT id INTO v_eni FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TEGY-ENI-001';
    SELECT id INTO v_ard FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-TKSA-ARD-001';

    -- ── ENI @ TEGY: Lifted delivery block (Red Sea customs delay) ─────────────
    IF v_eni IS NOT NULL THEN
        INSERT INTO master.customer_block
            (tenant_id, customer_id, block_type, block_reason,
             blocked_at, blocked_by, lifted_at, lifted_by, lift_reason,
             notes, metadata, status, created_by)
        SELECT
            v_tid, v_eni, 'delivery',
            'Hardware delivery hold — Red Sea trade route disruption affecting '
            'TEGY–ENI project HW consignment (PO TEGY-PO-2024-0441). '
            'Egyptian Customs Authority clearance documentation pending re-routing via Suez.',
            '2024-09-10 08:00+02'::timestamptz, v_sys,
            '2024-11-15 12:00+02'::timestamptz, v_sys,
            'Consignment cleared through Alexandria port 2024-11-14. Updated CBE import '
            'documentation accepted. Delivery block lifted by TEGY logistics coordinator.',
            'Block duration: 66 days. Trade route disruption — standard force majeure event. '
            'No credit or relationship impact. SLA penalty waived per contract clause 14.3.',
            v_meta, 'lifted', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id=v_tid AND customer_id=v_eni
               AND block_type='delivery');
    END IF;

    -- ── ARD @ TKSA: Active invoice block (ZATCA Fatoora ERP integration) ─────
    IF v_ard IS NOT NULL THEN
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
-- §QUAL  Qualification status diversity
-- Updates specific qualification records to cover all valid enum values for
-- comprehensive testing of status-driven workflows.
--
-- supplier_qualification.onboarding_status valid values:
--   'pending' | 'in_progress' | 'under_review' | 'approved' | 'rejected'
--   009 covers: approved (×10) + in_progress (MOTRM3B8)
--   011 adds:   under_review (NTP — active block + expired cert = re-qualification triggered)
--
-- customer_qualification.credit_status valid values:
--   'not_assessed' | 'approved' | 'conditional' | 'on_hold' | 'blocked'
--   008 covers: approved (×10)
--   011 adds:   on_hold (SCTC — active collection block + KYC overdue)
--               conditional (MGI customer — dual-role netting concentration risk)
-- ============================================================================
DO $qual$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_ntp  uuid;
    v_sctc uuid;
    v_mgi  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[qual] technostat tenant not found'; END IF;

    SELECT id INTO v_ntp  FROM master.supplier WHERE tenant_id=v_tid AND supplier_code='SUP-TEGY-NTP-001';
    SELECT id INTO v_sctc FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-SDTX-SCTC-001';
    SELECT id INTO v_mgi  FROM master.customer WHERE tenant_id=v_tid AND customer_code='CUS-GLB-MGI-001';

    -- NTP: Active invoice block (invoice type → trigger does NOT set is_blocked) + expired
    -- ETA tax clearance cert → re-qualification review triggered. No block_reason update
    -- needed here; sq_block_reason_chk only fires when is_blocked=true.
    IF v_ntp IS NOT NULL THEN
        UPDATE master.supplier_qualification
           SET onboarding_status = 'under_review',
               updated_at = now(),
               updated_by = v_sys
         WHERE tenant_id=v_tid AND supplier_id=v_ntp
           AND onboarding_status != 'rejected';
        RAISE NOTICE '[qual] NTP supplier_qualification → under_review';
    END IF;

    -- SCTC: Active collection block + KYC overdue → credit status placed on hold
    IF v_sctc IS NOT NULL THEN
        UPDATE master.customer_qualification
           SET credit_status = 'on_hold',
               dunning_hold_reason = 'KYC re-verification overdue. Collection hold active per '
                   'SDTX compliance policy until UBO declarations are resubmitted and verified.',
               updated_at = now(),
               updated_by = v_sys
         WHERE tenant_id=v_tid AND customer_id=v_sctc;
        RAISE NOTICE '[qual] SCTC customer_qualification → on_hold';
    END IF;

    -- MGI customer: Dual-role AP/AR netting concentration risk → conditional credit approval
    IF v_mgi IS NOT NULL THEN
        UPDATE master.customer_qualification
           SET credit_status = 'conditional',
               dunning_hold_reason = 'Conditional approval: AR collection subordinated to '
                   'monthly AP/AR netting cycle. Credit limit valid only within netting framework. '
                   'Standalone dunning requires Treasury pre-approval.',
               updated_at = now(),
               updated_by = v_sys
         WHERE tenant_id=v_tid AND customer_id=v_mgi;
        RAISE NOTICE '[qual] MGI customer_qualification → conditional';
    END IF;

    RAISE NOTICE '[qual] qualification status diversity seeded';
END $qual$;


-- ============================================================================
-- §CSSPO-EXP  Spend policy qualification_status diversity
-- commodity_category_buy_policy.metadata.qualification_status valid values:
--   'qualified' | 'pending' | 'expired' | 'waived'
--   010 covers: qualified + pending
--   011 adds:   expired (NTP@TEGY — tax cert lapse invalidates spend approvals)
--               waived  (GPS@SSK SC-PROF-AUDIT — emergency procurement waiver)
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
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
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

    -- NTP@TEGY: expire all buy policy rows (tax cert lapsed → invoice block active)
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
        RAISE NOTICE '[csspo_exp] NTP@TEGY: % buy policy rows → expired', v_rows_exp;
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
        RAISE NOTICE '[csspo_exp] GPS@SSK SC-PROF-AUDIT: % row(s) → waived', v_rows_waiv;
    END IF;

    RAISE NOTICE '[csspo_exp] CSSPO qualification_status diversity seeded';
END $csspo_exp$;


-- ============================================================================
-- §RISK-MIT  Additional party_risk_mitigation types
-- Adds the four mitigation_type variants not yet present in 010:
--   'waiver'              — ANIC ESG documentation waiver (6-month grace)
--   'escalation'          — SCTC PEP/KYC escalated to Board Risk Committee
--   'conditional_approval'— NTP payment approval for existing POs only (during block)
--   'rejection'           — MGI supplier: scope expansion rejected by risk committee
-- ============================================================================
DO $risk_mit$
DECLARE
    v_tid       uuid;
    v_sys       uuid := '00000000-0000-0000-0000-000000000000';
    v_bp_anic   uuid; v_ass_anic uuid;
    v_bp_sctc   uuid; v_ass_sctc uuid;
    v_bp_ntp    uuid; v_ass_ntp  uuid;
    v_bp_mgi    uuid; v_ass_mgi  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
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

    -- ── ANIC: 'waiver' — 6-month ESG documentation waiver ───────────────────
    IF v_ass_anic IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_anic, v_ass_anic, 'waiver',
            'ESG Documentation Waiver — ANIC 6-Month Grace Period',
            'SSK Procurement Committee granted a 6-month waiver of the ESG Policy Document '
            'submission requirement. Rationale: ANIC is a construction-sector SME with no '
            'prior ESG programme; the corrective action plan (monitoring mitigation) is already '
            'in place and adequately controls the risk. Waiver is one-time and expires Sep 2025. '
            'ESG score threshold of 45 applies from Oct 2025 onwards.',
            'approved', '2025-09-30'::date, v_sys, v_sys, '2025-03-05 16:00+03'::timestamptz, v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_anic
               AND mitigation_type='waiver');
    END IF;

    -- ── SCTC: 'escalation' — Board Risk Committee escalation ─────────────────
    IF v_ass_sctc IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_sctc, v_ass_sctc, 'escalation',
            'SDTX Board Risk Committee Escalation — SCTC PEP & KYC',
            'High-risk designation (PEP + KYC non-renewal) escalated to SDTX Board Risk '
            'Committee (BRC) as required by SDTX AML policy for government-affiliated entities '
            'with PEP exposure. BRC to determine whether to continue or exit the SCTC customer '
            'relationship at their Q2 2025 meeting. Finance Director and General Counsel to '
            'present risk file. Outcome required before collection block can be lifted.',
            'in_progress', '2025-06-30'::date, v_sys, v_sys, '2025-02-28 16:00+02'::timestamptz, v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_sctc
               AND mitigation_type='escalation');
    END IF;

    -- ── NTP: 'conditional_approval' — existing PO payment approval ───────────
    IF v_ass_ntp IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_ntp, v_ass_ntp, 'conditional_approval',
            'Conditional Payment Approval — NTP Existing POs Only',
            'TEGY CFO conditionally approved payment processing for invoices under '
            'pre-existing POs (issued before 2025-04-01) only. New PO issuance and '
            'new invoice posting remain blocked until ETA tax clearance certificate '
            'is renewed. Condition expires 2025-06-30 regardless of renewal status. '
            'Finance team to monitor outstanding PO balance (EGP ~3.2M) against this window.',
            'approved', '2025-06-30'::date, v_sys, v_sys, '2025-04-15 15:00+02'::timestamptz, v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_ntp
               AND mitigation_type='conditional_approval');
    END IF;

    -- ── MGI supplier: 'rejection' — scope expansion rejected ─────────────────
    IF v_ass_mgi IS NOT NULL THEN
        INSERT INTO master.party_risk_mitigation
            (tenant_id, business_partner_id, assessment_id, mitigation_type,
             title, description, status, due_date, assigned_to, approved_by, approved_at, created_by)
        SELECT v_tid, v_bp_mgi, v_ass_mgi, 'rejection',
            'Rejection — MGI Scope Expansion to Critical Infrastructure Projects',
            'Group Risk Committee rejected the proposed scope expansion for MGI to cover '
            'TKSA critical infrastructure projects (datacentre build-out). Rationale: '
            'medium risk band (score 68), dual-role AP/AR netting exposure, and insufficient '
            'ISMS/ISO 27001 certification for critical-infrastructure classification. '
            'Current managed-services and consulting scope remains approved. Expansion '
            'may be resubmitted after ISO 27001 certification (expected Q4 2025).',
            'approved', NULL, v_sys, v_sys, '2025-03-15 11:00+03'::timestamptz, v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_mitigation
             WHERE tenant_id=v_tid AND assessment_id=v_ass_mgi
               AND mitigation_type='rejection');
    END IF;

    RAISE NOTICE '[risk_mit] party_risk_mitigation diversity seeded (waiver/escalation/conditional_approval/rejection)';
END $risk_mit$;


-- ============================================================================
-- §RISK-EVT  Additional party_risk_review_event types
-- Adds 'rejected' and 'overridden' event_type variants for complete coverage.
--
-- ANIC: First-pass submission was rejected (procurement manager required more
--       questionnaire evidence before the assessment could proceed).
--       Two events added: submitted (v1) + rejected — both timestamp-ordered
--       before the existing submitted (v2) and approved events.
--
-- SCTC: CFO issued a risk-band override for a strategic EGP 12M contract,
--       acknowledging the high risk band in writing (BRC minute BRC-2025-003).
-- ============================================================================
DO $risk_evt$
DECLARE
    v_tid     uuid;
    v_sys     uuid := '00000000-0000-0000-0000-000000000000';
    v_bp_anic uuid; v_ass_anic uuid;
    v_bp_sctc uuid; v_ass_sctc uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key='athyper' AND code='technostat';
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

    -- ── ANIC: First-round submitted event (before rejection) ─────────────────
    IF v_ass_anic IS NOT NULL THEN
        INSERT INTO master.party_risk_review_event
            (tenant_id, assessment_id, event_type, actor_id, actor_type,
             prior_status, new_status, prior_risk_band, new_risk_band, comment, created_at)
        SELECT v_tid, v_ass_anic, 'submitted', v_sys, 'user',
            'draft', 'pending_review', NULL, NULL,
            'First submission by risk analyst. ESG evidence section incomplete — '
            'questionnaire not yet received from ANIC.',
            '2025-03-01 08:00+03'::timestamptz
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_review_event
             WHERE tenant_id=v_tid AND assessment_id=v_ass_anic
               AND event_type='submitted'
               AND created_at = '2025-03-01 08:00+03'::timestamptz);
    END IF;

    -- ── ANIC: Rejected event (first-pass submission kicked back) ─────────────
    IF v_ass_anic IS NOT NULL THEN
        INSERT INTO master.party_risk_review_event
            (tenant_id, assessment_id, event_type, actor_id, actor_type,
             prior_status, new_status, prior_risk_band, new_risk_band, comment, created_at)
        SELECT v_tid, v_ass_anic, 'rejected', v_sys, 'user',
            'pending_review', 'draft', NULL, NULL,
            'Rejected by SSK Procurement Manager. Reason: ESG dimension coverage only 60% — '
            'ANIC self-assessment questionnaire not submitted. Assessment returned to draft '
            'for evidence completion before resubmission. ANIC compliance contact notified.',
            '2025-03-01 10:00+03'::timestamptz
        WHERE NOT EXISTS (
            SELECT 1 FROM master.party_risk_review_event
             WHERE tenant_id=v_tid AND assessment_id=v_ass_anic
               AND event_type='rejected');
    END IF;

    -- ── SCTC: Overridden event (CFO strategic contract exception) ────────────
    IF v_ass_sctc IS NOT NULL THEN
        INSERT INTO master.party_risk_review_event
            (tenant_id, assessment_id, event_type, actor_id, actor_type,
             prior_status, new_status, prior_risk_band, new_risk_band, comment, created_at)
        SELECT v_tid, v_ass_sctc, 'overridden', v_sys, 'user',
            'approved', 'approved', 'high', 'high',
            'CFO override — SDTX strategic contract SCTC-ICT-2025 (EGP 12,000,000 Suez Canal '
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
