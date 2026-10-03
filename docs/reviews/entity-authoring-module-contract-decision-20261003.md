# Entity authoring module contract: decision for owner review

Date: 3 October 2026. Status: **proposed; owner decision pending**. This document responds to the review of checkpoint `b048b8900`. It authorizes no publication, module creation, permission change or successor mutation.

Owner follow-up, 3 October: **record this decision for later; implementation is deferred**. No option has been selected. Deferral does not approve a temporary module mapping or waive publication gates.

## Studio publication readiness after deferral

Studio remains the required publication path, but this reviewed change set is **not ready to publish**. The three compiled module candidates are unsigned review artifacts, not approved releases; seven candidates need exact predecessor-source reconciliation and five await the deferred contract decision. BP publication additionally requires implemented and qualified projection readers, company/organization scope support, and resolution of the tenant override. Exact releases need the required human authorship and independent review before activation.

Continue independent implementation and evidence preparation without mutating module successors while the decision is deferred. In particular, BP shared projection and scope work can progress as implementation work; it must not activate the DEV cutover. Reassess readiness per exact release and target plane rather than treating source completion or Studio catalog availability as blanket publication readiness.

## Recommendation and decision

Choose **explicit, separate authoring and domain coordinates** in a versioned shared product contract. Keep Studio's registry foreign key local to Studio; retain domain ownership and each plane's navigation in their own explicit metadata. Do not copy Neon modules into Studio merely to satisfy that foreign key.

The specific proposal for the five blocked products is:

| Products | Proposed Studio registry authoring coordinate | Preserved domain coordinate |
| --- | --- | --- |
| Address, Person Address Use | `studio/meta` | `neon/loc` |
| Employee, Person | `studio/meta` | `neon/hr` |
| External Worker | `studio/meta` | `neon/workforce` |

These are reviewable source declarations, **not a runtime mapping table**. No module selection may be inferred from an entity name, filesystem path or target plane. Existing proposed `studio/rel` and `studio/iam` authoring identities remain separately subject to predecessor reconciliation and review; this proposal does not move every product into `meta`.

Why `meta`: the governed catalog names it **Metadata & Entity Studio**, whereas `ent` means **Plan & Module Entitlements**. Keeping `ent` simply because it is present is not a semantic resolution. A read-only query against the existing DEV Studio database on 3 October found `meta`, `ent`, `rel` and `iam` active and no `loc`, `hr` or `workforce`. Catalog availability alone is not approval to use a module.

The alternative is to govern explicit Studio authoring representations of `loc`, `hr` and `workforce`, with their ownership, entitlement, navigation and catalog impacts reviewed. This preserves the existing overloaded product field but expands the Studio catalog. It must not be implemented as a raw copy of Neon catalog rows.

**Owner decision requested:** accept the separation and the five proposed `studio/meta` authoring declarations, or choose the governed Studio catalog expansion. The review explicitly says, “It's a governance decision, not a code change; get it decided before touching more successors.” Approval of this design would still not replace Platform Admin authorship or independent Platform Owner publication review required by [AGENTS.md](../../AGENTS.md).

## Evidence and shared integration points

- [Platform catalog](../../governance/catalog/platform-catalog.v1.json): Studio `entity/meta`, `plans/ent`; Neon owns the location and workforce modules.
- [Studio registry constraints](../../server/db/ddl/planes/studio/metadata/05_constraints.sql): `metadata.entity.module_id` references local `control.module`.
- [Product importer](../../server/packages/planes/studio/meta-entity-authoring/src/system-reference-authoring.ts): currently uses `product.moduleCode` for both registry matching/insertion and the source marker; rejects conflicts and unavailable modules.
- [Reference product contract](../../server/packages/planes/studio/meta-entity-authoring/src/authoring/product.ts) and [table product contract](../../server/packages/planes/studio/meta-entity-authoring/src/authoring/table-product.ts): strict versioned product parsers must evolve together.
- [Authoring repository](../../server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts): ordinary entity registration also resolves its module through Studio's local catalog.

