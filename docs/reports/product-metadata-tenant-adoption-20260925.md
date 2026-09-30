# Product metadata publication and Athyper DEV adoption

## Recommended authority model (proposal, not activated)

Separate product release ownership from tenant data ownership. A dedicated product author and independent product publisher create one immutable signed baseline. Do not use a customer tenant's admin/owner identity as the product publisher.

Each tenant adopts an exact baseline release/hash through a tenant-scoped activation record. Tenant overlays have their own version, validation and approval, and cannot expand permissions. Product metadata distribution does not grant access to records or operations.

An all-tenants rollout should enumerate eligible tenants, preflight schema/handler compatibility and overlays, canary one tenant, then batch adoption with per-tenant receipts and rollback pins. Future tenants adopt an explicitly configured baseline during provisioning. Avoid an unqualified global-head overwrite that changes every tenant immediately.

A product namespace/security scope may be preferable to a special product tenant. If a product tenant is used for authoring, it must not confer cross-tenant business-data access. Existing product baseline/import and native publication mechanisms need a compatibility inventory before choosing the implementation.

## Applied now: Athyper DEV authority setup

`node tooling/scripts/local-dev/dev-publish.mjs --setup --tenant athyper`

- Separate author and publisher service accounts in Athyper, in Studio and Neon.
- Independent credentials stored outside the repository under the owner-only `dev-publication-athyper` secrets directory.
- Existing CATL configuration, credentials, active releases and human grants unchanged.
- Setup is replayable; existing conflicting or revoked identities are rejected.
- Explicit tenant selection currently supports setup only. It cannot silently retarget the existing publisher or activate an unreviewed release.

Two targeted CLI tests passed, and setup/replay completed successfully. The full test file has an additional failing existing workspace mount-count assertion (expects one mount, receives two); it was not altered as part of tenant setup.

## Activation remains incomplete

Database inspection found no Athyper native `business_partner`/`master.business_partner` authoring change set or signed entity release in Studio. Its Neon native runtime contains the legacy `master.business_partner` descriptor. The shared compiled BP release is not a replacement for the missing current native descriptor used by Manage.

The existing scoped publisher assumes an existing reviewed source and primarily applies overlays. Do not merely replace its CATL tenant constant or copy CATL's local preview signature. Also do not replace the running CATL configuration with Athyper's configuration.

Required next implementation: tenant-baseline adoption that produces an Athyper-owned candidate from a specifically selected product/native source, validates storage and authorization bindings, records separate DEV author/publisher dispositions, signs and activates at an isolated tenant coordinate, invalidates descriptor caches, and verifies Manage plus record sections under `athyper.admin`. Preserve the current shared compiled release and CATL behavior.

The source baseline and native projection must be reconciled before activation. Provisioned service accounts alone do not constitute a reviewed candidate, mounted publication path, or successful deployment.

## Follow-up implementation: coordinated adoption admission

Added `server/packages/services/publication/src/entity-adoption-plan.ts` with six passing unit tests. It pins both artifact hashes to one baseline, requires distinct author/publisher identities, enforces tenant-specific publication keys and payload scope, checks explicit expected activation heads, and rejects partial activation. This is a planning/admission primitive, not yet connected to the publication worker and not evidence of deployment.

Further runtime inspection found a concrete staging mismatch: `KyselyLocalProjectionRepository.stage` calls `runtime_meta.fn_stage_release` with seven arguments including the projection, whereas current common DDL and live Neon expose only the six-argument staging function. The repository's compiled projection also sets `tenant_id: null`. Both need coordinated correction before tenant-specific artifacts can be staged and activated safely. No function overload, global activation head, or descriptor was manually patched during this inspection.

### Subsequent staging verification

The repository and DEV now use `fn_stage_release_projection` (seven arguments), delegating to the six-argument base staging function. That correction was already present when this follow-up began and was preserved. A live rollback-only probe verified tenant payload persistence, idempotent replay and no activation.

Compiled runtime projections now accept an optional signed `tenantId`. Envelope parsing rejects absent/mismatched tenant scope for tenant publication keys; worker staging persists that signed scope instead of always writing NULL. Existing global releases omit the field and retain their global semantics. The compiler helper can emit tenant-scoped payloads. Contract and publication-service typechecks passed before the final compiler-helper extension; targeted worker/compiler tests cover this follow-up.

No adoption candidate was signed or activated by these staging changes. Earlier observations above describe the state at inspection, not the current staging function signature.

Remaining implementation: signed source/candidate materialization, tenant-aware projection staging, transactional activation of both members with guarded heads, durable adoption receipt/cache invalidation, worker wiring, and signed-in verification. The Athyper descriptor error is not resolved by the planning primitive.

### Coordinated execution service

`coordinated-entity-adoption.ts` now provides `adoptEntityPair` and a Kysely transaction adapter. It uses the existing verified loader and local projection repository, checks signed manifest baseline references, validates the two deployment targets, checks authority before loading and inside the transaction, locks publication keys, compares expected heads, stages/verifies both artifacts and activates both within one target transaction. Post-commit invalidation is mandatory and retried on a complete replay. Paired artifact hashes are retained in each activation's evidence.

Eleven planner/coordinator tests pass, including simulated second-activation failure rollback, replay, signed provenance mismatch, cross-instance rejection and authority revocation. The transaction-failure tests use a transactional fake; they are not proof of a live atomic activation.

This service is exported but is not yet wired to a durable approval lookup, candidate materializer, job dispatch or cache invalidator. No Athyper adoption release has been activated. These integrations and a signed native/compiled candidate remain required; supplying a permissive approval callback would not be a valid completion.
