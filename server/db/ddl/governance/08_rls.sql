-- ============================================================================
-- governance/08_rls.sql
-- Concept: Governance RLS — period close and compliance isolation policies
-- Depends on: 04_tables/008_governance.sql, 05_pre_constraint_functions/001_shared.sql
-- ============================================================================

-- ============================================================================
-- LEDGER POSTING PATH — governance tables
-- ============================================================================

-- ── governance.book_period_status ────────────────────────────────────────────
ALTER TABLE governance.book_period_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.book_period_status FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.book_period_status;
DROP POLICY IF EXISTS tenant_insert ON governance.book_period_status;
DROP POLICY IF EXISTS tenant_update ON governance.book_period_status;
DROP POLICY IF EXISTS tenant_delete ON governance.book_period_status;
DROP POLICY IF EXISTS admin_read    ON governance.book_period_status;
DROP POLICY IF EXISTS admin_write   ON governance.book_period_status;
CREATE POLICY tenant_read   ON governance.book_period_status FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.book_period_status FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.book_period_status FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.book_period_status FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.book_period_status FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.book_period_status FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- GOVERNANCE CYCLE MODEL — RLS policies
-- ============================================================================
-- Standard 6-policy pattern per table:
--   tenant_read   — rows for calling tenant (current_tenant_id_soft)
--   tenant_insert — calling tenant only    (current_tenant_id)
--   tenant_update — calling tenant only
--   tenant_delete — calling tenant only
--   admin_read    — cross-tenant           (athyperadmin)
--   admin_write   — full DML               (athyperadmin)

-- ── governance.cycle_type ───────────────────────────────────────────────────
ALTER TABLE governance.cycle_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_type FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_type;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_type;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_type;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_type;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_type;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_type;
CREATE POLICY tenant_read   ON governance.cycle_type FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_type FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_type FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_type FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_type FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_type FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_phase ──────────────────────────────────────────────────
ALTER TABLE governance.cycle_phase ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_phase FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_phase;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_phase;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_phase;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_phase;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_phase;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_phase;
CREATE POLICY tenant_read   ON governance.cycle_phase FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_phase FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_phase FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_phase FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_phase FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_phase FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_task_category ──────────────────────────────────────────
ALTER TABLE governance.cycle_task_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_task_category FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_task_category;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_task_category;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_task_category;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_task_category;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_task_category;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_task_category;
CREATE POLICY tenant_read   ON governance.cycle_task_category FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_task_category FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_task_category FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_task_category FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_task_category FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_task_category FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_task_template ──────────────────────────────────────────
ALTER TABLE governance.cycle_task_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_task_template FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_task_template;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_task_template;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_task_template;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_task_template;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_task_template;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_task_template;
CREATE POLICY tenant_read   ON governance.cycle_task_template FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_task_template FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_task_template FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_task_template FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_task_template FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_task_template FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_task_dependency ────────────────────────────────────────
ALTER TABLE governance.cycle_task_dependency ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_task_dependency FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_task_dependency;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_task_dependency;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_task_dependency;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_task_dependency;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_task_dependency;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_task_dependency;
CREATE POLICY tenant_read   ON governance.cycle_task_dependency FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_task_dependency FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_task_dependency FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_task_dependency FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_task_dependency FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_task_dependency FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_run ────────────────────────────────────────────────────
ALTER TABLE governance.cycle_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_run FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_run;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_run;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_run;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_run;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_run;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_run;
CREATE POLICY tenant_read   ON governance.cycle_run FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_run FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_run FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_run FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_run FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_run FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_task ───────────────────────────────────────────────────
ALTER TABLE governance.cycle_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_task FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_task;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_task;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_task;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_task;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_task;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_task;
CREATE POLICY tenant_read   ON governance.cycle_task FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_task FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_task FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_task FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_task FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_task FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_deviation ──────────────────────────────────────────────
ALTER TABLE governance.cycle_deviation ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_deviation FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_deviation;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_deviation;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_deviation;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_deviation;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_deviation;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_deviation;
CREATE POLICY tenant_read   ON governance.cycle_deviation FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_deviation FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_deviation FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_deviation FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_deviation FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_deviation FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_certification ──────────────────────────────────────────
ALTER TABLE governance.cycle_certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_certification FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_certification;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_certification;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_certification;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_certification;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_certification;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_certification;
CREATE POLICY tenant_read   ON governance.cycle_certification FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_certification FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_certification FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_certification FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_certification FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_certification FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_cross_dependency ───────────────────────────────────────
ALTER TABLE governance.cycle_cross_dependency ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_cross_dependency FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_cross_dependency;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_cross_dependency;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_cross_dependency;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_cross_dependency;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_cross_dependency;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_cross_dependency;
CREATE POLICY tenant_read   ON governance.cycle_cross_dependency FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_cross_dependency FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_cross_dependency FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_cross_dependency FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_cross_dependency FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_cross_dependency FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── governance.cycle_carryforward_rule ──────────────────────────────────────
ALTER TABLE governance.cycle_carryforward_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.cycle_carryforward_rule FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.cycle_carryforward_rule;
DROP POLICY IF EXISTS tenant_insert ON governance.cycle_carryforward_rule;
DROP POLICY IF EXISTS tenant_update ON governance.cycle_carryforward_rule;
DROP POLICY IF EXISTS tenant_delete ON governance.cycle_carryforward_rule;
DROP POLICY IF EXISTS admin_read    ON governance.cycle_carryforward_rule;
DROP POLICY IF EXISTS admin_write   ON governance.cycle_carryforward_rule;
CREATE POLICY tenant_read   ON governance.cycle_carryforward_rule FOR SELECT USING     (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON governance.cycle_carryforward_rule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.cycle_carryforward_rule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.cycle_carryforward_rule FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON governance.cycle_carryforward_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.cycle_carryforward_rule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);
