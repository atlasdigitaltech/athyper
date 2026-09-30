# Publication public export audit and dispositions

Date: 2026-09-26. Audit-only boundary: publication source, exports and contracts are unchanged.
Preflight remains blocked on governance decisions.

This is the pre-extraction audit snapshot. The subsequent implementation and fresh
verification are recorded in publication-shared-extraction-checkpoint.md; the
source-level baseline is publication-source-consumers-before-extraction.md.
Rerun the inventory tool for current declaration origins and consumer edges.

## Fresh prerequisite verification

Before the audit, reran:
`ENTITY_SCOPE_POSTGRES_TEST=1 pnpm --dir server/apps/platform-host test src/composition/__tests__/persisted-scopes.postgres.test.ts`.
Exit 0; 1 file / 8 tests passed; duration 1.56s, start 15:31:10.
The dedicated disposable PostgreSQL container was stopped/removed; a subsequent
Docker scope-test container listing was empty. Fixture RLS only, not production product policies.

Gates differ: scope integration uses ENTITY_SCOPE_POSTGRES_TEST=1; the existing
Mesh readiness integration uses MESH_READINESS_TEST_DOCKER. No Mesh live run claimed.
No full host test or compiler rerun in this audit-only checkpoint; prior results
remain historical, not fresh measurements.

## Method and scope

Reproduce with `node server/apps/platform-host/scripts/verification/inventory-publication-exports.mjs`.
The read-only script uses the TypeScript checker to resolve the index.ts export surface
and AST import scanning to identify named, namespace, re-export and literal dynamic
consumers across repository TS/TSX/MTS/JS/MJS files. It prints JSON, changes no source,
and does not import application code. Root and package.json subpath imports plus
relative imports to the exported implementation modules are included.

Found **105 symbols**, **31 source modules**, **85 consumer files**.
Symbol classifications: **68 generic**, **22 BP-specific**, **15 hybrid**.
Classification is a manual implementation review, not a name-based classifier.

Consumer IDs below map to exact paths in the consumer directory. Edges include
tests and scripts, not only production routes. Namespace edges are conservative;
they do not prove every symbol is used. No detected consumer is not authorization
to delete a public export. Computed imports, non-code references, external consumers,
and downstream contract/parser internals are not exhaustively covered. Generic
behavior does not imply a BP-free transitive import graph or production readiness.

## Findings that change the migration boundary

- Generic host registration does not make its publication adapters generic.
- The barrel exposes BP definitions/case contracts and generic publication together.
- Subpath exports bypass the barrel. Editing index.ts alone cannot retire those implementations.
- Authenticated release review is itself hybrid: the BP packet kind and Neon receipt
  prefix remain. Preserve existing security validation while migrating evidence formats.
- localPreviewRoot is generic behavior in a hybrid module; file-level deletion would
  break generic preview callers. ActiveCaseContract and InitialCaseContract are likewise
  reusable type shapes in a hybrid implementation.
- VerifiedPublicationArtifactLoader, authority work and local projections are live
  shared consumers. Removing their BP branches without a historical artifact/rollback
  policy is not a safe cleanup.
- EntityDefinitionSource and compileCompiledEntityArtifacts are genuine reusable
  boundaries; keep them rather than recreating equivalent BP wrappers.

## File-level decisions

Source files are under server/packages/services/publication/src/.

