-- Projection ownership evidence only. Canonical Person data remains in its source plane.
CREATE OR REPLACE FUNCTION master.trg_projected_profile_source_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE old_owner uuid; new_owner uuid; old_tenant uuid; new_tenant uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN old_owner:=OLD.principal_id; old_tenant:=OLD.tenant_id; END IF;
  IF TG_OP<>'DELETE' THEN new_owner:=NEW.principal_id; new_tenant:=NEW.tenant_id; END IF;
  PERFORM p.id FROM master.principal p WHERE (p.tenant_id=old_tenant AND p.id=old_owner)
    OR (p.tenant_id=new_tenant AND p.id=new_owner) ORDER BY p.tenant_id,p.id FOR UPDATE;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION master.trg_projected_profile_source_fence() FROM PUBLIC;

CREATE OR REPLACE FUNCTION master.entity_projected_profile_source_v1(request_tenant uuid,request_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE owner_row master.principal%ROWTYPE; binding record; sources jsonb:='[]';
  evidence jsonb:='[]'; incomplete boolean:=false; revision text;
BEGIN
  IF (current_database() NOT LIKE '%studio' AND current_database() NOT LIKE '%mesh')
    OR request_tenant IS DISTINCT FROM shared.current_tenant_id_soft()
    OR master.current_principal_id_soft() IS NULL THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_CONTEXT_INVALID' USING ERRCODE='42501';
  END IF;
  SELECT * INTO owner_row FROM master.principal WHERE tenant_id=request_tenant AND id=request_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_SOURCE_OWNER_UNAVAILABLE'; END IF;
  incomplete:=owner_row.status<>'active';
  FOR binding IN SELECT id,status,sync_status,metadata,updated_at FROM master.principal_identity_binding
    WHERE tenant_id=request_tenant AND principal_id=request_owner
      AND metadata ?| ARRAY['trustIamIdentityId','personId','sourcePlane','sourceTenantId'] ORDER BY id LOOP
    evidence:=evidence||jsonb_build_array(to_jsonb(binding));
    IF binding.status<>'active' OR binding.sync_status<>'synced'
      OR coalesce(binding.metadata->>'trustIamIdentityId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR owner_row.external_ref IS DISTINCT FROM 'trustiam:'||(binding.metadata->>'trustIamIdentityId')
      OR coalesce(binding.metadata->>'sourcePlane','')<>'neon'
      OR coalesce(binding.metadata->>'sourceTenantId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR coalesce(binding.metadata->>'personId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR coalesce(binding.metadata->>'desiredHash','') !~ '^[a-f0-9]{64}$'
      OR coalesce(binding.metadata->>'desiredVersion','') !~ '^[1-9][0-9]*$' THEN incomplete:=true;
    ELSE
      sources:=sources||jsonb_build_array(jsonb_build_object('plane','neon','tenantId',binding.metadata->>'sourceTenantId',
        'entityCode','person','recordId',binding.metadata->>'personId','verified',true));
    END IF;
  END LOOP;
  IF (owner_row.external_ref LIKE 'trustiam:%' OR owner_row.metadata ?| ARRAY['personId','sourcePlane','sourceTenantId'])
    AND jsonb_array_length(sources)=0 THEN incomplete:=true; END IF;
  revision:='source-sha256:'||encode(sha256(convert_to(jsonb_build_array(evidence,owner_row.external_ref,
    owner_row.metadata,owner_row.status)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('tenantId',request_tenant,'principalId',request_owner,'revision',revision,
    'complete',NOT incomplete,'fenced',true,'state',CASE WHEN incomplete THEN 'unresolved'
      WHEN jsonb_array_length(sources)=0 THEN 'confirmed_unlinked' ELSE 'linked' END,'sources',sources);
END $$;
REVOKE ALL ON FUNCTION master.entity_projected_profile_source_v1(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION master.trg_projected_profile_source_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master SET row_security=off AS $$
DECLARE evidence jsonb;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.principal_id IS DISTINCT FROM OLD.principal_id) THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_OWNER_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  evidence:=master.entity_projected_profile_source_v1(NEW.tenant_id,NEW.principal_id);
  IF evidence->>'state'<>'confirmed_unlinked' OR evidence->>'complete'<>'true' THEN
    RAISE EXCEPTION 'ENTITY_SOURCE_MANAGED_OR_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION master.trg_projected_profile_source_guard() FROM PUBLIC;
DO $$ BEGIN
  IF current_database() LIKE '%studio' OR current_database() LIKE '%mesh' THEN
    DROP TRIGGER IF EXISTS trg_projected_profile_source_fence ON master.principal_identity_binding;
    CREATE TRIGGER trg_projected_profile_source_fence BEFORE INSERT OR UPDATE OR DELETE ON master.principal_identity_binding
      FOR EACH ROW EXECUTE FUNCTION master.trg_projected_profile_source_fence();
    DROP TRIGGER IF EXISTS trg_projected_profile_source_guard ON master.principal_profile;
    CREATE TRIGGER trg_projected_profile_source_guard BEFORE INSERT OR UPDATE ON master.principal_profile
      FOR EACH ROW EXECUTE FUNCTION master.trg_projected_profile_source_guard();
    GRANT EXECUTE ON FUNCTION master.entity_projected_profile_source_v1(uuid,uuid) TO athyperapp;
  END IF;
END $$;
