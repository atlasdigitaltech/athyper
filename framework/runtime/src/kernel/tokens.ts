// framework/runtime/kernel/tokens.ts
import type { AuditWriter } from "./audit";
import type { RuntimeConfig } from "./config.schema";
import type { Lifecycle } from "./lifecycle";
import type { Logger } from "./logger";
import type { JobQueue } from "@athyper/core";

/**
 * Global DI tokens for athyper runtime.
 * Keep tokens stable; swap implementations behind them.
 */
export const TOKENS = {
  // Kernel
  config: "kernel.config",
  logger: "kernel.logger",
  lifecycle: "kernel.lifecycle",
  env: "kernel.env",
  clock: "kernel.clock",
  bootId: "kernel.bootId",

  // Context (scoped)
  requestContext: "context.request",
  tenantContext: "context.tenant",
  authContext: "context.auth",

  // Adapters
  db: "adapter.db",
  auth: "adapter.auth",
  cache: "adapter.cache",
  objectStorage: "adapter.objectStorage",
  telemetry: "adapter.telemetry",

  // Runtime
  httpServer: "runtime.httpServer",
  jobQueue: "runtime.jobQueue",
  eventBus: "runtime.eventBus",
  scheduler: "runtime.scheduler",
  workerPool: "runtime.workerPool",
  circuitBreakers: "runtime.circuitBreakers",

  // Observability
  healthRegistry: "observability.health",
  metricsRegistry: "observability.metrics",
  requestContextStorage: "observability.requestContext",
  gracefulShutdown: "observability.shutdown",

  // Registries
  routeRegistry: "registry.routes",
  serviceRegistry: "registry.services",
  jobRegistry: "registry.jobs",

  // Governance
  auditWriter: "governance.audit",
  featureFlags: "governance.featureFlags",

  // IAM (Identity & Access)
  iamPersonaRegistry: "iam.personaRegistry",
  iamCapabilityService: "iam.capabilityService",
  iamMfaService: "iam.mfaService",
  iamSessionInvalidation: "iam.sessionInvalidation",
  iamTenantProfile: "iam.tenantProfile",

  // UI Services
  dashboardService: "ui.dashboard",
  savedViewService: "ui.savedView",
  widgetRegistry: "ui.widgetRegistry",
  contributionLoader: "ui.contributionLoader",

  // Notification Framework
  notificationOrchestrator: "notify.orchestrator",
  notificationRuleEngine: "notify.ruleEngine",
  notificationTemplateRenderer: "notify.templateRenderer",
  notificationPreferenceEvaluator: "notify.preferenceEvaluator",
  notificationChannelRegistry: "notify.channelRegistry",
  notificationMetrics: "notify.metrics",
  notificationWhatsAppSync: "notify.whatsappSync",
  notificationDigestAggregator: "notify.digestAggregator",
  notificationDlqManager: "notify.dlqManager",
  notificationExplainability: "notify.explainability",
  notificationScopedPreferences: "notify.scopedPreferences",

  // Audit & Governance
  auditWorkflowRepo: "audit.workflowRepo",
  auditOutboxRepo: "audit.outboxRepo",
  auditHashChain: "audit.hashChain",
  auditRedaction: "audit.redaction",
  auditRateLimiter: "audit.rateLimiter",
  auditQueryGate: "audit.queryGate",
  auditResilientWriter: "audit.resilientWriter",
  auditTimeline: "audit.timeline",
  auditMetrics: "audit.metrics",
  auditFeatureFlags: "audit.featureFlags",
  auditDlqRepo: "audit.dlqRepo",
  auditDlqManager: "audit.dlqManager",
  auditEncryption: "audit.encryption",
  auditLoadShedding: "audit.loadShedding",
  auditIntegrity: "audit.integrity",
  auditReplay: "audit.replay",
  auditArchiveMarkerRepo: "audit.archiveMarkerRepo",
  auditStorageTiering: "audit.storageTiering",
  auditExplainability: "audit.explainability",
  auditAccessReport: "audit.accessReport",
  auditDsar: "audit.dsar",

  // Security & Policy
  policyGate: "security.policyGate",
  fieldAccessService: "security.fieldAccess",
  fieldSecurityRepo: "security.fieldSecurityRepo",
  fieldProjectionBuilder: "security.fieldProjection",

  // Document Framework
  documentRenderService: "doc.renderService",
  documentTemplateService: "doc.templateService",
  documentOutputService: "doc.outputService",
  documentLetterheadService: "doc.letterheadService",
  documentBrandService: "doc.brandService",
  documentHtmlComposer: "doc.htmlComposer",
  documentPdfRenderer: "doc.pdfRenderer",
  documentMetrics: "doc.metrics",
  documentDlqManager: "doc.dlqManager",
  documentAuditEmitter: "doc.auditEmitter",

  // Content Management
  contentService: "content.service",
  versionService: "content.versionService",
  linkService: "content.linkService",
  aclService: "content.aclService",
  contentAuditEmitter: "content.auditEmitter",
  accessLogService: "content.accessLogService",
  commentService: "content.commentService",
  multipartUploadService: "content.multipartUploadService",
  previewService: "content.previewService",
  expiryService: "content.expiryService",

  // Collaboration Services
  collabCommentService: "collab.commentService",
  collabCommentRepo: "collab.commentRepo",
  collabMentionService: "collab.mentionService",
  collabMentionRepo: "collab.mentionRepo",
  collabTimelineService: "collab.timelineService",
  collabApprovalCommentService: "collab.approvalCommentService",
  collabApprovalCommentRepo: "collab.approvalCommentRepo",
  collabAttachmentService: "collab.attachmentService",
  collabRateLimiter: "collab.rateLimiter",
  collabSearchService: "collab.searchService",
  collabReactionService: "collab.reactionService",
  collabReactionRepo: "collab.reactionRepo",
  collabReadTrackingService: "collab.readTrackingService",
  collabReadTrackingRepo: "collab.readTrackingRepo",
  collabModerationService: "collab.moderationService",
  collabModerationRepo: "collab.moderationRepo",
  collabSLAService: "collab.slaService",
  collabSLARepo: "collab.slaRepo",
  collabAnalyticsService: "collab.analyticsService",
  collabRetentionService: "collab.retentionService",
  collabRetentionRepo: "collab.retentionRepo",
  collabEventsService: "collab.eventsService",
  collabDraftService: "collab.draftService",
  collabDraftRepo: "collab.draftRepo",

  // Sharing & Delegation
  shareTaskDelegationService: "share.taskDelegation",
  shareAdminReassignmentService: "share.adminReassignment",
  shareEnforcementService: "share.enforcement",
  sharePolicyResolver: "share.policyResolver",
  shareRecordShareService: "share.recordShare",
  shareTemporaryAccessService: "share.temporaryAccess",
  shareAuditService: "share.audit",
  shareCrossTenantService: "share.crossTenant",
  shareDelegationGrantRepo: "share.delegationGrantRepo",
  shareRecordShareRepo: "share.recordShareRepo",

  // Integration Hub
  integrationHttpClient: "int.httpClient",
  integrationRateLimiter: "int.rateLimiter",
  integrationMetrics: "int.metrics",
  integrationDeliveryScheduler: "int.deliveryScheduler",
  integrationOrchestrator: "int.orchestrator",
  integrationWebhookService: "int.webhookService",
  integrationEventGateway: "int.eventGateway",

  // =========================================================================
  // Business Engines (v2.1)
  // =========================================================================

  // Event Store Engine
  eventStore: "engine.eventStore",
  eventPublisher: "engine.eventPublisher",
  eventConsumer: "engine.eventConsumer",
  eventRepo: "engine.eventRepo",
  eventSnapshotRepo: "engine.eventSnapshotRepo",
  eventCheckpointRepo: "engine.eventCheckpointRepo",
  eventProjectionRegistry: "engine.projectionRegistry",
  eventProjectionManager: "engine.projectionManager",
  eventSequenceCounter: "engine.sequenceCounter",
  eventTieringService: "engine.eventTiering",

  // OU + Intent Engine
  ouService: "engine.ou.service",
  ouIntentService: "engine.ou.intentService",
  ouIntentMappingService: "engine.ou.intentMappingService",
  ouRepo: "engine.ou.repo",
  ouIntentRepo: "engine.ou.intentRepo",
  ouIntentMappingRepo: "engine.ou.intentMappingRepo",

  // Decision Grid Engine
  decisionGridPipeline: "engine.decisionGrid.pipeline",
  decisionGridPipelineRepo: "engine.decisionGrid.pipelineRepo",
  decisionGridPolicyModuleRepo: "engine.decisionGrid.policyModuleRepo",
  decisionGridPolicyEvalRepo: "engine.decisionGrid.policyEvalRepo",
  decisionGridSmartDefaults: "engine.decisionGrid.smartDefaults",
  decisionGridSmartDefaultRepo: "engine.decisionGrid.smartDefaultRuleRepo",
  decisionGridCompositeScoring: "engine.decisionGrid.compositeScoring",

  // Budget Engine
  budgetFundingProfileService: "engine.budget.fundingProfileService",
  budgetFundLifecycleService: "engine.budget.fundLifecycleService",
  budgetHealthService: "engine.budget.healthService",
  budgetHierarchyService: "engine.budget.hierarchyService",
  budgetTransferService: "engine.budget.transferService",
  budgetFundingProfileRepo: "engine.budget.fundingProfileRepo",
  budgetFundingTransactionRepo: "engine.budget.fundingTxnRepo",
  budgetFundingTransferRepo: "engine.budget.transferRepo",

  // Commitment Engine
  commitmentService: "engine.commitment.service",
  commitmentScheduleService: "engine.commitment.scheduleService",
  commitmentFulfillmentService: "engine.commitment.fulfillmentService",
  commitmentRenewalService: "engine.commitment.renewalService",
  commitmentRepo: "engine.commitment.repo",
  commitmentScheduleRepo: "engine.commitment.scheduleRepo",
  commitmentFulfillmentRepo: "engine.commitment.fulfillmentRepo",
  commitmentDocNumberService: "engine.commitment.docNumber",

  // Posting Engine
  postingService: "engine.posting.service",
  postingJeBuilder: "engine.posting.jeBuilder",
  postingPeriodService: "engine.posting.periodService",
  postingGlBalanceService: "engine.posting.glBalanceService",
  postingReversalService: "engine.posting.reversalService",
  postingReconciliation: "engine.posting.reconciliation",
  postingAccountingProfileResolver: "engine.posting.accountingProfileResolver",
  postingChartOfAccountsRepo: "engine.posting.coaRepo",
  postingCostCenterRepo: "engine.posting.costCenterRepo",
  postingProfitCenterRepo: "engine.posting.profitCenterRepo",
  postingFiscalPeriodRepo: "engine.posting.fiscalPeriodRepo",
  postingAccountingProfileRepo: "engine.posting.accountingProfileRepo",
  postingJournalEntryRepo: "engine.posting.jeRepo",
  postingJournalLineRepo: "engine.posting.jeLineRepo",
  postingGlBalanceRepo: "engine.posting.glBalanceRepo",

  // Tax Engine
  taxCalculationService: "engine.tax.calculationService",
  taxJurisdictionService: "engine.tax.jurisdictionService",
  taxInputCreditService: "engine.tax.inputCreditService",
  taxReturnService: "engine.tax.returnService",
  taxJurisdictionRepo: "engine.tax.jurisdictionRepo",
  taxRateRepo: "engine.tax.rateRepo",
  taxCalculationRepo: "engine.tax.calculationRepo",
  taxCreditLedgerRepo: "engine.tax.creditLedgerRepo",

  // Asset Engine
  assetService: "engine.asset.service",
  assetDepreciationService: "engine.asset.depreciationService",
  assetRevaluationService: "engine.asset.revaluationService",
  assetDisposalService: "engine.asset.disposalService",
  assetRepo: "engine.asset.repo",
  assetBookRepo: "engine.asset.bookRepo",
  assetTransactionRepo: "engine.asset.transactionRepo",
  assetDepreciationRunRepo: "engine.asset.depreciationRunRepo",

  // Inventory Engine
  inventoryService: "engine.inventory.service",
  inventoryMovementService: "engine.inventory.movementService",
  inventoryValuationService: "engine.inventory.valuationService",
  inventoryStocktakeService: "engine.inventory.stocktakeService",
  inventoryReorderService: "engine.inventory.reorderService",
  inventoryWarehouseRepo: "engine.inventory.warehouseRepo",
  inventoryItemMasterRepo: "engine.inventory.itemMasterRepo",
  inventoryBalanceRepo: "engine.inventory.balanceRepo",
  inventoryMovementRepo: "engine.inventory.movementRepo",
  inventoryValuationLayerRepo: "engine.inventory.valuationLayerRepo",

  // Commission Engine
  commissionService: "engine.commission.service",
  commissionPlanService: "engine.commission.planService",
  commissionAccrualService: "engine.commission.accrualService",
  commissionSettlementService: "engine.commission.settlementService",
  commissionClawbackService: "engine.commission.clawbackService",
  commissionStatementService: "engine.commission.statementService",
  commissionPlanRepo: "engine.commission.planRepo",
  commissionCalculationRepo: "engine.commission.calculationRepo",

  // Federation Engine
  federationIcService: "engine.federation.icService",
  federationFxRateService: "engine.federation.fxRateService",
  federationFxRevaluationService: "engine.federation.fxRevaluationService",
  federationConsolidationService: "engine.federation.consolidationService",
  federationNettingService: "engine.federation.nettingService",
  federationEliminationService: "engine.federation.eliminationService",
  federationLegalEntityRepo: "engine.federation.legalEntityRepo",
  federationIcAgreementRepo: "engine.federation.icAgreementRepo",
  federationIcTransactionRepo: "engine.federation.icTransactionRepo",
  federationFxRateRepo: "engine.federation.fxRateRepo",
  federationFxRevaluationRepo: "engine.federation.fxRevaluationRepo",
  federationNettingBatchRepo: "engine.federation.nettingBatchRepo",

  // Document Registry Engine
  documentRegistryRepo: "engine.documentRegistry.repo",
  documentRegistryService: "engine.documentRegistry.service",
  documentRegistryMetrics: "engine.documentRegistry.metrics",
  documentRegistryGuard: "engine.documentRegistry.guard",

  // Production Engine
  productionWorkOrderService: "engine.production.workOrderService",
  productionBomService: "engine.production.bomService",
  productionMaterialIssueService: "engine.production.materialIssueService",
  productionLaborService: "engine.production.laborService",
  productionOverheadService: "engine.production.overheadService",
  productionVarianceService: "engine.production.varianceService",
  productionWorkOrderRepo: "engine.production.workOrderRepo",
  productionBomRepo: "engine.production.bomRepo",
  productionMaterialIssueRepo: "engine.production.materialIssueRepo",
  productionVarianceRepo: "engine.production.varianceRepo",

  // Atlas AI Engine
  atlasModelRegistryService: "engine.atlas.modelRegistryService",
  atlasPredictionService: "engine.atlas.predictionService",
  atlasRecommendationService: "engine.atlas.recommendationService",
  atlasAnomalyService: "engine.atlas.anomalyService",
  atlasActionService: "engine.atlas.actionService",
  atlasReversalService: "engine.atlas.reversalService",
  atlasDriftMonitorService: "engine.atlas.driftMonitorService",
  atlasModelRegistryRepo: "engine.atlas.modelRegistryRepo",
  atlasNarrativeService: "engine.atlas.narrativeService",
  atlasBaselineComputeService: "engine.atlas.baselineComputeService",
  atlasAnomalyRepo: "engine.atlas.anomalyRepo",
  atlasBaselineRepo: "engine.atlas.baselineRepo",
  atlasInsightGraphService: "engine.atlas.insightGraphService",
  atlasFeedbackService: "engine.atlas.feedbackService",

  // Platform Control
  platformAdminContext: "platform.adminContext",
  platformTenantRegistry: "platform.tenantRegistry",

  // Operational Governance (data retention, tiering, quotas, legal hold)
  retentionPolicyService: "governance.retentionPolicy",
  quotaEnforcementService: "governance.quotaEnforcement",
  quotaMeasurementJob: "governance.quotaMeasurement",
  legalHoldService: "governance.legalHold",
  policyExplainabilityService: "governance.policyExplainability",
  governanceMetrics: "governance.metrics",
} as const;

export type TokenName = (typeof TOKENS)[keyof typeof TOKENS]; // "kernel.config" | ...
export type TokenKey = keyof typeof TOKENS; // "config" | "logger" | ...

/**
 * Token -> resolved value type map.
 * Add more entries as you implement/register them.
 */
export interface TokenTypes {
  // Kernel
  [TOKENS.config]: RuntimeConfig;
  [TOKENS.logger]: Logger;
  [TOKENS.lifecycle]: Lifecycle;
  [TOKENS.env]: Readonly<Record<string, string | undefined>>;
  [TOKENS.clock]: { now: () => Date };
  [TOKENS.bootId]: string;

  // Context (scoped)
  [TOKENS.requestContext]: unknown;
  [TOKENS.tenantContext]: unknown;
  [TOKENS.authContext]: unknown;

  // Runtime
  [TOKENS.jobQueue]: JobQueue;

  // Governance
  [TOKENS.auditWriter]: AuditWriter;
  [TOKENS.featureFlags]: unknown;
}

export type TokenValue<T extends TokenName> = T extends keyof TokenTypes
  ? TokenTypes[T]
  : unknown;
