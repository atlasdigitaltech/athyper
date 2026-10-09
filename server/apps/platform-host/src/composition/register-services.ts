import { createNativePublicationStartup } from "./shared/publication/native-publication-startup.js";
import { createLocalEntityLiveReadEvidence } from "./shared/publication/entity-live-read-evidence.js";
import { createDeployedComponentQualification } from "./shared/publication/component-qualification.js";
import { parseEntityAuthoringResource } from "@athyper/server-contract-publication";
import {
  createResourcePublication,
  readResourcePublicationConfiguration,
} from "./control-plane/resource-publication.js";
import { authorizeEntityOperation } from "@athyper/server-contract-auth";
import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata";
import {
  businessPartnerCollaborationBinding,
  createPartnerCapabilityActionHandlers,
} from "@athyper/server-service-master-data";
import { assertRollbackEntityReadiness } from "./shared/publication/rollback-readiness.js";
import {
  admitEntityDescriptor,
  createHostEntityReadiness,
} from "./shared/entity-runtime/deployment-readiness.js";
import {
  registerEntitySupportQualification,
  type EntitySupportQualificationRegistration,
} from "./shared/entity-runtime/support-qualification.js";
import { createEntityReadinessHealth } from "./shared/entity-runtime/readiness-inventory.js";
import { createEntityReadinessInventory } from "@athyper/server-platform-metadata";
import { publicationCompilerIdentity as entityServingBuildIdentity } from "./shared/publication/compiler-build.js";
import { createUiProfileMutationPolicy } from "./shared/entity-runtime/ui-profile-mutation-policy.js";
import { createAtlasEntityContextReader } from "./shared/atlas-entity-context.js";
import { createPublishedOwnerAdministrationAuthorizer } from "./shared/entity-runtime/published-owner-administration.js";
import { createPublishedActionAuthorizer } from "./shared/entity-runtime/published-action-authorizer.js";
import { createCapabilityRegistration } from "../kernel/capability-registration.js";
import { createRegistrationPlan } from "../kernel/registration-plan.js";
import { readDeploymentProfile } from "../config/deployment-profile.js";
import type { RegistrationPlan } from "../kernel/registration-plan.js";
import { createPublicationTargets } from "./shared/publication/targets.js";
import {
  createHostAuthorizationManagement,
  type AuthorizationManagementDependencies,
} from "./shared/entity-governance/authorization-management.js";
import { createGovernancePersistence } from "./shared/entity-governance/persistence.js";
import { createEntityExperienceRuntime } from "./shared/entity-runtime/experience.js";
import { createEntityResourceServices } from "./shared/entity-runtime/resources.js";
import { createEntityTransferRuntime } from "./shared/entity-runtime/transfers.js";
import {
  createEntityServices,
  type EntityServices,
} from "./shared/entity-runtime/services.js";
import { createPublishedTenantRecordAuthorizer } from "@athyper/server-service-records";
import {
  createEntityExperienceHttpRegistrar,
  createEntityHttpRegistrars,
  createEntityResourceHttpRegistrar,
} from "./shared/entity-runtime/http-registrars.js";

import { assertEntityAuthorizationEnforceable } from "./shared/publication/entity-authorization-activation.js";
import {
  createTenantRollbackExecutor,
  hasTenantRollbackTarget,
} from "./shared/publication/tenant-rollback.js";
import {
  readCompiledRuntimeContract,
  parseCompiledRuntimeContract,
} from "@athyper/server-platform-metadata";
import { parseActivityBinding } from "@athyper/server-contract-publication";
import {
  qualifyActivityRecordingGraph,
  resolveRecordHistoryBinding,
} from "./shared/entity-runtime/activity-recording.js";
import { qualifyRecordHistoryDescriptor } from "@athyper/server-service-records";
import {
  createEntityActivityPolicy,
  createEntityActivityService,
  type EntityActivityProvider,
} from "@athyper/server-platform-experience";

import { parseCollectionState } from "@athyper/contract-platform-collection";
import {
  activityCollectionState,
  collectionActivityQuery,
  type ActivityQuery,
} from "@athyper/contract-platform-activity";
import { createActivityPresentation } from "./shared/entity-runtime/activity-presentation.js";
import { createCollaborationSectionProviders } from "./shared/collaboration/section-providers.js";
import { registerStudioOnboarding } from "./spaces/studio/onboarding/register-studio-onboarding.js";
import { registerEntityMetadata } from "./shared/entity-runtime/metadata.js";

import { createEntityCollaborationService } from "@athyper/server-platform-experience";
import { createEntityAuthorizationRegistrations } from "./shared/entity-runtime/read-registrations.js";
import { createPublishedParentAdmission } from "./shared/entity-runtime/published-parent-admission.js";
import { createPublishedRecordHeader } from "./shared/entity-runtime/published-record-header.js";

import { createPlaneTransactionCoordinator } from "./infrastructure/transactions.js";
import {
  createEntityAttachmentAdmission,
  type AttachmentCapabilitySubject,
} from "./shared/documents/attachment-admission.js";
import {
  createAttachmentDiscoveryService,
  registerAttachmentDiscoveryRoutes,
} from "@athyper/server-service-attachments";
import { createRecordParticipantResolver } from "@athyper/server-platform-experience";
import { createKyselyPermissionResolver } from "@athyper/server-platform-iam";
import { expireCommentDrafts } from "@athyper/server-platform-collaboration";
import {
  createEntityCapabilityPolicy,
  EntityCapabilityPolicyError,
  canReplyAtDepth,
} from "@athyper/server-platform-experience";
import { createMetaEntityActivationInspector } from "./shared/entity-governance/meta-entity-activation-inspection.js";
import { HttpError } from "@athyper/server-runtime-http";
import { createSharedReferenceDirectory } from "@athyper/server-service-records";
import { createEntityPresentationChoiceResolvers } from "./shared/entity-runtime/presentation-choice-resolvers.js";
import { registeredRecordScopeSqlCompilers } from "./shared/entity-runtime/record-scope-sql.js";
import {
  readPublishedNotificationConfiguration,
  readPublishedCollectionConfiguration,
} from "@athyper/server-service-publication";
import { localGraphPreview } from "../development/graph-preview.js";
import { prepareDocumentCollectionRelease } from "@athyper/server-plane-studio";
import { RedisInferenceAdmission } from "./spaces/neon/ai/atlas-inference-admission.js";
import { parseAtlasSemanticConfig } from "./spaces/neon/ai/atlas-semantic-index.js";
import { createAtlasDocumentGrounding } from "./spaces/neon/ai/atlas-document-grounding.js";
import { registerAtlasAttachmentKnowledge } from "./spaces/neon/ai/atlas-attachment-knowledge.js";
import { createAuthenticatedEntityReleaseReview } from "@athyper/server-service-publication";
import {
  getRequestContext as authoringRequestContext,
  tryGetRequestContext,
  withReadEvidence,
} from "@athyper/server-foundation/context";
import {
  createMetaEntityAuthoringAuthorizer,
  createAtlasLearningReviewAuthorizer,
  createMetaEntityInspectionAuthorizer,
} from "./shared/entity-governance/meta-entity-authoring-authorizer.js";
import { createScopedMetaEntityAuthoringRepository } from "./shared/entity-governance/scoped-meta-entity-authoring.js";
import { createDevRuntimePublication } from "../development/runtime-publication.js";
import {
  loadDevPublicationConfiguration,
  registerDevPublicationRoutes,
} from "../development/publication.js";
import { registerPublicationWorkloadRoutes } from "./shared/publication/workload-routes.js";
import { createCapabilityQualification } from "./shared/publication/capability-qualification.js";
import { qualifyPreviewRenderer } from "@athyper/server-adapter-preview-renderer";
import { loadPublicationWorkloadConfiguration } from "./shared/publication/workload-configuration.js";
import { coordinatedApplyPrincipal } from "./shared/publication/apply-identity.js";
import { createCompiledRuntimePublication } from "./shared/publication/compiled-runtime.js";
import { createRecordDisplayChoices } from "./shared/entity-runtime/record-display-choices.js";
import type { EntityAuthorizationRuntimeRegistration } from "@athyper/server-contract-metadata";
import { createPublicationRuntimeQualification } from "./shared/publication/runtime-qualification.js";
import { prepareSystemReferenceRelease } from "@athyper/server-plane-studio-meta-entity-authoring";

import {
  AtlasLearningCandidateService,
  isAtlasLearningSourceCurrent,
  evaluateAtlasLearningVocabulary,
  ATLAS_LEARNING_RESOLVER_VERSION,
  ATLAS_LEARNING_SCORING_VERSION,
} from "@athyper/server-platform-ai";
import {
  AtlasLearningInbox,
  createPublishedLearningFixtureProvider,
  registerAtlasLearningInboxRoutes,
  prepareAtlasLearningRelease,
  prepareInitialBaselineRelease,
  prepareAuthorizationSuccessorRelease,
  prepareRuntimeRestorationRelease,
  baselineJsonHash,
  sha256 as baselineContentHash,
} from "@athyper/server-plane-studio";
import {
  createEntityScopeRegistry,
  type EntityScopeBinding,
} from "./shared/entity-runtime/scope-registry.js";
import {
  createEntityParentAdmission,
  type EntityParentScopeBinding,
} from "./shared/entity-runtime/parent-admission.js";
import { createEntityCaseBackendMapping } from "./spaces/neon/entity-case-backend-mapping.js";
import { checkMeshExchangeReadiness } from "./spaces/mesh/exchange-readiness.js";
import { createKyselyContextRefresh } from "@athyper/server-platform-iam";
import { createAtlasBusinessContextResolver } from "@athyper/server-platform-ai";
import { readFileSync } from "node:fs";
import {
  configureSharedAtlasInferenceAdmission,
  OllamaModelProvider,
} from "@athyper/server-adapter-ai-ollama";
import {
  createAtlasLocalGenerationServices,
  parseAtlasLocalConfiguration,
} from "@athyper/server-platform-ai";
import {
  registerContactVerification,
  type ContactVerificationFactory,
} from "./shared/identity/contact-verification.js";
import { createKyselyEntitlementRuntime } from "@athyper/server-platform-entitlements";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";

import { createEntityRuntimeHandlerRegistry } from "./shared/entity-runtime/handler-registry.js";
import type {
  CommandExecutionStore,
  OutboxWriter,
} from "@athyper/server-contract-events";
import type { ProvisioningCommandTransport } from "@athyper/server-contract-integration";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  DocumentArtifactRepository,
  DocumentTemplateRepository,
} from "@athyper/server-contract-documents";
import type {
  NotificationAttachmentAccessPolicy,
  NotificationAttachmentResolver,
} from "@athyper/server-contract-documents";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PdfRenderer } from "@athyper/server-contract-rendering";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { MalwareScanner } from "@athyper/server-contract-malware-scanning";
import type {
  ContentExtractor,
  DocumentExtractionScheduler,
} from "@athyper/server-contract-content-extraction";
import type { SearchIndex } from "@athyper/server-contract-search";
import type { PolicyRepository } from "@athyper/server-contract-policy";
import type {
  RecordCollectionScopeResolver,
  RecordMutationResult,
  RecordRepository,
} from "@athyper/server-contract-records";
import type { WorkflowRepository } from "@athyper/server-contract-workflow";
import type {
  AtlasConfirmationVerifier,
  AtlasCredentialCipher,
  AtlasCredentialInvalidation,
  AtlasDomainCommandBus,
  AtlasDriftAlertPublisher,
  AtlasKnowledgeIndex,
  AtlasModelBinding,
  AtlasModelPolicyResolver,
  AtlasModelProvider,
  AtlasPlaneAdmissionResolver,
  AtlasPolicyInvalidation,
  AtlasProviderCredentialResolver,
  AtlasRegisteredTool,
  AtlasRunRepository,
  AtlasTenantQuotaManager,
  AtlasThreadAuthorizer,
  AtlasThreadRepository,
  AtlasRetentionPolicyResolver,
  AtlasUsageLedger,
} from "@athyper/server-contract-ai";
import {
  createExactPlaneRepositoryProvider,
  createExactPlaneTransactionCoordinator,
  type ExactPlaneRepositoryProvider,
  type PlaneTransactionCoordinator,
} from "@athyper/server-foundation/transaction";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type {
  ChannelConsentService,
  CycleReadinessSource,
  LegalHoldRetentionAdapter,
  ReportPackArtifactGenerator,
  ReportSourceRevisionResolver,
} from "@athyper/server-contract-governance";
import type {
  BankValidationRepository,
  CacheInvalidator,
  ConnectorHealthJobs,
  ConnectorRepository,
  EntitlementRepository,
  FeatureFlagRepository,
  LookupRepository,
  ParameterRepository,
  RoundingRepository,
} from "@athyper/server-contract-control-admin";
import {
  createIamAuthenticationMiddleware,
  createShadowAuthorizer,
  readVerifiedRequestContext,
} from "@athyper/server-platform-iam";
import {
  createEntityRuntimeResourceService,
  EntityRuntimeOperationError,
  registerEntityIntakeOperationRoutes,
} from "@athyper/server-platform-experience";
import {
  createCachedPolicyRepository,
  createKyselyPolicyRepository,
  createPolicyService,
  registerPolicyRoutes,
} from "@athyper/server-platform-policy";
import {
  createKyselySlaAutomationRepository,
  createKyselyWorkflowDelegationResolver,
  createKyselyWorkflowRepository,
  createKyselyWorkflowSlaTenantCatalog,
  createWorkflowService,
  createWorkflowSlaAutomation,
  createWorkflowSlaDiscoveryHandler,
  createWorkflowSlaSweepHandler,
  DISCOVER_WORKFLOW_SLA_JOB,
  registerWorkflowRoutes,
  SWEEP_WORKFLOW_SLA_JOB,
  WORKFLOW_MAINTENANCE_QUEUE,
} from "@athyper/server-platform-workflow";
import { createRenderingService } from "@athyper/server-platform-rendering";
import {
  createDocumentSearchService,
  registerDocumentSearchRoutes,
} from "@athyper/server-platform-search";
import {
  createKyselySavedViewRepository,
  createSavedViewService,
  registerSavedViewRoutes,
  registerViewCollectionRoutes,
  createReferenceHistoryStore,
} from "@athyper/server-platform-preferences";
import {
  createCollaborationService,
  createCollaborationEntityCoordinates,
  createKyselyCollaborationRepository,
  createKyselyPrincipalDirectory,
  registerCollaborationRoutes,
} from "@athyper/server-platform-collaboration";
import {
  REPORT_PACK_JOB,
  REPORT_PACK_QUEUE,
  REPORT_PACK_RECOVERY_JOB,
  createCycleCertificationService,
  createCycleDeviationService,
  createCycleRunService,
  createCycleTaskService,
  createLegalHoldService,
  createReportPackJobHandler,
  createReportPackRecoveryHandler,
  createReportPackService,
  registerGovernanceComplianceRoutes,
  registerGovernanceRoutes,
} from "@athyper/server-platform-governance";
import {
  assertControlServiceRoutePlaneSafety,
  controlAdminFoundation,
  createKyselyControlRepositories,
  createBankValidationService,
  createConnectorControlService,
  createCycleConfigService,
  createEntitlementControlService,
  createFeatureFlagService,
  createLookupService,
  createKyselyParameterRepositories,
  createExperienceParameterConsumer,
  createParameterService,
  createRoundingService,
  createRuntimeCommandService,
  KyselyCycleTemplateRepository,
  createKyselyEntitlementRepositories,
  createKyselyFeatureFlagRepositories,
  KyselyRuntimeCommandStore,
  registerAuthorizationManagementRoutes,
  registerControlServiceRoutes,
  registerParameterRoutes,
  registerCycleConfigRoutes,
  registerRuntimeCommandRoutes,
  type ControlServiceRouteFlags,
  type RuntimeCommandExecutor,
} from "@athyper/server-platform-control-admin";
import {
  ATLAS_KNOWLEDGE_QUEUE,
  ATLAS_MONITORING_QUEUE,
  INGEST_ATLAS_KNOWLEDGE_JOB,
  RUN_ATLAS_DRIFT_JOB,
  AtlasAgentRuntime,
  AtlasBindingRegistry,
  AtlasProviderRegistry,
  AtlasRegisteredToolCoordinator,
  AtlasResponseFeedbackService,
  KyselyAtlasResponseFeedbackStore,
  createAtlasEntityRecordTool,
  createAtlasEntityLookupTools,
  createAtlasEntityContextTools,
  entityContextTool,
  entityLookupTool,
  type AtlasEntityContextReader,
  AtlasSurfaceDraftGenerator,
  AtlasThreadService,
  AtlasToolRegistry,
  createAtlasRecordDataGateway,
  AtlasToolService,
  createAtlasGatedToolAuthority,
  createAtlasGatedPlaneAdmission,
  AtlasExperienceConfigurationService,
  KyselyAtlasAttachmentContextResolver,
  KyselyAtlasExperienceConfigurationRepository,
  KyselyAtlasTenantQuotaManager,
  createAtlasA2Services,
  createAtlasConversationServices,
  createAtlasDriftHandler,
  createAtlasKnowledgeIngestionHandler,
  KyselyAtlasToolProposalStore,
  registerAtlasAdminRoutes,
  hasPermission as hasAtlasPermission,
  registerAtlasExperienceRoutes,
  registerAtlasRoutes,
  registerAtlasSurfaceDraftRoutes,
  type AtlasKnowledgeJobAuthority,
  type AtlasPromptResolver,
} from "@athyper/server-platform-ai";
import {
  createStudioCatalogMetadataReader,
  createStudioMetadataDraftImportAdapter,
  createStudioRecordCollectionScopeResolver,
  KyselyMetaEntityAuthoringRepository,
  MetaEntityAuthoringService,
  PublicationServiceMetaEntityAdapter,
  registerMetaEntityAuthoringRoutes,
  prepareNotificationConfigurationRelease,
  prepareCollectionConfigurationRelease,
} from "@athyper/server-plane-studio";
import {
  createMeshRecordCollectionScopeResolver,
  createMeshRelationshipRequestImportAdapter,
} from "@athyper/server-plane-mesh";
import {
  createNeonRecordCollectionScopeResolver,
  financeJobDefinitions,
  financeSliceOrder,
  registerFinance as registerNeonFinance,
  registerFinanceHttpRoutes,
  registerFinanceJobHandlers,
  type FinanceRegistrationPorts,
} from "@athyper/server-plane-neon";
import {
  createDeliverySweepHandler,
  createDurableNotificationDeliveryRepository,
  createInAppNotificationHandler,
  createKyselyNotificationOutboxRepository,
  createKyselyNotificationRepositories,
  createKyselyNotificationWorkCatalog,
  createKyselyWebhookDeliveryRepository,
  createNotificationDigestHandler,
  createNotificationDiscoveryHandler,
  createNotificationDispatchHandler,
  createNotificationEventBus,
  createNotificationOrchestrator,
  createNotificationOperations,
  createNotificationOutboxSweepHandler,
  createNotificationPlanner,
  createCollaborationNotificationPolicy,
  createEntityNotificationDeliveryGuard,
  resolveEntityNotificationRoute,
  createNotificationPreferenceService,
  createKyselyNotificationPreferenceStore,
  createKyselyNotificationOperationsRepository,
  createKyselyPreferenceCapabilities,
  createNotificationPreferenceRecordPolicy,
  createPreferenceInvalidationPublisher,
  createNotificationRecipientResolver,
  createPushNotificationHandler,
  createSesActivityEventApplier,
  createSesDeliveryEventProcessor,
  createSesEventMessageHandler,
  createSuppressionAwareEmailHandler,
  KyselySesDeliveryEventRepository,
  createWebhookSweepHandler,
  registerNotificationRoutes,
  DELIVERY_SWEEP_JOB,
  DISCOVER_NOTIFICATION_WORK_JOB,
  DISPATCH_NOTIFICATION_JOB,
  FLUSH_NOTIFICATION_DIGEST_JOB,
  NOTIFICATION_MAINTENANCE_QUEUE,
  NOTIFICATION_QUEUE,
  PLAN_NOTIFICATION_OUTBOX_JOB,
  WEBHOOK_DELIVERY_JOB,
  WEBHOOK_DELIVERY_QUEUE,
  WEBHOOK_SWEEP_JOB,
} from "@athyper/server-platform-notifications";
import {
  createWebhookDeliveryHandler,
  registerJobAdministrationRoutes,
} from "@athyper/server-platform-jobs";
import {
  createDocumentService,
  createKyselyDocumentArtifactRepository,
  createKyselyDocumentTemplateRepository,
  createNotificationAttachmentResolver,
  registerDocumentRoutes,
} from "@athyper/server-service-documents";
import {
  ATTACHMENT_MAINTENANCE_QUEUE,
  EXPIRE_STAGED_ATTACHMENT_JOB,
  EXPIRE_ATTACHMENT_RESERVATIONS_JOB,
  PURGE_ATTACHMENT_JOB,
  RECONCILE_ATTACHMENT_RETENTION_JOB,
  createAttachmentLifecycle,
  createAttachmentPurgeHandler,
  createAttachmentRetrievalAdmission,
  createAttachmentQuotaRecoveryHandler,
  createAttachmentRetentionReconciliationHandler,
  createAttachmentStageExpiryHandler,
  createConfiguredAttachmentQuotaPolicyResolver,
  createKyselyAttachmentQuotaLedger,
  createKyselyAttachmentRepository,
  registerAttachmentRoutes,
} from "@athyper/server-service-attachments";
import {
  createContentResourceService,
  createContentServices,
  createKyselyContentAclRepository,
  createKyselyContentQuotaLedger,
  createKyselyContentRepository,
  createKyselyContentResourceRepository,
  createKyselyContentSubjectResolver,
  registerContentRoutes,
} from "@athyper/server-service-content";
import {
  createDocumentExtractionScheduler,
  createDocumentProcessingHandler,
  createKyselyDocumentProcessingRepository,
  DOCUMENT_PROCESSING_QUEUE,
  EXTRACT_AND_INDEX_JOB,
  type DocumentProcessingRepository,
} from "@athyper/server-service-document-processing";
import {
  createDerivativeRenderHandler,
  createDerivativeScheduler,
  createDerivativeScanBackfillHandler,
  createKyselyDerivativeRepository,
  createKyselyDerivativeScanBackfillRepository,
  createKyselyDerivativeSourceRepository,
  DERIVATIVE_SCAN_BACKFILL_JOB,
  DERIVATIVE_SCAN_BACKFILL_QUEUE,
  DOCUMENT_DERIVATIVES_QUEUE,
  RENDER_DERIVATIVE_JOB,
} from "@athyper/server-service-document-derivatives";
import {
  DELIVER_INTEGRATION_JOB,
  INTEGRATION_DELIVERY_QUEUE,
  IntegrationService,
  KyselyInboundWebhookPolicyResolver,
  KyselyIntegrationRepository,
  registerIntegrationJobs,
  registerIntegrationRoutes,
} from "@athyper/server-service-integration";
import { createIntegrationHttpTransport } from "@athyper/server-adapter-integration-http";
import {
  SYSTEM_PRINCIPAL_ID,
  createJobAdministrationService,
  createJobDefinitionCatalog,
  createJobGovernanceService,
  createJobScheduleReconciler,
  createKyselyJobAdministrationStore,
  createKyselyJobGovernanceStore,
  createKyselyJobScheduleRepository,
} from "@athyper/server-service-jobs";
import {
  createKyselyNumberingRepository,
  DefaultNumberingService,
} from "@athyper/server-service-numbering";
import {
  BookPeriodService,
  CloseReadinessService,
  FinanceNumberingService,
  FinancePostingGuard,
  KyselyBookPeriodRepository,
  KyselyCloseReadinessRepository,
  KyselyFinanceFoundationReader,
  KyselyFinanceNumberingPolicyReader,
  KyselyFinanceNumberingRepository,
  KyselyRoundingPolicyReader,
  RoundingResolver,
  SnapshotFinanceSourceDocumentReader,
  financeFoundation,
  snapshotFinancePermissionChecker,
} from "@athyper/server-service-finance";
import { registerFinanceRoutes } from "./spaces/neon/finance-routes.js";
import {
  scopeRecordOwnerRead,
  createRecordOwnerAccessAdapter,
  createKyselyRecordRepository,
  createKyselyCommandExecutionStore,
  createEntityBackendAuthorizer,
  GovernedImportAdapterRegistry,
  MAINTAIN_RECORD_TRANSFERS_JOB,
  RECORD_TRANSFER_MAINTENANCE_QUEUE,
  createRecordTransferMaintenanceHandler,
} from "@athyper/server-service-records";
import { sql, type Kysely, type Transaction } from "kysely";

