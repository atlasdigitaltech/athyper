-- seed-pack-version: 2.0.0
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
    v_su   uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
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

    IF v_su IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id=v_su AND p.tenant_id=v_tid AND p.status='active'
    ) THEN
        RAISE EXCEPTION '[004_pay_groups] active tenant-local seed principal required';
    END IF;

    SELECT cc.id, cc.legal_entity_id INTO v_cc_catl, v_le_catl
    FROM master.company_code cc WHERE cc.tenant_id = v_tid AND cc.code = 'catl' AND cc.status='active';

    IF v_cc_catl IS NULL THEN
        RAISE EXCEPTION '[004_pay_groups] active catl company not found';
    END IF;

    -- ── CATL — permanent staff (GBP · monthly) ────────────────────────────────
    INSERT INTO master.pay_group (
        id, tenant_id, code, name,
        legal_entity_id, company_code_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    ) VALUES
        (md5(format('neon:cirrusatlantic:pay-group:%s:CATL-PG-PERM',v_tid))::uuid,
         v_tid, 'CATL-PG-PERM', 'CirrusAtlantic Permanent Staff Pay',
         v_le_catl, v_cc_catl, 'monthly', 'GBP', 'GB', 'active', v_su),
        (md5(format('neon:cirrusatlantic:pay-group:%s:CATL-PG-CTRC',v_tid))::uuid,
         v_tid, 'CATL-PG-CTRC', 'CirrusAtlantic Contractors Pay',
         v_le_catl, v_cc_catl, 'monthly', 'GBP', 'GB', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name          = EXCLUDED.name,
        pay_frequency = EXCLUDED.pay_frequency,
        currency_code = EXCLUDED.currency_code,
        country_code  = EXCLUDED.country_code,
        status        = EXCLUDED.status,
        updated_at    = now(),
        updated_by    = v_su
    WHERE (master.pay_group.name, master.pay_group.pay_frequency,
           master.pay_group.currency_code, master.pay_group.country_code,
           master.pay_group.status)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.pay_frequency,
           EXCLUDED.currency_code, EXCLUDED.country_code, EXCLUDED.status);

    RAISE NOTICE '[004_pay_groups] 2 pay groups seeded (CATL-PG-PERM, CATL-PG-CTRC)';

END $catl_pay_groups$;
