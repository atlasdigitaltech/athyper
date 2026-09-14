-- seed-contract-version: 1
-- seed-pack: common.control.runtime-parameters
-- seed-pack-version: 1.0.0
-- seed-dataset: control.parameter_definition
-- seed-data-class: production_reference
-- seed-provenance: {"source":"repository-owned-reference-contract","publisher":"Athyper","source_version":"1","retrieved_at":"2026-09-11","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.parameter_definition(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:1
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $seed_plane_guard$ BEGIN
 IF COALESCE(current_setting('app.database_plane', true), '') NOT IN ('studio','neon','mesh') THEN
  RAISE EXCEPTION 'common.control.runtime-parameters: invalid database plane';
 END IF;
END $seed_plane_guard$;

-- First runtime parameter: applies at the next experience-bootstrap request.
INSERT INTO control.parameter_definition(id,code,name,value_type,default_value,allowed_values,tenant_can_override,reload_mode,cache_ttl_seconds,created_by)
VALUES(md5('control:parameter:experience.profile.default_density')::uuid,'experience.profile.default_density','Default experience density','enum','"comfortable"'::jsonb,'["comfortable","compact"]'::jsonb,true,'next_request',300,'00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, value_type=EXCLUDED.value_type, default_value=EXCLUDED.default_value, allowed_values=EXCLUDED.allowed_values, tenant_can_override=EXCLUDED.tenant_can_override, reload_mode=EXCLUDED.reload_mode, cache_ttl_seconds=EXCLUDED.cache_ttl_seconds WHERE (control.parameter_definition.name, control.parameter_definition.value_type, control.parameter_definition.default_value, control.parameter_definition.allowed_values, control.parameter_definition.tenant_can_override, control.parameter_definition.reload_mode, control.parameter_definition.cache_ttl_seconds) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.value_type, EXCLUDED.default_value, EXCLUDED.allowed_values, EXCLUDED.tenant_can_override, EXCLUDED.reload_mode, EXCLUDED.cache_ttl_seconds) ;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM control.parameter_definition WHERE code='experience.profile.default_density' AND status='active' AND value_type='enum' AND reload_mode='next_request' AND NOT is_sensitive
 AND default_value IN ('"comfortable"'::jsonb,'"compact"'::jsonb) AND allowed_values @> '["comfortable","compact"]'::jsonb AND allowed_values <@ '["comfortable","compact"]'::jsonb) THEN
 RAISE EXCEPTION 'Existing experience density parameter is incompatible; review it before deployment';
 END IF;
END $$;

DO $seed_assertions$ BEGIN
 -- seed-assertion: expected-count
 IF (SELECT count(*) FROM control.parameter_definition WHERE code='experience.profile.default_density') <> 1 THEN RAISE EXCEPTION 'Missing density parameter'; END IF;
 -- seed-assertion: orphan
 IF EXISTS(SELECT 1 FROM control.parameter_definition WHERE code='experience.profile.default_density' AND allowed_values IS NULL) THEN RAISE EXCEPTION 'Missing density vocabulary'; END IF;
 -- seed-assertion: uniqueness
 IF EXISTS(SELECT code FROM control.parameter_definition WHERE code='experience.profile.default_density' GROUP BY code HAVING count(*)<>1) THEN RAISE EXCEPTION 'Duplicate density definition'; END IF;
 -- seed-assertion: semantic
 IF EXISTS(SELECT 1 FROM control.parameter_definition WHERE code='experience.profile.default_density' AND (default_value <> '"comfortable"'::jsonb OR reload_mode<>'next_request')) THEN RAISE EXCEPTION 'Density runtime contract drift'; END IF;
END $seed_assertions$;