import {
  canonicalBytes,
  MetaEntityArtifactSigner,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import {
  APPLY_PUBLICATION_RELEASE_JOB,
  COMPILE_PUBLICATION_ARTIFACT_JOB,
  SIGN_PUBLICATION_ARTIFACT_JOB,
  DISPATCH_PUBLICATION_JOB,
  createPublicationAuthorityHandlers,
  createPublicationApplyHandler,
  createPublicationRecoveryHandler,
  createPublicationRollbackHandler,
  KyselyPublicationAuthorityRepository,
  KyselyPublicationRecoveryDiscovery,
  KyselyPublicationAuthorityWork,
  KyselyPublicationOperationsRepository,
  PublicationOperationsService,
  PUBLICATION_APPLY_QUEUE,
  PUBLICATION_AUTHORITY_QUEUE,
  PUBLICATION_MAINTENANCE_QUEUE,
  RECOVER_STALLED_PUBLICATIONS_JOB,
  ROLLBACK_PUBLICATION_RELEASE_JOB,
  registerPublicationRoutes,
} from "@athyper/server-service-publication";

import type { HostConfig } from "../config/environment.js";
import type { Container } from "../kernel/container.js";
import { registerVerification } from "./shared/verification.js";
import { randomUUID } from "node:crypto";

type RecordTransaction = Transaction<Record<string, never>>;

export interface ServiceRegistrationDependencies {
  readonly entitySupportQualification?: EntitySupportQualificationRegistration;
  readonly activityAdapters?: readonly import("./shared/entity-runtime/activity-recording.js").ActivityAdapterRegistration[];
  readonly compiledRuntimePublication?: ConstructorParameters<
    typeof KyselyPublicationAuthorityWork
  >[0]["compiledRuntimePublication"];
  readonly entityParentScopeBindings?: readonly EntityParentScopeBinding[];
  readonly entityScopeBindings?: readonly EntityScopeBinding[];
  readonly entityBackends?: readonly Omit<
    Parameters<typeof createEntityBackendAuthorizer>[0],
    "authority"
  >[];
  readonly documentBindings?: Pick<
    Parameters<typeof createDocumentService<RecordTransaction>>[0],
    "resolveTrustedSource" | "authorizeArtifact"
  >;
  readonly notificationPolicy?: Parameters<
    typeof createCollaborationNotificationPolicy
  >[0]["fallback"];
  /** Shared signing material for cursor continuity across replicas; absent means process-local cursors. */
  readonly entityActivityCursorKey?: Uint8Array;
  readonly entityResourceProviders?: Pick<
    Parameters<typeof createEntityRuntimeResourceService>[0],
    "headers" | "sections" | "summaries"
  >;
  readonly entityIntakeProviders?: Parameters<
    typeof registerEntityIntakeOperationRoutes
  >[1]["providers"];
  /** Actual callable host bindings. Published metadata cannot populate this list. */
  readonly entityAuthorizationRuntimeRegistrations?: readonly EntityAuthorizationRuntimeRegistration[];
  /** Read-only, bounded observer. No grant changes or enforce selection through this port. */
  /** Explicit deployment wiring to immutable authenticated review storage and
   * current reviewer authority; absence remains a compiler denial. */
  readonly entityAuthorizationReleaseReview?: Parameters<
    typeof createAuthenticatedEntityReleaseReview
  >[0];
  readonly entityAuthorizationPublication?: NonNullable<
    ConstructorParameters<
      typeof KyselyPublicationAuthorityWork
    >[0]["authorizationCompilation"]
  >;
  readonly entityCaseBackendAuthorization?: Omit<
    Parameters<typeof createEntityBackendAuthorizer>[0],
    "authority" | "owns" | "target" | "scopes" | "refreshContext"
  > &
    Partial<
      Pick<
        Parameters<typeof createEntityBackendAuthorizer>[0],
        "scopes" | "refreshContext"
      >
    >;
  readonly entityAuthorizationShadow?: Omit<
    Parameters<typeof createShadowAuthorizer>[0],
    "authority"
  >;
  /** Immutable source/destination adapters required by qualified Neon finance slices. */
  readonly finance?: FinanceRegistrationPorts;
  readonly metadata?: MetadataReader;
  /** Optional trusted adapter; never inferred from configuration or replaced with a stub. */
  readonly contactVerification?: ContactVerificationFactory;
  readonly repository?: RecordRepository<RecordTransaction>;
  /** Trusted consuming-plane composition; not populated from an HTTP request.
   * Supplying this port does not attest deployment readiness or resource review. */
  readonly entityLiveReadEvidence?: Parameters<
    typeof createEntityServices
  >[0]["liveReadEvidence"];
  /** Installed publication-backed evidence; mutually exclusive with a custom port. */
  readonly localEntityLiveRead?: Parameters<
    typeof createLocalEntityLiveReadEvidence
  >[0];
  readonly workflowRepository?: WorkflowRepository<RecordTransaction>;
  readonly workflowCommandExecutions?: CommandExecutionStore<
    RecordTransaction,
    import("@athyper/server-contract-workflow").WorkItemActionResult
  >;
  readonly policyRepository?: PolicyRepository<RecordTransaction>;
  readonly transactions?: PlaneTransactionCoordinator<RecordTransaction>;
  readonly outbox?: OutboxWriter<RecordTransaction>;
  readonly commandExecutions?: CommandExecutionStore<
    RecordTransaction,
    RecordMutationResult
  >;
  readonly documentTemplateRepository?: DocumentTemplateRepository<RecordTransaction>;
  readonly documentArtifactRepository?: DocumentArtifactRepository<RecordTransaction>;
  readonly documentRenderer?: Pick<PdfRenderer, "renderPdf">;
  readonly malwareScanner?: MalwareScanner;
  readonly contentExtractor?: ContentExtractor;
  readonly searchIndex?: SearchIndex;
  readonly extractionScheduler?: DocumentExtractionScheduler;
  readonly documentProcessingRepository?: DocumentProcessingRepository<RecordTransaction>;
  readonly objectStorageDocuments?: ObjectStorage;
  readonly objectStorageDocumentsBucket?: string;
  readonly objectStorageArtifacts?: ObjectStorage;
  readonly objectStorageArtifactsBucket?: string;
  readonly objectStorageTransfers?: ObjectStorage;
  readonly objectStorageTransfersBucket?: string;
  readonly governanceCompliance?: {
    readonly retention: LegalHoldRetentionAdapter;
    readonly revisions: ReportSourceRevisionResolver;
    readonly generator: ReportPackArtifactGenerator;
    readonly retentionHealth?: () => Promise<{
      readonly healthy: boolean;
      readonly message?: string;
    }>;
    readonly objectStorageHealth?: () => Promise<{
      readonly healthy: boolean;
      readonly message?: string;
    }>;
    readonly recoveryIntervalMs?: number;
    readonly recoveryStaleAfterMs?: number;
    readonly reportRetentionDays?: number;
  };
  /** Authenticated Studio-to-plane command transport. Onboarding remains unhealthy without it. */
  readonly onboardingTransport?: ProvisioningCommandTransport;
  /** Exact-plane repositories own atomic OCC, audit, and outbox persistence. */
  readonly controlAdmin?: {
    /** Dedicated per-plane connections inheriting athyperapp and athyper_control_writer. */
    readonly writerDatabases?: Readonly<
      Partial<Record<PlaneKey, Kysely<Record<string, never>>>>
    >;
    readonly features?: ExactPlaneRepositoryProvider<FeatureFlagRepository>;
    readonly parameters?: ExactPlaneRepositoryProvider<ParameterRepository>;
    readonly lookups?: ExactPlaneRepositoryProvider<LookupRepository>;
    readonly rounding?: ExactPlaneRepositoryProvider<RoundingRepository>;
    readonly bankValidation?: ExactPlaneRepositoryProvider<BankValidationRepository>;
    /** Defaults to the governed Kysely adapter for each available plane database. */
    readonly entitlements?: ExactPlaneRepositoryProvider<EntitlementRepository>;
    readonly connectors?: ExactPlaneRepositoryProvider<ConnectorRepository>;
    readonly cache: CacheInvalidator;
    readonly connectorHealthJobs?: ConnectorHealthJobs;
    readonly runtimeCommandExecutor?: RuntimeCommandExecutor;
    readonly guarantees: {
      readonly expectedVersion: true;
      readonly audit: "transactional";
      readonly outbox: "transactional";
      readonly invalidation: true;
    };
  };
  /** C4 adapters are injected together; no cross-plane or implicit writer fallback is composed. */
  readonly authorizationManagement?: AuthorizationManagementDependencies;
  /** Required to enable notification attachments; resolver must enforce recipient access. */
  readonly notificationAttachmentResolver?: NotificationAttachmentResolver;
  readonly notificationAttachmentAccessPolicy?: NotificationAttachmentAccessPolicy;
  readonly ai?: {
    readonly admission: AtlasPlaneAdmissionResolver;
    readonly threadRepository: AtlasThreadRepository;
    readonly threadAuthorizer: AtlasThreadAuthorizer;
    readonly retention: AtlasRetentionPolicyResolver;
    readonly modelPolicy: AtlasModelPolicyResolver;
    readonly bindings: readonly AtlasModelBinding[];
    readonly providers: readonly AtlasModelProvider[];
    readonly credentials: AtlasProviderCredentialResolver;
    readonly runs: AtlasRunRepository;
    readonly usageLedger: AtlasUsageLedger;
    readonly quotas?: AtlasTenantQuotaManager;
    readonly prompts: AtlasPromptResolver;
    readonly registeredTools: readonly AtlasRegisteredTool[];
    readonly toolAuthority: import("@athyper/server-contract-ai").AtlasToolAuthority;
    readonly recordGateway: import("@athyper/server-contract-ai").AtlasRecordDataGateway;
    readonly confirmations: AtlasConfirmationVerifier;
    readonly commands: AtlasDomainCommandBus;
    readonly credentialCipher: AtlasCredentialCipher;
    readonly credentialInvalidation: AtlasCredentialInvalidation;
    readonly knowledgeIndex: AtlasKnowledgeIndex;
    readonly knowledgeAdmission?: import("@athyper/server-contract-ai").AtlasKnowledgeAdmission;
    readonly policyInvalidation: AtlasPolicyInvalidation;
    readonly driftAlerts: AtlasDriftAlertPublisher;
    readonly knowledgeJobAuthority: AtlasKnowledgeJobAuthority;
  };
}

/** Composes descriptor-driven Records only when IAM and a runtime data plane are available. */
export function registerServices(
  container: Container,
  dependencies: ServiceRegistrationDependencies = {},
  config?: HostConfig,
  lifecycle?: LifecycleManager,
  plan?: RegistrationPlan,
): void {
  // Explicit entrypoints validate MODE. Direct composition callers retain API defaults.
  const collaborationCoordinates = createCollaborationEntityCoordinates([
    businessPartnerCollaborationBinding,
  ]);
  const collaborationEntityCode = collaborationCoordinates.entityCode;
  const collaborationEntityTypes = collaborationCoordinates.entityTypes;
  const role =
    config?.mode === "worker" || config?.mode === "scheduler"
      ? config.mode
      : "api";
  const capabilityRegistration = createCapabilityRegistration(
    plan ?? createRegistrationPlan(readDeploymentProfile({ MODE: role }, role)),
  );
  const servedPlanes = capabilityRegistration.planes;
  if (servedPlanes.includes("mesh") && container.adapters.meshDatabase)
    container.runtimes.health.register("mesh.exchange", () =>
      checkMeshExchangeReadiness(
        container.adapters.meshDatabase!.database as unknown as Kysely<
          Record<string, never>
        >,
      ),
    );
  const { iam, authorizer: baseAuthorizer, audit } = container.platform;
  if (!iam || !baseAuthorizer || !audit) return;
  const partnerCapabilityHandlers =
    createPartnerCapabilityActionHandlers<RecordTransaction>();
  const refreshEntityContext = createKyselyContextRefresh({
    run: (identity, work) => {
      const adapter =
        identity.planeKey === "neon"
          ? container.adapters.neonDatabase
          : identity.planeKey === "mesh"
            ? container.adapters.meshDatabase
            : container.adapters.athyperDatabase;
      if (!adapter) throw new Error("AUTHZ_PLANE_DATABASE_UNAVAILABLE");
      return (adapter.database as unknown as Kysely<Record<string, never>>)
        .transaction()
        .execute(work);
    },
  });
  const observeAuthority = (authority: typeof baseAuthorizer) => {
    const entityAuthority = (dependencies.entityBackends ?? []).reduce(
      (current, binding) =>
        createEntityBackendAuthorizer({ ...binding, authority: current }),
      authority,
    );
    const backend = dependencies.entityCaseBackendAuthorization
      ? createEntityBackendAuthorizer({
          ...dependencies.entityCaseBackendAuthorization,
          ...createEntityCaseBackendMapping(
            dependencies.entityCaseBackendAuthorization.profile,
          ),
          scopes:
            dependencies.entityCaseBackendAuthorization.scopes ??
            createEntityScopeRegistry(
              dependencies.entityCaseBackendAuthorization.profile,
              dependencies.entityScopeBindings ?? [],
            ),
          refreshContext:
            dependencies.entityCaseBackendAuthorization.refreshContext ??
            refreshEntityContext,
          authority: entityAuthority,
        })
      : entityAuthority;
    const selected = backend;
    return dependencies.entityAuthorizationShadow
      ? createShadowAuthorizer({
          ...dependencies.entityAuthorizationShadow,
          authority: selected,
        })
      : selected;
  };
  let entityBuildIdentity: string | null = null;
  try {
    entityBuildIdentity = entityServingBuildIdentity().buildHash;
  } catch {
    /* Unidentified installations cannot claim qualified support. */
  }
  container.platform.entityReadiness = createHostEntityReadiness({
    configuration: () => config,
    storage: container.adapters.objectStorageArtifacts,
    buildIdentity: () => entityBuildIdentity,
  });
  const authorizer = createPublishedTenantRecordAuthorizer({
    ownerAccess: true,
    actionAuthority: createPublishedActionAuthorizer(
      {
        getEntityDescriptor: (context, entityCode) =>
          metadata.getEntityDescriptor(context, entityCode),
      },
      new Set([
        ...partnerCapabilityHandlers.keys(),
        ...(dependencies.activityAdapters ?? []).flatMap((registration) => [
          ...(registration.domainHandlers?.keys() ?? []),
        ]),
      ]),
    ),
    ownerAuthority: createPublishedOwnerAdministrationAuthorizer({
      getEntityDescriptor: (context, entityCode) =>
        metadata.getEntityDescriptor(context, entityCode),
    }),
    authority: observeAuthority(baseAuthorizer),
    metadata: {
      getEntityDescriptor: (context, entityCode) =>
        metadata.getEntityDescriptor(context, entityCode),
    },
    refreshContext: refreshEntityContext,
    exists: (context, descriptor, recordId) =>
      transactions.run(context.planeKey, context, async (tx) => {
        const repository =
          dependencies.repository ??
          createKyselyRecordRepository({
            databases: recordDatabases,
            scopeCompilers: registeredRecordScopeSqlCompilers,
          });
        const ownerValues = await createRecordOwnerAccessAdapter(
          authorizer,
        ).prepare({ context, descriptor, operation: "read" }, tx);
        return Boolean(
          await repository.get(
            scopeRecordOwnerRead(descriptor, ownerValues),
            context.tenantId,
            recordId,
            [descriptor.storage.idField],
            tx,
          ),
        );
      }),
  });
  // Filled with the very same service instance mounted by the generic record routes.
  // The publication callback resolves it when a job runs, not during bootstrap.
  let installedRecordMutations: EntityServices["mutations"] | undefined;
  let installedTransfers:
    | NonNullable<ReturnType<typeof createEntityTransferRuntime>>["transfers"]
    | undefined;
  let installedReadQueries: EntityServices["queries"] | undefined;

  const recordDatabases = capabilityRegistration.databases(
    "entity.persistence",
    {
      ...(container.adapters.neonDatabase
        ? { neon: container.adapters.neonDatabase.database }
        : {}),
      ...(container.adapters.meshDatabase
        ? { mesh: container.adapters.meshDatabase.database }
        : {}),
    } as unknown as Partial<Record<PlaneKey, Kysely<Record<string, never>>>>,
  );
  const metadataDatabases = capabilityRegistration.databases(
    "entity.persistence",
    {
      ...recordDatabases,
      ...(container.adapters.athyperDatabase
        ? { studio: container.adapters.athyperDatabase.database }
        : {}),
    } as Partial<Record<PlaneKey, Kysely<Record<string, never>>>>,
  );
  const parameterRepositories =
    dependencies.controlAdmin?.parameters ??
    createKyselyParameterRepositories(metadataDatabases);
  if (Object.keys(metadataDatabases).length > 0 && role === "api") {
    container.runtimes.health.register(
      "entity.deployment-support",
      createEntityReadinessHealth({
        inventory: createEntityReadinessInventory(metadataDatabases),
        assertDescriptors: (descriptors) =>
          container.platform.entityReadiness!.assertDescriptors(descriptors),
      }),
    );
  }
  if (Object.keys(metadataDatabases).length > 0) {
    const experienceAdapters = {
      ...(container.adapters.neonDatabase
        ? { neon: container.adapters.neonDatabase }
        : {}),
      ...(container.adapters.meshDatabase
        ? { mesh: container.adapters.meshDatabase }
        : {}),
      ...(container.adapters.athyperDatabase
        ? { studio: container.adapters.athyperDatabase }
        : {}),
    };
    const experience = capabilityRegistration.register(
      "entity.experience",
      () =>
        createEntityExperienceRuntime({
          databases: metadataDatabases,
          metadata: () => container.platform.metadata,
          run: (planeKey, work) => {
            const adapter = experienceAdapters[planeKey];
            if (!adapter)
              throw new Error(
                `Experience database adapter is missing for ${planeKey}`,
              );
            return adapter.withTenantTransaction((transaction) =>
              work(transaction as unknown as Kysely<Record<string, never>>),
            );
          },
          ...(config?.wave0.controlAdminParametersEnabled
            ? {
                readRuntimeDefaults: createExperienceParameterConsumer(
                  parameterRepositories,
                ),
              }
            : {}),
        }),
    );
    container.platform.experience = {
      service: experience.service,
      invalidation: experience.invalidation,
    };
    container.platform.httpRegistrars.push(
      createEntityExperienceHttpRegistrar({
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: experience.service,
      }),
    );
    for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[]) {
      container.runtimes.health.register(`experience.${planeKey}`, async () => {
        const health = await experience.health(planeKey);
        return {
          status: health.status === "healthy" ? "healthy" : "unhealthy",
          ...(health.message ? { message: health.message } : {}),
        };
      });
    }
  }
  if (
    config &&
    (config.publication.apiEnabled ||
      config.publication.applyEnabled ||
      config.publication.compileEnabled ||
      config.publication.dispatchEnabled ||
      config.publication.recoveryEnabled)
  ) {
    registerPublication(
      container,
      config,
      {
        ...metadataDatabases,
        ...(container.adapters.jobAthyperDatabase
          ? {
              studio: container.adapters.jobAthyperDatabase
                .database as unknown as Kysely<Record<string, never>>,
            }
          : {}),
        ...(container.adapters.jobNeonDatabase
          ? {
              neon: container.adapters.jobNeonDatabase
                .database as unknown as Kysely<Record<string, never>>,
            }
          : {}),
        ...(container.adapters.jobMeshDatabase
          ? {
              mesh: container.adapters.jobMeshDatabase
                .database as unknown as Kysely<Record<string, never>>,
            }
          : {}),
      },
      iam,
      authorizer,
      audit,
      {
        ...dependencies.entityAuthorizationPublication,
        ...(dependencies.entityAuthorizationReleaseReview
          ? {
              review: createAuthenticatedEntityReleaseReview(
                dependencies.entityAuthorizationReleaseReview,
              ),
            }
          : {}),
        runtime: (() => {
          const runtime = {
            qualify(profile: unknown, bindings: unknown) {
              if (dependencies.entityAuthorizationPublication) {
                dependencies.entityAuthorizationPublication.runtime.qualify(
                  profile,
                  bindings,
                );
                return;
              }
              createPublicationRuntimeQualification({
                registrations: [
                  ...(dependencies.entityAuthorizationRuntimeRegistrations ??
                    []),
                  ...(installedReadQueries
                    ? createEntityAuthorizationRegistrations(
                        installedReadQueries,
                        profile,
                        installedRecordMutations,
                        installedTransfers,
                      )
                    : []),
                ],
                sourceConstraints: baseAuthorizer.checkSourceConstraints,
              }).qualify(profile, bindings);
            },
          };
          localGraphRuntimeQualifiers.set(container, runtime);
          return runtime;
        })(),
        catalog:
          dependencies.entityAuthorizationPublication?.catalog ??
          (async (plane) => {
            const db = metadataDatabases[plane];
            if (!db) throw Error("PUBLICATION_CATALOG_PLANE_UNAVAILABLE");
            // pg does not decode custom enum-array OIDs. Return text[] so the
            // runtime hashes the same scope arrays as the reviewed JSON catalog.
            const rows = (
              await sql<{
                id: string;
                code: string;
                kind: "entity_operation" | "capability";
                scopeKinds: string[];
              }>`
            SELECT p.id,p.canonical_code code,p.permission_kind kind,
              array_agg(DISTINCT s.scope_kind::text ORDER BY s.scope_kind::text) "scopeKinds"
            FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id
            WHERE p.status='published' AND s.status='active' AND p.permission_kind IN ('entity_operation','capability')
            GROUP BY p.id,p.canonical_code,p.permission_kind ORDER BY p.canonical_code`.execute(
                db,
              )
            ).rows;
            return rows;
          }),
      },
      dependencies.compiledRuntimePublication ??
        (() => {
          if (config.mode !== "worker") return undefined;
          const configuration = loadPublicationWorkloadConfiguration(
            process.env,
            config.env,
          );
          if (!configuration) return undefined;
          const authority = metadataDatabases.studio;
          if (!authority)
            throw Error("PUBLICATION_AUTHORITY_DATABASE_UNAVAILABLE");
          const componentQualifier = createDeployedComponentQualification(
            process.env,
            { canonicalBytes, sha256 },
          );
          const native = createNativePublicationStartup({
            environment: process.env,
            targetDatabases: metadataDatabases,
            run: (work) =>
              container.adapters.athyperDatabase!.withTenantTransaction((tx) =>
                work(tx as unknown as Kysely<Record<string, never>>),
              ),
            loader: {
              store: container.adapters.publicationArtifactStore!,
              verifier: container.adapters.publicationVerifier!,
              canonicalizer: { canonicalBytes, sha256 },
              runtimeVersion: config.publication.runtimeVersion,
              ...(componentQualifier
                ? {
                    uiComponents: {
                      qualify: async (envelope) =>
                        componentQualifier(envelope.payload),
                    },
                  }
                : {}),
            },
          });
          return createCompiledRuntimePublication({
            nativeSource: native.readNativeSource,
            authority,
            configuration,
            targets() {
              const targets = publicationTargetQualifications.get(container);
              if (!targets)
                throw Error("PUBLICATION_TARGET_QUALIFICATION_UNAVAILABLE");
              return targets;
            },
          });
        })(),
    );
  }
  if (
    (config?.wave0.controlAdminRuntimeCommandsEnabled ?? false) &&
    Object.keys(metadataDatabases).length === 0
  )
    throw Object.assign(
      new Error(
        "Enabled runtime control commands require a durable exact-plane database",
      ),
      { code: "CONTROL_ADMIN_RUNTIME_STORE_REQUIRED" },
    );
  registerContactVerification(
    container,
    config?.contactVerification,
    dependencies.contactVerification,
  );
  if (!dependencies.metadata && Object.keys(metadataDatabases).length === 0) {
    return;
  }

  const transactions =
    dependencies.transactions ?? createPlaneTransactionCoordinator(container);
  const objectStorage =
    dependencies.objectStorageDocuments ??
    container.adapters.objectStorageDocuments;
  const objectStorageArtifacts =
    dependencies.objectStorageArtifacts ??
    container.adapters.objectStorageArtifacts;
  const objectStorageArtifactsBucket =
    dependencies.objectStorageArtifactsBucket ??
    container.adapters.objectStorageArtifactsBucket;
  const objectStorageTransfers =
    dependencies.objectStorageTransfers ??
    container.adapters.objectStorageTransfers;
  const financeRoutesEnabled =
    config?.wave0.financeRoutesEnabled ??
    financeFoundation.routesEnabledByDefault;
  let cycleReadinessSource: CycleReadinessSource | undefined;
  if (container.adapters.neonDatabase) {
    const financeDatabase = container.adapters.neonDatabase
      .database as unknown as Kysely<Record<string, never>>;
    const financeTransactions = {
      run: <T>(
        actor: { tenantId: string; principalId: string },
        work: (transaction: any) => Promise<T>,
      ) => transactions.run("neon", actor, work),
    };
    const rounding = new RoundingResolver(
      new KyselyRoundingPolicyReader(financeDatabase, {
        run: financeTransactions.run,
      }),
    );
    const periods = new BookPeriodService({
      repository: new KyselyBookPeriodRepository(financeDatabase),
      permissions: snapshotFinancePermissionChecker,
      transactions: financeTransactions,
      audit,
      outbox: createDatabaseOutboxWriter("finance"),
    });
    const snapshotSources = new SnapshotFinanceSourceDocumentReader(),
      foundation = new KyselyFinanceFoundationReader(
        financeDatabase,
        { run: financeTransactions.run },
        {
          "document.journal_entry": snapshotSources,
          "document.purchase_invoice": snapshotSources,
          "document.sales_invoice": snapshotSources,
          "document.goods_receipt": snapshotSources,
          "document.payment": snapshotSources,
        },
      );
    const postingGuard = new FinancePostingGuard(
      foundation,
      snapshotFinancePermissionChecker,
      rounding,
    );
    const numbering = new FinanceNumberingService({
      policies: new KyselyFinanceNumberingPolicyReader(
        financeDatabase,
        financeTransactions,
      ),
      repository: new KyselyFinanceNumberingRepository(financeDatabase),
      foundation,
      permissions: snapshotFinancePermissionChecker,
      transactions: financeTransactions,
      audit: audit as never,
      outbox: createDatabaseOutboxWriter("finance"),
    });
    const closeReadiness = new CloseReadinessService({
      transactions: financeTransactions,
      repository: new KyselyCloseReadinessRepository(),
      permissions: snapshotFinancePermissionChecker,
    });
    const financeComposition = registerNeonFinance({
      database: financeDatabase,
      transactions: financeTransactions as never,
      flags: {
        f2BudgetPlanning: config?.wave0.financeF2Enabled ?? false,
        f3LedgerCommitments: config?.wave0.financeF3Enabled ?? false,
        f4InventoryFifo: config?.wave0.financeF4Enabled ?? false,
        f5Tax: config?.wave0.financeF5Enabled ?? false,
        f6Closing: config?.wave0.financeF6Enabled ?? false,
      },
      permissions: snapshotFinancePermissionChecker,
      guard: postingGuard,
      rounding,
      audit: audit as never,
      outbox: createDatabaseOutboxWriter("finance") as never,
      ddl: {
        async check(objects) {
          const health = await container.adapters.neonDatabase!.health();
          if (!health.healthy)
            return {
              ready: false,
              message: "Neon finance adapter is unhealthy",
            };
          const missing: string[] = [];
          for (const objectName of objects) {
            const row = (
              await sql<{
                name: string | null;
              }>`SELECT to_regclass(${objectName})::text AS name`.execute(
                financeDatabase,
              )
            ).rows[0];
            if (!row?.name) missing.push(objectName);
          }
          return missing.length ? { ready: false, missing } : { ready: true };
        },
      },
      ...(dependencies.finance ? { ports: dependencies.finance } : {}),
      ...(container.runtimes.jobs
        ? { jobs: container.runtimes.jobs as never }
        : {}),
    });
    cycleReadinessSource = {
      async evaluate(context, run) {
        if (context.planeKey !== "neon")
          return {
            ready: false,
            evaluatedAt: new Date().toISOString(),
            evidence: { planeKey: context.planeKey },
            reasons: ["finance_readiness_source_unavailable"],
          };
        const raw = run.data["closeCoordinate"];
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
          throw Object.assign(
            new Error("GOVERNANCE_FINANCE_COORDINATE_REQUIRED"),
            { code: "GOVERNANCE_FINANCE_COORDINATE_REQUIRED" },
          );
        const coordinate = raw as Record<string, unknown>,
          result = await closeReadiness.query(
            {
              tenantId: context.tenantId,
              principalId: context.principalId,
              planeKey: "neon",
              correlationId: context.correlationId ?? context.requestId,
              permissionCodes: context.permissions.allowed,
            },
            {
              companyCodeId: String(coordinate["companyCodeId"] ?? ""),
              ledgerBookId: String(coordinate["ledgerBookId"] ?? ""),
              fiscalPeriodId: String(coordinate["fiscalPeriodId"] ?? ""),
              fiscalYear: Number(coordinate["fiscalYear"]),
              periodNumber: Number(coordinate["periodNumber"]),
            },
          );
        return {
          ready: result.ready,
          evaluatedAt: result.evaluatedAt,
          evidence: { coordinate: result.coordinate, metrics: result.metrics },
          ...(result.ready ? {} : { reasons: ["finance_not_ready"] }),
        };
      },
    };
    container.services.finance = {
      executionPlane: financeFoundation.executionPlane,
      routesEnabled: financeRoutesEnabled,
      periods,
      rounding,
      postingGuard,
      slices: financeComposition.slices,
    };
    if (financeRoutesEnabled)
      container.platform.httpRegistrars.push((application) =>
        registerFinanceRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          periods,
          rounding,
          postingGuard,
          numbering,
        }),
      );
    if (Object.values(financeComposition.slices).some((slice) => slice.enabled))
      container.platform.httpRegistrars.push((application) =>
        registerFinanceHttpRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          finance: financeComposition,
        }),
      );
    if (container.runtimes.jobs) {
      registerFinanceJobHandlers(container.runtimes.jobs, financeComposition);
      container.runtimes.jobDefinitions.push(
        ...financeJobDefinitions(financeComposition),
      );
    }
    container.runtimes.health.register("finance.neon-foundation", async () => {
      try {
        await sql`SELECT version_number FROM ledger.book_period_status LIMIT 1`.execute(
          financeDatabase,
        );
        await sql`SELECT 1 FROM control.rounding_rule LIMIT 1`.execute(
          financeDatabase,
        );
        await sql`SELECT 1 FROM snapshot.entity_snapshot_identity LIMIT 1`.execute(
          financeDatabase,
        );
        return { status: "healthy" };
      } catch {
        return {
          status: "unhealthy",
          message: "Finance Neon DDL is unavailable or outdated",
        };
      }
    });
    for (const slice of financeSliceOrder)
      container.runtimes.health.register(
        `finance.neon.${slice}`,
        financeComposition.slices[slice].readiness,
      );
  } else
    container.services.finance = {
      executionPlane: financeFoundation.executionPlane,
      routesEnabled: false,
    };
  const exactTransactions =
    createExactPlaneTransactionCoordinator(transactions);
  const {
    governanceDatabases,
    executionRepositories,
    legalHoldRepositories,
    reportPackRepositories,
    hasGovernanceDatabase,
    consent,
    moderation,
  } = capabilityRegistration.register("entity.governance", () =>
    createGovernancePersistence({
      databases: metadataDatabases,
      transactions,
      audit,
      outbox: createDatabaseOutboxWriter("governance"),
    }),
  );
  const controlDatabases = createExactPlaneRepositoryProvider(
    metadataDatabases,
    {
      unavailableCode: "CONTROL_ADMIN_EXACT_PLANE_REPOSITORY_UNAVAILABLE",
      health: {
        ...(metadataDatabases.studio ? { studio: controlDatabaseHealth } : {}),
        ...(metadataDatabases.neon ? { neon: controlDatabaseHealth } : {}),
        ...(metadataDatabases.mesh ? { mesh: controlDatabaseHealth } : {}),
      },
    },
  );
  const controlRouteFlags: ControlServiceRouteFlags = {
    tenantOverrides:
      config?.wave0.controlAdminTenantOverridesEnabled ??
      controlAdminFoundation.routesEnabledByDefault,
    lookupAndRoundingConfiguration:
      config?.wave0.controlAdminLookupRoundingEnabled ??
      controlAdminFoundation.routesEnabledByDefault,
    connectorLifecycle:
      config?.wave0.controlAdminConnectorLifecycleEnabled ??
      controlAdminFoundation.routesEnabledByDefault,
    localCatalogReads:
      config?.wave0.controlAdminLocalCatalogReadsEnabled ??
      controlAdminFoundation.routesEnabledByDefault,
    catalogAuthoring:
      config?.wave0.controlAdminCatalogAuthoringEnabled ??
      controlAdminFoundation.routesEnabledByDefault,
  };
  const cycleConfigRoutesEnabled =
    config?.wave0.controlAdminCycleConfigEnabled ??
    controlAdminFoundation.routesEnabledByDefault;
  const runtimeCommandRoutesEnabled =
    config?.wave0.controlAdminRuntimeCommandsEnabled ??
    controlAdminFoundation.routesEnabledByDefault;
  assertControlServiceRoutePlaneSafety({
    catalogAuthoringPlanes: controlRouteFlags.catalogAuthoring
      ? ["studio"]
      : [],
    financeWriterPlanes: controlRouteFlags.lookupAndRoundingConfiguration
      ? ["neon"]
      : [],
  });
  container.platform.entitlements =
    createKyselyEntitlementRuntime(metadataDatabases);
  const cycleRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? {
            studio: new KyselyCycleTemplateRepository(metadataDatabases.studio),
          }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyCycleTemplateRepository(metadataDatabases.neon) }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyCycleTemplateRepository(metadataDatabases.mesh) }
        : {}),
    },
    { unavailableCode: "CONTROL_ADMIN_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const cycleConfig =
    Object.keys(metadataDatabases).length > 0
      ? createCycleConfigService({
          authorizer,
          repositories: cycleRepositories,
          ...(container.adapters.publicationVerifier
            ? {
                desiredStateVerifier: {
                  verify: (payload, signature) =>
                    container.adapters.publicationVerifier!.verify({
                      keyId: signature.keyId,
                      algorithm: signature.algorithm,
                      bytes: canonicalBytes(payload),
                      signature: signature.value,
                    }),
                },
              }
            : {}),
        })
      : undefined;
  const controlRoutesEnabled = Object.values(controlRouteFlags).some(Boolean);
  if (
    controlRoutesEnabled &&
    !dependencies.controlAdmin &&
    Object.keys(metadataDatabases).length === 0
  )
    throw Object.assign(
      new Error(
        "Enabled control-administration routes require governed exact-plane repositories",
      ),
      { code: "CONTROL_ADMIN_REPOSITORIES_REQUIRED" },
    );
  const suppliedControl = dependencies.controlAdmin;
  const controlWriterDatabases =
    suppliedControl?.writerDatabases ?? metadataDatabases;
  const persistedControl = createKyselyControlRepositories(
    controlWriterDatabases,
  );
  const controlOptions =
    suppliedControl || Object.keys(metadataDatabases).length > 0
      ? {
          ...suppliedControl,
          lookups: suppliedControl?.lookups ?? persistedControl.lookups,
          rounding: suppliedControl?.rounding ?? persistedControl.rounding,
          bankValidation:
            suppliedControl?.bankValidation ?? persistedControl.bankValidation,
          connectors:
            suppliedControl?.connectors ?? persistedControl.connectors,
          connectorHealthJobs:
            suppliedControl?.connectorHealthJobs ?? persistedControl.healthJobs,
          // These repository reads are uncached; durable events cover downstream invalidation.
          cache: suppliedControl?.cache ?? { invalidate: async () => {} },
          guarantees: suppliedControl?.guarantees ?? {
            expectedVersion: true as const,
            audit: "transactional" as const,
            outbox: "transactional" as const,
            invalidation: true as const,
          },
        }
      : undefined;
  if (
    controlRouteFlags.connectorLifecycle &&
    !suppliedControl?.connectorHealthJobs
  ) {
    const queue = "control.connector-health",
      name = "control.connector-health.poll";
    const mode = config?.mode ?? "api";
    if (mode === "scheduler" && !container.runtimes.scheduler)
      throw new Error(
        "Connector health scheduler requires the scheduling runtime",
      );
    if ((mode === "api" || mode === "worker") && !container.runtimes.jobs)
      throw new Error("Connector health checks require the jobs runtime");
    if (mode === "worker") {
      const jobs = container.runtimes.jobs,
        secrets = container.adapters.secretStore;
      if (!jobs || !secrets)
        throw new Error(
          "Connector health worker requires jobs and secret store",
        );
      const transport = createIntegrationHttpTransport();
      jobs.register(queue, name, {
        async handle(job) {
          const planeKey = (job.data as { planeKey?: PlaneKey }).planeKey;
          if (!planeKey || job.execution?.planeKey !== planeKey)
            return {
              status: "discarded",
              reason: "Invalid connector-health plane",
            };
          const processed = await persistedControl.connectors
            .require(planeKey)
            .processHealthJobs(transport, secrets);
          return { status: "completed", output: { processed } };
        },
      });
    }
    container.runtimes.jobDefinitions.push({
      code: name,
      owner: "@athyper/server-platform-control-admin",
      queue,
      name,
      scope: "plane",
      payloadSchema: { name, version: 1 },
      timeoutMs: 180000,
      maxAttempts: 3,
      executionRetentionDays: 30,
    });
    if (container.runtimes.scheduler)
      for (const planeKey of Object.keys(controlWriterDatabases) as PlaneKey[])
        container.runtimes.scheduledJobs.push({
          scheduleId: `connector-health-${planeKey}`,
          queue,
          name,
          data: { planeKey },
          pattern: { kind: "interval", everyMs: 15000 },
          options: {
            jobId: `connector-health:${planeKey}`,
            maxAttempts: 3,
            payloadSchema: { name, version: 1 },
            execution: {
              planeKey,
              scope: "plane",
              principalId: "00000000-0000-0000-0000-000000000000",
            },
          },
        });
  }
  const featureRepositories =
    controlOptions?.features ??
    createKyselyFeatureFlagRepositories(metadataDatabases);
  const entitlementRepositories =
    controlOptions?.entitlements ??
    createKyselyEntitlementRepositories(metadataDatabases);
  if (
    controlOptions &&
    (controlOptions.guarantees.expectedVersion !== true ||
      controlOptions.guarantees.audit !== "transactional" ||
      controlOptions.guarantees.outbox !== "transactional" ||
      controlOptions.guarantees.invalidation !== true)
  )
    throw Object.assign(
      new Error(
        "Control-administration repositories do not satisfy mutation guarantees",
      ),
      { code: "CONTROL_ADMIN_MUTATION_GUARANTEES_REQUIRED" },
    );
  if (config?.wave0.controlAdminParametersEnabled) {
    const service = createParameterService({
      authorizer,
      repositories: parameterRepositories,
      // Parameter reads are uncached; bootstrap checks a fresh database revision.
      cache: controlOptions?.cache ?? { invalidate: async () => {} },
    });
    container.platform.httpRegistrars.push((application) =>
      registerParameterRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service,
        reads: !controlOptions || !controlRouteFlags.localCatalogReads,
        writes: !controlOptions || !controlRouteFlags.tenantOverrides,
      }),
    );
    for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[]) {
      container.runtimes.health.register(
        `control.${planeKey}.parameters`,
        async () => {
          const result = await parameterRepositories.health(planeKey);
          return result.status === "healthy"
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message: result.message ?? "Parameter repository unavailable",
              };
        },
      );
    }
  }
  const controlServices = controlOptions
    ? {
        features: createFeatureFlagService({
          authorizer,
          repositories: featureRepositories,
          onChanged: async (context) => {
            await container.platform.experience?.invalidation.flagChanged(
              context.planeKey,
              context.tenantId,
            );
          },
          cache: controlOptions.cache,
        }),
        parameters: createParameterService({
          authorizer,
          repositories: parameterRepositories,
          cache: controlOptions.cache,
        }),
        lookups: createLookupService({
          authorizer,
          repositories: controlOptions.lookups,
          cache: controlOptions.cache,
        }),
        rounding: createRoundingService({
          authorizer,
          repositories: controlOptions.rounding,
          cache: controlOptions.cache,
        }),
        bankValidation: createBankValidationService({
          authorizer,
          repositories: controlOptions.bankValidation,
        }),
        entitlements: createEntitlementControlService({
          authorizer,
          repositories: entitlementRepositories,
          cache: controlOptions.cache,
          onChanged: async (context) => {
            await container.platform.experience?.invalidation.planChanged(
              context.planeKey,
              context.tenantId,
            );
          },
        }),
        connectors: createConnectorControlService({
          authorizer,
          repositories: controlOptions.connectors,
          cache: controlOptions.cache,
          healthJobs: controlOptions.connectorHealthJobs,
        }),
      }
    : undefined;
  if (runtimeCommandRoutesEnabled && !controlOptions?.runtimeCommandExecutor)
    throw Object.assign(
      new Error(
        "Enabled runtime control commands require an explicitly registered executor",
      ),
      { code: "CONTROL_ADMIN_RUNTIME_EXECUTOR_REQUIRED" },
    );
  const runtimeCommandStores = createExactPlaneRepositoryProvider(
    Object.fromEntries(
      Object.entries(metadataDatabases).map(([planeKey, database]) => [
        planeKey,
        new KyselyRuntimeCommandStore(database),
      ]),
    ) as Partial<Record<PlaneKey, KyselyRuntimeCommandStore>>,
    { unavailableCode: "CONTROL_ADMIN_RUNTIME_STORE_UNAVAILABLE" },
  );
  const runtimeCommands =
    runtimeCommandRoutesEnabled && controlOptions?.runtimeCommandExecutor
      ? createRuntimeCommandService({
          authorizer,
          executor: controlOptions.runtimeCommandExecutor,
          storeFor: (context) => runtimeCommandStores.require(context.planeKey),
        })
      : undefined;
  const authorizationManagement = capabilityRegistration.register(
    "entity.authorization",
    () =>
      createHostAuthorizationManagement({
        policy: config?.wave0 ?? {},
        supplied: dependencies.authorizationManagement,
        writerDatabases: container.adapters.authorizationWriterDatabases,
        metadataDatabases,
        authorizer,
        audit,
      }),
  );
  const authorizationRoutesEnabled =
    config?.wave0.authorizationManagementRoutesEnabled ?? false;
  container.platform.controlAdmin = {
    ...(cycleConfig ? { cycleConfig } : {}),
    ...(controlServices ? { services: controlServices } : {}),
    ...(runtimeCommands ? { runtimeCommands } : {}),
    ...(authorizationManagement ? { authorizationManagement } : {}),
    routeFlags: controlRouteFlags,
    routesEnabled:
      controlRoutesEnabled ||
      cycleConfigRoutesEnabled ||
      runtimeCommandRoutesEnabled ||
      authorizationRoutesEnabled,
  };
  if (controlServices && controlRoutesEnabled)
    container.platform.httpRegistrars.push((application) =>
      registerControlServiceRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        services: controlServices,
        flags: controlRouteFlags,
      }),
    );
  if (cycleConfig && cycleConfigRoutesEnabled)
    container.platform.httpRegistrars.push((application) =>
      registerCycleConfigRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: cycleConfig,
      }),
    );
  if (runtimeCommands && runtimeCommandRoutesEnabled)
    container.platform.httpRegistrars.push((application) =>
      registerRuntimeCommandRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: runtimeCommands,
      }),
    );
  if (authorizationManagement && authorizationRoutesEnabled)
    container.platform.httpRegistrars.push((application) =>
      registerAuthorizationManagementRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: authorizationManagement,
      }),
    );
  for (const planeKey of servedPlanes)
    capabilityRegistration.registerHealth(
      container.runtimes.health,
      planeKey,
      `control.${planeKey}.cycle-config`,
      async () => {
        const result = await controlDatabases.health(planeKey);
        return result.status === "healthy"
          ? { status: "healthy" }
          : {
              status: "unhealthy",
              message:
                result.message ?? `Control repository is ${result.status}`,
            };
      },
    );
  if (controlOptions && controlRoutesEnabled)
    for (const planeKey of servedPlanes)
      capabilityRegistration.registerHealth(
        container.runtimes.health,
        planeKey,
        `control.${planeKey}.administration`,
        async () => {
          const results = await Promise.all([
            featureRepositories.health(planeKey),
            parameterRepositories.health(planeKey),
            controlOptions.lookups.health(planeKey),
            controlOptions.rounding.health(planeKey),
            controlOptions.bankValidation.health(planeKey),
            entitlementRepositories.health(planeKey),
            controlOptions.connectors.health(planeKey),
          ]);
          const failed = results.find((result) => result.status !== "healthy");
          return failed
            ? {
                status: "unhealthy",
                message:
                  failed.message ??
                  `Control administration repository is ${failed.status}`,
              }
            : { status: "healthy" };
        },
      );
  if (runtimeCommandRoutesEnabled)
    for (const planeKey of servedPlanes)
      capabilityRegistration.registerHealth(
        container.runtimes.health,
        planeKey,
        `control.${planeKey}.runtime-commands`,
        async () => {
          try {
            await runtimeCommandStores.require(planeKey).health();
            return { status: "healthy" } as const;
          } catch (error) {
            return {
              status: "unhealthy",
              message:
                error instanceof Error
                  ? error.message
                  : `Runtime command ledger is unavailable: ${planeKey}`,
            } as const;
          }
        },
      );
  for (const planeKey of servedPlanes)
    capabilityRegistration.registerHealth(
      container.runtimes.health,
      planeKey,
      `governance.${planeKey}`,
      async () => {
        const result = await governanceDatabases.health(planeKey);
        return result.status === "healthy"
          ? { status: "healthy" }
          : {
              status: "unhealthy",
              message:
                result.message ??
                `Governance repository is unavailable: ${planeKey}`,
            };
      },
    );
  for (const planeKey of servedPlanes) {
    const database = metadataDatabases[planeKey];
    capabilityRegistration.registerHealth(
      container.runtimes.health,
      planeKey,
      `governance.${planeKey}.compliance-ddl`,
      async () => {
        if (!database)
          return {
            status: "unhealthy",
            message: `Governance compliance database is unavailable: ${planeKey}`,
          } as const;
        try {
          await governanceComplianceDatabaseHealth(database);
          return { status: "healthy" } as const;
        } catch {
          return {
            status: "unhealthy",
            message: `Governance compliance DDL is unavailable or outdated: ${planeKey}`,
          } as const;
        }
      },
    );
    capabilityRegistration.registerHealth(
      container.runtimes.health,
      planeKey,
      `governance.${planeKey}.object-storage`,
      async () =>
        dependencyHealth(
          objectStorageArtifacts !== undefined &&
            objectStorageArtifacts.putIfAbsent !== undefined,
          dependencies.governanceCompliance?.objectStorageHealth,
          "Immutable object storage is unavailable",
        ),
    );
    capabilityRegistration.registerHealth(
      container.runtimes.health,
      planeKey,
      `governance.${planeKey}.retention`,
      async () => {
        if (!(config?.wave0.governanceRoutesEnabled ?? false))
          return {
            status: "healthy",
            message: "Governance compliance routes are disabled",
          } as const;
        return dependencyHealth(
          dependencies.governanceCompliance?.retention !== undefined,
          dependencies.governanceCompliance?.retentionHealth,
          "Legal-hold retention adapter is unavailable",
        );
      },
    );
  }
  if (hasGovernanceDatabase && consent && moderation && cycleConfig) {
    const cycleOptions = {
      authorizer,
      repositories: executionRepositories,
      ...(cycleReadinessSource
        ? { readinessSource: cycleReadinessSource }
        : {}),
    };
    const cycleRuns = createCycleRunService(cycleOptions),
      cycleTasks = createCycleTaskService(cycleOptions),
      cycleDeviations = createCycleDeviationService(cycleOptions),
      cycleCertifications = createCycleCertificationService(cycleOptions);
    const compliance =
      dependencies.governanceCompliance &&
      objectStorageArtifacts &&
      objectStorageArtifacts.putIfAbsent &&
      objectStorageArtifactsBucket &&
      container.runtimes.jobs
        ? {
            legalHolds: createLegalHoldService({
              authorizer,
              repositories: legalHoldRepositories,
              retention: dependencies.governanceCompliance.retention,
            }),
            reportPacks: createReportPackService({
              authorizer,
              repositories: reportPackRepositories,
              revisions: dependencies.governanceCompliance.revisions,
              jobs: container.runtimes.jobs,
              storage: objectStorageArtifacts,
              bucket: objectStorageArtifactsBucket,
            }),
          }
        : undefined;
    if (compliance && container.runtimes.jobs) {
      container.runtimes.jobs.register(
        REPORT_PACK_QUEUE,
        REPORT_PACK_JOB,
        createReportPackJobHandler({
          repositories: reportPackRepositories,
          storage: objectStorageArtifacts!,
          bucket: objectStorageArtifactsBucket!,
          generator: dependencies.governanceCompliance!.generator,
          ...(dependencies.governanceCompliance!.reportRetentionDays
            ? {
                retentionDays:
                  dependencies.governanceCompliance!.reportRetentionDays,
              }
            : {}),
        }),
      );
      container.runtimes.jobs.register(
        REPORT_PACK_QUEUE,
        REPORT_PACK_RECOVERY_JOB,
        createReportPackRecoveryHandler({
          repositories: reportPackRepositories,
          jobs: container.runtimes.jobs,
        }),
      );
      container.runtimes.jobDefinitions.push(
        {
          code: REPORT_PACK_JOB,
          owner: "@athyper/server-platform-governance",
          queue: REPORT_PACK_QUEUE,
          name: REPORT_PACK_JOB,
          scope: "tenant",
          payloadSchema: { name: REPORT_PACK_JOB, version: 1 },
          timeoutMs: 120_000,
          maxAttempts: 5,
          executionRetentionDays: 90,
        },
        {
          code: REPORT_PACK_RECOVERY_JOB,
          owner: "@athyper/server-platform-governance",
          queue: REPORT_PACK_QUEUE,
          name: REPORT_PACK_RECOVERY_JOB,
          scope: "plane",
          payloadSchema: { name: REPORT_PACK_RECOVERY_JOB, version: 1 },
          timeoutMs: 60_000,
          maxAttempts: 3,
          executionRetentionDays: 90,
        },
      );
      for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[])
        container.runtimes.scheduledJobs.push({
          scheduleId: `governance-report-pack-recovery-${planeKey}`,
          queue: REPORT_PACK_QUEUE,
          name: REPORT_PACK_RECOVERY_JOB,
          data: {
            staleAfterMs:
              dependencies.governanceCompliance!.recoveryStaleAfterMs ??
              300_000,
            limit: 100,
          },
          pattern: {
            kind: "interval",
            everyMs:
              dependencies.governanceCompliance!.recoveryIntervalMs ?? 300_000,
          },
          options: {
            jobId: `governance:report-pack:recover:${planeKey}`,
            maxAttempts: 3,
            payloadSchema: { name: REPORT_PACK_RECOVERY_JOB, version: 1 },
            execution: {
              planeKey,
              scope: "plane",
              principalId: SYSTEM_PRINCIPAL_ID,
            },
          },
        });
    }
    const routesEnabled = config?.wave0.governanceRoutesEnabled ?? false;
    container.platform.governance = {
      consent,
      moderation,
      cycleConfig,
      cycleRuns,
      cycleTasks,
      cycleDeviations,
      cycleCertifications,
      ...(compliance ? compliance : {}),
      routesEnabled,
    };
    if (routesEnabled)
      container.platform.httpRegistrars.push((application) =>
        registerGovernanceRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          authorizer,
          consent,
          cycleRuns,
          cycleTasks,
          cycleDeviations,
          cycleCertifications,
        }),
      );
    if (routesEnabled && compliance)
      container.platform.httpRegistrars.push((application) =>
        registerGovernanceComplianceRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          ...compliance,
        }),
      );
  }
  let notificationAttachmentResolver =
    dependencies.notificationAttachmentResolver ??
    (dependencies.notificationAttachmentAccessPolicy && objectStorage
      ? createNotificationAttachmentResolver({
          transactions,
          artifacts:
            dependencies.documentArtifactRepository ??
            createKyselyDocumentArtifactRepository(),
          storage: objectStorage,
          access: dependencies.notificationAttachmentAccessPolicy,
        })
      : undefined);
  const metadata = registerEntityMetadata(
    container,
    config,
    metadataDatabases,
    transactions,
    dependencies.metadata,
  );
  registerEntitySupportQualification(
    container,
    dependencies.entitySupportQualification,
  );
  let readPublishedParent:
    Parameters<typeof createPublishedParentAdmission>[0]["read"] | undefined;
  let readPublishedHeader:
    Parameters<typeof createPublishedRecordHeader>[0]["read"] | undefined;
  const admitDescriptor = (
    descriptor: import("@athyper/server-contract-metadata").EntityRuntimeDescriptor,
  ) => admitEntityDescriptor(container.platform.entityReadiness, descriptor);
  const publishedParent = createPublishedParentAdmission({
    admitDescriptor,
    reader: container.platform.compiledEntityReader!,
    read: (input, descriptor) =>
      readPublishedParent
        ? readPublishedParent(input, descriptor)
        : Promise.resolve(false),
  });
  const registeredParent = createEntityParentAdmission({
    bindings: dependencies.entityParentScopeBindings ?? [],
    async read({ context, entityCode, recordId }) {
      const descriptor = await metadata.getEntityDescriptor(
        context,
        entityCode,
      );
      const records = container.services.records?.queries;
      if (
        !descriptor?.operations.read ||
        !records ||
        descriptor.planeKey !== context.planeKey
      )
        return false;
      const found = await records.list({
        context,
        entityCode,
        recordIds: [recordId],
        fields: [descriptor.storage.idField],
        limit: 1,
        countMode: "none",
        hydrateReferences: false,
      });
      return (
        found.data.length === 1 &&
        String(found.data[0]?.[descriptor.storage.idField]) === recordId
      );
    },
  });
  const authorizeCapabilityParent = (
    input: Parameters<
      ReturnType<typeof createEntityCapabilityPolicy>["resolve"]
    >[0],
    release?: Parameters<typeof publishedParent>[1],
  ) =>
    (dependencies.entityParentScopeBindings ?? []).some(
      (binding) =>
        binding.entityCode === input.entityCode &&
        binding.planeKey === input.context.planeKey,
    )
      ? registeredParent(input)
      : publishedParent(input, release);
  const participantPermissions = createKyselyPermissionResolver({
    run: (identity, work) =>
      transactions.run(identity.planeKey, identity, work),
  });
  const recordParticipants = createRecordParticipantResolver({
    async candidates(input, query, limit) {
      return transactions.run(
        input.context.planeKey,
        input.context,
        async (tx) =>
          (
            await sql<{
              id: string;
              displayName: string;
              username: string;
            }>`SELECT id::text,display_name AS "displayName",username FROM document.collaboration_mention_candidates(${query}) LIMIT ${limit}`.execute(
              tx,
            )
          ).rows,
      );
    },
    async admit(input, principalId) {
      const row = await transactions.run(
        input.context.planeKey,
        input.context,
        async (tx) =>
          (
            await sql<{
              auth_epoch: number;
            }>`SELECT auth_epoch::int FROM document.collaboration_principal_candidates('',${principalId}::uuid)`.execute(
              tx,
            )
          ).rows[0],
      );
      if (!row) return false;
      // Build a fresh, baseline authorization subject. Never copy the requester's
      // permissions, organization scope, or elevated authentication to a recipient.
      const identity = {
        planeKey: input.context.planeKey,
        realmKey: input.context.realmKey,
        tenantId: input.context.tenantId,
        principalId,
        authEpoch: row.auth_epoch,
        assurance: "baseline" as const,
      };
      try {
        const permissions = await participantPermissions.resolve(identity);
        const context = {
          ...identity,
          permissions,
          profileHash: permissions.profileHash,
          requestId: input.context.requestId,
        };
        return Boolean(await authorizeCapabilityParent({ ...input, context }));
      } catch {
        return false;
      }
    },
  });
  const capabilityPolicy = createEntityCapabilityPolicy({
    reader: container.platform.compiledEntityReader!,
    authorizer,
    operationalControls: async () => ({
      revision: `object-storage.max-upload-mb:${config?.objectStorage.maxUploadMb ?? 25}`,
      maxFileBytes: Math.floor(
        (config?.objectStorage.maxUploadMb ?? 25) * 1024 * 1024,
      ),
    }),
    authorizeParent: authorizeCapabilityParent,
    audience: {
      async loadComment({
        context,
        entityCode,
        recordId,
        commentId,
        includeDeleted,
      }) {
        return transactions
          .run(
            context.planeKey,
            context,
            async (tx) =>
              (
                await sql<{
                  id: string;
                  entity_type: string;
                  entity_id: string;
                  commenter_id: string;
                  visibility: "public" | "internal" | "private";
                  parent_comment_id: string | null;
                }>`SELECT id::text,entity_type,entity_id,commenter_id::text,visibility,parent_comment_id::text FROM document.comment WHERE tenant_id=${context.tenantId}::uuid AND id=${commentId}::uuid AND entity_type=ANY(${collaborationEntityTypes(entityCode)}::text[]) AND entity_id=${recordId} ${includeDeleted ? sql`` : sql`AND status<>'deleted'`}`.execute(
                  tx,
                )
              ).rows[0] ?? null,
          )
          .then((row) =>
            row
              ? {
                  commentId: row.id,
                  entityCode: collaborationEntityCode(row.entity_type),
                  recordId: row.entity_id,
                  authorId: row.commenter_id,
                  visibility: row.visibility,
                  ...(row.parent_comment_id
                    ? { parentCommentId: row.parent_comment_id }
                    : {}),
                }
              : null,
          );
      },
      isCurrentRecordParticipant: async (input) =>
        Boolean(await authorizeCapabilityParent(input)),
      validateMentions: (input, ids) => recordParticipants.validate(input, ids),
    },
  });
  let attachmentDiscovery:
    ReturnType<typeof createAttachmentDiscoveryService> | undefined;
  let qualifyAttachmentPreview: (() => Promise<void>) | undefined;
  let qualifyAttachmentExtraction: (() => Promise<void>) | undefined;
  let publishedSummaries:
    ReturnType<typeof createEntityResourceServices>["summaries"] | undefined;
  let activityProvider: EntityActivityProvider | undefined;
  let recordHistory: EntityServices["recordHistory"] | undefined;
  let activityDomainActions:
    EntityServices["activityDomainActions"] | undefined;
  const activityRegistrations = new Map(
    (dependencies.activityAdapters ?? []).map((r) => [r.adapter.key, r]),
  );
  if (
    activityRegistrations.size !== (dependencies.activityAdapters ?? []).length
  )
    throw Error("ACTIVITY_ADAPTER_DUPLICATE");
  const historyAdapters = new Map(
    [...activityRegistrations].map(([key, r]) => [key, r.adapter]),
  );
  const activityDomainHandlers = new Map<
    string,
    import("@athyper/server-service-records").TransactionalRecordActionHandler<RecordTransaction>
  >(partnerCapabilityHandlers);
  for (const registration of activityRegistrations.values())
    for (const [key, handler] of registration.domainHandlers ?? []) {
      if (activityDomainHandlers.has(key))
        throw Error("ACTIVITY_DOMAIN_HANDLER_DUPLICATE");
      activityDomainHandlers.set(key, handler);
    }
  const activityPolicy = createEntityActivityPolicy({
    reader: container.platform.compiledEntityReader!,
    authorizer,
    authorizeParent: async (input, release) => {
      if (await publishedParent(input, release)) return true;
      if (!readPublishedParent) return false;
      const descriptor = await admitDescriptor(
        await readCompiledRuntimeContract(
          container.platform.compiledEntityReader!,
          release,
        ),
      );
      const operation =
        await container.platform.compiledEntityReader!.operation(release);
      const binding = parseActivityBinding(
        operation.content.activityBinding,
        input.entityCode,
      );
      if (!binding.recording) return false;
      try {
        qualifyRecordHistoryDescriptor(
          descriptor,
          resolveRecordHistoryBinding(descriptor, binding),
          binding.recording.adapterKey
            ? historyAdapters.get(binding.recording.adapterKey)
            : undefined,
        );
      } catch {
        return false;
      }
      return readPublishedParent(input, descriptor);
    },
  });
  const entityActivity = createEntityActivityService({
    policy: activityPolicy,
    provider: () => activityProvider,
    cursorKey: dependencies.entityActivityCursorKey,
  });
  const entityCollaboration = createEntityCollaborationService({
    reader: container.platform.compiledEntityReader!,
    capabilities: capabilityPolicy,
    providers: createCollaborationSectionProviders(transactions),
  });
  const authorizeAttachmentCapability = createEntityAttachmentAdmission({
    load: (context, attachmentId) =>
      transactions.run(
        context.planeKey,
        context,
        async (tx) =>
          (
            await sql<AttachmentCapabilitySubject>`SELECT attachment.metadata->>'entity_type' entity_type,attachment.metadata->>'entity_id' entity_id,attachment.admitted_policy_hash,attachment.content_type,attachment.size_bytes,attachment.draft_id::text,attachment.uploaded_by::text,EXISTS(SELECT 1 FROM document.attachment_link link WHERE link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id AND link.entity_type=attachment.metadata->>'entity_type' AND link.entity_id=attachment.metadata->>'entity_id') has_record_link,(SELECT link.entity_id FROM document.attachment_link link WHERE link.tenant_id=attachment.tenant_id AND link.pinned_attachment_id=attachment.id AND link.entity_type='document.comment' AND link.link_kind='comment' LIMIT 1) comment_id FROM document.attachment attachment WHERE attachment.tenant_id=${context.tenantId}::uuid AND attachment.id=${attachmentId}::uuid`.execute(
              tx,
            )
          ).rows[0],
      ),
    ownsDraft: (context, draftId, entityCode, recordId) =>
      transactions.run(context.planeKey, context, async (tx) =>
        Boolean(
          (
            await sql`SELECT id FROM document.comment_draft WHERE tenant_id=${context.tenantId}::uuid AND id=${draftId}::uuid AND principal_id=${context.principalId}::uuid AND entity_type=ANY(${collaborationEntityTypes(entityCode)}::text[]) AND entity_id=${recordId} AND expires_at>clock_timestamp()`.execute(
              tx,
            )
          ).rows[0],
        ),
      ),
    resolve: (input) => capabilityPolicy.resolve(input),
    authorizeOwner: async ({
      context,
      entityType,
      entityId,
      action,
      uploadedBy,
      attachmentId,
    }) => {
      if (entityType === "atlas.prompt") {
        if (!attachmentId)
          return action === "create" && /^[0-9a-f-]{36}$/i.test(entityId);
        if (uploadedBy !== context.principalId) return false;
        // Match the Atlas context resolver's uploader and prompt-link ownership.
        return transactions.run(context.planeKey, context, async (tx) =>
          Boolean(
            (
              await sql`
          SELECT a.id FROM document.attachment a
          WHERE a.tenant_id=${context.tenantId}::uuid AND a.id=${attachmentId}::uuid
            AND a.uploaded_by=${context.principalId}::uuid
            AND a.metadata->>'entity_type'='atlas.prompt' AND a.metadata->>'entity_id'=${entityId}
            AND (EXISTS (SELECT 1 FROM document.attachment_link l
              WHERE l.tenant_id=a.tenant_id AND l.attachment_series_id=a.series_id
                AND l.entity_type='atlas.prompt' AND l.entity_id=${entityId}
                AND l.created_by=${context.principalId}::uuid
                AND (l.pinned_attachment_id IS NULL OR l.pinned_attachment_id=a.id))
              OR (a.status IN ('pending','uploading','uploaded','processing','quarantined','rejected','failed')
                AND ${["finalize", "status", "archive"].includes(action)}))
        `.execute(tx)
            ).rows.length,
          ),
        );
      }
      const acl = container.services.content?.acl;
      if (!acl) return false;
      return acl.authorize({
        context,
        contentItemId: entityId,
        required: [
          "download",
          "preview",
          "extract",
          "search",
          "status",
        ].includes(action)
          ? "read"
          : "write",
      });
    },
  });

  if (container.platform.compiledEntityReader) {
    const resourceHeaders =
      dependencies.entityResourceProviders?.headers ??
      createPublishedRecordHeader({
        admitDescriptor,
        reader: container.platform.compiledEntityReader,
        read: (input, descriptor, fields) => {
          if (!readPublishedHeader)
            throw new HttpError(
              503,
              "ENTITY_RESOURCE_PROVIDER_UNAVAILABLE",
              "The authorized record reader is unavailable",
            );
          return readPublishedHeader(input, descriptor, fields);
        },
      });
    const resourceServices = createEntityResourceServices({
      capabilities: capabilityPolicy,
      displayChoices: createRecordDisplayChoices(transactions),
      reader: container.platform.compiledEntityReader!,
      headers: resourceHeaders,
      sections: {
        get: (key) => dependencies.entityResourceProviders?.sections.get(key),
        getService:
          createCollaborationSectionProviders(transactions).getService,
      },
      summaries: dependencies.entityResourceProviders?.summaries,
      createHandlers: (entityRuntime) =>
        createEntityRuntimeHandlerRegistry({
          fallback(handlerKey) {
            if (activityDomainHandlers.has(handlerKey))
              return {
                async execute(command) {
                  if (!activityDomainActions)
                    throw new EntityRuntimeOperationError(
                      503,
                      "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                    );
                  return {
                    ...(await activityDomainActions.execute({
                      ...command,
                      actionCode: command.operationKey,
                      origin: "operation",
                      validationMode: "strict",
                    })),
                  };
                },
              };
            const capabilityHandler =
              /^platform\.(comments|attachments)\.([a-z_]+)\.v1$/.exec(
                handlerKey,
              );
            if (capabilityHandler)
              return {
                async execute(command) {
                  const {
                    context,
                    entityCode,
                    recordId,
                    input,
                    expectedVersion,
                    idempotencyKey,
                  } = command;
                  const action = capabilityHandler[2];
                  if (action === "read") {
                    if (typeof input.surfaceKey !== "string")
                      throw new EntityRuntimeOperationError(
                        400,
                        "ENTITY_RUNTIME_OPERATION_INPUT_REQUIRED",
                      );
                    const resource = await entityRuntime.section({
                      context,
                      entityCode,
                      recordId,
                      surfaceKey: input.surfaceKey,
                      sectionKey: capabilityHandler[1]!,
                    });
                    if (!resource) throw new EntityCapabilityPolicyError();
                    return { ...resource };
                  }
                  if (capabilityHandler[1] === "comments") {
                    const service = container.services.collaboration;
                    if (!service)
                      throw new EntityRuntimeOperationError(
                        503,
                        "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                      );
                    if (action === "create")
                      return {
                        ...(await service.create({
                          ...input,
                          context,
                          entityType: entityCode,
                          entityId: recordId,
                          text: String(input.text ?? ""),
                          idempotencyKey,
                        })),
                      };
                    if (action === "reply")
                      return {
                        ...(await service.create({
                          ...input,
                          context,
                          entityType: entityCode,
                          entityId: recordId,
                          text: String(input.text ?? ""),
                          parentCommentId: String(input.parentCommentId ?? ""),
                          idempotencyKey,
                        })),
                      };
                    if (action === "mention") {
                      if (!service.participants)
                        throw new EntityCapabilityPolicyError();
                      return {
                        items: await service.participants({
                          context,
                          entityType: entityCode,
                          entityId: recordId,
                          query: String(input.query ?? ""),
                          visibility:
                            input.visibility === "private"
                              ? "private"
                              : input.visibility === "internal"
                                ? "internal"
                                : "public",
                        }),
                      };
                    }
                    if (action === "draft")
                      return {
                        id: await service.putDraft({
                          ...input,
                          context,
                          entityType: entityCode,
                          entityId: recordId,
                          text: String(input.text ?? ""),
                        }),
                      };
                    const commentId = String(input.commentId ?? "");
                    const target = await transactions.run(
                      context.planeKey,
                      context,
                      async (tx) =>
                        (
                          await sql`SELECT id FROM document.comment WHERE tenant_id=${context.tenantId}::uuid AND id=${commentId}::uuid AND entity_type=ANY(${collaborationEntityTypes(entityCode)}::text[]) AND entity_id=${recordId}`.execute(
                            tx,
                          )
                        ).rows[0],
                    );
                    if (!target) throw new EntityCapabilityPolicyError();
                    if (action === "history") {
                      if (!service.history)
                        throw new EntityCapabilityPolicyError();
                      return {
                        ...(await service.history({
                          context,
                          commentId,
                          ...(typeof input.beforeRevision === "number"
                            ? { beforeRevision: input.beforeRevision }
                            : {}),
                        })),
                      };
                    }
                    if (action === "update_own")
                      return {
                        ...(await service.edit({
                          ...input,
                          context,
                          commentId,
                          text: String(input.text ?? ""),
                          expectedRevision: expectedVersion!,
                        })),
                      };
                    if (action === "archive_own")
                      return {
                        removed: await service.remove({ context, commentId }),
                      };
                    if (action === "react")
                      return {
                        inserted: await service.putReaction({
                          context,
                          commentId,
                          code: String(input.code ?? ""),
                        }),
                      };
                    if (action === "flag")
                      return {
                        id: await service.flag({
                          context,
                          commentId,
                          reasonCode: String(input.reasonCode ?? ""),
                          ...(typeof input.detail === "string"
                            ? { detail: input.detail }
                            : {}),
                        }),
                      };
                  } else {
                    const service = container.services.attachments;
                    if (!service)
                      throw new EntityRuntimeOperationError(
                        503,
                        "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                      );
                    const attachmentId = String(input.attachmentId ?? "");
                    if (["preview", "search", "extract"].includes(action!)) {
                      if (!attachmentDiscovery)
                        throw new EntityRuntimeOperationError(
                          503,
                          "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                        );
                      if (action === "search")
                        return attachmentDiscovery.search(context, {
                          entityType: entityCode,
                          entityId: recordId,
                          q: String(input.q ?? ""),
                          ...(typeof input.after === "string"
                            ? { after: input.after }
                            : {}),
                        });
                      const scoped = await authorizeAttachmentCapability(
                        context,
                        action!,
                        { attachmentId },
                      );
                      if (
                        scoped?.entityType !== entityCode ||
                        scoped?.entityId !== recordId
                      )
                        throw new EntityCapabilityPolicyError();
                      if (action === "preview")
                        return attachmentDiscovery.preview(context, {
                          attachmentId,
                          ...(typeof input.rendition === "string"
                            ? { rendition: input.rendition }
                            : {}),
                        });
                      return attachmentDiscovery.extract(context, attachmentId);
                    }
                    const admission = await authorizeAttachmentCapability(
                      context,
                      action!,
                      { ...input, entityType: entityCode, entityId: recordId },
                    );
                    if (action !== "create") {
                      const targetAttachmentId =
                        action === "version"
                          ? String(input.parentAttachmentId ?? "")
                          : attachmentId;
                      const target = await transactions.run(
                        context.planeKey,
                        context,
                        async (tx) =>
                          (
                            await sql`SELECT id FROM document.attachment WHERE tenant_id=${context.tenantId}::uuid AND id=${targetAttachmentId}::uuid AND metadata->>'entity_type'=${entityCode} AND metadata->>'entity_id'=${recordId}`.execute(
                              tx,
                            )
                          ).rows[0],
                      );
                      if (!target) throw new EntityCapabilityPolicyError();
                    }
                    const identity = {
                      planeKey: context.planeKey,
                      tenantId: context.tenantId,
                      principalId: context.principalId,
                      attachmentId,
                    };
                    if (action === "create" || action === "version") {
                      const staged = await service.stage({
                        ...identity,
                        ...admission,
                        entityType: entityCode,
                        entityId: recordId,
                        fileName: String(input.fileName ?? ""),
                        contentType: String(input.contentType ?? ""),
                        sizeBytes: Number(input.sizeBytes),
                        ...(typeof input.draftId === "string"
                          ? { draftId: input.draftId }
                          : {}),
                        ...(action === "version"
                          ? {
                              parentAttachmentId: String(
                                input.parentAttachmentId ?? "",
                              ),
                              expectedSeriesVersion: Number(
                                input.expectedSeriesVersion,
                              ),
                            }
                          : {}),
                      });
                      return {
                        attachmentId: staged.attachmentId,
                        uploadUrl: staged.uploadUrl,
                        expiresAt: staged.expiresAt,
                      };
                    }
                    if (action === "finalize") {
                      const result = await service.finalize(
                        identity,
                        String(input.contentType ?? ""),
                        {
                          authorizeCommit: async () => {
                            await authorizeAttachmentCapability(
                              context,
                              "finalize",
                              {
                                attachmentId,
                                entityType: entityCode,
                                entityId: recordId,
                              },
                            );
                          },
                        },
                      );
                      return { attachmentId: result.id, status: result.status };
                    }
                    if (action === "status") {
                      const result = await (
                        service.authorizedStatus ?? service.status
                      )(identity);
                      return { attachmentId: result.id, status: result.status };
                    }
                    if (action === "download")
                      return {
                        ...(await service.createAuthorizedDownload(
                          identity,
                          120,
                        )),
                      };
                    if (action === "rename") {
                      if (!service.rename)
                        throw new EntityRuntimeOperationError(
                          503,
                          "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                        );
                      const renamed = await service.rename(identity, {
                        displayName: String(input.displayName ?? ""),
                        expectedSeriesRevision: String(
                          input.expectedSeriesRevision ?? "",
                        ),
                      });
                      return {
                        attachmentId: renamed.id,
                        seriesId: renamed.seriesId,
                        displayName: String(input.displayName ?? "").trim(),
                      };
                    }
                    if (action === "category") {
                      if (!service.setCategory)
                        throw new EntityRuntimeOperationError(
                          503,
                          "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                        );
                      await service.setCategory(identity, {
                        entityType: entityCode,
                        entityId: recordId,
                        category: String(input.category ?? "") as
                          "general" | "evidence",
                      });
                      return {};
                    }
                    if (action === "folder") {
                      if (!service.manageFolder)
                        throw new EntityRuntimeOperationError(
                          503,
                          "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                        );
                      return {
                        ...(await service.manageFolder(identity, {
                          command: String(input.command ?? "") as
                            "create" | "move" | "delete",
                          entityType: entityCode,
                          entityId: recordId,
                          folderId: String(input.folderId ?? ""),
                          expectedRevision: expectedVersion!,
                          idempotencyKey: idempotencyKey!,
                          ...(typeof input.name === "string"
                            ? { name: input.name }
                            : {}),
                          ...(typeof input.parentFolderId === "string"
                            ? { parentFolderId: input.parentFolderId }
                            : {}),
                          ...(typeof input.attachmentId === "string"
                            ? { attachmentId: input.attachmentId }
                            : {}),
                        })),
                      };
                    }
                    if (action === "archive") {
                      if (!service.archive)
                        throw new EntityRuntimeOperationError(
                          503,
                          "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                        );
                      return { ...(await service.archive(identity)) };
                    }
                    if (action === "unlink") {
                      if (!service.unlink)
                        throw new EntityRuntimeOperationError(
                          503,
                          "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                        );
                      return {
                        ...(await service.unlink(identity, {
                          entityType: entityCode,
                          entityId: recordId,
                        })),
                      };
                    }
                  }
                  throw new EntityRuntimeOperationError(
                    503,
                    "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                  );
                },
              };
            if (handlerKey === "entity.record.export.v1")
              return {
                async execute({ context, entityCode, input, idempotencyKey }) {
                  const transfers = container.services.records?.transfers;
                  if (!transfers)
                    throw new EntityRuntimeOperationError(
                      503,
                      "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                    );
                  return transfers.requestExport(
                    context,
                    entityCode,
                    input,
                    idempotencyKey,
                  );
                },
              };
            if (handlerKey === "entity.record.import.v1")
              return {
                async execute({ context, entityCode, input }) {
                  const transfers = container.services.records?.transfers;
                  if (!transfers)
                    throw new EntityRuntimeOperationError(
                      503,
                      "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
                    );
                  const operation = input.operation;
                  if (
                    ![
                      "create",
                      "update",
                      "upsert",
                      "delete",
                      "replace",
                    ].includes(String(operation))
                  )
                    throw new EntityRuntimeOperationError(
                      400,
                      "ENTITY_RUNTIME_OPERATION_INPUT_VALUE_INVALID",
                    );
                  return {
                    ...(await transfers.beginImport(
                      context,
                      entityCode,
                      typeof input.sessionId === "string"
                        ? input.sessionId
                        : undefined,
                      operation as never,
                      {
                        scopeCoordinate: input.scopeCoordinate as never,
                        conflictPolicy: input.conflictPolicy as never,
                        atomicity: input.atomicity as never,
                      },
                    )),
                  };
                },
              };
            return undefined;
          },
        }),
    });
    publishedSummaries = resourceServices.summaries;
    container.platform.httpRegistrars.push(
      createEntityResourceHttpRegistrar({
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: resourceServices.resources,
        collaboration: entityCollaboration,
        operations: resourceServices.operations,
        intakeProviders: dependencies.entityIntakeProviders ?? {
          get: () => undefined,
        },
      }),
    );
  }

  registerStudioAuthoring(
    container,
    config,
    metadataDatabases.studio,
    iam,
    authorizer,
    transactions,
    {
      databases: metadataDatabases,
      mutationPolicies: new Set([
        "platform.notifications.preferences.v1",
        "platform.experience.ui_profile.v1",
      ]),
      runtime: {
        qualify(profile, bindings) {
          const runtime = localGraphRuntimeQualifiers.get(container);
          if (!runtime) throw Error("PUBLICATION_RUNTIME_REGISTRY_UNAVAILABLE");
          runtime.qualify(profile, bindings);
        },
      },
      qualifyCapabilities: createCapabilityQualification({
        databases: metadataDatabases,
        providers: () => ({
          parentRead: Boolean(readPublishedParent),
          resourceHeader: Boolean(
            dependencies.entityResourceProviders?.headers ||
            readPublishedHeader,
          ),
          section: (key) =>
            key === "platform.activity.v1"
              ? activityProvider
                ? { read: entityActivity.describe }
                : undefined
              : createCollaborationSectionProviders(transactions).getService(
                  key,
                ),
          recordHistory: recordHistory
            ? {
                prepare: recordHistory.prepare,
                qualify: async (target) => {
                  if (
                    target.graph.contractSchema ===
                    "athyper.meta-entity-contract/2.5"
                  )
                    throw Error("NATIVE_ACTIVITY_RECORDING_UNQUALIFIED");
                  return qualifyActivityRecordingGraph(
                    target.graph,
                    activityRegistrations,
                  );
                },
              }
            : undefined,
          activity: activityProvider
            ? {
                timeline_query: entityActivity.page,
                versions_read: entityActivity.page,
                audit_query: entityActivity.page,
                snapshots_read: entityActivity.snapshot,
                snapshots_compare: entityActivity.compare,
                snapshots_capture: entityActivity.capture,
              }
            : undefined,
          comments: container.services.collaboration,
          attachments: container.services.attachments,
          discovery: attachmentDiscovery,
          processing: {
            qualifyPreview: qualifyAttachmentPreview,
            qualifyExtraction: qualifyAttachmentExtraction,
          },
          storage: container.adapters.objectStorageDocuments,
          scanner: container.adapters.malwareScanner,
        }),
      }),
    },
  );
  registerStudioOnboarding(
    container,
    metadataDatabases.studio,
    dependencies.onboardingTransport,
    iam,
    authorizer,
    config?.mode === "api" ||
      config?.mode === "worker" ||
      config?.mode === "scheduler"
      ? config.mode
      : undefined,
  );
  if (Object.keys(metadataDatabases).length > 0) {
    container.services.numbering = new DefaultNumberingService(
      transactions,
      createKyselyNumberingRepository(),
    );
  }
  const notificationRepositories =
    createKyselyNotificationRepositories(transactions);
  if (Object.keys(metadataDatabases).length > 0) {
    const collaboration = createCollaborationService({
      participants: (input) =>
        recordParticipants.search(
          {
            context: input.context,
            entityCode: input.entityType,
            recordId: input.entityId,
            kind: "comments",
            action: "mention",
            input: { visibility: input.visibility },
          },
          input.query,
        ),
      async authorizeCapability(action, input, value) {
        let entityCode = input.entityType,
          recordId = input.entityId;
        if (input.commentId) {
          const row = await transactions.run(
            input.context.planeKey,
            input.context,
            async (tx) =>
              (
                await sql<{
                  entity_type: string;
                  entity_id: string;
                }>`SELECT entity_type,entity_id FROM document.comment WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.commentId}::uuid`.execute(
                  tx,
                )
              ).rows[0],
          );
          entityCode = row?.entity_type;
          recordId = row?.entity_id;
        }
        if (entityCode) entityCode = collaborationEntityCode(entityCode);
        if (entityCode === "content.item") {
          if (action === "mention" || action === "history")
            throw new EntityCapabilityPolicyError();
          return;
        }
        if (!entityCode || !recordId) throw new EntityCapabilityPolicyError();
        // Only the admission reads share evidence. The subsequent command
        // transaction, revision checks and writes run outside this boundary.
        const resolved = await withReadEvidence(() =>
          capabilityPolicy.resolve({
            context: input.context,
            entityCode: entityCode!,
            recordId: recordId!,
            kind: "comments",
            action,
            input: value,
            actionOnly: true,
          }),
        );
        if (
          "maxDepth" in resolved.binding &&
          typeof value.parentCommentId === "string"
        ) {
          const parent = await transactions.run(
            input.context.planeKey,
            input.context,
            async (tx) =>
              (
                await sql<{
                  thread_depth: number;
                }>`SELECT thread_depth FROM document.comment WHERE tenant_id=${input.context.tenantId}::uuid AND id=${value.parentCommentId}::uuid AND entity_type=ANY(${collaborationEntityTypes(entityCode)}::text[]) AND entity_id=${recordId} AND status<>'deleted'`.execute(
                  tx,
                )
              ).rows[0],
          );
          if (
            !parent ||
            !canReplyAtDepth(
              "active",
              parent.thread_depth,
              resolved.binding.maxDepth,
            )
          )
            throw new EntityCapabilityPolicyError();
        }
        return {
          defaultAudience:
            "defaultAudience" in resolved.binding
              ? resolved.binding.defaultAudience
              : undefined,
          draftRetentionDays:
            "draftRetentionDays" in resolved.binding
              ? resolved.binding.draftRetentionDays
              : undefined,
        };
      },
      authorizer,
      principals: createKyselyPrincipalDirectory(),
      repository: createKyselyCollaborationRepository(collaborationCoordinates),
      commandExecutions:
        createKyselyCommandExecutionStore<
          import("@athyper/server-contract-collaboration").CommentRecord
        >(),
      transactions: exactTransactions,
      outbox: createDatabaseOutboxWriter("collaboration"),
      audit,
      ...(moderation ? { moderation } : {}),
    });
    container.services.collaboration = collaboration;
    container.platform.httpRegistrars.push((application) =>
      registerCollaborationRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        collaboration,
      }),
    );
  }
  const integrationDatabase = metadataDatabases.studio;
  if (
    integrationDatabase &&
    container.adapters.secretStore &&
    container.runtimes.jobs
  ) {
    const repository = new KyselyIntegrationRepository(integrationDatabase, {
        audit,
        outbox: createDatabaseOutboxWriter("integration"),
      }),
      service = new IntegrationService(repository),
      dependencyCalls = container.adapters.openTelemetry?.metrics.counter(
        "athyper_integration_dependency_calls_total",
        "Integration dependency calls by outcome",
      ),
      dependencyLatency = container.adapters.openTelemetry?.metrics.histogram(
        "athyper_integration_dependency_duration_ms",
        "Integration dependency call duration",
      ),
      transport = createIntegrationHttpTransport({
        telemetry: (event) => {
          const labels = {
            outcome: event.outcome,
            classification: event.classification ?? "none",
            circuit_state: event.circuitState,
          };
          dependencyCalls?.increment(labels);
          dependencyLatency?.record(event.durationMs, labels);
        },
      }),
      policies = new KyselyInboundWebhookPolicyResolver(integrationDatabase);
    container.runtimes.health.register("integration.http", () =>
      transport.health(),
    );
    registerIntegrationJobs(container.runtimes.jobs, {
      repository,
      transport,
      secrets: container.adapters.secretStore,
    });
    container.runtimes.jobDefinitions.push({
      code: DELIVER_INTEGRATION_JOB,
      owner: "@athyper/server-service-integration",
      queue: INTEGRATION_DELIVERY_QUEUE,
      name: DELIVER_INTEGRATION_JOB,
      scope: "tenant",
      payloadSchema: { name: DELIVER_INTEGRATION_JOB, version: 1 },
      timeoutMs: 120_000,
      maxAttempts: 10,
      executionRetentionDays: 90,
    });
    container.platform.httpRegistrars.push((application) =>
      registerIntegrationRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer,
        repository,
        service,
        jobs: container.runtimes.jobs!,
        transport,
        secrets: container.adapters.secretStore!,
        policies,
      }),
    );
  }
  const effectiveCollection = async (
    context: VerifiedRequestContext,
    key: string,
  ) => {
    if (!["activity.notifications", "activity.inbox"].includes(key))
      throw new HttpError(
        404,
        "COLLECTION_NOT_FOUND",
        "Unknown activity collection",
      );
    if (
      key === "activity.inbox" &&
      !(
        await authorizer.authorize({
          context,
          permissionCode: "workflow.work_item.read",
        })
      ).allowed
    )
      throw new HttpError(
        403,
        "COLLECTION_ACCESS_REQUIRED",
        "Workflow inbox access is required",
      );
    const value = await exactTransactions.run(context.planeKey, context, (tx) =>
      readPublishedCollectionConfiguration(
        tx as unknown as Kysely<Record<string, never>>,
        context.tenantId,
        context.planeKey,
        key,
      ),
    );
    if (!value)
      throw new HttpError(
        404,
        "COLLECTION_CONFIGURATION_NOT_PUBLISHED",
        "Activity configuration is not published for this workspace",
      );
    return value;
  };
  const validateActivityCollection = async (
    context: VerifiedRequestContext,
    kind: "notifications" | "inbox",
    query: ActivityQuery,
    limit: number,
  ) => {
    const { configuration: c } = await effectiveCollection(
      context,
      `activity.${kind}`,
    );
    if (limit > c.maxPageSize)
      throw new TypeError("Page size exceeds published collection limit");
    const state = activityCollectionState(kind, query, c);
    if (state.query && !c.searchFields.length)
      throw new TypeError("Search is unavailable for this collection");
    return {
      ...collectionActivityQuery(kind, state, query.timeZone),
      searchFields: c.searchFields,
    };
  };
  const savedViews = createSavedViewService(
    createKyselySavedViewRepository(transactions),
    undefined,
    async (scope, operation, entityCode, surfaceCode) => {
      const decision = await authorizer.authorize({
        context: scope as VerifiedRequestContext,
        permissionCode: `${scope.planeKey}.ui.saved_view.${operation}`,
        resource: {
          tenantId: scope.tenantId,
          entityCode,
          surfaceCode,
          operationKey: operation,
        },
      });
      return decision.allowed && (!decision.scope || decision.scope.tenantWide);
    },
    async (scope, view) => {
      if (view.entityCode.startsWith("activity.")) {
        if (view.surfaceCode !== "activity_center")
          throw new TypeError("Activity view surface mismatch");
        const { configuration: c } = await effectiveCollection(
          scope as VerifiedRequestContext,
          view.entityCode,
        );
        const state = view.state as Record<string, unknown>;
        if (state.schemaVersion !== c.viewVersion)
          throw new TypeError(
            "Saved view version is incompatible; recreate the view",
          );
        parseCollectionState(state.collection, c.fields);
      }
    },
  );
  container.platform.httpRegistrars.push((application) =>
    registerSavedViewRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      savedViews,
    }),
  );
  container.platform.httpRegistrars.push((application) =>
    application.get(
      "/api/collections/:collectionKey/descriptor",
      createIamAuthenticationMiddleware(iam),
      async (req, res, next) => {
        try {
          const value = await effectiveCollection(
            readVerifiedRequestContext(res),
            String(req.params.collectionKey),
          );
          res.setHeader("Cache-Control", "private, no-store");
          res.json(value);
        } catch (e) {
          next(e);
        }
      },
    ),
  );
  container.platform.httpRegistrars.push((application) =>
    registerViewCollectionRoutes(application, {
      path: "/api/collections/:entityCode/views",
      surface: "activity_center",
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      service: savedViews,
      descriptor: async (context, key) => {
        const { configuration: c } = await effectiveCollection(context, key);
        return {
          standardViews: c.views.map((v) => ({
            key: v.key,
            label: v.label,
            state: { schemaVersion: c.viewVersion, collection: v.state },
          })),
          validate: (raw: unknown) => {
            const v = raw as { schemaVersion?: number; collection?: unknown };
            if (v?.schemaVersion !== c.viewVersion)
              throw new TypeError(
                "Saved view is incompatible; recreate it using current fields",
              );
            return {
              schemaVersion: c.viewVersion,
              collection: parseCollectionState(v.collection, c.fields),
            };
          },
        };
      },
    }),
  );
  const notificationEvents =
    container.adapters.notificationEvents ?? createNotificationEventBus();
  const sesDeliveryRepository =
    config?.email.provider === "ses"
      ? new KyselySesDeliveryEventRepository(transactions)
      : undefined;
  if (
    config?.email.provider === "ses" &&
    config.mode === "worker" &&
    container.adapters.sesEventSource
  ) {
    const sesEvents = createSesDeliveryEventProcessor(sesDeliveryRepository!);
    container.adapters.sesEventHandler = createSesEventMessageHandler(
      createSesActivityEventApplier(sesEvents, notificationEvents),
    );
  }
  const notificationPreferences = createNotificationPreferenceService({
    store: createKyselyNotificationPreferenceStore(transactions),
    capabilities: createKyselyPreferenceCapabilities(transactions),
    events: createPreferenceInvalidationPublisher(transactions),
  });
  const notificationOperations = createNotificationOperations({
    repository: createKyselyNotificationOperationsRepository(transactions),
    authorizer,
  });
  const notificationHandlers = new Map(container.adapters.notificationChannels);
  const emailHandler = notificationHandlers.get("email");
  if (emailHandler && sesDeliveryRepository) {
    notificationHandlers.set(
      "email",
      createSuppressionAwareEmailHandler(emailHandler, sesDeliveryRepository),
    );
  }
  notificationHandlers.set(
    "in_app",
    createInAppNotificationHandler({
      repository: notificationRepositories,
      publisher: notificationEvents,
    }),
  );
  if (container.adapters.pushTransports.length > 0)
    notificationHandlers.set(
      "push",
      createPushNotificationHandler({
        subscriptions: notificationRepositories,
        transports: container.adapters.pushTransports,
      }),
    );
  const notifications = createNotificationOrchestrator({
    recipients: createNotificationRecipientResolver({
      directory: notificationRepositories,
      whatsAppConsent: notificationRepositories,
    }),
    ledger: notificationRepositories,
    handlers: notificationHandlers,
  });
  container.services.notifications = notifications;

  const notificationRecipientContext = async (
    source: import("@athyper/server-contract-notifications").NotificationSourceEvent,
    principalId: string,
  ) => {
    const row = await transactions.run(
      source.planeKey,
      { tenantId: source.tenantId, principalId },
      async (tx) =>
        (
          await sql<{
            auth_epoch: number;
          }>`SELECT auth_epoch FROM master.principal WHERE tenant_id=${source.tenantId}::uuid AND id=${principalId}::uuid AND status='active'`.execute(
            tx,
          )
        ).rows[0],
    );
    if (!row) return null;
    const identity = {
      planeKey: source.planeKey,
      realmKey: "athyper",
      tenantId: source.tenantId,
      principalId,
      authEpoch: row.auth_epoch,
      assurance: "baseline" as const,
    };
    const permissions = await participantPermissions.resolve(identity);
    return {
      ...identity,
      permissions,
      profileHash: permissions.profileHash,
      requestId: source.id,
    };
  };
  const authorizeNotificationRecipient = async (
    source: import("@athyper/server-contract-notifications").NotificationSourceEvent,
    principalId: string,
  ) => {
    const entityCode = source.payload.entity_type,
      recordId = source.payload.entity_id;
    if (typeof entityCode !== "string" || typeof recordId !== "string")
      return false;
    const context = await notificationRecipientContext(source, principalId);
    if (!context) return false;
    try {
      const commentId = source.payload.comment_id ?? source.payload.resource_id;
      await capabilityPolicy.resolve({
        context,
        entityCode,
        recordId,
        kind: source.eventCode.startsWith("collaboration.comment.")
          ? "comments"
          : "attachments",
        action: "read",
        input:
          typeof commentId === "string" &&
          source.eventCode.startsWith("collaboration.comment.")
            ? { commentId }
            : {},
      });
      return true;
    } catch (error) {
      if (error instanceof EntityCapabilityPolicyError) return false;
      throw error;
    }
  };
  if (!notificationAttachmentResolver && objectStorage)
    notificationAttachmentResolver = createNotificationAttachmentResolver({
      transactions,
      artifacts:
        dependencies.documentArtifactRepository ??
        createKyselyDocumentArtifactRepository(),
      storage: objectStorage,
      access: {
        async authorize(input) {
          const { request, attachment } = input;
          if (
            request.planeKey !== "neon" ||
            request.versionPolicy !== "pinned" ||
            request.attachmentVersionId !== attachment.attachmentVersionId
          )
            return false;
          // Restrict access to the delivery's parent/comment, not any unrelated file link.
          return exactTransactions.run(
            "neon",
            {
              tenantId: request.tenantId,
              principalId: request.recipientPrincipalId,
            },
            async (tx) => {
              const row = (
                await sql<{
                  payload: Record<string, unknown>;
                }>`SELECT m.payload FROM event.notification_delivery d JOIN event.notification_message m ON m.tenant_id=d.tenant_id AND m.id=d.message_id WHERE d.tenant_id=${request.tenantId}::uuid AND d.id=${request.deliveryId}::uuid AND d.recipient_id=${request.recipientPrincipalId}::uuid`.execute(
                  tx,
                )
              ).rows[0];
              const data = row?.payload;
              if (
                !data ||
                typeof data.resource_id !== "string" ||
                typeof data.notification_event_code !== "string"
              )
                return false;
              if (
                !attachment.links.some(
                  (link) =>
                    link.entityType === "document.comment" &&
                    link.entityId === data.resource_id,
                )
              )
                return false;
              return authorizeNotificationRecipient(
                {
                  id: request.deliveryId,
                  planeKey: "neon",
                  tenantId: request.tenantId,
                  actorPrincipalId: request.actorPrincipalId,
                  eventCode: data.notification_event_code,
                  entityId: data.resource_id,
                  payload: data,
                },
                request.recipientPrincipalId,
              );
            },
          );
        },
      },
    });
  const activityPresentation = createActivityPresentation(
    async (context, coordinate) => {
      try {
        let threadRootId: string | undefined;
        if (coordinate.commentId) {
          await capabilityPolicy.resolve({
            context,
            entityCode: coordinate.entityCode,
            recordId: coordinate.recordId,
            kind: "comments",
            action: "read",
            input: { commentId: coordinate.commentId },
          });
          threadRootId = await exactTransactions.run(
            context.planeKey,
            { tenantId: context.tenantId, principalId: context.principalId },
            async (tx) =>
              (
                await sql<{
                  id: string;
                }>`WITH RECURSIVE parents AS (SELECT id,parent_comment_id,0 depth FROM document.comment WHERE tenant_id=${context.tenantId}::uuid AND id=${coordinate.commentId}::uuid UNION ALL SELECT c.id,c.parent_comment_id,p.depth+1 FROM document.comment c JOIN parents p ON c.id=p.parent_comment_id WHERE c.tenant_id=${context.tenantId}::uuid AND p.depth<32) SELECT id::text FROM parents WHERE parent_comment_id IS NULL LIMIT 1`.execute(
                  tx,
                )
              ).rows[0]?.id,
          );
        }
        const descriptor = await metadata.getEntityDescriptor(
          context,
          coordinate.entityCode,
        );
        if (!descriptor?.detailRouteTemplate) return undefined;
        const record = await container.services.records?.queries.get({
          context,
          entityCode: coordinate.entityCode,
          recordId: coordinate.recordId,
        });
        if (!record?.data) return undefined;
        const label =
          (descriptor.recordPresentation
            ? record.data[descriptor.recordPresentation.titleField]
            : undefined) ??
          record.data.name ??
          record.data.display_name ??
          record.data.code;
        const recordHref = descriptor.detailRouteTemplate.replace(
          ":recordId",
          encodeURIComponent(coordinate.recordId),
        );
        const href = threadRootId
          ? `${recordHref}${recordHref.includes("?") ? "&" : "?"}threadRootId=${encodeURIComponent(threadRootId)}`
          : recordHref;
        return {
          href,
          recordLabel: [
            coordinate.entityCode.replaceAll("_", " "),
            typeof label === "string" ? label : undefined,
          ]
            .filter(Boolean)
            .join(" · "),
          actionLabel: "View record",
        };
      } catch (error) {
        const status =
          error && typeof error === "object"
            ? "statusCode" in error
              ? error.statusCode
              : "status" in error
                ? error.status
                : undefined
            : undefined;
        if (status === 403 || status === 404) return undefined;
        throw error;
      }
    },
  );
  const collaborationNotificationPolicy = createCollaborationNotificationPolicy(
    {
      fallback: dependencies.notificationPolicy ?? {
        async prepare() {
          return null;
        },
        async authorizeRecipient() {
          return false;
        },
      },
      authorize: authorizeNotificationRecipient,
      async recordHref(source) {
        const context = await notificationRecipientContext(
          source,
          source.actorPrincipalId,
        );
        if (!context) return undefined;
        const descriptor = await metadata.getEntityDescriptor(
          context,
          String(source.payload.entity_type),
        );
        const path = descriptor?.detailRouteTemplate?.replace(
          ":recordId",
          encodeURIComponent(String(source.payload.entity_id)),
        );
        return path?.startsWith("/") &&
          !path.startsWith("//") &&
          !path.includes("\\")
          ? path
          : undefined;
      },
    },
  );
  const notificationPlanner = createNotificationPlanner({
    entityRoute: (source, tx) =>
      resolveEntityNotificationRoute(source, (entityCode) =>
        readPublishedNotificationConfiguration(tx, source.tenantId, entityCode),
      ),
    policy: collaborationNotificationPolicy,
    transactions: exactTransactions,
    consent: consent ?? denyAllConsent,
  });
  const durableDelivery = createDurableNotificationDeliveryRepository({
    transactions,
  });
  const outboxPlanning = createKyselyNotificationOutboxRepository({
    transactions,
  });
  const webhookDelivery = createKyselyWebhookDeliveryRepository({
    transactions,
  });
  const notificationWork =
    createKyselyNotificationWorkCatalog(metadataDatabases);
  const workflowSlaTenants =
    createKyselyWorkflowSlaTenantCatalog(metadataDatabases);
  container.runtimes.jobDefinitions.push({
    code: DISCOVER_NOTIFICATION_WORK_JOB,
    owner: "@athyper/server-platform-notifications",
    queue: NOTIFICATION_MAINTENANCE_QUEUE,
    name: DISCOVER_NOTIFICATION_WORK_JOB,
    scope: "plane",
    payloadSchema: { name: DISCOVER_NOTIFICATION_WORK_JOB, version: 1 },
    timeoutMs: 60_000,
    maxAttempts: 3,
    executionRetentionDays: 30,
  });
  container.runtimes.jobDefinitions.push({
    code: DISCOVER_WORKFLOW_SLA_JOB,
    owner: "@athyper/server-platform-workflow",
    queue: WORKFLOW_MAINTENANCE_QUEUE,
    name: DISCOVER_WORKFLOW_SLA_JOB,
    scope: "plane",
    payloadSchema: { name: DISCOVER_WORKFLOW_SLA_JOB, version: 1 },
    timeoutMs: 60_000,
    maxAttempts: 3,
    executionRetentionDays: 30,
  });
  container.runtimes.jobDefinitions.push({
    code: SWEEP_WORKFLOW_SLA_JOB,
    owner: "@athyper/server-platform-workflow",
    queue: WORKFLOW_MAINTENANCE_QUEUE,
    name: SWEEP_WORKFLOW_SLA_JOB,
    scope: "tenant",
    payloadSchema: { name: SWEEP_WORKFLOW_SLA_JOB, version: 1 },
    timeoutMs: 120_000,
    maxAttempts: 5,
    executionRetentionDays: 90,
  });
  if (container.runtimes.jobs) {
    const jobs = container.runtimes.jobs;
    if (container.runtimes.jobTransactions) {
      container.services.jobs = createJobAdministrationService({
        store: createKyselyJobAdministrationStore(
          container.runtimes.jobTransactions,
        ),
        transport: jobs,
        publisher: jobs,
      });
      const jobAdministration = container.services.jobs;
      const governanceStore = createKyselyJobGovernanceStore(
        container.runtimes.jobTransactions,
      );
      container.platform.httpRegistrars.push((application) => {
        // Registration has finished when HTTP registrars run; include late handlers.
        const jobGovernance = createJobGovernanceService({
          store: governanceStore,
          catalog: createJobDefinitionCatalog(
            container.runtimes.jobDefinitions,
          ),
        });
        registerJobAdministrationRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          authorizer,
          jobs: jobAdministration,
          governance: jobGovernance,
        });
      });
    }
    jobs.register(
      NOTIFICATION_QUEUE,
      DISPATCH_NOTIFICATION_JOB,
      createNotificationDispatchHandler(notifications),
    );
    jobs.register(
      NOTIFICATION_MAINTENANCE_QUEUE,
      PLAN_NOTIFICATION_OUTBOX_JOB,
      createNotificationOutboxSweepHandler({
        repository: outboxPlanning,
        planner: notificationPlanner,
      }),
    );
    jobs.register(
      NOTIFICATION_MAINTENANCE_QUEUE,
      DELIVERY_SWEEP_JOB,
      createDeliverySweepHandler({
        authorizeDelivery: createEntityNotificationDeliveryGuard({
          transactions: exactTransactions,
          consent: consent ?? denyAllConsent,
          policy: collaborationNotificationPolicy,
          route: (source, tx) =>
            resolveEntityNotificationRoute(source, (entityCode) =>
              readPublishedNotificationConfiguration(
                tx,
                source.tenantId,
                entityCode,
              ),
            ),
          fallback: async () => ({
            allowed: false,
            reason: "NOTIFICATION_ROUTE_UNAVAILABLE",
          }),
        }),
        repository: durableDelivery,
        handlers: notificationHandlers,
        events: notificationEvents,
        ...(notificationAttachmentResolver
          ? { attachments: notificationAttachmentResolver }
          : {}),
      }),
    );
    jobs.register(
      NOTIFICATION_MAINTENANCE_QUEUE,
      FLUSH_NOTIFICATION_DIGEST_JOB,
      createNotificationDigestHandler({ transactions }),
    );
    jobs.register(
      NOTIFICATION_MAINTENANCE_QUEUE,
      DISCOVER_NOTIFICATION_WORK_JOB,
      createNotificationDiscoveryHandler({ catalog: notificationWork, jobs }),
    );
    jobs.register(
      NOTIFICATION_MAINTENANCE_QUEUE,
      WEBHOOK_SWEEP_JOB,
      createWebhookSweepHandler({ catalog: notificationWork, jobs }),
    );
    jobs.register(
      WEBHOOK_DELIVERY_QUEUE,
      WEBHOOK_DELIVERY_JOB,
      createWebhookDeliveryHandler({ repository: webhookDelivery }),
    );
  }
  if (
    container.runtimes.jobs &&
    objectStorageTransfers &&
    Object.keys(metadataDatabases).length
  ) {
    const maintenanceMetrics = container.adapters.processMetrics;
    container.runtimes.jobs.register(
      RECORD_TRANSFER_MAINTENANCE_QUEUE,
      MAINTAIN_RECORD_TRANSFERS_JOB,
      createRecordTransferMaintenanceHandler({
        databases: metadataDatabases,
        storage: objectStorageTransfers,
        ...(maintenanceMetrics ? { metrics: maintenanceMetrics } : {}),
      }),
    );
    container.runtimes.jobDefinitions.push({
      code: MAINTAIN_RECORD_TRANSFERS_JOB,
      owner: "@athyper/server-service-records",
      queue: RECORD_TRANSFER_MAINTENANCE_QUEUE,
      name: MAINTAIN_RECORD_TRANSFERS_JOB,
      scope: "plane",
      payloadSchema: { name: MAINTAIN_RECORD_TRANSFERS_JOB, version: 1 },
      timeoutMs: 300_000,
      maxAttempts: 5,
      executionRetentionDays: 30,
    });
    if (container.runtimes.scheduler)
      for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[])
        container.runtimes.scheduledJobs.push({
          scheduleId: `record-transfer-maintenance-${planeKey}`,
          queue: RECORD_TRANSFER_MAINTENANCE_QUEUE,
          name: MAINTAIN_RECORD_TRANSFERS_JOB,
          data: { planeKey, limit: 500, stuckAfterMinutes: 15 },
          pattern: { kind: "interval", everyMs: 900_000 },
          options: {
            jobId: `records:transfer:maintenance:${planeKey}`,
            maxAttempts: 5,
            payloadSchema: { name: MAINTAIN_RECORD_TRANSFERS_JOB, version: 1 },
            execution: {
              planeKey,
              scope: "plane",
              principalId: "record-transfer-maintenance",
            },
          },
        });
  }
  if (container.runtimes.jobs && Object.keys(metadataDatabases).length) {
    const name = "references.history.expire",
      queue = "references.history.maintenance";
    container.runtimes.jobs.register(queue, name, {
      async handle(job) {
        const planeKey = (job.data as { planeKey?: PlaneKey }).planeKey;
        if (
          !planeKey ||
          !["neon", "studio", "mesh"].includes(planeKey) ||
          !metadataDatabases[planeKey]
        )
          return { status: "discarded", reason: "plane_database_unavailable" };
        const result = await sql<{
          removed: string | number;
        }>`SELECT master.purge_expired_reference_choices(5000) AS removed`.execute(
          metadataDatabases[planeKey]!,
        );
        return {
          status: "completed",
          output: { removed: Number(result.rows[0]?.removed ?? 0) },
        };
      },
    });
    container.runtimes.jobDefinitions.push({
      code: name,
      owner: "@athyper/server-platform-preferences",
      queue,
      name,
      scope: "plane",
      payloadSchema: { name, version: 1 },
      timeoutMs: 60000,
      maxAttempts: 3,
      executionRetentionDays: 7,
    });
    if (container.runtimes.scheduler)
      for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[])
        container.runtimes.scheduledJobs.push({
          scheduleId: `reference-history-expiry-${planeKey}`,
          queue,
          name,
          data: { planeKey },
          pattern: { kind: "interval", everyMs: 300000 },
          options: {
            jobId: `references:history:expire:${planeKey}`,
            maxAttempts: 3,
            payloadSchema: { name, version: 1 },
            execution: {
              planeKey,
              scope: "plane",
              principalId: "reference-history-maintenance",
            },
          },
        });
  }
  if (container.runtimes.scheduler) {
    const scheduler = container.runtimes.scheduler;
    let reconciler: ReturnType<typeof createJobScheduleReconciler> | undefined;
    container.runtimes.scheduleReconcile = () => {
      // Resolve the same complete catalog used by API validation after composition.
      reconciler ??= createJobScheduleReconciler({
        planes: Object.keys(metadataDatabases) as PlaneKey[],
        repository: createKyselyJobScheduleRepository(metadataDatabases),
        scheduler,
        catalog: createJobDefinitionCatalog(container.runtimes.jobDefinitions),
        ignoreUnknownHandlers: true,
        onRejected: (code, reason) =>
          console.warn(
            `[scheduler] schedule_rejected code=${code} reason=${reason}`,
          ),
      });
      return reconciler.reconcile();
    };
  }
  container.platform.httpRegistrars.push((application) => {
    application.get(
      "/api/collections/:collectionKey/configuration",
      createIamAuthenticationMiddleware(iam),
      async (req, res, next) => {
        try {
          const context = readVerifiedRequestContext(res),
            key = String(req.params.collectionKey);
          if (!["activity.notifications", "activity.inbox"].includes(key)) {
            res.status(404).json({ code: "COLLECTION_NOT_FOUND" });
            return;
          }
          const plane = context.planeKey;
          if (plane !== "neon" && plane !== "mesh" && plane !== "studio")
            throw new HttpError(
              403,
              "COLLECTION_PLANE_FORBIDDEN",
              "Application plane required",
            );
          const value = await exactTransactions.run(plane, context, (tx) =>
            readPublishedCollectionConfiguration(
              tx as unknown as Kysely<Record<string, never>>,
              context.tenantId,
              plane,
              key,
            ),
          );
          res.setHeader("Cache-Control", "private, no-store");
          res
            .status(value ? 200 : 404)
            .json(value ?? { code: "COLLECTION_CONFIGURATION_NOT_PUBLISHED" });
        } catch (error) {
          next(error);
        }
      },
    );
  });
  container.platform.httpRegistrars.push((application) =>
    registerNotificationRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      inbox: notificationRepositories,
      validateActivityQuery: (context, query, limit) =>
        validateActivityCollection(context, "notifications", query, limit),
      presentInbox: activityPresentation.notifications,
      push: notificationRepositories,
      webPushPublicKey: config?.webPush.publicKey,
      webPushAvailable: container.adapters.pushTransports.some((transport) =>
        transport.platforms.includes("web"),
      ),
      events: notificationEvents,
      preferences: notificationPreferences,
      ...(consent
        ? {
            recordEmailConsent: async (
              context: VerifiedRequestContext,
              consented: boolean,
            ) => {
              const destination = await transactions.run(
                context.planeKey,
                context,
                async (tx) =>
                  (
                    await sql<{
                      value: string;
                    }>`SELECT link.value FROM master.contact_link link JOIN control.owner_type owner ON owner.id=link.owner_type_id WHERE link.tenant_id=${context.tenantId}::uuid AND link.owner_id=${context.principalId}::uuid AND owner.code='principal' AND link.status='active' AND link.effective_from<=now() AND (link.effective_until IS NULL OR link.effective_until>now()) AND link.channel_type='email' ORDER BY link.is_verified DESC,link.is_primary DESC,link.created_at LIMIT 1`.execute(
                      tx,
                    )
                  ).rows[0]?.value,
              );
              if (!destination)
                throw new HttpError(
                  409,
                  "NOTIFICATION_EMAIL_UNAVAILABLE",
                  "No current email contact is available",
                );
              return consent.record({
                context,
                subjectType: "principal",
                subjectId: context.principalId,
                channel: "email",
                destination,
                consented,
                sourceCode: "notification_preferences",
                evidence: { selfService: true },
              });
            },
          }
        : {}),
      operations: notificationOperations,
    }),
  );
  const policyRepository =
    dependencies.policyRepository ??
    (Object.keys(metadataDatabases).length > 0
      ? createCachedPolicyRepository({
          repository: createKyselyPolicyRepository(),
        })
      : undefined);
  const policy = policyRepository
    ? createPolicyService({ repository: policyRepository, transactions, audit })
    : undefined;
  if (policy) {
    container.platform.policy = policy;
    container.platform.httpRegistrars.push((application) =>
      registerPolicyRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer,
        policy,
      }),
    );
  }
  if (dependencies.repository || Object.keys(recordDatabases).length > 0) {
    const repository =
      dependencies.repository ??
      createKyselyRecordRepository({
        databases: recordDatabases,
        scopeCompilers: registeredRecordScopeSqlCompilers,
      });
    const outbox = dependencies.outbox ?? createDatabaseOutboxWriter("records");
    const commandExecutions =
      dependencies.commandExecutions ?? createKyselyCommandExecutionStore();
    const common = {
      ownerAccess: createRecordOwnerAccessAdapter(authorizer),
      metadata,
      authorizer,
      audit,
      outbox,
      commandExecutions,
      repository,
      transactions,
    };
    const listMetadata = createStudioCatalogMetadataReader(metadata);
    const existingCollectionScopes = container.platform.experience
      ? combineRecordCollectionScopeResolvers(
          createNeonRecordCollectionScopeResolver(
            container.platform.experience.service,
          ),
          createMeshRecordCollectionScopeResolver(
            container.platform.experience.service,
          ),
          createStudioRecordCollectionScopeResolver(),
        )
      : undefined;
    if (dependencies.entityLiveReadEvidence && dependencies.localEntityLiveRead)
      throw Error("ENTITY_LIVE_READ_COMPOSITION_CONFLICT");
    const liveReadEvidence = dependencies.localEntityLiveRead
      ? createLocalEntityLiveReadEvidence(dependencies.localEntityLiveRead)
      : dependencies.entityLiveReadEvidence;
    const entityServices = capabilityRegistration.register(
      "entity.persistence",
      () =>
        createEntityServices({
          admitDescriptor,
          liveReadEvidence,
          common,
          listMetadata,
          reader: container.platform.compiledEntityReader!,
          fallbackCollectionScopes: existingCollectionScopes,
          presentation: {
            collaboration: (input) => entityCollaboration.describe(input),
            activity: async (input) =>
              Boolean(await entityActivity.describe(input)),
            summary: async (input) => publishedSummaries?.describe(input),
            ...createEntityPresentationChoiceResolvers(metadataDatabases),
          },
          bookmarkCache: container.adapters.redisCache,
          activityRegistrations,
          historyAdapters,
          activityDomainHandlers,
          mutationPolicies: new Map([
            [
              "platform.experience.ui_profile.v1",
              createUiProfileMutationPolicy(),
            ],
            [
              "platform.notifications.preferences.v1",
              createNotificationPreferenceRecordPolicy(),
            ],
          ]),
          snapshotsEnabled: config?.wave0.recordSnapshotRoutesEnabled,
        }),
    );
    const { queries, lists, mutations, snapshots, collectionScopes } =
      entityServices;
    installedReadQueries = queries;
    installedRecordMutations = mutations;
    ({
      readPublishedParent,
      readPublishedHeader,
      activityProvider,
      recordHistory,
      activityDomainActions,
    } = entityServices);
    const transferRuntime = createEntityTransferRuntime({
      metadata: listMetadata,
      authorizer,
      audit,
      outbox,
      transactions,
      collectionScopes,
      queries,
      jobs: container.runtimes.jobs,
      storage: objectStorageTransfers,
      scanner: dependencies.malwareScanner ?? container.adapters.malwareScanner,
      adapters: new GovernedImportAdapterRegistry([
        createMeshRelationshipRequestImportAdapter(),
        createStudioMetadataDraftImportAdapter(),
      ]),
      metrics: container.adapters.processMetrics,
    });
    const transfers = transferRuntime?.transfers;
    installedTransfers = transfers;
    container.services.records = {
      surfaces: lists,
      lists,
      queries,
      mutations,
      ...(snapshots ? { snapshots } : {}),
      ...(transfers ? { transfers } : {}),
    };
    const entityHttp = createEntityHttpRegistrars({
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      services: entityServices,
      savedViews,
      referenceHistory: createReferenceHistoryStore(transactions),
      referenceDirectory: (context) => {
        const database = metadataDatabases[context.planeKey];
        if (!database) throw Error("REFERENCE_LOOKUP_DATABASE_UNAVAILABLE");
        return createSharedReferenceDirectory(database);
      },
      authorizer,
      activity: entityActivity,
    });
    container.platform.httpRegistrars.push(entityHttp.activity);
    if (!config || config.mode === "api")
      container.platform.httpRegistrars.push(entityHttp.read);
    if (transferRuntime) {
      container.platform.httpRegistrars.push((application) =>
        transferRuntime.registerHttp(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          publicApiEnabled: config?.wave0.recordTransferPublicApiEnabled,
        }),
      );
      transferRuntime.registerJobs((...definitions) =>
        container.runtimes.jobDefinitions.push(...definitions),
      );
    }
    container.platform.httpRegistrars.push(entityHttp.records);
  }

  if (
    dependencies.workflowRepository ||
    Object.keys(metadataDatabases).length > 0
  ) {
    const repository =
      dependencies.workflowRepository ?? createKyselyWorkflowRepository();
    const workflow = createWorkflowService({
      metadata,
      authorizer,
      audit,
      outbox: dependencies.outbox ?? createDatabaseOutboxWriter("workflow"),
      commandExecutions:
        dependencies.workflowCommandExecutions ??
        createKyselyCommandExecutionStore<
          import("@athyper/server-contract-workflow").WorkItemActionResult
        >(),
      repository,
      transactions,
      ...(policy ? { policy } : {}),
    });
    const workflowSla = createWorkflowSlaAutomation({
      repository: createKyselySlaAutomationRepository(),
      transactions,
      delegations: createKyselyWorkflowDelegationResolver(),
    });
    if (container.runtimes.jobs) {
      container.runtimes.jobs.register(
        WORKFLOW_MAINTENANCE_QUEUE,
        DISCOVER_WORKFLOW_SLA_JOB,
        createWorkflowSlaDiscoveryHandler({
          catalog: workflowSlaTenants,
          jobs: container.runtimes.jobs,
        }),
      );
      container.runtimes.jobs.register(
        WORKFLOW_MAINTENANCE_QUEUE,
        SWEEP_WORKFLOW_SLA_JOB,
        createWorkflowSlaSweepHandler({
          async sweep(scope) {
            if (scope.principalId !== SYSTEM_PRINCIPAL_ID)
              return workflowSla.sweep(scope);
            // Discovery uses the global scheduler identity; tenant writes require
            // the same tenant-local maintenance identity used by notifications.
            const principalId = await transactions.run(
              scope.planeKey,
              scope,
              async (tx) =>
                (
                  await sql<{
                    id: string;
                  }>`SELECT event.fn_notification_worker_principal(${scope.tenantId}::uuid) id`.execute(
                    tx,
                  )
                ).rows[0]?.id,
            );
            if (!principalId)
              throw Error("WORKFLOW_MAINTENANCE_PRINCIPAL_UNAVAILABLE");
            return workflowSla.sweep({ ...scope, principalId });
          },
        }),
      );
    }
    container.services.workflow = workflow;
    container.platform.httpRegistrars.push((application) =>
      registerWorkflowRoutes(application, {
        validateActivityQuery: (context, query, limit) =>
          validateActivityCollection(context, "inbox", query, limit),
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        workflow,
        presentInbox: activityPresentation.inbox,
      }),
    );
  }
  const documentRenderer =
    dependencies.documentRenderer ??
    (container.adapters.pdfRenderer
      ? createRenderingService(container.adapters.pdfRenderer)
      : undefined);
  const objectStorageBucket =
    dependencies.objectStorageDocumentsBucket ??
    container.adapters.objectStorageDocumentsBucket;
  const malwareScanner =
    dependencies.malwareScanner ?? container.adapters.malwareScanner;
  const contentExtractor =
    dependencies.contentExtractor ?? container.adapters.contentExtractor;
  const searchIndex =
    dependencies.searchIndex ?? container.adapters.searchIndex;
  let extractionScheduler = dependencies.extractionScheduler;
  if (container.runtimes.jobs && contentExtractor && objectStorage) {
    const processing = createDocumentProcessingHandler({
      repository:
        dependencies.documentProcessingRepository ??
        createKyselyDocumentProcessingRepository(),
      transactions,
      storage: objectStorage,
      extractor: contentExtractor,
      searchIndex,
      maxExtractBytes: config?.contentExtraction.maxInputBytes,
    });
    container.runtimes.jobs.register(
      DOCUMENT_PROCESSING_QUEUE,
      EXTRACT_AND_INDEX_JOB,
      processing,
    );
    extractionScheduler ??= createDocumentExtractionScheduler(
      container.runtimes.jobs,
      config?.contentExtraction.timeoutMs ?? 120_000,
    );
    qualifyAttachmentExtraction = async () => {
      // Alphanumeric sentinel survives parser text/markup normalization (some
      // providers escape underscores even in their text response).
      const marker = "ATHYPERCONTENTQUALIFICATION";
      const result = await contentExtractor.extract({
        content: new TextEncoder().encode(marker),
        contentType: "text/plain",
        fileName: "qualification.txt",
        signal: AbortSignal.timeout(30000),
      });
      if (!result.text.includes(marker))
        throw Error("PUBLICATION_CAPABILITY_EXTRACTION_PROBE_FAILED");
    };
  }
  if (searchIndex) {
    const search = createDocumentSearchService({
      authorizer,
      index: searchIndex,
      authorizeHit: async (context, hit) => {
        if (!hit.attachmentId) return false;
        const live = await transactions.run(
          context.planeKey,
          context,
          async (tx) =>
            (
              await sql`
          SELECT 1 FROM document.attachment_link l JOIN document.attachment_series s ON s.tenant_id=l.tenant_id AND s.id=l.attachment_series_id
          JOIN document.attachment a ON a.tenant_id=s.tenant_id AND a.id=coalesce(l.pinned_attachment_id,s.current_attachment_id)
          WHERE l.tenant_id=${context.tenantId}::uuid AND l.entity_type=${hit.entityType} AND l.entity_id=${hit.entityId}
          AND a.id=${hit.attachmentId}::uuid AND a.status='active' AND a.is_active AND a.is_virus_scanned LIMIT 1`.execute(
                tx,
              )
            ).rows.length > 0,
        );
        if (!live) return false;
        try {
          return Boolean(
            await authorizeAttachmentCapability(context, "download", {
              attachmentId: hit.attachmentId,
            }),
          );
        } catch {
          return false;
        }
      },
    });
    container.platform.search = search;
    container.platform.httpRegistrars.push((application) =>
      registerDocumentSearchRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        search,
      }),
    );
  }
  if (Object.keys(metadataDatabases).length > 0) {
    const content = createContentServices({
      transactions,
      repository: createKyselyContentRepository(),
      aclRepository: createKyselyContentAclRepository(),
      quotaLedger: createKyselyContentQuotaLedger(),
      subjects: createKyselyContentSubjectResolver(transactions),
      authorizer,
      ...(searchIndex ? { searchIndex } : {}),
    });
    const resources = createContentResourceService({
      transactions,
      repository: createKyselyContentResourceRepository(),
      content,
    });
    container.services.content = content;
    container.platform.httpRegistrars.push((application) =>
      registerContentRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        content,
        resources,
      }),
    );
  }
  if (
    objectStorage &&
    objectStorageBucket &&
    malwareScanner &&
    Object.keys(metadataDatabases).length > 0
  ) {
    const quotaPolicies = createConfiguredAttachmentQuotaPolicyResolver({
      limitBytes: config?.objectStorage.tenantQuotaGb
        ? config.objectStorage.tenantQuotaGb * 1024 * 1024 * 1024
        : 10 * 1024 * 1024 * 1024,
      limitItems: config?.objectStorage.tenantQuotaItems ?? 50_000,
      reservationTtlSeconds: config?.objectStorage.quotaReservationTtlSeconds,
      retryAfterSeconds: config?.objectStorage.quotaRetryAfterSeconds,
    });
    const attachmentRepository =
        createKyselyAttachmentRepository(objectStorageBucket),
      quota = createKyselyAttachmentQuotaLedger();
    const derivativeScheduler =
      container.runtimes.jobs && container.adapters.previewRenderer
        ? createDerivativeScheduler(container.runtimes.jobs)
        : undefined;
    if (container.runtimes.jobs && container.adapters.previewRenderer) {
      container.runtimes.jobs.register(
        DOCUMENT_DERIVATIVES_QUEUE,
        RENDER_DERIVATIVE_JOB,
        createDerivativeRenderHandler({
          repository: createKyselyDerivativeRepository(),
          sourceRepository: createKyselyDerivativeSourceRepository(),
          transactions,
          storage: objectStorage,
          renderer: container.adapters.previewRenderer,
          scanner: malwareScanner,
        }),
      );
      container.runtimes.jobDefinitions.push({
        code: RENDER_DERIVATIVE_JOB,
        owner: "@athyper/server-service-document-derivatives",
        queue: DOCUMENT_DERIVATIVES_QUEUE,
        name: RENDER_DERIVATIVE_JOB,
        scope: "tenant",
        payloadSchema: { name: RENDER_DERIVATIVE_JOB, version: 1 },
        timeoutMs: 120_000,
        maxAttempts: 5,
        executionRetentionDays: 30,
      });
    }
    if (container.runtimes.jobs) {
      container.runtimes.jobs.register(
        DERIVATIVE_SCAN_BACKFILL_QUEUE,
        DERIVATIVE_SCAN_BACKFILL_JOB,
        createDerivativeScanBackfillHandler({
          repository: createKyselyDerivativeScanBackfillRepository(),
          transactions,
          storage: objectStorage,
          scanner: malwareScanner,
        }),
      );
      container.runtimes.jobDefinitions.push({
        code: DERIVATIVE_SCAN_BACKFILL_JOB,
        owner: "@athyper/server-service-document-derivatives",
        queue: DERIVATIVE_SCAN_BACKFILL_QUEUE,
        name: DERIVATIVE_SCAN_BACKFILL_JOB,
        scope: "tenant",
        payloadSchema: { name: DERIVATIVE_SCAN_BACKFILL_JOB, version: 1 },
        timeoutMs: 24 * 60 * 60 * 1_000,
        maxAttempts: 3,
        executionRetentionDays: 30,
      });
    }
    if (container.runtimes.jobs && searchIndex) {
      container.runtimes.jobs.register(
        "documents.search-removal",
        "documents.search-remove",
        {
          async handle(job) {
            const value = job.data as {
              planeKey: string;
              tenantId: string;
              attachmentId: string;
            };
            if (
              !["neon", "studio", "mesh"].includes(value.planeKey) ||
              !/^[0-9a-f-]{36}$/i.test(value.tenantId) ||
              !/^[0-9a-f-]{36}$/i.test(value.attachmentId)
            )
              throw new Error("Invalid search removal scope");
            await searchIndex.remove(
              `${value.planeKey}:${value.tenantId}:${value.attachmentId}`,
            );
            return { status: "completed" };
          },
        },
      );
      container.runtimes.jobDefinitions.push({
        code: "documents.search-remove",
        owner: "@athyper/server-service-attachments",
        queue: "documents.search-removal",
        name: "documents.search-remove",
        scope: "tenant",
        payloadSchema: { name: "documents.search-remove", version: 1 },
        timeoutMs: 30000,
        maxAttempts: 10,
        executionRetentionDays: 30,
      });
    }
    const attachments = createAttachmentLifecycle({
      transactions,
      repository: attachmentRepository,
      storage: objectStorage,
      scanner: malwareScanner,
      quota,
      quotaPolicies,
      outbox: createDatabaseOutboxWriter("attachments"),
      commandExecutions: createKyselyCommandExecutionStore(),
      scheduler: {
        scheduleSearchRemoval: async (identity) => {
          if (!container.runtimes.jobs || !searchIndex) return;
          await container.runtimes.jobs.enqueue(
            "documents.search-removal",
            "documents.search-remove",
            identity,
            {
              execution: {
                planeKey: identity.planeKey,
                scope: "tenant",
                tenantId: identity.tenantId,
                principalId: identity.principalId,
              },
              payloadSchema: { name: "documents.search-remove", version: 1 },
              timeoutMs: 30000,
              maxAttempts: 10,
              backoff: { kind: "exponential", delayMs: 1000 },
              removeOnComplete: 1000,
              removeOnFail: 5000,
            },
          );
        },
        scheduleExtraction: async (identity) => {
          await extractionScheduler?.schedule({ ...identity });
        },
        scheduleDerivatives: async (request, options) => {
          await derivativeScheduler?.schedule({
            ...request,
            ...(options?.rebuild ? { rebuild: options.rebuild } : {}),
          });
        },
        schedulePurge: async (identity, options) => {
          if (!container.runtimes.jobs) return;
          await container.runtimes.jobs.enqueue(
            ATTACHMENT_MAINTENANCE_QUEUE,
            PURGE_ATTACHMENT_JOB,
            identity,
            {
              jobId: options?.jobId,
              maxAttempts: 5,
              backoff: { kind: "exponential", delayMs: 5_000, jitter: 0.2 },
              execution: {
                planeKey: identity.planeKey,
                scope: "tenant",
                tenantId: identity.tenantId,
                principalId: identity.principalId,
              },
              payloadSchema: { name: PURGE_ATTACHMENT_JOB, version: 1 },
              // Deferred purges must be enqueueable again after a hold/retention expires.
              removeOnComplete: true,
              removeOnFail: 5_000,
            },
          );
        },
        scheduleStageExpiry: async (identity, options) => {
          if (!container.runtimes.jobs) return;
          await container.runtimes.jobs.enqueue(
            ATTACHMENT_MAINTENANCE_QUEUE,
            EXPIRE_STAGED_ATTACHMENT_JOB,
            identity,
            {
              jobId: options.jobId,
              delayMs: options.delayMs,
              maxAttempts: 5,
              backoff: { kind: "exponential", delayMs: 5_000, jitter: 0.2 },
              execution: {
                planeKey: identity.planeKey,
                scope: "tenant",
                tenantId: identity.tenantId,
                principalId: identity.principalId,
              },
              payloadSchema: { name: EXPIRE_STAGED_ATTACHMENT_JOB, version: 1 },
              removeOnComplete: 1_000,
              removeOnFail: 5_000,
            },
          );
        },
      },
      ...(config?.objectStorage.scanStreamTimeoutMs !== undefined
        ? { scanStreamTimeoutMs: config.objectStorage.scanStreamTimeoutMs }
        : {}),
    });
    lifecycle?.onShutdown(() => attachments.close());
    container.services.attachments = attachments;
    attachmentDiscovery = createAttachmentDiscoveryService({
      authorizeCapability: authorizeAttachmentCapability,
      transactions,
      storage: objectStorage,
      ...(derivativeScheduler
        ? { schedule: (input) => derivativeScheduler.schedule(input) }
        : {}),
      ...(extractionScheduler
        ? { extract: (input) => extractionScheduler.schedule(input) }
        : {}),
    });
    if (derivativeScheduler && container.adapters.previewRenderer) {
      const renderer = container.adapters.previewRenderer;
      qualifyAttachmentPreview = () => qualifyPreviewRenderer(renderer);
    }
    container.platform.httpRegistrars.push((application) =>
      registerAttachmentDiscoveryRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: attachmentDiscovery!,
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerAttachmentRoutes(application, {
        authorizeCapability: authorizeAttachmentCapability,
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer,
        attachments,
        ...(container.services.content
          ? { contentAcl: container.services.content.acl }
          : {}),
        maxUploadBytes: Math.max(
          1,
          Math.floor((config?.objectStorage.maxUploadMb ?? 25) * 1024 * 1024),
        ),
      }),
    );
    if (container.runtimes.jobs) {
      container.runtimes.jobs.register(
        ATTACHMENT_MAINTENANCE_QUEUE,
        EXPIRE_STAGED_ATTACHMENT_JOB,
        createAttachmentStageExpiryHandler(attachments),
      );
      container.runtimes.jobs.register(
        ATTACHMENT_MAINTENANCE_QUEUE,
        PURGE_ATTACHMENT_JOB,
        createAttachmentPurgeHandler(attachments),
      );
      container.runtimes.jobs.register(
        ATTACHMENT_MAINTENANCE_QUEUE,
        EXPIRE_ATTACHMENT_RESERVATIONS_JOB,
        createAttachmentQuotaRecoveryHandler({
          transactions,
          quota,
          attachments: attachmentRepository,
        }),
      );
      container.runtimes.jobs.register(
        ATTACHMENT_MAINTENANCE_QUEUE,
        RECONCILE_ATTACHMENT_RETENTION_JOB,
        createAttachmentRetentionReconciliationHandler({
          claim: async ({ planeKey, batchSize }) => {
            const database = metadataDatabases[planeKey];
            if (!database) return [];
            const limit = Math.min(500, Math.max(1, batchSize ?? 100));
            return database.transaction().execute(async (tx) => {
              const expiredDraftAttachments = await expireCommentDrafts(tx);
              for (const item of expiredDraftAttachments)
                await createDatabaseOutboxWriter("collaboration").append(
                  {
                    tenantId: item.tenantId,
                    topic: "attachments.lifecycle",
                    eventType: "attachments.orphaned",
                    eventKey: `draft-expiry:${item.attachmentId}`,
                    entityType: "document.attachment",
                    entityId: item.attachmentId,
                    aggregateType: "document.attachment",
                    aggregateId: item.attachmentId,
                    actorId: item.principalId,
                    payload: { ...item, planeKey, reason: "draft_expired" },
                  },
                  tx,
                );
              const result = await sql<{
                tenant_id: string;
                id: string;
              }>`SELECT attachment.tenant_id::text,attachment.id::text FROM document.attachment attachment WHERE attachment.status IN('expired','deleted','orphaned') AND attachment.storage_key<>'purged/'||attachment.id::text AND NOT EXISTS(SELECT 1 FROM document.attachment_link link WHERE link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id) AND NOT EXISTS(SELECT 1 FROM document.attachment_series series WHERE series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id AND series.retention_until>clock_timestamp()) AND COALESCE(attachment.retention_until,'-infinity'::timestamptz)<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) ORDER BY attachment.status_changed_at NULLS LAST,attachment.created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED`.execute(
                tx,
              );
              return result.rows.map((row) => ({
                planeKey,
                tenantId: row.tenant_id,
                principalId: SYSTEM_PRINCIPAL_ID,
                attachmentId: row.id,
              }));
            });
          },
          schedulePurge: async (identity) => {
            await container.runtimes.jobs!.enqueue(
              ATTACHMENT_MAINTENANCE_QUEUE,
              PURGE_ATTACHMENT_JOB,
              identity,
              {
                jobId: `attachment:${identity.attachmentId}:purge`,
                maxAttempts: 5,
                backoff: { kind: "exponential", delayMs: 5_000, jitter: 0.2 },
                execution: {
                  planeKey: identity.planeKey,
                  scope: "tenant",
                  tenantId: identity.tenantId,
                  principalId: identity.principalId,
                },
                payloadSchema: { name: PURGE_ATTACHMENT_JOB, version: 1 },
                removeOnComplete: true,
                removeOnFail: 5_000,
              },
            );
          },
        }),
      );
      container.runtimes.jobDefinitions.push({
        code: EXPIRE_STAGED_ATTACHMENT_JOB,
        owner: "@athyper/server-service-attachments",
        queue: ATTACHMENT_MAINTENANCE_QUEUE,
        name: EXPIRE_STAGED_ATTACHMENT_JOB,
        scope: "tenant",
        payloadSchema: { name: EXPIRE_STAGED_ATTACHMENT_JOB, version: 1 },
        timeoutMs: 60_000,
        maxAttempts: 5,
        executionRetentionDays: 30,
      });
      container.runtimes.jobDefinitions.push({
        code: PURGE_ATTACHMENT_JOB,
        owner: "@athyper/server-service-attachments",
        queue: ATTACHMENT_MAINTENANCE_QUEUE,
        name: PURGE_ATTACHMENT_JOB,
        scope: "tenant",
        payloadSchema: { name: PURGE_ATTACHMENT_JOB, version: 1 },
        timeoutMs: 60_000,
        maxAttempts: 5,
        executionRetentionDays: 30,
      });
      container.runtimes.jobDefinitions.push({
        code: EXPIRE_ATTACHMENT_RESERVATIONS_JOB,
        owner: "@athyper/server-service-attachments",
        queue: ATTACHMENT_MAINTENANCE_QUEUE,
        name: EXPIRE_ATTACHMENT_RESERVATIONS_JOB,
        scope: "tenant",
        payloadSchema: { name: EXPIRE_ATTACHMENT_RESERVATIONS_JOB, version: 1 },
        timeoutMs: 60_000,
        maxAttempts: 5,
        executionRetentionDays: 30,
      });
      container.runtimes.jobDefinitions.push({
        code: RECONCILE_ATTACHMENT_RETENTION_JOB,
        owner: "@athyper/server-service-attachments",
        queue: ATTACHMENT_MAINTENANCE_QUEUE,
        name: RECONCILE_ATTACHMENT_RETENTION_JOB,
        scope: "plane",
        payloadSchema: {
          name: RECONCILE_ATTACHMENT_RETENTION_JOB,
          version: 1,
        },
        timeoutMs: 60_000,
        maxAttempts: 3,
        executionRetentionDays: 30,
      });
      if (container.runtimes.scheduler)
        for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[])
          container.runtimes.scheduledJobs.push({
            scheduleId: `attachment-retention-reconciliation-${planeKey}`,
            queue: ATTACHMENT_MAINTENANCE_QUEUE,
            name: RECONCILE_ATTACHMENT_RETENTION_JOB,
            data: { planeKey, batchSize: 100 },
            pattern: { kind: "interval", everyMs: 5 * 60 * 1_000 },
            options: {
              jobId: `attachments:reconcile-retention:${planeKey}`,
              maxAttempts: 3,
              payloadSchema: {
                name: RECONCILE_ATTACHMENT_RETENTION_JOB,
                version: 1,
              },
              execution: {
                planeKey,
                scope: "plane",
                principalId: SYSTEM_PRINCIPAL_ID,
              },
            },
          });
    }
  }
  if (
    (dependencies.documentTemplateRepository ||
      Object.keys(metadataDatabases).length > 0) &&
    documentRenderer &&
    malwareScanner &&
    objectStorage &&
    objectStorageBucket
  ) {
    const documents = createDocumentService<RecordTransaction>({
      metadata,
      authorizer,
      audit,
      ...dependencies.documentBindings,
      outbox: dependencies.outbox ?? createDatabaseOutboxWriter("documents"),
      templates:
        dependencies.documentTemplateRepository ??
        createKyselyDocumentTemplateRepository(),
      artifacts:
        dependencies.documentArtifactRepository ??
        createKyselyDocumentArtifactRepository(),
      transactions,
      renderer: documentRenderer,
      malwareScanner,
      storage: objectStorage,
      storageBucket: objectStorageBucket,
      ...(extractionScheduler ? { extractionScheduler } : {}),
    });
    container.services.documents = documents;

    container.platform.httpRegistrars.push((application) =>
      registerDocumentRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        documents,
      }),
    );
  }
  // Atlas snapshots its tool registry; compose it after all owning services.
  registerAtlas(
    container,
    config,
    dependencies.ai,
    metadataDatabases,
    transactions,
    iam,
    createAtlasEntityContextReader(entityCollaboration, entityActivity),
  );
  if (config) registerVerification(container, config);
}

