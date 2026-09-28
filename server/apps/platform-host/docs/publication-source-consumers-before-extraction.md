# Publication per-source consumer baseline

Captured 2026-09-26 before guard/type extraction. Source-level edges include non-barrel helpers, named/barrel, subpath, relative, namespace, re-export and literal dynamic imports. Barrel edges are attributed to the declaration source; namespace edges are conservative. Computed imports and downstream repositories remain outside this static inventory. No detected consumer does not authorize deletion.

## server/packages/services/publication/src/authenticated-entity-release-review.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/verification/qualify-business-partner-v2-release-review-adapter.mts:13 | ../../../server/packages/services/publication/src/authenticated-entity-release-review.js | createAuthenticatedEntityReleaseReview |
| tooling/scripts/verification/qualify-business-partner-release-review-adapter.mts:4 | ../../../server/packages/services/publication/src/authenticated-entity-release-review.js | createAuthenticatedEntityReleaseReview |
| tooling/scripts/verification/qualify-business-partner-enter-review-adapter.mts:13 | ../../../server/packages/services/publication/src/authenticated-entity-release-review.js | createAuthenticatedEntityReleaseReview |
| tooling/scripts/verification/qualify-business-partner-reset-review-source.mts:13 | ../../../server/packages/services/publication/src/authenticated-entity-release-review.js | createAuthenticatedEntityReleaseReview |
| server/apps/platform-host/src/composition/entity-release-review-deployment.ts:6 | @athyper/server-service-publication | createFileEntityReleaseReviewLoader, createAuthenticatedEntityReleaseReview |
| server/apps/platform-host/src/composition/register-services.ts:28 | @athyper/server-service-publication | createAuthenticatedEntityReleaseReview |
| server/packages/services/publication/src/__tests__/authenticated-entity-release-review.test.ts:3 | ../authenticated-entity-release-review.js | createAuthenticatedEntityReleaseReview |
| server/packages/services/publication/src/file-entity-release-review-store.ts:5 | ./authenticated-entity-release-review.js | createAuthenticatedEntityReleaseReview |

## server/packages/services/publication/src/canonical-read-catalog.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/verification/prepare-business-partner-enter-correction.mts:9 | ../../../server/packages/services/publication/src/canonical-read-catalog.ts | assertCanonicalReadSourceCatalog |
| server/packages/services/publication/src/__tests__/canonical-read-catalog.test.ts:3 | ../canonical-read-catalog.js | assertCanonicalReadSourceCatalog |
| server/packages/services/publication/src/entity-authorization-compiler.ts:1 | ./canonical-read-catalog.js | assertCanonicalReadSourceCatalog |

## server/packages/services/publication/src/collection-configuration-source.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/register-services.ts:21 | @athyper/server-service-publication | readPublishedNotificationConfiguration, readPublishedCollectionConfiguration |
| server/packages/services/publication/src/__tests__/collection-artifact.test.ts:10 | ../collection-configuration-source.js | readPublishedCollectionConfiguration |

## server/packages/services/publication/src/compiled-entity-artifact-compiler.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/metadata/prepare-compiled-review.mts:5 | ../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts |
| tooling/scripts/metadata/prepare-collaboration-discovery-candidate.mts:5 | ../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts |
| tooling/scripts/metadata/compile-release-candidate.mts:8 | ../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts |
| tooling/scripts/local-dev/prepare-bp-compiled-only-candidate.mts:11 | ../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| tooling/scripts/verification/business-partner-cutover-publication.fixture.mts:5 | ../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| tooling/scripts/local-dev/prepare-bp-request-compiled-runtime-candidate.mts:13 | ../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| tooling/scripts/local-dev/bootstrap-main-dev-metadata.mts:11 | ../../../server/packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| tooling/scripts/verification/verify-partner-classification-candidate.mts:5 | ../../../server/packages/services/publication/src/index.ts | compileCompiledEntityArtifacts |
| server/db/scripts/tests/integration/entity-capability-ca01.ts:16 | ../../../../packages/services/publication/src/compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| server/apps/platform-host/scripts/db-verification/provisioning/publish-development-compiled-entity-runtime.ts:22 | @athyper/server-service-publication | compileBusinessPartnerCompiledEntity, compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| server/packages/services/publication/src/__tests__/compiled-entity-artifact-compiler.test.ts:4 | ../compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| server/packages/services/publication/src/__tests__/compiled-runtime-publication.test.ts:4 | ../compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| server/packages/services/publication/src/__tests__/bp2-source-admission.test.ts:4 | ../compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts |
| server/packages/services/publication/src/entity-definition-compiler.ts:3 | ./compiled-entity-artifact-compiler.js | compileCompiledEntityArtifacts, CompiledEntityArtifactCompilationInputV2 |

