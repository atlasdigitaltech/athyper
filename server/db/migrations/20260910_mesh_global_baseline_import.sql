BEGIN;
SET LOCAL lock_timeout='5s';
-- The ledger's tenant owns the observation, not the global runtime source.
ALTER TABLE metadata.entity_baseline_import DROP CONSTRAINT entity_baseline_import_source_plane_check;
ALTER TABLE metadata.entity_baseline_import DROP CONSTRAINT entity_baseline_import_payload_check1;
ALTER TABLE metadata.entity_baseline_import ADD CONSTRAINT entity_baseline_import_source_scope_check CHECK ((
 (payload->>'schema'='athyper.imported-entity-baseline/1' AND source_plane='neon')
 OR
 (payload->>'schema'='athyper.imported-global-entity-baseline/1' AND source_plane='mesh'
  AND entity_code='network_relationship'
  AND payload->'sourceTenantId'='null'::jsonb
  AND payload#>'{source,contract,tenant_id}'='null'::jsonb
  AND payload#>'{source,descriptor,tenant_id}'='null'::jsonb
  AND payload#>>'{source,contract,publication_key}'=publication_key
  AND payload#>>'{source,contract,entity_id}'=source_entity_id::text
  AND payload#>>'{source,descriptor,plane_code}'='mesh'
  AND payload#>>'{provenance,kind}'='observed_global_runtime_import')
) IS TRUE);
-- A global observation must never enter the legacy same-key Neon successor
-- bridge. Tenant fork publication needs its own independently reviewed contract.
CREATE FUNCTION publication.trg_guard_global_baseline_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM metadata.entity_baseline_import WHERE id=NEW.baseline_id
   AND payload->>'schema'='athyper.imported-global-entity-baseline/1') THEN
   RAISE EXCEPTION 'GLOBAL_BASELINE_REQUIRES_TENANT_FORK_PUBLICATION';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER entity_baseline_global_link_guard BEFORE INSERT ON publication.entity_baseline_release_link
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_global_baseline_link();
COMMIT;
