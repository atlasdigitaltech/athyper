# Wave 9 local development clean reset

This runbook authorizes only the `development_clean_reset` profile for exact
`disposable_local` Neon and Mesh databases. It does not complete production
Wave 8, authorize a production-like reset, or claim production migration
certification.

The approval label is exactly `LOCAL-AUTH-V2-RESET`. The database guard,
execution request, and stored guard receipt must all use that value.

## Preserved external identity

The database reset destroys local database data. It does not authorize
Keycloak deletion. Do not run the IAM reset, delete a realm, truncate users, or
invoke legacy identity reset wrappers. Existing Keycloak users are preserved
and later reconciled into deterministic canonical groups.

## Mark a database

Resolve the exact database names from the direct Neon and Mesh administrator
URLs. Mark each plane independently:

```powershell
pnpm.cmd --dir server/db run db:mark-disposable:neon -- `
  --execution-profile=development_clean_reset `
  --approval-label=LOCAL-AUTH-V2-RESET `
  --expected-database=<exact-neon-database> `
  --environment=disposable_local `
  --acknowledge=MARK_DISPOSABLE_NEON

pnpm.cmd --dir server/db run db:mark-disposable:mesh -- `
  --execution-profile=development_clean_reset `
  --approval-label=LOCAL-AUTH-V2-RESET `
  --expected-database=<exact-mesh-database> `
  --environment=disposable_local `
  --acknowledge=MARK_DISPOSABLE_MESH
```

Marking fails when an opposite-plane schema exists. The stored schema
fingerprint must still match at reset time. If a clean-build sentinel or any
other DDL is installed after marking, mark the database again.

## Execute the guarded reset

```powershell
$env:ATHYPER_DISPOSABLE_ENVIRONMENT =
  "I_UNDERSTAND_DATA_WILL_BE_DESTROYED"
$env:NEON_EXPECTED_DATABASE = "<exact-neon-database>"
$env:MESH_EXPECTED_DATABASE = "<exact-mesh-database>"

.\stack\scripts\db\transaction\neon\seed-db-dev-reset.bat
.\stack\scripts\db\transaction\mesh\seed-db-dev-reset.bat
```

The wrappers supply:

- `--execution-profile=development_clean_reset`;
- `--approval-label=LOCAL-AUTH-V2-RESET`;
- the exact expected database;
- `RESET_NEON` or `RESET_MESH`.

The provisioner additionally verifies the disposable marker, stored
`disposable_local` classification, matching approval label, current schema
fingerprint, database identity, and zero opposite-plane schemas.

Direct `seed-db.bat --reset` without all of those values is rejected.

## Gate

A successful local reset receipt means only that the exact disposable
development databases were authorized and reset. Production Wave 8 remains
pending. Final Wave 9 clean-baseline certification additionally requires the
legacy reader, writer, Persona, alias, Mesh-in-Neon, generated-client, and
build-DDL scans to reach zero.