## server/packages/services/publication/src/compiled-entity-collection-compiler.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/local-graph-preview.ts:14 | @athyper/server-service-publication | compileDocumentCollection, localPreviewRoot |
| server/packages/services/publication/src/__tests__/compiled-entity-collection-compiler.test.ts:4 | ../compiled-entity-collection-compiler.js | compileDocumentCollection, withDocumentCollectionSource |
| server/packages/services/publication/src/kysely-publication-authority-work.ts:9 | ./compiled-entity-collection-compiler.js | compileDocumentCollection, withDocumentCollectionSource |

## server/packages/services/publication/src/coordinated-entity-adoption.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/coordinated-entity-adoption.test.ts:2 | ../coordinated-entity-adoption.js | adoptEntityPair |

## server/packages/services/publication/src/entity-adoption-plan.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/entity-adoption-plan.test.ts:2 | ../entity-adoption-plan.js | checkEntityAdoptionHeads, planEntityAdoption, EntityAdoptionPlanInput |
| server/packages/services/publication/src/coordinated-entity-adoption.ts:4 | ./entity-adoption-plan.js | planEntityAdoption, checkEntityAdoptionHeads, EntityAdoptionPlanInput, AdoptionMember |

## server/packages/services/publication/src/entity-authorization-compiler.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/entity-authorization-compiler.test.ts:12 | ../entity-authorization-compiler.js | compileEntityAuthorizationPublication, EntityAuthorizationPublicationInput |
| server/packages/services/publication/src/__tests__/canonical-read-catalog.test.ts:4 | ../entity-authorization-compiler.js | EntityAuthorizationPermission |
| server/packages/services/publication/src/publication-artifact-loader.ts:3 | ./entity-authorization-compiler.js | authoredAuthorization |
| server/packages/services/publication/src/entity-authorization-publication-review.ts:1 | ./entity-authorization-compiler.js | EntityAuthorizationPublicationInput |
| server/packages/services/publication/src/canonical-read-catalog.ts:2 | ./entity-authorization-compiler.js | EntityAuthorizationPermission |
| server/packages/services/publication/src/kysely-publication-authority-work.ts:5 | ./entity-authorization-compiler.js | compileEntityAuthorizationPublication, EntityAuthorizationPublicationInput |
| server/packages/services/publication/src/compiled-entity-collection-compiler.ts:6 | ./entity-authorization-compiler.js | EntityAuthorizationPermission |

## server/packages/services/publication/src/entity-authorization-publication-review.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/entity-authorization-publication-review.test.ts:2 | ../entity-authorization-publication-review.js | createEntityAuthorizationPublicationReview, VerifiedOperationReview |
| server/packages/services/publication/src/authenticated-entity-release-review.ts:2 | ./entity-authorization-publication-review.js | createEntityAuthorizationPublicationReview, VerifiedOperationReview |

## server/packages/services/publication/src/entity-case-contract-routes.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/entity-case-contract-routes.test.ts:4 | ../entity-case-contract-routes.js | registerBusinessPartnerCaseContractRoutes |

