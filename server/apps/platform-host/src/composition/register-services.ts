import { addressFormChoices, bankFormChoices, bankFormSources } from "@athyper/server-service-records";
import { validateProfileIntake } from "@athyper/server-service-master-data";
import {validateDataInput,dataFieldVisible} from "@athyper/server-contract-metadata";
import { companySetupCaseInitialSchema } from "@athyper/server-service-publication";
import {
  createBusinessPartnerCompanyPilotService,
  BP_COMPANY_PILOT_CASE_ENTITY,
  BP_COMPANY_PILOT_ENTITY,
  BP_COMPANY_PILOT_PERMISSION_PREFIX,
  type BusinessPartnerRequestServiceOptions,
} from "@athyper/server-service-master-data";
import { localGraphPreview } from "./local-graph-preview.js";
import { prepareDocumentCollectionRelease } from "@athyper/server-plane-studio";
import { businessPartnerInitialCaseSchema } from "@athyper/server-service-publication";
import { businessPartnerCaseAuthority, localBusinessPartnerCaseAuthority } from "./business-partner-case-authority.js";
import { RedisInferenceAdmission } from "./atlas-inference-admission.js";
import { parseAtlasSemanticConfig } from "./atlas-semantic-index.js";
import { createAtlasDocumentGrounding } from "./atlas-document-grounding.js";
import { registerAtlasAttachmentKnowledge } from "./atlas-attachment-knowledge.js";
import { createAuthenticatedEntityReleaseReview } from "@athyper/server-service-publication";
import { getRequestContext as authoringRequestContext } from "@athyper/server-foundation/context";
import { createMetaEntityAuthoringAuthorizer } from "./meta-entity-authoring-authorizer.js";
import {
  createBusinessPartnerQualificationRuntimeRegistrations,
  qualificationPreflight,
} from "./business-partner-qualification-runtime.js";
import { createBusinessPartnerRevealRuntimeRegistrations } from "./business-partner-reveal-runtime.js";
import { createScopedMetaEntityAuthoringRepository } from "./scoped-meta-entity-authoring.js";
import {
  createBusinessPartnerCaseRuntimeRegistrations,
  assertBusinessPartnerCaseRuntimeSemantics,
} from "./business-partner-case-runtime.js";
import { createBusinessPartnerReadRuntimeRegistrations } from "./business-partner-read-runtime.js";
import { createBusinessPartnerActionRuntimeRegistrations } from "./business-partner-action-runtime.js";
import {
  createBusinessPartnerBoundImport,
  createBusinessPartnerImportRegistration,
} from "./business-partner-bound-import.js";
import {
  isPublishedBusinessPartnerTargetRead,
  isPublishedBusinessPartnerTargetReveal,
} from "./business-partner-target-read-policy.js";
import { businessPartnerImportPolicy } from "./business-partner-import-runtime.js";
import { createBusinessPartnerExportRegistration } from "./business-partner-export-runtime.js";
import { registerBusinessPartnerGovernedImportRoutes } from "@athyper/server-service-master-data";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import { createConfiguredAuthorizationManagement } from "./authorization-management-config.js";
import {
  AtlasLearningCandidateService,
  isAtlasLearningSourceCurrent,
  evaluateAtlasLearningVocabulary,
} from "@athyper/server-platform-ai";
import {
  AtlasLearningInbox,
  registerAtlasLearningInboxRoutes,
  prepareAtlasLearningRelease,
  prepareInitialBaselineRelease,
  prepareAuthorizationSuccessorRelease,
  prepareRuntimeRestorationRelease,
  baselineJsonHash,
  sha256 as baselineContentHash,
} from "@athyper/server-plane-studio";
import { createBusinessPartnerStoredScopes } from "./business-partner-stored-scopes.js";
import { createEntityCasePreflight } from "./entity-case-preflight.js";
import { createEntityCaseBackendMapping } from "./entity-case-backend-mapping.js";
import { createKyselyContextRefresh } from "@athyper/server-platform-iam";
import { createBusinessPartnerBackendMapping } from "./business-partner-backend-mapping.js";
import {
  createBusinessPartnerAuthorizationShadow,
  createBusinessPartnerShadowScopes,
} from "./business-partner-authorization-shadow.js";
import {
  BankDirectoryService,
  registerBankDirectoryRoutes,
  registerBankDirectoryReferenceRoute,
  reconcileBankDirectoryReferences,
} from "@athyper/server-service-publication";
import { createBankDirectoryAuthorizer } from "./bank-directory-authorizer.js";
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
  queueLocalVerificationEmail,
  localVerificationEmailHandler,
} from "./local-verification-delivery.js";
import {
  KyselyContactChallengeRepository,
  createContactVerificationAuthority,
  createMasterDataAuthority,
} from "@athyper/server-service-master-data";
import { createKyselyEntitlementRuntime } from "@athyper/server-platform-entitlements";
import { registerMasterData } from "./register-master-data.js";
import {
  createProviderEvidenceVerifier,
  KyselyMasterDataRepository,
} from "@athyper/server-service-master-data";
import type { MasterDataServiceOptions } from "@athyper/server-service-master-data";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import { checkMeshExchangeReadiness } from "./mesh-exchange-readiness.js";
import { TenantPublicationOrchestrator } from "./tenant-publication-orchestrator.js";
import { createBusinessPartnerDefinitionAuthorizer } from "./business-partner-definition-authorizer.js";
import type {
  CommandExecutionStore,
  OutboxWriter,
} from "@athyper/server-contract-events";
import type { ProvisioningCommandTransport } from "@athyper/server-contract-integration";
import type {
  AuthorizationManagementRolloutPolicySource,
  AuthorizationWriterSwitchGate,
  AuthorizationManagementUnitOfWork,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
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
  createPermissionAuthorizer,
  readSourcePermissionRequirement,
  createShadowAuthorizer,
  readVerifiedRequestContext,
} from "@athyper/server-platform-iam";
import {
  createExperienceInvalidationHooks,
  createExperienceService,
  createMemoryExperienceCache,
  registerExperienceRoutes,
} from "@athyper/server-platform-experience";
import { KyselyExperiencePlaneRepository } from "@athyper/server-adapter-experience-postgres";
import {
  createDistributedDescriptorCache,
  createMetadataService,
  createRuntimeDescriptorRepository,
} from "@athyper/server-platform-metadata";
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
  registerEntityViewRoutes,
  registerReferenceChoiceRoutes,
  createReferenceHistoryStore,
} from "@athyper/server-platform-preferences";
import {
  createCollaborationService,
  createKyselyCollaborationRepository,
  createKyselyPrincipalDirectory,
  registerCollaborationRoutes,
} from "@athyper/server-platform-collaboration";
import {
  REPORT_PACK_JOB,
  REPORT_PACK_QUEUE,
  REPORT_PACK_RECOVERY_JOB,
  createChannelConsentService,
  createCycleCertificationService,
  createCycleDeviationService,
  createCycleRunService,
  createCycleTaskService,
  createLegalHoldService,
  createModerationService,
  createReportPackJobHandler,
  createReportPackRecoveryHandler,
  createReportPackService,
  KyselyChannelConsentRepository,
  KyselyCommentModerationRepository,
  KyselyCycleExecutionRepository,
  KyselyLegalHoldRepository,
  KyselyReportPackRepository,
  registerGovernanceComplianceRoutes,
  registerGovernanceRoutes,
} from "@athyper/server-platform-governance";
import {
  assertControlServiceRoutePlaneSafety,
  controlAdminFoundation,
  createAuthorizationManagementService,
  createKyselyControlRepositories,
  createKyselyAuthorizationManagementUnitOfWork,
  type LegacyAuthorizationTransactionBinder,
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
  createSafeAuthorizationManagementRolloutSelector,
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
  AtlasSurfaceDraftGenerator,
  AtlasThreadService,
  AtlasToolRegistry,
  createAtlasRecordDataGateway,
  createBusinessPartnerAtlasTools,
  createBusinessPartnerCaseTools,
  createBusinessPartnerInsightTools,
  createBusinessPartnerAtlasCommandBus,
  AtlasToolService,
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
  createCommandEnvelopeFactory,
  createGuestAccessExpiryHandler,
  createOnboardingSaga,
  createStudioCatalogMetadataReader,
  createStudioMetadataDraftImportAdapter,
  createStudioRecordCollectionScopeResolver,
  EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,
  KyselyMetaEntityAuthoringRepository,
  KyselyOnboardingSagaRepository,
  MetaEntityAuthoringService,
  OnboardingCaseLifecycleService,
  OnboardingMaintenanceService,
  ONBOARDING_MAINTENANCE_QUEUE,
  PublicationServiceMetaEntityAdapter,
  registerMetaEntityAuthoringRoutes,
  registerOnboardingRoutes,
} from "@athyper/server-plane-studio";
import {
  BUSINESS_PARTNER_DELIVERY_QUEUE,
  BusinessPartnerDeliveryWorker,
  createBusinessPartnerDeliveryHandler,
  createBusinessPartnerReconciliationHandler,
  createBusinessPartnerBankDisclosureService,
  createBusinessPartnerNetworkExchangeService,
  createHttpSelfRegistrationPolicyAdapter,
  createBusinessPartnerProfilePublicationService,
  createMeshRecordCollectionScopeResolver,
  createMeshRelationshipRequestImportAdapter,
  DELIVER_BUSINESS_PARTNER_EVENTS_JOB,
  KyselyBusinessPartnerBankDisclosureRepository,
  KyselyBusinessPartnerNetworkExchangeRepository,
  KyselyBusinessPartnerDeliveryRepository,
  KyselyBusinessPartnerProfilePublicationRepository,
  RECONCILE_BUSINESS_PARTNER_EVENTS_JOB,
  registerBusinessPartnerBankDisclosureRoutes,
  registerBusinessPartnerNetworkExchangeRoutes,
  resolveMeshNetworkAccountContext,
  registerBusinessPartnerProfilePublicationRoutes,
  type BusinessPartnerDeliveryItem,
  type DeliveryDisposition,
} from "@athyper/server-plane-mesh";
import {
  createBusinessPartnerAccountBankLinkageService,
  createBusinessPartnerProfileMatchService,
  createBusinessPartnerProfileProjectionService,
  createNeonBusinessPartnerImportAdapter,
  createNeonRecordCollectionScopeResolver,
  financeJobDefinitions,
  financeSliceOrder,
  KyselyBusinessPartnerAccountBankRepository,
  KyselyBusinessPartnerProfileMatchRepository,
  KyselyBusinessPartnerProfileProjectionRepository,
  registerBusinessPartnerAccountBankLinkageRoutes,
  registerBusinessPartnerProfileMatchRoutes,
  registerBusinessPartnerProfileProjectionRoutes,
  registerFinance as registerNeonFinance,
  registerFinanceHttpRoutes,
  registerFinanceJobHandlers,
  type FinanceRegistrationPorts,
  type MeshBankDisclosureEnvelope,
  type MeshBusinessPartnerProfileEnvelope,
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
  createNotificationPreferenceService,
  createKyselyNotificationPreferenceStore,
  createKyselyNotificationOperationsRepository,
  createKyselyPreferenceCapabilities,
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
  EXPIRE_ATTACHMENT_RESERVATIONS_JOB,
  createAttachmentLifecycle,
  createAttachmentRetrievalAdmission,
  createAttachmentQuotaRecoveryHandler,
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
  createBusinessPartnerJournalActivityReader,
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
import {
  BUSINESS_PARTNER_INVITATION_MAINTENANCE_QUEUE,
  createBusinessPartnerEligibilityService,
  createBusinessPartnerInvitationExpiryHandler,
  createBusinessPartnerInvitationExternalGuard,
  createBusinessPartnerInvitationService,
  createBusinessPartnerRequestService,
  createBusinessPartnerRequestValidator,
  createGovernedInternalBusinessPartnerCaseService,
  createSupplierActivationReevaluationHandler,
  createSupplierQualificationExpiryHandler,
  createSupplierWorkforceRequisitionService,
  createSupplierWorkforceCommandGuard,
  createWorkerEngagementIamService,
  createWorkerEngagementLifecycleService,
  createHttpSupplierWorkforceDistributionEligibility,
  createWorkforceService,
  EXPIRE_BUSINESS_PARTNER_INVITATIONS_JOB,
  EXPIRE_SUPPLIER_QUALIFICATIONS_JOB,
  KyselyBusinessPartnerEligibilityRepository,
  KyselyBusinessPartnerInvitationRepository,
  KyselyBusinessPartnerOnboardingCycleCoordinator,
  KyselyBusinessPartnerCaseRepository,
  KyselyGovernedInternalBusinessPartnerCaseRepository,
  KyselyWorkforceRepository,
  KyselyWorkforceRequestRepository,
  KyselySupplierWorkforceRequisitionRepository,
  KyselyWorkerEngagementIamRepository,
  KyselyWorkerEngagementLifecycleRepository,
  MasterDataError,
  REEVALUATE_SUPPLIER_ACTIVATIONS_JOB,
  registerBusinessPartnerEligibilityRoutes,
  registerBusinessPartnerInvitationRoutes,
  registerBusinessPartnerRequestRoutes,
  registerGovernedInternalBusinessPartnerRoutes,
  registerWorkforceRoutes,
  registerSupplierWorkforceRequisitionRoutes,
  registerWorkerEngagementIamRoutes,
  registerWorkerEngagementLifecycleRoutes,
  SUPPLIER_READINESS_MAINTENANCE_QUEUE,
} from "@athyper/server-service-master-data";
import {
  createBusinessPartner360Service,
  createBusinessPartnerAtlasInsightOwner,
  createHttpBusinessPartner360MeshNetworkAdapter,
  createLastValidBusinessPartner360DefinitionResolver,
  createSecretStoreProtectedValueResolver,
  createUnavailableBusinessPartner360ActivityProviders,
  KyselyBusinessPartner360Repository,
  parseBusinessPartner360Definition,
  registerBusinessPartner360Routes,
} from "@athyper/server-service-master-data";
import {
  BUSINESS_PARTNER_360_PERMISSIONS,
  parseSupplierWorkforcePolicyCoordinates,
} from "@athyper/server-contract-master-data";
import { registerFinanceRoutes } from "./finance-routes.js";
import {
  createKyselyRecordRepository,
  createKyselyCommandExecutionStore,
  createEntityBackendAuthorizer,
  createRecordMutationService,
  createRecordListExecutor,
  createRecordQueryService,
  createEntityListService,
  createRecordBookmarkService,
  createRecordSnapshotService,
  KyselyRecordSnapshotRepository,
  registerRecordSnapshotRoutes,
  registerRecordsRoutes,
  registerEntityListRoutes,
  parseEntityListScopeCoordinate,
  registerRecordBookmarkRoutes,
  KyselyRecordTransferStore,
  createMetadataImportRowValidator,
  createObjectStorageRecordTransferArtifactStore,
  createObjectStorageImportWorkbookIntake,
  createRecordTransferJobDispatcher,
  createRecordTransferService,
  createRecordImportHandler,
  GovernedImportAdapterRegistry,
  createRecordExportHandler,
  registerRecordTransferRoutes,
  registerPublicRecordTransferRoutes,
  RECORD_TRANSFER_QUEUE,
  EXECUTE_RECORD_IMPORT_JOB,
  EXECUTE_RECORD_EXPORT_JOB,
  MAINTAIN_RECORD_TRANSFERS_JOB,
  RECORD_TRANSFER_MAINTENANCE_QUEUE,
  createRecordTransferMaintenanceHandler,
} from "@athyper/server-service-records";
import { sql, type Kysely, type Transaction } from "kysely";
import { stampTransactionActor } from "@athyper/server-adapter-db-core";
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
  KyselyLocalProjectionRepository,
  LocalBusinessPartnerDefinitionConsumer,
  LocalMeshBusinessPartnerDefinitionConsumer,
  KyselyPublicationAuthorityRepository,
  KyselyPublicationAuthorityWork,
  BusinessPartnerDefinitionService,
  BusinessPartnerCaseContractService,
  registerBusinessPartnerCaseContractRoutes,
  KyselyPublicationOperationsRepository,
  PublicationOrchestrator,
  PublicationOperationsService,
  PUBLICATION_APPLY_QUEUE,
  PUBLICATION_AUTHORITY_QUEUE,
  PUBLICATION_MAINTENANCE_QUEUE,
  RECOVER_STALLED_PUBLICATIONS_JOB,
  ROLLBACK_PUBLICATION_RELEASE_JOB,
  registerPublicationRoutes,
  registerBusinessPartnerDefinitionRoutes,
  registerLocalBusinessPartnerDefinitionRoutes,
  VerifiedPublicationArtifactLoader,
} from "@athyper/server-service-publication";
import type { PublicationPlane } from "@athyper/server-contract-publication";
import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";
import { registerVerification } from "./verification-routes.js";
import { createHash, randomUUID } from "node:crypto";

type RecordTransaction = Transaction<Record<string, never>>;

