-- ============================================================================
-- CIRRUSATLANTIC — PAY GROUPS
-- ============================================================================
-- File:     900_principals/004_pay_groups.sql
-- Schema:   master.pay_group
-- Purpose:  Create two pay groups for CirrusAtlantic (CATL, UK entity):
--           one for permanent employees, one for contractors.
--           Both pay monthly in GBP per UK norms.
--
-- Pay groups (2):
--   CATL-PG-PERM  CirrusAtlantic Permanent Staff  monthly  GBP  GB
--   CATL-PG-CTRC  CirrusAtlantic Contractors      monthly  GBP  GB
--
-- Depends:  200_legal_entities.sql
--             → company code: CATL (legal entity dd000030-…)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE throughout
-- ============================================================================

DO $catl_pay_groups$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;

    v_cc_catl  uuid;
    v_le_catl  uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[004_pay_groups] CirrusAtlantic tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT cc.id, cc.legal_entity_id INTO v_cc_catl, v_le_catl
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'CATL';

    -- ── CATL — permanent staff (GBP · monthly) ────────────────────────────────
    INSERT INTO master.pay_group (
        tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES
        (v_tid, 'CATL-PG-PERM', 'CirrusAtlantic Permanent Staff Pay',
         v_le_catl, v_cc_catl, 'monthly', 'GBP', 'GB', 'active', v_su),
        (v_tid, 'CATL-PG-CTRC', 'CirrusAtlantic Contractors Pay',
         v_le_catl, v_cc_catl, 'monthly', 'GBP', 'GB', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su;

    RAISE NOTICE '[004_pay_groups] 2 pay groups seeded (CATL-PG-PERM, CATL-PG-CTRC)';

END $catl_pay_groups$;
