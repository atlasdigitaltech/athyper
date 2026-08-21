DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'workspace', 'module', 'workspace_module', 'subscription_plan_module'
    ]
    LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY catalog_read ON control.%I FOR SELECT USING (true)', v_table);
        EXECUTE format(
            'CREATE POLICY catalog_seed_write ON control.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table
        );
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_applier') THEN
            EXECUTE format(
                'CREATE POLICY catalog_projection_apply ON control.%I FOR ALL '
                'TO athyper_projection_applier USING (true) WITH CHECK (true)', v_table
            );
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format(
                'CREATE POLICY catalog_admin ON control.%I FOR ALL '
                'TO athyperadmin USING (true) WITH CHECK (true)', v_table
            );
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE control.lookup_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_domain FORCE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_value FORCE ROW LEVEL SECURITY;

CREATE POLICY lookup_domain_read ON control.lookup_domain
  FOR SELECT USING (true);
CREATE POLICY lookup_domain_admin ON control.lookup_domain
  FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY lookup_domain_seed ON control.lookup_domain
  FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY lookup_value_read ON control.lookup_value
  FOR SELECT USING (
    tenant_id IS NULL
    OR (
      shared.current_tenant_id_soft() IS NOT NULL
      AND tenant_id = shared.current_tenant_id_soft()
    )
  );
CREATE POLICY lookup_value_tenant_insert ON control.lookup_value
  FOR INSERT WITH CHECK (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  );
CREATE POLICY lookup_value_tenant_update ON control.lookup_value
  FOR UPDATE USING (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  ) WITH CHECK (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  );
CREATE POLICY lookup_value_tenant_delete ON control.lookup_value
  FOR DELETE USING (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  );
CREATE POLICY lookup_value_admin ON control.lookup_value
  FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY lookup_value_seed ON control.lookup_value
  FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.connector_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.connector_type FORCE ROW LEVEL SECURITY;
CREATE POLICY connector_type_read ON control.connector_type FOR SELECT USING (true);
CREATE POLICY connector_type_seed_write ON control.connector_type
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'connector_instance', 'integration_endpoint', 'webhook_subscription',
        'cycle_type', 'cycle_phase', 'cycle_task_category', 'cycle_task_template',
        'cycle_task_dependency', 'cycle_cross_dependency', 'cycle_carryforward_rule',
        'cycle_template_revision'
    ]
    LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON control.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON control.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;

ALTER TABLE control.bank_account_validation_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.bank_account_validation_rule FORCE ROW LEVEL SECURITY;

CREATE POLICY bank_account_validation_rule_read
    ON control.bank_account_validation_rule FOR SELECT USING (true);
CREATE POLICY bank_account_validation_rule_seed_write
    ON control.bank_account_validation_rule FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.usage_metric_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.usage_metric_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_metric_catalog_read ON control.usage_metric_catalog
    FOR SELECT USING (true);
CREATE POLICY usage_metric_catalog_seed_write ON control.usage_metric_catalog
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.subscription_plan_usage_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.subscription_plan_usage_limit FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_plan_usage_limit_read ON control.subscription_plan_usage_limit
    FOR SELECT USING (true);
CREATE POLICY subscription_plan_usage_limit_seed_write ON control.subscription_plan_usage_limit
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.tenant_usage_limit_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.tenant_usage_limit_override FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_usage_limit_override_read ON control.tenant_usage_limit_override
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_usage_limit_override_seed_write ON control.tenant_usage_limit_override
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.feature_flag_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.feature_flag_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY feature_flag_catalog_read ON control.feature_flag_catalog FOR SELECT USING (true);
CREATE POLICY feature_flag_catalog_seed_write ON control.feature_flag_catalog
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.feature_flag_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.feature_flag_override FORCE ROW LEVEL SECURITY;
CREATE POLICY feature_flag_override_read ON control.feature_flag_override
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY feature_flag_override_seed_write ON control.feature_flag_override
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.parameter_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.parameter_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY parameter_definition_read ON control.parameter_definition FOR SELECT USING (true);
CREATE POLICY parameter_definition_seed_write ON control.parameter_definition
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.tenant_parameter_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.tenant_parameter_value FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_parameter_value_access ON control.tenant_parameter_value
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_parameter_value_seed_write ON control.tenant_parameter_value
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.cron_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.cron_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY cron_schedule_read ON control.cron_schedule FOR SELECT TO athyperapp
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY cron_schedule_tenant_write ON control.cron_schedule FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY cron_schedule_seed_write ON control.cron_schedule FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
ALTER TABLE control.cron_schedule_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.cron_schedule_change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY cron_schedule_change_log_read ON control.cron_schedule_change_log FOR SELECT TO athyperapp
  USING (tenant_id IS NOT DISTINCT FROM shared.current_tenant_id());
