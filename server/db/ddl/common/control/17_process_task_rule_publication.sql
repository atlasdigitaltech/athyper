-- Append-only proposals and releases for task rules on an existing process selection.
-- The base publication, profile selection and all accepted attempt evidence remain immutable.
CREATE TABLE IF NOT EXISTS control.process_task_rule_proposal (
 policy_definition_id uuid PRIMARY KEY REFERENCES control.policy_definition(id),
 tenant_id uuid NOT NULL, base_publication_id uuid NOT NULL REFERENCES control.process_selection_publication(id),
 expected_release_id uuid, publication jsonb NOT NULL CHECK(jsonb_typeof(publication)='object'),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 UNIQUE(tenant_id,policy_definition_id)
);
CREATE TABLE IF NOT EXISTS control.process_task_rule_release (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, expected_release_id uuid,
 policy_definition_id uuid NOT NULL UNIQUE REFERENCES control.process_task_rule_proposal(policy_definition_id),
 base_publication_id uuid NOT NULL REFERENCES control.process_selection_publication(id),
 publication jsonb NOT NULL CHECK(jsonb_typeof(publication)='object'),
 activated_at timestamptz NOT NULL DEFAULT clock_timestamp(), activated_by uuid NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(base_publication_id,activated_at),
 UNIQUE NULLS NOT DISTINCT(base_publication_id,expected_release_id),
 FOREIGN KEY(tenant_id,expected_release_id) REFERENCES control.process_task_rule_release(tenant_id,id),
 FOREIGN KEY(tenant_id,policy_definition_id) REFERENCES control.process_task_rule_proposal(tenant_id,policy_definition_id)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='process_task_rule_expected_release_fk' AND conrelid='control.process_task_rule_proposal'::regclass) THEN
  ALTER TABLE control.process_task_rule_proposal ADD CONSTRAINT process_task_rule_expected_release_fk FOREIGN KEY(tenant_id,expected_release_id) REFERENCES control.process_task_rule_release(tenant_id,id);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION control.trg_guard_process_task_rule_release()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p control.process_task_rule_proposal%ROWTYPE; current_release uuid; base control.process_selection_publication%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Task rule publication records are immutable' USING ERRCODE='55000'; END IF;
 SELECT * INTO base FROM control.process_selection_publication WHERE id=NEW.base_publication_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 IF base.id IS NULL OR NEW.publication->'scope' IS DISTINCT FROM base.publication->'scope' OR NEW.publication->'policy' IS DISTINCT FROM base.publication->'policy' THEN RAISE EXCEPTION 'Task rule base scope or selection mismatch' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='process_task_rule_release' THEN
  SELECT * INTO p FROM control.process_task_rule_proposal WHERE tenant_id=NEW.tenant_id AND policy_definition_id=NEW.policy_definition_id;
  SELECT id INTO current_release FROM control.process_task_rule_release WHERE tenant_id=NEW.tenant_id AND base_publication_id=NEW.base_publication_id ORDER BY activated_at DESC LIMIT 1;
  IF p.policy_definition_id IS NULL OR p.base_publication_id<>NEW.base_publication_id OR p.publication IS DISTINCT FROM NEW.publication OR p.expected_release_id IS DISTINCT FROM current_release OR p.created_by=NEW.activated_by
    OR NOT EXISTS(SELECT 1 FROM control.policy_definition WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_definition_id AND status='active') THEN
    RAISE EXCEPTION 'Task rule publication stale or not independently approved' USING ERRCODE='40001';
  END IF;
  NEW.expected_release_id:=p.expected_release_id;
  NEW.activated_at:=GREATEST(clock_timestamp(),COALESCE((SELECT activated_at+interval '1 microsecond' FROM control.process_task_rule_release WHERE id=current_release),clock_timestamp()));
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['process_task_rule_proposal','process_task_rule_release'] LOOP
  EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS task_rules_read ON control.%I',t);
  EXECUTE format('CREATE POLICY task_rules_read ON control.%I FOR SELECT TO athyperapp USING(tenant_id=shared.current_tenant_id_soft())',t);
  EXECUTE format('DROP POLICY IF EXISTS task_rules_admin ON control.%I',t);
  EXECUTE format('CREATE POLICY task_rules_admin ON control.%I FOR ALL TO athyperadmin USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft())',t);
  EXECUTE format('DROP TRIGGER IF EXISTS task_rules_immutable ON control.%I',t);
  EXECUTE format('CREATE TRIGGER task_rules_immutable BEFORE INSERT OR UPDATE OR DELETE ON control.%I FOR EACH ROW EXECUTE FUNCTION control.trg_guard_process_task_rule_release()',t);
  EXECUTE format('REVOKE ALL ON control.%I FROM PUBLIC,athyperapp',t);
  EXECUTE format('GRANT SELECT ON control.%I TO athyperapp',t);
  EXECUTE format('GRANT SELECT,INSERT ON control.%I TO athyperadmin',t);
 END LOOP;
