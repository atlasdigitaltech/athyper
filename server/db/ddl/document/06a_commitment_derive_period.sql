-- ============================================================================
-- document/06a_commitment_derive_period.sql
-- Concept: Advisory derivation of fiscal_year + period_number from document_date.
-- Depends on: 01c_tables_commitment.sql, master.fiscal_period
--
-- Advisory only. Fires BEFORE INSERT and BEFORE UPDATE OF (document_date,
-- company_code_id). If no matching fiscal_period row exists, fiscal_year and
-- period_number stay NULL — the commitment header does NOT enforce an open
-- period. Strict period-gate enforcement lives on finance.journal_entry
-- (posting layer), not on this commitment (non-posting layer).
-- ============================================================================

CREATE OR REPLACE FUNCTION document.commitment_derive_period()
RETURNS trigger AS $$
BEGIN
    SELECT fp.fiscal_year, fp.period_number
      INTO NEW.fiscal_year, NEW.period_number
      FROM master.resolve_fiscal_period(
          NEW.tenant_id,
          NEW.company_code_id,
          NEW.document_date,
          false
      ) fp;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commitment_derive_period ON document.commitment;
CREATE TRIGGER trg_commitment_derive_period
    BEFORE INSERT OR UPDATE OF document_date, company_code_id
    ON document.commitment
    FOR EACH ROW
    EXECUTE FUNCTION document.commitment_derive_period();
