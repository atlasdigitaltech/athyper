DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['organization','organization_provider','application_projection','projection_scope','identity_provisioning_request','identity_projection','identity_saga_attempt','provider_identity_callback_inbox'] LOOP EXECUTE format('ALTER TABLE trustiam.%I ENABLE ROW LEVEL SECURITY',v_table); EXECUTE format('ALTER TABLE trustiam.%I FORCE ROW LEVEL SECURITY',v_table); EXECUTE format('CREATE POLICY authority_access ON trustiam.%I FOR ALL USING (authority_tenant_id=shared.current_tenant_id_soft()) WITH CHECK (authority_tenant_id=shared.current_tenant_id())',v_table); EXECUTE format('CREATE POLICY seed_write ON trustiam.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',v_table); END LOOP; END $$;
ALTER TABLE trustiam.projection_reconciliation_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustiam.projection_reconciliation_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY projection_reconciliation_attempt_authority_access ON trustiam.projection_reconciliation_attempt FOR ALL TO athyper_projection_reconciler USING (true) WITH CHECK (true);
CREATE POLICY projection_reconciliation_attempt_tenant_read ON trustiam.projection_reconciliation_attempt FOR SELECT TO athyperapp USING (authority_tenant_id=shared.current_tenant_id_soft());
CREATE POLICY projection_reconciliation_attempt_tenant_replay ON trustiam.projection_reconciliation_attempt FOR UPDATE TO athyperapp
  USING (authority_tenant_id=shared.current_tenant_id_soft() AND status='dead_letter' AND replay_requested_at IS NULL)
  WITH CHECK (authority_tenant_id=shared.current_tenant_id() AND status='dead_letter' AND replay_requested_at IS NOT NULL);
CREATE POLICY projection_reconciler_organization_read ON trustiam.organization FOR SELECT TO athyper_projection_reconciler USING (true);
CREATE POLICY projection_reconciler_provider_read ON trustiam.organization_provider FOR SELECT TO athyper_projection_reconciler USING (true);
CREATE POLICY projection_reconciler_scope_read ON trustiam.projection_scope FOR SELECT TO athyper_projection_reconciler USING (true);
CREATE POLICY projection_reconciler_projection_access ON trustiam.application_projection FOR SELECT TO athyper_projection_reconciler USING (true);
CREATE POLICY projection_reconciler_projection_observation ON trustiam.application_projection FOR UPDATE TO athyper_projection_reconciler USING (true) WITH CHECK (true);
CREATE POLICY trustiam_projection_reconciliation_alert_insert ON event.outbox FOR INSERT TO athyper_projection_reconciler
  WITH CHECK (topic='iam.authority' AND event_type='trustiam.projection.reconciliation.dead_letter' AND source='trustiam-reconciler');
CREATE POLICY trustiam_identity_saga_evidence_insert ON event.outbox FOR INSERT TO athyper_trustiam_service
  WITH CHECK (topic='iam.authority' AND event_type IN('trustiam.identity.saga.succeeded','trustiam.identity.saga.failed','trustiam.identity.saga.dead_letter') AND source='trustiam-identity-saga');
ALTER TABLE trustiam.identity_provisioning_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustiam.identity_provisioning_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_access ON trustiam.identity_provisioning_attempt FOR ALL USING(authority_tenant_id=shared.current_tenant_id_soft()) WITH CHECK(authority_tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON trustiam.identity_provisioning_attempt FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
