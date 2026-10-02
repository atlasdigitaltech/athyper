-- Coordinates only: this authority never copies personal information or grants IAM access.
CREATE TABLE IF NOT EXISTS master.principal_person_link (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  person_id uuid NOT NULL,
  record_version bigint NOT NULL DEFAULT 1 CHECK(record_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,principal_id),
  UNIQUE(tenant_id,person_id),
  FOREIGN KEY(tenant_id,principal_id) REFERENCES master.principal(tenant_id,id),
  FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id),
  CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE master.principal_person_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_person_link FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS principal_person_link_tenant ON master.principal_person_link;
CREATE POLICY principal_person_link_tenant ON master.principal_person_link
  USING(tenant_id=shared.current_tenant_id_soft())
  WITH CHECK(tenant_id=shared.current_tenant_id());

-- All writers, including legacy Employee and identity binding writers, share
-- the parent-row fence. Plain source reads do not wait on child row locks.
CREATE OR REPLACE FUNCTION master.trg_profile_source_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE old_owner uuid; new_owner uuid; old_tenant uuid; new_tenant uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN old_owner:=OLD.principal_id; old_tenant:=OLD.tenant_id; END IF;
  IF TG_OP<>'DELETE' THEN new_owner:=NEW.principal_id; new_tenant:=NEW.tenant_id; END IF;
  PERFORM p.id FROM master.principal p
    WHERE (p.tenant_id=old_tenant AND p.id=old_owner)
       OR (p.tenant_id=new_tenant AND p.id=new_owner)
    ORDER BY p.tenant_id,p.id FOR UPDATE;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION master.trg_profile_source_fence() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_profile_source_fence ON master.principal_person_link;
CREATE TRIGGER trg_profile_source_fence BEFORE INSERT OR UPDATE OR DELETE ON master.principal_person_link
  FOR EACH ROW EXECUTE FUNCTION master.trg_profile_source_fence();
DROP TRIGGER IF EXISTS trg_profile_source_fence ON master.employee;
CREATE TRIGGER trg_profile_source_fence BEFORE INSERT OR UPDATE OR DELETE ON master.employee
  FOR EACH ROW EXECUTE FUNCTION master.trg_profile_source_fence();
DROP TRIGGER IF EXISTS trg_profile_source_fence ON master.principal_identity_binding;
CREATE TRIGGER trg_profile_source_fence BEFORE INSERT OR UPDATE OR DELETE ON master.principal_identity_binding
  FOR EACH ROW EXECUTE FUNCTION master.trg_profile_source_fence();

