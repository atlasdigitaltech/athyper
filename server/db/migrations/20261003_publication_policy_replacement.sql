-- Add exact, independently reviewed policy replacement to installed Studio.
BEGIN;
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio required'; END IF; END $$;
-- Shared DEV control-plane lifecycle. Immutable pins/receipt; no workload write
-- grant and no change to the single-active-source publication guard.
CREATE TABLE IF NOT EXISTS control.publication_policy_replacement (
  tenant_id uuid NOT NULL,
  replacement_id uuid PRIMARY KEY REFERENCES control.policy_definition(id),
  replacement_hash text NOT NULL CHECK (replacement_hash ~ '^[a-f0-9]{64}$'),
  retired jsonb NOT NULL CHECK (jsonb_typeof(retired)='array' AND jsonb_array_length(retired) BETWEEN 1 AND 32),
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE control.publication_policy_replacement ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.publication_policy_replacement FORCE ROW LEVEL SECURITY;
REVOKE ALL ON control.publication_policy_replacement FROM PUBLIC;
DO $replacement$ BEGIN
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
  GRANT SELECT,INSERT ON control.publication_policy_replacement TO athyper_control_api;
  DROP POLICY IF EXISTS control_replacement_read ON control.publication_policy_replacement;
  CREATE POLICY control_replacement_read ON control.publication_policy_replacement FOR SELECT TO athyper_control_api
    USING(tenant_id=shared.current_tenant_id_soft() AND actor_id=master.current_principal_id_soft());
  DROP POLICY IF EXISTS control_replacement_insert ON control.publication_policy_replacement;
  CREATE POLICY control_replacement_insert ON control.publication_policy_replacement FOR INSERT TO athyper_control_api
    WITH CHECK(tenant_id=shared.current_tenant_id_soft() AND actor_id=master.current_principal_id_soft()
      AND EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=replacement_id AND d.tenant_id=shared.current_tenant_id_soft()
        AND d.entity_type='metadata.publication' AND d.status='active' AND d.definition_hash=replacement_hash
        AND d.updated_by=master.current_principal_id_soft() AND d.created_by<>d.updated_by));
  DROP POLICY IF EXISTS control_publication_retire ON control.policy_definition;
  CREATE POLICY control_publication_retire ON control.policy_definition FOR UPDATE TO athyper_control_api
    USING(tenant_id=shared.current_tenant_id_soft() AND entity_type='metadata.publication' AND status IN ('active','retired')
      AND created_by<>master.current_principal_id_soft() AND updated_by=master.current_principal_id_soft()
      AND EXISTS(SELECT 1 FROM master.principal p JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id
        WHERE p.id=master.current_principal_id_soft() AND p.tenant_id=shared.current_tenant_id_soft()
          AND p.status='active' AND p.principal_type='user' AND b.status='active' AND b.service_client_id IS NULL
          AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api'))
    WITH CHECK(tenant_id=shared.current_tenant_id_soft() AND entity_type='metadata.publication' AND status='retired'
      AND created_by<>master.current_principal_id_soft() AND updated_by=master.current_principal_id_soft()
      AND EXISTS(SELECT 1 FROM control.publication_policy_replacement receipt
        WHERE receipt.tenant_id=shared.current_tenant_id_soft() AND receipt.actor_id=master.current_principal_id_soft()
          AND receipt.retired @> jsonb_build_array(jsonb_build_object('id',policy_definition.id,'hash',policy_definition.definition_hash))));
END IF;
END $replacement$;
-- Keep signed policy content and retired history immutable. The only new
-- transition is the exact receipted retirement by the restricted control role.
CREATE OR REPLACE FUNCTION control.trg_fn_protect_published_policy_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE definition_status text;
BEGIN
  IF TG_TABLE_NAME='policy_definition' THEN
    definition_status:=OLD.status;
    IF TG_OP='UPDATE' AND current_user='athyper_control_api' AND OLD.status='active' AND NEW.status='retired'
      AND OLD.entity_type='metadata.publication' AND OLD.tenant_id=shared.current_tenant_id_soft()
      AND OLD.created_by<>master.current_principal_id_soft() AND OLD.updated_by=master.current_principal_id_soft()
      AND (to_jsonb(NEW)-ARRAY['status','updated_at','is_active'])=(to_jsonb(OLD)-ARRAY['status','updated_at','is_active'])
      AND EXISTS(SELECT 1 FROM control.publication_policy_replacement r WHERE r.tenant_id=OLD.tenant_id
        AND r.actor_id=master.current_principal_id_soft()
        AND r.retired @> jsonb_build_array(jsonb_build_object('id',OLD.id,'hash',OLD.definition_hash))) THEN
      RETURN NEW;
    END IF;
  ELSE
    SELECT status INTO definition_status FROM control.policy_definition
      WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW.policy_definition_id ELSE OLD.policy_definition_id END FOR SHARE;
    IF TG_OP='UPDATE' AND NEW.policy_definition_id IS DISTINCT FROM OLD.policy_definition_id THEN
      RAISE EXCEPTION 'Policy children cannot move between revisions' USING ERRCODE='55000';
    END IF;
  END IF;
  IF definition_status IN ('published','active','retired') THEN
    RAISE EXCEPTION 'Published policy definition revisions and their children are immutable' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,
 allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('metadata_publication_policy_replacement','^metadata[.]publication[.]policy[.]replaced$',24,ARRAY['execute']::audit.operation_d[],
 'critical',ARRAY['user']::audit.actor_type_d[],'tenant',false,'metadata',16384,1,
 '{"owner":"publication","purpose":"independent_exact_policy_replacement"}'::jsonb,'active') ON CONFLICT(code) DO NOTHING;

COMMIT;
