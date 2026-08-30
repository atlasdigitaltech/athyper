# Business Partner 360 secure core — BS360-02

Status: In progress  
Build date: 2026-08-30

## Delivered boundary

BS360-02 introduces the shared v1 summary and section-envelope contract, one visibility/scope resolver, manifest policy evaluation, a bounded Kysely summary repository, authenticated service routes, and explicit gateway relay operations. The legacy aggregate route retains its response contract and now enters through the same visibility and scope authority.

The canonical Business Partner record page selects the new shell only when tenant capability `neon.business_partner.view_360` is enabled. The shell derives navigation exclusively from the returned manifest and carries section, role lens, operating organization, company code, legal entity, and effective date in URL state. Permission epoch is part of the request key, and a BP, permission, role, or scope transition cancels the prior request.

## Security and bounded-read rules

- Record permission is evaluated before the repository lookup, so invisible and missing records share `404 BP_360_NOT_FOUND`.
- Organization, company, and legal-entity coordinates are validated together inside the summary transaction. Invalid combinations return `400 BP_360_SCOPE_INVALID`.
- Section and field decisions receive all resolved scope coordinates. Denied non-discoverable sections are absent from the manifest; a direct applicable section request returns `403 BP_360_SECTION_FORBIDDEN` only after record visibility succeeds.
- Identifier and tax summary reads select only an explicitly stored masked presentation value. Person-sensitive and raw protected-value field families are rejected from the Phase 1 contract and client bootstrap parser.
- Recent activity is capped at five rows, identifier summary at five rows, and the serialized summary at 75 KiB. Responses are `private, no-store`.
- Polymorphic address and contact joins resolve registered owner types and include tenant predicates.

The database currently has no separate tenant-calendar business-date authority. The resolver therefore uses an explicit `asOf` date when supplied and the NEON transaction database date otherwise. Replacing this fallback requires a platform tenant-calendar contract, not a view-local clock.

## Verification evidence

- Contract and service typechecks plus service policy fixtures cover supplier, customer, dual-role, and workforce-person manifests.
- Service tests cover invalid scope, non-enumerating record visibility, hidden denied sections, and direct-section denial.
- Static secure-core tests cover tenant/owner predicates, masked reads, bounded activity, route/relay/compatibility wiring, dark launch, manifest navigation, cancellation, URL state, permission epoch, and bootstrap rejection.
- Client tests cover query-coordinate and permission-epoch isolation.

## Remaining exit evidence

Before BS360-02 is marked complete, run the repository against representative data in a disposable NEON database, record warm-database latency and payload percentiles, and execute browser-level deep-link/back-forward/scope-transition tests. Tenant capability activation remains off until those gates are attached to release evidence.
