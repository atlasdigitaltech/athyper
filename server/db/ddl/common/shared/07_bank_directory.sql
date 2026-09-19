-- Invoker-rights publication: consumers have no write or execute permission.
CREATE FUNCTION shared.reject_bank_directory_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published bank directory records and stable identities are immutable'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bank_directory_release','bank_institution','bank_branch','bank_institution_version','bank_branch_version','bank_identifier','bank_directory_source_record'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_bank_directory BEFORE UPDATE OR DELETE ON shared.%I FOR EACH ROW EXECUTE FUNCTION shared.reject_bank_directory_mutation()',t);
 END LOOP;
END $$;

CREATE FUNCTION shared.publish_bank_directory(p_id uuid,p_version bigint,p_published_at timestamptz,p_sources jsonb,p_payload jsonb,p_expected_hash text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,shared AS $$
DECLARE existing shared.bank_directory_release; r jsonb; previous uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(913602019);
 IF encode(public.digest(p_payload::text,'sha256'),'hex') IS DISTINCT FROM p_expected_hash THEN
  RAISE EXCEPTION 'Bank directory payload hash mismatch';
 END IF;
 IF jsonb_typeof(p_sources) <> 'array' OR jsonb_array_length(p_sources)=0
 OR jsonb_typeof(p_payload->'institutions') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_payload->'branches') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_payload->'identifiers') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_payload->'sourceRecords') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Bank directory requires sources and complete typed collections';
 END IF;
 SELECT * INTO existing FROM shared.bank_directory_release WHERE id=p_id OR version=p_version;
 IF FOUND THEN
  IF existing.id=p_id AND existing.version=p_version AND existing.content_hash=p_expected_hash AND existing.source_manifest=p_sources AND existing.published_at=p_published_at THEN RETURN p_id; END IF;
  RAISE EXCEPTION 'Bank directory release identity collision';
 END IF;
 IF p_version <= COALESCE((SELECT max(version) FROM shared.bank_directory_release),0) THEN RAISE EXCEPTION 'Bank directory release version must advance'; END IF;
 SELECT release_id INTO previous FROM shared.bank_directory_activation WHERE singleton;
 INSERT INTO shared.bank_directory_release(id,version,published_at,source_manifest,payload,content_hash)
 VALUES(p_id,p_version,p_published_at,p_sources,p_payload,p_expected_hash);
 FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'institutions') LOOP
  INSERT INTO shared.bank_institution(id) VALUES((r->>'id')::uuid) ON CONFLICT DO NOTHING;
  INSERT INTO shared.bank_institution_version VALUES(p_id,(r->>'id')::uuid,r->>'name',r->>'countryCode',r->>'institutionType',r->>'status',(r->>'effectiveFrom')::date,(r->>'effectiveUntil')::date);
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'branches') LOOP
  INSERT INTO shared.bank_branch(id,institution_id) VALUES((r->>'id')::uuid,(r->>'institutionId')::uuid) ON CONFLICT DO NOTHING;
  INSERT INTO shared.bank_branch_version VALUES(p_id,(r->>'id')::uuid,(r->>'institutionId')::uuid,r->>'name',r->>'countryCode',r->'location',r->>'status',(r->>'effectiveFrom')::date,(r->>'effectiveUntil')::date);
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'identifiers') LOOP
  INSERT INTO shared.bank_identifier VALUES(p_id,(r->>'id')::uuid,(r->>'institutionId')::uuid,(r->>'branchId')::uuid,r->>'scheme',r->>'schemeNamespace',r->>'jurisdiction',r->>'value',(r->>'effectiveFrom')::date,(r->>'effectiveUntil')::date);
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'sourceRecords') LOOP
  INSERT INTO shared.bank_directory_source_record VALUES(p_id,r->>'source',r->>'sourceRecordId',(r->>'institutionId')::uuid,(r->>'branchId')::uuid);
 END LOOP;
 -- Full snapshots retain every previously published identity, including retired entries.
 IF EXISTS(SELECT 1 FROM shared.bank_institution i WHERE NOT EXISTS(SELECT 1 FROM shared.bank_institution_version v WHERE v.release_id=p_id AND v.institution_id=i.id))
 OR EXISTS(SELECT 1 FROM shared.bank_branch b WHERE NOT EXISTS(SELECT 1 FROM shared.bank_branch_version v WHERE v.release_id=p_id AND v.branch_id=b.id)) THEN RAISE EXCEPTION 'Directory release must retain historical identities'; END IF;
 IF EXISTS(SELECT 1 FROM shared.bank_directory_source_record old JOIN shared.bank_directory_source_record new USING(source,source_record_id) WHERE new.release_id=p_id AND old.release_id<>p_id AND ROW(old.institution_id,old.branch_id) IS DISTINCT FROM ROW(new.institution_id,new.branch_id)) THEN RAISE EXCEPTION 'Source identity cannot be silently reassigned'; END IF;
 IF EXISTS(SELECT 1 FROM shared.bank_directory_source_record old WHERE old.release_id=previous AND NOT EXISTS(SELECT 1 FROM shared.bank_directory_source_record new WHERE new.release_id=p_id AND new.source=old.source AND new.source_record_id=old.source_record_id)) THEN RAISE EXCEPTION 'Source mappings must be retained'; END IF;
 IF EXISTS(SELECT 1 FROM shared.bank_identifier old JOIN shared.bank_identifier new USING(id) WHERE new.release_id=p_id AND old.release_id<>p_id AND ROW(old.institution_id,old.branch_id,old.scheme,old.scheme_namespace,old.jurisdiction,old.value) IS DISTINCT FROM ROW(new.institution_id,new.branch_id,new.scheme,new.scheme_namespace,new.jurisdiction,new.value)) THEN RAISE EXCEPTION 'Identifier identities cannot be reassigned'; END IF;
 INSERT INTO shared.bank_directory_activation(singleton,release_id) VALUES(true,p_id)
 ON CONFLICT(singleton) DO UPDATE SET release_id=excluded.release_id,activated_at=now();
 RETURN p_id;