export function registerAtlas(
  container: Container,
  config: HostConfig | undefined,
  dependencies: ServiceRegistrationDependencies["ai"],
  databases: Partial<Record<PlaneKey, Kysely<Record<string, never>>>>,
  transactions: PlaneTransactionCoordinator<RecordTransaction>,
  iam: NonNullable<Container["platform"]["iam"]>,
  entityContextReader?: AtlasEntityContextReader,
): void {
  if (Object.keys(databases).length === 0) return;
  const ledger = new KyselyAtlasToolProposalStore({ transactions, databases });
  const experience = new AtlasExperienceConfigurationService(
    new KyselyAtlasExperienceConfigurationRepository(transactions),
  );
  container.platform.httpRegistrars.push((application) =>
    registerAtlasExperienceRoutes(application as never, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      authorizeAdmin: async (context) =>
        context.permissions.allowed.includes(
          "studio.platform.catalog.manage",
        ) ||
        context.permissions.allowed.includes("atlas.admin.manage") ||
        context.permissions.allowed.includes("ai.admin"),
      experience,
    }),
  );
  container.runtimes.health.register(
    "atlas.tool-invocation-ledger",
    async () => {
      const result = await ledger.health();
      return {
        status: result.healthy ? "healthy" : "unhealthy",
        ...(result.message ? { message: result.message } : {}),
      };
    },
  );
  const routesEnabled = Boolean(
    config?.atlas.enabled && config.atlas.persistenceEnabled,
  );
  const toolsEnabled = Boolean(
    routesEnabled &&
    config?.atlas.toolsEnabled &&
    config.atlas.generationEnabled !== false,
  );
  const toolFeatureGates = {
    toolsEnabled,
    mutationsEnabled: Boolean(config?.atlas.mutationsEnabled),
  };
  if (!routesEnabled) {
    if (container.platform.experience)
      container.platform.httpRegistrars.push((application) =>
        registerAtlasSurfaceDraftRoutes(application as never, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
        }),
      );
    container.platform.ai = {
      ledger,
      routesEnabled: false,
      toolsEnabled: false,
    };
    return;
  }
  const atlasMetadata = {
    listEntityCodes: (context: VerifiedRequestContext) =>
      container.platform.metadata?.listEntityCodes?.(context) ??
      Promise.resolve([]),
    getEntityDescriptor: (
      context: VerifiedRequestContext,
      entityCode: string,
    ) => {
      const metadata = container.platform.metadata;
      return metadata
        ? metadata.getEntityDescriptor(context, entityCode)
        : Promise.resolve(null);
    },
  };
  configureSharedAtlasInferenceAdmission(
    new RedisInferenceAdmission(container.adapters.redisCache?.client),
  );
  const semanticConfigPath =
    process.env["ATLAS_SEMANTIC_RETRIEVAL_CONFIG_PATH"];
  const semantic = semanticConfigPath
    ? parseAtlasSemanticConfig(
        JSON.parse(readFileSync(semanticConfigPath, "utf8")),
      )
    : undefined;
  if (!dependencies || config?.atlas.generationEnabled === false) {
    if (
      config?.search.baseUrl &&
      config.search.apiKey &&
      container.platform.authorizer &&
      container.platform.metadata &&
      container.services.records
    ) {
      container.platform.httpRegistrars.push((app) =>
        registerAtlasAttachmentKnowledge(app as never, {
          semantic,
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          transactions,
          authorizer: container.platform.authorizer!,
          metadata: container.platform.metadata!,
          records: container.services.records!.queries,
          search: {
            baseUrl: config.search.baseUrl!,
            apiKey: config.search.apiKey!,
            indexUid: "atlas_attachment_knowledge_neon",
            timeoutMs: config.search.timeoutMs,
          },
        }),
      );
    }
    if (toolsEnabled && !config?.atlas.localInferenceConfigPath)
      throw new Error(
        "Atlas tools require a configured local runtime or full provider composition.",
      );
    const documentGrounding =
      config?.search.baseUrl &&
      config.search.apiKey &&
      container.platform.authorizer &&
      container.platform.metadata &&
      container.services.records
        ? createAtlasDocumentGrounding({
            semantic,
            authenticate: createIamAuthenticationMiddleware(iam),
            readContext: readVerifiedRequestContext,
            transactions,
            authorizer: container.platform.authorizer,
            metadata: container.platform.metadata,
            records: container.services.records.queries,
            search: {
              baseUrl: config.search.baseUrl,
              apiKey: config.search.apiKey,
              indexUid: "atlas_attachment_knowledge_neon",
              timeoutMs: config.search.timeoutMs,
            },
            refresh: createKyselyContextRefresh({
              run: (identity, work) => {
                const db = databases[identity.planeKey];
                if (!db) throw new Error("Atlas plane unavailable");
                return db.transaction().execute(work);
              },
            }),
          })
        : undefined;
    const localRegistry = new AtlasToolRegistry([
      createAtlasEntityRecordTool(atlasMetadata),
      ...(container.platform.authorizer
        ? createAtlasEntityLookupTools(
            atlasMetadata,
            container.platform.authorizer,
          )
        : []),
      ...(entityContextReader
        ? createAtlasEntityContextTools(atlasMetadata, entityContextReader)
        : []),
    ]);
    // Local registry contains only generic Entity read tools; mutations require an
    // explicitly configured tool registry and authority.
    const localAvailable = (access: "read" | "mutation" = "read") =>
      Boolean(
        container.platform.metadata &&
        container.services.records &&
        access === "read",
      );
    const localTools = toolsEnabled
      ? new AtlasToolService({
          registry: localRegistry,
          proposals: ledger,
          authority: createAtlasGatedToolAuthority(
            {
              async authorize({ context, manifest }) {
                const allowed =
                  (context.planeKey === "neon" ||
                    manifest.toolCode === "entity_read_record" ||
                    entityContextTool(manifest.toolCode) ||
                    entityLookupTool(manifest.toolCode)) &&
                  localAvailable(manifest.access) &&
                  context.permissions.allowed.includes(
                    `${context.planeKey}.ai.agent.use`,
                  ) &&
                  !context.permissions.denied.includes(
                    `${context.planeKey}.ai.agent.use`,
                  ) &&
                  !context.permissions.planLocked.includes(
                    `${context.planeKey}.ai.agent.use`,
                  ) &&
                  !context.permissions.planeExcluded.includes(
                    `${context.planeKey}.ai.agent.use`,
                  );
                return {
                  allowed,
                  policyRevision: `atlas-local-tools-v2:mutations-${Boolean(config?.atlas.mutationsEnabled)}`,
                };
              },
            },
            toolFeatureGates,
          ),
          records: {
            async query(input) {
              const metadata = container.platform.metadata,
                records = container.services.records;
              if (!metadata || !records)
                throw new Error("Authorized Records runtime is unavailable.");
              return createAtlasRecordDataGateway({
                metadata,
                records: records.queries,
                maxRows: 3,
                maxResponseBytes: 8192,
                allowProjectedContentRevision: true,
                // Records already enforces field permissions and collection scope. This only narrows its projection.
                fieldSecurity: {
                  async project({
                    context,
                    entityCode,
                    descriptorHash,
                    rows,
                    requestedFields,
                  }) {
                    const descriptor = await metadata.getEntityDescriptor(
                      context,
                      entityCode,
                    );
                    if (
                      !descriptor ||
                      descriptor.compiledHash !== descriptorHash ||
                      !container.platform.authorizer
                    )
                      throw new Error(
                        "Atlas descriptor authorization changed.",
                      );
                    const permitted: string[] = [];
                    for (const key of requestedFields) {
                      const field = descriptor.fields.find(
                        (f) => f.key === key,
                      );
                      if (!field) continue;
                      if (
                        field.readPermissionCode &&
                        !(
                          await container.platform.authorizer.authorize({
                            context,
                            permissionCode: field.readPermissionCode,
                            resource: {
                              tenantId: context.tenantId,
                              entityCode,
                              operationKey: "read",
                              resourceCode: entityCode,
                              field: key,
                            },
                          })
                        ).allowed
                      )
                        continue;
                      permitted.push(key);
                    }
                    return rows.map((row) =>
                      Object.fromEntries(
                        permitted
                          .filter((key) => Object.hasOwn(row, key))
                          .map((key) => [key, row[key]]),
                      ),
                    );
                  },
                },
              }).query(input);
            },
          },
          confirmations: {
            async verify({ context, proposal }) {
              return (
                proposal.tenantId === context.tenantId &&
                proposal.planeKey === context.planeKey &&
                proposal.principalId === context.principalId &&
                proposal.authorizationEpoch === context.authEpoch &&
                proposal.authorizationProfileHash === context.profileHash
              );
            },
          },
          commands: {
            async execute() {
              throw new Error("Unregistered local Atlas command.");
            },
          },
        })
      : undefined;
    const localCoordinator = localTools
      ? new AtlasRegisteredToolCoordinator(
          localRegistry,
          localTools,
          atlasMetadata,
        )
      : undefined;
    const localConfig =
      config?.atlas.generationEnabled !== false &&
      config?.atlas.localInferenceConfigPath
        ? parseAtlasLocalConfiguration(
            JSON.parse(
              readFileSync(config.atlas.localInferenceConfigPath, "utf8"),
            ),
          )
        : undefined;
    const localServices = localConfig
      ? createAtlasLocalGenerationServices({
          authorizeAdmission: async (context) =>
            Boolean(
              container.platform.authorizer &&
              (
                await container.platform.authorizer.authorize({
                  context,
                  permissionCode: `${context.planeKey}.ai.agent.use`,
                  resource: { tenantId: context.tenantId },
                })
              ).allowed,
            ),
          ...(documentGrounding
            ? {
                attachments: documentGrounding.attachments,
                documents: documentGrounding,
              }
            : {}),
          businessContexts: {
            async resolve(context, value) {
              const metadata = container.platform.metadata,
                records = container.services.records;
              if (!metadata || !records)
                throw new Error("Atlas business context unavailable");
              return createAtlasBusinessContextResolver({
                metadata,
                records: records.queries,
                list: (query) => records.lists.list(query),
              }).resolve(context, value);
            },
          },
          transactions,
          config: localConfig,
          provider: new OllamaModelProvider({
            modelDigest: localConfig.model.digest,
            engineVersion: localConfig.engine.version,
          }),
          ...(localCoordinator
            ? {
                tools: {
                  revalidate: (context, evidence) =>
                    localTools!.revalidate(context, evidence),
                  coordinator: localCoordinator,
                  readEnabled: toolsEnabled,
                  mutationsEnabled: Boolean(config?.atlas.mutationsEnabled),
                  available: localAvailable,
                },
              }
            : {}),
        })
      : undefined;
    const { threads, admission } =
      localServices ?? createAtlasConversationServices(transactions);
    const runtime = localServices?.runtime;
    container.platform.ai = {
      ledger,
      threads,
      ...(runtime ? { runtime } : {}),
      ...(localTools ? { tools: localTools } : {}),
      routesEnabled: true,
      toolsEnabled,
    };
    container.platform.httpRegistrars.push((application) =>
      registerAtlasRoutes(application as never, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        threads,
        admission,
        feedback: new AtlasResponseFeedbackService(
          new KyselyAtlasResponseFeedbackStore(transactions),
          threads,
        ),
        ...(atlasLearningInboxes.has(container)
          ? {
              learning: new AtlasLearningCandidateService(
                transactions,
                atlasMetadata,
                threads,
                atlasLearningInboxes.get(container)!,
              ),
            }
          : {}),
        ...(runtime ? { runtime } : {}),
        ...(localTools && localServices
          ? { tools: localTools, runs: localServices.runs }
          : {}),
      }),
    );
    container.runtimes.health.register(
      "atlas.conversation-persistence",
      async () => {
        await Promise.all(
          Object.values(databases).map((database) =>
            sql`SELECT conversation_id FROM ai.atlas_thread LIMIT 0`.execute(
              database!,
            ),
          ),
        );
        return { status: "healthy" };
      },
    );
    if (container.platform.experience)
      container.platform.httpRegistrars.push((application) =>
        registerAtlasSurfaceDraftRoutes(application as never, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
        }),
      );
    return;
  }
  const operations = createAtlasA2Services({
    transactions,
    platformCredentials: dependencies.credentials,
    credentialCipher: dependencies.credentialCipher,
    credentialInvalidation: dependencies.credentialInvalidation,
    knowledgeIndex: dependencies.knowledgeIndex,
    knowledgeAdmission:
      dependencies.knowledgeAdmission ??
      (container.platform.authorizer
        ? createAttachmentRetrievalAdmission({
            transactions,
            authorizer: container.platform.authorizer,
            async authorizeParent({ context, entityCode, recordId }) {
              const metadata = container.platform.metadata,
                records = container.services.records;
              if (!metadata || !records) return false;
              const descriptor = await metadata.getEntityDescriptor(
                context,
                entityCode,
              );
              if (
                !descriptor ||
                descriptor.planeKey !== context.planeKey ||
                descriptor.entityCode !== entityCode ||
                !descriptor.ai?.enabled
              )
                return false;
              const read = descriptor.operations["read"];
              if (
                !read ||
                !(
                  await authorizeEntityOperation(
                    container.platform.authorizer!,
                    {
                      context,
                      permissionCode: read.permissionCode,
                      resource: {
                        tenantId: context.tenantId,
                        entityCode,
                        resourceCode: entityCode,
                        operationKey: "read",
                        recordId,
                      },
                    },
                  )
                ).allowed
              )
                return false;
              const result = await records.queries.list({
                context,
                entityCode,
                fields: [descriptor.storage.idField],
                recordIds: [recordId],
                limit: 1,
                countMode: "none",
                hydrateReferences: false,
              });
              return (
                result.data.length === 1 &&
                String(result.data[0]?.[descriptor.storage.idField]) ===
                  recordId
              );
            },
          })
        : undefined),
    policyInvalidation: dependencies.policyInvalidation,
    driftAlerts: dependencies.driftAlerts,
  });
  const threads = new AtlasThreadService({
    repository: dependencies.threadRepository,
    authorizer: dependencies.threadAuthorizer,
    retention: dependencies.retention,
    maxHistoryMessages: 20,
    maxHistoryBytes: 98_304,
    maxExportMessages: 1_000,
  });
  const bindings = new AtlasBindingRegistry(dependencies.bindings);
  const providers = new AtlasProviderRegistry(dependencies.providers);
  for (const binding of dependencies.bindings) providers.resolve(binding);
  const registry = new AtlasToolRegistry([
    createAtlasEntityRecordTool(atlasMetadata),
    ...(container.platform.authorizer
      ? createAtlasEntityLookupTools(
          atlasMetadata,
          container.platform.authorizer,
        )
      : []),
    ...(entityContextReader
      ? createAtlasEntityContextTools(atlasMetadata, entityContextReader)
      : []),
    ...dependencies.registeredTools,
  ]);
  const tools = new AtlasToolService({
    registry,
    authority: createAtlasGatedToolAuthority(
      dependencies.toolAuthority,
      toolFeatureGates,
    ),
    proposals: ledger,
    records: dependencies.recordGateway,
    confirmations: dependencies.confirmations,
    commands: dependencies.commands,
  });
  const coordinator = toolsEnabled
    ? new AtlasRegisteredToolCoordinator(registry, tools, atlasMetadata)
    : undefined;
  const admission = createAtlasGatedPlaneAdmission(
    dependencies.admission,
    toolFeatureGates,
  );
  const quotas =
    dependencies.quotas ??
    new KyselyAtlasTenantQuotaManager({
      transactions,
      defaultPolicy: {
        maxRequests: 1_000,
        maxInputTokens: 10_000_000,
        maxOutputTokens: 2_000_000,
        windowSeconds: 3_600,
      },
      reservationTtlSeconds: 1_800,
    });
  const runtime = new AtlasAgentRuntime({
    businessContexts: {
      async resolve(context, value) {
        const metadata = container.platform.metadata,
          records = container.services.records;
        if (!metadata || !records)
          throw new Error("Atlas business context unavailable");
        return createAtlasBusinessContextResolver({
          metadata,
          records: records.queries,
          list: (query) => records.lists.list(query),
        }).resolve(context, value);
      },
    },
    admission,
    modelPolicy: dependencies.modelPolicy,
    bindings,
    providers,
    credentials: operations.resolver,
    threads,
    runs: dependencies.runs,
    ledger: dependencies.usageLedger,
    prompts: dependencies.prompts,
    quota: quotas,
    experience,
    attachments: new KyselyAtlasAttachmentContextResolver(transactions),
    ...(coordinator ? { tools: coordinator } : {}),
    maxInputCharacters: 55_000,
    maxToolRounds: toolsEnabled ? 3 : 0,
  });
  container.platform.ai = {
    ledger,
    threads,
    runtime,
    tools,
    operations,
    routesEnabled: true,
    toolsEnabled,
  };
  container.runtimes.health.register("atlas.runtime-composition", async () => ({
    status:
      dependencies.bindings.length > 0 && dependencies.providers.length > 0
        ? "healthy"
        : "unhealthy",
    ...(dependencies.bindings.length && dependencies.providers.length
      ? {}
      : {
          message:
            "Atlas requires at least one exact model binding and provider adapter.",
        }),
  }));
  container.platform.httpRegistrars.push((application) =>
    registerAtlasRoutes(application as never, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      admission,
      feedback: new AtlasResponseFeedbackService(
        new KyselyAtlasResponseFeedbackStore(transactions),
        threads,
      ),
      ...(atlasLearningInboxes.has(container)
        ? {
            learning: new AtlasLearningCandidateService(
              transactions,
              atlasMetadata,
              threads,
              atlasLearningInboxes.get(container)!,
            ),
          }
        : {}),
      threads,
      runtime,
      ...(toolsEnabled ? { tools, runs: dependencies.runs } : {}),
    }),
  );
  if (container.platform.experience) {
    const surfaceDrafts = new AtlasSurfaceDraftGenerator({
      runtime,
      threads,
      admission,
      surfaces: container.platform.experience.service,
    });
    container.platform.httpRegistrars.push((application) =>
      registerAtlasSurfaceDraftRoutes(application as never, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        generator: surfaceDrafts,
      }),
    );
  }
  container.platform.httpRegistrars.push((application) =>
    registerAtlasAdminRoutes(application as never, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      authorize: async (context) =>
        hasAtlasPermission(context, "atlas.admin.manage") ||
        hasAtlasPermission(context, "ai.admin"),
      credentials: operations.credentials,
      knowledge: operations.knowledge,
      policies: operations.policies,
      quotas,
      dashboards: operations.dashboards,
    }),
  );
  container.runtimes.health.register("atlas.a2-operations", async () => {
    const [credentials, index] = await Promise.all([
      operations.credentialRepository.health(),
      operations.knowledgeIndex.health(),
    ]);
    return {
      status: credentials.healthy && index.healthy ? "healthy" : "unhealthy",
      ...(!credentials.healthy || !index.healthy
        ? {
            message:
              credentials.message ??
              index.message ??
              "Atlas A2 dependency is unavailable.",
          }
        : {}),
    };
  });
  if (container.runtimes.jobs) {
    container.runtimes.jobs.register(
      ATLAS_KNOWLEDGE_QUEUE,
      INGEST_ATLAS_KNOWLEDGE_JOB,
      createAtlasKnowledgeIngestionHandler(
        operations.knowledge,
        dependencies.knowledgeJobAuthority,
      ),
    );
    container.runtimes.jobs.register(
      ATLAS_MONITORING_QUEUE,
      RUN_ATLAS_DRIFT_JOB,
      createAtlasDriftHandler(operations.drift),
    );
    container.runtimes.jobDefinitions.push(
      {
        code: INGEST_ATLAS_KNOWLEDGE_JOB,
        owner: "@athyper/server-platform-ai",
        queue: ATLAS_KNOWLEDGE_QUEUE,
        name: INGEST_ATLAS_KNOWLEDGE_JOB,
        scope: "tenant",
        payloadSchema: { name: INGEST_ATLAS_KNOWLEDGE_JOB, version: 1 },
        timeoutMs: 120_000,
        maxAttempts: 5,
        executionRetentionDays: 30,
      },
      {
        code: RUN_ATLAS_DRIFT_JOB,
        owner: "@athyper/server-platform-ai",
        queue: ATLAS_MONITORING_QUEUE,
        name: RUN_ATLAS_DRIFT_JOB,
        scope: "tenant",
        payloadSchema: { name: RUN_ATLAS_DRIFT_JOB, version: 1 },
        timeoutMs: 60_000,
        maxAttempts: 3,
        executionRetentionDays: 90,
      },
    );
  }
}