END $$;

-- The existing worker login is a bounded publication service, not an administrator.
-- API publication uses its separate writer pool only after Studio authorization.
DO $$ DECLARE t text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_worker') THEN
  GRANT USAGE ON SCHEMA control,master,snapshot,authz,event TO athyper_worker;
  DROP POLICY IF EXISTS task_publication_identity_read ON master.principal_identity_binding;
  CREATE POLICY task_publication_identity_read ON master.principal_identity_binding FOR SELECT TO athyper_worker USING(tenant_id=shared.current_tenant_id_soft());
  GRANT SELECT ON control.policy_definition,control.policy_rule,control.policy_test_case,control.policy_test_result,
   control.process_selection_publication,control.process_selection_catalog_revision,control.cycle_template_revision,
   control.process_task_rule_proposal,control.process_task_rule_release,
   master.template,master.template_binding,master.principal,master.principal_identity_binding,snapshot.template_version,authz.role,event.command_execution TO athyper_worker;
  GRANT INSERT,UPDATE ON control.policy_definition,control.policy_rule,control.policy_test_case TO athyper_worker;
  GRANT INSERT ON control.policy_test_result,control.process_task_rule_proposal,control.process_task_rule_release,
   control.process_selection_catalog_revision,event.command_execution,event.outbox TO athyper_worker;
  GRANT UPDATE(id) ON control.process_selection_publication TO athyper_worker;
  DROP POLICY IF EXISTS task_writer_read ON control.policy_definition;
  CREATE POLICY task_writer_read ON control.policy_definition FOR SELECT TO athyper_worker USING(tenant_id=shared.current_tenant_id_soft());
  DROP POLICY IF EXISTS task_writer_insert ON control.policy_definition;
  CREATE POLICY task_writer_insert ON control.policy_definition FOR INSERT TO athyper_worker WITH CHECK(tenant_id=shared.current_tenant_id_soft() AND entity_type='workflow.task_edit' AND created_by=master.current_principal_id_soft());
  DROP POLICY IF EXISTS task_writer_update ON control.policy_definition;
  CREATE POLICY task_writer_update ON control.policy_definition FOR UPDATE TO athyper_worker USING(tenant_id=shared.current_tenant_id_soft() AND entity_type='workflow.task_edit') WITH CHECK(tenant_id=shared.current_tenant_id_soft() AND entity_type='workflow.task_edit');
  FOREACH t IN ARRAY ARRAY['policy_rule','policy_test_case'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS task_writer_read ON control.%I',t);
   EXECUTE format('CREATE POLICY task_writer_read ON control.%I FOR SELECT TO athyper_worker USING(EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.tenant_id=shared.current_tenant_id_soft()))',t);
   EXECUTE format('DROP POLICY IF EXISTS task_writer_write ON control.%I',t);
   EXECUTE format('CREATE POLICY task_writer_write ON control.%I FOR ALL TO athyper_worker USING(EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.tenant_id=shared.current_tenant_id_soft() AND d.entity_type=''workflow.task_edit'')) WITH CHECK(EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.tenant_id=shared.current_tenant_id_soft() AND d.entity_type=''workflow.task_edit''))',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['process_task_rule_proposal','process_task_rule_release'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS task_writer ON control.%I',t);
   EXECUTE format('CREATE POLICY task_writer ON control.%I FOR ALL TO athyper_worker USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft())',t);
  END LOOP;
 END IF;
END $$;

ALTER TABLE control.policy_test_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.policy_test_result FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_result_admin ON control.policy_test_result;
CREATE POLICY task_result_admin ON control.policy_test_result FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS task_result_tenant_read ON control.policy_test_result;
CREATE POLICY task_result_tenant_read ON control.policy_test_result FOR SELECT USING(EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.tenant_id=shared.current_tenant_id_soft()));
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_worker') THEN
 DROP POLICY IF EXISTS task_writer_result ON control.policy_test_result;
 CREATE POLICY task_writer_result ON control.policy_test_result FOR INSERT TO athyper_worker WITH CHECK(executed_by=master.current_principal_id_soft() AND EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.tenant_id=shared.current_tenant_id_soft() AND d.entity_type='workflow.task_edit'));
 DROP POLICY IF EXISTS task_writer_manifest ON control.process_selection_catalog_revision;
 CREATE POLICY task_writer_manifest ON control.process_selection_catalog_revision AS RESTRICTIVE FOR INSERT TO athyper_worker WITH CHECK(kind='manifest' AND tenant_id=shared.current_tenant_id_soft() AND EXISTS(SELECT 1 FROM control.process_task_rule_proposal p CROSS JOIN LATERAL jsonb_array_elements(p.publication->'manifests') m WHERE p.tenant_id=process_selection_catalog_revision.tenant_id AND m->'revision'->>'id'=process_selection_catalog_revision.id::text AND m=process_selection_catalog_revision.definition));
END IF; END $$;
