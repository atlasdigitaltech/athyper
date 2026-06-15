-- ============================================================================
-- document/06w_ap_pta_pc_alignment_trigger.sql
-- Concept: H1.C — PTA ↔ PC term/clause semantic alignment
-- Depends on: 01v_pta_pricing_component_link.sql, 01u_tables_pricing_component.sql
-- Spec: AP Schema Hardening Plan §H1.C
--
-- The pta_pc_origin_clause_type_chk constraint (P2) only verifies that PC-origin
-- PTA rows use the retention/advance clause families. It does NOT verify that:
--   PC.term_type='retention' → PTA.clause_type ∈ ('RETENTION','RETENTION_RELEASE')
-- This trigger adds that semantic alignment.
--
-- Withholding is REJECTED at this layer — the P2 retention-advance-seeder
-- explicitly skips withholding pending a PTA clause_type CHECK extension for
-- 'WITHHOLDING'. When that extension lands, update the CASE arm here.
-- ============================================================================

CREATE OR REPLACE FUNCTION document.fn_pta_pc_term_clause_alignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_pc_term text;
BEGIN
    -- Only check PC-origin rows; clause-driven rows skip the alignment check
    IF NEW.pricing_component_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT term_type INTO v_pc_term
      FROM document.pricing_component
     WHERE id        = NEW.pricing_component_id
       AND tenant_id = NEW.tenant_id;

    IF v_pc_term IS NULL THEN
        RAISE EXCEPTION 'PTA_PC_TERM_MISSING: pricing_component_id=% not found in tenant %',
            NEW.pricing_component_id, NEW.tenant_id
            USING ERRCODE = 'AP010';
    END IF;

    CASE v_pc_term
        WHEN 'retention' THEN
            IF NEW.clause_type NOT IN ('RETENTION','RETENTION_RELEASE') THEN
                RAISE EXCEPTION
                  'PTA_PC_TERM_MISMATCH: PC term_type=retention requires clause_type RETENTION or RETENTION_RELEASE, got %',
                  NEW.clause_type
                  USING ERRCODE = 'AP011';
            END IF;
        WHEN 'withholding' THEN
            -- PTA clause_type CHECK does not yet include WITHHOLDING.
            -- Reject PC-origin withholding rows until the CHECK extension lands.
            RAISE EXCEPTION
              'PTA_PC_TERM_UNSUPPORTED: PC term_type=withholding has no PTA clause_type mapping yet (PTA clause_type CHECK extension pending)'
              USING ERRCODE = 'AP012';
        ELSE
            -- discount, charge, tax, principal_marker have no PTA path
            RAISE EXCEPTION
              'PTA_PC_TERM_UNSUPPORTED: PC term_type=% does not map to any PTA clause_type',
              v_pc_term
              USING ERRCODE = 'AP013';
    END CASE;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pta_pc_term_clause_alignment() IS
    'Enforces PTA clause_type semantically matches the source PC term_type when '
    'pricing_component_id is set. Today: retention → RETENTION/RETENTION_RELEASE only. '
    'Withholding and other term_types are rejected pending PTA enum extensions.';


DROP TRIGGER IF EXISTS trg_pta_pc_term_clause_alignment ON document.payment_term_application;
CREATE TRIGGER trg_pta_pc_term_clause_alignment
    BEFORE INSERT OR UPDATE OF pricing_component_id, clause_type
    ON document.payment_term_application
    FOR EACH ROW EXECUTE FUNCTION document.fn_pta_pc_term_clause_alignment();

COMMENT ON TRIGGER trg_pta_pc_term_clause_alignment ON document.payment_term_application IS
    'Ensures PTA.clause_type aligns with source PC.term_type. Allows retention → '
    'RETENTION/RETENTION_RELEASE only today. Withholding rejected pending PTA enum extension.';


-- =============================================================================
-- End of 06w_ap_pta_pc_alignment_trigger.sql
-- =============================================================================
