-- ============================================================================
-- 100_apply_period_close_states.sql
--   Apply realistic close-cycle end-states for FY2024-FY2027 across all
--   demo tenants (athyper, technostat, cirrusatlantic).
-- ============================================================================
-- Runs AFTER all JE seeding (200_finance/500) and budget seeding so it sets
-- the final, snapshot-of-today demo state without blocking the upstream
-- INSERT INTO document.journal_entry calls (which require periods open).
--
-- Target end-state (matching the agreed close cadence as of 2026):
--   FY2024     → hard_close   (year fully closed)
--   FY2025     → soft_close   (year recently closed; pre-cert adjustments still
--                              possible — trg_je_period_gate_fn allows posting)
--   FY2026     → open         (current fiscal year — postings active)
--   FY >= 2027 → future       (not yet opened)
--
-- Both gates are updated:
--   • master.fiscal_period.status         — controls hard-close block at FP layer
--   • governance.book_period_status.status — controls posting per (book × period)
--
-- Idempotent: each UPDATE filters out rows already in the target status.
-- ============================================================================

DO $apply_close_states$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant    record;
    v_fp_upd    int;
    v_fp_total  int := 0;
    v_bps_upd   int;
    v_bps_total int := 0;
BEGIN
    FOR v_tenant IN
        SELECT id, code
        FROM   master.tenant
        WHERE  code IN ('athyper', 'technostat', 'cirrusatlantic')
        ORDER  BY code
    LOOP
        RAISE NOTICE '[%] Applying FY2024-2027 close states (tenant_id=%)',
            v_tenant.code, v_tenant.id;

        -- ══════════════════════════════════════════════════════════════════
        -- PART A: master.fiscal_period.status — tiered by fiscal_year
        -- ══════════════════════════════════════════════════════════════════
        UPDATE master.fiscal_period fp
        SET    status     = CASE
                              WHEN fp.fiscal_year = 2024 THEN 'hard_close'
                              WHEN fp.fiscal_year = 2025 THEN 'soft_close'
                              WHEN fp.fiscal_year = 2026 THEN 'open'
                              WHEN fp.fiscal_year >= 2027 THEN 'future'
                            END,
               updated_at = now(),
               updated_by = v_su
        WHERE  fp.tenant_id = v_tenant.id
          AND  fp.fiscal_year >= 2024
          AND  (
                  (fp.fiscal_year = 2024  AND fp.status <> 'hard_close')
               OR (fp.fiscal_year = 2025  AND fp.status <> 'soft_close')
               OR (fp.fiscal_year = 2026  AND fp.status <> 'open')
               OR (fp.fiscal_year >= 2027 AND fp.status <> 'future')
               );

        GET DIAGNOSTICS v_fp_upd = ROW_COUNT;
        v_fp_total := v_fp_total + v_fp_upd;
        RAISE NOTICE '[%] Part A: % fiscal_period rows updated', v_tenant.code, v_fp_upd;

        -- ══════════════════════════════════════════════════════════════════
        -- PART B: governance.book_period_status.status — same tiering
        -- ══════════════════════════════════════════════════════════════════
        -- The je_period_gate trigger blocks posting when BPS is hard_close or
        -- future, so the BPS gate must mirror the FP gate for the demo to feel
        -- consistent (e.g., reports/UI should show FY2024 closed at BOTH layers).
        UPDATE governance.book_period_status bps
        SET    status            = CASE
                                    WHEN bps.fiscal_year = 2024 THEN 'hard_close'
                                    WHEN bps.fiscal_year = 2025 THEN 'soft_close'
                                    WHEN bps.fiscal_year = 2026 THEN 'open'
                                    WHEN bps.fiscal_year >= 2027 THEN 'future'
                                  END,
               hard_closed_at    = CASE
                                    WHEN bps.fiscal_year = 2024
                                     THEN COALESCE(bps.hard_closed_at, now())
                                    ELSE bps.hard_closed_at
                                  END,
               hard_closed_by    = CASE
                                    WHEN bps.fiscal_year = 2024
                                     THEN COALESCE(bps.hard_closed_by, v_su)
                                    ELSE bps.hard_closed_by
                                  END,
               soft_closed_at    = CASE
                                    WHEN bps.fiscal_year = 2025
                                     THEN COALESCE(bps.soft_closed_at, now())
                                    ELSE bps.soft_closed_at
                                  END,
               soft_closed_by    = CASE
                                    WHEN bps.fiscal_year = 2025
                                     THEN COALESCE(bps.soft_closed_by, v_su)
                                    ELSE bps.soft_closed_by
                                  END,
               status_changed_at = now(),
               status_changed_by = v_su,
               updated_at        = now(),
               updated_by        = v_su
        WHERE  bps.tenant_id = v_tenant.id
          AND  bps.fiscal_year >= 2024
          AND  (
                  (bps.fiscal_year = 2024  AND bps.status <> 'hard_close')
               OR (bps.fiscal_year = 2025  AND bps.status <> 'soft_close')
               OR (bps.fiscal_year = 2026  AND bps.status <> 'open')
               OR (bps.fiscal_year >= 2027 AND bps.status <> 'future')
               );

        GET DIAGNOSTICS v_bps_upd = ROW_COUNT;
        v_bps_total := v_bps_total + v_bps_upd;
        RAISE NOTICE '[%] Part B: % book_period_status rows updated',
            v_tenant.code, v_bps_upd;

    END LOOP; -- v_tenant

    -- ══════════════════════════════════════════════════════════════════════
    -- PART C: Assertions — exact match to the agreed close cadence
    -- ══════════════════════════════════════════════════════════════════════

    -- C1: fiscal_period.status matches the tiered rule for all 3 tenants
    IF EXISTS (
        SELECT 1
        FROM   master.fiscal_period fp
        JOIN   master.tenant        t ON t.id = fp.tenant_id
        WHERE  t.code IN ('athyper', 'technostat', 'cirrusatlantic')
          AND  fp.fiscal_year >= 2024
          AND  (
                  (fp.fiscal_year = 2024  AND fp.status <> 'hard_close')
               OR (fp.fiscal_year = 2025  AND fp.status <> 'soft_close')
               OR (fp.fiscal_year = 2026  AND fp.status <> 'open')
               OR (fp.fiscal_year >= 2027 AND fp.status <> 'future')
               )
    ) THEN
        RAISE EXCEPTION '100_close_states FAIL C1: fiscal_period.status mismatch for FY2024-2027+ — check master.fiscal_period';
    END IF;

    -- C2: book_period_status.status matches the tiered rule for all 3 tenants
    IF EXISTS (
        SELECT 1
        FROM   governance.book_period_status bps
        JOIN   master.tenant                t ON t.id = bps.tenant_id
        WHERE  t.code IN ('athyper', 'technostat', 'cirrusatlantic')
          AND  bps.fiscal_year >= 2024
          AND  (
                  (bps.fiscal_year = 2024  AND bps.status <> 'hard_close')
               OR (bps.fiscal_year = 2025  AND bps.status <> 'soft_close')
               OR (bps.fiscal_year = 2026  AND bps.status <> 'open')
               OR (bps.fiscal_year >= 2027 AND bps.status <> 'future')
               )
    ) THEN
        RAISE EXCEPTION '100_close_states FAIL C2: book_period_status.status mismatch for FY2024-2027+ — check governance.book_period_status';
    END IF;

    RAISE NOTICE '100_close_states DONE: % fiscal_period + % BPS rows updated. FY2024 hard_close, FY2025 soft_close, FY2026 open, FY2027+ future across athyper, technostat, cirrusatlantic.',
        v_fp_total, v_bps_total;
END $apply_close_states$;