const localGraphRuntimeQualifiers = new WeakMap<
  Container,
  { qualify(profile: unknown, bindings: unknown): void }
>();
const publicationTargetQualifications = new WeakMap<
  Container,
  Parameters<
    typeof registerPublicationWorkloadRoutes
  >[1]["dependencies"]["targets"]
>();
const atlasLearningInboxes = new WeakMap<Container, AtlasLearningInbox>();

function registerStudioAuthoring(
  container: Container,
  config: HostConfig | undefined,
  database: Kysely<Record<string, never>> | undefined,
  iam: NonNullable<Container["platform"]["iam"]>,
  authorizer: NonNullable<Container["platform"]["authorizer"]>,
  transactions: PlaneTransactionCoordinator<RecordTransaction>,
  publicationTargets: Parameters<
    typeof registerPublicationWorkloadRoutes
  >[1]["dependencies"]["targets"],
): void {
  publicationTargetQualifications.set(container, publicationTargets);
  const devPublication =
    config?.mode === "api"
      ? loadDevPublicationConfiguration(process.env, config.env)
      : undefined;
  const publicationWorkload =
    config?.mode === "api"
      ? loadPublicationWorkloadConfiguration(process.env, config.env)
      : undefined;
  if (
    publicationWorkload &&
    (!config?.publication.authoringEnabled ||
      !container.platform.audit ||
      !container.adapters.publicationVerifier)
  )
    throw Error("PUBLICATION_WORKLOAD_AUTHORING_AND_TRUST_REQUIRED");
  if (
    devPublication &&
    (!config?.publication.authoringEnabled || !container.platform.audit)
  )
    throw Error("DEV_PUBLICATION_AUTHORING_AND_AUDIT_REQUIRED");
  if (
    config?.publication.authoringEnabled &&
    (!database ||
      !container.runtimes.jobs ||
      !container.adapters.publicationSigner ||
      !config.publication.signingKeyId)
  )
    throw new Error(
      "Publication authoring requires Studio database, jobs and signer",
    );
  if (
    !database ||
    !config?.publication.apiEnabled ||
    !container.runtimes.jobs ||
    !container.adapters.publicationSigner ||
    !config.publication.signingKeyId
  )
    return;
  const learning = new AtlasLearningInbox({
    database,
    fixtureSets: createPublishedLearningFixtureProvider(database),
    authorizer: { authorize: (input) => learningAuthorizer.authorize(input) },
    sourceCurrent: (proposal) =>
      isAtlasLearningSourceCurrent(transactions, proposal),
    evaluate: evaluateAtlasLearningVocabulary,
    evaluationIdentity: {
      resolverVersion: ATLAS_LEARNING_RESOLVER_VERSION,
      scoringVersion: ATLAS_LEARNING_SCORING_VERSION,
    },
  });
  atlasLearningInboxes.set(container, learning);
  const repository = createScopedMetaEntityAuthoringRepository(
    (work) =>
      container.adapters.athyperDatabase!.withTenantTransaction((tx) =>
        work(tx as unknown as Kysely<Record<string, never>>),
      ),
    (db) =>
      new KyselyMetaEntityAuthoringRepository(db, async (tx, input) => {
        if (await prepareSystemReferenceRelease(tx, input)) return;
        if (await prepareCollectionConfigurationRelease(tx, input)) return;
        if (await prepareNotificationConfigurationRelease(tx, input)) return;
        const restored = await prepareRuntimeRestorationRelease(
          tx,
          input,
          async (expected) =>
            transactions.run(
              "neon",
              { tenantId: expected.tenantId, principalId: expected.actorId },
              async (source) => {
                const capability = (
                  await sql<{
                    available: boolean;
                  }>`SELECT to_regprocedure('runtime_meta.fn_runtime_restoration_precondition_version()') IS NOT NULL AS available`.execute(
                    source,
                  )
                ).rows[0]?.available;
                if (!capability) return false;
                const result = (
                  await sql<{
                    ready: boolean;
                  }>`SELECT runtime_meta.fn_runtime_restoration_precondition_version()=1
            AND NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key=${expected.publicationKey})
            AND NOT EXISTS(SELECT 1 FROM runtime_meta.entity_contract WHERE tenant_id=${expected.tenantId}::uuid AND entity_code=${expected.entityCode})
            AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='runtime_meta.release_activation_head'::regclass AND tgname='baseline_activation_precondition' AND tgenabled IN ('O','A')) AS ready`.execute(
                    source,
                  )
                ).rows[0];
                return result?.ready === true;
              },
            ),
        );
        if (restored) return;
        const successor = await prepareAuthorizationSuccessorRelease(
          tx,
          input,
          async (expected) =>
            transactions.run(
              "neon",
              { tenantId: expected.tenantId, principalId: expected.actorId },
              async (source) => {
                const heads = (
                  await sql<{
                    source_release_id: string;
                    source_release_no: number;
                    applied_release_id: string;
                    row_version: number;
                    artifact_hash: string;
                    compiled_json: Record<string, unknown>;
                  }>`SELECT a.source_release_id,h.source_release_no,h.applied_release_id,h.row_version,h.artifact_hash,d.compiled_json
        FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
        JOIN runtime_meta.entity_contract c ON c.publication_key=h.publication_key AND c.release_id=a.source_release_id
        JOIN runtime_meta.entity_descriptor d ON d.entity_contract_id=c.id AND d.applied_release_id=a.id
        WHERE h.publication_key=${expected.publicationKey} AND c.tenant_id=${expected.tenantId}::uuid AND d.tenant_id=c.tenant_id
          AND d.plane_code='neon' AND d.descriptor_kind='entity_runtime' AND d.status='active'
          AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='runtime_meta.release_activation_head'::regclass AND tgname='baseline_activation_precondition' AND tgenabled IN ('O','A'))`.execute(
                    source,
                  )
                ).rows;
                if (heads.length !== 1) return null;
                const head = heads[0]!;
                return {
                  sourceReleaseId: head.source_release_id,
                  sourceReleaseNo: Number(head.source_release_no),
                  appliedReleaseId: head.applied_release_id,
                  rowVersion: Number(head.row_version),
                  artifactHash: head.artifact_hash,
                  descriptorHash: baselineJsonHash(head.compiled_json),
                };
              },
            ),
        );
        if (successor) return;
        const prepared = await prepareInitialBaselineRelease(
          tx,
          input,
          async (baseline, actorId) =>
            transactions.run(
              baseline.sourcePlane as "neon" | "mesh",
              { tenantId: baseline.tenantId, principalId: actorId },
              async (source) => {
                const rows = (
                  await sql<{
                    capture: unknown;
                  }>`SELECT jsonb_build_object('contract',to_jsonb(c),'descriptor',to_jsonb(d),'head',to_jsonb(h),'applied',to_jsonb(a)) AS capture
        FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
        JOIN runtime_meta.entity_contract c ON c.publication_key=h.publication_key AND c.release_id=a.source_release_id
        JOIN runtime_meta.entity_descriptor d ON d.entity_contract_id=c.id AND d.applied_release_id=a.id
        WHERE ((c.tenant_id=${baseline.tenantId}::uuid AND d.tenant_id=c.tenant_id AND ${baseline.schema}='athyper.imported-entity-baseline/1') OR (c.tenant_id IS NULL AND d.tenant_id IS NULL AND ${baseline.schema}='athyper.imported-global-entity-baseline/1')) AND h.publication_key=${baseline.publicationKey}
          AND d.plane_code=${baseline.sourcePlane} AND d.descriptor_kind='entity_runtime' AND d.status='active'
          AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='runtime_meta.release_activation_head'::regclass AND tgname='baseline_activation_precondition' AND tgenabled IN ('O','A'))`.execute(
                    source,
                  )
                ).rows;
                return (
                  rows.length === 1 &&
                  baselineContentHash(rows[0]!.capture) === baseline.contentHash
                );
              },
            ),
        );
        if (!prepared && !(await prepareDocumentCollectionRelease(tx, input)))
          await prepareAtlasLearningRelease(tx, input);
      }),
  );
  const publication = new PublicationServiceMetaEntityAdapter({
    prepare: async (input) => {
      await container.adapters.athyperDatabase!.withTenantTransaction(
        async (tx) => {
          await prepareDocumentCollectionRelease(
            tx as unknown as Kysely<Record<string, never>>,
            input,
          );
        },
      );
    },
    jobs: container.runtimes.jobs,
    execution: () => {
      const context = authoringRequestContext();
      if (
        context.planeKey !== "studio" ||
        !context.tenantId ||
        !context.principalId
      )
        throw new Error("AUTHORING_EXECUTION_CONTEXT_REQUIRED");
      return {
        planeKey: "studio",
        scope: "tenant",
        tenantId: context.tenantId,
        principalId: context.principalId,
        ...(context.correlationId
          ? { correlationId: context.correlationId }
          : {}),
      };
    },
    createEventId: randomUUID,
    activateLocal: async ({ releaseId, plane, actorId }) => {
      const release =
        await container.adapters.athyperDatabase!.withTenantTransaction(
          async (tx) =>
            (
              await sql<{
                tenant_id: string;
                entity_code: string;
                release_no: string | number;
                release_key: string;
              }>`SELECT r.tenant_id,e.entity_code,COALESCE(pr.release_no,r.release_no) AS release_no,COALESCE(pr.release_key,'metadata.entity.'||e.entity_code) AS release_key
        FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
        LEFT JOIN publication.release pr ON pr.id=r.id AND pr.tenant_id IS NOT DISTINCT FROM r.tenant_id
        WHERE r.id=${releaseId}::uuid AND ${plane}=ANY(r.target_planes)`.execute(
                tx,
              )
            ).rows[0],
        );
      if (!release) throw new Error("META_ENTITY_RELEASE_NOT_FOUND");
      const active = await transactions.run(
        plane,
        { tenantId: release.tenant_id, principalId: actorId },
        async (tx) =>
          (
            await sql<{
              release_id: string;
              tenant_id: string;
            }>`SELECT release_id,tenant_id FROM runtime_meta.fn_active_entity_descriptor(${release.release_key},'entity_runtime')`.execute(
              tx,
            )
          ).rows[0],
      );
      if (
        !active ||
        active.release_id !== releaseId ||
        active.tenant_id !== release.tenant_id
      )
        throw new Error("META_ENTITY_RELEASE_NOT_ACTIVE");
      return {
        planeKey: plane,
        tenantId: release.tenant_id,
        entityCode: release.entity_code,
        generation: Number(release.release_no),
        releaseId,
      };
    },
    appendDurableEvent: async (event) => {
      await container.adapters.athyperDatabase!.withTenantTransaction(
        async (tx) => {
          await sql`SELECT publication.fn_confirm_metadata_activation(${event.releaseId}::uuid,${event.planeKey},${event.eventId}::uuid)`.execute(
            tx,
          );
        },
      );
    },
  });
  const preview = localGraphPreview({
    repository,
    authorizer,
    refresh: createKyselyContextRefresh({
      run: (identity, work) => {
        if (identity.planeKey !== "studio")
          throw Error("GRAPH_PREVIEW_AUTHOR_PLANE_REQUIRED");
        return (
          container.adapters.athyperDatabase!.database as unknown as Kysely<
            Record<string, never>
          >
        )
          .transaction()
          .execute(work);
      },
    }),
    run: (plane, actor, work) =>
      transactions.run(plane, actor, (tx) =>
        work(tx as unknown as Kysely<Record<string, never>>),
      ),
    qualify: (profile, bindings) => {
      const runtime = localGraphRuntimeQualifiers.get(container);
      if (!runtime) throw Error("GRAPH_PREVIEW_RUNTIME_REGISTRY_UNAVAILABLE");
      runtime.qualify(profile, bindings);
    },
  });
  const nativeComponentQualifier = createDeployedComponentQualification(
    process.env,
    { canonicalBytes, sha256 },
  );
  const nativePublication = createNativePublicationStartup({
    environment: process.env,
    targetDatabases: publicationTargets.databases,
    run: (work) =>
      container.adapters.athyperDatabase!.withTenantTransaction((tx) =>
        work(tx as unknown as Kysely<Record<string, never>>),
      ),
    loader: {
      store: container.adapters.publicationArtifactStore!,
      verifier: container.adapters.publicationVerifier!,
      canonicalizer: { canonicalBytes, sha256 },
      runtimeVersion: config.publication.runtimeVersion,
      ...(nativeComponentQualifier
        ? {
            uiComponents: {
              qualify: async (envelope) =>
                nativeComponentQualifier(envelope.payload),
            },
          }
        : {}),
    },
  });
  const service = new MetaEntityAuthoringService({
    ...nativePublication,
    ...(preview ? { preview } : {}),
    repository,
    learning,
    signer: new MetaEntityArtifactSigner(
      container.adapters.publicationSigner,
      config.publication.signingKeyId,
    ),
    publication,
  });
  if (devPublication)
    container.platform.httpRegistrars.push((application) =>
      registerDevPublicationRoutes(application, {
        config: devPublication,
        database,
        service,
        audit: container.platform.audit!,
      }),
    );
  if (publicationWorkload && container.adapters.publicationVerifier) {
    // Human policy enrollment belongs exclusively to the isolated control API.
    // Workload execution remains separately authenticated and requires an enrolled pin.
    container.platform.httpRegistrars.push((application) =>
      registerPublicationWorkloadRoutes(application, {
        configuration: publicationWorkload,
        dependencies: {
          database,
          service,
          audit: container.platform.audit!,
          authorizer,
          targets: publicationTargets,
          jobs: container.runtimes.jobs,
          policyAuthority: {
            async assertAuthorized() {
              throw Error("MACHINE_PUBLICATION_ENROLLED_POLICY_REQUIRED");
            },
          },
        },
      }),
    );
  }
  container.platform.httpRegistrars.push((application) =>
    registerAtlasLearningInboxRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      inbox: learning,
      authoring: service,
    }),
  );
  const authoringAuthorizer = createMetaEntityAuthoringAuthorizer(
    authorizer,
    (context, id, kind) =>
      container.adapters.athyperDatabase!.withTenantTransaction(async (tx) => {
        const row = (
          await sql<{
            id: string;
            tenant_id: string;
            status: string;
            created_by: string;
            submitted_by: string | null;
            approved_by: string | null;
          }>`SELECT cs.id,cs.tenant_id,cs.status,cs.created_by,cs.submitted_by,cs.approved_by FROM metadata.entity_change_set cs
      WHERE cs.tenant_id=${context.tenantId}::uuid AND (${kind}='change_set' AND cs.id=${id}::uuid OR ${kind}='release' AND EXISTS(SELECT 1 FROM metadata.entity_release r WHERE r.id=${id}::uuid AND r.change_set_id=cs.id AND r.tenant_id=cs.tenant_id))`.execute(
            tx,
          )
        ).rows[0];
        return row
          ? {
              changeSetId: row.id,
              tenantId: row.tenant_id,
              status: row.status,
              createdBy: row.created_by,
              submittedBy: row.submitted_by,
              approvedBy: row.approved_by,
            }
          : null;
      }),
  );
  const learningAuthorizer = createAtlasLearningReviewAuthorizer(
    authoringAuthorizer,
    (context, id) =>
      transactions.run("studio", context, async (tx) => {
        const row = (
          await sql<{ tenant_id: string; submitted_by: string; state: string }>`
        SELECT tenant_id,submitted_by,state FROM ai.atlas_learning_inbox
        WHERE tenant_id=${context.tenantId}::uuid AND id=${id}::uuid`.execute(
            tx,
          )
        ).rows[0];
        return row
          ? {
              tenantId: row.tenant_id,
              submittedBy: row.submitted_by,
              state: row.state,
            }
          : null;
      }),
  );
  container.platform.httpRegistrars.push((application) =>
    registerMetaEntityAuthoringRoutes(application, {
      inspectNotificationConfiguration: (context, entityCode) =>
        transactions.run(
          "neon",
          { tenantId: context.tenantId, principalId: context.principalId },
          (tx) =>
            readPublishedNotificationConfiguration(
              tx as unknown as Kysely<Record<string, never>>,
              context.tenantId,
              entityCode,
            ),
        ),
      inspectActivation: createMetaEntityActivationInspector(
        (plane, context, work) =>
          transactions.run(
            plane,
            { tenantId: context.tenantId, principalId: context.principalId },
            (tx) => work(tx as unknown as Kysely<Record<string, never>>),
          ),
      ),
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      authorizer: authoringAuthorizer,
      inspectionAuthorizer: createMetaEntityInspectionAuthorizer(authorizer),
      service,
    }),
  );
}

