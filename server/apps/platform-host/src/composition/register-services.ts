import type { CommandExecutionStore, OutboxWriter } from "@athyper/server-contract-events";
import type { ProvisioningCommandTransport } from "@athyper/server-contract-integration";
import type { AuthorizationManagementRepository, AuthorizationManagementRolloutPolicySource, AuthorizationWriterSwitchGate, LegacyAuthorizationWriter } from "@athyper/server-contract-auth";
import type { DocumentArtifactRepository, DocumentTemplateRepository } from "@athyper/server-contract-documents";
import type { NotificationAttachmentAccessPolicy, NotificationAttachmentResolver } from "@athyper/server-contract-documents";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PdfRenderer } from "@athyper/server-contract-rendering";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { MalwareScanner } from "@athyper/server-contract-malware-scanning";
import type { ContentExtractor,DocumentExtractionScheduler } from "@athyper/server-contract-content-extraction";
import type { SearchIndex } from "@athyper/server-contract-search";
import type { PolicyRepository } from "@athyper/server-contract-policy";
import type { RecordMutationResult, RecordRepository } from "@athyper/server-contract-records";
import type { WorkflowRepository } from "@athyper/server-contract-workflow";
import type { AtlasConfirmationVerifier, AtlasCredentialCipher, AtlasCredentialInvalidation, AtlasDomainCommandBus, AtlasDriftAlertPublisher, AtlasKnowledgeIndex, AtlasModelBinding, AtlasModelPolicyResolver, AtlasModelProvider, AtlasPlaneAdmissionResolver, AtlasPolicyInvalidation, AtlasProviderCredentialResolver, AtlasRegisteredTool, AtlasRunRepository, AtlasTenantQuotaManager, AtlasThreadAuthorizer, AtlasThreadRepository, AtlasRetentionPolicyResolver, AtlasUsageLedger } from "@athyper/server-contract-ai";
import { createExactPlaneRepositoryProvider, createExactPlaneTransactionCoordinator, type ExactPlaneRepositoryProvider, type PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { ChannelConsentService, CycleReadinessSource, LegalHoldRetentionAdapter, ReportPackArtifactGenerator, ReportSourceRevisionResolver } from "@athyper/server-contract-governance";
import type { BankValidationRepository, CacheInvalidator, ConnectorHealthJobs, ConnectorRepository, EntitlementRepository, FeatureFlagRepository, LookupRepository, ParameterRepository, RoundingRepository } from "@athyper/server-contract-control-admin";
import { createIamAuthenticationMiddleware, readVerifiedRequestContext } from "@athyper/server-platform-iam";
import { createExperienceInvalidationHooks, createExperienceService, createMemoryExperienceCache, registerExperienceRoutes } from "@athyper/server-platform-experience";
import { KyselyExperiencePlaneRepository } from "@athyper/server-adapter-experience-postgres";
import { createMetadataService, createRuntimeDescriptorRepository } from "@athyper/server-platform-metadata";
import { createCachedPolicyRepository, createKyselyPolicyRepository, createPolicyService, registerPolicyRoutes } from "@athyper/server-platform-policy";
import {createKyselySlaAutomationRepository,createKyselyWorkflowDelegationResolver,createKyselyWorkflowRepository,createKyselyWorkflowSlaTenantCatalog,createWorkflowService,createWorkflowSlaAutomation,createWorkflowSlaDiscoveryHandler,createWorkflowSlaSweepHandler,DISCOVER_WORKFLOW_SLA_JOB,registerWorkflowRoutes,SWEEP_WORKFLOW_SLA_JOB,WORKFLOW_MAINTENANCE_QUEUE} from "@athyper/server-platform-workflow";
import { createRenderingService } from "@athyper/server-platform-rendering";
import {createDocumentSearchService,registerDocumentSearchRoutes} from "@athyper/server-platform-search";
import {createKyselySavedViewRepository,createSavedViewService,registerSavedViewRoutes} from "@athyper/server-platform-preferences";
import {createCollaborationService,createKyselyCollaborationRepository,createKyselyPrincipalDirectory,registerCollaborationRoutes}from"@athyper/server-platform-collaboration";
import {REPORT_PACK_JOB,REPORT_PACK_QUEUE,REPORT_PACK_RECOVERY_JOB,createChannelConsentService,createCycleCertificationService,createCycleDeviationService,createCycleRunService,createCycleTaskService,createLegalHoldService,createModerationService,createReportPackJobHandler,createReportPackRecoveryHandler,createReportPackService,KyselyChannelConsentRepository,KyselyCommentModerationRepository,KyselyCycleExecutionRepository,KyselyLegalHoldRepository,KyselyReportPackRepository,registerGovernanceComplianceRoutes,registerGovernanceRoutes}from"@athyper/server-platform-governance";
import {assertControlServiceRoutePlaneSafety,controlAdminFoundation,createAuthorizationManagementService,createBankValidationService,createConnectorControlService,createCycleConfigService,createEntitlementControlService,createExactPlaneAuthorizationRepositoryProvider,createFeatureFlagService,createLookupService,createParameterService,createRoundingService,createRuntimeCommandService,createSafeAuthorizationManagementRolloutSelector,KyselyCycleTemplateRepository,KyselyRuntimeCommandStore,registerAuthorizationManagementRoutes,registerControlServiceRoutes,registerCycleConfigRoutes,registerRuntimeCommandRoutes,type ControlServiceRouteFlags,type RuntimeCommandExecutor}from"@athyper/server-platform-control-admin";
import {ATLAS_KNOWLEDGE_QUEUE,ATLAS_MONITORING_QUEUE,INGEST_ATLAS_KNOWLEDGE_JOB,RUN_ATLAS_DRIFT_JOB,AtlasAgentRuntime,AtlasBindingRegistry,AtlasProviderRegistry,AtlasRegisteredToolCoordinator,AtlasThreadService,AtlasToolRegistry,AtlasToolService,KyselyAtlasTenantQuotaManager,createAtlasA2Services,createAtlasDriftHandler,createAtlasKnowledgeIngestionHandler,KyselyAtlasToolProposalStore,registerAtlasAdminRoutes,registerAtlasRoutes,type AtlasKnowledgeJobAuthority,type AtlasPromptResolver}from"@athyper/server-platform-ai";
import {createCommandEnvelopeFactory,createGuestAccessExpiryHandler,createOnboardingSaga,EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,KyselyMetaEntityAuthoringRepository,KyselyOnboardingSagaRepository,MetaEntityAuthoringService,OnboardingCaseLifecycleService,OnboardingMaintenanceService,ONBOARDING_MAINTENANCE_QUEUE,PublicationServiceMetaEntityAdapter,registerMetaEntityAuthoringRoutes,registerOnboardingRoutes} from "@athyper/server-plane-studio";
import {financeJobDefinitions,financeSliceOrder,registerFinance as registerNeonFinance,registerFinanceHttpRoutes,registerFinanceJobHandlers,type FinanceRegistrationPorts} from "@athyper/server-plane-neon";
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
import { createWebhookDeliveryHandler, registerJobAdministrationRoutes } from "@athyper/server-platform-jobs";
import { createDocumentService, createKyselyDocumentArtifactRepository, createKyselyDocumentTemplateRepository, createNotificationAttachmentResolver, registerDocumentRoutes } from "@athyper/server-service-documents";
import {ATTACHMENT_MAINTENANCE_QUEUE,EXPIRE_ATTACHMENT_RESERVATIONS_JOB,createAttachmentLifecycle,createAttachmentQuotaRecoveryHandler,createConfiguredAttachmentQuotaPolicyResolver,createKyselyAttachmentQuotaLedger,createKyselyAttachmentRepository,registerAttachmentRoutes} from "@athyper/server-service-attachments";
import {createContentResourceService,createContentServices,createKyselyContentAclRepository,createKyselyContentQuotaLedger,createKyselyContentRepository,createKyselyContentResourceRepository,createKyselyContentSubjectResolver,registerContentRoutes} from "@athyper/server-service-content";
import {createDocumentExtractionScheduler,createDocumentProcessingHandler,createKyselyDocumentProcessingRepository,DOCUMENT_PROCESSING_QUEUE,EXTRACT_AND_INDEX_JOB,type DocumentProcessingRepository} from "@athyper/server-service-document-processing";
import {createDerivativeRenderHandler,createDerivativeScheduler,createKyselyDerivativeRepository,createKyselyDerivativeSourceRepository,DOCUMENT_DERIVATIVES_QUEUE,RENDER_DERIVATIVE_JOB} from "@athyper/server-service-document-derivatives";
import {DELIVER_INTEGRATION_JOB,INTEGRATION_DELIVERY_QUEUE,IntegrationService,KyselyInboundWebhookPolicyResolver,KyselyIntegrationRepository,registerIntegrationJobs,registerIntegrationRoutes}from"@athyper/server-service-integration";
import{createIntegrationHttpTransport}from"@athyper/server-adapter-integration-http";
import {createJobAdministrationService,createJobDefinitionCatalog,createJobGovernanceService,createJobScheduleReconciler,createKyselyJobAdministrationStore,createKyselyJobGovernanceStore,createKyselyJobScheduleRepository} from "@athyper/server-service-jobs";
import { createKyselyNumberingRepository, DefaultNumberingService } from "@athyper/server-service-numbering";
import {BookPeriodService,CloseReadinessService,FinanceNumberingService,FinancePostingGuard,KyselyBookPeriodRepository,KyselyCloseReadinessRepository,KyselyFinanceFoundationReader,KyselyFinanceNumberingPolicyReader,KyselyFinanceNumberingRepository,KyselyRoundingPolicyReader,RoundingResolver,SnapshotFinanceSourceDocumentReader,financeFoundation,snapshotFinancePermissionChecker}from"@athyper/server-service-finance";
import {registerFinanceRoutes}from"./finance-routes.js";
import {
  createKyselyRecordRepository,
  createKyselyCommandExecutionStore,
  createRecordMutationService,
  createRecordQueryService,
  createRecordSnapshotService,
  KyselyRecordSnapshotRepository,
  registerRecordSnapshotRoutes,
  registerRecordsRoutes,
  KyselyRecordTransferStore,
  createMetadataImportRowValidator,
  createObjectStorageRecordTransferArtifactStore,
  createRecordTransferJobDispatcher,
  createRecordTransferService,
  createRecordImportHandler,
  createRecordExportHandler,
  registerRecordTransferRoutes,
  RECORD_TRANSFER_QUEUE,
  EXECUTE_RECORD_IMPORT_JOB,
  EXECUTE_RECORD_EXPORT_JOB,
} from "@athyper/server-service-records";
import { sql, type Kysely, type Transaction } from "kysely";
import { canonicalBytes,MetaEntityArtifactSigner,sha256 } from "@athyper/server-adapter-publication-signing";
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
  KyselyPublicationAuthorityRepository,
  KyselyPublicationAuthorityWork,
  KyselyPublicationOperationsRepository,
  PublicationOrchestrator,
  PublicationOperationsService,
  PUBLICATION_APPLY_QUEUE,
  PUBLICATION_AUTHORITY_QUEUE,
  PUBLICATION_MAINTENANCE_QUEUE,
  RECOVER_STALLED_PUBLICATIONS_JOB,
  ROLLBACK_PUBLICATION_RELEASE_JOB,
  registerPublicationRoutes,
  VerifiedPublicationArtifactLoader,
} from "@athyper/server-service-publication";
import type { PublicationPlane } from "@athyper/server-contract-publication";
import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";
import {createHash,randomUUID}from"node:crypto";

