# neon-admin Wave 2 catalog verification

- Status: **FAIL**
- Manifest: `wave2.neon-admin.catalog.v1`
- Semantic contract: `wave2.authorization-catalog.semantic.v1`
- Source tuples: 0
- Exact operations / permissions: 0 / 0
- High-risk operations: 0
- Contextual migration aliases: 0
- Reference source types: 9
- Runtime resolution: exact permission ID
- Live row-reference coverage: deployment gate required
- Files read by compiler: 99

| Gate | Result |
|---|---|
| One operation to one permission | PASS |
| Zero ambiguous contextual alias | PASS |
| No generic mutation verb authority | PASS |
| High-risk metadata complete | PASS |
| Mesh has no Neon catalog read | PASS |

The static compiler report does not claim that a database backfill has run.
Run `db:verify:ddl-model` after changing canonical DDL manifests; every
manifest entry must resolve to an existing common or plane-owned SQL file.