function registerPublication(
  container: Container,
  config: HostConfig,
  databases: Partial<Record<PlaneKey, Kysely<Record<string, never>>>>,
  iam: NonNullable<Container["platform"]["iam"]>,
  authorizer: NonNullable<Container["platform"]["authorizer"]>,
  audit: NonNullable<Container["platform"]["audit"]>,
  authorizationCompilation?: ConstructorParameters<
    typeof KyselyPublicationAuthorityWork
  >[0]["authorizationCompilation"],
  compiledRuntimePublication?: ConstructorParameters<
    typeof KyselyPublicationAuthorityWork
  >[0]["compiledRuntimePublication"],
): void {
  const authorityDatabase = databases.studio;
  if (!authorityDatabase)
    throw new Error("Publication requires the Studio authority database");
  const coordinatedWorkload = loadPublicationWorkloadConfiguration(
    process.env,
    config.env,
  );
  const devConfiguration = loadDevPublicationConfiguration(
    process.env,
    config.env,
  );
  const devRuntime =
    devConfiguration?.runtimeApproval && authorizationCompilation
      ? createDevRuntimePublication({
          environment: config.env,
          database: (container.adapters.athyperDatabase?.database ??
            authorityDatabase) as Kysely<Record<string, never>>,
          signingKeyId: config.publication.signingKeyId!,
          audit,
          compilation: authorizationCompilation,
        })
      : undefined;
  if (devRuntime && authorizationCompilation)
    authorizationCompilation = {
      ...authorizationCompilation,
      review: devRuntime.review,
    };
  const artifactRuntimeEnabled =
    config.publication.applyEnabled ||
    config.publication.compileEnabled ||
    config.publication.dispatchEnabled;
  if (
    artifactRuntimeEnabled &&
    (!container.adapters.publicationArtifactStore ||
      !container.adapters.publicationVerifier)
  )
    throw new Error("Publication artifact store and verifier are unavailable");
  const resourceConfiguration = readResourcePublicationConfiguration(
    process.env,
  );
  const componentQualifier = createDeployedComponentQualification(process.env, {
    canonicalBytes,
    sha256,
  });
  const authority = new KyselyPublicationAuthorityRepository(authorityDatabase);
  const nativeApply = createNativePublicationStartup({
    environment: process.env,
    targetDatabases: databases,
    run: (work) =>
      container.adapters.athyperDatabase!.withTenantTransaction((tx) =>
        work(tx as unknown as Kysely<Record<string, never>>),
      ),
    loader: {
      store: container.adapters.publicationArtifactStore!,
      verifier: container.adapters.publicationVerifier!,
      canonicalizer: { canonicalBytes, sha256 },
      runtimeVersion: config.publication.runtimeVersion,
      ...(componentQualifier
        ? {
            uiComponents: {
              qualify: async (envelope) => componentQualifier(envelope.payload),
            },
          }
        : {}),
    },
  });
  const { projections, orchestrators, loaders } = createPublicationTargets({
    nativeSource: nativeApply.readNativeSource,
    authorityDatabase,
    coordinatedWorkload,
    databases,
    targetPlanes: config.publication.applyEnabled
      ? config.publication.targetPlanes
      : [],
    artifactLoader: {
      store: container.adapters.publicationArtifactStore!,
      verifier: container.adapters.publicationVerifier!,
      canonicalizer: { canonicalBytes, sha256 },
      runtimeVersion: config.publication.runtimeVersion,
      ...(componentQualifier
        ? {
            uiComponents: {
              qualify: async (envelope) => componentQualifier(envelope.payload),
            },
          }
        : {}),
      ...(resourceConfiguration
        ? {
            authoringResources: {
              async qualify(kind, payload) {
                const resource = parseEntityAuthoringResource(kind, payload);
                const hash =
                  resource.schema === "entity.installed-authoring-descriptor/1"
                    ? resource.descriptorHash
                    : resource.schema === "entity.legacy-identity-review/1"
                      ? resource.authoringSchemaHash
                      : null;
                if (hash !== resourceConfiguration.descriptorHash)
                  throw Error("RESOURCE_DESCRIPTOR_CHANGED");
              },
            },
          }
        : {}),
      ...(authorizationCompilation
        ? { authorizationRuntime: authorizationCompilation.runtime }
        : {}),
    },
    activationGuard: async (deployment, loaded, authorityTransaction) => {
      const tenantContext = tryGetRequestContext();
      if (!tenantContext?.tenantId)
        throw new Error("PUBLICATION_APPLIER_TENANT_REQUIRED");
      // Reuse the stamped authority transaction. Opening another transaction
      // here exhausts the worker pool during same-plane publication.
      const approved =
        (
          await sql`SELECT id FROM publication.release WHERE id=${deployment.sourceReleaseId}::uuid
          AND tenant_id=${tenantContext.tenantId}::uuid AND status IN ('approved','published')`.execute(
            authorityTransaction,
          )
        ).rows.length === 1;
      if (!approved)
        throw new Error("PUBLICATION_ACTIVATION_APPROVAL_REQUIRED");
      const envelope = loaded.document.envelope;
      if (
        envelope.artifactKind === "entity_authoring_descriptor" ||
        envelope.artifactKind === "entity_identity_review" ||
        envelope.artifactKind === "entity_ui_component"
      ) {
        if (!resourceConfiguration)
          throw Error("AUTHORING_RESOURCE_ADAPTER_REQUIRED");
        const policy = createResourcePublication({
          database: authorityTransaction,
          configuration: resourceConfiguration,
          canonical: { canonicalBytes, sha256 },
          componentQualifier,
        });
        const source = await policy.load(deployment.sourceReleaseId);
        if (
          source.kind !== envelope.artifactKind ||
          sha256(canonicalBytes(source.payload)) !==
            sha256(canonicalBytes(envelope.payload))
        )
          throw Error("AUTHORING_RESOURCE_SOURCE_MISMATCH");
      }

      const descriptors =
        envelope.artifactKind === "entity_runtime" &&
        envelope.payload.entityDescriptor.descriptorKind === "entity_runtime"
          ? [
              parseEntityRuntimeDescriptor({
                entity_code: envelope.payload.entityContract.entityCode,
                plane_code: envelope.payload.entityDescriptor.plane,
                release_id: envelope.payload.entityContract.releaseId,
                release_no: envelope.payload.entityContract.releaseNo,
                entity_contract_hash:
                  envelope.payload.entityContract.contractHash,
                compiled_hash: envelope.payload.entityDescriptor.compiledHash,
                compiled_json: envelope.payload.entityDescriptor.descriptor,
              }),
            ]
          : envelope.artifactKind === "compiled_entity_runtime"
            ? envelope.payload.artifacts
                .filter((item) => item.artifactType === "runtime_contract")
                .map((item) =>
                  parseCompiledRuntimeContract(item, {
                    releaseId: envelope.releaseId,
                    releaseNo: envelope.releaseNo,
                  }),
                )
            : [];
      await container.platform.entityReadiness!.assertActivationDescriptors(
        descriptors,
      );
      assertEntityAuthorizationEnforceable(
        descriptors,
        deployment.targetPlane,
        authorizer,
      );
      if (
        loaded.document.manifest.evidence?.authorizationReviewMode !==
        "development_auto_approval"
      )
        return;
      if (
        !devRuntime ||
        deployment.targetEnvironment !== "local" ||
        deployment.signingKeyId !== config.publication.signingKeyId
      )
        throw Error("DEV_RUNTIME_ACTIVATION_DENIED");
      const receipt = await devRuntime.authorizeActivation(
        deployment.sourceReleaseId,
        loaded,
      );
      if (
        receipt.receiptSha256 !==
        loaded.document.manifest.evidence.authorizationReviewReceiptSha256
      )
        throw Error("DEV_RUNTIME_APPROVAL_CHANGED");
    },
  });
  container.services.publication = {
    authority,
    projections,
    orchestrators,
    loaders,
  };
  container.runtimes.health.register("publication.database", async () => {
    try {
      await sql`SELECT 1`.execute(authorityDatabase);
      return { status: "healthy" };
    } catch {
      return {
        status: "unhealthy",
        message: "Publication authority database is unavailable",
      };
    }
  });
  if (container.runtimes.jobs && config.publication.applyEnabled) {
    container.runtimes.jobs.register(
      PUBLICATION_APPLY_QUEUE,
      APPLY_PUBLICATION_RELEASE_JOB,
      createPublicationApplyHandler(
        orchestrators,
        container.adapters.openTelemetry?.metrics,
      ),
    );
    container.runtimes.jobs.register(
      PUBLICATION_APPLY_QUEUE,
      ROLLBACK_PUBLICATION_RELEASE_JOB,
      createPublicationRollbackHandler(
        Object.fromEntries(
          (
            config.publication.targetPlanes as readonly (
              "studio" | "neon" | "mesh"
            )[]
          )
            .filter((plane) => Boolean(databases[plane]))
            .map((plane) => [
              plane,
              createTenantRollbackExecutor(
                databases[plane]!,
                authorityDatabase,
                plane,
                (transaction, appliedReleaseId, targetPlane) =>
                  assertRollbackEntityReadiness(
                    transaction,
                    appliedReleaseId,
                    targetPlane,
                    container.platform.entityReadiness!,
                  ),
              ),
            ]),
        ),
        container.adapters.openTelemetry?.metrics,
      ),
    );
    if (config.publication.recoveryEnabled) {
      const recoveryDatabase =
        container.adapters.publicationRecoveryDatabase?.database;
      if (!recoveryDatabase)
        throw new Error("PUBLICATION_RECOVERY_DATABASE_REQUIRED");
      container.runtimes.jobs.register(
        PUBLICATION_MAINTENANCE_QUEUE,
        RECOVER_STALLED_PUBLICATIONS_JOB,
        createPublicationRecoveryHandler(
          new KyselyPublicationRecoveryDiscovery(
            recoveryDatabase as unknown as Kysely<Record<string, never>>,
          ),
          container.runtimes.jobs,
          async (coordinate) => {
            // The definer function reveals only coordinates. Recheck the exact
            // deployment under tenant RLS before selecting a target worker.
            const visible = await authorityDatabase
              .transaction()
              .execute(async (tx) => {
                await sql`SELECT set_config('app.current_tenant_id',${coordinate.tenantId},true)`.execute(
                  tx,
                );
                const deployment =
                  await new KyselyPublicationAuthorityRepository(
                    tx,
                  ).getDeployment(coordinate.deploymentId);
                if (!deployment) return null;
                const approved =
                  (
                    await sql`SELECT id FROM publication.release WHERE id=${deployment.sourceReleaseId}::uuid
              AND tenant_id=${coordinate.tenantId}::uuid AND status IN ('approved','published')`.execute(
                      tx,
                    )
                  ).rows.length === 1;
                return approved ? deployment : null;
              });
            if (
              !visible ||
              visible.targetPlane !== coordinate.targetPlane ||
              ![
                "pending",
                "dispatched",
                "received",
                "staged",
                "verified",
              ].includes(visible.deploymentStatus)
            )
              return null;
            const database = databases[coordinate.targetPlane];
            if (!database)
              throw new Error("PUBLICATION_APPLIER_DATABASE_UNAVAILABLE");
            const principalId = await database
              .transaction()
              .execute(async (tx) => {
                await sql`SELECT set_config('app.current_tenant_id',${coordinate.tenantId},true)`.execute(
                  tx,
                );
                const rows = (
                  await sql<{ id: string }>`SELECT id FROM master.principal
              WHERE tenant_id=${coordinate.tenantId}::uuid
                AND code=${process.env["PUBLICATION_APPLIER_PRINCIPAL_CODE"] ?? "publication.worker"}
                AND principal_type='service_account' AND status='active'`.execute(
                    tx,
                  )
                ).rows;
                if (rows.length !== 1)
                  throw new Error(
                    "PUBLICATION_APPLIER_SERVICE_PRINCIPAL_REQUIRED",
                  );
                return rows[0]!.id;
              });
            return {
              planeKey: coordinate.targetPlane,
              tenantId: coordinate.tenantId,
              principalId,
              scope: "tenant" as const,
            };
          },
          container.adapters.openTelemetry?.metrics,
          async (coordinate, outcome) => {
            await audit.record({
              eventCode: `publication.recovery.${outcome}`,
              action: "publication_recovery",
              outcome: outcome === "enqueue_failed" ? "failure" : "success",
              severity: "info",
              tenantId: coordinate.tenantId,
              actor: { kind: "service", principalId: SYSTEM_PRINCIPAL_ID },
              entityType: "publication.deployment",
              entityId: coordinate.deploymentId,
              metadata: { targetPlane: coordinate.targetPlane },
            });
          },
        ),
      );
    }
    container.runtimes.jobDefinitions.push({
      code: APPLY_PUBLICATION_RELEASE_JOB,
      owner: "@athyper/server-service-publication",
      queue: PUBLICATION_APPLY_QUEUE,
      name: APPLY_PUBLICATION_RELEASE_JOB,
      scope: "tenant",
      payloadSchema: { name: APPLY_PUBLICATION_RELEASE_JOB, version: 1 },
      timeoutMs: 120_000,
      maxAttempts: 5,
      executionRetentionDays: 90,
    });
    container.runtimes.jobDefinitions.push({
      code: RECOVER_STALLED_PUBLICATIONS_JOB,
      owner: "@athyper/server-service-publication",
      queue: PUBLICATION_MAINTENANCE_QUEUE,
      name: RECOVER_STALLED_PUBLICATIONS_JOB,
      scope: "plane",
      payloadSchema: { name: RECOVER_STALLED_PUBLICATIONS_JOB, version: 1 },
      timeoutMs: 60_000,
      maxAttempts: 3,
      executionRetentionDays: 90,
    });
    container.runtimes.jobDefinitions.push({
      code: ROLLBACK_PUBLICATION_RELEASE_JOB,
      owner: "@athyper/server-service-publication",
      queue: PUBLICATION_APPLY_QUEUE,
      name: ROLLBACK_PUBLICATION_RELEASE_JOB,
      scope: "tenant",
      payloadSchema: { name: ROLLBACK_PUBLICATION_RELEASE_JOB, version: 1 },
      timeoutMs: 120_000,
      maxAttempts: 3,
      executionRetentionDays: 90,
    });
  }
  if (container.runtimes.scheduler && config.publication.recoveryEnabled)
    container.runtimes.scheduledJobs.push({
      scheduleId: "publication-recover-stalled",
      queue: PUBLICATION_MAINTENANCE_QUEUE,
      name: RECOVER_STALLED_PUBLICATIONS_JOB,
      data: {},
      pattern: {
        kind: "interval",
        everyMs: config.publication.recoveryIntervalMs,
      },
      options: {
        jobId: "publication:recover-stalled",
        maxAttempts: 3,
        payloadSchema: { name: RECOVER_STALLED_PUBLICATIONS_JOB, version: 1 },
        execution: {
          planeKey: "studio",
          scope: "plane",
          principalId: SYSTEM_PRINCIPAL_ID,
        },
      },
    });
  if (
    container.runtimes.jobs &&
    (config.publication.compileEnabled || config.publication.dispatchEnabled)
  ) {
    if (
      !container.adapters.publicationSigner ||
      !container.adapters.objectStorageArtifactsBucket
    )
      throw new Error(
        "Publication authority signer and bucket are unavailable",
      );
    const resourceConfiguration = readResourcePublicationConfiguration(
      process.env,
    );
    const work = new KyselyPublicationAuthorityWork({
      ...(resourceConfiguration
        ? {
            authoringResourcePublicationFactory: (database) =>
              createResourcePublication({
                database,
                configuration: resourceConfiguration,
                canonical: { canonicalBytes, sha256 },
                componentQualifier: createDeployedComponentQualification(
                  process.env,
                  { canonicalBytes, sha256 },
                ),
              }),
          }
        : {}),
      caseOperationCatalog: async () => {
        const db = container.adapters.neonDatabase?.database;
        if (!db) throw new Error("COMPANY_CASE_CATALOG_UNAVAILABLE");
        const result = await sql<{
          id: string;
          code: string;
          kind: string;
          scopeKinds: string[];
        }>`SELECT p.id,p.canonical_code code,p.permission_kind kind,
          array_agg(DISTINCT s.scope_kind::text) AS "scopeKinds" FROM authz.permission p
          JOIN authz.permission_scope_kind s ON s.permission_id=p.id AND s.status='active' AND s.propagation_mode='exact'
          WHERE p.status='published' AND p.canonical_code LIKE 'neon.relationship.bp_company_setup_request.%'
          GROUP BY p.id,p.canonical_code,p.permission_kind`.execute(db);
        return result.rows;
      },
      ...(authorizationCompilation ? { authorizationCompilation } : {}),
      ...(compiledRuntimePublication ? { compiledRuntimePublication } : {}),
      ...(devRuntime
        ? {
            authorizeEntityActivation: async (releaseId: string) => {
              await devRuntime.authorizeActivation(releaseId);
            },
          }
        : {}),
      database: authorityDatabase,
      authority,
      store: container.adapters.publicationArtifactStore!,
      signer: container.adapters.publicationSigner,
      canonicalizer: { canonicalBytes, sha256 },
      bucket: container.adapters.objectStorageArtifactsBucket,
      signingKeyId: config.publication.signingKeyId!,
      targetEnvironment: config.env,
      targetInstance:
        coordinatedWorkload?.instance ?? process.env["ATHYPER_INSTANCE"],
      targetPlanes: config.publication.targetPlanes,
    });
    const handlers = createPublicationAuthorityHandlers(
      work,
      container.runtimes.jobs,
      async (execution, plane, deploymentId) => {
        if (!execution.tenantId)
          throw new Error("PUBLICATION_APPLIER_TENANT_REQUIRED");
        const adapter =
          plane === "neon"
            ? container.adapters.neonDatabase
            : plane === "mesh"
              ? container.adapters.meshDatabase
              : container.adapters.athyperDatabase;
        if (!adapter)
          throw new Error("PUBLICATION_APPLIER_DATABASE_UNAVAILABLE");
        const database = adapter.database as unknown as Kysely<
          Record<string, never>
        >;
        const coordinatedPrincipal = await coordinatedApplyPrincipal({
          authority: authorityDatabase,
          target: database,
          configuration: coordinatedWorkload,
          execution,
          plane,
          deploymentId,
        });
        if (coordinatedPrincipal)
          return {
            ...execution,
            planeKey: plane,
            principalId: coordinatedPrincipal,
          };
        const principalId = await database
          .transaction()
          .execute(async (transaction) => {
            await sql`SELECT set_config('app.current_tenant_id',${execution.tenantId!},true)`.execute(
              transaction,
            );
            const rows = (
              await sql<{
                id: string;
              }>`SELECT id FROM master.principal WHERE tenant_id=${execution.tenantId!}::uuid AND code=${process.env["PUBLICATION_APPLIER_PRINCIPAL_CODE"] ?? "publication.worker"} AND principal_type='service_account' AND status='active'`.execute(
                transaction,
              )
            ).rows;
            if (rows.length !== 1)
              throw new Error("PUBLICATION_APPLIER_SERVICE_PRINCIPAL_REQUIRED");
            return rows[0]!.id;
          });
        return { ...execution, planeKey: plane, principalId };
      },
      { dispatchEnabled: config.publication.dispatchEnabled },
    );
    for (const name of [
      COMPILE_PUBLICATION_ARTIFACT_JOB,
      SIGN_PUBLICATION_ARTIFACT_JOB,
      DISPATCH_PUBLICATION_JOB,
    ] as const)
      container.runtimes.jobs.register(
        PUBLICATION_AUTHORITY_QUEUE,
        name,
        handlers[name]!,
      );
    for (const name of [
      COMPILE_PUBLICATION_ARTIFACT_JOB,
      SIGN_PUBLICATION_ARTIFACT_JOB,
      DISPATCH_PUBLICATION_JOB,
    ])
      container.runtimes.jobDefinitions.push({
        code: name,
        owner: "@athyper/server-service-publication",
        queue: PUBLICATION_AUTHORITY_QUEUE,
        name,
        scope: "plane",
        payloadSchema: { name, version: 1 },
        timeoutMs: 120_000,
        maxAttempts: 5,
        executionRetentionDays: 90,
      });
  }
  if (container.runtimes.jobs && config.publication.apiEnabled) {
    const operations = new PublicationOperationsService({
      repository: new KyselyPublicationOperationsRepository(authorityDatabase),
      jobs: container.runtimes.jobs,
      audit,
    });
    container.platform.httpRegistrars.push((application) => {
      registerPublicationRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer,
        audit,
        authority,
        jobs: container.runtimes.jobs!,
        apiEnabled: true,
        operations,
        authorizeRollbackTarget: (input) =>
          hasTenantRollbackTarget(authorityDatabase, input),
      });
    });
  }
}