## server/packages/services/publication/src/entity-case-contract-service.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts:7 | @athyper/server-service-publication/entity-case-contract-service | BusinessPartnerCaseContractService |
| server/packages/services/publication/src/entity-case-contract-routes.ts:19 | ./entity-case-contract-service.js | BusinessPartnerCaseContractService |
| server/packages/services/publication/src/__tests__/integration/entity-case-contract-publication.ts:7 | ../../entity-case-contract-service.js | BusinessPartnerCaseContractService |
| server/packages/services/publication/src/__tests__/entity-case-contract.test.ts:3 | ../entity-case-contract-service.js | validateCaseContractUpdate, ActiveCaseContract |
| server/packages/services/publication/src/__tests__/entity-case-contract.test.ts:160 | ../entity-case-contract-service.js | validateInitialCaseContract, initialCaseContractSchema, BusinessPartnerCaseContractService |
| server/packages/services/publication/src/__tests__/entity-operation-binding-compiler.test.ts:6 | ../entity-case-contract-service.js | initialCaseContractSchema |
| server/packages/services/publication/src/__tests__/entity-operation-binding-compiler.test.ts:179 | ../entity-case-contract-service.js | nextCompanyInitialReleaseNo |

## server/packages/services/publication/src/entity-definition-compiler.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/scripts/db-verification/provisioning/publish-development-compiled-entity-runtime.ts:22 | @athyper/server-service-publication | compileBusinessPartnerCompiledEntity, compileCompiledEntityArtifacts, compiledEntityRuntimeProjection |
| server/apps/platform-host/scripts/db-verification/provisioning/publish-development-business-partner-definition.ts:7 | @athyper/server-service-publication/entity-definition-compiler | compileBusinessPartnerDefinition |
| server/packages/services/publication/src/entity-definition-service.ts:18 | ./entity-definition-compiler.js | compileBusinessPartnerDefinition |
| server/packages/services/publication/src/local-definition-preview.ts:13 | ./entity-definition-compiler.js | compileBusinessPartnerDefinition, BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION |
| server/packages/services/publication/src/__tests__/entity-definition.test.ts:7 | ../index.js | BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS, compileBusinessPartnerCompiledEntity, compileBusinessPartnerDefinition, createBusinessPartnerFoundationDefinition, LocalBusinessPartnerDefinitionConsumer, LocalMeshBusinessPartnerDefinitionConsumer, parseBusinessPartnerDefinitionBundle, simulateBusinessPartnerDefinition, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/kysely-publication-authority-work.ts:36 | ./entity-definition-compiler.js | BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION, compileBusinessPartnerDefinition |
| server/packages/services/publication/src/entity-definition-consumer.ts:7 | ./entity-definition-compiler.js | validateCompleteBusinessPartnerDefinition |

## server/packages/services/publication/src/entity-definition-consumer.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/db/scripts/tests/integration/neon-onboarding-submission.mts:9 | ../../../../packages/services/publication/src/entity-definition-consumer.js | LocalBusinessPartnerDefinitionConsumer |
| server/packages/services/publication/src/__tests__/local-definition-preview.test.ts:1 | ../entity-definition-consumer.js | LocalBusinessPartnerDefinitionConsumer |
| server/packages/services/publication/src/__tests__/entity-definition.test.ts:7 | ../index.js | BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS, compileBusinessPartnerCompiledEntity, compileBusinessPartnerDefinition, createBusinessPartnerFoundationDefinition, LocalBusinessPartnerDefinitionConsumer, LocalMeshBusinessPartnerDefinitionConsumer, parseBusinessPartnerDefinitionBundle, simulateBusinessPartnerDefinition, VerifiedPublicationArtifactLoader |

## server/packages/services/publication/src/entity-definition-routes.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/entity-definition-routes.test.ts:4 | ../entity-definition-routes.js | registerBusinessPartnerDefinitionRoutes |

