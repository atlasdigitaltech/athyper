-- ============================================================================
-- governance/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "governance"."book_period_status" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."book_period_status" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."comment_moderation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."comment_moderation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_carryforward_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_carryforward_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_certification" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_certification" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_cross_dependency" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_cross_dependency" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_deviation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_deviation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_phase" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_phase" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_run" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task_category" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task_category" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task_dependency" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task_dependency" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task_template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_task_template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_type" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."cycle_type" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."legal_hold" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."legal_hold" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."legal_hold_manifest" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."legal_hold_manifest" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."preserved_identity_migration_receipt_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."preserved_identity_migration_receipt_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance"."report_pack" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance"."report_pack" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "governance"."book_period_status"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."book_period_status"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."book_period_status"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."book_period_status"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."book_period_status"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."book_period_status"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."comment_moderation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."comment_moderation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "governance"."comment_moderation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "governance"."cycle_carryforward_rule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_carryforward_rule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_carryforward_rule"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_carryforward_rule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_carryforward_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_carryforward_rule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_certification"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_certification"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_certification"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_certification"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_certification"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_certification"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_cross_dependency"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_cross_dependency"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_cross_dependency"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_cross_dependency"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_cross_dependency"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_cross_dependency"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_deviation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_deviation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_deviation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_deviation"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_deviation"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_deviation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_phase"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_phase"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_phase"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_phase"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_phase"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_phase"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_run"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_run"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_run"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_run"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_task"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_task"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_task"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_task"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_task"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_task"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_task_category"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_task_category"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_task_category"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_task_category"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_task_category"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_task_category"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_task_dependency"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_task_dependency"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_task_dependency"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_task_dependency"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_task_dependency"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_task_dependency"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_task_template"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_task_template"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_task_template"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_task_template"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_task_template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_task_template"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."cycle_type"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."cycle_type"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."cycle_type"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."cycle_type"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."cycle_type"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."cycle_type"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."legal_hold"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."legal_hold"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."legal_hold"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."legal_hold"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."legal_hold"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."legal_hold"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "governance"."legal_hold_manifest"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."legal_hold_manifest"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."legal_hold_manifest"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."legal_hold_manifest"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."legal_hold_manifest"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."legal_hold_manifest"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "preserved_identity_migration_receipt_v2_admin" ON "governance"."preserved_identity_migration_receipt_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_read" ON "governance"."report_pack"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "governance"."report_pack"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "governance"."report_pack"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "governance"."report_pack"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "governance"."report_pack"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "governance"."report_pack"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

GRANT EXECUTE ON FUNCTION "governance".execute_carryforward(p_closing_run_id uuid, p_next_run_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "governance".execute_carryforward(p_closing_run_id uuid, p_next_run_id uuid) TO athyperapp;

GRANT EXECUTE ON FUNCTION "governance".materialize_cycle_tasks(p_cycle_run_id uuid, p_blueprint character varying) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "governance".materialize_cycle_tasks(p_cycle_run_id uuid, p_blueprint character varying) TO athyperapp;

GRANT DELETE ON TABLE "governance"."book_period_status" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."book_period_status" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."book_period_status" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."book_period_status" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."book_period_status" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."book_period_status" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."book_period_status" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."book_period_status" TO athyperapp;

GRANT DELETE ON TABLE "governance"."comment_moderation" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."comment_moderation" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."comment_moderation" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."comment_moderation" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."comment_moderation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."comment_moderation" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."comment_moderation" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."comment_moderation" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_carryforward_rule" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_carryforward_rule" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_carryforward_rule" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_carryforward_rule" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_carryforward_rule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_carryforward_rule" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_carryforward_rule" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_carryforward_rule" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_carryforward_rule" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_carryforward_rule" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_carryforward_rule" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_certification" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_certification" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_certification" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_certification" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_certification" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_certification" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_certification" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_certification" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_certification" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_certification" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_certification" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_cross_dependency" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_cross_dependency" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_cross_dependency" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_cross_dependency" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_cross_dependency" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_cross_dependency" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_cross_dependency" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_cross_dependency" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_cross_dependency" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_cross_dependency" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_cross_dependency" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_deviation" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_deviation" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_deviation" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_deviation" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_deviation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_deviation" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_deviation" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_deviation" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_deviation" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_deviation" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_deviation" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_phase" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_phase" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_phase" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_phase" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_phase" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_phase" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_phase" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_phase" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_phase" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_phase" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_phase" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_run" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_run" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_run" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_run" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_run" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_run" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_run" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_run" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_task" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_task" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_task" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_task" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_task" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_task" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_task" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_task" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_task" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_task" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_task" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_task_category" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_task_category" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_task_category" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_task_category" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_task_category" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_task_category" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_task_category" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_task_category" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_task_category" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_task_category" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_task_category" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_task_dependency" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_task_dependency" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_task_dependency" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_task_dependency" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_task_dependency" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_task_dependency" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_task_dependency" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_task_dependency" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_task_dependency" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_task_dependency" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_task_dependency" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_task_template" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_task_template" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_task_template" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_task_template" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_task_template" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_task_template" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_task_template" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_task_template" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_task_template" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_task_template" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_task_template" TO athyperapp;

GRANT DELETE ON TABLE "governance"."cycle_type" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."cycle_type" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."cycle_type" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."cycle_type" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."cycle_type" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."cycle_type" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."cycle_type" TO athyperadmin;

GRANT DELETE ON TABLE "governance"."cycle_type" TO athyperapp;

GRANT INSERT ON TABLE "governance"."cycle_type" TO athyperapp;

GRANT SELECT ON TABLE "governance"."cycle_type" TO athyperapp;

GRANT UPDATE ON TABLE "governance"."cycle_type" TO athyperapp;

GRANT DELETE ON TABLE "governance"."legal_hold" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."legal_hold" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."legal_hold" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."legal_hold" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."legal_hold" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."legal_hold" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."legal_hold" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."legal_hold" TO athyperapp;

GRANT DELETE ON TABLE "governance"."legal_hold_manifest" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."legal_hold_manifest" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."legal_hold_manifest" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."legal_hold_manifest" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."legal_hold_manifest" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."legal_hold_manifest" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."legal_hold_manifest" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."legal_hold_manifest" TO athyperapp;

GRANT DELETE ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."preserved_identity_migration_receipt_v2" TO athyperapp;

GRANT DELETE ON TABLE "governance"."report_pack" TO athyperadmin;

GRANT INSERT ON TABLE "governance"."report_pack" TO athyperadmin;

GRANT REFERENCES ON TABLE "governance"."report_pack" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."report_pack" TO athyperadmin;

GRANT TRIGGER ON TABLE "governance"."report_pack" TO athyperadmin;

GRANT TRUNCATE ON TABLE "governance"."report_pack" TO athyperadmin;

GRANT UPDATE ON TABLE "governance"."report_pack" TO athyperadmin;

GRANT SELECT ON TABLE "governance"."report_pack" TO athyperapp;
