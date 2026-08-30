# Business Partner 360 MESH network — BS360-08

Status: In progress  
Date: 2026-08-30

## Local-first authority

The Network section reads NEON recipient evidence before considering a live MESH request. Its reader starts from the governed Business Partner account link and selects only safe coordinates and lifecycle evidence from:

- `control.mesh_business_partner_account_link`;
- `snapshot.mesh_business_partner_profile_received` and its projection head;
- immutable match and selective-acceptance records;
- the acceptance-to-request event;
- the masked bank-disclosure projection head.

The reader never selects publication/envelope payloads, ranked candidates, raw field differences, proposed acceptance payloads, verification evidence, or bank values. Match output is reduced to the approved field-path allowlist. Bank disclosure is reduced to presence, status, versions, and observed time.

## Live adapter boundary

Live enrichment uses `BusinessPartner360MeshNetworkAdapter`. The adapter has no database dependency and exposes only relationship and publication lifecycle summaries unavailable locally. Its factory requires an independent exact-relationship authorization decision for `mesh.business_partner_profile.read` before invoking the summary source.

The 360 orchestrator calls the adapter only when all of these conditions hold:

- the NEON Network section permission was granted;
- the NEON account link is active and supplies the exact relationship coordinate;
- the link's supplier/customer role exists independently on the Business Partner;
- a person record has that separate commercial role;
- the received profile schema is `mesh.business_partner_profile/1` with `recipient_safe_v1`.

Calls are abortable and bounded to 50–3000 ms, with the Phase 1 design default of 1500 ms. Timeout, denial, incompatible schema, corruption, staleness, and unavailability become Network-only states. The local projection remains usable and no browser endpoint targets MESH.

## Provenance and parity semantics

Every local and live evidence group carries authority plane/tenant, source object, observed time, schema and field-set versions, SHA-256 evidence hash, and freshness. Received, matched, accepted/request-created, ignored, published, and withdrawn states remain distinct. The UI explicitly states that a received profile does not imply full identity parity.

The MESH publication definition prohibits person/workforce paths, and the NEON event receiver independently rejects person, workforce, employment, compensation, national-ID, and other sensitive field families even if an upstream definition is misconfigured.

## Verification evidence

- Service tests cover local fallback, commercial person gating, adapter-call denial, and successful independently authorized live enrichment.
- Adapter tests cover timeout, MESH denial, incompatible schema, corrupt response, stale provenance, and withdrawal.
- Client tests reject person/workforce, raw payload/diff, and bank-value keys.
- Static database-contract tests prove local-first reads, the absence of `mesh.*` database joins, the absence of browser-to-MESH calls, safe bank status-only presentation, and distinct lifecycle/provenance states.

Remaining release evidence: configure a production live-summary transport/authority provider, exercise disposable three-plane RLS fixtures, and run browser outage/authorization automation.