## server/packages/services/publication/src/entity-definition-service.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/entity-definition-routes.test.ts:3 | ../entity-definition-service.js | BusinessPartnerDefinitionError |
| server/packages/services/publication/src/__tests__/entity-case-contract-routes.test.ts:3 | ../entity-definition-service.js | BusinessPartnerDefinitionError |
| server/packages/services/publication/src/entity-definition-compiler.ts:2 | ./entity-definition-service.js | parseBusinessPartnerDefinitionBundle, BusinessPartnerDefinitionError |
| server/packages/services/publication/src/entity-case-contract-routes.ts:18 | ./entity-definition-service.js | BusinessPartnerDefinitionError |
| server/packages/services/publication/src/entity-case-contract-service.ts:5 | ./entity-definition-service.js | BusinessPartnerDefinitionError |
| server/packages/services/publication/src/publication-artifact-loader.ts:22 | ./entity-definition-service.js | parseBusinessPartnerDefinitionBundle |
| server/packages/services/publication/src/entity-definition-routes.ts:18 | ./entity-definition-service.js | BusinessPartnerDefinitionError, BusinessPartnerDefinitionService |
| server/packages/services/publication/src/__tests__/integration/development-definition-save.mjs:6 | ../../entity-definition-service.ts | BusinessPartnerDefinitionService |
| server/packages/services/publication/src/__tests__/entity-definition.test.ts:7 | ../index.js | BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS, compileBusinessPartnerCompiledEntity, compileBusinessPartnerDefinition, createBusinessPartnerFoundationDefinition, LocalBusinessPartnerDefinitionConsumer, LocalMeshBusinessPartnerDefinitionConsumer, parseBusinessPartnerDefinitionBundle, simulateBusinessPartnerDefinition, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/entity-definition-consumer.ts:6 | ./entity-definition-service.js | BusinessPartnerDefinitionError |

## server/packages/services/publication/src/entity-definition-source.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/entity-definition-consumer.ts:8 | ./entity-definition-source.js | EntityDefinitionSource |

## server/packages/services/publication/src/entity-foundation-definition.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/scripts/db-verification/provisioning/publish-development-business-partner-definition.ts:6 | @athyper/server-service-publication/entity-foundation-definition | createBusinessPartnerFoundationDefinition |
| server/packages/services/publication/src/__tests__/local-definition-preview.test.ts:13 | ../entity-foundation-definition.js | createBusinessPartnerFoundationDefinition |
| server/packages/services/publication/src/__tests__/entity-definition.test.ts:7 | ../index.js | BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS, compileBusinessPartnerCompiledEntity, compileBusinessPartnerDefinition, createBusinessPartnerFoundationDefinition, LocalBusinessPartnerDefinitionConsumer, LocalMeshBusinessPartnerDefinitionConsumer, parseBusinessPartnerDefinitionBundle, simulateBusinessPartnerDefinition, VerifiedPublicationArtifactLoader |

## server/packages/services/publication/src/entity-initial-case-schema.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/entity-operation-binding-compiler.ts:1 | ./entity-initial-case-schema.js | businessPartnerInitialCaseSchema |
| server/packages/services/publication/src/__tests__/entity-case-contract.test.ts:165 | ../entity-initial-case-schema.js | businessPartnerInitialCaseSchema |

## server/packages/services/publication/src/entity-operation-binding-compiler.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/entity-operation-binding-compiler.test.ts:2 | ../entity-operation-binding-compiler.js | businessPartnerCasePublicationIdentity, companySetupCaseInitialSchema |
| server/packages/services/publication/src/__tests__/entity-operation-binding-compiler.test.ts:82 | ../entity-operation-binding-compiler.js | compileCompanyCaseOperationBindings, assertCompanyCaseOperationBindings |
| server/packages/services/publication/src/kysely-publication-authority-work.ts:1 | ./entity-operation-binding-compiler.js | businessPartnerCasePublicationIdentity, compileCompanyCaseOperationBindings |
| server/packages/services/publication/src/kysely-local-projection-repository.ts:1 | ./entity-operation-binding-compiler.js | businessPartnerCasePublicationIdentity, assertCompanyCaseOperationBindings |

