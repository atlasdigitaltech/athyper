-- ============================================================================
-- document/08z_ap_p0_rls.sql
-- Concept: AP P0 RLS — Row-Level Security policies for new P0 tables
-- Depends on: 01t_ap_p0_foundations.sql, 08_rls.sql (base RLS conventions)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.7, §17.3
-- Pattern: matches §8/§9 in 08_rls.sql — tenant_read/insert/update + admin_read
-- ============================================================================


-- =============================================================================
-- §P0.4  document.accounting_distribution_resolution_audit
-- =============================================================================
-- Tenant isolation; UPDATE/DELETE blocked at trigger level via
-- log.trg_prevent_mutation() (see 06z_ap_p0_triggers.sql).
-- Policy still includes UPDATE row to support future admin-only correction
-- workflows; trigger remains authoritative.
-- =============================================================================

ALTER TABLE document.accounting_distribution_resolution_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.accounting_distribution_resolution_audit FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON document.accounting_distribution_resolution_audit;
DROP POLICY IF EXISTS tenant_insert ON document.accounting_distribution_resolution_audit;
DROP POLICY IF EXISTS admin_read    ON document.accounting_distribution_resolution_audit;

CREATE POLICY tenant_read ON document.accounting_distribution_resolution_audit
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id());

CREATE POLICY tenant_insert ON document.accounting_distribution_resolution_audit
    FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());

-- No tenant_update policy — append-only by trigger.

CREATE POLICY admin_read ON document.accounting_distribution_resolution_audit
    FOR SELECT
    TO athyperadmin
    USING (true);


-- =============================================================================
-- End of 08z_ap_p0_rls.sql
-- =============================================================================