type RecordTransaction = Transaction<Record<string, never>>;

export interface ServiceRegistrationDependencies {
  /** Immutable source/destination adapters required by qualified Neon finance slices. */
  readonly finance?: FinanceRegistrationPorts;
  readonly metadata?: MetadataReader;
  readonly repository?: RecordRepository<RecordTransaction>;
  readonly workflowRepository?: WorkflowRepository<RecordTransaction>;
  readonly policyRepository?: PolicyRepository<RecordTransaction>;
  readonly transactions?: PlaneTransactionCoordinator<RecordTransaction>;
  readonly outbox?: OutboxWriter<RecordTransaction>;
  readonly commandExecutions?: CommandExecutionStore<RecordTransaction, RecordMutationResult>;
  readonly documentTemplateRepository?: DocumentTemplateRepository<RecordTransaction>;
  readonly documentArtifactRepository?: DocumentArtifactRepository<RecordTransaction>;
  readonly documentRenderer?: Pick<PdfRenderer, "renderPdf">;
  readonly malwareScanner?: MalwareScanner;
  readonly contentExtractor?:ContentExtractor;
  readonly searchIndex?:SearchIndex;
  readonly extractionScheduler?:DocumentExtractionScheduler;
  readonly documentProcessingRepository?:DocumentProcessingRepository<RecordTransaction>;
  readonly objectStorage?: ObjectStorage;
  readonly objectStorageBucket?: string;
  readonly governanceCompliance?: {
    readonly retention: LegalHoldRetentionAdapter;
    readonly revisions: ReportSourceRevisionResolver;
    readonly generator: ReportPackArtifactGenerator;
    readonly retentionHealth?: () => Promise<{ readonly healthy: boolean; readonly message?: string }>;
    readonly objectStorageHealth?: () => Promise<{ readonly healthy: boolean; readonly message?: string }>;
    readonly recoveryIntervalMs?: number;
    readonly recoveryStaleAfterMs?: number;
    readonly reportRetentionDays?: number;
  };
  /** Authenticated Studio-to-plane command transport. Onboarding remains unhealthy without it. */
  readonly onboardingTransport?: ProvisioningCommandTransport;
  /** Exact-plane repositories own atomic OCC, audit, and outbox persistence. */
  readonly controlAdmin?: {
    readonly features: ExactPlaneRepositoryProvider<FeatureFlagRepository>;
    readonly parameters: ExactPlaneRepositoryProvider<ParameterRepository>;
    readonly lookups: ExactPlaneRepositoryProvider<LookupRepository>;
    readonly rounding: ExactPlaneRepositoryProvider<RoundingRepository>;
    readonly bankValidation: ExactPlaneRepositoryProvider<BankValidationRepository>;
    readonly entitlements: ExactPlaneRepositoryProvider<EntitlementRepository>;
    readonly connectors: ExactPlaneRepositoryProvider<ConnectorRepository>;
    readonly cache: CacheInvalidator;
    readonly connectorHealthJobs: ConnectorHealthJobs;
    readonly runtimeCommandExecutor?: RuntimeCommandExecutor;
    readonly guarantees: { readonly expectedVersion: true; readonly audit: "transactional"; readonly outbox: "transactional"; readonly invalidation: true };
  };
  /** C4 adapters are injected together; no cross-plane or implicit writer fallback is composed. */
  readonly authorizationManagement?: {
    readonly repositories: Readonly<Partial<Record<PlaneKey, AuthorizationManagementRepository>>>;
    readonly legacyWriter: LegacyAuthorizationWriter;
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
): void {
  const { iam, authorizer, audit } = container.platform;
  if (!iam || !authorizer || !audit) return;

  const recordDatabases = {
    ...(container.adapters.neonDatabase ? { neon: container.adapters.neonDatabase.database } : {}),
    ...(container.adapters.meshDatabase ? { mesh: container.adapters.meshDatabase.database } : {}),
  } as unknown as Partial<Record<PlaneKey, Kysely<Record<string, never>>>>;
  const metadataDatabases = {
    ...recordDatabases,
    ...(container.adapters.athyperDatabase ? { studio: container.adapters.athyperDatabase.database } : {}),
  } as Partial<Record<PlaneKey, Kysely<Record<string, never>>>>;
  if (Object.keys(metadataDatabases).length > 0) {
    const experienceRepositories = createExactPlaneRepositoryProvider(Object.fromEntries(
      Object.entries(metadataDatabases).map(([planeKey, database]) => [planeKey, new KyselyExperiencePlaneRepository(database)]),
    ) as Partial<Record<PlaneKey, KyselyExperiencePlaneRepository>>, { unavailableCode: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" });
    const experienceCache = createMemoryExperienceCache();
    const experience = createExperienceService({ repositories: experienceRepositories, cache: experienceCache });
    container.platform.experience = { service: experience, invalidation: createExperienceInvalidationHooks(experienceCache) };
    container.platform.httpRegistrars.push((application) => registerExperienceRoutes(application, { authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext, service: experience }));
    for (const planeKey of Object.keys(metadataDatabases) as PlaneKey[]) {
      container.runtimes.health.register(`experience.${planeKey}`, async () => {
        const health = await experienceRepositories.health(planeKey);
        return { status: health.status === "healthy" ? "healthy" : "unhealthy", ...(health.message ? { message: health.message } : {}) };
      });
    }
  }
  if(config&&(config.publication.apiEnabled||config.publication.applyEnabled||config.publication.compileEnabled||config.publication.dispatchEnabled||config.publication.recoveryEnabled)){
    registerPublication(container,config,metadataDatabases,iam,authorizer,audit);
  }
  if((config?.wave0.controlAdminRuntimeCommandsEnabled??false)&&Object.keys(metadataDatabases).length===0)throw Object.assign(new Error("Enabled runtime control commands require a durable exact-plane database"),{code:"CONTROL_ADMIN_RUNTIME_STORE_REQUIRED"});
  if (!dependencies.metadata && Object.keys(metadataDatabases).length === 0) return;

  const transactions = dependencies.transactions ?? createPlaneTransactionCoordinator(container);
  const objectStorage = dependencies.objectStorage ?? container.adapters.objectStorage;
  registerAtlas(container,config,dependencies.ai,metadataDatabases,transactions,iam);
  const financeRoutesEnabled=config?.wave0.financeRoutesEnabled??financeFoundation.routesEnabledByDefault;
  let cycleReadinessSource: CycleReadinessSource | undefined;
  if(container.adapters.neonDatabase){
    const financeDatabase=container.adapters.neonDatabase.database as unknown as Kysely<Record<string,never>>;
    const financeTransactions={run:<T>(actor:{tenantId:string;principalId:string},work:(transaction:any)=>Promise<T>)=>transactions.run("neon",actor,work)};
    const rounding=new RoundingResolver(new KyselyRoundingPolicyReader(financeDatabase,{run:financeTransactions.run}));
    const periods=new BookPeriodService({repository:new KyselyBookPeriodRepository(financeDatabase),permissions:snapshotFinancePermissionChecker,transactions:financeTransactions,audit,outbox:createDatabaseOutboxWriter("finance")});
    const snapshotSources=new SnapshotFinanceSourceDocumentReader(),foundation=new KyselyFinanceFoundationReader(financeDatabase,{run:financeTransactions.run},{"document.journal_entry":snapshotSources,"document.purchase_invoice":snapshotSources,"document.sales_invoice":snapshotSources,"document.goods_receipt":snapshotSources,"document.payment":snapshotSources});
    const postingGuard=new FinancePostingGuard(foundation,snapshotFinancePermissionChecker,rounding);
    const numbering=new FinanceNumberingService({policies:new KyselyFinanceNumberingPolicyReader(financeDatabase,financeTransactions),repository:new KyselyFinanceNumberingRepository(financeDatabase),foundation,permissions:snapshotFinancePermissionChecker,transactions:financeTransactions,audit:audit as never,outbox:createDatabaseOutboxWriter("finance")});
    const closeReadiness=new CloseReadinessService({transactions:financeTransactions,repository:new KyselyCloseReadinessRepository(),permissions:snapshotFinancePermissionChecker});
    const financeComposition=registerNeonFinance({database:financeDatabase,transactions:financeTransactions as never,flags:{f2BudgetPlanning:config?.wave0.financeF2Enabled??false,f3LedgerCommitments:config?.wave0.financeF3Enabled??false,f4InventoryFifo:config?.wave0.financeF4Enabled??false,f5Tax:config?.wave0.financeF5Enabled??false,f6Closing:config?.wave0.financeF6Enabled??false},permissions:snapshotFinancePermissionChecker,guard:postingGuard,rounding,audit:audit as never,outbox:createDatabaseOutboxWriter("finance") as never,ddl:{async check(objects){const health=await container.adapters.neonDatabase!.health();if(!health.healthy)return{ready:false,message:"Neon finance adapter is unhealthy"};const missing:string[]=[];for(const objectName of objects){const row=(await sql<{name:string|null}>`SELECT to_regclass(${objectName})::text AS name`.execute(financeDatabase)).rows[0];if(!row?.name)missing.push(objectName);}return missing.length?{ready:false,missing}:{ready:true};}},...(dependencies.finance?{ports:dependencies.finance}:{}),...(container.runtimes.jobs?{jobs:container.runtimes.jobs as never}:{})});
    cycleReadinessSource={async evaluate(context,run){if(context.planeKey!=="neon")return{ready:false,evaluatedAt:new Date().toISOString(),evidence:{planeKey:context.planeKey},reasons:["finance_readiness_source_unavailable"]};const raw=run.data["closeCoordinate"];if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Object.assign(new Error("GOVERNANCE_FINANCE_COORDINATE_REQUIRED"),{code:"GOVERNANCE_FINANCE_COORDINATE_REQUIRED"});const coordinate=raw as Record<string,unknown>,result=await closeReadiness.query({tenantId:context.tenantId,principalId:context.principalId,planeKey:"neon",correlationId:context.correlationId??context.requestId,permissionCodes:context.permissions.allowed},{companyCodeId:String(coordinate["companyCodeId"]??""),ledgerBookId:String(coordinate["ledgerBookId"]??""),fiscalPeriodId:String(coordinate["fiscalPeriodId"]??""),fiscalYear:Number(coordinate["fiscalYear"]),periodNumber:Number(coordinate["periodNumber"])});return{ready:result.ready,evaluatedAt:result.evaluatedAt,evidence:{coordinate:result.coordinate,metrics:result.metrics},...(result.ready?{}:{reasons:["finance_not_ready"]})};}};
    container.services.finance={executionPlane:financeFoundation.executionPlane,routesEnabled:financeRoutesEnabled,periods,rounding,postingGuard,slices:financeComposition.slices};
    if(financeRoutesEnabled)container.platform.httpRegistrars.push(application=>registerFinanceRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,periods,rounding,postingGuard,numbering}));
    if(Object.values(financeComposition.slices).some(slice=>slice.enabled))container.platform.httpRegistrars.push(application=>registerFinanceHttpRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,finance:financeComposition}));
    if(container.runtimes.jobs){registerFinanceJobHandlers(container.runtimes.jobs,financeComposition);container.runtimes.jobDefinitions.push(...financeJobDefinitions(financeComposition));}
    container.runtimes.health.register("finance.neon-foundation",async()=>{try{await sql`SELECT version_number FROM ledger.book_period_status LIMIT 1`.execute(financeDatabase);await sql`SELECT 1 FROM control.rounding_rule LIMIT 1`.execute(financeDatabase);await sql`SELECT 1 FROM snapshot.entity_snapshot_identity LIMIT 1`.execute(financeDatabase);return{status:"healthy"};}catch{return{status:"unhealthy",message:"Finance Neon DDL is unavailable or outdated"};}});
    for(const slice of financeSliceOrder)container.runtimes.health.register(`finance.neon.${slice}`,financeComposition.slices[slice].readiness);
  }else container.services.finance={executionPlane:financeFoundation.executionPlane,routesEnabled:false};
  const exactTransactions=createExactPlaneTransactionCoordinator(transactions);
  const governanceDatabases=createExactPlaneRepositoryProvider(metadataDatabases,{unavailableCode:"GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE",health:{...(metadataDatabases.studio?{studio:governanceDatabaseHealth}:{}),...(metadataDatabases.neon?{neon:governanceDatabaseHealth}:{}),...(metadataDatabases.mesh?{mesh:governanceDatabaseHealth}:{})}});
  const controlDatabases=createExactPlaneRepositoryProvider(metadataDatabases,{unavailableCode:"CONTROL_ADMIN_EXACT_PLANE_REPOSITORY_UNAVAILABLE",health:{...(metadataDatabases.studio?{studio:controlDatabaseHealth}:{}),...(metadataDatabases.neon?{neon:controlDatabaseHealth}:{}),...(metadataDatabases.mesh?{mesh:controlDatabaseHealth}:{})}});
  const consentRepositories=createExactPlaneRepositoryProvider({
    ...(metadataDatabases.studio?{studio:new KyselyChannelConsentRepository()}:{}),
    ...(metadataDatabases.neon?{neon:new KyselyChannelConsentRepository()}:{}),
    ...(metadataDatabases.mesh?{mesh:new KyselyChannelConsentRepository()}:{}),
  },{unavailableCode:"GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE"});
  const moderationRepositories=createExactPlaneRepositoryProvider({
    ...(metadataDatabases.studio?{studio:new KyselyCommentModerationRepository()}:{}),
    ...(metadataDatabases.neon?{neon:new KyselyCommentModerationRepository()}:{}),
    ...(metadataDatabases.mesh?{mesh:new KyselyCommentModerationRepository()}:{}),
  },{unavailableCode:"GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE"});
  const executionRepositories=createExactPlaneRepositoryProvider({
    ...(metadataDatabases.studio?{studio:new KyselyCycleExecutionRepository("studio",transactions)}:{}),
    ...(metadataDatabases.neon?{neon:new KyselyCycleExecutionRepository("neon",transactions)}:{}),
    ...(metadataDatabases.mesh?{mesh:new KyselyCycleExecutionRepository("mesh",transactions)}:{}),
  },{unavailableCode:"GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE"});
  const legalHoldRepositories=createExactPlaneRepositoryProvider({
    ...(metadataDatabases.studio?{studio:new KyselyLegalHoldRepository(metadataDatabases.studio)}:{}),
    ...(metadataDatabases.neon?{neon:new KyselyLegalHoldRepository(metadataDatabases.neon)}:{}),
    ...(metadataDatabases.mesh?{mesh:new KyselyLegalHoldRepository(metadataDatabases.mesh)}:{}),
  },{unavailableCode:"GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE"});
  const reportPackRepositories=createExactPlaneRepositoryProvider({
    ...(metadataDatabases.studio?{studio:new KyselyReportPackRepository(metadataDatabases.studio)}:{}),
    ...(metadataDatabases.neon?{neon:new KyselyReportPackRepository(metadataDatabases.neon)}:{}),
    ...(metadataDatabases.mesh?{mesh:new KyselyReportPackRepository(metadataDatabases.mesh)}:{}),
  },{unavailableCode:"GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE"});
  const hasGovernanceDatabase=Object.keys(metadataDatabases).length>0;
  const consent=hasGovernanceDatabase?createChannelConsentService({transactions:exactTransactions,repositories:consentRepositories,audit,outbox:createDatabaseOutboxWriter("governance")}):undefined;
  const moderation=hasGovernanceDatabase?createModerationService({transactions:exactTransactions,repositories:moderationRepositories,audit,outbox:createDatabaseOutboxWriter("governance")}):undefined;
  const controlRouteFlags:ControlServiceRouteFlags={
    tenantOverrides:config?.wave0.controlAdminTenantOverridesEnabled??controlAdminFoundation.routesEnabledByDefault,
    lookupAndRoundingConfiguration:config?.wave0.controlAdminLookupRoundingEnabled??controlAdminFoundation.routesEnabledByDefault,
    connectorLifecycle:config?.wave0.controlAdminConnectorLifecycleEnabled??controlAdminFoundation.routesEnabledByDefault,
    localCatalogReads:config?.wave0.controlAdminLocalCatalogReadsEnabled??controlAdminFoundation.routesEnabledByDefault,
    catalogAuthoring:config?.wave0.controlAdminCatalogAuthoringEnabled??controlAdminFoundation.routesEnabledByDefault,
  };
  const cycleConfigRoutesEnabled=config?.wave0.controlAdminCycleConfigEnabled??controlAdminFoundation.routesEnabledByDefault;
  const runtimeCommandRoutesEnabled=config?.wave0.controlAdminRuntimeCommandsEnabled??controlAdminFoundation.routesEnabledByDefault;
  assertControlServiceRoutePlaneSafety({catalogAuthoringPlanes:controlRouteFlags.catalogAuthoring?["studio"]:[],financeWriterPlanes:controlRouteFlags.lookupAndRoundingConfiguration?["neon"]:[]});
  const cycleRepositories=createExactPlaneRepositoryProvider({
    ...(metadataDatabases.studio?{studio:new KyselyCycleTemplateRepository(metadataDatabases.studio)}:{}),
    ...(metadataDatabases.neon?{neon:new KyselyCycleTemplateRepository(metadataDatabases.neon)}:{}),
    ...(metadataDatabases.mesh?{mesh:new KyselyCycleTemplateRepository(metadataDatabases.mesh)}:{}),
  },{unavailableCode:"CONTROL_ADMIN_EXACT_PLANE_REPOSITORY_UNAVAILABLE"});
  const cycleConfig=Object.keys(metadataDatabases).length>0?createCycleConfigService({authorizer,repositories:cycleRepositories,...(container.adapters.publicationVerifier?{desiredStateVerifier:{verify:(payload,signature)=>container.adapters.publicationVerifier!.verify({keyId:signature.keyId,algorithm:signature.algorithm,bytes:canonicalBytes(payload),signature:signature.value})}}:{})}):undefined;
  const controlRoutesEnabled=Object.values(controlRouteFlags).some(Boolean);
  if(controlRoutesEnabled&&!dependencies.controlAdmin)throw Object.assign(new Error("Enabled control-administration routes require governed exact-plane repositories"),{code:"CONTROL_ADMIN_REPOSITORIES_REQUIRED"});
  const controlOptions=dependencies.controlAdmin;
  if(controlOptions&&(controlOptions.guarantees.expectedVersion!==true||controlOptions.guarantees.audit!=="transactional"||controlOptions.guarantees.outbox!=="transactional"||controlOptions.guarantees.invalidation!==true))throw Object.assign(new Error("Control-administration repositories do not satisfy mutation guarantees"),{code:"CONTROL_ADMIN_MUTATION_GUARANTEES_REQUIRED"});
  const controlServices=controlOptions?{
    features:createFeatureFlagService({authorizer,repositories:controlOptions.features,cache:controlOptions.cache}),
    parameters:createParameterService({authorizer,repositories:controlOptions.parameters,cache:controlOptions.cache}),
    lookups:createLookupService({authorizer,repositories:controlOptions.lookups,cache:controlOptions.cache}),
    rounding:createRoundingService({authorizer,repositories:controlOptions.rounding,cache:controlOptions.cache}),
    bankValidation:createBankValidationService({authorizer,repositories:controlOptions.bankValidation}),
    entitlements:createEntitlementControlService({authorizer,repositories:controlOptions.entitlements,cache:controlOptions.cache}),
    connectors:createConnectorControlService({authorizer,repositories:controlOptions.connectors,cache:controlOptions.cache,healthJobs:controlOptions.connectorHealthJobs}),
  }:undefined;
  if(runtimeCommandRoutesEnabled&&!controlOptions?.runtimeCommandExecutor)throw Object.assign(new Error("Enabled runtime control commands require an explicitly registered executor"),{code:"CONTROL_ADMIN_RUNTIME_EXECUTOR_REQUIRED"});
  const runtimeCommandStores=createExactPlaneRepositoryProvider(Object.fromEntries(Object.entries(metadataDatabases).map(([planeKey,database])=>[planeKey,new KyselyRuntimeCommandStore(database)])) as Partial<Record<PlaneKey,KyselyRuntimeCommandStore>>,{unavailableCode:"CONTROL_ADMIN_RUNTIME_STORE_UNAVAILABLE"});
  const runtimeCommands=runtimeCommandRoutesEnabled&&controlOptions?.runtimeCommandExecutor?createRuntimeCommandService({authorizer,executor:controlOptions.runtimeCommandExecutor,storeFor:context=>runtimeCommandStores.require(context.planeKey)}):undefined;
  const authorizationOptions=dependencies.authorizationManagement;
  const authorizationMode=config?.wave0.authorizationManagementMode??"legacy";
  const authorizationManagement=authorizationOptions?createAuthorizationManagementService({authorizer,repositories:createExactPlaneAuthorizationRepositoryProvider(authorizationOptions.repositories),legacyWriter:authorizationOptions.legacyWriter,rollout:{async select(input){const selected=await createSafeAuthorizationManagementRolloutSelector(authorizationOptions.rolloutPolicies).select(input);if(authorizationMode==="legacy")return{mode:"legacy",revision:`host-legacy:${selected.revision}`};if(authorizationMode==="shadow"&&selected.mode==="enforce")return{mode:"shadow",revision:`host-shadow:${selected.revision}`};if(selected.mode==="enforce"&&(!config?.wave0.authorizationGoldenEvaluatorCorpusQualified||!config.wave0.authorizationDdlEpochIntegrationQualified||!config.wave0.authorizationWriterSwitchQualified))throw Object.assign(new Error("AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED"),{code:"AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED"});return selected;}},writerGate:authorizationOptions.writerGate,mutationsEnabled:config?.wave0.authorizationManagementMutationsEnabled??false,audit:{async record(input){await audit.record({eventCode:`authorization.management.${input.outcome}`,action:input.mutationKind,outcome:input.outcome==="success"?"success":"denied",actor:{kind:"user",principalId:input.principalId},tenantId:input.tenantId,entityType:"authorization.management_command",entityId:input.commandId,requestId:input.requestId,...(input.correlationId?{correlationId:input.correlationId}:{}),metadata:{planeKey:input.planeKey,mode:input.mode,writer:input.writer,...(input.reason?{reason:input.reason}:{}),...(input.writerSwitchEvidence?{writerSwitchEvidence:input.writerSwitchEvidence}:{})}});}}}):undefined;
  const authorizationRoutesEnabled=config?.wave0.authorizationManagementRoutesEnabled??false;
  container.platform.controlAdmin={...(cycleConfig?{cycleConfig}:{}),...(controlServices?{services:controlServices}:{}),...(runtimeCommands?{runtimeCommands}:{}),...(authorizationManagement?{authorizationManagement}:{}),routeFlags:controlRouteFlags,routesEnabled:controlRoutesEnabled||cycleConfigRoutesEnabled||runtimeCommandRoutesEnabled||authorizationRoutesEnabled};
  if(controlServices&&controlRoutesEnabled)container.platform.httpRegistrars.push(application=>registerControlServiceRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,services:controlServices,flags:controlRouteFlags}));
  if(cycleConfig&&cycleConfigRoutesEnabled)container.platform.httpRegistrars.push(application=>registerCycleConfigRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,service:cycleConfig}));
  if(runtimeCommands&&runtimeCommandRoutesEnabled)container.platform.httpRegistrars.push(application=>registerRuntimeCommandRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,service:runtimeCommands}));
  if(authorizationManagement&&authorizationRoutesEnabled)container.platform.httpRegistrars.push(application=>registerAuthorizationManagementRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,service:authorizationManagement}));
  for(const planeKey of ["studio","neon","mesh"] as const)container.runtimes.health.register(`control.${planeKey}.cycle-config`,async()=>{const result=await controlDatabases.health(planeKey);return result.status==="healthy"?{status:"healthy"}:{status:"unhealthy",message:result.message??`Control repository is ${result.status}`};});
  if(controlOptions)for(const planeKey of ["studio","neon","mesh"] as const)container.runtimes.health.register(`control.${planeKey}.administration`,async()=>{const results=await Promise.all([controlOptions.features.health(planeKey),controlOptions.parameters.health(planeKey),controlOptions.lookups.health(planeKey),controlOptions.rounding.health(planeKey),controlOptions.bankValidation.health(planeKey),controlOptions.entitlements.health(planeKey),controlOptions.connectors.health(planeKey)]);const failed=results.find(result=>result.status!=="healthy");return failed?{status:"unhealthy",message:failed.message??`Control administration repository is ${failed.status}`}:{status:"healthy"};});
  if(runtimeCommandRoutesEnabled)for(const planeKey of ["studio","neon","mesh"] as const)container.runtimes.health.register(`control.${planeKey}.runtime-commands`,async()=>{try{await runtimeCommandStores.require(planeKey).health();return{status:"healthy"}as const;}catch(error){return{status:"unhealthy",message:error instanceof Error?error.message:`Runtime command ledger is unavailable: ${planeKey}`}as const;}});
  for(const planeKey of ["studio","neon","mesh"] as const)container.runtimes.health.register(`governance.${planeKey}`,async()=>{const result=await governanceDatabases.health(planeKey);return result.status==="healthy"?{status:"healthy"}:{status:"unhealthy",message:result.message??`Governance repository is unavailable: ${planeKey}`};});
  for(const planeKey of ["studio","neon","mesh"] as const){
    const database=metadataDatabases[planeKey];
    container.runtimes.health.register(`governance.${planeKey}.compliance-ddl`,async()=>{if(!database)return{status:"unhealthy",message:`Governance compliance database is unavailable: ${planeKey}`} as const;try{await governanceComplianceDatabaseHealth(database);return{status:"healthy"}as const;}catch{return{status:"unhealthy",message:`Governance compliance DDL is unavailable or outdated: ${planeKey}`}as const;}});
    container.runtimes.health.register(`governance.${planeKey}.object-storage`,async()=>dependencyHealth(objectStorage!==undefined&&objectStorage.putIfAbsent!==undefined,dependencies.governanceCompliance?.objectStorageHealth,"Immutable object storage is unavailable"));
    container.runtimes.health.register(`governance.${planeKey}.retention`,async()=>{
      if(!(config?.wave0.governanceRoutesEnabled??false))return{status:"healthy",message:"Governance compliance routes are disabled"}as const;
      return dependencyHealth(dependencies.governanceCompliance?.retention!==undefined,dependencies.governanceCompliance?.retentionHealth,"Legal-hold retention adapter is unavailable");
    });
  }
  if(hasGovernanceDatabase&&consent&&moderation&&cycleConfig){
    const cycleOptions={authorizer,repositories:executionRepositories,...(cycleReadinessSource?{readinessSource:cycleReadinessSource}:{})};
    const cycleRuns=createCycleRunService(cycleOptions),cycleTasks=createCycleTaskService(cycleOptions),cycleDeviations=createCycleDeviationService(cycleOptions),cycleCertifications=createCycleCertificationService(cycleOptions);
    const compliance=dependencies.governanceCompliance&&objectStorage&&objectStorage.putIfAbsent&&container.runtimes.jobs?{legalHolds:createLegalHoldService({authorizer,repositories:legalHoldRepositories,retention:dependencies.governanceCompliance.retention}),reportPacks:createReportPackService({authorizer,repositories:reportPackRepositories,revisions:dependencies.governanceCompliance.revisions,jobs:container.runtimes.jobs,storage:objectStorage})}:undefined;
    if(compliance&&container.runtimes.jobs){
      container.runtimes.jobs.register(REPORT_PACK_QUEUE,REPORT_PACK_JOB,createReportPackJobHandler({repositories:reportPackRepositories,storage:objectStorage!,generator:dependencies.governanceCompliance!.generator,...(dependencies.governanceCompliance!.reportRetentionDays?{retentionDays:dependencies.governanceCompliance!.reportRetentionDays}:{})}));
      container.runtimes.jobs.register(REPORT_PACK_QUEUE,REPORT_PACK_RECOVERY_JOB,createReportPackRecoveryHandler({repositories:reportPackRepositories,jobs:container.runtimes.jobs}));
      container.runtimes.jobDefinitions.push({code:REPORT_PACK_JOB,owner:"@athyper/server-platform-governance",queue:REPORT_PACK_QUEUE,name:REPORT_PACK_JOB,scope:"tenant",payloadSchema:{name:REPORT_PACK_JOB,version:1},timeoutMs:120_000,maxAttempts:5,executionRetentionDays:90},{code:REPORT_PACK_RECOVERY_JOB,owner:"@athyper/server-platform-governance",queue:REPORT_PACK_QUEUE,name:REPORT_PACK_RECOVERY_JOB,scope:"plane",payloadSchema:{name:REPORT_PACK_RECOVERY_JOB,version:1},timeoutMs:60_000,maxAttempts:3,executionRetentionDays:90});
      for(const planeKey of Object.keys(metadataDatabases) as PlaneKey[])container.runtimes.scheduledJobs.push({scheduleId:`governance-report-pack-recovery-${planeKey}`,queue:REPORT_PACK_QUEUE,name:REPORT_PACK_RECOVERY_JOB,data:{staleAfterMs:dependencies.governanceCompliance!.recoveryStaleAfterMs??300_000,limit:100},pattern:{kind:"interval",everyMs:dependencies.governanceCompliance!.recoveryIntervalMs??300_000},options:{jobId:`governance:report-pack:recover:${planeKey}`,maxAttempts:3,payloadSchema:{name:REPORT_PACK_RECOVERY_JOB,version:1},execution:{planeKey,scope:"plane",principalId:"governance-report-pack-recovery"}}});
    }
    const routesEnabled=config?.wave0.governanceRoutesEnabled??false;container.platform.governance={consent,moderation,cycleConfig,cycleRuns,cycleTasks,cycleDeviations,cycleCertifications,...(compliance?compliance:{}),routesEnabled};
    if(routesEnabled)container.platform.httpRegistrars.push(application=>registerGovernanceRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,authorizer,consent,cycleRuns,cycleTasks,cycleDeviations,cycleCertifications}));
    if(routesEnabled&&compliance)container.platform.httpRegistrars.push(application=>registerGovernanceComplianceRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,...compliance}));
  }
  const notificationAttachmentResolver = dependencies.notificationAttachmentResolver
    ?? (dependencies.notificationAttachmentAccessPolicy && objectStorage
      ? createNotificationAttachmentResolver({
          transactions,
          artifacts: dependencies.documentArtifactRepository ?? createKyselyDocumentArtifactRepository(),
          storage: objectStorage,
          access: dependencies.notificationAttachmentAccessPolicy,
        })
      : undefined);
  const metadata = dependencies.metadata ?? createMetadataService({
    repository: createRuntimeDescriptorRepository({
      databases: metadataDatabases,
      withTenantTransaction: (planeKey, actor, work) =>
        transactions.run(planeKey, actor, work),
    }),
  });
  container.platform.metadata = metadata;
  registerStudioAuthoring(container,config,metadataDatabases.studio,iam,authorizer);
  registerStudioOnboarding(container,metadataDatabases.studio,dependencies.onboardingTransport,iam,authorizer);
  if (Object.keys(metadataDatabases).length > 0) {
    container.services.numbering = new DefaultNumberingService(
      transactions,
      createKyselyNumberingRepository(),
    );
  }
  const notificationRepositories=createKyselyNotificationRepositories(transactions);
  if(Object.keys(metadataDatabases).length>0){const collaboration=createCollaborationService({authorizer,principals:createKyselyPrincipalDirectory(),repository:createKyselyCollaborationRepository(),transactions:exactTransactions,outbox:createDatabaseOutboxWriter("collaboration"),audit,...(moderation?{moderation}:{})});container.services.collaboration=collaboration;container.platform.httpRegistrars.push(application=>registerCollaborationRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,collaboration}));}
  const integrationDatabase=metadataDatabases.studio;
  if(integrationDatabase&&container.adapters.secretStore&&container.runtimes.jobs){const repository=new KyselyIntegrationRepository(integrationDatabase,{audit,outbox:createDatabaseOutboxWriter("integration")}),service=new IntegrationService(repository),dependencyCalls=container.adapters.openTelemetry?.metrics.counter("athyper_integration_dependency_calls_total","Integration dependency calls by outcome"),dependencyLatency=container.adapters.openTelemetry?.metrics.histogram("athyper_integration_dependency_duration_ms","Integration dependency call duration"),transport=createIntegrationHttpTransport({telemetry:event=>{const labels={outcome:event.outcome,classification:event.classification??"none",circuit_state:event.circuitState};dependencyCalls?.increment(labels);dependencyLatency?.record(event.durationMs,labels);}}),policies=new KyselyInboundWebhookPolicyResolver(integrationDatabase);container.runtimes.health.register("integration.http",()=>transport.health());registerIntegrationJobs(container.runtimes.jobs,{repository,transport,secrets:container.adapters.secretStore});container.runtimes.jobDefinitions.push({code:DELIVER_INTEGRATION_JOB,owner:"@athyper/server-service-integration",queue:INTEGRATION_DELIVERY_QUEUE,name:DELIVER_INTEGRATION_JOB,scope:"tenant",payloadSchema:{name:DELIVER_INTEGRATION_JOB,version:1},timeoutMs:120_000,maxAttempts:10,executionRetentionDays:90});container.platform.httpRegistrars.push(application=>registerIntegrationRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,authorizer,repository,service,jobs:container.runtimes.jobs!,transport,secrets:container.adapters.secretStore!,policies}));}
  const savedViews=createSavedViewService(createKyselySavedViewRepository(transactions));
  container.platform.httpRegistrars.push(application=>registerSavedViewRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,savedViews}));
  const notificationEvents=container.adapters.notificationEvents??createNotificationEventBus();
  const notificationPreferences=createNotificationPreferenceService({store:createKyselyNotificationPreferenceStore(transactions),capabilities:createKyselyPreferenceCapabilities(transactions),events:createPreferenceInvalidationPublisher(transactions)});
  const notificationOperations=createNotificationOperations({repository:createKyselyNotificationOperationsRepository(transactions),authorizer});
  const notificationHandlers=new Map(container.adapters.notificationChannels);
  notificationHandlers.set("in_app",createInAppNotificationHandler({repository:notificationRepositories,publisher:notificationEvents}));
  if(container.adapters.pushTransports.length>0)notificationHandlers.set("push",createPushNotificationHandler({subscriptions:notificationRepositories,transports:container.adapters.pushTransports}));
  const notifications=createNotificationOrchestrator({recipients:createNotificationRecipientResolver({directory:notificationRepositories,whatsAppConsent:notificationRepositories}),ledger:notificationRepositories,handlers:notificationHandlers});
  container.services.notifications=notifications;
  const notificationPlanner=createNotificationPlanner({transactions:exactTransactions,consent:consent??denyAllConsent});
  const durableDelivery=createDurableNotificationDeliveryRepository({transactions});
  const outboxPlanning=createKyselyNotificationOutboxRepository({transactions});
  const webhookDelivery=createKyselyWebhookDeliveryRepository({transactions});
  const notificationWork=createKyselyNotificationWorkCatalog(metadataDatabases);
  const workflowSlaTenants=createKyselyWorkflowSlaTenantCatalog(metadataDatabases);
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
  container.runtimes.jobDefinitions.push({code:DISCOVER_WORKFLOW_SLA_JOB,owner:"@athyper/server-platform-workflow",queue:WORKFLOW_MAINTENANCE_QUEUE,name:DISCOVER_WORKFLOW_SLA_JOB,scope:"plane",payloadSchema:{name:DISCOVER_WORKFLOW_SLA_JOB,version:1},timeoutMs:60_000,maxAttempts:3,executionRetentionDays:30});
  container.runtimes.jobDefinitions.push({code:SWEEP_WORKFLOW_SLA_JOB,owner:"@athyper/server-platform-workflow",queue:WORKFLOW_MAINTENANCE_QUEUE,name:SWEEP_WORKFLOW_SLA_JOB,scope:"tenant",payloadSchema:{name:SWEEP_WORKFLOW_SLA_JOB,version:1},timeoutMs:120_000,maxAttempts:5,executionRetentionDays:90});
  if(container.runtimes.jobs){
    const jobs=container.runtimes.jobs;
    if (container.runtimes.jobTransactions) {
      container.services.jobs = createJobAdministrationService({
        store: createKyselyJobAdministrationStore(container.runtimes.jobTransactions),
        transport: jobs,
        publisher: jobs,
      });
      const jobAdministration = container.services.jobs;
      const jobGovernance = createJobGovernanceService({
        store: createKyselyJobGovernanceStore(container.runtimes.jobTransactions),
        catalog: createJobDefinitionCatalog(container.runtimes.jobDefinitions),
      });
      container.platform.httpRegistrars.push((application) => registerJobAdministrationRoutes(application, {
        authenticate: createIamAuthenticationMiddleware(iam),
        readContext: readVerifiedRequestContext,
        authorizer,
        jobs: jobAdministration,
        governance: jobGovernance,
      }));
    }
    jobs.register(NOTIFICATION_QUEUE,DISPATCH_NOTIFICATION_JOB,createNotificationDispatchHandler(notifications));
    jobs.register(NOTIFICATION_MAINTENANCE_QUEUE,PLAN_NOTIFICATION_OUTBOX_JOB,createNotificationOutboxSweepHandler({repository:outboxPlanning,planner:notificationPlanner}));
    jobs.register(NOTIFICATION_MAINTENANCE_QUEUE,DELIVERY_SWEEP_JOB,createDeliverySweepHandler({repository:durableDelivery,handlers:notificationHandlers,events:notificationEvents,...(notificationAttachmentResolver?{attachments:notificationAttachmentResolver}:{})}));
    jobs.register(NOTIFICATION_MAINTENANCE_QUEUE,FLUSH_NOTIFICATION_DIGEST_JOB,createNotificationDigestHandler({transactions}));
    jobs.register(NOTIFICATION_MAINTENANCE_QUEUE,DISCOVER_NOTIFICATION_WORK_JOB,createNotificationDiscoveryHandler({catalog:notificationWork,jobs}));
    jobs.register(NOTIFICATION_MAINTENANCE_QUEUE,WEBHOOK_SWEEP_JOB,createWebhookSweepHandler({catalog:notificationWork,jobs}));
    jobs.register(WEBHOOK_DELIVERY_QUEUE,WEBHOOK_DELIVERY_JOB,createWebhookDeliveryHandler({repository:webhookDelivery}));
  }
  if (container.runtimes.scheduler) {
    const reconciler = createJobScheduleReconciler({
      planes: Object.keys(metadataDatabases) as PlaneKey[],
      repository: createKyselyJobScheduleRepository(metadataDatabases),
      scheduler: container.runtimes.scheduler,
      catalog: createJobDefinitionCatalog(container.runtimes.jobDefinitions),
      ignoreUnknownHandlers: true,
      onRejected: (code, reason) => console.warn(`[scheduler] schedule_rejected code=${code} reason=${reason}`),
    });
    container.runtimes.scheduleReconcile = () => reconciler.reconcile();
  }
  container.platform.httpRegistrars.push(application=>registerNotificationRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,inbox:notificationRepositories,push:notificationRepositories,events:notificationEvents,preferences:notificationPreferences,operations:notificationOperations}));
  const policyRepository = dependencies.policyRepository
    ?? (Object.keys(metadataDatabases).length > 0 ? createCachedPolicyRepository({ repository: createKyselyPolicyRepository() }) : undefined);
  const policy = policyRepository ? createPolicyService({ repository: policyRepository, transactions, audit }) : undefined;
  if (policy) {
    container.platform.policy = policy;
    container.platform.httpRegistrars.push((application) => registerPolicyRoutes(application, { authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext, authorizer, policy }));
  }
  if (dependencies.repository || Object.keys(recordDatabases).length > 0) {
    const repository = dependencies.repository ?? createKyselyRecordRepository({ databases: recordDatabases });
    const outbox = dependencies.outbox ?? createDatabaseOutboxWriter("records");
    const commandExecutions = dependencies.commandExecutions ?? createKyselyCommandExecutionStore();
    const common = { metadata, authorizer, audit, outbox, commandExecutions, repository, transactions };
    const queries = createRecordQueryService(common);
    const mutations = createRecordMutationService(common);
    const snapshots=config?.wave0.recordSnapshotRoutesEnabled?createRecordSnapshotService({metadata,queries,mutations,repository:new KyselyRecordSnapshotRepository(transactions)}):undefined;
    const transferStore=container.runtimes.jobs&&objectStorage?new KyselyRecordTransferStore():undefined;
    const transferArtifacts=transferStore&&objectStorage?createObjectStorageRecordTransferArtifactStore(objectStorage):undefined;
    const transfers=transferStore&&transferArtifacts&&container.runtimes.jobs?createRecordTransferService({staging:transferStore,validator:createMetadataImportRowValidator(metadata,authorizer),jobs:createRecordTransferJobDispatcher(container.runtimes.jobs),metadata,authorizer,audit,outbox,transactions,errorReports:transferArtifacts}):undefined;
    container.services.records = { queries, mutations, ...(snapshots?{snapshots}:{}),...(transfers?{transfers}:{}) };
    container.platform.httpRegistrars.push((application) => registerRecordsRoutes(application, { authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext, queries, mutations }));
    if(snapshots)container.platform.httpRegistrars.push((application)=>registerRecordSnapshotRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,authorizer,snapshots}));
    if(transfers&&transferStore&&transferArtifacts&&container.runtimes.jobs){container.platform.httpRegistrars.push(application=>registerRecordTransferRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,transfers}));container.runtimes.jobs.register(RECORD_TRANSFER_QUEUE,EXECUTE_RECORD_IMPORT_JOB,createRecordImportHandler({store:transferStore,metadata,repository,transactions,audit,outbox}));container.runtimes.jobs.register(RECORD_TRANSFER_QUEUE,EXECUTE_RECORD_EXPORT_JOB,createRecordExportHandler({store:transferStore,queries,transactions,artifacts:transferArtifacts,audit,outbox}));container.runtimes.jobDefinitions.push({code:EXECUTE_RECORD_IMPORT_JOB,owner:"@athyper/server-service-records",queue:RECORD_TRANSFER_QUEUE,name:EXECUTE_RECORD_IMPORT_JOB,scope:"tenant",payloadSchema:{name:EXECUTE_RECORD_IMPORT_JOB,version:1},timeoutMs:300_000,maxAttempts:5,executionRetentionDays:90},{code:EXECUTE_RECORD_EXPORT_JOB,owner:"@athyper/server-service-records",queue:RECORD_TRANSFER_QUEUE,name:EXECUTE_RECORD_EXPORT_JOB,scope:"tenant",payloadSchema:{name:EXECUTE_RECORD_EXPORT_JOB,version:1},timeoutMs:300_000,maxAttempts:5,executionRetentionDays:30});}
  }

  if (dependencies.workflowRepository || Object.keys(metadataDatabases).length > 0) {
    const repository = dependencies.workflowRepository ?? createKyselyWorkflowRepository();
    const workflow = createWorkflowService({ metadata, authorizer, audit, outbox: dependencies.outbox ?? createDatabaseOutboxWriter("workflow"), repository, transactions, ...(policy ? { policy } : {}) });
    const workflowSla=createWorkflowSlaAutomation({repository:createKyselySlaAutomationRepository(),transactions,delegations:createKyselyWorkflowDelegationResolver()});
    if(container.runtimes.jobs){container.runtimes.jobs.register(WORKFLOW_MAINTENANCE_QUEUE,DISCOVER_WORKFLOW_SLA_JOB,createWorkflowSlaDiscoveryHandler({catalog:workflowSlaTenants,jobs:container.runtimes.jobs}));container.runtimes.jobs.register(WORKFLOW_MAINTENANCE_QUEUE,SWEEP_WORKFLOW_SLA_JOB,createWorkflowSlaSweepHandler(workflowSla));}
    container.services.workflow = workflow;
    container.platform.httpRegistrars.push((application) => registerWorkflowRoutes(application, { authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext, workflow }));
  }
  const documentRenderer = dependencies.documentRenderer ?? (container.adapters.pdfRenderer ? createRenderingService(container.adapters.pdfRenderer) : undefined);
  const objectStorageBucket = dependencies.objectStorageBucket ?? container.adapters.objectStorageBucket;
  const malwareScanner = dependencies.malwareScanner ?? container.adapters.malwareScanner;
  const contentExtractor=dependencies.contentExtractor??container.adapters.contentExtractor;
  const searchIndex=dependencies.searchIndex??container.adapters.searchIndex;
  let extractionScheduler=dependencies.extractionScheduler;
  if(container.runtimes.jobs&&contentExtractor&&searchIndex&&objectStorage){const processing=createDocumentProcessingHandler({repository:dependencies.documentProcessingRepository??createKyselyDocumentProcessingRepository(),transactions,storage:objectStorage,extractor:contentExtractor,searchIndex});container.runtimes.jobs.register(DOCUMENT_PROCESSING_QUEUE,EXTRACT_AND_INDEX_JOB,processing);extractionScheduler??=createDocumentExtractionScheduler(container.runtimes.jobs);}
  if(searchIndex){const search=createDocumentSearchService({authorizer,index:searchIndex});container.platform.search=search;container.platform.httpRegistrars.push((application)=>registerDocumentSearchRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,search}));}
  if(Object.keys(metadataDatabases).length>0){const content=createContentServices({transactions,repository:createKyselyContentRepository(),aclRepository:createKyselyContentAclRepository(),quotaLedger:createKyselyContentQuotaLedger(),subjects:createKyselyContentSubjectResolver(transactions),authorizer,...(searchIndex?{searchIndex}:{})});const resources=createContentResourceService({transactions,repository:createKyselyContentResourceRepository(),content});container.services.content=content;container.platform.httpRegistrars.push(application=>registerContentRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,content,resources}));}
  if(objectStorage&&objectStorageBucket&&malwareScanner&&Object.keys(metadataDatabases).length>0){
    const quotaPolicies=createConfiguredAttachmentQuotaPolicyResolver({limitBytes:config?.objectStorage.tenantQuotaGb?config.objectStorage.tenantQuotaGb*1024*1024*1024:10*1024*1024*1024,limitItems:config?.objectStorage.tenantQuotaItems??50_000,reservationTtlSeconds:config?.objectStorage.quotaReservationTtlSeconds,retryAfterSeconds:config?.objectStorage.quotaRetryAfterSeconds});
    const attachmentRepository=createKyselyAttachmentRepository(objectStorageBucket),quota=createKyselyAttachmentQuotaLedger();
    const derivativeScheduler=container.runtimes.jobs&&container.adapters.previewRenderer?createDerivativeScheduler(container.runtimes.jobs):undefined;
    if(container.runtimes.jobs&&container.adapters.previewRenderer){
      container.runtimes.jobs.register(DOCUMENT_DERIVATIVES_QUEUE,RENDER_DERIVATIVE_JOB,createDerivativeRenderHandler({repository:createKyselyDerivativeRepository(),sourceRepository:createKyselyDerivativeSourceRepository(),transactions,storage:objectStorage,renderer:container.adapters.previewRenderer}));
      container.runtimes.jobDefinitions.push({code:RENDER_DERIVATIVE_JOB,owner:"@athyper/server-service-document-derivatives",queue:DOCUMENT_DERIVATIVES_QUEUE,name:RENDER_DERIVATIVE_JOB,scope:"tenant",payloadSchema:{name:RENDER_DERIVATIVE_JOB,version:1},timeoutMs:120_000,maxAttempts:5,executionRetentionDays:30});
    }
    const attachments=createAttachmentLifecycle({transactions,repository:attachmentRepository,storage:objectStorage,scanner:malwareScanner,quota,quotaPolicies,outbox:createDatabaseOutboxWriter("attachments"),scheduler:{scheduleExtraction:async identity=>{await extractionScheduler?.schedule({...identity});},scheduleDerivatives:async (request,options)=>{await derivativeScheduler?.schedule({...request,...(options?.rebuild?{rebuild:options.rebuild}:{})});},schedulePurge:async()=>undefined}});
    container.services.attachments=attachments;
    container.platform.httpRegistrars.push(application=>registerAttachmentRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,authorizer,attachments,...(container.services.content?{contentAcl:container.services.content.acl}:{}),maxUploadBytes:Math.max(1,Math.floor((config?.objectStorage.maxUploadMb??25)*1024*1024))}));
    if(container.runtimes.jobs){container.runtimes.jobs.register(ATTACHMENT_MAINTENANCE_QUEUE,EXPIRE_ATTACHMENT_RESERVATIONS_JOB,createAttachmentQuotaRecoveryHandler({transactions,quota,attachments:attachmentRepository}));container.runtimes.jobDefinitions.push({code:EXPIRE_ATTACHMENT_RESERVATIONS_JOB,owner:"@athyper/server-service-attachments",queue:ATTACHMENT_MAINTENANCE_QUEUE,name:EXPIRE_ATTACHMENT_RESERVATIONS_JOB,scope:"tenant",payloadSchema:{name:EXPIRE_ATTACHMENT_RESERVATIONS_JOB,version:1},timeoutMs:60_000,maxAttempts:5,executionRetentionDays:30});}
  }
  if ((dependencies.documentTemplateRepository || Object.keys(metadataDatabases).length > 0) && documentRenderer && malwareScanner && objectStorage && objectStorageBucket) {
    const documents = createDocumentService({ metadata, authorizer, audit, outbox: dependencies.outbox ?? createDatabaseOutboxWriter("documents"), templates: dependencies.documentTemplateRepository ?? createKyselyDocumentTemplateRepository(), artifacts: dependencies.documentArtifactRepository ?? createKyselyDocumentArtifactRepository(), transactions, renderer: documentRenderer, malwareScanner, storage: objectStorage, storageBucket: objectStorageBucket,...(extractionScheduler?{extractionScheduler}:{}) });
    container.services.documents = documents;
    container.platform.httpRegistrars.push((application) => registerDocumentRoutes(application, { authenticate:createIamAuthenticationMiddleware(iam), readContext:readVerifiedRequestContext, documents }));
  }
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
  container.runtimes.health.register("atlas.tool-invocation-ledger", async () => {
    const result = await ledger.health();
    return { status: result.healthy ? "healthy" : "unhealthy", ...(result.message ? { message: result.message } : {}) };
  });
  const routesEnabled = Boolean(config?.atlas.enabled && config.atlas.persistenceEnabled);
  const toolsEnabled = Boolean(routesEnabled && config?.atlas.toolsEnabled);
  if (!routesEnabled) { container.platform.ai = { ledger, routesEnabled: false, toolsEnabled: false }; return; }
  if (!dependencies) throw new Error("Atlas is enabled but its repositories, policy resolvers, provider adapters, and command boundary are not composed.");
  const operations = createAtlasA2Services({ transactions, platformCredentials: dependencies.credentials, credentialCipher: dependencies.credentialCipher, credentialInvalidation: dependencies.credentialInvalidation, knowledgeIndex: dependencies.knowledgeIndex, policyInvalidation: dependencies.policyInvalidation, driftAlerts: dependencies.driftAlerts });

  const threads = new AtlasThreadService({ repository: dependencies.threadRepository, authorizer: dependencies.threadAuthorizer, retention: dependencies.retention, maxHistoryMessages: 20, maxHistoryBytes: 98_304, maxExportMessages: 1_000 });
  const bindings = new AtlasBindingRegistry(dependencies.bindings); const providers = new AtlasProviderRegistry(dependencies.providers);
  for (const binding of dependencies.bindings) providers.resolve(binding);
  const registry = new AtlasToolRegistry(dependencies.registeredTools);
  const tools = new AtlasToolService({ registry, authority: dependencies.toolAuthority, proposals: ledger, records: dependencies.recordGateway, confirmations: dependencies.confirmations, commands: dependencies.commands });
  const coordinator = toolsEnabled ? new AtlasRegisteredToolCoordinator(registry, tools) : undefined;
  const quotas=dependencies.quotas??new KyselyAtlasTenantQuotaManager({transactions,defaultPolicy:{maxRequests:1_000,maxInputTokens:10_000_000,maxOutputTokens:2_000_000,windowSeconds:3_600},reservationTtlSeconds:1_800});
  const runtime = new AtlasAgentRuntime({ admission: dependencies.admission, modelPolicy: dependencies.modelPolicy, bindings, providers, credentials: operations.resolver, threads, runs: dependencies.runs, ledger: dependencies.usageLedger, prompts: dependencies.prompts, quota:quotas, ...(coordinator ? { tools: coordinator } : {}), maxInputCharacters: 50_000, maxToolRounds: toolsEnabled ? 3 : 0 });
  container.platform.ai = { ledger, threads, runtime, tools, operations, routesEnabled: true, toolsEnabled };
  container.runtimes.health.register("atlas.runtime-composition", async () => ({ status: dependencies.bindings.length > 0 && dependencies.providers.length > 0 ? "healthy" : "unhealthy", ...(dependencies.bindings.length && dependencies.providers.length ? {} : { message: "Atlas requires at least one exact model binding and provider adapter." }) }));
  container.platform.httpRegistrars.push((application) => registerAtlasRoutes(application as never, { authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext, admission: dependencies.admission, threads, runtime, ...(toolsEnabled ? { tools } : {}) }));
  container.platform.httpRegistrars.push((application) => registerAtlasAdminRoutes(application as never, { authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext, authorize: async context => context.permissions.allowed.includes("atlas.admin.manage")||context.permissions.allowed.includes("ai.admin"), credentials: operations.credentials, knowledge: operations.knowledge, policies: operations.policies,quotas,dashboards:operations.dashboards }));
  container.runtimes.health.register("atlas.a2-operations", async () => { const [credentials,index] = await Promise.all([operations.credentialRepository.health(),operations.knowledgeIndex.health()]); return { status: credentials.healthy && index.healthy ? "healthy" : "unhealthy", ...(!credentials.healthy || !index.healthy ? { message: credentials.message ?? index.message ?? "Atlas A2 dependency is unavailable." } : {}) }; });
  if(container.runtimes.jobs){container.runtimes.jobs.register(ATLAS_KNOWLEDGE_QUEUE,INGEST_ATLAS_KNOWLEDGE_JOB,createAtlasKnowledgeIngestionHandler(operations.knowledge,dependencies.knowledgeJobAuthority));container.runtimes.jobs.register(ATLAS_MONITORING_QUEUE,RUN_ATLAS_DRIFT_JOB,createAtlasDriftHandler(operations.drift));container.runtimes.jobDefinitions.push({code:INGEST_ATLAS_KNOWLEDGE_JOB,owner:"@athyper/server-platform-ai",queue:ATLAS_KNOWLEDGE_QUEUE,name:INGEST_ATLAS_KNOWLEDGE_JOB,scope:"tenant",payloadSchema:{name:INGEST_ATLAS_KNOWLEDGE_JOB,version:1},timeoutMs:120_000,maxAttempts:5,executionRetentionDays:30},{code:RUN_ATLAS_DRIFT_JOB,owner:"@athyper/server-platform-ai",queue:ATLAS_MONITORING_QUEUE,name:RUN_ATLAS_DRIFT_JOB,scope:"tenant",payloadSchema:{name:RUN_ATLAS_DRIFT_JOB,version:1},timeoutMs:60_000,maxAttempts:3,executionRetentionDays:90});}
}