## server/packages/services/publication/src/file-entity-release-review-store.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/entity-release-review-deployment.ts:6 | @athyper/server-service-publication | createFileEntityReleaseReviewLoader, createAuthenticatedEntityReleaseReview |
| server/packages/services/publication/src/__tests__/file-entity-release-review-store.test.ts:6 | ../file-entity-release-review-store.js | createFileEntityReleaseReviewLoader |

## server/packages/services/publication/src/kysely-authority-repository.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/verification/retain-development-publication-receipts.mjs:11 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, ImmutablePublicationArtifactStore, VerifiedPublicationArtifactLoader |
| tooling/scripts/local-dev/preview-integration.mts:14 | ../../../server/packages/services/publication/src/kysely-authority-repository.js | KyselyPublicationAuthorityRepository |
| tooling/scripts/local-dev/deploy-bp-adoption-worker.mts:22 | ../../../server/packages/services/publication/src/kysely-authority-repository.js | KyselyPublicationAuthorityRepository |
| server/apps/platform-host/src/scripts/recover-dev-publication.ts:15 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository |
| server/apps/platform-host/scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts:8 | @athyper/server-service-publication/kysely-authority-repository | KyselyPublicationAuthorityRepository |
| server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-publication-qualification.mts:9 | @athyper/server-service-publication/kysely-authority-repository | KyselyPublicationAuthorityRepository |
| server/apps/platform-host/src/composition/tenant-publication-orchestrator.ts:3 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, PublicationOrchestrator |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/collection-artifact.test.ts:238 | ../kysely-authority-repository.js | * |
| server/packages/services/publication/src/__tests__/notification-artifact.test.ts:223 | ../kysely-authority-repository.js | * |
| server/packages/services/publication/src/entity-case-contract-service.ts:4 | ./kysely-authority-repository.js | KyselyPublicationAuthorityRepository |
| server/packages/services/publication/src/entity-definition-service.ts:17 | ./kysely-authority-repository.js | KyselyPublicationAuthorityRepository |
| server/packages/services/publication/src/__tests__/integration/development-definition-save.mjs:7 | ../../kysely-authority-repository.ts | KyselyPublicationAuthorityRepository |
| server/packages/services/publication/src/__tests__/integration/entity-case-contract-publication.ts:8 | ../../kysely-authority-repository.js | KyselyPublicationAuthorityRepository |
| server/packages/services/publication/src/__tests__/authority-api.test.ts:3 | ../kysely-authority-repository.js | KyselyPublicationAuthorityRepository |
| server/packages/services/publication/src/kysely-publication-authority-work.ts:27 | ./kysely-authority-repository.js | KyselyPublicationAuthorityRepository |

