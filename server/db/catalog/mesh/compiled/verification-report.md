# mesh Wave 2 catalog verification

- Status: **PASS**
- Manifest: `wave2.mesh.catalog.v1`
- Semantic contract: `wave2.authorization-catalog.semantic.v1`
- Source tuples: 32
- Exact operations / permissions: 32 / 32
- High-risk operations: 10
- Contextual migration aliases: 0
- Reference source types: 1
- Runtime resolution: exact permission ID
- Live row-reference coverage: deployment gate required
- Files read by compiler: 2

| Gate | Result |
|---|---|
| One operation to one permission | PASS |
| Zero ambiguous contextual alias | PASS |
| No generic mutation verb authority | PASS |
| High-risk metadata complete | PASS |
| Mesh has no Neon catalog read | PASS |

The static compiler report does not claim that a database backfill has run.
Run `db:verify:authorization-v2-wave2:live` after snapshot/replay/backfill; every
row-level source reference must then be exact and the live anomaly count must be
zero.