| Source | Classification | Disposition | Reason / invariant |
| --- | --- | --- | --- |
| authenticated-entity-release-review.ts | Hybrid | Extract generic behavior | Packet kind bp_operation_decision_packet and neon-operation-review: receipts remain hardcoded. Introduce versioned trusted evidence adapters without loosening independent reviewers, nomination, evidence digests, live authority or expiry checks. |
| collection-configuration-source.ts | Generic | Retain | Read published collection configuration. |
| compiled-entity-artifact-compiler.ts | Generic | Retain | Entity-independent artifact hashing, registry/contracts and release validation. |
| compiled-entity-collection-compiler.ts | Hybrid | Extract generic behavior | compileDocumentCollection restricts Neon business_partner_request and master.business_partner. Parameterize validated relationship/source semantics; do not blindly substitute entity names. |
| coordinated-entity-adoption.ts | Generic | Retain | Entity-parameterized verified pair adoption. Database adapter imports the hybrid local repository: retain seam, do not claim a clean module-load graph. |
| entity-authorization-compiler.ts | Generic | Retain | Metadata operations, scope, current catalog and reviewed release compilation; common-reference policy is platform policy, not BP dispatch. |
| entity-authorization-publication-review.ts | Generic | Retain | Exact coordinate/operation-set, current authority, expiry and evidence guard. |
| entity-case-contract-routes.ts | BP-specific | Retire after migration | BP-specific case-contract permissions/routes. Generic case authoring must preserve current authority and review evidence. |
| entity-case-contract-service.ts | Hybrid | Extract generic behavior | BP extension allowlist, requestedRole exception, review marker and snapshot/link storage mixed with generic contract comparison. Require explicit schema/compatibility policy and versioned persistence. |
| entity-definition-compiler.ts | BP-specific | Move declarations; retire adapter after migration | Fixed request/source/journey matrix and MESH projection. Use genuine compiled artifact compiler for mechanics; keep existing compatibility checks until explicit metadata equivalents exist. |
| entity-definition-consumer.ts | BP-specific | Retire after migration | Fixed onboarding key and BP/organization schema interpretations. Switch surviving scripts/consumers to verified pinned descriptors first. |
| entity-definition-routes.ts | BP-specific | Retire after migration | BP author/read/simulate/publish endpoints; host no longer registers them. Retire tests with routes after consumer/compatibility review. |
| entity-definition-service.ts | BP-specific | Retire after migration | BP bundle parser/service/errors and persistence. Preserve historical parser/error consumers until versioned artifact support is migrated. |
| entity-definition-source.ts | Generic | Retain | Projection-parameterized active-definition retrieval port. |
| entity-foundation-definition.ts | BP-specific | Move declarations into metadata | Foundation schemas/forms/workflows, including supplierRequestForm. Migrate independently publishable products; remove generator only after callers switch. |
| entity-initial-case-schema.ts | BP-specific | Move declarations into metadata | Initial BP schema only; governed-case activation remains preflight-gated. |
| entity-operation-binding-compiler.ts | Hybrid | Extract generic behavior | BP/company identity and hardcoded operation/permission/handler mappings mixed with source/catalog validation. Move product values into reviewed metadata; retain exact source/catalog checks. |
| file-entity-release-review-store.ts | Generic | Retain | Pinned manifest and read-only evidence loading. Type-coupled to authenticated review port; generic classification does not imply import isolation. |
| kysely-authority-repository.ts | Hybrid | Extract generic behavior | Generic release lifecycle plus BP definition-link INSERT. Migrate source registration and contracts together; keep replay checks. |
| kysely-local-projection-repository.ts | Hybrid | Extract generic behavior | Generic staging/activation plus BP projection/function and company-binding branches. Preserve old release readability until rollback migration is decided. |
| kysely-publication-authority-work.ts | Hybrid | Extract generic behavior | Generic compile/sign/dispatch pipeline plus BP source queries, bundle compiler and company bindings. Replace with closed artifact-kind strategies; unsupported sources fail closed. |
| kysely-publication-operations-repository.ts | Generic | Retain | Generic deployment and operational persistence. |
| local-definition-preview.ts | Hybrid | Extract generic behavior | Barrel exports only localPreviewRoot, a generic environment guard; its source module eagerly imports BP compiler/preview logic. Extract guard separately while retaining all local-only restrictions. |
| notification-configuration-source.ts | Generic | Retain | Read published notification configuration. |
| publication-artifact-loader.ts | Hybrid | Extract generic behavior | Generic verified envelope loader directly imports BP parser. Separate payload validators only behind existing hash/signature/coordinate/version gates. |
| publication-artifact-store.ts | Generic | Retain | Immutable content-addressed storage; preserve hash and URI checks. |
| publication-jobs.ts | Generic | Retain | Artifact-independent queues, jobs and orchestration ports. |
| publication-operations.ts | Generic | Retain | Deployment operations, signing rotation and canary assessment. |
| publication-orchestrator.ts | Generic | Retain | Stage/verify/activate protocol through explicit ports; preserve idempotency and rollback semantics. |
| publication-routes.ts | Generic | Retain | Generic publication endpoints and authorization; do not remove alongside BP authoring routes. |
| release-promotion.ts | Generic | Retain | Coordinate-bound independent approval and qualification policy. |