## server/packages/services/publication/src/kysely-local-projection-repository.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/verification/retain-development-publication-receipts.mjs:11 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, ImmutablePublicationArtifactStore, VerifiedPublicationArtifactLoader |
| tooling/scripts/local-dev/preview-integration.mts:15 | ../../../server/packages/services/publication/src/kysely-local-projection-repository.js | KyselyLocalProjectionRepository |
| tooling/scripts/local-dev/deploy-bp-adoption-worker.mts:23 | ../../../server/packages/services/publication/src/kysely-local-projection-repository.js | KyselyLocalProjectionRepository |
| tooling/scripts/verification/isolated-enter/harness/host.mjs:19 | @athyper/server-service-publication | VerifiedPublicationArtifactLoader, KyselyLocalProjectionRepository |
| tooling/scripts/verification/isolated-execution/host.mjs:14 | @athyper/server-service-publication | VerifiedPublicationArtifactLoader, KyselyLocalProjectionRepository |
| server/db/scripts/tests/integration/entity-capability-ca01.ts:21 | ../../../../packages/services/publication/src/kysely-local-projection-repository.js | KyselyLocalProjectionRepository |
| server/db/scripts/tests/integration/neon-onboarding-submission.mts:10 | ../../../../packages/services/publication/src/kysely-local-projection-repository.js | KyselyLocalProjectionRepository |
| server/apps/platform-host/scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts:28 | @athyper/server-service-publication/kysely-local-projection-repository | * |
| server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-publication-qualification.mts:10 | @athyper/server-service-publication/kysely-local-projection-repository | KyselyLocalProjectionRepository |
| server/apps/platform-host/src/composition/tenant-publication-orchestrator.ts:3 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, PublicationOrchestrator |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/integration/three-plane-local-projection.mjs:5 | ../../../src/kysely-local-projection-repository.ts | KyselyLocalProjectionRepository |
| server/packages/services/publication/src/__tests__/integration/entity-case-contract-publication.ts:29 | ../../kysely-local-projection-repository.js | * |
| server/packages/services/publication/src/__tests__/compiled-publication-scope.test.ts:4 | ../kysely-local-projection-repository.js | projectionJson |
| server/packages/services/publication/src/coordinated-entity-adoption.ts:3 | ./kysely-local-projection-repository.js | KyselyLocalProjectionRepository |

## server/packages/services/publication/src/kysely-publication-authority-work.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts:9 | @athyper/server-service-publication/kysely-publication-authority-work | KyselyPublicationAuthorityWork |
| server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-publication-qualification.mts:8 | @athyper/server-service-publication/kysely-publication-authority-work | KyselyPublicationAuthorityWork |
| server/apps/platform-host/src/composition/dev-runtime-publication.ts:13 | @athyper/server-service-publication | KyselyPublicationAuthorityWork |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/collection-artifact.test.ts:236 | ../kysely-publication-authority-work.js | * |
| server/packages/services/publication/src/__tests__/notification-artifact.test.ts:221 | ../kysely-publication-authority-work.js | * |
| server/packages/services/publication/src/__tests__/integration/entity-case-contract-publication.ts:9 | ../../kysely-publication-authority-work.js | KyselyPublicationAuthorityWork |
| server/packages/services/publication/src/__tests__/authorization-activation-hold.test.ts:3 | ../kysely-publication-authority-work.js | KyselyPublicationAuthorityWork |

## server/packages/services/publication/src/kysely-publication-operations-repository.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |

## server/packages/services/publication/src/local-definition-preview-policy.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/local-definition-preview.ts:18 | ./local-definition-preview-policy.js | assessLocalDefinitionChange |

## server/packages/services/publication/src/local-definition-preview.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/local-dev/initialize-preview.mts:2 | ../../../server/packages/services/publication/src/local-definition-preview.js | initializeLocalDefinitionPreview, localPreviewRoot |
| server/apps/platform-host/src/composition/local-graph-preview.ts:14 | @athyper/server-service-publication | compileDocumentCollection, localPreviewRoot |
| server/packages/services/publication/src/__tests__/local-definition-preview.test.ts:14 | ../local-definition-preview.js | assertCosmeticDefinitionChange, localPreviewRoot, saveLocalDefinitionPreview, overlayLocalDefinitionPreview |
| server/packages/services/publication/src/entity-definition-service.ts:1 | ./local-definition-preview.js | localPreviewRoot, saveLocalDefinitionPreview, previewStatus, localDefinitionPreviewBaseline, overlayLocalDefinitionPreview |
| server/packages/services/publication/src/kysely-local-projection-repository.ts:5 | ./local-definition-preview.js | overlayLocalDefinitionPreview, localDefinitionPreviewBaseline |
| server/packages/services/publication/src/entity-definition-consumer.ts:1 | ./local-definition-preview.js | overlayLocalDefinitionPreview |

