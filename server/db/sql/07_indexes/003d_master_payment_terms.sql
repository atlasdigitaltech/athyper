-- 07_indexes/003d_master_payment_terms.sql
-- Depends on: 04_tables/003d_master_payment_terms.sql
-- Naming: <table>_<cols>_idx | _pidx (partial WHERE).

-- ============================================================================
-- Holiday Calendar indexes
-- ============================================================================

-- hc: active calendars per tenant (partial)
CREATE INDEX IF NOT EXISTS hc_tenant_pidx
    ON master.holiday_calendar (tenant_id)
    WHERE status = 'active';

-- hcd: calendar + year lookup (covers "all holidays for calendar in year")
CREATE INDEX IF NOT EXISTS hcd_calendar_year_idx
    ON master.holiday_calendar_day (holiday_calendar_id, calendar_year);

-- hcd: date lookup (covers "is this date a holiday?")
CREATE INDEX IF NOT EXISTS hcd_date_idx
    ON master.holiday_calendar_day (holiday_calendar_id, holiday_date);


-- ============================================================================
-- Payment Term indexes
-- ============================================================================

-- pt: active terms per tenant (partial)
CREATE INDEX IF NOT EXISTS pt_tenant_active_pidx
    ON master.payment_term (tenant_id)
    WHERE status = 'active';

-- ptc: clauses for a given term
CREATE INDEX IF NOT EXISTS ptc_term_idx
    ON master.payment_term_clause (payment_term_id);

-- ptdt: discount tiers for a given term
CREATE INDEX IF NOT EXISTS ptdt_term_idx
    ON master.payment_term_discount_tier (payment_term_id);