function registerStudioAuthoring(container:Container,config:HostConfig|undefined,database:Kysely<Record<string,never>>|undefined,iam:NonNullable<Container["platform"]["iam"]>,authorizer:NonNullable<Container["platform"]["authorizer"]>):void{
  if(!database||!config?.publication.apiEnabled||!container.runtimes.jobs||!container.adapters.publicationSigner||!config.publication.signingKeyId)return;
  const repository=new KyselyMetaEntityAuthoringRepository(database);
  const publication=new PublicationServiceMetaEntityAdapter({
    jobs:container.runtimes.jobs,
    createEventId:randomUUID,
    activateLocal:async({releaseId,plane})=>{
      const result=await sql<{tenant_id:string|null;entity_code:string;release_no:string|number}>`SELECT r.tenant_id,e.entity_code,r.release_no FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id WHERE r.id=${releaseId}::uuid AND ${plane}=ANY(r.target_planes)`.execute(database);
      const release=result.rows[0];if(!release)throw new Error("META_ENTITY_RELEASE_NOT_FOUND");
      const active=await container.services.publication?.projections[plane]?.findActiveEntity(`metadata.entity.${release.entity_code}`);
      if(!active||active.releaseId!==releaseId)throw new Error("META_ENTITY_RELEASE_NOT_ACTIVE");
      return{planeKey:plane,tenantId:release.tenant_id,entityCode:release.entity_code,generation:Number(release.release_no),releaseId};
    },
    appendDurableEvent:async event=>{await sql`SELECT publication.fn_emit_outbox(r.tenant_id,'metadata.generation.advanced',${event.eventId},'metadata.entity_release',r.id,r.published_by,NULL::uuid,${JSON.stringify(event)}::jsonb) FROM metadata.entity_release r WHERE r.id=${event.releaseId}::uuid`.execute(database);}
  });
  const service=new MetaEntityAuthoringService({repository,signer:new MetaEntityArtifactSigner(container.adapters.publicationSigner,config.publication.signingKeyId),publication});
  container.platform.httpRegistrars.push(application=>registerMetaEntityAuthoringRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,authorizer,service}));
}