## server/packages/services/publication/src/notification-configuration-source.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/register-services.ts:21 | @athyper/server-service-publication | readPublishedNotificationConfiguration, readPublishedCollectionConfiguration |
| server/packages/services/publication/src/__tests__/notification-artifact.test.ts:10 | ../notification-configuration-source.js | readPublishedNotificationConfiguration |

## server/packages/services/publication/src/publication-artifact-loader.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/verification/retain-development-publication-receipts.mjs:11 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, ImmutablePublicationArtifactStore, VerifiedPublicationArtifactLoader |
| tooling/scripts/verification/verify-business-partner-release-19-artifact.mjs:6 | @athyper/server-service-publication | VerifiedPublicationArtifactLoader |
| tooling/scripts/verification/verify-business-partner-release-19-current-runtime.mjs:42 | @athyper/server-service-publication | VerifiedPublicationArtifactLoader |
| tooling/scripts/verification/isolated-enter/harness/host.mjs:19 | @athyper/server-service-publication | VerifiedPublicationArtifactLoader, KyselyLocalProjectionRepository |
| tooling/scripts/verification/isolated-execution/host.mjs:14 | @athyper/server-service-publication | VerifiedPublicationArtifactLoader, KyselyLocalProjectionRepository |
| server/db/scripts/tests/integration/entity-capability-ca01.ts:20 | ../../../../packages/services/publication/src/publication-artifact-loader.js | VerifiedPublicationArtifactLoader |
| server/apps/platform-host/scripts/db-verification/tests/integration/business-partner-case-contract-publication.ts:30 | @athyper/server-service-publication/publication-artifact-loader | * |
| server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-publication-qualification.mts:11 | @athyper/server-service-publication/publication-artifact-loader | VerifiedPublicationArtifactLoader |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/collection-artifact.test.ts:9 | ../publication-artifact-loader.js | VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/entity-authorization-compiler.test.ts:16 | ../publication-artifact-loader.js | VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/notification-artifact.test.ts:9 | ../publication-artifact-loader.js | VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/compiled-runtime-publication.test.ts:8 | ../publication-artifact-loader.js | VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/local-definition-preview.ts:17 | ./publication-artifact-loader.js | VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/integration/entity-case-contract-publication.ts:31 | ../../publication-artifact-loader.js | * |
| server/packages/services/publication/src/__tests__/baseline-artifact.test.ts:5 | ../publication-artifact-loader.js | VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/entity-definition.test.ts:7 | ../index.js | BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS, compileBusinessPartnerCompiledEntity, compileBusinessPartnerDefinition, createBusinessPartnerFoundationDefinition, LocalBusinessPartnerDefinitionConsumer, LocalMeshBusinessPartnerDefinitionConsumer, parseBusinessPartnerDefinitionBundle, simulateBusinessPartnerDefinition, VerifiedPublicationArtifactLoader |

## server/packages/services/publication/src/publication-artifact-store.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/verification/retain-development-publication-receipts.mjs:11 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, ImmutablePublicationArtifactStore, VerifiedPublicationArtifactLoader |
| server/apps/platform-host/src/composition/register-adapters.ts:109 | @athyper/server-service-publication | ImmutablePublicationArtifactStore |
| server/packages/services/publication/src/__tests__/publication-artifact-store.test.ts:4 | ../publication-artifact-store.js | ImmutablePublicationArtifactStore, publicationArtifactKey, publicationArtifactUri |
| server/packages/services/publication/src/kysely-publication-authority-work.ts:32 | ./publication-artifact-store.js | publicationArtifactKey, publicationArtifactUri |