## Every barrel-exported symbol

Each symbol inherits its file disposition unless a narrower override is shown.
“None detected” means static search found no named/namespace edge, not safe deletion.

| Symbol | Declaration source | Classification | Disposition | Consumer IDs |
| --- | --- | --- | --- | --- |
| ACKNOWLEDGE_PUBLICATION_JOB | publication-jobs.ts | Generic | Retain | None detected |
| ActiveCaseContract | entity-case-contract-service.ts | Generic | Retain / extract type | C30 |
| adoptEntityPair | coordinated-entity-adoption.ts | Generic | Retain | C26 |
| APPLY_PUBLICATION_RELEASE_JOB | publication-jobs.ts | Generic | Retain | C10, C64 |
| assertCompanyCaseOperationBindings | entity-operation-binding-compiler.ts | Hybrid | Extract generic behavior | C33, C59 |
| assessPublicationCanary | publication-operations.ts | Generic | Retain | C42 |
| authoredAuthorization | entity-authorization-compiler.ts | Generic | Retain | C62 |
| BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION | entity-definition-compiler.ts | BP-specific | Move declarations; retire adapter after migration | C60, C61 |
| BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS | entity-definition-compiler.ts | BP-specific | Move declarations; retire adapter after migration | C32 |
| BUSINESS_PARTNER_ONBOARDING_PUBLICATION_KEY | entity-definition-consumer.ts | BP-specific | Retire after migration | None detected |
| BusinessPartnerCaseContractService | entity-case-contract-service.ts | Hybrid | Extract generic behavior | C4, C30, C36, C51 |
| businessPartnerCasePublicationIdentity | entity-operation-binding-compiler.ts | BP-specific | Replace with explicit published identity binding | C33, C59, C60 |
| BusinessPartnerDefinitionCompileReport | entity-definition-compiler.ts | BP-specific | Move declarations; retire adapter after migration | None detected |
| BusinessPartnerDefinitionError | entity-definition-service.ts | BP-specific | Retire after migration | C29, C31, C51, C52, C53, C54, C55 |
| BusinessPartnerDefinitionService | entity-definition-service.ts | BP-specific | Retire after migration | C35, C55 |
| businessPartnerInitialCaseSchema | entity-initial-case-schema.ts | BP-specific | Move declarations into metadata | C30, C57 |
| classifyPublicationFailure | publication-orchestrator.ts | Generic | Retain | C63 |
| companySetupCaseEntityCode | entity-operation-binding-compiler.ts | BP-specific | Move declarations into metadata | None detected |
| companySetupCaseInitialSchema | entity-operation-binding-compiler.ts | BP-specific | Move declarations into metadata | C33 |
| COMPILE_PUBLICATION_ARTIFACT_JOB | publication-jobs.ts | Generic | Retain | C10, C41, C51, C55, C65 |
| compileBusinessPartnerCompiledEntity | entity-definition-compiler.ts | BP-specific | Move declarations; retire adapter after migration | C2, C32 |
| compileBusinessPartnerDefinition | entity-definition-compiler.ts | BP-specific | Move declarations; retire adapter after migration | C1, C32, C56, C60, C61 |
| compileCompanyCaseOperationBindings | entity-operation-binding-compiler.ts | Hybrid | Extract generic behavior | C33, C60 |
| compileCompiledEntityArtifacts | compiled-entity-artifact-compiler.ts | Generic | Retain | C2, C13, C19, C22, C25, C53, C66, C69, C70, C72, C73, C74, C75, C85 |
| COMPILED_ENTITY_ARTIFACT_COMPILER_VERSION | compiled-entity-artifact-compiler.ts | Generic | Retain | None detected |
| CompiledEntityArtifactAuthoringInputV2 | compiled-entity-artifact-compiler.ts | Generic | Retain | None detected |
| CompiledEntityArtifactCompilationInputV2 | compiled-entity-artifact-compiler.ts | Generic | Retain | C53 |
| CompiledEntityArtifactCompilationV2 | compiled-entity-artifact-compiler.ts | Generic | Retain | None detected |
| CompiledEntityArtifactCompileReportV2 | compiled-entity-artifact-compiler.ts | Generic | Retain | None detected |
| CompiledEntityReleaseAuthoringInputV2 | compiled-entity-artifact-compiler.ts | Generic | Retain | None detected |
| compiledEntityRuntimeProjection | compiled-entity-artifact-compiler.ts | Generic | Retain | C2, C13, C22, C25, C66, C69, C70, C75 |
| compileDocumentCollection | compiled-entity-collection-compiler.ts | Hybrid | Extract generic behavior | C8, C23, C60 |
| compileEntityAuthorizationPublication | entity-authorization-compiler.ts | Generic | Retain | C27, C60 |
| CoordinatedAdoptionPorts | coordinated-entity-adoption.ts | Generic | Retain | None detected |
| createAuthenticatedEntityReleaseReview | authenticated-entity-release-review.ts | Hybrid | Extract generic behavior | C7, C10, C15, C58, C78, C79, C80, C81 |
| createBusinessPartnerFoundationDefinition | entity-foundation-definition.ts | BP-specific | Move declarations into metadata | C1, C32, C38 |
| createEntityAuthorizationPublicationReview | entity-authorization-publication-review.ts | Generic | Retain | C28, C46 |
| createFileEntityReleaseReviewLoader | file-entity-release-review-store.ts | Generic | Retain | C7, C34 |
| createPublicationApplyHandler | publication-jobs.ts | Generic | Retain | C10 |
| createPublicationAuthorityHandlers | publication-jobs.ts | Generic | Retain | C10, C41 |
| createPublicationRecoveryHandler | publication-jobs.ts | Generic | Retain | C10 |
| createPublicationRollbackHandler | publication-jobs.ts | Generic | Retain | C10, C41 |
| DISPATCH_PUBLICATION_JOB | publication-jobs.ts | Generic | Retain | C10, C41 |
| enqueueApply | publication-jobs.ts | Generic | Retain | None detected |
| entityAdoptionTransaction | coordinated-entity-adoption.ts | Generic | Retain | None detected |
| EntityAuthorizationPermission | entity-authorization-compiler.ts | Generic | Retain | C20, C47, C48 |
| EntityAuthorizationPublicationInput | entity-authorization-compiler.ts | Generic | Retain | C27, C50, C60 |
| EntityDefinitionSource | entity-definition-source.ts | Generic | Retain | C54 |
| evaluatePromotion | release-promotion.ts | Generic | Retain | C45 |
| ImmutablePublicationArtifactStore | publication-artifact-store.ts | Generic | Retain | C9, C40, C82 |
| InitialCaseContract | entity-case-contract-service.ts | Generic | Retain / extract type | None detected |
| initialCaseContractSchema | entity-case-contract-service.ts | Hybrid | Extract generic behavior | C30, C33 |
| KyselyLocalProjectionRepository | kysely-local-projection-repository.ts | Hybrid | Extract generic behavior | C3, C4, C10, C11, C13, C14, C36, C37, C49, C67, C71, C76, C77, C82 |
| KyselyPublicationAuthorityRepository | kysely-authority-repository.ts | Hybrid | Extract generic behavior | C3, C4, C10, C11, C12, C16, C21, C35, C36, C39, C52, C56, C60, C67, C71, C82 |
| KyselyPublicationAuthorityWork | kysely-publication-authority-work.ts | Hybrid | Extract generic behavior | C3, C4, C6, C10, C17, C21, C36, C39 |
| KyselyPublicationAuthorityWorkOptions | kysely-publication-authority-work.ts | Hybrid | Extract generic behavior | C21, C39 |
| KyselyPublicationOperationsRepository | kysely-publication-operations-repository.ts | Generic | Retain | C10 |
| LocalBusinessPartnerDefinitionConsumer | entity-definition-consumer.ts | BP-specific | Retire after migration | C14, C32, C38 |
| LocalMeshBusinessPartnerDefinitionConsumer | entity-definition-consumer.ts | BP-specific | Retire after migration | C32 |
| localPreviewRoot | local-definition-preview.ts | Generic | Extract generic guard from hybrid module | C8, C38, C56, C68 |
| MeshOrganizationProfileSchema | entity-definition-consumer.ts | BP-specific | Retire after migration | None detected |
| nextCompanyInitialReleaseNo | entity-case-contract-service.ts | Hybrid | Extract generic behavior | C33 |
| parseBusinessPartnerDefinitionBundle | entity-definition-service.ts | BP-specific | Retire after migration | C32, C53, C62 |
| PromotionApproval | release-promotion.ts | Generic | Retain | None detected |
| PromotionCoordinate | release-promotion.ts | Generic | Retain | C45 |
| promotionCoordinateHash | release-promotion.ts | Generic | Retain | None detected |
| PromotionEvidence | release-promotion.ts | Generic | Retain | C45 |
| PromotionHostPolicy | release-promotion.ts | Generic | Retain | C45 |
| PUBLICATION_APPLY_QUEUE | publication-jobs.ts | Generic | Retain | C10, C41, C64, C65 |
| PUBLICATION_AUTHORITY_QUEUE | publication-jobs.ts | Generic | Retain | C10, C41, C51, C55, C65 |
| PUBLICATION_MAINTENANCE_QUEUE | publication-jobs.ts | Generic | Retain | C10 |
| publicationArtifactKey | publication-artifact-store.ts | Generic | Retain | C40, C60 |
| PublicationArtifactLoaderOptions | publication-artifact-loader.ts | Generic | Retain loader port | C4, C36 |
| PublicationArtifactStoreOptions | publication-artifact-store.ts | Generic | Retain | None detected |
| publicationArtifactUri | publication-artifact-store.ts | Generic | Retain | C40, C60 |
| PublicationAuthorityWork | publication-jobs.ts | Generic | Retain | C41, C60 |
| PublicationCoordinatePayload | publication-jobs.ts | Generic | Retain | C60 |
| PublicationOperationsError | publication-operations.ts | Generic | Retain | C44, C65 |
| PublicationOperationsService | publication-operations.ts | Generic | Retain | C10, C42, C65 |
| PublicationOrchestrationError | publication-orchestrator.ts | Generic | Retain | None detected |
| PublicationOrchestrator | publication-orchestrator.ts | Generic | Retain | C3, C5, C10, C11, C43, C63, C67 |
| PublicationRollbackPayload | publication-jobs.ts | Generic | Retain | None detected |
| PublicationRouteOptions | publication-routes.ts | Generic | Retain | C44 |
| PublicationSigningRotationService | publication-operations.ts | Generic | Retain | C42 |
| QualificationReceipt | release-promotion.ts | Generic | Retain | None detected |
| readPublishedCollectionConfiguration | collection-configuration-source.ts | Generic | Retain | C10, C21 |
| readPublishedNotificationConfiguration | notification-configuration-source.ts | Generic | Retain | C10, C39 |
| RECOVER_STALLED_PUBLICATIONS_JOB | publication-jobs.ts | Generic | Retain | C10 |
| registerBusinessPartnerCaseContractRoutes | entity-case-contract-routes.ts | BP-specific | Retire after migration | C29 |
| registerBusinessPartnerDefinitionRoutes | entity-definition-routes.ts | BP-specific | Retire after migration | C31 |
| registerPublicationRoutes | publication-routes.ts | Generic | Retain | C10, C44 |
| ReleaseEnvironment | release-promotion.ts | Generic | Retain | None detected |
| ReleasePromotionPorts | release-promotion.ts | Generic | Retain | None detected |
| ReleasePromotionService | release-promotion.ts | Generic | Retain | C45 |
| ReleaseScope | release-promotion.ts | Generic | Retain | None detected |
| ROLLBACK_PUBLICATION_RELEASE_JOB | publication-jobs.ts | Generic | Retain | C10, C41, C65 |
| SIGN_PUBLICATION_ARTIFACT_JOB | publication-jobs.ts | Generic | Retain | C10, C41 |
| simulateBusinessPartnerDefinition | entity-definition-service.ts | BP-specific | Retire after migration | C32 |
| supplierRequestForm | entity-foundation-definition.ts | BP-specific | Move declarations into metadata | None detected |
| validateCaseContractUpdate | entity-case-contract-service.ts | Hybrid | Extract generic behavior | C30 |
| validateCompleteBusinessPartnerDefinition | entity-definition-compiler.ts | BP-specific | Move declarations; retire adapter after migration | C54 |
| validateInitialCaseContract | entity-case-contract-service.ts | Hybrid | Extract generic behavior | C30 |
| VerifiedOperationReview | entity-authorization-publication-review.ts | Generic | Retain | C28, C46 |
| VerifiedPublicationArtifactLoader | publication-artifact-loader.ts | Hybrid | Extract generic behavior | C3, C4, C10, C13, C18, C21, C25, C27, C32, C36, C39, C61, C76, C77, C82, C83, C84 |
| withDocumentCollectionSource | compiled-entity-collection-compiler.ts | Hybrid | Extract generic behavior | C23, C60 |

