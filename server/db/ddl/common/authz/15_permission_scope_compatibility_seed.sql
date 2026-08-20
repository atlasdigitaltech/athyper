-- seed-contract-version: 1
-- seed-pack: common.authz-permission-scope-compatibility-boundary
-- seed-pack-version: 2.0.0
-- seed-dataset: authz.permission-scope-kind
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Athyper exact permission scope contracts","publisher":"Athyper","source_version":"2.0.0","retrieved_at":"2026-08-14","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission_scope_kind(permission_id,scope_kind,propagation_mode)
-- seed-cross-file-ids: false
-- seed-id-strategy: contract-resolved-permission-id
-- seed-expected-row-count: 0
-- seed-assertions: semantic
-- seed-demo-data: false
-- seed-assertion: semantic

-- Scope compatibility is intentionally not inferred at DDL time. Each plane's
-- authorization pack reconciles authz.permission_scope_kind from the explicit
-- scope-compatibility.v1 contract. An absent declaration denies assignment.
DO $guard$
BEGIN
  IF current_setting('app.database_plane', true) NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'exact permission scope compatibility requires an application plane';
  END IF;
END
$guard$;
