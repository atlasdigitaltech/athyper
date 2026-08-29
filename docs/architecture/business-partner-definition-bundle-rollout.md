# Business Partner definition bundle rollout

P6 uses the STUDIO Publication authority to compile and sign one Business Partner source bundle into plane-specific immutable artifacts. NEON and MESH transactions read only their verified local activation head; neither plane calls STUDIO on a request path.

## Bundle and compile contract

The `business_partner.onboarding` source bundle must use schema `athyper.business-partner-definition-bundle.v1` and semantic version `2.0.0` or later. It declares the complete supplier, customer, and workforce matrix, organization/person field and duplicate policy, all five ingress mappings, workflows, SoD, SLA/escalation, evidence, readiness, reasons, NEON descriptors, MESH-safe schemas, compatibility, and source-contract hashes.

The compiler produces a deterministic artifact for each target plane and records both the source and compiled bundle SHA-256 plus a signed compile report. MESH compilation removes person/workforce schemas and operational UI/workflow policy. Loading fails closed on an invalid Ed25519 signature, artifact or bundle hash mismatch, wrong schema/plane/report coordinates, incompatible runtime, source-contract mismatch, or semantic downgrade.

## Staged activation

1. Apply `20260829_business_partner_definition_bundle_completion.sql` to STUDIO, NEON, and MESH and pass the static and publication contract suites.
2. Author the bundle with `POST /api/studio/business-partner-definitions` for `studio`, `neon`, and `mesh`. Use a unique idempotency key and retain the returned revision and source bundle hash.
3. A different MFA-qualified publisher invokes `POST /api/studio/business-partner-definitions/:revisionId/publish`. The no-self-publish check is the SoD boundary.
4. Let the authority worker compile and sign. The normal publication pipeline receives, stages, verifies, and atomically activates each local artifact. Never edit an activation head or artifact row directly.
5. Compare compile report hashes, signing key ID, deployment acknowledgements, and the local active release tuple `(applied release ID, source release ID/no, artifact hash)` on all three planes.
6. Read NEON descriptors from `/api/neon/business-partner-definitions/active-descriptors`; exercise one supplier, customer, workforce, and MESH profile transaction with STUDIO stopped. All must continue from the last-known-good local projection.

## Canary and rollback

Run `pnpm --dir server/db run db:operate:publication:canary` with the `PUBLICATION_CANARY_*` variables, `STUDIO_DATABASE_URL`, `NEON_DATABASE_URL`, `MESH_DATABASE_URL`, and a short-lived MFA-qualified bearer token. Set `PUBLICATION_CANARY_EVIDENCE_PATH` to a new path. The rehearsal captures every prior head, activates the candidate, requests governed rollback, and passes only when every plane returns to the exact prior four-coordinate tuple.

Widen traffic only after the canary remains healthy for one recovery interval plus the maximum queue retry window. On a candidate fault, disable compile/dispatch, leave apply enabled to converge in-flight work, and roll back to the captured applied-release IDs. The database permits a definition downgrade only when the target is the exact preceding activation event. Immutable artifacts, acknowledgements, and history remain intact.

If STUDIO or object storage becomes unavailable after activation, do not clear the local head. NEON and MESH continue using the verified last-known-good projection. New activation is blocked until authority and artifact verification recover; runtime transactions are not.