function combineRecordCollectionScopeResolvers(
  neon: RecordCollectionScopeResolver,
  mesh: RecordCollectionScopeResolver,
  studio: RecordCollectionScopeResolver,
): RecordCollectionScopeResolver {
  const resolvers = { neon, mesh, studio } as const;
  return Object.freeze({
    resolve(input: Parameters<RecordCollectionScopeResolver["resolve"]>[0]) {
      return resolvers[input.context.planeKey].resolve(input);
    },
  });
}

function createDatabaseOutboxWriter(
  source:
    | "records"
    | "workflow"
    | "documents"
    | "collaboration"
    | "integration"
    | "governance"
    | "finance"
    | "attachments"
    | "master-data",
): OutboxWriter<RecordTransaction> {
  return {
    async append(event, transaction) {
      if (!transaction)
        throw new Error(
          `${source} outbox writes require the active transaction`,
        );
      await sql`
        INSERT INTO event.outbox
          (tenant_id, topic, event_type, event_key, entity_type, entity_id,
           aggregate_type, aggregate_id, actor_id, source, correlation_id, causation_id, partition_key, payload, created_by)
        VALUES
          (${event.tenantId}::uuid, ${event.topic}, ${event.eventType}, ${event.eventKey ?? null},
           ${event.entityType ?? null}, ${event.entityId ?? null}::uuid,
           ${event.aggregateType ?? null}, ${event.aggregateId ?? null}::uuid,
           ${event.actorId}::uuid, ${source}, ${event.correlationId ?? null}::uuid,
           ${event.causationId ?? null}::uuid, ${event.partitionKey ?? null}, ${JSON.stringify(event.payload ?? {})}::jsonb,
           ${event.actorId}::uuid)
      `.execute(transaction);
    },
  };
}

