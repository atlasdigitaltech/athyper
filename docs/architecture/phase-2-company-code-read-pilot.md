# Phase 2: company_code read pilot

Status: shadow-ready; serve rollout remains feature-flagged.

`company_code` is the first read pilot because it is already covered by the
mutation pilot and has a bounded master shape: tenant-scoped identity, unique
`(tenant_id, code)`, stable `code` ordering with `id` tie-breaker, legal-entity
scope, and no child-row or aggregate hydration requirement in the base list.

The pilot uses:

- `ENTITY_QUERY_V1_PILOTS=company_code`
- `NEON_ENTITY_QUERY_V1_PILOTS=company_code`
- `NEON_ENTITY_QUERY_V1_MODE=shadow` initially
- `NEON_ENTITY_QUERY_V1_MODE=serve` only after shadow parity approval

Shadow requests execute the legacy and keyset paths concurrently, request an
exact candidate count, and compare row values/nulls, row order, visible IDs,
counts, and count mode. Reference labels are compared as part of the normalized
row payload. Facets, grouping, parent, and through-entity requests remain on
the explicitly budgeted legacy path until a separate query contract exists.

The keyset path uses the descriptor projection and verified tenant/company/legal
scope predicates. The supporting index is
`master.company_code(tenant_id, code, id)`.

Promotion requires zero shadow mismatches, representative tenant-size query
plans, and the read budgets: one SQL statement for list-without-count, one data
query plus cached count for navigation, and p95/p99 latency of 150/350 ms.