function registerStudioOnboarding(container:Container,database:Kysely<Record<string,never>>|undefined,transport:ProvisioningCommandTransport|undefined,iam:NonNullable<Container["platform"]["iam"]>,authorizer:NonNullable<Container["platform"]["authorizer"]>):void{
  container.runtimes.health.register("studio.onboarding-authority",async()=>{
    if(!database)return{status:"unhealthy",message:"Studio onboarding database is unavailable"};
    if(!transport)return{status:"healthy",message:"Studio onboarding routes are disabled"};
    try{await sql`SELECT 1 FROM onboarding.onboarding_case LIMIT 1`.execute(database);return{status:"healthy"};}catch{return{status:"unhealthy",message:"Studio onboarding schema is unavailable"};}
  });
  if(!database||!transport||!container.adapters.athyperDatabase)return;
  const repository=new KyselyOnboardingSagaRepository(database);
  const transactions={run:<Result>(actor:{tenantId:string;principalId:string},work:(transaction:Transaction<Record<string,never>>)=>Promise<Result>)=>container.adapters.athyperDatabase!.withTenantTransaction(transaction=>work(transaction as unknown as Transaction<Record<string,never>>))};
  const lifecycle=new OnboardingCaseLifecycleService(repository,transactions);
  const maintenance=new OnboardingMaintenanceService(repository,transactions,authorizer);
  const saga=createOnboardingSaga({repository,transport,envelopes:createCommandEnvelopeFactory({serviceId:"studio-onboarding",audienceFor:plane=>`${plane}-provisioner`,newCommandId:randomUUID,fingerprint:value=>createHash("sha256").update(JSON.stringify(value)).digest("hex"),now:()=>new Date().toISOString()})});
  container.platform.httpRegistrars.push(application=>registerOnboardingRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,authorize:async(context)=>Boolean((await authorizer.authorize({context,permissionCode:"studio.onboarding.manage"})).allowed),saga,lifecycle: lifecycle as OnboardingCaseLifecycleService<unknown>,maintenance:maintenance as OnboardingMaintenanceService<unknown>}));
  if(container.runtimes.jobs){
    container.runtimes.jobs.register(ONBOARDING_MAINTENANCE_QUEUE,EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,createGuestAccessExpiryHandler(maintenance));
    container.runtimes.jobDefinitions.push({code:EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,owner:"@athyper/server-plane-studio-onboarding",queue:ONBOARDING_MAINTENANCE_QUEUE,name:EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,scope:"tenant",payloadSchema:{name:EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,version:1},timeoutMs:60_000,maxAttempts:5,executionRetentionDays:90});
  }
}

