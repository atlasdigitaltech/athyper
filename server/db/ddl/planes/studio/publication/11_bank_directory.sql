-- Studio owns authoring; a nominated tenant may publish global reference releases.
CREATE TABLE publication.bank_directory_authority (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id)
);
CREATE TABLE snapshot.bank_directory_revision (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 base_release_id uuid,
 input_json jsonb NOT NULL,
 payload jsonb NOT NULL,
 sources jsonb NOT NULL,
 content_hash text NOT NULL CHECK(content_hash=encode(public.digest(payload::text,'sha256'),'hex')),
 validation_report jsonb NOT NULL,
 idempotency_key text NOT NULL CHECK(btrim(idempotency_key)<>''),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL,
 UNIQUE(tenant_id,idempotency_key),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id)
);
CREATE TABLE publication.bank_directory_review (
 revision_id uuid PRIMARY KEY REFERENCES snapshot.bank_directory_revision(id),
 tenant_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN('approved','rejected')),
 reason text NOT NULL CHECK(btrim(reason)<>''),
 reviewed_by uuid NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,revision_id) REFERENCES snapshot.bank_directory_revision(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewed_by) REFERENCES master.principal(tenant_id,id)
);
CREATE TABLE publication.bank_directory_release_link (
 publication_release_id uuid PRIMARY KEY REFERENCES publication.release(id),
 revision_id uuid NOT NULL UNIQUE REFERENCES snapshot.bank_directory_revision(id),
 tenant_id uuid NOT NULL,
 directory_release jsonb NOT NULL,
 FOREIGN KEY(tenant_id,revision_id) REFERENCES snapshot.bank_directory_revision(tenant_id,id)
);
CREATE FUNCTION publication.guard_bank_directory_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r snapshot.bank_directory_revision;
BEGIN
 SELECT * INTO STRICT r FROM snapshot.bank_directory_revision WHERE id=NEW.revision_id;
 IF r.created_by=NEW.reviewed_by THEN RAISE EXCEPTION 'BANK_DIRECTORY_SELF_APPROVAL_FORBIDDEN'; END IF;
 IF NEW.decision='approved' AND r.validation_report->>'valid' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'BANK_DIRECTORY_VALIDATION_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER directory_review_guard BEFORE INSERT ON publication.bank_directory_review FOR EACH ROW EXECUTE FUNCTION publication.guard_bank_directory_review();
CREATE TRIGGER immutable_directory_revision BEFORE UPDATE OR DELETE ON snapshot.bank_directory_revision FOR EACH ROW EXECUTE FUNCTION shared.reject_bank_directory_mutation();
CREATE TRIGGER immutable_directory_review BEFORE UPDATE OR DELETE ON publication.bank_directory_review FOR EACH ROW EXECUTE FUNCTION shared.reject_bank_directory_mutation();
CREATE TRIGGER immutable_directory_release_link BEFORE UPDATE OR DELETE ON publication.bank_directory_release_link FOR EACH ROW EXECUTE FUNCTION shared.reject_bank_directory_mutation();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['snapshot.bank_directory_revision','publication.bank_directory_review','publication.bank_directory_release_link','publication.bank_directory_authority'] LOOP
 EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY directory_tenant ON %s FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id())',t);
 EXECUTE format('CREATE POLICY directory_seed_owner ON %s FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true)',t);
 EXECUTE format('REVOKE ALL ON %s FROM PUBLIC',t);
 EXECUTE format('GRANT ALL ON %s TO athyperadmin',t);
 END LOOP;
END $$;
GRANT SELECT ON publication.bank_directory_authority TO athyper_publication_service;
GRANT SELECT,INSERT ON snapshot.bank_directory_revision,publication.bank_directory_review,publication.bank_directory_release_link TO athyper_publication_service;
REVOKE ALL ON FUNCTION publication.guard_bank_directory_review() FROM PUBLIC;
CREATE FUNCTION publication.guard_bank_directory_release_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,publication,snapshot,shared AS $$
DECLARE r snapshot.bank_directory_revision; p publication.release;
BEGIN
 SELECT * INTO STRICT r FROM snapshot.bank_directory_revision WHERE id=NEW.revision_id AND tenant_id=NEW.tenant_id;
 SELECT * INTO STRICT p FROM publication.release WHERE id=NEW.publication_release_id AND tenant_id=NEW.tenant_id;
 IF NOT EXISTS(SELECT 1 FROM publication.bank_directory_authority WHERE tenant_id=NEW.tenant_id)
 OR NOT EXISTS(SELECT 1 FROM publication.bank_directory_review WHERE revision_id=r.id AND decision='approved' AND reviewed_by=p.created_by)
 OR NEW.directory_release->'payload' IS DISTINCT FROM r.payload
 OR NEW.directory_release->'sources' IS DISTINCT FROM r.sources
 OR NEW.directory_release->>'contentHash' IS DISTINCT FROM r.content_hash
 OR NEW.directory_release->>'id' IS DISTINCT FROM p.id::text
 OR (NEW.directory_release->>'version')::bigint IS DISTINCT FROM p.release_no
 OR p.release_key<>'shared.bank_directory' OR p.release_hash<>r.content_hash
 THEN RAISE EXCEPTION 'BANK_DIRECTORY_APPROVED_REVISION_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER directory_release_guard BEFORE INSERT ON publication.bank_directory_release_link FOR EACH ROW EXECUTE FUNCTION publication.guard_bank_directory_release_link();
REVOKE ALL ON FUNCTION publication.guard_bank_directory_release_link() FROM PUBLIC;
