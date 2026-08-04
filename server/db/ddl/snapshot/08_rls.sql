-- ============================================================================
-- snapshot/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon database snapshot schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "snapshot"."document_snapshot" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."document_snapshot" FORCE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."entity_compiled" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."entity_compiled" FORCE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."entity_compiled_overlay" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."entity_compiled_overlay" FORCE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."entity_plane_compiled" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."entity_plane_compiled" FORCE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."lifecycle_route" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."lifecycle_route" FORCE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."lifecycle_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."lifecycle_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."status_route" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."status_route" FORCE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."template_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "snapshot"."template_version" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "snapshot"."document_snapshot"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "snapshot"."document_snapshot"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "snapshot"."document_snapshot"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "snapshot"."entity_compiled"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "snapshot"."entity_compiled"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "snapshot"."entity_compiled"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "snapshot"."entity_compiled"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "snapshot"."entity_compiled"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "admin_read" ON "snapshot"."entity_compiled_overlay"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "snapshot"."entity_compiled_overlay"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "snapshot"."entity_compiled_overlay"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "tenant_read" ON "snapshot"."entity_compiled_overlay"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "snapshot"."entity_compiled_overlay"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "m3_admin_all" ON "snapshot"."entity_plane_compiled"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "m3_scoped_read" ON "snapshot"."entity_plane_compiled"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id IS NULL OR shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "m3_tenant_write" ON "snapshot"."entity_plane_compiled"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "snapshot"."lifecycle_route"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "snapshot"."lifecycle_route"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "snapshot"."lifecycle_route"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "snapshot"."lifecycle_route"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "snapshot"."lifecycle_route"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "snapshot"."lifecycle_version"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "snapshot"."lifecycle_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "snapshot"."lifecycle_version"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "snapshot"."lifecycle_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "snapshot"."lifecycle_version"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "snapshot"."status_route"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "snapshot"."status_route"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "snapshot"."status_route"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "snapshot"."status_route"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL);

CREATE POLICY "tenant_update" ON "snapshot"."status_route"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "snapshot"."template_version"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "snapshot"."template_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "snapshot"."template_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

GRANT DELETE ON TABLE "snapshot"."content_item_version" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."content_item_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."content_item_version" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."content_item_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."content_item_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."content_item_version" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."content_item_version" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."content_item_version" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."document_snapshot" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."document_snapshot" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."document_snapshot" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."document_snapshot" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."document_snapshot" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."document_snapshot" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."document_snapshot" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."document_snapshot" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."document_snapshot_default" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."document_snapshot_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."document_snapshot_default" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."document_snapshot_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."document_snapshot_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."document_snapshot_default" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."document_snapshot_default" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."document_snapshot_default" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."entity_compiled" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."entity_compiled" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."entity_compiled" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."entity_compiled" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."entity_compiled" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."entity_compiled" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."entity_compiled" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."entity_compiled" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."entity_compiled_overlay" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."entity_compiled_overlay" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."entity_compiled_overlay" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."entity_compiled_overlay" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."entity_compiled_overlay" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."entity_compiled_overlay" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."entity_compiled_overlay" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."entity_compiled_overlay" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."entity_plane_compiled" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."entity_plane_compiled" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."entity_plane_compiled" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."entity_plane_compiled" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."entity_plane_compiled" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."entity_plane_compiled" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."entity_plane_compiled" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."entity_plane_compiled" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."lifecycle_route" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."lifecycle_route" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."lifecycle_route" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."lifecycle_route" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."lifecycle_route" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."lifecycle_route" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."lifecycle_route" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."lifecycle_route" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."lifecycle_version" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."lifecycle_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."lifecycle_version" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."lifecycle_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."lifecycle_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."lifecycle_version" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."lifecycle_version" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."lifecycle_version" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."status_route" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."status_route" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."status_route" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."status_route" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."status_route" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."status_route" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."status_route" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."status_route" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."template_version" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."template_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."template_version" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."template_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."template_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."template_version" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."template_version" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."template_version" TO athyperapp;

GRANT DELETE ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperadmin;

GRANT INSERT ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperadmin;

GRANT REFERENCES ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperadmin;

GRANT TRIGGER ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperadmin;

GRANT TRUNCATE ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperadmin;

GRANT UPDATE ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperadmin;

GRANT SELECT ON TABLE "snapshot"."v_p2p_audit_timeline" TO athyperapp;