export interface ServiceRegistrationDependencies {
  readonly businessPartnerBackendAuthorizationTenantId?: string;
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
  readonly businessPartnerBackendAuthorization?: Omit<
    Parameters<typeof createEntityBackendAuthorizer>[0],
    "authority" | "owns" | "target" | "refreshContext"
  > &
    Partial<
      Pick<
        Parameters<typeof createEntityBackendAuthorizer>[0],
        "refreshContext"
      >
    >;
  readonly entityAuthorizationShadow?: Omit<
    Parameters<typeof createShadowAuthorizer>[0],
    "authority"
  >;
  /** Immutable source/destination adapters required by qualified Neon finance slices. */
  readonly finance?: FinanceRegistrationPorts;
  readonly metadata?: MetadataReader;
  /** Override the default PostgreSQL repository and optionally supply a trusted evidence verifier. */
  readonly masterData?: Partial<
    Pick<
      MasterDataServiceOptions<RecordTransaction>,
      "repository" | "evidenceVerifier"
    >
  >;
  readonly repository?: RecordRepository<RecordTransaction>;
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
  readonly authorizationManagement?: {
    readonly unitOfWork?: AuthorizationManagementUnitOfWork;
    readonly legacyTransactionBinder?: LegacyAuthorizationTransactionBinder;
    readonly writerDatabases?: Readonly<
      Partial<Record<PlaneKey, Kysely<Record<string, never>>>>
    >;
    readonly rolloutPolicies: AuthorizationManagementRolloutPolicySource;
    readonly writerGate: AuthorizationWriterSwitchGate;
  };
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
): void {
  let intakeReferenceRecord: ReturnType<typeof createEntityListService>["record"] | undefined;
  let intakeApplicationDescriptor: ReturnType<typeof createEntityListService>["applicationDescriptor"] | undefined;
  const { iam, authorizer: baseAuthorizer, audit } = container.platform;
  if (!iam || !baseAuthorizer || !audit) return;
  const bpShadow =
    config?.businessPartnerAuthorizationShadow &&
    container.adapters.neonDatabase
      ? createBusinessPartnerAuthorizationShadow({
          config: config.businessPartnerAuthorizationShadow,
          scopes: createBusinessPartnerShadowScopes(
            container.adapters.neonDatabase.database as unknown as Kysely<
              Record<string, never>
            >,
          ),
          emit: (event) => console.info(JSON.stringify(event)),
        })
      : undefined;
  if (config?.businessPartnerAuthorizationShadow && !bpShadow)
    throw new Error("BP shadow requires the NEON database");
  if (bpShadow)
    container.platform.httpRegistrars.push((application) =>
      bpShadow.register(application),
    );
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
  const caseScopes = () => {
    if (!container.adapters.neonDatabase)
      throw new Error("CASE_OWNERSHIP_DATABASE_UNAVAILABLE");
    const database = container.adapters.neonDatabase
      .database as unknown as Kysely<Record<string, never>>;
    return createBusinessPartnerStoredScopes(
      database,
      createEntityCasePreflight(database),
    );
  };
  const observeAuthority = (authority: typeof baseAuthorizer) => {
    if (
      bpShadow &&
      dependencies.businessPartnerBackendAuthorization?.rollout.mode ===
        "enforce"
    )
      throw new Error(
        "BP legacy shadow and target enforcement require separate rollout selections",
      );
    const bpBackend = dependencies.businessPartnerBackendAuthorization
      ? createEntityBackendAuthorizer({
          ...dependencies.businessPartnerBackendAuthorization,
          ...createBusinessPartnerBackendMapping(
            dependencies.businessPartnerBackendAuthorization.profile,
          ),
          owns: (
            request: import("@athyper/server-contract-auth").AuthorizationRequest,
          ) =>
            (!dependencies.businessPartnerBackendAuthorizationTenantId ||
              request.context.tenantId ===
                dependencies.businessPartnerBackendAuthorizationTenantId) &&
            (!dependencies.entityCaseBackendAuthorization ||
              request.resource?.["entityCode"] !== "entity_case") &&
            createBusinessPartnerBackendMapping(
              dependencies.businessPartnerBackendAuthorization!.profile,
            ).owns(request),
          scopes: {
            resolve: (input) =>
              dependencies.businessPartnerBackendAuthorization!.scopes.resolve(
                input,
              ),
            preflight: async (input) => {
              if (
                input.operationKey === "qualification" ||
                input.operationKey === "qualification_company"
              ) {
                const service = container.services.businessPartnerEligibility;
                return service
                  ? qualificationPreflight(service, input)
                  : "not_applicable";
              }
              if (
                input.operationKey === "bank_reveal" ||
                input.operationKey === "tax_reveal"
              ) {
                if (!input.recordId) return "not_applicable";
                return (
                  container.services.businessPartner360?.preflightReveal?.({
                    context: input.context,
                    businessPartnerId: input.recordId,
                    kind: input.operationKey === "bank_reveal" ? "bank" : "tax",
                    historical: input.historical,
                  }) ?? "not_applicable"
                );
              }
              if (input.operationKey === "import")
                return (
                  container.services.businessPartnerGovernedImport?.preflight(
                    input,
                  ) ?? "not_applicable"
                );
              if (input.operationKey === "export") {
                if (input.historical) return "workflow_blocked";
                const transfers = container.services.records?.transfers;
                if (!transfers) return "not_applicable";
                await transfers.preflightExport(
                  input.context,
                  "business_partner",
                  {
                    ...(input.coordinates
                      ? { scopeCoordinate: input.coordinates }
                      : {}),
                  },
                );
                return "allowed";
              }
              return dependencies.businessPartnerBackendAuthorization!.scopes.preflight(
                input,
              );
            },
          },
          refreshContext:
            dependencies.businessPartnerBackendAuthorization.refreshContext ??
            refreshEntityContext,
          authority: businessPartnerCaseAuthority(
            authority,
            dependencies.businessPartnerBackendAuthorization.profile,
            dependencies.businessPartnerBackendAuthorizationTenantId,
          ),
        })
      : dependencies.entityCaseBackendAuthorization ? authority : localBusinessPartnerCaseAuthority(authority);
    const backend = dependencies.entityCaseBackendAuthorization
      ? createEntityBackendAuthorizer({
          ...dependencies.entityCaseBackendAuthorization,
          ...createEntityCaseBackendMapping(
            dependencies.entityCaseBackendAuthorization.profile,
          ),
          scopes:
            dependencies.entityCaseBackendAuthorization.scopes ?? caseScopes(),
          refreshContext:
            dependencies.entityCaseBackendAuthorization.refreshContext ??
            refreshEntityContext,
          authority: bpBackend,
        })
      : bpBackend;
    const selected = bpShadow ? bpShadow.wrap(backend) : backend;
    return dependencies.entityAuthorizationShadow
      ? createShadowAuthorizer({
          ...dependencies.entityAuthorizationShadow,
          authority: selected,
        })
      : selected;
  };
  const authorizer = observeAuthority(baseAuthorizer);

  const recordDatabases = {
    ...(container.adapters.neonDatabase
      ? { neon: container.adapters.neonDatabase.database }
      : {}),
    ...(container.adapters.meshDatabase
      ? { mesh: container.adapters.meshDatabase.database }
      : {}),
  } as unknown as Partial<Record<PlaneKey, Kysely<Record<string, never>>>>;
  const metadataDatabases = {
    ...recordDatabases,
    ...(container.adapters.athyperDatabase
      ? { studio: container.adapters.athyperDatabase.database }
      : {}),
  } as Partial<Record<PlaneKey, Kysely<Record<string, never>>>>;
  const parameterRepositories =
    dependencies.controlAdmin?.parameters ??
    createKyselyParameterRepositories(metadataDatabases);
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
    const experienceRepositories = createExactPlaneRepositoryProvider(
      Object.fromEntries(
        Object.entries(metadataDatabases).map(([planeKey, database]) => {
          const adapter =
            experienceAdapters[planeKey as keyof typeof experienceAdapters];
          if (!adapter)
            throw new Error(
              `Experience database adapter is missing for ${planeKey}`,
            );
          return [
            planeKey,
            new KyselyExperiencePlaneRepository(database, (_context, work) =>
              adapter.withTenantTransaction((transaction) =>
                work(transaction as unknown as Kysely<Record<string, never>>),
              ),
            ),
          ];
        }),
      ) as Partial<Record<PlaneKey, KyselyExperiencePlaneRepository>>,
      { unavailableCode: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
    );
    const experienceCache = createMemoryExperienceCache();
    const experience = createExperienceService({
      repositories: experienceRepositories,
      cache: experienceCache,
      ...(config?.wave0.controlAdminParametersEnabled
        ? {
            readRuntimeDefaults: createExperienceParameterConsumer(
              parameterRepositories,
            ),
          }
        : {}),
    });
    container.platform.experience = {
      service: experience,
      invalidation: createExperienceInvalidationHooks(experienceCache),
    };
    container.platform.httpRegistrars.push((application) =>
      registerExperienceRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: experience,
      }),
    );
    for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[]) {
      container.runtimes.health.register(`experience.${planeKey}`, async () => {
        const health = await experienceRepositories.health(planeKey);
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
              assertBusinessPartnerCaseRuntimeSemantics(profile);
              if (dependencies.entityAuthorizationPublication) {
                dependencies.entityAuthorizationPublication.runtime.qualify(
                  profile,
                  bindings,
                );
                return;
              }
              const cases = container.services.businessPartnerRequests;
              if (!cases) throw Error("BP_CASE_RUNTIME_SERVICE_UNAVAILABLE");
              const records = container.services.records;
              const providers = container.services.businessPartner360;
              if (!records?.surfaces || !providers)
                throw Error("BP_READ_RUNTIME_SERVICE_UNAVAILABLE");
              const imports = container.services.businessPartnerGovernedImport;
              if (!imports)
                throw Error("BP_IMPORT_RUNTIME_SERVICE_UNAVAILABLE");
              if (!records.transfers)
                throw Error("BP_EXPORT_RUNTIME_SERVICE_UNAVAILABLE");
              const eligibility = container.services.businessPartnerEligibility;
              if (!eligibility)
                throw Error("BP_QUALIFICATION_RUNTIME_SERVICE_UNAVAILABLE");
              createEntityAuthorizationRuntimeRegistry(
                [
                  ...createBusinessPartnerCaseRuntimeRegistrations(
                    cases,
                    caseScopes(),
                  ),
                  ...createBusinessPartnerReadRuntimeRegistrations(
                    records.surfaces,
                    providers,
                    caseScopes(),
                  ),
                  ...createBusinessPartnerRevealRuntimeRegistrations(
                    providers,
                    caseScopes(),
                  ),
                  ...createBusinessPartnerQualificationRuntimeRegistrations(
                    eligibility,
                    caseScopes(),
                  ),
                  ...createBusinessPartnerActionRuntimeRegistrations(
                    cases,
                    records.queries,
                    caseScopes(),
                  ),
                  createBusinessPartnerImportRegistration(
                    imports,
                    caseScopes(),
                  ),
                  createBusinessPartnerExportRegistration(
                    records.transfers,
                    caseScopes(),
                  ),
                ],
                { sourceConstraints: baseAuthorizer.checkSourceConstraints },
              ).qualify(profile, bindings);
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
  if (!dependencies.metadata && Object.keys(metadataDatabases).length === 0) {
    registerMasterData(container);
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
  const governanceDatabases = createExactPlaneRepositoryProvider(
    metadataDatabases,
    {
      unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE",
      health: {
        ...(metadataDatabases.studio
          ? { studio: governanceDatabaseHealth }
          : {}),
        ...(metadataDatabases.neon ? { neon: governanceDatabaseHealth } : {}),
        ...(metadataDatabases.mesh ? { mesh: governanceDatabaseHealth } : {}),
      },
    },
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
  const consentRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyChannelConsentRepository() }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyChannelConsentRepository() }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyChannelConsentRepository() }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const moderationRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyCommentModerationRepository() }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyCommentModerationRepository() }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyCommentModerationRepository() }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const executionRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyCycleExecutionRepository("studio", transactions) }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyCycleExecutionRepository("neon", transactions) }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyCycleExecutionRepository("mesh", transactions) }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const legalHoldRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyLegalHoldRepository(metadataDatabases.studio) }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyLegalHoldRepository(metadataDatabases.neon) }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyLegalHoldRepository(metadataDatabases.mesh) }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const reportPackRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyReportPackRepository(metadataDatabases.studio) }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyReportPackRepository(metadataDatabases.neon) }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyReportPackRepository(metadataDatabases.mesh) }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const hasGovernanceDatabase = Object.keys(metadataDatabases).length > 0;
  const consent = hasGovernanceDatabase
    ? createChannelConsentService({
        transactions: exactTransactions,
        repositories: consentRepositories,
        audit,
        outbox: createDatabaseOutboxWriter("governance"),
      })
    : undefined;
  const moderation = hasGovernanceDatabase
    ? createModerationService({
        transactions: exactTransactions,
        repositories: moderationRepositories,
        audit,
        outbox: createDatabaseOutboxWriter("governance"),
      })
    : undefined;
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
  if (
    config?.wave0.authorizationManagementRoutesEnabled &&
    config.wave0.authorizationManagementMutationsEnabled &&
    !dependencies.authorizationManagement &&
    !config.wave0.authorizationManagementPolicyPath
  )
    throw new Error(
      "Authorization mutations require configured writer-switch evidence",
    );
  if (
    config?.wave0.authorizationManagementMutationsEnabled &&
    !dependencies.authorizationManagement &&
    !container.adapters.authorizationWriterDatabases
  )
    throw new Error(
      "Authorization mutations require dedicated writer connections",
    );
  const authorizationOptions: ServiceRegistrationDependencies["authorizationManagement"] =
    dependencies.authorizationManagement ??
    (config?.wave0.authorizationManagementRoutesEnabled
      ? createConfiguredAuthorizationManagement(
          config.wave0.authorizationManagementPolicyPath,
        )
      : undefined);
  const authorizationMode =
    config?.wave0.authorizationManagementMode ?? "legacy";
  const authorizationManagement = authorizationOptions
    ? createAuthorizationManagementService({
        unitOfWork:
          authorizationOptions.unitOfWork ??
          createKyselyAuthorizationManagementUnitOfWork(
            authorizationOptions.writerDatabases ??
              container.adapters.authorizationWriterDatabases ??
              metadataDatabases,
            authorizationOptions.legacyTransactionBinder,
          ),
        authorizer,
        rollout: {
          async select(input) {
            const selected =
              await createSafeAuthorizationManagementRolloutSelector(
                authorizationOptions.rolloutPolicies,
              ).select(input);
            if (authorizationMode === "legacy")
              return {
                mode: "legacy",
                revision: `host-legacy:${selected.revision}`,
              };
            if (authorizationMode === "shadow" && selected.mode === "enforce")
              return {
                mode: "shadow",
                revision: `host-shadow:${selected.revision}`,
              };
            if (
              selected.mode === "enforce" &&
              (!config?.wave0.authorizationGoldenEvaluatorCorpusQualified ||
                !config.wave0.authorizationDdlEpochIntegrationQualified ||
                !config.wave0.authorizationWriterSwitchQualified)
            )
              throw Object.assign(
                new Error("AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED"),
                { code: "AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED" },
              );
            return selected;
          },
        },
        writerGate: authorizationOptions.writerGate,
        mutationsEnabled:
          config?.wave0.authorizationManagementMutationsEnabled ?? false,
        audit: {
          async record(input) {
            await audit.record({
              eventCode: `authorization.management.${input.outcome}`,
              action: "manage_authorization",
              outcome: input.outcome === "success" ? "success" : "denied",
              actor: { kind: "user", principalId: input.principalId },
              tenantId: input.tenantId,
              entityType: "authorization.management_command",
              entityId: input.commandId,
              requestId: input.requestId,
              ...(input.correlationId
                ? { correlationId: input.correlationId }
                : {}),
              metadata: {
                mutationKind: input.mutationKind,
                planeKey: input.planeKey,
                mode: input.mode,
                writer: input.writer,
                ...(input.reason ? { reason: input.reason } : {}),
                ...(input.writerSwitchEvidence
                  ? { writerSwitchEvidence: input.writerSwitchEvidence }
                  : {}),
              },
            });
          },
        },
      })
    : undefined;
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
  for (const planeKey of ["studio", "neon", "mesh"] as const)
    container.runtimes.health.register(
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
    for (const planeKey of ["studio", "neon", "mesh"] as const)
      container.runtimes.health.register(
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
    for (const planeKey of ["studio", "neon", "mesh"] as const)
      container.runtimes.health.register(
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
  for (const planeKey of ["studio", "neon", "mesh"] as const)
    container.runtimes.health.register(`governance.${planeKey}`, async () => {
      const result = await governanceDatabases.health(planeKey);
      return result.status === "healthy"
        ? { status: "healthy" }
        : {
            status: "unhealthy",
            message:
              result.message ??
              `Governance repository is unavailable: ${planeKey}`,
          };
    });
  for (const planeKey of ["studio", "neon", "mesh"] as const) {
    const database = metadataDatabases[planeKey];
    container.runtimes.health.register(
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
    container.runtimes.health.register(
      `governance.${planeKey}.object-storage`,
      async () =>
        dependencyHealth(
          objectStorageArtifacts !== undefined &&
            objectStorageArtifacts.putIfAbsent !== undefined,
          dependencies.governanceCompliance?.objectStorageHealth,
          "Immutable object storage is unavailable",
        ),
    );
    container.runtimes.health.register(
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
  if (container.adapters.meshDatabase) {
    const meshDatabase = container.adapters.meshDatabase
      .database as unknown as Kysely<Record<string, never>>;
    const meshProfileAuthorizer = createPermissionAuthorizer({
      policyGate: {
        async evaluate(input) {
          if (input.permissionCode === "mesh.business_partner_profile.read")
            return { allowed: true, reason: "recipient_scoped_read" };
          if (
            [
              "mesh.business_partner_profile.publish",
              "mesh.business_partner_profile.withdraw",
            ].includes(input.permissionCode)
          )
            return {
              allowed:
                input.resource?.["recipientRelationshipValidated"] === true,
              reason: "recipient_relationship_validation_required",
            };
          return {
            allowed: false,
            reason: "mesh_profile_publication_policy_not_configured",
          };
        },
      },
    });
    const profilePublications = createBusinessPartnerProfilePublicationService({
      authorizer: meshProfileAuthorizer,
      repository: new KyselyBusinessPartnerProfilePublicationRepository(),
      transactions: transactions as never,
      audit: audit as never,
      outbox: createDatabaseOutboxWriter("mesh-business-partner") as never,
      definition: new LocalMeshBusinessPartnerDefinitionConsumer({
        local:
          container.services.publication?.projections.mesh ??
          new KyselyLocalProjectionRepository(meshDatabase),
      }),
    });
    container.services.businessPartnerProfilePublications = profilePublications;
    const publicationCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_mesh_business_partner_profile_publication_http_total",
      "MESH Business Partner profile publication HTTP operations by outcome",
    );
    const publicationDuration =
      container.adapters.openTelemetry?.metrics.histogram(
        "athyper_mesh_business_partner_profile_publication_http_duration_ms",
        "MESH Business Partner profile publication HTTP operation duration",
      );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerProfilePublicationRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: profilePublications,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          publicationCount?.increment(labels);
          publicationDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.runtimes.health.register(
      "business-partner-profile-publications.mesh",
      async () => {
        try {
          const result = await sql<{
            snapshot_table: string | null;
            publication_table: string | null;
            event_table: string | null;
            permission_count: number;
          }>`SELECT to_regclass('snapshot.network_account_profile_publication')::text snapshot_table,to_regclass('mesh.network_account_profile_publication')::text publication_table,to_regclass('mesh.network_account_profile_publication_event')::text event_table,(SELECT count(*)::int FROM authz.permission WHERE canonical_code LIKE 'mesh.business_partner_profile.%' AND status='published') permission_count`.execute(
            meshDatabase,
          );
          const row = result.rows[0];
          return row?.snapshot_table &&
            row.publication_table &&
            row.event_table &&
            row.permission_count === 3
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "MESH Business Partner profile publication DDL or permission contract is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "MESH profile publication readiness check failed",
          };
        }
      },
    );
    const meshBankAuthorizer = createPermissionAuthorizer({
      policyGate: {
        async evaluate(input) {
          const allowed =
            input.resource?.["recipientRelationshipValidated"] === true;
          return {
            allowed,
            sodSatisfied: allowed,
            reason: "directional_relationship_validation_required",
          };
        },
      },
    });
    const bankDisclosures = createBusinessPartnerBankDisclosureService({
      ...(container.adapters.secretStore
        ? {
            protectedIdentifiers: createSecretStoreProtectedValueResolver(
              container.adapters.secretStore,
            ),
          }
        : {}),
      authorizer: meshBankAuthorizer,
      repository: new KyselyBusinessPartnerBankDisclosureRepository(),
      transactions: transactions as never,
      audit: audit as never,
      outbox: createDatabaseOutboxWriter("mesh-business-partner") as never,
    });
    container.services.businessPartnerBankDisclosures = bankDisclosures;
    const bankDisclosureCount =
      container.adapters.openTelemetry?.metrics.counter(
        "athyper_mesh_business_partner_bank_disclosure_http_total",
        "MESH bank disclosure HTTP operations by outcome",
      );
    const bankDisclosureDuration =
      container.adapters.openTelemetry?.metrics.histogram(
        "athyper_mesh_business_partner_bank_disclosure_http_duration_ms",
        "MESH bank disclosure HTTP operation duration",
      );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerBankDisclosureRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: bankDisclosures,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          bankDisclosureCount?.increment(labels);
          bankDisclosureDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.runtimes.health.register(
      "business-partner-bank-disclosures.mesh",
      async () => {
        try {
          const result = await sql<{
            snapshot_table: string | null;
            disclosure_table: string | null;
            event_table: string | null;
            permission_count: number;
          }>`SELECT to_regclass('snapshot.bank_account_disclosure')::text snapshot_table,to_regclass('mesh.bank_account_disclosure')::text disclosure_table,to_regclass('mesh.bank_account_disclosure_event')::text event_table,(SELECT count(*)::int FROM authz.permission WHERE canonical_code LIKE 'mesh.bank_disclosure.%' AND status='published') permission_count`.execute(
            meshDatabase,
          );
          const row = result.rows[0];
          return row?.snapshot_table &&
            row.disclosure_table &&
            row.event_table &&
            row.permission_count === 4
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "MESH bank disclosure DDL or permission contract is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "MESH bank disclosure readiness check failed",
          };
        }
      },
    );
    const networkExchange = createBusinessPartnerNetworkExchangeService({
      authorizer: createPermissionAuthorizer({
        policyGate: {
          async evaluate(input) {
            const selected = input.context.permissions.networkAccountId;
            return {
              allowed: Boolean(selected),
              reason: selected
                ? "verified_network_account_context"
                : "network_account_context_required",
            };
          },
        },
      }),
      repository: new KyselyBusinessPartnerNetworkExchangeRepository(),
      transactions: transactions as never,
      ...(process.env["MESH_SELF_REGISTRATION_POLICY_URL"]
        ? {
            selfRegistrationPolicy: createHttpSelfRegistrationPolicyAdapter({
              endpoint: process.env["MESH_SELF_REGISTRATION_POLICY_URL"],
              bearerToken:
                process.env["MESH_SELF_REGISTRATION_POLICY_BEARER_TOKEN"],
            }),
          }
        : {}),
    });
    container.services.businessPartnerNetworkExchange = networkExchange;
    const networkExchangeCount =
      container.adapters.openTelemetry?.metrics.counter(
        "athyper_mesh_business_partner_exchange_http_total",
        "MESH Business Partner relationship and registration exchange HTTP operations by outcome",
      );
    const networkExchangeDuration =
      container.adapters.openTelemetry?.metrics.histogram(
        "athyper_mesh_business_partner_exchange_http_duration_ms",
        "MESH Business Partner relationship and registration exchange HTTP operation duration",
      );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerNetworkExchangeRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: networkExchange,
        resolveAccountContext: async (context, requested) => {
          const catalog = container.platform.experience?.service;
          if (!catalog)
            throw new Error("Mesh account directory is unavailable");
          return resolveMeshNetworkAccountContext(context, requested, catalog);
        },
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          networkExchangeCount?.increment(labels);
          networkExchangeDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.runtimes.health.register(
      "business-partner-network-exchange.mesh",
      () => checkMeshExchangeReadiness(meshDatabase),
    );
  }
  if (container.adapters.neonDatabase) {
    const neonDatabase = container.adapters.neonDatabase
      .database as unknown as Kysely<Record<string, never>>;
    const profileProjections = createBusinessPartnerProfileProjectionService({
      authorizer,
      repository: new KyselyBusinessPartnerProfileProjectionRepository(),
      transactions: transactions as never,
    });
    container.services.businessPartnerProfileProjections = profileProjections;
    const projectionCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_neon_business_partner_profile_projection_http_total",
      "NEON MESH Business Partner profile projection HTTP operations by outcome",
    );
    const projectionDuration =
      container.adapters.openTelemetry?.metrics.histogram(
        "athyper_neon_business_partner_profile_projection_http_duration_ms",
        "NEON MESH Business Partner profile projection HTTP operation duration",
      );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerProfileProjectionRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: profileProjections,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          projectionCount?.increment(labels);
          projectionDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.runtimes.health.register(
      "business-partner-profile-projections.neon",
      async () => {
        try {
          const result = await sql<{
            inbox_table: string | null;
            snapshot_table: string | null;
            projection_table: string | null;
            attempt_table: string | null;
            permission_count: number;
          }>`SELECT to_regclass('control.mesh_business_partner_profile_inbox')::text inbox_table,to_regclass('snapshot.mesh_business_partner_profile_received')::text snapshot_table,to_regclass('control.mesh_business_partner_profile_projection')::text projection_table,to_regclass('control.mesh_business_partner_profile_processing_attempt')::text attempt_table,(SELECT count(*)::int FROM authz.permission WHERE canonical_code LIKE 'neon.business_partner_profile_projection.%' AND status='published') permission_count`.execute(
            neonDatabase,
          );
          const row = result.rows[0];
          return row?.inbox_table &&
            row.snapshot_table &&
            row.projection_table &&
            row.attempt_table &&
            row.permission_count === 3
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "NEON MESH Business Partner projection DDL or permission contract is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "NEON profile projection readiness check failed",
          };
        }
      },
    );
    const accountBankAuthorizer = createPermissionAuthorizer({
      policyGate: {
        async evaluate(input) {
          const allowed = input.resource?.["governedWorkflow"] === true;
          return {
            allowed,
            sodSatisfied: allowed,
            reason: "governed_account_bank_workflow_required",
          };
        },
      },
    });
    const accountBankLinkage = createBusinessPartnerAccountBankLinkageService({
      authorizer: accountBankAuthorizer,
      repository: new KyselyBusinessPartnerAccountBankRepository(),
      transactions: transactions as never,
      audit: audit as never,
      ...(container.adapters.secretStore
        ? { secrets: container.adapters.secretStore }
        : {}),
      onboardingCycles:
        new KyselyBusinessPartnerOnboardingCycleCoordinator() as never,
    });
    container.services.businessPartnerAccountBankLinkage = accountBankLinkage;
    const accountBankCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_neon_business_partner_account_bank_http_total",
      "NEON MESH account and bank linkage HTTP operations by outcome",
    );
    const accountBankDuration =
      container.adapters.openTelemetry?.metrics.histogram(
        "athyper_neon_business_partner_account_bank_http_duration_ms",
        "NEON MESH account and bank linkage HTTP operation duration",
      );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerAccountBankLinkageRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: accountBankLinkage,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          accountBankCount?.increment(labels);
          accountBankDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.runtimes.health.register(
      "business-partner-account-bank-linkage.neon",
      async () => {
        try {
          const result = await sql<{
            link_table: string | null;
            inbox_table: string | null;
            projection_table: string | null;
            verification_table: string | null;
            permission_count: number;
          }>`SELECT to_regclass('control.mesh_business_partner_account_link')::text link_table,to_regclass('control.mesh_bank_account_disclosure_inbox')::text inbox_table,to_regclass('control.mesh_bank_account_projection')::text projection_table,to_regclass('document.business_partner_bank_verification')::text verification_table,(SELECT count(*)::int FROM authz.permission WHERE (canonical_code LIKE 'neon.mesh_account_link.%' OR canonical_code LIKE 'neon.mesh_bank_projection.%' OR canonical_code LIKE 'neon.business_partner_bank.%') AND status='published') permission_count`.execute(
            neonDatabase,
          );
          const row = result.rows[0];
          return row?.link_table &&
            row.inbox_table &&
            row.projection_table &&
            row.verification_table &&
            row.permission_count === 6
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "NEON account/bank linkage DDL or permission contract is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "NEON account/bank linkage readiness check failed",
          };
        }
      },
    );
  }
  if (container.adapters.meshDatabase && container.adapters.neonDatabase) {
    const meshAdapter =
        container.adapters.jobMeshDatabase ?? container.adapters.meshDatabase,
      neonAdapter =
        container.adapters.jobNeonDatabase ?? container.adapters.neonDatabase;
    const recipientAuthorizer = {
      async authorize() {
        return { allowed: true as const };
      },
    };
    const recipientTransactions = {
      run: <T>(
        _plane: "neon",
        actor: {
          tenantId: string;
          principalId: string;
          requestId?: string;
          correlationId?: string;
        },
        work: (transaction: Transaction<Record<string, never>>) => Promise<T>,
      ) =>
        neonAdapter.withSystemTransaction(async (transaction) => {
          await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true),set_config('app.current_plane_key','neon',true),set_config('app.current_request_id',${actor.requestId ?? ""},true),set_config('app.current_correlation_id',${actor.correlationId ?? ""},true)`.execute(
            transaction,
          );
          return work(transaction as never);
        }),
    };
    const profileReceiver = createBusinessPartnerProfileProjectionService({
      authorizer: recipientAuthorizer,
      repository: new KyselyBusinessPartnerProfileProjectionRepository(),
      transactions: recipientTransactions,
    });
    const bankReceiver = createBusinessPartnerAccountBankLinkageService({
      authorizer: recipientAuthorizer,
      repository: new KyselyBusinessPartnerAccountBankRepository(),
      transactions: recipientTransactions,
      audit: audit as never,
    });
    const deliveryCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_business_partner_mesh_delivery_total",
      "MESH to NEON Business Partner delivery and reconciliation outcomes",
    );
    const recipient = {
      async deliver(item: BusinessPartnerDeliveryItem) {
        const principalId = await recipientPrincipal(item.recipientTenantId);
        const context = internalRecipientContext(item, principalId),
          result = await (item.kind === "profile"
            ? profileReceiver.receive({
                context,
                envelope:
                  item.envelope as unknown as MeshBusinessPartnerProfileEnvelope,
              })
            : bankReceiver.receiveBankDisclosure({
                context,
                envelope:
                  item.envelope as unknown as MeshBankDisclosureEnvelope,
              }));
        const disposition = String(
          "processingDisposition" in result
            ? (result.processingDisposition ?? result.disposition)
            : result.disposition,
        );
        if (
          !["applied", "duplicate", "stale", "quarantined"].includes(
            disposition,
          )
        )
          throw new Error("BUSINESS_PARTNER_RECIPIENT_DISPOSITION_INVALID");
        return {
          disposition: disposition as DeliveryDisposition,
          ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
        };
      },
      async hasReceipt(item: BusinessPartnerDeliveryItem) {
        return neonAdapter.withSystemTransaction(async (transaction) => {
          const table =
            item.kind === "profile"
              ? sql`control.mesh_business_partner_profile_inbox`
              : sql`control.mesh_bank_account_disclosure_inbox`;
          const processingProof =
            item.kind === "profile"
              ? sql`AND (SELECT attempt.disposition FROM control.mesh_business_partner_profile_processing_attempt attempt WHERE attempt.tenant_id=inbox.tenant_id AND attempt.inbox_event_id=inbox.id ORDER BY attempt.attempt_no DESC LIMIT 1) IN ('applied','stale')`
              : sql`AND EXISTS(SELECT 1 FROM control.mesh_bank_account_projection projection WHERE projection.tenant_id=inbox.tenant_id AND projection.network_relationship_id=inbox.network_relationship_id AND (projection.current_disclosure_version>inbox.disclosure_version OR (projection.current_disclosure_version=inbox.disclosure_version AND projection.current_lifecycle_version>=inbox.lifecycle_version)))`;
          const row = (
            await sql<{
              received: boolean;
            }>`SELECT EXISTS(SELECT 1 FROM ${table} inbox WHERE inbox.tenant_id=${item.recipientTenantId}::uuid AND inbox.event_id=${item.eventId}::uuid ${processingProof}) received`.execute(
              transaction,
            )
          ).rows[0];
          return row?.received === true;
        });
      },
    };
    async function recipientPrincipal(tenantId: string) {
      const row = await neonAdapter.withSystemTransaction(
        async (transaction) => {
          await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_plane_key','neon',true)`.execute(
            transaction,
          );
          return (
            await sql<{
              id: string;
            }>`SELECT id FROM master.principal WHERE tenant_id=${tenantId}::uuid AND status='active' AND principal_type='service_account' ORDER BY created_at,id LIMIT 1`.execute(
              transaction,
            )
          ).rows[0];
        },
      );
      if (!row)
        throw Object.assign(
          new Error("Recipient tenant has no active delivery service account"),
          { status: 409, code: "BUSINESS_PARTNER_RECIPIENT_PRINCIPAL_MISSING" },
        );
      return row.id;
    }
    const repository = new KyselyBusinessPartnerDeliveryRepository((work) =>
      meshAdapter.withSystemTransaction((transaction) =>
        work(transaction as never),
      ),
    );
    const worker = new BusinessPartnerDeliveryWorker({
      workerId: `business-partner-${process.env["HOSTNAME"] ?? "worker"}`,
      repository,
      recipient,
      telemetry: {
        record(labels) {
          deliveryCount?.increment(labels);
        },
        capture() {},
      },
    });
    const deliveryEnabled =
        config?.wave0.businessPartnerDeliveryEnabled ?? false,
      reconciliationEnabled =
        config?.wave0.businessPartnerReconciliationEnabled ?? false;
    if (container.runtimes.jobs && deliveryEnabled) {
      container.runtimes.jobs.register(
        BUSINESS_PARTNER_DELIVERY_QUEUE,
        DELIVER_BUSINESS_PARTNER_EVENTS_JOB,
        createBusinessPartnerDeliveryHandler(worker, repository),
      );
      container.runtimes.jobDefinitions.push({
        code: DELIVER_BUSINESS_PARTNER_EVENTS_JOB,
        owner: "@athyper/server-plane-mesh",
        queue: BUSINESS_PARTNER_DELIVERY_QUEUE,
        name: DELIVER_BUSINESS_PARTNER_EVENTS_JOB,
        scope: "plane",
        payloadSchema: {
          name: DELIVER_BUSINESS_PARTNER_EVENTS_JOB,
          version: 1,
        },
        timeoutMs: 120_000,
        maxAttempts: 1,
        executionRetentionDays: 90,
      });
    }
    if (container.runtimes.jobs && reconciliationEnabled) {
      container.runtimes.jobs.register(
        BUSINESS_PARTNER_DELIVERY_QUEUE,
        RECONCILE_BUSINESS_PARTNER_EVENTS_JOB,
        createBusinessPartnerReconciliationHandler(worker),
      );
      container.runtimes.jobDefinitions.push({
        code: RECONCILE_BUSINESS_PARTNER_EVENTS_JOB,
        owner: "@athyper/server-plane-mesh",
        queue: BUSINESS_PARTNER_DELIVERY_QUEUE,
        name: RECONCILE_BUSINESS_PARTNER_EVENTS_JOB,
        scope: "plane",
        payloadSchema: {
          name: RECONCILE_BUSINESS_PARTNER_EVENTS_JOB,
          version: 1,
        },
        timeoutMs: 120_000,
        maxAttempts: 1,
        executionRetentionDays: 90,
      });
    }
    if (container.runtimes.scheduler && deliveryEnabled)
      container.runtimes.scheduledJobs.push({
        scheduleId: "business-partner-mesh-delivery",
        queue: BUSINESS_PARTNER_DELIVERY_QUEUE,
        name: DELIVER_BUSINESS_PARTNER_EVENTS_JOB,
        data: { limit: 100 },
        pattern: { kind: "interval", everyMs: 15_000 },
        options: {
          jobId: "business-partner:mesh:delivery",
          maxAttempts: 1,
          payloadSchema: {
            name: DELIVER_BUSINESS_PARTNER_EVENTS_JOB,
            version: 1,
          },
          execution: {
            planeKey: "mesh",
            scope: "plane",
            principalId: "00000000-0000-0000-0000-000000000000",
          },
        },
      });
    if (container.runtimes.scheduler && reconciliationEnabled)
      container.runtimes.scheduledJobs.push({
        scheduleId: "business-partner-mesh-reconciliation",
        queue: BUSINESS_PARTNER_DELIVERY_QUEUE,
        name: RECONCILE_BUSINESS_PARTNER_EVENTS_JOB,
        data: { limit: 250 },
        pattern: { kind: "interval", everyMs: 300_000 },
        options: {
          jobId: "business-partner:mesh:reconciliation",
          maxAttempts: 1,
          payloadSchema: {
            name: RECONCILE_BUSINESS_PARTNER_EVENTS_JOB,
            version: 1,
          },
          execution: {
            planeKey: "mesh",
            scope: "plane",
            principalId: "00000000-0000-0000-0000-000000000000",
          },
        },
      });
    container.runtimes.health.register(
      "business-partner-mesh-delivery",
      async () => {
        if (!deliveryEnabled)
          return { status: "healthy", message: "disabled for staged rollout" };
        try {
          const schema = await meshAdapter.withSystemTransaction(
            async (transaction) =>
              (
                await sql<{
                  table_name: string | null;
                }>`SELECT to_regclass('mesh.business_partner_delivery_acknowledgement')::text table_name`.execute(
                  transaction,
                )
              ).rows[0],
          );
          if (!schema?.table_name)
            return {
              status: "unhealthy",
              message:
                "Business Partner delivery acknowledgement migration is required",
            };
          const row = await meshAdapter.withSystemTransaction(
            async (transaction) =>
              (
                await sql<{
                  pending: number;
                  dead_letters: number;
                  oldest_seconds: number | null;
                }>`SELECT count(*) FILTER(WHERE status IN ('pending','failed','processing'))::int pending,count(*) FILTER(WHERE status='dead_letter')::int dead_letters,extract(epoch FROM clock_timestamp()-min(created_at) FILTER(WHERE status IN ('pending','failed','processing')))::int oldest_seconds FROM event.outbox WHERE topic IN ('mesh-business-partner','mesh-business-partner-profile','mesh-business-partner-bank')`.execute(
                  transaction,
                )
              ).rows[0],
          );
          return row &&
            row.dead_letters === 0 &&
            Number(row.oldest_seconds ?? 0) < 900
            ? { status: "healthy", message: `pending=${row.pending}` }
            : {
                status: "unhealthy",
                message: `pending=${row?.pending ?? 0}, dead_letters=${row?.dead_letters ?? 0}, oldest_seconds=${row?.oldest_seconds ?? 0}`,
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "Business Partner delivery readiness failed",
          };
        }
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
  const notificationAttachmentResolver =
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
  const metadata =
    dependencies.metadata ??
    createMetadataService({
      repository: createRuntimeDescriptorRepository({
        databases: metadataDatabases,
        withTenantTransaction: (planeKey, actor, work) =>
          transactions.run(planeKey, actor, work),
      }),
      ...(container.adapters.redisCache
        ? {
            cache: createDistributedDescriptorCache(
              container.adapters.redisCache,
            ),
          }
        : {}),
    });
  container.platform.metadata = metadata;
  registerMasterData(
    container,
    {
      authorizeAccess: createMasterDataAuthority(authorizer, metadata),
      authorizeVerification: createContactVerificationAuthority(authorizer),
      repository:
        dependencies.masterData?.repository ?? new KyselyMasterDataRepository(),
      evidenceVerifier:
        dependencies.masterData?.evidenceVerifier ??
        (config?.masterDataVerificationKeys?.length
          ? createProviderEvidenceVerifier(config.masterDataVerificationKeys)
          : {
              verify: async () => {
                throw new MasterDataError(
                  503,
                  "MASTER_DATA_VERIFIER_UNAVAILABLE",
                  "Contact verification provider is not configured",
                );
              },
            }),
      metadata,
      authorizer,
      transactions: exactTransactions,
      audit,
      outbox: dependencies.outbox ?? createDatabaseOutboxWriter("master-data"),
    },
    config?.localContactChallenge
      ? {
          config: config.localContactChallenge,
          repository: new KyselyContactChallengeRepository(),
          deliver: queueLocalVerificationEmail(config.localContactDeliveryKey!),
        }
      : undefined,
  );
  if (container.adapters.neonDatabase) {
    const neonDatabase = container.adapters.neonDatabase
      .database as unknown as Kysely<Record<string, never>>;
    const compatibilityAccess =
      container.adapters.openTelemetry?.metrics.counter(
        "athyper_governed_compatibility_access_total",
        "G6 compatibility-surface accesses by bounded surface, access, and operation",
      );
    for (const [surface, access] of [
      ["flattened_decision_scope", "read"],
      ["flattened_decision_scope", "write"],
      ["business_partner_aliases_cache", "read"],
      ["workforce_iam" + "_projection", "read"],
      ["workforce_iam" + "_projection", "write"],
      ["business_partner_person_group_compatibility", "read"],
    ] as const)
      compatibilityAccess?.incrementBy(0, {
        surface,
        access,
        operation: "all",
      });
    const repository = new KyselyBusinessPartnerCaseRepository();
    const businessPartnerAuthority = createPermissionAuthorizer({
      readSourceRequirement: async (context, permissionCode) => {
        const database = container.adapters.neonDatabase?.database;
        if (!database) return null;
        return database.transaction().execute(async (tx) => {
          await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
            tx,
          );
          await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
            tx,
          );
          return readSourcePermissionRequirement(
            tx as unknown as Kysely<Record<string, never>>,
            context.tenantId,
            permissionCode,
          );
        });
      },
      policyGate: {
        async evaluate(input) {
          if (
            input.permissionCode.startsWith(BP_COMPANY_PILOT_PERMISSION_PREFIX)
          )
            input = {
              ...input,
              permissionCode: input.permissionCode.replace(
                BP_COMPANY_PILOT_PERMISSION_PREFIX,
                "neon.relationship.entity_case.",
              ),
            };
          if (input.permissionCode === "neon.relationship.bp_target.import")
            return businessPartnerImportPolicy(input);
          if (
            isPublishedBusinessPartnerTargetRead(
              input,
              dependencies.businessPartnerBackendAuthorization?.profile,
              dependencies.businessPartnerBackendAuthorizationTenantId,
            )
          )
            return {
              allowed: true,
              reason: "published_business_partner_target_read",
            };
          if (
            isPublishedBusinessPartnerTargetReveal(
              input,
              dependencies.businessPartnerBackendAuthorization?.profile,
              dependencies.businessPartnerBackendAuthorizationTenantId,
            )
          )
            return {
              allowed: true,
              reason: "published_business_partner_target_reveal",
            };
          if (
            [
              "neon.supplier_registration.invitation.create",
              "neon.customer_registration.invitation.create",
            ].includes(input.permissionCode)
          ) {
            const proposalOnly =
              input.resource?.["proposalOnly"] === true &&
              input.resource?.["makerCheckerEnforced"] === true;
            return {
              allowed: proposalOnly,
              sodSatisfied: proposalOnly,
              reason: "invitation_governed_proposal_required",
            };
          }
          if (input.permissionCode === "neon.relationship.entity_case.submit")
            return {
              allowed: input.resource?.["makerCheckerEnforced"] === true,
              sodSatisfied: input.resource?.["makerCheckerEnforced"] === true,
              reason: "maker_checker_policy_required",
            };
          if (input.permissionCode === "neon.relationship.entity_case.decide") {
            const submittedBy = input.resource?.["submittedBy"];
            const separated =
              typeof submittedBy === "string" &&
              submittedBy !== input.context.principalId;
            return {
              allowed: separated,
              sodSatisfied: separated,
              reason: "maker_checker_separation_failed",
            };
          }
          if (
            input.permissionCode === "neon.relationship.entity_case.materialize"
          ) {
            const pinned = input.resource?.["approvedEvidencePinned"] === true;
            return {
              allowed: pinned,
              sodSatisfied: pinned,
              reason: "approved_evidence_required",
            };
          }
          if (input.permissionCode === "neon.supplier.qualification.admin") {
            const creator = input.resource?.["createdBy"],
              separated =
                creator === undefined || creator !== input.context.principalId,
              controlled =
                input.resource?.["qualificationControl"] === true &&
                input.resource?.["makerCheckerEnforced"] === true;
            return {
              allowed: controlled && separated,
              sodSatisfied: controlled && separated,
              reason: "qualification_control_and_separation_required",
            };
          }
          if (input.permissionCode === "neon.supplier.preference.admin") {
            const creator = input.resource?.["createdBy"],
              separated =
                creator === undefined || creator !== input.context.principalId,
              controlled =
                input.resource?.["preferenceControl"] === true &&
                input.resource?.["makerCheckerEnforced"] === true;
            return {
              allowed: controlled && separated,
              sodSatisfied: controlled && separated,
              reason: "preference_control_and_separation_required",
            };
          }
          if (input.permissionCode === "neon.customer.credit.create")
            return {
              allowed:
                input.resource?.["creditControl"] === true &&
                input.resource?.["makerCheckerEnforced"] === true,
              sodSatisfied: true,
              reason: "customer_credit_control_required",
            };
          if (input.permissionCode === "neon.customer.credit.decide") {
            const creator = input.resource?.["createdBy"],
              separated =
                typeof creator === "string" &&
                creator !== input.context.principalId,
              controlled =
                input.resource?.["creditControl"] === true &&
                input.resource?.["makerCheckerEnforced"] === true;
            return {
              allowed: controlled && separated,
              sodSatisfied: controlled && separated,
              reason: "customer_credit_separation_required",
            };
          }
          if (input.permissionCode === "neon.customer.designation.create")
            return {
              allowed:
                input.resource?.["designationControl"] === true &&
                input.resource?.["makerCheckerEnforced"] === true,
              sodSatisfied: true,
              reason: "customer_designation_control_required",
            };
          if (input.permissionCode === "neon.customer.designation.decide") {
            const creator = input.resource?.["createdBy"],
              separated =
                typeof creator === "string" &&
                creator !== input.context.principalId,
              controlled =
                input.resource?.["designationControl"] === true &&
                input.resource?.["makerCheckerEnforced"] === true;
            return {
              allowed: controlled && separated,
              sodSatisfied: controlled && separated,
              reason: "customer_designation_separation_required",
            };
          }
          if (
            [
              "neon.customer.lifecycle.activate",
              "neon.customer.lifecycle.suspend",
              "neon.customer.lifecycle.reactivate",
              "neon.customer.lifecycle.deactivate",
              "neon.customer.lifecycle.archive",
            ].includes(input.permissionCode)
          ) {
            const requiresReadiness =
                input.permissionCode.endsWith("activate") ||
                input.permissionCode.endsWith("reactivate"),
              pinned = input.resource?.["readinessEvidencePinned"] === true;
            return {
              allowed:
                input.resource?.["makerCheckerEnforced"] === true &&
                (!requiresReadiness || pinned),
              sodSatisfied: true,
              reason: "customer_lifecycle_control_required",
            };
          }
          if (
            input.permissionCode ===
            "neon.relationship.business_partner.activate"
          ) {
            const pinned = input.resource?.["readinessEvidencePinned"] === true,
              eligible = input.resource?.["eligible"] === true,
              internal = input.resource?.["externalApplicant"] === false,
              elevated = input.context.assurance === "elevated";
            return {
              allowed: pinned && eligible && internal && elevated,
              sodSatisfied: pinned && internal,
              reason:
                "supplier_activation_requires_pinned_readiness_and_elevated_internal_authority",
            };
          }
          if (
            [
              "neon.relationship.entity_case.create",
              "neon.relationship.entity_case.read",
              "neon.relationship.entity_case.update",
              "neon.relationship.entity_case.validate",
              "neon.relationship.business_partner.read",
              "neon.customer.credit.read",
              "neon.customer.designation.read",
              "neon.business_partner_profile_match.create",
              "neon.business_partner_profile_match.read",
              "neon.business_partner_profile_match.request",
              "neon.supplier_registration.invitation.create",
              "neon.supplier_registration.invitation.read",
              "neon.supplier_registration.invitation.cancel",
              "neon.supplier_registration.external.respond",
              "neon.customer_registration.invitation.create",
              "neon.customer_registration.invitation.read",
              "neon.customer_registration.invitation.cancel",
              "neon.customer_registration.external.respond",
              "neon.workforce.read",
              "neon.workforce.request.create",
              "neon.workforce.request.read",
              "neon.workforce.review",
              "neon.workforce.onboarding.execute",
              "neon.workforce.offboarding.execute",
              "neon.workforce.pii.read",
              "neon.workforce.iam.retry",
              "neon.workforce.integration.import",
            ].includes(input.permissionCode)
          )
            return {
              allowed: true,
              reason: "bounded_business_partner_operation",
            };
          if (
            (
              Object.values(
                BUSINESS_PARTNER_360_PERMISSIONS,
              ) as readonly string[]
            ).includes(input.permissionCode)
          )
            return {
              allowed: true,
              reason: "bounded_business_partner_360_read",
            };
          return {
            allowed: false,
            reason: "business_partner_hard_policy_not_configured",
          };
        },
      },
    });
    const businessPartnerAuthorizer = observeAuthority(
      businessPartnerAuthority,
    );
    const validator = createBusinessPartnerRequestValidator<RecordTransaction>({
      duplicates: {
        async findExactName(input, transaction) {
          const result = await sql<{
            id: string;
            code: string;
            name: string;
          }>`SELECT id::text,code,name
            FROM master.business_partner
            WHERE tenant_id=${input.tenantId}::uuid
              AND (lower(name)=lower(${input.name}) OR EXISTS (SELECT 1 FROM master.business_partner_alias a WHERE a.tenant_id=master.business_partner.tenant_id AND a.business_partner_id=master.business_partner.id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE) AND a.normalized_alias=lower(regexp_replace(btrim(${input.name}), '[[:space:]]+', ' ', 'g'))))
              AND (${input.excludeBusinessPartnerId ?? null}::uuid IS NULL OR id<>${input.excludeBusinessPartnerId ?? null}::uuid)
            ORDER BY status='active' DESC,created_at DESC,id LIMIT ${input.limit}`.execute(
            transaction,
          );
          return result.rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
          }));
        },
      },
    });
    const localDefinitions = new LocalBusinessPartnerDefinitionConsumer({
      local:
        container.services.publication?.projections.neon ??
        new KyselyLocalProjectionRepository(neonDatabase),
      canonicalizer: { canonicalBytes, sha256 },
    });
    const protectedValues = container.adapters.secretStore
      ? createSecretStoreProtectedValueResolver(container.adapters.secretStore)
      : undefined;
    const businessPartner360Definitions =
      createLastValidBusinessPartner360DefinitionResolver({
        async resolve() {
          const descriptors = await localDefinitions.descriptors(),
            view = descriptors.views["neonPartner360"] as
              Record<string, unknown> | undefined;
          if (!view || typeof view["version"] !== "string")
            throw new MasterDataError(
              503,
              "BP_360_DEFINITION_UNAVAILABLE",
              "Verified local Business Partner 360 definition is unavailable",
            );
          return parseBusinessPartner360Definition({
            version: view["version"],
            hash: sha256(
              canonicalBytes({
                bundleHash: descriptors.bundleHash,
                releaseNo: descriptors.releaseNo,
                view,
              }),
            ),
            view,
          });
        },
      });
    const meshNetwork =
      config?.businessPartner360.meshLiveBaseUrl &&
      config.businessPartner360.meshLiveCredentialReference &&
      container.adapters.secretStore
        ? createHttpBusinessPartner360MeshNetworkAdapter({
            baseUrl: config.businessPartner360.meshLiveBaseUrl,
            credentialReference:
              config.businessPartner360.meshLiveCredentialReference,
            secrets: container.adapters.secretStore,
          })
        : undefined;
    const businessPartner360 =
      createBusinessPartner360Service<RecordTransaction>({
        refreshAuthorizationContext: refreshEntityContext,
        authorizeCaseRead: async (query, caseId) => {
          const cases = container.services.businessPartnerRequests;
          if (!cases)
            throw new MasterDataError(
              503,
              "BP_CHILD_AUTHORIZATION_UNAVAILABLE",
              "Case authorization is unavailable",
            );
          try {
            await cases.get({ context: query.context, requestId: caseId });
            return true;
          } catch (error) {
            if (
              error instanceof MasterDataError &&
              (error.status === 403 || error.status === 404)
            )
              return false;
            throw error;
          }
        },
        authorizer: businessPartnerAuthorizer,
        repository: new KyselyBusinessPartner360Repository() as never,
        transactions,
        audit: audit as never,
        ...(protectedValues ? { protectedValues } : {}),
        ...(meshNetwork
          ? {
              meshNetwork,
              meshTimeoutMs: config?.businessPartner360.meshTimeoutMs,
            }
          : {}),
        admitDirectoryRecord: async (query) => {
          const records = container.services.records;
          if (!records)
            throw new MasterDataError(
              503,
              "DIRECTORY_UNAVAILABLE",
              "Record directory admission is unavailable",
            );
          const result = await records.queries.get({
            context: query.context,
            entityCode: "business_partner",
            recordId: query.businessPartnerId,
          });
          if (!result.data)
            throw new MasterDataError(
              404,
              "BP_360_NOT_FOUND",
              "Business Partner is unavailable",
            );
        },
        definitions: businessPartner360Definitions,
        metadata,
        businessActivityProviders:
          createUnavailableBusinessPartner360ActivityProviders([
            {
              code: "finance",
              async read(input) {
                if (
                  input.context.planeKey !== "neon" ||
                  !input.operatingOrganizationId ||
                  !input.companyCodeId
                )
                  return {
                    provider: "finance",
                    state: "unavailable",
                    metrics: [],
                    reasonCode: "FINANCE_ACTIVITY_CONTEXT_REQUIRED",
                    observedAt: new Date().toISOString(),
                  };
                const reader = createBusinessPartnerJournalActivityReader({
                  transactions: {
                    run: (actor, work) => transactions.run("neon", actor, work),
                  },
                  authorize: async (query, permissionCode) => {
                    const context = await refreshEntityContext(input.context);
                    return (
                      await baseAuthorizer.authorize({
                        context,
                        permissionCode,
                        resource: {
                          tenantId: context.tenantId,
                          operatingOrganizationId:
                            query.operatingOrganizationId,
                          companyCodeId: query.companyCodeId,
                        },
                      })
                    ).allowed;
                  },
                });
                const result = await reader.read({
                  actor: {
                    tenantId: input.context.tenantId,
                    principalId: input.context.principalId,
                    planeKey: "neon",
                    correlationId:
                      input.context.correlationId ?? "bp-journal-activity",
                  },
                  businessPartnerId: input.businessPartnerId,
                  operatingOrganizationId: input.operatingOrganizationId,
                  companyCodeId: input.companyCodeId,
                  asOf: input.asOf,
                });
                return { provider: "finance", ...result };
              },
            },
          ]),
      });
    container.platform.httpRegistrars.push((application) =>
      registerLocalBusinessPartnerDefinitionRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer: businessPartnerAuthorizer,
        consumer: localDefinitions,
      }),
    );
    container.services.businessPartner360 = businessPartner360;
    const businessPartnerRequestOptions: BusinessPartnerRequestServiceOptions<RecordTransaction> =
      {
        authorizer: businessPartnerAuthorizer,
        repository,
        transactions,
        schemas: {
          async resolve(input) {
            try {
              return await transactions.run(
                "neon",
                {
                  tenantId: input.context.tenantId,
                  principalId: input.context.principalId,
                },
                async (transaction) =>
                  new LocalBusinessPartnerDefinitionConsumer({
                    local: new KyselyLocalProjectionRepository(transaction),
                    canonicalizer: { canonicalBytes, sha256 },
                  }).requestSchema({
                    kind: input.kind,
                    sourceKind: input.sourceKind,
                    ...(input.requestedRole
                      ? { requestedRole: input.requestedRole }
                      : {}),
                  }),
              );
            } catch (error) {
              throw new MasterDataError(
                503,
                "BUSINESS_PARTNER_REQUEST_SCHEMA_UNAVAILABLE",
                error instanceof Error
                  ? error.message
                  : "Verified local Business Partner definition is unavailable",
              );
            }
          },
        },
        validator,
        workflows: {
          async resolve(input, transaction) {
            const candidates = await sql<{
              principal_id: string;
            }>`SELECT principal_id::text FROM document.fn_entity_case_approvers(${input.context.tenantId}::uuid,${input.request.operatingOrganizationId!}::uuid,${input.request.companyCodeId ?? null}::uuid,${input.context.principalId}::uuid)`.execute(
              transaction,
            );
            const artifact = await new LocalBusinessPartnerDefinitionConsumer({
              local: new KyselyLocalProjectionRepository(transaction),
              canonicalizer: { canonicalBytes, sha256 },
            }).workflow({
              kind: input.request.kind,
              proposedPayload: input.request.proposedPayload,
              ...(input.request.requestedRole
                ? { requestedRole: input.request.requestedRole }
                : {}),
            });
            const approverPrincipalIds = candidates.rows.map(
              (row) => row.principal_id,
            );
            return {
              code: artifact.code,
              version: artifact.version,
              hash: artifact.hash,
              stageCode: artifact.stageCode,
              stageName: artifact.stageName,
              approverPrincipalIds,
              stages: artifact.stages.map((stage) => ({
                ...stage,
                quorum: stage.quorum as {
                  kind: "all" | "any" | "count" | "percentage";
                  value?: number;
                },
                approverPrincipalIds,
                escalationPrincipalIds: approverPrincipalIds.slice(1),
              })),
            };
          },
        },
        audit,
        outbox: createDatabaseOutboxWriter("business-partner"),
        onboardingCycles:
          new KyselyBusinessPartnerOnboardingCycleCoordinator() as never,
      };
    const businessPartnerRequests = createBusinessPartnerRequestService(
      {...businessPartnerRequestOptions, validateIntake: async command => {
        if(command.kind!=="new_partner" || command.source.kind!=="manual")return;
        if(!intakeApplicationDescriptor)throw new MasterDataError(503,"INTAKE_VALIDATION_UNAVAILABLE","Intake validation is unavailable.");
        const descriptor=await intakeApplicationDescriptor(command.context,"business_partner",{operatingOrganizationId:command.operatingOrganizationId,...(command.companyCodeId?{companyCodeId:command.companyCodeId}:{})});
        const surface=descriptor.intakeSurfaces?.find(s=>s.key==="intake_details");
        if(!surface)throw new MasterDataError(503,"INTAKE_VALIDATION_UNAVAILABLE","The published intake form is unavailable.");
        if(surface.sections.some(s=>s.fields.some(f=>f.control==="repeatableGroup"&&f.extensionGroup))){
          try { validateProfileIntake(surface,descriptor.intakeSurfaces!,command); } catch(error) { throw new MasterDataError(422,"INTAKE_VALIDATION_FAILED",error instanceof Error?error.message:"Please correct the profile fields."); }
        }
        const referenceIds=[...new Set([
          ...(command.extensions?.relationships??[]).map(row=>row.targetBusinessPartnerId),
          ...(command.extensions?.governanceRelations??[]).map(row=>row.memberBusinessPartnerId),
        ].filter((id):id is string=>typeof id==="string"&&Boolean(id)))];
        for(const id of referenceIds){
          if(!intakeReferenceRecord)throw new MasterDataError(503,"INTAKE_VALIDATION_UNAVAILABLE","Reference validation is unavailable.");
          // Recheck normal record read authorization; a browser-supplied UUID is never authority.
          await intakeReferenceRecord(command.context,"business_partner",id);
        }
        const answers=Object.fromEntries(surface.sections.flatMap(s=>s.fields).flatMap(f=>f.control==="input"&&f.payload?.target==="canonical"?[[f.valueKey,command.proposedPayload[f.payload.path]]]:[]));
        const issues=surface.sections.flatMap(s=>s.fields).flatMap(f=>{
          if(f.control!=="input"||f.payload?.target!=="canonical"||!dataFieldVisible(f,surface,answers))return [];
          const issue=validateDataInput(command.draftCapture?{...f,required:false}:f,answers[f.valueKey],surface.validationMessages);
          return issue?[{...issue,fieldPath:f.payload.path}]:[];
        });
        if(issues.length)throw new MasterDataError(422,"INTAKE_VALIDATION_FAILED","Please correct the invalid fields.",issues);
      }},
    );
    const companyPilot = createBusinessPartnerCompanyPilotService({
      ...businessPartnerRequestOptions,
      repository: new KyselyBusinessPartnerCaseRepository(
        BP_COMPANY_PILOT_CASE_ENTITY,
      ),
      authorizer: businessPartnerAuthority,
      workflows: {
        async resolve(input, tx) {
          const definition =
            await businessPartnerRequestOptions.workflows.resolve(input, tx);
          const rows = await sql<{
            principal_id: string;
          }>`SELECT principal_id::text FROM document.fn_company_setup_case_approvers(${input.context.tenantId}::uuid,${input.request.companyCodeId ?? null}::uuid,${input.context.principalId}::uuid)`.execute(
            tx,
          );
          const approverPrincipalIds = rows.rows.map((row) => row.principal_id);
          return {
            ...definition,
            approverPrincipalIds,
            stages: definition.stages?.map((stage) => ({
              ...stage,
              approverPrincipalIds,
              escalationPrincipalIds: approverPrincipalIds.slice(1),
            })),
          };
        },
      },
      refreshContext: refreshEntityContext,
      resolveScope: async (request) => {
        const resolved = await caseScopes().resolve({
          ...request,
          operationKey: "read",
          phase: "execute",
          entityCode: BP_COMPANY_PILOT_ENTITY,
          resolver: "company.record.v1",
        });
        return resolved.state === "resolved" &&
          typeof resolved.coordinates.companyCodeId === "string"
          ? { companyCodeId: resolved.coordinates.companyCodeId }
          : null;
      },
      requirePublishedOperation: async (context, operation, permissionCode) => {
        const key = `metadata.entity.master_business_partner_company_setup_request.${context.tenantId.replaceAll("-", "")}`;
        const row = await transactions.run(
          "neon",
          { tenantId: context.tenantId, principalId: context.principalId },
          async (tx) =>
            (
              await sql<{
                entity_code: string;
                compiled_json: Record<string, unknown>;
              }>`SELECT * FROM runtime_meta.fn_active_entity_descriptor(${key},'entity_case_runtime')`.execute(
                tx,
              )
            ).rows[0],
        );
        const bindings = row?.compiled_json["operation_scope_bindings"];
        if (
          row?.entity_code !== BP_COMPANY_PILOT_CASE_ENTITY ||
          !Array.isArray(bindings) ||
          !bindings.some(
            (binding) =>
              binding.operationKey === operation &&
              binding.permissionCode === permissionCode &&
              binding.scopeKind === "company_code",
          )
        )
          throw new MasterDataError(
            503,
            "BP_COMPANY_PILOT_PUBLICATION_REQUIRED",
            "The company setup operation requires its active signed case contract",
          );
      },
    });
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerRequestRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: companyPilot,
        companyPilot: true,
      }),
    );
    container.services.businessPartnerRequests = businessPartnerRequests;
    const governedImport = createBusinessPartnerBoundImport({
      requests: businessPartnerRequests,
      metadata,
      authorizer: businessPartnerAuthorizer,
      scopes: caseScopes(),
      refreshContext: refreshEntityContext,
    });
    container.services.businessPartnerGovernedImport = governedImport;
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerGovernedImportRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: governedImport,
      }),
    );
    const governedInternalBusinessPartnerCases =
      createGovernedInternalBusinessPartnerCaseService<RecordTransaction>({
        authorizer: businessPartnerAuthorizer,
        repository:
          new KyselyGovernedInternalBusinessPartnerCaseRepository() as never,
        transactions,
      });
    const workforce = createWorkforceService<RecordTransaction>({
      authorizer: businessPartnerAuthorizer,
      repository: new KyselyWorkforceRepository(),
      requestRepository: new KyselyWorkforceRequestRepository(),
      requestValidator: {
        async validate(input, transaction) {
          const evidence = await sql<{
            legal_entity: boolean;
            company: boolean;
            org_unit: boolean;
            position: boolean;
            profile: boolean;
            target: boolean;
          }>`SELECT
        EXISTS(SELECT 1 FROM master.legal_entity x WHERE x.tenant_id=${input.context.tenantId}::uuid AND x.id=${input.request.legalEntityId}::uuid AND x.status='active') legal_entity,
        (${input.request.companyCodeId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.company_code x WHERE x.tenant_id=${input.context.tenantId}::uuid AND x.id=${input.request.companyCodeId ?? null}::uuid AND x.status='active')) company,
        (${input.request.orgUnitId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.org_unit x WHERE x.tenant_id=${input.context.tenantId}::uuid AND x.id=${input.request.orgUnitId ?? null}::uuid AND x.status='active')) org_unit,
        (${input.request.positionId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.position x WHERE x.tenant_id=${input.context.tenantId}::uuid AND x.id=${input.request.positionId ?? null}::uuid AND x.status='active')) position,
        (${input.request.protectedProfileContentItemId ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM document.content_item i JOIN snapshot.content_item_version v ON v.tenant_id=i.tenant_id AND v.id=i.current_version_id WHERE i.tenant_id=${input.context.tenantId}::uuid AND i.id=${input.request.protectedProfileContentItemId ?? null}::uuid AND i.status='PUBLISHED' AND nullif(btrim(v.body_json->>'firstName'),'') IS NOT NULL AND nullif(btrim(v.body_json->>'lastName'),'') IS NOT NULL)) profile,
        CASE WHEN ${input.request.kind}='onboard_person' THEN true WHEN ${input.request.kind}='add_employment' THEN EXISTS(SELECT 1 FROM master.person p WHERE p.tenant_id=${input.context.tenantId}::uuid AND p.id=${input.request.targetPersonId ?? null}::uuid AND p.status='active') ELSE EXISTS(SELECT 1 FROM master.employment e JOIN master.employee m ON m.tenant_id=e.tenant_id AND m.id=e.employee_id WHERE e.tenant_id=${input.context.tenantId}::uuid AND e.id=${input.request.targetEmploymentId ?? null}::uuid AND e.person_id=${input.request.targetPersonId ?? null}::uuid AND e.employee_id=${input.request.targetEmployeeId ?? null}::uuid AND e.status='active' AND m.person_id=e.person_id) END target`.execute(
            transaction,
          );
          const row = evidence.rows[0]!,
            checks = [
              [
                "workforce.legal_entity.effective",
                "$.legalEntityId",
                row.legal_entity,
              ],
              ["workforce.company.effective", "$.companyCodeId", row.company],
              ["workforce.org_unit.effective", "$.orgUnitId", row.org_unit],
              ["workforce.position.effective", "$.positionId", row.position],
              [
                "workforce.profile.ready",
                "$.protectedProfileContentItemId",
                row.profile,
              ],
              ["workforce.target.consistent", "$.target", row.target],
            ] as const;
          return {
            evaluationId: randomUUID(),
            evaluatedAt: new Date().toISOString(),
            ruleset: {
              code: "workforce.lifecycle.validation",
              version: 1,
              hash: createHash("sha256")
                .update("workforce.lifecycle.validation.v1")
                .digest("hex"),
            },
            valid: checks.every(([, , ok]) => ok),
            findings: checks.map(([code, path, ok]) => ({
              ruleCode: code,
              severity: "error" as const,
              fieldPath: path,
              outcome: ok ? ("passed" as const) : ("failed" as const),
              messageCode: ok
                ? "WORKFORCE_RULE_PASSED"
                : "WORKFORCE_RULE_FAILED",
              evidenceReference: { checked: true },
            })),
          };
        },
      },
      requestWorkflows: {
        async resolve(input, transaction) {
          const candidates = await sql<{
            principal_id: string;
          }>`SELECT principal_id::text FROM document.fn_workforce_request_approvers(${input.context.tenantId}::uuid,${input.request.legalEntityId}::uuid,${input.request.companyCodeId ?? null}::uuid,${input.context.principalId}::uuid)`.execute(
            transaction,
          );
          return {
            code: "NeonWorkforceLifecycle",
            version: 1,
            hash: createHash("sha256")
              .update("neon.workforce.lifecycle.v1")
              .digest("hex"),
            stageCode: "people_review",
            stageName: "People review",
            approverPrincipalIds: candidates.rows.map(
              (row) => row.principal_id,
            ),
          };
        },
      },
      transactions,
      audit,
      outbox: createDatabaseOutboxWriter("business-partner"),
      ...(protectedValues ? { protectedValues } : {}),
    });
    container.services.workforce = workforce;
    const supplierWorkforceEligibility =
      process.env["MESH_WORKFORCE_ELIGIBILITY_BASE_URL"] &&
      process.env["MESH_WORKFORCE_ELIGIBILITY_CREDENTIAL_REFERENCE"] &&
      container.adapters.secretStore
        ? createHttpSupplierWorkforceDistributionEligibility({
            baseUrl: process.env["MESH_WORKFORCE_ELIGIBILITY_BASE_URL"],
            credentialReference:
              process.env["MESH_WORKFORCE_ELIGIBILITY_CREDENTIAL_REFERENCE"],
            secrets: container.adapters.secretStore,
          })
        : {
            async evaluate() {
              return {
                allowed: false as const,
                reasonCodes: ["MESH_WORKFORCE_ELIGIBILITY_UNAVAILABLE"],
              };
            },
          };
    const supplierWorkforcePolicies = parseSupplierWorkforcePolicyCoordinates(
      process.env["SUPPLIER_WORKFORCE_POLICY_COORDINATES_JSON"],
    );
    const supplierWorkforceGuard = createSupplierWorkforceCommandGuard({
      authorizer: businessPartnerAuthorizer,
      policies: supplierWorkforcePolicies,
    });
    const supplierWorkforceRequisitions =
      createSupplierWorkforceRequisitionService<RecordTransaction>({
        authorizer: businessPartnerAuthorizer,
        repository: new KyselySupplierWorkforceRequisitionRepository(),
        eligibility: supplierWorkforceEligibility,
        policies: supplierWorkforcePolicies,
        transactions,
      });
    const workerEngagementIam =
      createWorkerEngagementIamService<RecordTransaction>({
        guard: supplierWorkforceGuard,
        repository: new KyselyWorkerEngagementIamRepository(),
        transactions,
      });
    const workerEngagementLifecycle =
      createWorkerEngagementLifecycleService<RecordTransaction>({
        guard: supplierWorkforceGuard,
        repository: new KyselyWorkerEngagementLifecycleRepository(),
        transactions,
      });
    const businessPartnerInvitations =
      createBusinessPartnerInvitationService<RecordTransaction>({
        authorizer: businessPartnerAuthorizer,
        repository: new KyselyBusinessPartnerInvitationRepository(),
        transactions,
        schemas: {
          async resolve(input) {
            try {
              return await transactions.run(
                "neon",
                {
                  tenantId: input.context.tenantId,
                  principalId: input.context.principalId,
                },
                async (transaction) =>
                  new LocalBusinessPartnerDefinitionConsumer({
                    local: new KyselyLocalProjectionRepository(transaction),
                    canonicalizer: { canonicalBytes, sha256 },
                  }).requestSchema({
                    kind: input.kind,
                    sourceKind: input.sourceKind,
                    ...(input.requestedRole
                      ? { requestedRole: input.requestedRole }
                      : {}),
                  }),
              );
            } catch (error) {
              throw new MasterDataError(
                503,
                "BUSINESS_PARTNER_REQUEST_SCHEMA_UNAVAILABLE",
                error instanceof Error
                  ? error.message
                  : "Verified local Business Partner definition is unavailable",
              );
            }
          },
        },
        audit,
        outbox: createDatabaseOutboxWriter("business-partner"),
        onboardingCycles:
          new KyselyBusinessPartnerOnboardingCycleCoordinator() as never,
        requests: businessPartnerRequests,
        evidence: {
          async stage(input) {
            const service = container.services.attachments;
            if (!service)
              throw new MasterDataError(
                503,
                "BUSINESS_PARTNER_INVITATION_EVIDENCE_UNAVAILABLE",
                "Attachment service is unavailable",
              );
            return service.stage(input);
          },
          async finalize(input, contentType) {
            const service = container.services.attachments;
            if (!service)
              throw new MasterDataError(
                503,
                "BUSINESS_PARTNER_INVITATION_EVIDENCE_UNAVAILABLE",
                "Attachment service is unavailable",
              );
            return service.finalize(input, contentType);
          },
        },
      });
    container.services.businessPartnerInvitations = businessPartnerInvitations;
    const businessPartnerProfileMatches =
      createBusinessPartnerProfileMatchService({
        authorizer: businessPartnerAuthorizer,
        repository: new KyselyBusinessPartnerProfileMatchRepository(),
        transactions: transactions as never,
        businessPartnerRequests,
      });
    container.services.businessPartnerProfileMatches =
      businessPartnerProfileMatches;
    const businessPartnerEligibility =
      createBusinessPartnerEligibilityService<RecordTransaction>({
        authorizer: businessPartnerAuthorizer,
        repository: new KyselyBusinessPartnerEligibilityRepository(),
        transactions,
        audit,
        outbox: createDatabaseOutboxWriter("business-partner"),
        onboardingCycles:
          new KyselyBusinessPartnerOnboardingCycleCoordinator() as never,
      });
    container.services.businessPartnerEligibility = businessPartnerEligibility;
    container.services.businessPartnerAtlasInsights =
      createBusinessPartnerAtlasInsightOwner({
        summary: businessPartner360,
        eligibility: businessPartnerEligibility,
        authorizer: businessPartnerAuthorizer,
      });
    const requestCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_business_partner_case_http_total",
      "Business Partner governed-case HTTP operations by outcome",
    );
    const requestDuration = container.adapters.openTelemetry?.metrics.histogram(
      "athyper_business_partner_case_http_duration_ms",
      "Business Partner governed-case HTTP operation duration",
    );
    const eligibilityCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_business_partner_eligibility_http_total",
      "Business Partner eligibility HTTP operations by outcome",
    );
    const eligibilityDuration =
      container.adapters.openTelemetry?.metrics.histogram(
        "athyper_business_partner_eligibility_http_duration_ms",
        "Business Partner eligibility HTTP operation duration",
      );
    const matchCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_business_partner_profile_match_http_total",
      "MESH Business Partner match/request HTTP operations by outcome",
    );
    const matchDuration = container.adapters.openTelemetry?.metrics.histogram(
      "athyper_business_partner_profile_match_http_duration_ms",
      "MESH Business Partner match/request HTTP operation duration",
    );
    const invitationCount = container.adapters.openTelemetry?.metrics.counter(
      "athyper_business_partner_invitation_http_total",
      "Business Partner invitation HTTP operations and rejected external requests",
    );
    const invitationDuration =
      container.adapters.openTelemetry?.metrics.histogram(
        "athyper_business_partner_invitation_http_duration_ms",
        "Business Partner invitation HTTP operation duration",
      );
    const bp360Count = container.adapters.openTelemetry?.metrics.counter(
      "athyper_bp360_request_total",
      "Business Partner 360 operations by safe outcome and section",
    );
    const bp360Duration = container.adapters.openTelemetry?.metrics.histogram(
      "athyper_bp360_duration_ms",
      "Business Partner 360 operation duration in milliseconds",
    );
    const bp360Payload = container.adapters.openTelemetry?.metrics.histogram(
      "athyper_bp360_payload_bytes",
      "Business Partner 360 response payload bytes",
    );
    const bp360Completeness = container.adapters.openTelemetry?.metrics.counter(
      "athyper_bp360_completeness_total",
      "Business Partner 360 completeness outcomes",
    );
    const bp360Redaction = container.adapters.openTelemetry?.metrics.counter(
      "athyper_bp360_redaction_total",
      "Business Partner 360 redaction notices by classification",
    );
    const bp360Reveal = container.adapters.openTelemetry?.metrics.counter(
      "athyper_bp360_reveal_total",
      "Business Partner 360 purpose-bound reveal outcomes",
    );
    const bp360MeshFallback = container.adapters.openTelemetry?.metrics.counter(
      "athyper_bp360_mesh_fallback_total",
      "Business Partner 360 MESH local-projection fallbacks",
    );
    const invitationGuard = createBusinessPartnerInvitationExternalGuard({
      onRejected: (reason) =>
        invitationCount?.increment({
          operation: "external_guard",
          outcome: reason,
          status_code: reason === "rate_limited" ? "429" : "413",
        }),
    });
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerRequestRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: businessPartnerRequests,
        aggregate360: businessPartner360,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          requestCount?.increment(labels);
          requestDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerGovernedInternalBusinessPartnerRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: governedInternalBusinessPartnerCases,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          requestCount?.increment(labels);
          requestDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartner360Routes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: businessPartner360,
        createComment: async (
          context,
          businessPartnerId,
          text,
          idempotencyKey,
        ) => {
          if (!container.services.collaboration)
            throw new Error("Collaboration is unavailable");
          return container.services.collaboration.create({
            context,
            entityType: "master.business_partner",
            entityId: businessPartnerId,
            contextType: "entity",
            text,
            visibility: "internal",
            idempotencyKey,
          });
        },
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
            section: event.section ?? "none",
            state: event.state ?? "none",
            reason_code: event.reasonCode ?? "none",
          };
          bp360Count?.increment(labels);
          bp360Duration?.record(event.durationMs, labels);
          if (event.payloadBytes !== undefined)
            bp360Payload?.record(event.payloadBytes, {
              operation: event.operation,
              section: event.section ?? "none",
            });
          if (event.completenessStatus)
            bp360Completeness?.increment({
              pack: "composed",
              status: event.completenessStatus,
            });
          for (const fieldClass of event.redactionClasses ?? [])
            bp360Redaction?.increment({ field_class: fieldClass });
          if (event.revealClass)
            bp360Reveal?.increment({
              field_class: event.revealClass,
              outcome: event.outcome,
              reason_code: event.reasonCode ?? "none",
            });
          if (event.meshFallbackReason)
            bp360MeshFallback?.increment({
              reason_code: event.meshFallbackReason,
            });
        },
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerWorkforceRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: workforce,
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerSupplierWorkforceRequisitionRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: supplierWorkforceRequisitions,
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerWorkerEngagementIamRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: workerEngagementIam,
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerWorkerEngagementLifecycleRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: workerEngagementLifecycle,
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerInvitationRoutes(application, {
        authenticateInternal: createIamAuthenticationMiddleware(iam),
        authenticateExternal: createIamAuthenticationMiddleware(iam),
        externalGuard: invitationGuard,
        readContext: readVerifiedRequestContext,
        service: businessPartnerInvitations,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          invitationCount?.increment(labels);
          invitationDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerEligibilityRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: businessPartnerEligibility,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          eligibilityCount?.increment(labels);
          eligibilityDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerBusinessPartnerProfileMatchRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: businessPartnerProfileMatches,
        telemetry: (event) => {
          const labels = {
            operation: event.operation,
            outcome: event.outcome,
            status_code: String(event.statusCode),
          };
          matchCount?.increment(labels);
          matchDuration?.record(event.durationMs, labels);
        },
      }),
    );
    container.runtimes.health.register(
      "business-partner-profile-matches.neon",
      async () => {
        try {
          const result = await sql<{
            match_table: string | null;
            acceptance_table: string | null;
            event_table: string | null;
            source_fk: boolean;
            permission_count: number;
          }>`SELECT to_regclass('document.mesh_business_partner_match')::text match_table,to_regclass('document.mesh_business_partner_acceptance')::text acceptance_table,to_regclass('document.mesh_business_partner_acceptance_event')::text event_table,EXISTS(SELECT 1 FROM pg_constraint WHERE conname='mesh_business_partner_acceptance_event_case_fk') source_fk,(SELECT count(*)::int FROM authz.permission WHERE canonical_code LIKE 'neon.business_partner_profile_match.%' AND status='published') permission_count`.execute(
            neonDatabase,
          );
          const row = result.rows[0];
          return row?.match_table &&
            row.acceptance_table &&
            row.event_table &&
            row.source_fk &&
            row.permission_count === 3
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "MESH Business Partner match/request DDL or permission contract is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "MESH Business Partner match readiness check failed",
          };
        }
      },
    );
    container.runtimes.health.register(
      "business-partner-cases.neon",
      async () => {
        try {
          const result = await sql<{
            case_table: string | null;
            evidence_table: string | null;
            validation_table: string | null;
            materialization_table: string | null;
            draft_command: string | null;
            lifecycle_command: string | null;
            role_materializer: string | null;
          }>`SELECT to_regclass('document.entity_case')::text case_table,to_regclass('document.entity_case_command_evidence')::text evidence_table,to_regclass('document.entity_case_validation')::text validation_table,to_regclass('document.entity_case_materialization')::text materialization_table,to_regprocedure('document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid)')::text draft_command,to_regprocedure('document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid)')::text lifecycle_command,to_regprocedure('master.command_materialize_business_partner_role_case(uuid,uuid,bigint,text,uuid,uuid)')::text role_materializer`.execute(
            neonDatabase,
          );
          const row = result.rows[0];
          return row?.case_table &&
            row.evidence_table &&
            row.validation_table &&
            row.materialization_table &&
            row.draft_command &&
            row.lifecycle_command &&
            row.role_materializer
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "Governed Business Partner case pipeline is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "Governed Business Partner case readiness check failed",
          };
        }
      },
    );
    container.runtimes.health.register(
      "governed-internal-business-partner.neon",
      async () => {
        try {
          const row = (
            await sql<{
              case_table: string | null;
              draft_command: string | null;
              lifecycle_command: string | null;
              materialize_command: string | null;
            }>`SELECT to_regclass('document.entity_case')::text case_table,to_regprocedure('document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid)')::text draft_command,to_regprocedure('document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid)')::text lifecycle_command,to_regprocedure('master.command_materialize_internal_business_partner_case(uuid,uuid,bigint,text,uuid,uuid)')::text materialize_command`.execute(
              neonDatabase,
            )
          ).rows[0];
          return row?.case_table &&
            row.draft_command &&
            row.lifecycle_command &&
            row.materialize_command
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "Governed internal Business Partner command pipeline is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "Governed internal Business Partner readiness check failed",
          };
        }
      },
    );
    container.runtimes.health.register("workforce-requests.neon", async () => {
      try {
        const row = (
          await sql<{
            request_table: string | null;
            validation_table: string | null;
            guard_function: string | null;
            approver_function: string | null;
            permission_count: number;
          }>`SELECT to_regclass('document.workforce_request')::text request_table,to_regclass('document.workforce_request_validation')::text validation_table,to_regprocedure('document.fn_workforce_request_payload_has_restricted_key(jsonb)')::text guard_function,to_regprocedure('document.fn_workforce_request_approvers(uuid,uuid,uuid,uuid)')::text approver_function,(SELECT count(*)::int FROM authz.permission WHERE canonical_code LIKE 'neon.workforce.request.%' AND status='published') permission_count`.execute(
            neonDatabase,
          )
        ).rows[0];
        return row?.request_table &&
          row.validation_table &&
          row.guard_function &&
          row.approver_function &&
          row.permission_count === 6
          ? { status: "healthy" }
          : {
              status: "unhealthy",
              message:
                "People-owned workforce validation, workflow, materializer, or permission contract is incomplete",
            };
      } catch (error) {
        return {
          status: "unhealthy",
          message:
            error instanceof Error
              ? error.message
              : "Workforce request readiness check failed",
        };
      }
    });
    container.runtimes.health.register(
      "business-partner-invitations.neon",
      async () => {
        try {
          const row = (
            await sql<{
              invitation_table: string | null;
              recovery_table: string | null;
              access_revocation: boolean;
            }>`SELECT to_regclass('document.business_partner_invitation')::text invitation_table,to_regclass('document.business_partner_invitation_recovery')::text recovery_table,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='document' AND table_name='business_partner_invitation' AND column_name='applicant_access_revoked_at') access_revocation`.execute(
              neonDatabase,
            )
          ).rows[0];
          return row?.invitation_table &&
            row.recovery_table &&
            row.access_revocation
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "Generalized invitation aggregate, recovery authority, or applicant-access revocation is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "Business Partner invitation readiness check failed",
          };
        }
      },
    );
    if (container.runtimes.jobs) {
      container.runtimes.jobs.register(
        BUSINESS_PARTNER_INVITATION_MAINTENANCE_QUEUE,
        EXPIRE_BUSINESS_PARTNER_INVITATIONS_JOB,
        createBusinessPartnerInvitationExpiryHandler(
          businessPartnerInvitations,
        ),
      );
      container.runtimes.jobDefinitions.push({
        code: EXPIRE_BUSINESS_PARTNER_INVITATIONS_JOB,
        owner: "@athyper/server-service-master-data",
        queue: BUSINESS_PARTNER_INVITATION_MAINTENANCE_QUEUE,
        name: EXPIRE_BUSINESS_PARTNER_INVITATIONS_JOB,
        scope: "tenant",
        payloadSchema: {
          name: EXPIRE_BUSINESS_PARTNER_INVITATIONS_JOB,
          version: 1,
        },
        timeoutMs: 60_000,
        maxAttempts: 5,
        executionRetentionDays: 30,
      });
    }
    if (container.runtimes.jobs) {
      container.runtimes.jobs.register(
        SUPPLIER_READINESS_MAINTENANCE_QUEUE,
        EXPIRE_SUPPLIER_QUALIFICATIONS_JOB,
        createSupplierQualificationExpiryHandler(businessPartnerEligibility),
      );
      container.runtimes.jobs.register(
        SUPPLIER_READINESS_MAINTENANCE_QUEUE,
        REEVALUATE_SUPPLIER_ACTIVATIONS_JOB,
        createSupplierActivationReevaluationHandler(businessPartnerEligibility),
      );
      for (const code of [
        EXPIRE_SUPPLIER_QUALIFICATIONS_JOB,
        REEVALUATE_SUPPLIER_ACTIVATIONS_JOB,
      ])
        container.runtimes.jobDefinitions.push({
          code,
          owner: "@athyper/server-service-master-data",
          queue: SUPPLIER_READINESS_MAINTENANCE_QUEUE,
          name: code,
          scope: "tenant",
          payloadSchema: { name: code, version: 1 },
          timeoutMs: 120_000,
          maxAttempts: 5,
          executionRetentionDays: 90,
        });
    }
    container.runtimes.health.register(
      "business-partner-eligibility.neon",
      async () => {
        try {
          const result = await sql<{
            qualification_table: string | null;
            preference_table: string | null;
            block_table: string | null;
            risk_table: string | null;
            activation_evidence_table: string | null;
            row_version: boolean;
            idempotency_key: boolean;
            permission_count: number;
          }>`SELECT to_regclass('control.business_partner_qualification')::text AS qualification_table,to_regclass('control.supplier_preference_designation')::text AS preference_table,to_regclass('control.business_partner_block')::text AS block_table,to_regclass('master.party_risk_assessment')::text AS risk_table,to_regclass('document.supplier_activation_evidence')::text AS activation_evidence_table,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='business_partner_qualification' AND column_name='row_version' AND is_nullable='NO') AS row_version,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='business_partner_qualification' AND column_name='idempotency_key' AND is_nullable='NO') AS idempotency_key,(SELECT count(*)::int FROM authz.permission WHERE canonical_code IN ('neon.supplier.qualification.admin','neon.supplier.preference.admin','neon.relationship.business_partner.read','neon.relationship.business_partner.activate')) AS permission_count`.execute(
            neonDatabase,
          );
          const row = result.rows[0];
          return row?.qualification_table &&
            row.preference_table &&
            row.block_table &&
            row.risk_table &&
            row.activation_evidence_table &&
            row.row_version &&
            row.idempotency_key &&
            row.permission_count === 4
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "Business Partner qualification, preference, or activation contract is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "Business Partner eligibility readiness check failed",
          };
        }
      },
    );
    container.runtimes.health.register(
      "business-partner-role-extensions.neon",
      async () => {
        try {
          const result = await sql<{
            customer_table: string | null;
            role_materializer: string | null;
            normalized_command: string | null;
          }>`SELECT to_regclass('master.customer')::text customer_table,to_regprocedure('master.command_materialize_business_partner_role_case(uuid,uuid,bigint,text,uuid,uuid)')::text role_materializer,to_regprocedure('control.command_create_business_partner_decision(uuid,text,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid)')::text normalized_command`.execute(
            neonDatabase,
          );
          const row = result.rows[0];
          return row?.customer_table &&
            row.role_materializer &&
            row.normalized_command
            ? { status: "healthy" }
            : {
                status: "unhealthy",
                message:
                  "Governed supplier/customer role materialization contract is incomplete",
              };
        } catch (error) {
          return {
            status: "unhealthy",
            message:
              error instanceof Error
                ? error.message
                : "Business Partner role extension readiness check failed",
          };
        }
      },
    );
  }
  registerStudioAuthoring(
    container,
    config,
    metadataDatabases.studio,
    iam,
    authorizer,
    transactions,
  );
  registerStudioOnboarding(
    container,
    metadataDatabases.studio,
    dependencies.onboardingTransport,
    iam,
    authorizer,
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
      authorizer,
      principals: createKyselyPrincipalDirectory(),
      repository: createKyselyCollaborationRepository(),
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
  );
  container.platform.httpRegistrars.push((application) =>
    registerSavedViewRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      savedViews,
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
  if (config?.localContactDeliveryKey && notificationHandlers.has("email"))
    notificationHandlers.set(
      "email",
      localVerificationEmailHandler(
        notificationHandlers.get("email")!,
        config.localContactDeliveryKey,
      ),
    );
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
  const notificationPlanner = createNotificationPlanner({
    transactions: exactTransactions,
    consent: consent ?? denyAllConsent,
  });
  const notificationPlanningCount =
    container.adapters.openTelemetry?.metrics.counter(
      "athyper_business_partner_notification_planning_total",
      "Business Partner notification planning outcomes",
    );
  const notificationPlanningDuration =
    container.adapters.openTelemetry?.metrics.histogram(
      "athyper_business_partner_notification_planning_duration_ms",
      "Business Partner notification planning duration",
    );
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
        telemetry: (measurement) => {
          if (!measurement.eventCode.startsWith("business_partner.")) return;
          const labels = {
            lifecycle: businessPartnerNotificationLifecycle(
              measurement.eventCode,
            ),
            outcome: measurement.outcome,
          };
          notificationPlanningCount?.increment(labels);
          notificationPlanningDuration?.record(measurement.durationMs, labels);
        },
      }),
    );
    jobs.register(
      NOTIFICATION_MAINTENANCE_QUEUE,
      DELIVERY_SWEEP_JOB,
      createDeliverySweepHandler({
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
    const name = "references.history.expire", queue = "references.history.maintenance";
    container.runtimes.jobs.register(queue, name, { async handle(job) {
      const planeKey = (job.data as {planeKey?: PlaneKey}).planeKey;
      if (!planeKey || !["neon", "studio", "mesh"].includes(planeKey) || !metadataDatabases[planeKey]) return {status:"discarded",reason:"plane_database_unavailable"};
      const result = await sql<{removed:string|number}>`SELECT master.purge_expired_reference_choices(5000) AS removed`.execute(metadataDatabases[planeKey]!);
      return {status:"completed",output:{removed:Number(result.rows[0]?.removed??0)}};
    }});
    container.runtimes.jobDefinitions.push({code:name,owner:"@athyper/server-platform-preferences",queue,name,scope:"plane",payloadSchema:{name,version:1},timeoutMs:60000,maxAttempts:3,executionRetentionDays:7});
    if(container.runtimes.scheduler)for(const planeKey of Object.keys(metadataDatabases) as PlaneKey[])container.runtimes.scheduledJobs.push({scheduleId:`reference-history-expiry-${planeKey}`,queue,name,data:{planeKey},pattern:{kind:"interval",everyMs:300000},options:{jobId:`references:history:expire:${planeKey}`,maxAttempts:3,payloadSchema:{name,version:1},execution:{planeKey,scope:"plane",principalId:"reference-history-maintenance"}}});
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
  container.platform.httpRegistrars.push((application) =>
    registerNotificationRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      inbox: notificationRepositories,
      push: notificationRepositories,
      webPushPublicKey: config?.webPush.publicKey,
      webPushAvailable: container.adapters.pushTransports.some((transport) =>
        transport.platforms.includes("web"),
      ),
      events: notificationEvents,
      preferences: notificationPreferences,
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
      createKyselyRecordRepository({ databases: recordDatabases });
    const outbox = dependencies.outbox ?? createDatabaseOutboxWriter("records");
    const commandExecutions =
      dependencies.commandExecutions ?? createKyselyCommandExecutionStore();
    const common = {
      metadata,
      authorizer,
      audit,
      outbox,
      commandExecutions,
      repository,
      transactions,
    };
    const listMetadata = createStudioCatalogMetadataReader(metadata);
    const collectionScopes = container.platform.experience
      ? combineRecordCollectionScopeResolvers(
          createNeonRecordCollectionScopeResolver(
            container.platform.experience.service,
            async (context, coordinate) => {
              const records = container.services.records,
                eligibility = container.services.businessPartnerEligibility;
              if (!records || !eligibility)
                throw new Error("Eligibility directory adapter unavailable");
              const { eligibleOperation, ...scopeCoordinate } = coordinate;
              const ids: string[] = [];
              let cursor: string | undefined,
                examined = 0;
              do {
                const page = await records.queries.list({
                  context,
                  entityCode: "business_partner",
                  scopeCoordinate,
                  limit: 100,
                  ...(cursor ? { cursor } : {}),
                });
                examined += page.data.length;
                if (examined > 10000)
                  throw new Error(
                    "Narrow directory scope before checking transaction eligibility",
                  );
                for (const row of page.data) {
                  const id = String(row["id"]);
                  const decision = await eligibility.resolve({
                    context,
                    businessPartnerId: id,
                    role: coordinate.partnerRole!,
                    operatingOrganizationId:
                      coordinate.operatingOrganizationId!,
                    companyCodeId: coordinate.companyCodeId!,
                    operationCode: eligibleOperation!,
                    businessDate: new Date().toISOString().slice(0, 10),
                  });
                  if (decision.eligible) ids.push(id);
                }
                cursor = page.pagination.nextCursor;
              } while (cursor);
              return ids;
            },
          ),
          createMeshRecordCollectionScopeResolver(
            container.platform.experience.service,
          ),
          createStudioRecordCollectionScopeResolver(),
        )
      : undefined;
    const listExecutionOptions = {
      ...common,
      metadata: listMetadata,
      ...(collectionScopes ? { collectionScopes } : {}),
    };
    const listExecutor = createRecordListExecutor(listExecutionOptions);
    const queries = createRecordQueryService(
      listExecutionOptions,
      listExecutor,
    );
    const lists = createEntityListService({
      formChoices: async (context, sourceKey) => {
        const database=metadataDatabases[context.planeKey];
        if(!database)throw Error("INTAKE_LOOKUP_DATABASE_UNAVAILABLE");
        if((bankFormSources as readonly string[]).includes(sourceKey))return bankFormChoices(database,sourceKey);
        if(sourceKey==="iso.currency"){
          const result=await sql<{code:string;name:string}>`SELECT code,name FROM shared.currency WHERE status='active' ORDER BY name LIMIT 500`.execute(database);
          return result.rows.map(row=>({value:row.code.trim(),label:row.name}));
        }
        if(sourceKey==="iso.country" || sourceKey==="shared.state_region")return addressFormChoices(database,sourceKey);
        if(context.planeKey!=="neon")throw Error("INTAKE_LOOKUP_SOURCE_UNREGISTERED");
        const tables:Record<string,string>={"neon.commodity_category":"master.commodity_category","neon.tax_jurisdiction":"master.tax_jurisdiction","neon.tax_type":"master.tax_type","neon.certification_type":"master.certification_type"};
        const table=tables[sourceKey];
        const result=sourceKey==="shared.industry_code"
          ?await sql<{id:string;code:string;name:string}>`SELECT id::text,domain_code||' '||code code,name FROM shared.industry_code WHERE status='active' ORDER BY domain_code,code LIMIT 2001`.execute(database)
          :table?await sql<{id:string;code:string;name:string}>`SELECT id::text,code,name FROM ${sql.table(table)} WHERE tenant_id=${context.tenantId}::uuid AND status='active' ORDER BY name,id LIMIT 2001`.execute(database):undefined;
        if(!result)throw Error("INTAKE_LOOKUP_SOURCE_UNREGISTERED");
        if(result.rows.length>2000)throw Error("INTAKE_LOOKUP_REQUIRES_PAGED_SOURCE");
        return result.rows.map(row=>({value:row.id,label:row.code+' · '+row.name}));
      },
      filterChoices: async (context, fields) => {
        const countries = fields.filter(
          (field) => field.list?.semanticRole === "country_code",
        );
        if (!countries.length) return {};
        const database = metadataDatabases[context.planeKey];
        if (!database) return {};
        // Shared reference data is global; only already-authorized fields reach this resolver.
        const result = await sql<{
          code: string;
          name: string;
        }>`SELECT code, name FROM shared.country ORDER BY name LIMIT 500`.execute(
          database,
        );
        const choices = result.rows.map((row) => ({
          value: row.code.trim(),
          label: row.name,
        }));
        return Object.fromEntries(
          countries.map((field) => [field.key, choices]),
        );
      },
      metadata: listMetadata,
      authorizer,
      listExecutor,
      queries,
      ...(collectionScopes ? { collectionScopes } : {}),
    });
    container.platform.httpRegistrars.push((application) =>
      registerEntityViewRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        service: savedViews,
        descriptor: (context, entity, query) =>
          lists.descriptor(
            context,
            entity,
            parseEntityListScopeCoordinate(query),
          ),
      }),
    );
    container.platform.httpRegistrars.push(application => registerReferenceChoiceRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext,
      descriptor: (context, entity, query) => lists.applicationDescriptor(context, entity, parseEntityListScopeCoordinate(query)),
      store: createReferenceHistoryStore(transactions),
    }));
    intakeApplicationDescriptor=lists.applicationDescriptor.bind(lists);
    intakeReferenceRecord=lists.record.bind(lists);
    const bookmarks = createRecordBookmarkService({
      transactions,
      listExecutor,
      ...(container.adapters.redisCache
        ? { cache: container.adapters.redisCache }
        : {}),
    });
    const mutations = createRecordMutationService(common);
    const snapshots = config?.wave0.recordSnapshotRoutesEnabled
      ? createRecordSnapshotService({
          authorizer,
          metadata,
          queries,
          mutations,
          repository: new KyselyRecordSnapshotRepository(transactions),
        })
      : undefined;
    const transferStore =
      container.runtimes.jobs && objectStorageTransfers
        ? new KyselyRecordTransferStore()
        : undefined;
    const transferArtifacts =
      transferStore && objectStorageTransfers
        ? createObjectStorageRecordTransferArtifactStore(objectStorageTransfers)
        : undefined;
    const transferScanner =
      dependencies.malwareScanner ?? container.adapters.malwareScanner;
    const workbookIntake =
      objectStorageTransfers && transferScanner
        ? createObjectStorageImportWorkbookIntake(
            objectStorageTransfers,
            transferScanner,
          )
        : undefined;
    const importAdapters = new GovernedImportAdapterRegistry([
      createNeonBusinessPartnerImportAdapter(),
      createMeshRelationshipRequestImportAdapter(),
      createStudioMetadataDraftImportAdapter(),
    ]);
    const transfers =
      transferStore && transferArtifacts && container.runtimes.jobs
        ? createRecordTransferService({
            staging: transferStore,
            validator: createMetadataImportRowValidator(
              listMetadata,
              authorizer,
            ),
            jobs: createRecordTransferJobDispatcher(container.runtimes.jobs),
            metadata: listMetadata,
            authorizer,
            audit,
            outbox,
            transactions,
            adapters: importAdapters,
            ...(collectionScopes ? { collectionScopes } : {}),
            errorReports: transferArtifacts,
            ...(workbookIntake ? { workbookIntake } : {}),
          })
        : undefined;
    container.services.records = {
      surfaces: lists,
      lists,
      queries,
      mutations,
      ...(snapshots ? { snapshots } : {}),
      ...(transfers ? { transfers } : {}),
    };
    container.platform.httpRegistrars.push((application) =>
      registerEntityListRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        lists,
      }),
    );
    container.platform.httpRegistrars.push((application) =>
      registerRecordBookmarkRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        bookmarks,
      }),
    );
    if (snapshots)
      container.platform.httpRegistrars.push((application) =>
        registerRecordSnapshotRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          authorizer,
          snapshots,
        }),
      );
    if (
      transfers &&
      transferStore &&
      transferArtifacts &&
      container.runtimes.jobs
    ) {
      const transferRouteOptions = {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          transfers,
        },
        metrics = container.adapters.processMetrics;
      container.platform.httpRegistrars.push((application) =>
        registerRecordTransferRoutes(application, transferRouteOptions),
      );
      if (config?.wave0.recordTransferPublicApiEnabled)
        container.platform.httpRegistrars.push((application) =>
          registerPublicRecordTransferRoutes(application, transferRouteOptions),
        );
      container.runtimes.jobs.register(
        RECORD_TRANSFER_QUEUE,
        EXECUTE_RECORD_IMPORT_JOB,
        createRecordImportHandler({
          store: transferStore,
          metadata: listMetadata,
          authorizer,
          adapters: importAdapters,
          ...(collectionScopes ? { collectionScopes } : {}),
          transactions,
          audit,
          outbox,
          ...(metrics ? { metrics } : {}),
        }),
      );
      container.runtimes.jobs.register(
        RECORD_TRANSFER_QUEUE,
        EXECUTE_RECORD_EXPORT_JOB,
        createRecordExportHandler({
          store: transferStore,
          metadata: listMetadata,
          authorizer,
          queries,
          ...(collectionScopes ? { collectionScopes } : {}),
          transactions,
          artifacts: transferArtifacts,
          audit,
          outbox,
          ...(metrics ? { metrics } : {}),
        }),
      );
      container.runtimes.jobDefinitions.push(
        {
          code: EXECUTE_RECORD_IMPORT_JOB,
          owner: "@athyper/server-service-records",
          queue: RECORD_TRANSFER_QUEUE,
          name: EXECUTE_RECORD_IMPORT_JOB,
          scope: "tenant",
          payloadSchema: { name: EXECUTE_RECORD_IMPORT_JOB, version: 1 },
          timeoutMs: 300_000,
          maxAttempts: 5,
          executionRetentionDays: 90,
        },
        {
          code: EXECUTE_RECORD_EXPORT_JOB,
          owner: "@athyper/server-service-records",
          queue: RECORD_TRANSFER_QUEUE,
          name: EXECUTE_RECORD_EXPORT_JOB,
          scope: "tenant",
          payloadSchema: { name: EXECUTE_RECORD_EXPORT_JOB, version: 1 },
          timeoutMs: 300_000,
          maxAttempts: 5,
          executionRetentionDays: 30,
        },
      );
    }
    container.platform.httpRegistrars.push((application) =>
      registerRecordsRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        queries,
        mutations,
      }),
    );
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
        createWorkflowSlaSweepHandler(workflowSla),
      );
    }
    container.services.workflow = workflow;
    container.platform.httpRegistrars.push((application) =>
      registerWorkflowRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        workflow,
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
  if (
    container.runtimes.jobs &&
    contentExtractor &&
    searchIndex &&
    objectStorage
  ) {
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
  }
  if (searchIndex) {
    const search = createDocumentSearchService({
      authorizer,
      index: searchIndex,
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
    const attachments = createAttachmentLifecycle({
      transactions,
      repository: attachmentRepository,
      storage: objectStorage,
      scanner: malwareScanner,
      quota,
      quotaPolicies,
      outbox: createDatabaseOutboxWriter("attachments"),
      scheduler: {
        scheduleExtraction: async (identity) => {
          await extractionScheduler?.schedule({ ...identity });
        },
        scheduleDerivatives: async (request, options) => {
          await derivativeScheduler?.schedule({
            ...request,
            ...(options?.rebuild ? { rebuild: options.rebuild } : {}),
          });
        },
        schedulePurge: async () => undefined,
      },
      ...(config?.objectStorage.scanStreamTimeoutMs !== undefined
        ? { scanStreamTimeoutMs: config.objectStorage.scanStreamTimeoutMs }
        : {}),
    });
    lifecycle?.onShutdown(() => attachments.close());
    container.services.attachments = attachments;
    container.platform.httpRegistrars.push((application) =>
      registerAttachmentRoutes(application, {
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
        EXPIRE_ATTACHMENT_RESERVATIONS_JOB,
        createAttachmentQuotaRecoveryHandler({
          transactions,
          quota,
          attachments: attachmentRepository,
        }),
      );
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
    const documents = createDocumentService({
      metadata,
      authorizer,
      audit,
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
  const caseOwner = container.services.businessPartnerRequests?.explainCase
    ? {
        read: (
          input: Parameters<
            NonNullable<
              NonNullable<
                typeof container.services.businessPartnerRequests
              >["explainCase"]
            >
          >[0],
        ) => container.services.businessPartnerRequests!.explainCase!(input),
      }
    : undefined;
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
      ...createBusinessPartnerAtlasTools(caseOwner),
      ...(caseOwner ? createBusinessPartnerCaseTools(caseOwner) : []),
      ...(container.services.businessPartnerAtlasInsights
        ? createBusinessPartnerInsightTools(
            container.services.businessPartnerAtlasInsights,
            async (query) => {
              const records = container.services.records;
              if (!records)
                throw new Error("Authorized Records runtime is unavailable.");
              return records.lists.list(query);
            },
          )
        : []),
    ]);
    const localAvailable = (access: "read" | "mutation" = "read") =>
      Boolean(
        container.platform.metadata &&
        container.services.records &&
        (access === "read" || container.services.businessPartnerRequests),
      );
    const localTools = toolsEnabled
      ? new AtlasToolService({
          registry: localRegistry,
          proposals: ledger,
          authority: {
            async authorize({ context, manifest }) {
              const allowed =
                (context.planeKey === "neon" ||
                  manifest.toolCode === "entity_read_record") &&
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
                ) &&
                (manifest.access === "read" ||
                  Boolean(config?.atlas.mutationsEnabled));
              return {
                allowed,
                policyRevision: `atlas-local-tools-v2:mutations-${Boolean(config?.atlas.mutationsEnabled)}`,
              };
            },
          },
          records: {
            async query(input) {
              const metadata = container.platform.metadata,
                records = container.services.records;
              if (!metadata || !records)
                throw new Error("Authorized Records runtime is unavailable.");
              return createAtlasRecordDataGateway({
                metadata,
                records: records.queries,
                maxRows: 1,
                maxResponseBytes: 2048,
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
          commands: createBusinessPartnerAtlasCommandBus({
            fallback: {
              async execute() {
                throw new Error("Unregistered local Atlas command.");
              },
            },
            submit: async (command) => {
              if (
                !config?.atlas.mutationsEnabled ||
                !container.services.businessPartnerRequests
              )
                throw new Error("Atlas mutations are disabled.");
              return container.services.businessPartnerRequests.submit(command);
            },
          }),
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
                cases: caseOwner,
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
                  await container.platform.authorizer!.authorize({
                    context,
                    permissionCode: read.permissionCode,
                    resource: {
                      tenantId: context.tenantId,
                      entityCode,
                      resourceCode: entityCode,
                      operationKey: "read",
                      recordId,
                    },
                  })
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
    ...dependencies.registeredTools,
    ...createBusinessPartnerAtlasTools(caseOwner),
    ...(caseOwner ? createBusinessPartnerCaseTools(caseOwner) : []),
    ...(container.services.businessPartnerAtlasInsights
      ? createBusinessPartnerInsightTools(
          container.services.businessPartnerAtlasInsights,
          async (query) => {
            const records = container.services.records;
            if (!records)
              throw new Error("Authorized Records runtime is unavailable.");
            return records.lists.list(query);
          },
        )
      : []),
  ]);
  const tools = new AtlasToolService({
    registry,
    authority: dependencies.toolAuthority,
    proposals: ledger,
    records: dependencies.recordGateway,
    confirmations: dependencies.confirmations,
    commands: createBusinessPartnerAtlasCommandBus({
      fallback: dependencies.commands,
      submit: async (command) => {
        const owner = container.services.businessPartnerRequests;
        if (!owner)
          throw new Error("Business Partner case owner is unavailable.");
        return owner.submit(command);
      },
    }),
  });
  const coordinator = toolsEnabled
    ? new AtlasRegisteredToolCoordinator(registry, tools, atlasMetadata)
    : undefined;
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
          cases: caseOwner,
          records: records.queries,
          list: (query) => records.lists.list(query),
        }).resolve(context, value);
      },
    },
    admission: dependencies.admission,
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
      admission: dependencies.admission,
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
      admission: dependencies.admission,
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
const atlasLearningInboxes = new WeakMap<Container, AtlasLearningInbox>();

function registerStudioAuthoring(
  container: Container,
  config: HostConfig | undefined,
  database: Kysely<Record<string, never>> | undefined,
  iam: NonNullable<Container["platform"]["iam"]>,
  authorizer: NonNullable<Container["platform"]["authorizer"]>,
  transactions: PlaneTransactionCoordinator<RecordTransaction>,
): void {
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
    authorizer,
    sourceCurrent: (proposal) =>
      isAtlasLearningSourceCurrent(transactions, proposal),
    evaluate: evaluateAtlasLearningVocabulary,
  });
  atlasLearningInboxes.set(container, learning);
  const repository = createScopedMetaEntityAuthoringRepository(
    (work) =>
      container.adapters.athyperDatabase!.withTenantTransaction((tx) =>
        work(tx as unknown as Kysely<Record<string, never>>),
      ),
    (db) =>
      new KyselyMetaEntityAuthoringRepository(db, async (tx, input) => {
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
  const service = new MetaEntityAuthoringService({
    ...(preview ? { preview } : {}),
    repository,
    learning,
    signer: new MetaEntityArtifactSigner(
      container.adapters.publicationSigner,
      config.publication.signingKeyId,
    ),
    publication,
  });
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
  container.platform.httpRegistrars.push((application) =>
    registerMetaEntityAuthoringRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      authorizer: authoringAuthorizer,
      service,
    }),
  );
}

function registerStudioOnboarding(
  container: Container,
  database: Kysely<Record<string, never>> | undefined,
  transport: ProvisioningCommandTransport | undefined,
  iam: NonNullable<Container["platform"]["iam"]>,
  authorizer: NonNullable<Container["platform"]["authorizer"]>,
): void {
  container.runtimes.health.register(
    "studio.onboarding-authority",
    async () => {
      if (!database)
        return {
          status: "unhealthy",
          message: "Studio onboarding database is unavailable",
        };
      if (!transport)
        return {
          status: "healthy",
          message: "Studio onboarding routes are disabled",
        };
      try {
        await sql`SELECT 1 FROM onboarding.onboarding_case LIMIT 1`.execute(
          database,
        );
        return { status: "healthy" };
      } catch {
        return {
          status: "unhealthy",
          message: "Studio onboarding schema is unavailable",
        };
      }
    },
  );
  if (!database || !transport || !container.adapters.athyperDatabase) return;
  const repository = new KyselyOnboardingSagaRepository(database);
  const transactions = {
    run: <Result>(
      actor: { tenantId: string; principalId: string },
      work: (
        transaction: Transaction<Record<string, never>>,
      ) => Promise<Result>,
    ) =>
      container.adapters.athyperDatabase!.withTenantTransaction((transaction) =>
        work(transaction as unknown as Transaction<Record<string, never>>),
      ),
  };
  const lifecycle = new OnboardingCaseLifecycleService(
    repository,
    transactions,
  );
  const maintenance = new OnboardingMaintenanceService(
    repository,
    transactions,
    authorizer,
  );
  const saga = createOnboardingSaga({
    repository,
    transport,
    envelopes: createCommandEnvelopeFactory({
      serviceId: "studio-onboarding",
      audienceFor: (plane) => `${plane}-provisioner`,
      newCommandId: randomUUID,
      fingerprint: (value) =>
        createHash("sha256").update(JSON.stringify(value)).digest("hex"),
      now: () => new Date().toISOString(),
    }),
  });
  container.platform.httpRegistrars.push((application) =>
    registerOnboardingRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      authorize: async (context) =>
        Boolean(
          (
            await authorizer.authorize({
              context,
              permissionCode: "studio.onboarding.manage",
            })
          ).allowed,
        ),
      saga,
      lifecycle: lifecycle as OnboardingCaseLifecycleService<unknown>,
      maintenance: maintenance as OnboardingMaintenanceService<unknown>,
    }),
  );
  if (container.runtimes.jobs) {
    container.runtimes.jobs.register(
      ONBOARDING_MAINTENANCE_QUEUE,
      EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,
      createGuestAccessExpiryHandler(maintenance),
    );
    container.runtimes.jobDefinitions.push({
      code: EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,
      owner: "@athyper/server-plane-studio-onboarding",
      queue: ONBOARDING_MAINTENANCE_QUEUE,
      name: EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,
      scope: "tenant",
      payloadSchema: { name: EXPIRE_ONBOARDING_GUEST_ACCESS_JOB, version: 1 },
      timeoutMs: 60_000,
      maxAttempts: 5,
      executionRetentionDays: 90,
    });
  }
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
): void {
  const authorityDatabase = databases.studio;
  if (!authorityDatabase)
    throw new Error("Publication requires the Studio authority database");
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
  container.platform.httpRegistrars.push((application) =>
    registerBankDirectoryReferenceRoute(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      databases,
    }),
  );
  const authority = new KyselyPublicationAuthorityRepository(authorityDatabase);
  const projections: Partial<
    Record<PublicationPlane, KyselyLocalProjectionRepository>
  > = {};
  const orchestrators: Partial<
    Record<PublicationPlane, PublicationOrchestrator>
  > = {};
  for (const plane of config.publication.applyEnabled
    ? config.publication.targetPlanes
    : []) {
    const database = databases[plane];
    if (!database)
      throw new Error(`Publication target database is unavailable: ${plane}`);
    const projection = new KyselyLocalProjectionRepository(database);
    projections[plane] = projection;
    const loader = new VerifiedPublicationArtifactLoader({
      store: container.adapters.publicationArtifactStore!,
      verifier: container.adapters.publicationVerifier!,
      canonicalizer: { canonicalBytes, sha256 },
      runtimeVersion: config.publication.runtimeVersion,
      ...(authorizationCompilation
        ? { authorizationRuntime: authorizationCompilation.runtime }
        : {}),
    });
    orchestrators[plane] = new TenantPublicationOrchestrator(
      authorityDatabase,
      database,
      loader,
    );
  }
  const bankDirectory = new BankDirectoryService({
    database: authorityDatabase,
    authority,
    inspectReferences: async (plane, references) => {
      const database = databases[plane];
      if (!database) throw new Error("BANK_DIRECTORY_PLANE_UNAVAILABLE");
      return reconcileBankDirectoryReferences(database, references);
    },
    inspectPlane: async (plane, tenantId) => {
      const database = databases[plane];
      if (!database) return { available: false };
      return database.transaction().execute(async (db) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(
          db,
        );
        const row = (
          await sql<{
            id: string;
            version: string;
            content_hash: string;
          }>`SELECT r.id,r.version,r.content_hash FROM shared.bank_directory_activation a JOIN shared.bank_directory_release r ON r.id=a.release_id WHERE a.singleton`.execute(
            db,
          )
        ).rows[0];
        const releases = (
          await sql<{
            id: string;
            hash: string;
          }>`SELECT id,encode(public.digest(payload::text,'sha256'),'hex') hash FROM shared.bank_directory_release ORDER BY version`.execute(
            db,
          )
        ).rows;
        return {
          available: true,
          releases,
          ...(row
            ? {
                releaseId: row.id,
                version: Number(row.version),
                hash: row.content_hash,
              }
            : {}),
        };
      });
    },
  });
  const directoryAuthorityTenant =
    process.env["BANK_DIRECTORY_AUTHORITY_TENANT_ID"];
  const directoryReconcileJob = "publication.bank-directory.reconcile";
  if (directoryAuthorityTenant) {
    if (!/^[0-9a-f-]{36}$/i.test(directoryAuthorityTenant))
      throw new Error("BANK_DIRECTORY_AUTHORITY_TENANT_ID is invalid");
    container.runtimes.jobs?.register(
      PUBLICATION_MAINTENANCE_QUEUE,
      directoryReconcileJob,
      {
        async handle() {
          const result = await bankDirectory.reconcile(
            directoryAuthorityTenant,
            "",
          );
          return { status: "completed", output: result };
        },
      },
    );
    container.runtimes.jobDefinitions.push({
      code: directoryReconcileJob,
      owner: "@athyper/server-service-publication",
      queue: PUBLICATION_MAINTENANCE_QUEUE,
      name: directoryReconcileJob,
      scope: "plane",
      payloadSchema: { name: directoryReconcileJob, version: 1 },
      timeoutMs: 60_000,
      maxAttempts: 3,
      executionRetentionDays: 90,
    });
    if (container.runtimes.scheduler && config.publication.recoveryEnabled)
      container.runtimes.scheduledJobs.push({
        scheduleId: "bank-directory-reconciliation",
        queue: PUBLICATION_MAINTENANCE_QUEUE,
        name: directoryReconcileJob,
        data: {},
        pattern: {
          kind: "interval",
          everyMs: config.publication.recoveryIntervalMs,
        },
        options: {
          jobId: "publication:bank-directory-reconcile",
          maxAttempts: 3,
          payloadSchema: { name: directoryReconcileJob, version: 1 },
          execution: {
            planeKey: "studio",
            scope: "plane",
            principalId: "00000000-0000-0000-0000-000000000000",
          },
        },
      });
  }
  container.services.publication = { authority, projections, orchestrators };
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
        projections,
        container.adapters.openTelemetry?.metrics,
      ),
    );
    container.runtimes.jobs.register(
      PUBLICATION_MAINTENANCE_QUEUE,
      RECOVER_STALLED_PUBLICATIONS_JOB,
      createPublicationRecoveryHandler(
        authority,
        container.runtimes.jobs,
        container.adapters.openTelemetry?.metrics,
      ),
    );
    container.runtimes.jobDefinitions.push({
      code: APPLY_PUBLICATION_RELEASE_JOB,
      owner: "@athyper/server-service-publication",
      queue: PUBLICATION_APPLY_QUEUE,
      name: APPLY_PUBLICATION_RELEASE_JOB,
      scope: "plane",
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
      scope: "plane",
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
    const work = new KyselyPublicationAuthorityWork({
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
      database: authorityDatabase,
      authority,
      store: container.adapters.publicationArtifactStore!,
      signer: container.adapters.publicationSigner,
      canonicalizer: { canonicalBytes, sha256 },
      bucket: container.adapters.objectStorageArtifactsBucket,
      signingKeyId: config.publication.signingKeyId!,
      targetEnvironment: config.env,
      targetPlanes: config.publication.targetPlanes,
    });
    const handlers = createPublicationAuthorityHandlers(
      work,
      container.runtimes.jobs,
      async (execution, plane) => {
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
    const definitions = new BusinessPartnerDefinitionService({
      database: authorityDatabase,
      authority,
      canonicalizer: { canonicalBytes, sha256 },
      previewBaseline: async (tenantId, actorId) => {
        if (!container.adapters.neonDatabase) return null;
        return container.adapters.neonDatabase.database
          .transaction()
          .execute(async (database) => {
            await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${actorId},true)`.execute(
              database,
            );
            return new KyselyLocalProjectionRepository(
              database as unknown as Kysely<Record<string, never>>,
              false,
            ).findActiveBusinessPartnerDefinition(
              "studio.business_partner.definition.business_partner.onboarding",
            );
          });
      },
    });
    const caseContracts = container.adapters.neonDatabase
      ? new BusinessPartnerCaseContractService({
          database: authorityDatabase,
          canonicalizer: { canonicalBytes, sha256 },
          initial: async (tenantId) =>
            authorityDatabase.transaction().execute(async (db) => {
              await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(
                db,
              );
              const rows = (
                await sql<
                  Record<string, unknown>
                >`SELECT id FROM metadata.entity WHERE tenant_id=${tenantId}::uuid AND entity_code='business_partner' AND status='active'`.execute(
                  db,
                )
              ).rows;
              if (rows.length !== 1) return null;
              return {
                tenantId,
                entityId: String(rows[0]!["id"]),
                publicationKey: `metadata.entity.master_business_partner.${tenantId.replaceAll("-", "")}`,
                contract: structuredClone(businessPartnerInitialCaseSchema),
              };
            }),
          current: async (tenantId) =>
            container.adapters
              .neonDatabase!.database.transaction()
              .execute(async (db) => {
                await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(
                  db,
                );
                const row = (
                  await sql<
                    Record<string, unknown>
                  >`SELECT * FROM runtime_meta.entity_contract WHERE tenant_id=${tenantId}::uuid AND entity_code='master.business_partner' AND status='published' ORDER BY release_no DESC LIMIT 1`.execute(
                    db,
                  )
                ).rows[0];
                return row
                  ? {
                      id: String(row["id"]),
                      tenantId,
                      entityId: String(row["entity_id"]),
                      publicationKey: String(row["publication_key"]),
                      contractHash: String(row["entity_contract_hash"]),
                      releaseNo: Number(row["release_no"]),
                      contract: row["contract_json"] as Record<string, unknown>,
                    }
                  : null;
              }),
        })
      : undefined;
    const companyCaseContracts = container.adapters.neonDatabase
      ? new BusinessPartnerCaseContractService({
          database: authorityDatabase,
          canonicalizer: { canonicalBytes, sha256 },
          initial: async (tenantId) =>
            authorityDatabase.transaction().execute(async (db) => {
              await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(
                db,
              );
              const rows = (
                await sql<
                  Record<string, unknown>
                >`SELECT id FROM metadata.entity WHERE tenant_id=${tenantId}::uuid AND entity_code='business_partner_company_setup_request' AND status='active'`.execute(
                  db,
                )
              ).rows;
              if (rows.length !== 1) return null;
              return {
                tenantId,
                entityId: String(rows[0]!["id"]),
                publicationKey: `metadata.entity.master_business_partner_company_setup_request.${tenantId.replaceAll("-", "")}`,
                contract: structuredClone(companySetupCaseInitialSchema),
              };
            }),
          current: async (tenantId) =>
            container.adapters
              .neonDatabase!.database.transaction()
              .execute(async (db) => {
                await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(
                  db,
                );
                const row = (
                  await sql<
                    Record<string, unknown>
                  >`SELECT * FROM runtime_meta.entity_contract WHERE tenant_id=${tenantId}::uuid AND entity_code='master.business_partner_company_setup_request' AND status='published' ORDER BY release_no DESC LIMIT 1`.execute(
                    db,
                  )
                ).rows[0];
                return row
                  ? {
                      id: String(row["id"]),
                      tenantId,
                      entityId: String(row["entity_id"]),
                      publicationKey: String(row["publication_key"]),
                      contractHash: String(row["entity_contract_hash"]),
                      releaseNo: Number(row["release_no"]),
                      contract: row["contract_json"] as Record<string, unknown>,
                    }
                  : null;
              }),
        })
      : undefined;
    container.services.publication = {
      ...container.services.publication,
      definitions,
    };
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
      });
      if (caseContracts)
        registerBusinessPartnerCaseContractRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          authorizer: createBusinessPartnerDefinitionAuthorizer(caseContracts),
          audit,
          jobs: container.runtimes.jobs!,
          service: caseContracts,
        });
      if (companyCaseContracts)
        registerBusinessPartnerCaseContractRoutes(application, {
          authenticate: createIamAuthenticationMiddleware(iam),
          readContext: readVerifiedRequestContext,
          authorizer:
            createBusinessPartnerDefinitionAuthorizer(companyCaseContracts),
          audit,
          jobs: container.runtimes.jobs!,
          service: companyCaseContracts,
          companyPilot: true,
        });
      registerBankDirectoryRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer: createBankDirectoryAuthorizer(bankDirectory),
        audit,
        jobs: container.runtimes.jobs!,
        service: bankDirectory,
      });
      registerBusinessPartnerDefinitionRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer: createBusinessPartnerDefinitionAuthorizer(definitions),
        audit,
        jobs: container.runtimes.jobs!,
        service: definitions,
      });
    });
  }
}

function createPlaneTransactionCoordinator(
  container: Container,
): PlaneTransactionCoordinator<RecordTransaction> {
  return {
    run(planeKey, actor, work) {
      if (planeKey === "neon" && container.adapters.neonDatabase) {
        return container.adapters.neonDatabase.withSystemTransaction(
          async (transaction) => {
            await stampTransactionActor(
              transaction as unknown as Transaction<Record<string, never>>,
              actor,
            );
            return work(transaction as unknown as RecordTransaction);
          },
        );
      }
      if (planeKey === "mesh" && container.adapters.meshDatabase) {
        return container.adapters.meshDatabase.withSystemTransaction(
          async (transaction) => {
            await stampTransactionActor(
              transaction as unknown as Transaction<Record<string, never>>,
              actor,
            );
            return work(transaction as unknown as RecordTransaction);
          },
        );
      }
      if (planeKey === "studio" && container.adapters.athyperDatabase) {
        return container.adapters.athyperDatabase.withSystemTransaction(
          async (transaction) => {
            await stampTransactionActor(
              transaction as unknown as Transaction<Record<string, never>>,
              actor,
            );
            return work(transaction as unknown as RecordTransaction);
          },
        );
      }
      throw new Error(
        `Tenant runtime database is not configured for ${planeKey}`,
      );
    },
  };
}

function internalRecipientContext(
  item: BusinessPartnerDeliveryItem,
  principalId: string,
): VerifiedRequestContext {
  const profileHash = "business-partner-delivery-v1";
  return {
    planeKey: "neon",
    realmKey: "athyper",
    tenantId: item.recipientTenantId,
    principalId,
    authEpoch: 1,
    assurance: "elevated",
    authenticationMethods: ["service"],
    profileHash,
    requestId: item.eventId,
    correlationId: item.eventId,
    permissions: {
      planeKey: "neon",
      tenantId: item.recipientTenantId,
      principalId,
      principalFingerprint: profileHash,
      profileHash,
      schemaHash: profileHash,
      resolvedAt: Date.now(),
      allowed: [],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
    },
  };
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
    | "business-partner"
    | "mesh-business-partner"
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

async function governanceDatabaseHealth(
  database: Kysely<Record<string, never>>,
) {
  await sql`SELECT 1 FROM governance.channel_consent LIMIT 1`.execute(database);
  return { status: "healthy" as const };
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

function businessPartnerNotificationLifecycle(eventCode: string): string {
  const lifecycle = eventCode.split(".").at(-1) ?? "unknown";
  return [
    "submitted",
    "returned",
    "approved",
    "rejected",
    "materialized",
  ].includes(lifecycle)
    ? lifecycle
    : "other";
}