## Consumer directory

Paths are repository-relative. Test and integration paths are retained in the audit
because fixture migration is part of safe export retirement.

| ID | Consumer file |
| --- | --- |
| C1 | server/apps/platform-host/scripts/db-verification/provisioning/publish-development-business-partner-definition.ts |
| C2 | server/apps/platform-host/scripts/db-verification/provisioning/publish-development-compiled-entity-runtime.ts |
| C3 | server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-publication-qualification.mts |
| C4 | server/apps/platform-host/scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts |
| C5 | server/apps/platform-host/src/composition/create-container.ts |
| C6 | server/apps/platform-host/src/composition/dev-runtime-publication.ts |
| C7 | server/apps/platform-host/src/composition/entity-release-review-deployment.ts |
| C8 | server/apps/platform-host/src/composition/local-graph-preview.ts |
| C9 | server/apps/platform-host/src/composition/register-adapters.ts |
| C10 | server/apps/platform-host/src/composition/register-services.ts |
| C11 | server/apps/platform-host/src/composition/tenant-publication-orchestrator.ts |
| C12 | server/apps/platform-host/src/scripts/recover-dev-publication.ts |
| C13 | server/db/scripts/tests/integration/entity-capability-ca01.ts |
| C14 | server/db/scripts/tests/integration/neon-onboarding-submission.mts |
| C15 | server/packages/services/publication/src/__tests__/authenticated-entity-release-review.test.ts |
| C16 | server/packages/services/publication/src/__tests__/authority-api.test.ts |
| C17 | server/packages/services/publication/src/__tests__/authorization-activation-hold.test.ts |
| C18 | server/packages/services/publication/src/__tests__/baseline-artifact.test.ts |
| C19 | server/packages/services/publication/src/__tests__/bp2-source-admission.test.ts |
| C20 | server/packages/services/publication/src/__tests__/canonical-read-catalog.test.ts |
| C21 | server/packages/services/publication/src/__tests__/collection-artifact.test.ts |
| C22 | server/packages/services/publication/src/__tests__/compiled-entity-artifact-compiler.test.ts |
| C23 | server/packages/services/publication/src/__tests__/compiled-entity-collection-compiler.test.ts |
| C24 | server/packages/services/publication/src/__tests__/compiled-publication-scope.test.ts |
| C25 | server/packages/services/publication/src/__tests__/compiled-runtime-publication.test.ts |
| C26 | server/packages/services/publication/src/__tests__/coordinated-entity-adoption.test.ts |
| C27 | server/packages/services/publication/src/__tests__/entity-authorization-compiler.test.ts |
| C28 | server/packages/services/publication/src/__tests__/entity-authorization-publication-review.test.ts |
| C29 | server/packages/services/publication/src/__tests__/entity-case-contract-routes.test.ts |
| C30 | server/packages/services/publication/src/__tests__/entity-case-contract.test.ts |
| C31 | server/packages/services/publication/src/__tests__/entity-definition-routes.test.ts |
| C32 | server/packages/services/publication/src/__tests__/entity-definition.test.ts |
| C33 | server/packages/services/publication/src/__tests__/entity-operation-binding-compiler.test.ts |
| C34 | server/packages/services/publication/src/__tests__/file-entity-release-review-store.test.ts |
| C35 | server/packages/services/publication/src/__tests__/integration/development-definition-save.mjs |
| C36 | server/packages/services/publication/src/__tests__/integration/entity-case-contract-publication.ts |
| C37 | server/packages/services/publication/src/__tests__/integration/three-plane-local-projection.mjs |
| C38 | server/packages/services/publication/src/__tests__/local-definition-preview.test.ts |
| C39 | server/packages/services/publication/src/__tests__/notification-artifact.test.ts |
| C40 | server/packages/services/publication/src/__tests__/publication-artifact-store.test.ts |
| C41 | server/packages/services/publication/src/__tests__/publication-jobs.test.ts |
| C42 | server/packages/services/publication/src/__tests__/publication-operations.test.ts |
| C43 | server/packages/services/publication/src/__tests__/publication-orchestrator.test.ts |
| C44 | server/packages/services/publication/src/__tests__/publication-runtime-review.test.ts |
| C45 | server/packages/services/publication/src/__tests__/release-promotion.test.ts |
| C46 | server/packages/services/publication/src/authenticated-entity-release-review.ts |
| C47 | server/packages/services/publication/src/canonical-read-catalog.ts |
| C48 | server/packages/services/publication/src/compiled-entity-collection-compiler.ts |
| C49 | server/packages/services/publication/src/coordinated-entity-adoption.ts |
| C50 | server/packages/services/publication/src/entity-authorization-publication-review.ts |
| C51 | server/packages/services/publication/src/entity-case-contract-routes.ts |
| C52 | server/packages/services/publication/src/entity-case-contract-service.ts |
| C53 | server/packages/services/publication/src/entity-definition-compiler.ts |
| C54 | server/packages/services/publication/src/entity-definition-consumer.ts |
| C55 | server/packages/services/publication/src/entity-definition-routes.ts |
| C56 | server/packages/services/publication/src/entity-definition-service.ts |
| C57 | server/packages/services/publication/src/entity-operation-binding-compiler.ts |
| C58 | server/packages/services/publication/src/file-entity-release-review-store.ts |
| C59 | server/packages/services/publication/src/kysely-local-projection-repository.ts |
| C60 | server/packages/services/publication/src/kysely-publication-authority-work.ts |
| C61 | server/packages/services/publication/src/local-definition-preview.ts |
| C62 | server/packages/services/publication/src/publication-artifact-loader.ts |
| C63 | server/packages/services/publication/src/publication-jobs.ts |
| C64 | server/packages/services/publication/src/publication-operations.ts |
| C65 | server/packages/services/publication/src/publication-routes.ts |
| C66 | tooling/scripts/local-dev/bootstrap-main-dev-metadata.mts |
| C67 | tooling/scripts/local-dev/deploy-bp-adoption-worker.mts |
| C68 | tooling/scripts/local-dev/initialize-preview.mts |
| C69 | tooling/scripts/local-dev/prepare-bp-compiled-only-candidate.mts |
| C70 | tooling/scripts/local-dev/prepare-bp-request-compiled-runtime-candidate.mts |
| C71 | tooling/scripts/local-dev/preview-integration.mts |
| C72 | tooling/scripts/metadata/compile-release-candidate.mts |
| C73 | tooling/scripts/metadata/prepare-collaboration-discovery-candidate.mts |
| C74 | tooling/scripts/metadata/prepare-compiled-review.mts |
| C75 | tooling/scripts/verification/business-partner-cutover-publication.fixture.mts |
| C76 | tooling/scripts/verification/isolated-enter/harness/host.mjs |
| C77 | tooling/scripts/verification/isolated-execution/host.mjs |
| C78 | tooling/scripts/verification/qualify-business-partner-enter-review-adapter.mts |
| C79 | tooling/scripts/verification/qualify-business-partner-release-review-adapter.mts |
| C80 | tooling/scripts/verification/qualify-business-partner-reset-review-source.mts |
| C81 | tooling/scripts/verification/qualify-business-partner-v2-release-review-adapter.mts |
| C82 | tooling/scripts/verification/retain-development-publication-receipts.mjs |
| C83 | tooling/scripts/verification/verify-business-partner-release-19-artifact.mjs |
| C84 | tooling/scripts/verification/verify-business-partner-release-19-current-runtime.mjs |
| C85 | tooling/scripts/verification/verify-partner-classification-candidate.mts |

