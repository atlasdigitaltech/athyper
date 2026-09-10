import type { createKyselyEntitlementRuntime } from "@athyper/server-platform-entitlements";
import type { MasterDataServices } from "@athyper/server-service-master-data";
import type { KeycloakAuthAdapter } from "@athyper/server-adapter-auth-keycloak";
import type { RedisCacheAdapter } from "@athyper/server-adapter-cache-redis";
import type { RedisNotificationEventBus } from "@athyper/server-adapter-cache-redis";
import type { AthyperDatabaseAdapter } from "@athyper/server-adapter-db-athyper";
import type { MeshDatabaseAdapter } from "@athyper/server-adapter-db-mesh";
import type { NeonDatabaseAdapter } from "@athyper/server-adapter-db-neon";
import type { S3ObjectStorageAdapter } from "@athyper/server-adapter-object-storage-s3";
import type { ClamAvMalwareScanner } from "@athyper/server-adapter-malware-clamav";
import type { TikaContentExtractor } from "@athyper/server-adapter-document-parser-tika";
import type { MeilisearchIndex } from "@athyper/server-adapter-search-meilisearch";
import type { OpenTelemetryAdapter, PrometheusMetricsRegistry } from "@athyper/server-adapter-telemetry-otel";
import type { SecretStore } from "@athyper/server-contract-secrets";
import type { PublicationArtifactStore, PublicationAuthorityRepository, PublicationSigner, PublicationVerifier, LocalProjectionRepository, PublicationPlane } from "@athyper/server-contract-publication";
import type { BusinessPartnerDefinitionService,PublicationOrchestrator } from "@athyper/server-service-publication";
import type { PdfRenderer } from "@athyper/server-contract-rendering";
import type { DerivativeRenderer } from "@athyper/server-contract-derivatives";
import type { JobAdministration, JobDefinition, ScheduledJobDefinition } from "@athyper/server-contract-jobs";
import type { JobTransactionCoordinator } from "@athyper/server-service-jobs";
import { HealthRegistry } from "@athyper/server-foundation/observability";
import type { JobRuntime } from "@athyper/server-runtime-jobs";
import type { ClosableJobScheduler } from "@athyper/server-runtime-scheduling";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authenticator, Authorizer, AuthorizationManagementService } from "@athyper/server-contract-auth";
import type { IdentityProvisioningService, OrganizationProjectionService, OrganizationService, ProjectionScopeService, ProvisioningVertical } from "@athyper/server-platform-iam";
import type { createExperienceInvalidationHooks, createExperienceService } from "@athyper/server-platform-experience";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { PolicyService } from "@athyper/server-contract-policy";
import type { RecordMutationService, RecordQueryService, RecordSnapshotService } from "@athyper/server-contract-records";
import type { RecordTransferService } from "@athyper/server-service-records";
import type { WorkflowService } from "@athyper/server-contract-workflow";
import type { DocumentService } from "@athyper/server-contract-documents";
import type { AttachmentLifecycle } from "@athyper/server-service-attachments";
import type { ContentServices } from "@athyper/server-service-content";
import type {CollaborationService}from"@athyper/server-contract-collaboration";
import type { DocumentSearchService } from "@athyper/server-contract-search";
import type { NumberingService } from "@athyper/server-contract-numbering";
import type { BusinessPartnerEligibilityService, BusinessPartnerInvitationService, BusinessPartnerRequestService, WorkforceService } from "@athyper/server-contract-master-data";
import type { BookPeriodService, FinancePostingGuard, RoundingResolver } from "@athyper/server-service-finance";
import type { BusinessPartnerAccountBankLinkageService, BusinessPartnerProfileMatchService, BusinessPartnerProfileProjectionService, NeonFinanceRegistration } from "@athyper/server-plane-neon";
import type { BusinessPartnerBankDisclosureService, BusinessPartnerNetworkExchangeService, BusinessPartnerProfilePublicationService } from "@athyper/server-plane-mesh";
import type { ChannelConsentService, CycleCertificationService, CycleDeviationService, CycleRunService, CycleTaskService, LegalHoldService, ModerationService, ReportPackService } from "@athyper/server-contract-governance";
import type { CycleConfigReader, CycleConfigService } from "@athyper/server-contract-control-admin";
import type { ControlServices, ControlServiceRouteFlags, RuntimeCommandService } from "@athyper/server-platform-control-admin";
import type { AtlasToolProposalStore } from "@athyper/server-contract-ai";
import type { AtlasA2Services, AtlasAgentRuntime, AtlasThreadService, AtlasToolService } from "@athyper/server-platform-ai";
import type { Application } from "@athyper/server-runtime-http";
import type { Transaction, Kysely } from "kysely";
import type {
  NotificationChannel,
  NotificationChannelHandler,
  NotificationDispatcher,
  PushTransport,
} from "@athyper/server-contract-notifications";
import type {
  SesEventMessageHandler,
  SesEventSqsAdapter,
} from "@athyper/server-adapter-communications";

