-- Narrow machine-policy evidence read. Principal RLS remains unchanged.
-- Caller sees a boolean for its exact enrolled policy, never principal records.
CREATE OR REPLACE FUNCTION control.publication_policy_enrollment_is_active(
  p_id uuid, p_hash text, p_author uuid, p_publisher uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,control,master,shared AS $$
 SELECT EXISTS(
  SELECT 1 FROM control.policy_definition d
  JOIN master.principal reviewer ON reviewer.tenant_id=d.tenant_id AND reviewer.id=d.updated_by
    AND reviewer.status='active' AND reviewer.principal_type='user'
  JOIN master.principal publisher ON publisher.tenant_id=d.tenant_id AND publisher.id=p_publisher
    AND publisher.status='active' AND publisher.principal_type='service_account'
  WHERE d.id=p_id AND d.tenant_id=shared.current_tenant_id_soft()
    AND p_publisher=master.current_principal_id_soft() AND p_author<>p_publisher
    AND d.entity_type='metadata.publication' AND d.definition_hash=p_hash AND d.status='active'
    AND d.updated_by<>d.created_by AND d.updated_by<>p_author AND d.updated_by<>p_publisher
    AND (SELECT count(*) FROM control.policy_rule r WHERE r.policy_definition_id=d.id)=1
    AND EXISTS(SELECT 1 FROM control.policy_rule r WHERE r.policy_definition_id=d.id AND r.action_code='allow'
      AND r.action_config->>'schema'='athyper.machine-publication-enrollment/1'
      AND r.action_config->>'environment'='dev'
      AND r.action_config->>'tenantId'=d.tenant_id::text
      AND r.action_config#>>'{policy,authorPrincipalId}'=p_author::text
      AND r.action_config#>>'{policy,publisherPrincipalId}'=p_publisher::text)
    AND NOT EXISTS(SELECT 1 FROM control.policy_definition newer
      WHERE newer.tenant_id=d.tenant_id AND newer.entity_type=d.entity_type AND newer.name=d.name
        AND newer.id<>d.id AND newer.status='active' AND newer.version_no>=d.version_no)
 );
$$;
REVOKE ALL ON FUNCTION control.publication_policy_enrollment_is_active(uuid,text,uuid,uuid) FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['athyper_runtime','athyper_worker'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION control.publication_policy_enrollment_is_active(uuid,text,uuid,uuid) TO %I',r);
  END IF;
 END LOOP;
END $$;