function registerPublication(container:Container,config:HostConfig,databases:Partial<Record<PlaneKey,Kysely<Record<string,never>>>>,iam:NonNullable<Container["platform"]["iam"]>,authorizer:NonNullable<Container["platform"]["authorizer"]>,audit:NonNullable<Container["platform"]["audit"]>):void{
  const authorityDatabase=databases.studio;
  if(!authorityDatabase)throw new Error("Publication requires the Studio authority database");
  const artifactRuntimeEnabled=config.publication.applyEnabled||config.publication.compileEnabled||config.publication.dispatchEnabled;
  if(artifactRuntimeEnabled&&(!container.adapters.publicationArtifactStore||!container.adapters.publicationVerifier))throw new Error("Publication artifact store and verifier are unavailable");
  const authority=new KyselyPublicationAuthorityRepository(authorityDatabase);
  const projections:Partial<Record<PublicationPlane,KyselyLocalProjectionRepository>>={};
  const orchestrators:Partial<Record<PublicationPlane,PublicationOrchestrator>>={};
  for(const plane of config.publication.applyEnabled?config.publication.targetPlanes:[]){
    const database=databases[plane];if(!database)throw new Error(`Publication target database is unavailable: ${plane}`);
    const projection=new KyselyLocalProjectionRepository(database);projections[plane]=projection;
    const loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore!,verifier:container.adapters.publicationVerifier!,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion});
    orchestrators[plane]=new PublicationOrchestrator(authority,projection,loader);
  }
  container.services.publication={authority,projections,orchestrators};
  container.runtimes.health.register("publication.database",async()=>{try{await sql`SELECT 1`.execute(authorityDatabase);return{status:"healthy"};}catch{return{status:"unhealthy",message:"Publication authority database is unavailable"};}});
  if(container.runtimes.jobs&&config.publication.applyEnabled){
    container.runtimes.jobs.register(PUBLICATION_APPLY_QUEUE,APPLY_PUBLICATION_RELEASE_JOB,createPublicationApplyHandler(orchestrators,container.adapters.openTelemetry?.metrics));
    container.runtimes.jobs.register(PUBLICATION_APPLY_QUEUE,ROLLBACK_PUBLICATION_RELEASE_JOB,createPublicationRollbackHandler(projections,container.adapters.openTelemetry?.metrics));
    container.runtimes.jobs.register(PUBLICATION_MAINTENANCE_QUEUE,RECOVER_STALLED_PUBLICATIONS_JOB,createPublicationRecoveryHandler(authority,container.runtimes.jobs,container.adapters.openTelemetry?.metrics));
    container.runtimes.jobDefinitions.push({code:APPLY_PUBLICATION_RELEASE_JOB,owner:"@athyper/server-service-publication",queue:PUBLICATION_APPLY_QUEUE,name:APPLY_PUBLICATION_RELEASE_JOB,scope:"plane",payloadSchema:{name:APPLY_PUBLICATION_RELEASE_JOB,version:1},timeoutMs:120_000,maxAttempts:5,executionRetentionDays:90});
    container.runtimes.jobDefinitions.push({code:RECOVER_STALLED_PUBLICATIONS_JOB,owner:"@athyper/server-service-publication",queue:PUBLICATION_MAINTENANCE_QUEUE,name:RECOVER_STALLED_PUBLICATIONS_JOB,scope:"plane",payloadSchema:{name:RECOVER_STALLED_PUBLICATIONS_JOB,version:1},timeoutMs:60_000,maxAttempts:3,executionRetentionDays:90});
    container.runtimes.jobDefinitions.push({code:ROLLBACK_PUBLICATION_RELEASE_JOB,owner:"@athyper/server-service-publication",queue:PUBLICATION_APPLY_QUEUE,name:ROLLBACK_PUBLICATION_RELEASE_JOB,scope:"plane",payloadSchema:{name:ROLLBACK_PUBLICATION_RELEASE_JOB,version:1},timeoutMs:120_000,maxAttempts:3,executionRetentionDays:90});
  }
  if(container.runtimes.scheduler&&config.publication.recoveryEnabled)container.runtimes.scheduledJobs.push({scheduleId:"publication-recover-stalled",queue:PUBLICATION_MAINTENANCE_QUEUE,name:RECOVER_STALLED_PUBLICATIONS_JOB,data:{},pattern:{kind:"interval",everyMs:config.publication.recoveryIntervalMs},options:{jobId:"publication:recover-stalled",maxAttempts:3,payloadSchema:{name:RECOVER_STALLED_PUBLICATIONS_JOB,version:1},execution:{planeKey:"studio",scope:"plane",principalId:"publication-recovery"}}});
  if(container.runtimes.jobs&&(config.publication.compileEnabled||config.publication.dispatchEnabled)){
    if(!container.adapters.publicationSigner||!container.adapters.objectStorageBucket)throw new Error("Publication authority signer and bucket are unavailable");
    const work=new KyselyPublicationAuthorityWork({database:authorityDatabase,authority,store:container.adapters.publicationArtifactStore!,signer:container.adapters.publicationSigner,canonicalizer:{canonicalBytes,sha256},bucket:container.adapters.objectStorageBucket,signingKeyId:config.publication.signingKeyId!,targetEnvironment:config.env,targetPlanes:config.publication.targetPlanes});
    const handlers=createPublicationAuthorityHandlers(work,container.runtimes.jobs);
    for(const name of [COMPILE_PUBLICATION_ARTIFACT_JOB,SIGN_PUBLICATION_ARTIFACT_JOB,DISPATCH_PUBLICATION_JOB] as const)container.runtimes.jobs.register(PUBLICATION_AUTHORITY_QUEUE,name,handlers[name]!);
    for(const name of [COMPILE_PUBLICATION_ARTIFACT_JOB,SIGN_PUBLICATION_ARTIFACT_JOB,DISPATCH_PUBLICATION_JOB])container.runtimes.jobDefinitions.push({code:name,owner:"@athyper/server-service-publication",queue:PUBLICATION_AUTHORITY_QUEUE,name,scope:"plane",payloadSchema:{name,version:1},timeoutMs:120_000,maxAttempts:5,executionRetentionDays:90});
  }
  if(container.runtimes.jobs&&config.publication.apiEnabled){const operations=new PublicationOperationsService({repository:new KyselyPublicationOperationsRepository(authorityDatabase),jobs:container.runtimes.jobs,audit});container.platform.httpRegistrars.push(application=>registerPublicationRoutes(application,{authenticate:createIamAuthenticationMiddleware(iam),readContext:readVerifiedRequestContext,authorizer,audit,authority,jobs:container.runtimes.jobs!,apiEnabled:true,operations}));}
}