The current workspace inventory records 15 Studio registry rows under `ent`: three unsigned candidates compiled (Locale, State Region, Timezone), seven predecessor-source mismatches (Country, Currency, Language and four IAM products), and the five catalog-blocked products above. These are workspace evidence, not deployed corrections or approved releases.

## Contract design to implement after the decision

1. Version the reference/table product contracts. Require explicit plane-qualified `authoringModule` and `domainModule` coordinates in the new version; finalize their exact serialized shape with the shared compiler changes. Authoring ownership (`platform`) remains distinct from both module identities. Navigation stays in per-plane placement metadata; declaring Studio authorship must not add a Studio runtime target or route.
2. Preserve legacy product/marker version semantics and historical hashes. Do not reinterpret an old `moduleCode`, add a permissive fallback, or rewrite a predecessor to match today's source. Reject missing/invalid coordinates in the new version with actionable errors.
3. Make importer, registration, compiler, source resolver and successor/inventory tooling consume the same validated contract. Resolve Studio registry identity from the explicit authoring coordinate. Validate the domain coordinate against its own plane's catalog, without requiring that domain module to exist in Studio. Product markers and hashes must pin both identities and the schema version.
4. Remove the current conflation of authoring module with navigation placement in source validation. Validate placement against its declared plane and catalog independently. Preserve every published permission, scope, business field, capability and target unless a separately reviewed change explicitly changes it.
5. Reconcile each of the seven mismatched predecessors from exact historical product bytes and captured release identities. A current product with its old module restored is insufficient when its hash differs. Record intentional non-module differences separately; do not label such a successor module-only. If exact source cannot be recovered, retain the blocker.
6. Prepare unsigned successors only after the contract decision and implementation. Registry correction and publication must use the shared governed workflow with exact predecessor/source/hash pins, atomic conflict checks and independent review. Do not directly update registry rows or treat a compiler receipt as approval.

Before implementing, trace Country's source, publication, provider, authorization, routing and list/detail behavior as required by AGENTS.md. Validate the revised contract with generic fixtures across all eligible products, including missing module, wrong plane, legacy hash preservation and navigation independence. Review generated graph differences and verify existing Country and Principal Profile integration. Documentation review alone is not runtime qualification.

## Execution order and separate blockers

1. Obtain the module contract decision above, then implement and validate the shared contract.
2. Reconcile the seven predecessor-source mismatches; regenerate reviewable successors without fabricating historical identity.
3. Complete and qualify reusable BP projection readers and company/organization scope bindings before any DEV BP cutover. Then prepare complete governed successors, obtain human authorship/review, prepare role relationships, run guarded cleanup and verify allowed/denied/deep-link flows. Resolve both the platform publication and tenant override dependency.

The seven obsolete BP permissions are **not removed from existing DEV**. The previous inventory records 20 role-permission edges across three tenants and two active payload references. Re-inventory before any eventual cutover. Unresolved scope continues to fail closed; this decision adds no grants, permission requirements or MFA changes. See the [DEV cutover report](bp-child-read-dev-cutover-20261003.md).

Track independently: seven complementary native/split pairs awaiting lossless consolidation; the Studio `exp` 32-versus-33 catalog discrepancy; the frozen shape catalog missing `core.fields[].display`; and current evidence recapture including the stale CA08 candidate. The latest workspace follow-up reports that removed historical SQL was found with exact matching Git hashes. That resolves historical file provenance only, not current release readiness. Do not restore old SQL or fabricate receipts to turn the release gate green.

## Validation of this review action

Checked the catalog, local registry FK and importer behavior, product contract consumers, review attachment and workspace follow-up. The DEV check was a read-only transaction against the existing deployment. No implementation, successor generation, live write, approval or activation was performed by this review action. Existing unrelated workspace changes remain separate.