## Public subpath boundary

These package.json entries remain independent of the root barrel. Audit their direct
consumers before removal; the inventory JSON includes module-level edges as well
as the barrel symbol list.

| Public entry | Target |
| --- | --- |
| . | ./src/index.ts |
| ./kysely-publication-authority-work | ./src/kysely-publication-authority-work.ts |
| ./kysely-authority-repository | ./src/kysely-authority-repository.ts |
| ./kysely-local-projection-repository | ./src/kysely-local-projection-repository.ts |
| ./publication-artifact-loader | ./src/publication-artifact-loader.ts |
| ./publication-orchestrator | ./src/publication-orchestrator.ts |
| ./entity-foundation-definition | ./src/entity-foundation-definition.ts |
| ./entity-definition-compiler | ./src/entity-definition-compiler.ts |
| ./compiled-entity-artifact-compiler | ./src/compiled-entity-artifact-compiler.ts |
| ./compiled-entity-collection-compiler | ./src/compiled-entity-collection-compiler.ts |
| ./entity-case-contract-service | ./src/entity-case-contract-service.ts |

## Implementation sequence after this audit

1. Extract reusable ports/types and local preview environment guard without changing
   behavior; preserve compatibility exports while switching verified consumers.
2. Extract generic operation/collection binding validation around explicit reviewed
   metadata inputs. Preserve source hashes, tenant/plane identity, catalog permissions,
   exact scope and unavailable-handler rejection. Do not activate governed cases.
3. Move BP foundation/initial schemas, allowlists, source/journey declarations and
   projection exclusions to product metadata only with validated equivalents.
4. Replace artifact source/payload dispatch with a closed supported-kind registry.
   Keep verification outside/before domain payload interpretation. Missing validator
   or source must fail closed; no fallback to BP compilation.
5. Decide historical artifact retention and rollback compatibility before removing
   BP bundle readers, link-table consumers or public subpaths. Do not rewrite signed
   history or substitute freshly inferred release pins.
6. Version the authenticated review evidence adapter separately; retain nomination,
   independent current reviewer authority, source/evidence digest checks, exact
   operation decisions and expiry. No generic “approved” boolean substitutes.
7. Switch remaining provisioning/integration consumers, then retire BP routes,
   adapters, barrel/subpath exports and obsolete tests together. Generic security
   regression coverage remains.
8. Compile publication contracts/service and host separately, run publication and host
   tests, and qualify relevant live storage/publication boundaries before activation.

No implementation deletion is authorized by a zero-consumer result alone.
Preflight, application metadata, deployed DDL/data and live services are unchanged.