function createPlaneTransactionCoordinator(container: Container): PlaneTransactionCoordinator<RecordTransaction> {
  return {
    run(planeKey, _actor, work) {
      if (planeKey === "neon" && container.adapters.neonDatabase) {
        return container.adapters.neonDatabase.withTenantTransaction((transaction) => work(transaction as unknown as RecordTransaction));
      }
      if (planeKey === "mesh" && container.adapters.meshDatabase) {
        return container.adapters.meshDatabase.withTenantTransaction((transaction) => work(transaction as unknown as RecordTransaction));
      }
      if (planeKey === "studio" && container.adapters.athyperDatabase) {
        return container.adapters.athyperDatabase.withTenantTransaction((transaction) => work(transaction as unknown as RecordTransaction));
      }
      throw new Error(`Tenant runtime database is not configured for ${planeKey}`);
    },
  };
}

function createDatabaseOutboxWriter(source: "records" | "workflow" | "documents"|"collaboration"|"integration"|"governance"|"finance"|"attachments"): OutboxWriter<RecordTransaction> {
  return {
    async append(event, transaction) {
      if (!transaction) throw new Error(`${source} outbox writes require the active transaction`);
      await sql`
        INSERT INTO event.outbox
          (tenant_id, topic, event_type, event_key, entity_type, entity_id,
           aggregate_type, aggregate_id, actor_id, source, correlation_id, causation_id, payload, created_by)
        VALUES
          (${event.tenantId}::uuid, ${event.topic}, ${event.eventType}, ${event.eventKey ?? null},
           ${event.entityType ?? null}, ${event.entityId ?? null}::uuid,
           ${event.aggregateType ?? null}, ${event.aggregateId ?? null}::uuid,
           ${event.actorId}::uuid, ${source}, ${event.correlationId ?? null}::uuid,
           ${event.causationId ?? null}::uuid, ${JSON.stringify(event.payload ?? {})}::jsonb,
           ${event.actorId}::uuid)
      `.execute(transaction);
    },
  };
}

