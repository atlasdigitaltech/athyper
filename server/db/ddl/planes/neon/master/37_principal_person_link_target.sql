-- Bounded identity-only admission for the registered HR link action. This is
-- separate from Principal field reads and grants no generic IAM administration.
CREATE OR REPLACE FUNCTION master.entity_person_link_target_v1(request_tenant uuid,request_owner uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE gate jsonb; target uuid;
BEGIN
  gate:=coalesce(nullif(current_setting('app.entity_person_link_authority',true),''),'{}')::jsonb;
  IF current_database() NOT LIKE '%neon'
    OR request_tenant IS DISTINCT FROM shared.current_tenant_id_soft()
    OR master.current_principal_id_soft() IS NULL
    OR jsonb_typeof(gate)<>'object'
    OR gate->>'tenantId' IS DISTINCT FROM request_tenant::text
    OR gate->>'actorId' IS DISTINCT FROM master.current_principal_id_soft()::text
    OR gate->>'principalId' IS DISTINCT FROM request_owner::text
    OR gate->>'permissionCode' IS DISTINCT FROM 'neon.workforce.profile.write'
    OR gate->>'handlerKey' IS DISTINCT FROM 'identity.principal.link_person.v1'
    OR coalesce(gate->>'sourceRevision','') !~ '^source-sha256:[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ENTITY_LINK_AUTHORITY_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM id FROM master.employment WHERE tenant_id=request_tenant
    AND id::text=gate->>'employmentId' AND person_id::text=gate->>'personId'
    AND company_code_id::text=gate->>'companyCodeId' AND status='active' AND employment_status='active'
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_LINK_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
  SELECT id INTO target FROM master.principal WHERE tenant_id=request_tenant
    AND id=request_owner AND principal_type='user' AND status='active' FOR UPDATE;
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION master.entity_person_link_target_v1(uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='athyperapp') THEN
   GRANT EXECUTE ON FUNCTION master.entity_person_link_target_v1(uuid,uuid) TO athyperapp;
 END IF;
END $$;
