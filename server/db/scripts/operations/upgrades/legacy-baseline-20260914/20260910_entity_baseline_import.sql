BEGIN;
SET LOCAL lock_timeout = '5s';
-- An observed runtime baseline is evidence, not an official Studio release.
CREATE TABLE metadata.entity_baseline_import (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 publication_key text NOT NULL,
 source_release_id uuid NOT NULL,
 source_release_no bigint NOT NULL CHECK (source_release_no > 0),
 entity_code text NOT NULL,
 source_entity_id uuid NOT NULL,
 source_plane text NOT NULL CHECK (source_plane = 'neon'),
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND pg_column_size(payload) <= 2097152),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 imported_by text NOT NULL DEFAULT session_user,
 UNIQUE(tenant_id, publication_key, source_release_id),
 UNIQUE(tenant_id, id),
 CHECK ((payload->>'schema' = 'athyper.imported-entity-baseline/1') IS TRUE),
 CHECK ((payload->>'tenantId' = tenant_id::text AND payload->>'publicationKey' = publication_key
   AND payload->>'sourceReleaseId' = source_release_id::text AND payload->>'sourceReleaseNo' = source_release_no::text
   AND payload->>'entityCode' = entity_code AND payload->>'sourceEntityId' = source_entity_id::text
   AND payload->>'sourcePlane' = source_plane AND payload->>'contentHash' = content_hash) IS TRUE)
);
CREATE TABLE metadata.entity_baseline_import_revocation (
 baseline_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_by text NOT NULL DEFAULT session_user,
 FOREIGN KEY(tenant_id, baseline_id) REFERENCES metadata.entity_baseline_import(tenant_id,id)
);
COMMENT ON TABLE metadata.entity_baseline_import IS
 'Immutable observed external runtime baseline. Contains original source signatures as unverified evidence; confers no approval, publication or permission.';
COMMENT ON TABLE metadata.entity_baseline_import_revocation IS
 'Append-only import rollback. Disables future use without deleting provenance or changing runtime releases.';
CREATE TRIGGER entity_baseline_import_immutable BEFORE UPDATE OR DELETE ON metadata.entity_baseline_import
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER entity_baseline_revocation_immutable BEFORE UPDATE OR DELETE ON metadata.entity_baseline_import_revocation
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
ALTER TABLE metadata.entity_baseline_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_baseline_import FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_baseline_import_revocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_baseline_import_revocation FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_baseline_import_tenant ON metadata.entity_baseline_import
 USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY entity_baseline_revocation_tenant ON metadata.entity_baseline_import_revocation
 USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
REVOKE ALL ON metadata.entity_baseline_import,metadata.entity_baseline_import_revocation FROM PUBLIC;
GRANT SELECT ON metadata.entity_baseline_import,metadata.entity_baseline_import_revocation TO athyperapp;
-- Import is an explicit operator migration; ordinary API principals cannot write it.
GRANT SELECT,INSERT ON metadata.entity_baseline_import,metadata.entity_baseline_import_revocation TO athyperadmin;

-- New, genuinely reviewed Studio releases can refer to an external predecessor.
-- Runtime release numbers belong to the publication key; Studio's own native
-- sequence still starts at one, and no missing native history is invented.
CREATE TABLE publication.entity_baseline_release_link (
 tenant_id uuid NOT NULL,
 publication_release_id uuid PRIMARY KEY REFERENCES publication.release(id),
 entity_release_id uuid NOT NULL UNIQUE,
 baseline_id uuid NOT NULL UNIQUE,
 FOREIGN KEY(tenant_id,entity_release_id) REFERENCES metadata.entity_release(tenant_id,id),
 FOREIGN KEY(tenant_id,baseline_id) REFERENCES metadata.entity_baseline_import(tenant_id,id)
);
CREATE FUNCTION publication.trg_validate_baseline_release_link() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,publication,metadata AS $$
 BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM publication.release p JOIN metadata.entity_release e ON e.id=NEW.entity_release_id
   JOIN metadata.entity_change_set cs ON cs.id=e.change_set_id
   JOIN metadata.entity_baseline_import b ON b.id=NEW.baseline_id
   WHERE p.id=NEW.publication_release_id AND p.tenant_id=NEW.tenant_id AND b.tenant_id=p.tenant_id
     AND e.tenant_id=p.tenant_id AND p.release_key=b.publication_key AND p.release_no=b.source_release_no+1
     AND p.release_hash=e.release_hash AND p.release_kind='publish' AND e.release_kind='publish'
     AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
     AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation r WHERE r.baseline_id=b.id)
 ) THEN RAISE EXCEPTION 'BASELINE_RELEASE_COORDINATE_OR_REVIEW_MISMATCH'; END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER entity_baseline_link_guard BEFORE INSERT ON publication.entity_baseline_release_link
 FOR EACH ROW EXECUTE FUNCTION publication.trg_validate_baseline_release_link();
CREATE TRIGGER entity_baseline_link_immutable BEFORE UPDATE OR DELETE ON publication.entity_baseline_release_link
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE FUNCTION metadata.trg_revoke_unused_baseline() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata,publication AS $$
 BEGIN
 PERFORM 1 FROM metadata.entity_baseline_import WHERE id=NEW.baseline_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM publication.entity_baseline_release_link WHERE baseline_id=NEW.baseline_id) THEN
   RAISE EXCEPTION 'Published baseline requires a reviewed runtime rollback, not import revocation';
 END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER entity_baseline_revocation_unused BEFORE INSERT ON metadata.entity_baseline_import_revocation
 FOR EACH ROW EXECUTE FUNCTION metadata.trg_revoke_unused_baseline();
ALTER TABLE publication.entity_baseline_release_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.entity_baseline_release_link FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_baseline_link_tenant ON publication.entity_baseline_release_link
 USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
REVOKE ALL ON publication.entity_baseline_release_link FROM PUBLIC;
GRANT SELECT,INSERT ON publication.entity_baseline_release_link TO athyperapp,athyperadmin;

COMMIT;