export interface Container {
  readonly adapters: {
    keycloakAuth?: KeycloakAuthAdapter;
    redisCache?: RedisCacheAdapter;
    notificationEvents?: RedisNotificationEventBus;
    sesEventSource?: SesEventSqsAdapter;
    sesEventHandler?: SesEventMessageHandler;
    authorizationWriterDatabases?: Partial<Record<"studio" | "neon" | "mesh", Kysely<Record<string, never>>>>;
    neonDatabase?: NeonDatabaseAdapter;
    athyperDatabase?: AthyperDatabaseAdapter;
    meshDatabase?: MeshDatabaseAdapter;
    jobNeonDatabase?: NeonDatabaseAdapter;
    jobAthyperDatabase?: AthyperDatabaseAdapter;
    jobMeshDatabase?: MeshDatabaseAdapter;
    objectStorage?: S3ObjectStorageAdapter;
    objectStorageBucket?: string;
    malwareScanner?: ClamAvMalwareScanner;
    contentExtractor?: TikaContentExtractor;
    searchIndex?: MeilisearchIndex;
    openTelemetry?: OpenTelemetryAdapter;
    processMetrics?: PrometheusMetricsRegistry;
    secretStore?: SecretStore;
    publicationArtifactStore?: PublicationArtifactStore;
    publicationSigner?: PublicationSigner;
    publicationVerifier?: PublicationVerifier;
    readonly notificationChannels: Map<
      NotificationChannel,
      NotificationChannelHandler
    >;
    readonly pushTransports: PushTransport[];
    pdfRenderer?: PdfRenderer;
    previewRenderer?: DerivativeRenderer;
  };
  readonly runtimes: {
    readonly health: HealthRegistry;
    readonly scheduledJobs: ScheduledJobDefinition[];
    readonly jobDefinitions: JobDefinition[];
    scheduleReconcile?: () => Promise<unknown>;
    scheduleReconcileMs?: number;
    scheduleReconcileTimer?: ReturnType<typeof setInterval>;
    jobTransactions?: JobTransactionCoordinator;
    jobs?: JobRuntime;
    scheduler?: ClosableJobScheduler;
  };
  readonly platform: {
    entitlements?: ReturnType<typeof createKyselyEntitlementRuntime>;
    audit?: AuditRecorder;
    iam?: Authenticator;
    provisioning?: ProvisioningVertical;
    trustIam?: { readonly organizations: OrganizationService<Transaction<Record<string,never>>>; readonly projections: OrganizationProjectionService<Transaction<Record<string,never>>>; readonly scopes: ProjectionScopeService<Transaction<Record<string,never>>>; readonly identityProvisioning: IdentityProvisioningService<Transaction<Record<string,never>>> };
    authorizer?: Authorizer;
    metadata?: MetadataReader;
    policy?: PolicyService;
    governance?: { readonly consent: ChannelConsentService; readonly moderation:ModerationService; readonly cycleConfig: CycleConfigReader; readonly cycleRuns: CycleRunService; readonly cycleTasks: CycleTaskService; readonly cycleDeviations: CycleDeviationService; readonly cycleCertifications: CycleCertificationService; readonly legalHolds?:LegalHoldService; readonly reportPacks?:ReportPackService; readonly routesEnabled: boolean };
    controlAdmin?: { readonly cycleConfig?: CycleConfigService; readonly services?: ControlServices; readonly runtimeCommands?: RuntimeCommandService; readonly authorizationManagement?: AuthorizationManagementService; readonly routeFlags: ControlServiceRouteFlags; readonly routesEnabled: boolean };
    ai?: { readonly ledger: AtlasToolProposalStore; readonly threads?: AtlasThreadService; readonly runtime?: AtlasAgentRuntime; readonly tools?: AtlasToolService; readonly operations?: AtlasA2Services; readonly routesEnabled: boolean; readonly toolsEnabled: boolean };
    search?: DocumentSearchService;
    experience?: { readonly service: ReturnType<typeof createExperienceService>; readonly invalidation: ReturnType<typeof createExperienceInvalidationHooks> };
    readonly httpRegistrars: Array<(application: Application) => void>;
  };
  readonly services: {
    masterData?: MasterDataServices;
    records?: {
      readonly lists: Pick<import("@athyper/server-service-records").EntityListService, "list">;
      readonly surfaces?: Pick<import("@athyper/server-service-records").EntityListService, "list" | "record" | "applicationDescriptor">;
      readonly queries: RecordQueryService;
      readonly mutations: RecordMutationService;
      readonly snapshots?: RecordSnapshotService;
      readonly transfers?: RecordTransferService;
    };
    finance?: { readonly executionPlane: "neon"; readonly routesEnabled: boolean; readonly periods?: BookPeriodService<any>; readonly rounding?: RoundingResolver; readonly postingGuard?: FinancePostingGuard; readonly slices?: NeonFinanceRegistration["slices"] };
    workflow?: WorkflowService;
    documents?: DocumentService;
    attachments?: AttachmentLifecycle;
    content?: ContentServices;
    collaboration?:CollaborationService;
    notifications?: NotificationDispatcher;
    jobs?: JobAdministration;
    numbering?: NumberingService;
    businessPartnerRequests?: BusinessPartnerRequestService;
    businessPartnerGovernedImport?: ReturnType<typeof import("./business-partner-bound-import.js").createBusinessPartnerBoundImport>;
    businessPartner360?: import("@athyper/server-contract-master-data").BusinessPartner360Service;
    workforce?: WorkforceService;
    businessPartnerInvitations?: BusinessPartnerInvitationService;
    businessPartnerAtlasInsights?: import("@athyper/server-contract-ai").AtlasBusinessPartnerInsightOwner;
    businessPartnerEligibility?: BusinessPartnerEligibilityService;
    businessPartnerProfilePublications?: BusinessPartnerProfilePublicationService;
    businessPartnerProfileProjections?: BusinessPartnerProfileProjectionService;
    businessPartnerProfileMatches?: BusinessPartnerProfileMatchService;
    businessPartnerBankDisclosures?: BusinessPartnerBankDisclosureService;
    businessPartnerNetworkExchange?: BusinessPartnerNetworkExchangeService;
    businessPartnerAccountBankLinkage?: BusinessPartnerAccountBankLinkageService;
    publication?: {
      readonly authority: PublicationAuthorityRepository;
      readonly projections: Readonly<Partial<Record<PublicationPlane, LocalProjectionRepository>>>;
      readonly orchestrators: Readonly<Partial<Record<PublicationPlane, PublicationOrchestrator>>>;
      readonly definitions?: BusinessPartnerDefinitionService;
    };
  };
}

export function createContainer(): Container {
  return {
    adapters: { notificationChannels: new Map(), pushTransports: [] },
    runtimes: {
      health: new HealthRegistry(),
      scheduledJobs: [],
      jobDefinitions: [],
    },
    platform: { httpRegistrars: [] },
    services: {},
  };
}