## server/packages/services/publication/src/publication-jobs.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/publication-routes.ts:7 | ./publication-jobs.js | COMPILE_PUBLICATION_ARTIFACT_JOB, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, ROLLBACK_PUBLICATION_RELEASE_JOB |
| server/packages/services/publication/src/entity-case-contract-routes.ts:14 | ./publication-jobs.js | COMPILE_PUBLICATION_ARTIFACT_JOB, PUBLICATION_AUTHORITY_QUEUE |
| server/packages/services/publication/src/entity-definition-routes.ts:14 | ./publication-jobs.js | COMPILE_PUBLICATION_ARTIFACT_JOB, PUBLICATION_AUTHORITY_QUEUE |
| server/packages/services/publication/src/__tests__/publication-jobs.test.ts:3 | ../publication-jobs.js | COMPILE_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, ROLLBACK_PUBLICATION_RELEASE_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, createPublicationAuthorityHandlers, createPublicationRollbackHandler, PublicationAuthorityWork |
| server/packages/services/publication/src/kysely-publication-authority-work.ts:28 | ./publication-jobs.js | PublicationAuthorityWork, PublicationCoordinatePayload |
| server/packages/services/publication/src/publication-operations.ts:11 | ./publication-jobs.js | APPLY_PUBLICATION_RELEASE_JOB, PUBLICATION_APPLY_QUEUE |

## server/packages/services/publication/src/publication-operations.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/publication-routes.ts:8 | ./publication-operations.js | PublicationOperationsError, PublicationOperationsService |
| server/packages/services/publication/src/__tests__/publication-runtime-review.test.ts:5 | ../publication-operations.js | PublicationOperationsError |
| server/packages/services/publication/src/__tests__/publication-operations.test.ts:3 | ../publication-operations.js | assessPublicationCanary, PublicationOperationsService, PublicationSigningRotationService |

## server/packages/services/publication/src/publication-orchestrator.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| tooling/scripts/local-dev/deploy-bp-adoption-worker.mts:21 | ../../../server/packages/services/publication/src/publication-orchestrator.js | PublicationOrchestrator |
| server/apps/platform-host/src/composition/create-container.ts:26 | @athyper/server-service-publication | PublicationOrchestrator |
| server/apps/platform-host/scripts/db-verification/tests/integration/atlas/learning-publication-qualification.mts:12 | @athyper/server-service-publication/publication-orchestrator | PublicationOrchestrator |
| server/apps/platform-host/src/composition/tenant-publication-orchestrator.ts:3 | @athyper/server-service-publication | KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, PublicationOrchestrator |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/publication-orchestrator.test.ts:14 | ../publication-orchestrator.js | PublicationOrchestrator |
| server/packages/services/publication/src/publication-jobs.ts:14 | ./publication-orchestrator.js | PublicationOrchestrator, classifyPublicationFailure |

## server/packages/services/publication/src/publication-routes.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/apps/platform-host/src/composition/register-services.ts:377 | @athyper/server-service-publication | APPLY_PUBLICATION_RELEASE_JOB, COMPILE_PUBLICATION_ARTIFACT_JOB, SIGN_PUBLICATION_ARTIFACT_JOB, DISPATCH_PUBLICATION_JOB, createPublicationAuthorityHandlers, createPublicationApplyHandler, createPublicationRecoveryHandler, createPublicationRollbackHandler, KyselyLocalProjectionRepository, KyselyPublicationAuthorityRepository, KyselyPublicationAuthorityWork, KyselyPublicationOperationsRepository, PublicationOrchestrator, PublicationOperationsService, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, PUBLICATION_MAINTENANCE_QUEUE, RECOVER_STALLED_PUBLICATIONS_JOB, ROLLBACK_PUBLICATION_RELEASE_JOB, registerPublicationRoutes, VerifiedPublicationArtifactLoader |
| server/packages/services/publication/src/__tests__/publication-runtime-review.test.ts:4 | ../publication-routes.js | registerPublicationRoutes, PublicationRouteOptions |

## server/packages/services/publication/src/release-promotion.ts

| Consumer | Import path | Imported names |
| --- | --- | --- |
| server/packages/services/publication/src/__tests__/release-promotion.test.ts:2 | ../release-promotion.js | evaluatePromotion, ReleasePromotionService, PromotionCoordinate, PromotionEvidence, PromotionHostPolicy |