CREATE POLICY cron_schedule_change_log_insert ON control.cron_schedule_change_log FOR INSERT TO athyperapp
  WITH CHECK (tenant_id IS NOT DISTINCT FROM shared.current_tenant_id());

ALTER TABLE control.notification_provider ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.notification_provider FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_provider_read ON control.notification_provider FOR SELECT USING (true);
CREATE POLICY notification_provider_runtime_write ON control.notification_provider FOR INSERT TO athyperapp WITH CHECK (true);
CREATE POLICY notification_provider_runtime_update ON control.notification_provider FOR UPDATE TO athyperapp USING (true) WITH CHECK (true);
CREATE POLICY notification_provider_seed_write ON control.notification_provider FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DO $$ DECLARE v_table text; BEGIN FOREACH v_table IN ARRAY ARRAY['notification_template','notification_routing_rule'] LOOP
  EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table); EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
  EXECUTE format('CREATE POLICY notification_read ON control.%I FOR SELECT USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())', v_table);
  EXECUTE format('CREATE POLICY notification_tenant_write ON control.%I FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
  EXECUTE format('CREATE POLICY notification_seed_write ON control.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
END LOOP; END $$;

ALTER TABLE control.numbering_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.numbering_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY numbering_policy_read ON control.numbering_policy
    FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY numbering_policy_tenant_write ON control.numbering_policy
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY numbering_policy_seed_write ON control.numbering_policy
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.policy_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.policy_definition FORCE ROW LEVEL SECURITY;

CREATE POLICY policy_definition_admin_access
    ON control.policy_definition
    FOR ALL
    TO athyperadmin
    USING (true)
    WITH CHECK (true);

CREATE POLICY policy_definition_tenant_read
    ON control.policy_definition
    FOR SELECT
    TO athyperapp
    USING (
        tenant_id IS NULL
        OR (
            shared.current_tenant_id_soft() IS NOT NULL
            AND tenant_id = shared.current_tenant_id_soft()
        )
    );

ALTER TABLE control.policy_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.policy_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE control.policy_test_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.policy_test_case FORCE ROW LEVEL SECURITY;

CREATE POLICY policy_rule_admin_access ON control.policy_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY policy_rule_tenant_read ON control.policy_rule
    FOR SELECT TO athyperapp
    USING (EXISTS (
        SELECT 1 FROM control.policy_definition definition
         WHERE definition.id = policy_definition_id
           AND (definition.tenant_id IS NULL
                OR definition.tenant_id = shared.current_tenant_id_soft())
    ));

CREATE POLICY policy_test_case_admin_access ON control.policy_test_case
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY policy_test_case_tenant_read ON control.policy_test_case
    FOR SELECT TO athyperapp
    USING (EXISTS (
        SELECT 1 FROM control.policy_definition definition
         WHERE definition.id = policy_definition_id
           AND (definition.tenant_id IS NULL
                OR definition.tenant_id = shared.current_tenant_id_soft())
    ));

ALTER TABLE control.rounding_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.rounding_rule FORCE ROW LEVEL SECURITY;

CREATE POLICY rounding_rule_tenant_access
    ON control.rounding_rule FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY rounding_rule_seed_write
    ON control.rounding_rule FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);

ALTER TABLE control.rounding_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.rounding_context FORCE ROW LEVEL SECURITY;

CREATE POLICY rounding_context_tenant_access
    ON control.rounding_context FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY rounding_context_seed_write
    ON control.rounding_context FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
