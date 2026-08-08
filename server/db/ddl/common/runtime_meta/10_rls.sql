ALTER TABLE runtime_meta.tenant_usage_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.tenant_usage_counter FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_usage_counter_access ON runtime_meta.tenant_usage_counter
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_usage_counter_seed_write ON runtime_meta.tenant_usage_counter
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE runtime_meta.authorization_epoch ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.authorization_epoch FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_epoch_read ON runtime_meta.authorization_epoch FOR SELECT
    USING (scope_kind = 'global' OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY authorization_epoch_seed_write ON runtime_meta.authorization_epoch
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE runtime_meta.entity_number_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.entity_number_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_number_counter_tenant_access ON runtime_meta.entity_number_counter
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY entity_number_counter_seed_write ON runtime_meta.entity_number_counter
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE runtime_meta.applied_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.applied_release FORCE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.release_activation_head ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.release_activation_head FORCE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.release_activation_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.release_activation_event FORCE ROW LEVEL SECURITY;

CREATE POLICY applied_release_seed_owner ON runtime_meta.applied_release FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY release_activation_head_seed_owner ON runtime_meta.release_activation_head FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY release_activation_event_seed_owner ON runtime_meta.release_activation_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN
    EXECUTE 'CREATE POLICY applied_release_applier ON runtime_meta.applied_release FOR ALL TO athyper_projection_applier USING(true) WITH CHECK(true)';
    EXECUTE 'CREATE POLICY release_activation_head_applier ON runtime_meta.release_activation_head FOR ALL TO athyper_projection_applier USING(true) WITH CHECK(true)';
    EXECUTE 'CREATE POLICY release_activation_event_applier ON runtime_meta.release_activation_event FOR ALL TO athyper_projection_applier USING(true) WITH CHECK(true)';
  END IF;
END $$;

ALTER TABLE runtime_meta.entity_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.entity_contract FORCE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.entity_descriptor ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.entity_descriptor FORCE ROW LEVEL SECURITY;

CREATE POLICY runtime_entity_contract_read ON runtime_meta.entity_contract FOR SELECT
  USING (tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY runtime_entity_descriptor_read ON runtime_meta.entity_descriptor FOR SELECT
  USING (tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY runtime_entity_contract_seed_owner ON runtime_meta.entity_contract
  FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY runtime_entity_descriptor_seed_owner ON runtime_meta.entity_descriptor
  FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN
    EXECUTE 'CREATE POLICY runtime_entity_contract_applier ON runtime_meta.entity_contract FOR ALL TO athyper_projection_applier USING(true) WITH CHECK(true)';
    EXECUTE 'CREATE POLICY runtime_entity_descriptor_applier ON runtime_meta.entity_descriptor FOR ALL TO athyper_projection_applier USING(true) WITH CHECK(true)';
  END IF;
END $$;
