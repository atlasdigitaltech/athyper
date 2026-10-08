-- Server-owned adoption evidence. Never rewrite introduction provenance or
-- activate a reserved identity as a shortcut to draft authoring.
CREATE TABLE metadata.entity_field_identity_adoption (
 change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 field_identity_id uuid NOT NULL REFERENCES metadata.entity_field_identity(id) ON DELETE RESTRICT,
 target_field_id uuid NOT NULL,
 source_change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id) ON DELETE RESTRICT,
 source_field_id uuid NOT NULL REFERENCES metadata.entity_field(id) ON DELETE RESTRICT,
 source_revision bigint NOT NULL CHECK(source_revision>=0),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 proposal_hash text NOT NULL CHECK(proposal_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(change_set_id,field_identity_id), UNIQUE(change_set_id,target_field_id),
 CHECK(change_set_id<>source_change_set_id),
 FOREIGN KEY(source_change_set_id,source_revision) REFERENCES snapshot.entity_draft_save(change_set_id,lock_version) ON DELETE RESTRICT,
 FOREIGN KEY(target_field_id) REFERENCES metadata.entity_field(id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE metadata.entity_field_identity_adoption ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_field_identity_adoption FORCE ROW LEVEL SECURITY;
GRANT SELECT ON metadata.entity_field_identity_adoption TO athyper_product_command_app;
CREATE POLICY adoption_read ON metadata.entity_field_identity_adoption FOR SELECT TO athyper_product_command_app USING(entity_command_private.admitted(change_set_id));
CREATE POLICY adoption_read_fence ON metadata.entity_field_identity_adoption AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(entity_command_private.admitted(change_set_id));
CREATE FUNCTION metadata.guard_identity_adoption_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IDENTITY_ADOPTION_IMMUTABLE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER identity_adoption_immutable BEFORE UPDATE OR DELETE ON metadata.entity_field_identity_adoption FOR EACH ROW EXECUTE FUNCTION metadata.guard_identity_adoption_immutable();
CREATE FUNCTION metadata.guard_identity_adoption_target() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM metadata.entity_field f JOIN metadata.entity_change_set c ON c.id=f.change_set_id
 JOIN metadata.entity_field_identity i ON i.id=f.field_identity_id
 WHERE f.id=NEW.target_field_id AND f.change_set_id=NEW.change_set_id AND f.field_identity_id=NEW.field_identity_id
 AND c.entity_id=i.entity_id AND c.tenant_id IS NOT DISTINCT FROM i.tenant_id)
 OR NOT EXISTS(SELECT 1 FROM snapshot.entity_draft_save s WHERE s.change_set_id=NEW.change_set_id AND s.lock_version=1 AND s.graph_hash=NEW.proposal_hash)
 THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_TARGET_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER identity_adoption_target AFTER INSERT ON metadata.entity_field_identity_adoption DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.guard_identity_adoption_target();
-- Structural validity only, not read/write authority. Existing RLS and resource
-- security remain the caller's independent responsibility.
CREATE FUNCTION metadata.native_identity_available(p_draft uuid,p_identity uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM metadata.entity_field_identity i JOIN metadata.entity_change_set c ON c.id=p_draft
 WHERE i.id=p_identity AND i.entity_id=c.entity_id AND i.tenant_id IS NOT DISTINCT FROM c.tenant_id
 AND (i.identity_status='active' OR (i.identity_status='reserved' AND
 (i.introduced_change_set_id=p_draft OR EXISTS(SELECT 1 FROM metadata.entity_field_identity_adoption a WHERE a.change_set_id=p_draft AND a.field_identity_id=i.id)))))
$$;
CREATE FUNCTION entity_command_private.adopt_native_identity(p_target uuid,p_identity uuid,p_target_field uuid,p_source uuid,p_source_field uuid,p_revision bigint,p_source_hash text,p_proposal_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entity uuid; source_snapshot jsonb; field_key_ text; existing metadata.entity_field_identity_adoption%ROWTYPE;
BEGIN
 SELECT entity_id INTO STRICT entity FROM metadata.entity_change_set WHERE id=p_target;
 IF NOT entity_command_private.native_bootstrap_writable(p_target,entity)
 THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_source=p_target OR p_target_field=p_source_field THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT f.field_key INTO field_key_ FROM metadata.entity_change_set c
 JOIN metadata.entity_field f ON f.change_set_id=c.id
 JOIN metadata.entity_field_identity i ON i.id=f.field_identity_id
 WHERE c.id=p_source AND c.entity_id=entity AND c.tenant_id IS NULL AND c.source_kind='product'
 AND c.lock_version=p_revision AND c.status IN ('draft','rejected')
 AND f.id=p_source_field AND f.entity_id=entity AND f.tenant_id IS NULL AND i.id=p_identity
 AND i.entity_id=entity AND i.tenant_id IS NULL AND i.identity_status='reserved' AND i.introduced_change_set_id=p_source
 FOR SHARE OF c,f,i;
 IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT graph INTO source_snapshot FROM snapshot.entity_draft_save WHERE change_set_id=p_source AND lock_version=p_revision AND tenant_id IS NULL AND graph_hash=p_source_hash FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source_snapshot->'fields') f WHERE f->>'id'=p_source_field::text AND f->>'fieldKey'=field_key_)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source_snapshot->'fieldIdentities') i WHERE i->>'id'=p_identity::text AND i->>'entityId'=entity::text AND i->>'fieldKey'=field_key_ AND i->>'introducedChangeSetId'=p_source::text AND i->>'identityStatus'='reserved')
 THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO metadata.entity_field_identity_adoption(change_set_id,field_identity_id,target_field_id,source_change_set_id,source_field_id,source_revision,source_hash,proposal_hash,created_by)
 VALUES(p_target,p_identity,p_target_field,p_source,p_source_field,p_revision,p_source_hash,p_proposal_hash,current_setting('app.current_principal_id',true)::uuid)
 ON CONFLICT(change_set_id,field_identity_id) DO NOTHING;
 SELECT * INTO STRICT existing FROM metadata.entity_field_identity_adoption WHERE change_set_id=p_target AND field_identity_id=p_identity;
 IF ROW(existing.target_field_id,existing.source_change_set_id,existing.source_field_id,existing.source_revision,existing.source_hash,existing.proposal_hash,existing.created_by)
 IS DISTINCT FROM ROW(p_target_field,p_source,p_source_field,p_revision,p_source_hash,p_proposal_hash,current_setting('app.current_principal_id',true)::uuid)
 THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_CONFLICT' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.adopt_native_identity(uuid,uuid,uuid,uuid,uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.adopt_native_identity(uuid,uuid,uuid,uuid,uuid,bigint,text,text) TO athyper_product_command_app;