async function governanceComplianceDatabaseHealth(
  database: Kysely<Record<string, never>>,
) {
  await sql`SELECT 1 FROM governance.legal_hold LIMIT 1`.execute(database);
  await sql`SELECT 1 FROM governance.legal_hold_manifest LIMIT 1`.execute(
    database,
  );
  await sql`SELECT 1 FROM governance.report_pack LIMIT 1`.execute(database);
}
async function dependencyHealth(
  configured: boolean,
  probe:
    | (() => Promise<{ readonly healthy: boolean; readonly message?: string }>)
    | undefined,
  missing: string,
) {
  if (!configured) return { status: "unhealthy" as const, message: missing };
  if (!probe) return { status: "healthy" as const };
  try {
    const result = await probe();
    return result.healthy
      ? { status: "healthy" as const }
      : { status: "unhealthy" as const, message: result.message ?? missing };
  } catch (error) {
    return {
      status: "unhealthy" as const,
      message: error instanceof Error ? error.message : missing,
    };
  }
}
async function controlDatabaseHealth(database: Kysely<Record<string, never>>) {
  await sql`SELECT 1 FROM control.cycle_template_revision LIMIT 1`.execute(
    database,
  );
  return { status: "healthy" as const };
}

const denyAllConsent = {
  record: async () => {
    throw new Error("Governance database is unavailable");
  },
  revoke: async () => {
    throw new Error("Governance database is unavailable");
  },
  checkAt: async () => null,
  history: async () => ({ items: [], hasMore: false }),
} satisfies ChannelConsentService<RecordTransaction>;

/** BP domain mapping stays at composition; generic metadata never knows request kinds. */