-- Called after Entity owner authorization, inside the caller's transaction.
-- SECURITY DEFINER deliberately enumerates complete bounded authority evidence:
-- an RLS-filtered empty Employee query must never certify an unlinked user.
CREATE OR REPLACE FUNCTION master.entity_profile_source_v1(request_tenant uuid,request_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE owner_row master.principal%ROWTYPE; sources jsonb; evidence jsonb;
  trusted_binding record; incomplete boolean:=false; revision text;
BEGIN
  IF current_database() NOT LIKE '%neon'
     OR request_tenant IS DISTINCT FROM shared.current_tenant_id_soft()
     OR master.current_principal_id_soft() IS NULL THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_CONTEXT_INVALID' USING ERRCODE='42501';
  END IF;
  SELECT * INTO owner_row FROM master.principal
    WHERE tenant_id=request_tenant AND id=request_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_SOURCE_OWNER_UNAVAILABLE'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('plane','neon','tenantId',request_tenant,
    'entityCode','person','recordId',q.person_id,'verified',true) ORDER BY q.person_id),'[]'::jsonb),
    coalesce(jsonb_agg(q.evidence ORDER BY q.person_id,q.evidence::text),'[]'::jsonb)
    INTO sources,evidence FROM (
      SELECT person_id,jsonb_build_array('link',id,record_version) evidence
        FROM master.principal_person_link WHERE tenant_id=request_tenant AND principal_id=request_owner
      UNION ALL
      SELECT person_id,jsonb_build_array('employee',id,updated_at,status) evidence
        FROM master.employee WHERE tenant_id=request_tenant AND principal_id=request_owner
    ) q;
  FOR trusted_binding IN SELECT id,status,sync_status,metadata,updated_at
    FROM master.principal_identity_binding
    WHERE tenant_id=request_tenant AND principal_id=request_owner
      AND metadata ? 'trustIamIdentityId' ORDER BY id LOOP
    -- Binding origin and correlation are protected by the existing IAM writer.
    -- Coordinates alone are ownership evidence, never a source-read grant.
    evidence:=evidence||jsonb_build_array(to_jsonb(trusted_binding));
    IF trusted_binding.sync_status<>'synced'
       OR owner_row.external_ref IS DISTINCT FROM 'trustiam:'||(trusted_binding.metadata->>'trustIamIdentityId')
       OR coalesce(trusted_binding.metadata->>'sourcePlane','') NOT IN ('neon','studio','mesh')
       OR coalesce(trusted_binding.metadata->>'sourceTenantId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR coalesce(trusted_binding.metadata->>'personId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR coalesce(trusted_binding.metadata->>'desiredHash','') !~ '^[a-f0-9]{64}$'
       OR coalesce(trusted_binding.metadata->>'desiredVersion','') !~ '^[1-9][0-9]*$' THEN
      incomplete:=true;
    ELSE
      sources:=sources||jsonb_build_array(jsonb_build_object('plane',trusted_binding.metadata->>'sourcePlane',
        'tenantId',trusted_binding.metadata->>'sourceTenantId','entityCode','person',
        'recordId',trusted_binding.metadata->>'personId','verified',true));
    END IF;
  END LOOP;
  IF (owner_row.external_ref LIKE 'trustiam:%' OR owner_row.metadata ? 'personId')
     AND jsonb_array_length(sources)=0 THEN incomplete:=true; END IF;
  revision:='source-sha256:'||encode(sha256(convert_to(jsonb_build_array(evidence,
    owner_row.external_ref,owner_row.metadata,owner_row.status)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('tenantId',request_tenant,'principalId',request_owner,'revision',revision,
    'complete',NOT incomplete,'fenced',true,'state',CASE WHEN incomplete THEN 'unresolved'
      WHEN jsonb_array_length(sources)=0 THEN 'confirmed_unlinked' ELSE 'linked' END,'sources',sources);
END $$;
REVOKE ALL ON FUNCTION master.entity_profile_source_v1(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION master.trg_principal_profile_source_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE evidence jsonb;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.principal_id IS DISTINCT FROM OLD.principal_id) THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_OWNER_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  evidence:=master.entity_profile_source_v1(NEW.tenant_id,NEW.principal_id);
  IF evidence->>'state'<>'confirmed_unlinked' OR evidence->>'complete'<>'true' THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_MANAGED_OR_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION master.trg_principal_profile_source_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_principal_profile_source_guard ON master.principal_profile;
CREATE TRIGGER trg_principal_profile_source_guard BEFORE INSERT OR UPDATE ON master.principal_profile
  FOR EACH ROW EXECUTE FUNCTION master.trg_principal_profile_source_guard();

-- Invoked only by the registered Entity action after HR scope authorization.
-- Ordinary app code receives no direct table write privilege.
CREATE OR REPLACE FUNCTION master.entity_link_person_v1(request_tenant uuid,request_owner uuid,
  request_person uuid,expected_source_revision text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE evidence jsonb; link_id uuid; gate jsonb;
BEGIN
  gate:=coalesce(nullif(current_setting('app.entity_person_link_authority',true),''),'{}')::jsonb;
  IF jsonb_typeof(gate)<>'object'
     OR gate->>'tenantId' IS DISTINCT FROM request_tenant::text
     OR gate->>'actorId' IS DISTINCT FROM master.current_principal_id_soft()::text
     OR gate->>'principalId' IS DISTINCT FROM request_owner::text
     OR gate->>'personId' IS DISTINCT FROM request_person::text
     OR gate->>'sourceRevision' IS DISTINCT FROM expected_source_revision
     OR gate->>'permissionCode' IS DISTINCT FROM 'neon.workforce.profile.write'
     OR gate->>'handlerKey' IS DISTINCT FROM 'identity.principal.link_person.v1' THEN
    RAISE EXCEPTION 'ENTITY_LINK_AUTHORITY_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM id FROM master.employment WHERE tenant_id=request_tenant
    AND id::text=gate->>'employmentId' AND person_id=request_person
    AND company_code_id::text=gate->>'companyCodeId' AND status='active' AND employment_status='active'
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_LINK_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
  evidence:=master.entity_profile_source_v1(request_tenant,request_owner);
  IF evidence->>'revision' IS DISTINCT FROM expected_source_revision THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_REVISION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF evidence->>'state'<>'confirmed_unlinked' OR evidence->>'complete'<>'true' THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_ALREADY_MANAGED' USING ERRCODE='23505';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=request_tenant AND id=request_owner
      AND principal_type='user' AND status='active') THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_PRINCIPAL_UNAVAILABLE' USING ERRCODE='23503';
  END IF;
  PERFORM id FROM master.person WHERE tenant_id=request_tenant AND id=request_person AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_SOURCE_PERSON_UNAVAILABLE' USING ERRCODE='23503'; END IF;
  IF EXISTS(SELECT 1 FROM master.employee WHERE tenant_id=request_tenant AND person_id=request_person
      AND principal_id IS NOT NULL AND principal_id<>request_owner) THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_PERSON_ALREADY_LINKED' USING ERRCODE='23505';
  END IF;
  INSERT INTO master.principal_person_link(tenant_id,principal_id,person_id,created_by)
    VALUES(request_tenant,request_owner,request_person,master.current_principal_id_soft()) RETURNING id INTO link_id;
  UPDATE master.employee SET principal_id=request_owner,updated_at=clock_timestamp(),
    updated_by=master.current_principal_id_soft()
    WHERE tenant_id=request_tenant AND person_id=request_person AND principal_id IS NULL;
  RETURN link_id;
END $$;
REVOKE ALL ON FUNCTION master.entity_link_person_v1(uuid,uuid,uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='athyperapp') THEN
    REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON master.principal_person_link FROM athyperapp;
    GRANT SELECT ON master.principal_person_link TO athyperapp;
    GRANT EXECUTE ON FUNCTION master.entity_profile_source_v1(uuid,uuid) TO athyperapp;
    GRANT EXECUTE ON FUNCTION master.entity_link_person_v1(uuid,uuid,uuid,text) TO athyperapp;
  END IF;
END $$;
COMMENT ON TABLE master.principal_person_link IS 'Governed explicit Principal-to-Person ownership. Retains login; no names, email, role assignments or personal-data copies. Mutations require registered Entity actions.';