-- Forward-only correction of the three existing reservation checks. Refuse an
-- unexpected predecessor rather than replacing unrelated guard requirements.
DO $$ DECLARE spec record; body text; BEGIN
 FOR spec IN SELECT * FROM (VALUES
 ('metadata.guard_field_identity_binding()', 'identity.identity_status=''reserved'' AND identity.introduced_change_set_id<>NEW.change_set_id', 'identity.identity_status=''reserved'' AND NOT metadata.native_identity_available(NEW.change_set_id,identity.id)'),
 ('metadata.fn_assert_native_core_graph(uuid)', '(i.identity_status<>''active'' AND NOT(i.identity_status=''reserved'' AND i.introduced_change_set_id=draft))', 'NOT metadata.native_identity_available(draft,i.id)'),
 ('metadata.fn_assert_native_typed_rows(uuid,integer)', '(target.identity_status=''active'' OR (target.identity_status=''reserved'' AND target.introduced_change_set_id=root.id))', 'metadata.native_identity_available(root.id,target.id)')
 ) AS patches(signature,old_text,new_text) LOOP
  body:=pg_get_functiondef(spec.signature::regprocedure);
  IF (length(body)-length(replace(body,spec.old_text,'')))/length(spec.old_text)<>1 THEN RAISE EXCEPTION 'IDENTITY_ADOPTION_GUARD_PREDECESSOR_CHANGED:%',spec.signature; END IF;
  EXECUTE replace(body,spec.old_text,spec.new_text);
 END LOOP;
END $$;