END $$;

-- Rehearsal is an exception subtransaction: no materialized row or activation survives.
CREATE FUNCTION shared.validate_bank_directory(r jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,shared AS $$
BEGIN
 BEGIN
  PERFORM shared.publish_bank_directory((r->>'id')::uuid,(r->>'version')::bigint,(r->>'publishedAt')::timestamptz,r->'sources',r->'payload',r->>'contentHash');
  RAISE EXCEPTION USING ERRCODE='BD001',MESSAGE='validated';
 EXCEPTION WHEN SQLSTATE 'BD001' THEN RETURN NULL;
 WHEN OTHERS THEN RETURN SQLERRM;
 END;
END $$;

-- Exact release resolution is deliberately independent of the active projection.
-- Missing published versions must never fall back to today's bank identity.
CREATE FUNCTION shared.resolve_bank_directory_reference(p_release_id uuid,p_institution_id uuid,p_branch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,shared AS $$
DECLARE r shared.bank_directory_release; i shared.bank_institution_version; b shared.bank_branch_version;
BEGIN
 SELECT * INTO r FROM shared.bank_directory_release WHERE id=p_release_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','pending','reason','directory_release_missing','releaseId',p_release_id); END IF;
 SELECT * INTO i FROM shared.bank_institution_version WHERE release_id=p_release_id AND institution_id=p_institution_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unresolved','reason','institution_missing','releaseId',p_release_id); END IF;
 IF p_branch_id IS NOT NULL THEN
  SELECT * INTO b FROM shared.bank_branch_version WHERE release_id=p_release_id AND institution_id=p_institution_id AND branch_id=p_branch_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','unresolved','reason','branch_parent_mismatch','releaseId',p_release_id); END IF;
 END IF;
 RETURN jsonb_build_object('state','resolved','releaseId',r.id,'version',r.version,'hash',r.content_hash,'institution',to_jsonb(i),'branch',CASE WHEN p_branch_id IS NULL THEN NULL ELSE to_jsonb(b) END,'identifiers',COALESCE((SELECT jsonb_agg(to_jsonb(bi) ORDER BY bi.id) FROM shared.bank_identifier bi WHERE bi.release_id=p_release_id AND bi.institution_id=p_institution_id AND bi.branch_id IS NOT DISTINCT FROM p_branch_id),'[]'::jsonb));
END $$;
