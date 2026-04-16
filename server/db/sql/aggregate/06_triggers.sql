-- ============================================================================
-- aggregate/06_triggers.sql
-- updated_at maintenance for aggregate schema tables.
-- ============================================================================

-- ── aggregate.wht_vendor_accumulator ─────────────────────────────────────────
-- R7-B: keep updated_at current on accumulator row updates
DROP TRIGGER IF EXISTS trg_wva_updated_at ON aggregate.wht_vendor_accumulator;
CREATE TRIGGER trg_wva_updated_at
    BEFORE UPDATE ON aggregate.wht_vendor_accumulator
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