async function governanceDatabaseHealth(database:Kysely<Record<string,never>>){await sql`SELECT 1 FROM governance.channel_consent LIMIT 1`.execute(database);return{status:"healthy" as const};}
async function governanceComplianceDatabaseHealth(database:Kysely<Record<string,never>>){await sql`SELECT 1 FROM governance.legal_hold LIMIT 1`.execute(database);await sql`SELECT 1 FROM governance.legal_hold_manifest LIMIT 1`.execute(database);await sql`SELECT 1 FROM governance.report_pack LIMIT 1`.execute(database);}
async function dependencyHealth(configured:boolean,probe:(()=>Promise<{readonly healthy:boolean;readonly message?:string}>)|undefined,missing:string){if(!configured)return{status:"unhealthy" as const,message:missing};if(!probe)return{status:"healthy" as const};try{const result=await probe();return result.healthy?{status:"healthy" as const}:{status:"unhealthy" as const,message:result.message??missing};}catch(error){return{status:"unhealthy" as const,message:error instanceof Error?error.message:missing};}}
async function controlDatabaseHealth(database:Kysely<Record<string,never>>){await sql`SELECT 1 FROM control.cycle_template_revision LIMIT 1`.execute(database);return{status:"healthy" as const};}

const denyAllConsent={record:async()=>{throw new Error("Governance database is unavailable");},revoke:async()=>{throw new Error("Governance database is unavailable");},checkAt:async()=>null,history:async()=>({items:[],hasMore:false})} satisfies ChannelConsentService<RecordTransaction>;
