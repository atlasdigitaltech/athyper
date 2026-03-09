// framework/runtime/src/services/business/finance/accounting/module.ts
//
// RuntimeModule: business.finance.accounting
// Registers: PurchaseInvoiceService, ManualJEService, GLInquiryService, PeriodCloseService
// Routes: /api/fin/purchase-invoices/**, /api/fin/journal-entries/**, /api/fin/gl/**, /api/fin/period-close/**

import { TOKENS } from "../../../../kernel/tokens.js";
import { DecisionGridEvaluator } from "../shared/decision-grid-evaluator.js";
import { DocumentControl } from "../shared/document-control.js";
import { OUIntentResolver } from "../shared/ou-intent-resolver.js";
import { OutboxEmitter, OutboxConsumer } from "../shared/outbox.js";
import {
  InventoryReceiptHandler,
  AssetWIPHandler,
  CommissionCalcHandler,
  FederationICHandler,
} from "../shared/post-action-handlers.js";

import {
  CreatePurchaseInvoiceHandler,
  ListPurchaseInvoicesHandler,
  GetPurchaseInvoiceHandler,
  UpdatePurchaseInvoiceHandler,
  SetInvoiceLinesHandler,
  GetInvoiceLineDefaultsHandler,
  SubmitInvoiceHandler,
  PostInvoiceHandler,
  CancelInvoiceHandler,
  CreateManualJEHandler,
  ListJournalEntriesHandler,
  GetJournalEntryHandler,
  SubmitManualJEHandler,
  PostManualJEHandler,
  ReverseManualJEHandler,
  GLSummaryHandler,
  GLDetailHandler,
  TrialBalanceHandler,
} from "./api/handlers.js";
import {
  GetCloseChecklistHandler,
  GetCloseProgressHandler,
  MaterializeChecklistHandler,
  CompleteTaskHandler,
  WaiveTaskHandler,
  FailTaskHandler,
  BlockTaskHandler,
  ExecuteSystemHandlerTaskHandler,
  CheckGateHandler,
  TransitionPeriodHandler,
} from "./api/period-close-handlers.js";
import {
  RequestTaskWaiverHandler,
  ApproveTaskWaiverHandler,
  RejectTaskWaiverHandler,
  GetWaiverStatusHandler,
  AssignTaskHandler,
  BulkAssignTasksHandler,
  GetTimelineHandler,
  GetTaskTimelineHandler,
  RecheckGateHandler,
} from "./api/period-close-phase3-handlers.js";
import { CloseHandlerRegistry } from "../../engines/posting-engine/domain/close-handler-registry.js";
import {
  TrialBalanceCloseHandler,
  DepreciationCheckHandler,
  FxRevaluationCheckHandler,
  BankReconCheckHandler,
} from "../../engines/posting-engine/handlers/close-system-handlers.js";
import { DefaultPeriodCloseService } from "../../engines/posting-engine/services/period-close-service.js";
import { DefaultPeriodCloseGraphService } from "../../engines/posting-engine/services/period-close-graph-service.js";
import { DefaultCloseRiskSignalOperationsService } from "../../engines/posting-engine/services/close-risk-signal-operations.js";
import { DefaultCloseRiskSignalDispatcher, DefaultActiveCloseContextDiscovery } from "../../engines/posting-engine/services/close-risk-signal-dispatcher.js";
import type { RiskEvaluationContextLoader } from "../../engines/posting-engine/services/close-risk-signal-operations.js";
import type { RiskSignalEventEmitter } from "../../engines/posting-engine/services/risk-signal-event-publisher.js";
import { createEventBusEmitter, NO_OP_EMITTER } from "../../engines/posting-engine/services/risk-signal-event-publisher.js";
import { createDrainDomainOutboxHandler } from "../../engines/posting-engine/services/domain-event-outbox-consumer.js";
import {
  DefaultPurchaseInvoiceRepo,
  DefaultPurchaseInvoiceLineRepo,
} from "./persistence/purchase-invoice-repo.js";
import { DefaultGLInquiryService } from "./services/gl-inquiry-service.js";
import { DefaultManualJEService } from "./services/manual-je-service.js";
import { DefaultPurchaseInvoiceService } from "./services/purchase-invoice-service.js";

import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { RuntimeModule } from "../../../types.js";

export const module: RuntimeModule = {
  name: "business.finance.accounting",

  async register(c: Container) {
    const logger = await c.resolve<Logger>(TOKENS.logger);

    // ── Persistence ──
    c.register(
      "fin.accounting.purchaseInvoiceRepo",
      async () => {
        return new DefaultPurchaseInvoiceRepo(c);
      },
      "singleton",
    );

    c.register(
      "fin.accounting.purchaseInvoiceLineRepo",
      async () => {
        return new DefaultPurchaseInvoiceLineRepo(c);
      },
      "singleton",
    );

    // ── Shared helpers ──
    c.register(
      "fin.shared.documentControl",
      async () => {
        return new DocumentControl(c);
      },
      "singleton",
    );

    c.register(
      "fin.shared.ouIntentResolver",
      async () => {
        const ouService = await c.resolve<any>(TOKENS.ouService);
        const intentRepo = await c.resolve<any>(TOKENS.ouIntentRepo);
        return new OUIntentResolver(ouService, intentRepo);
      },
      "singleton",
    );

    c.register(
      "fin.shared.decisionGridEvaluator",
      async () => {
        const pipeline = await c.resolve<any>(TOKENS.decisionGridPipeline);
        return new DecisionGridEvaluator(pipeline);
      },
      "singleton",
    );

    // ── Services ──
    c.register(
      "fin.accounting.purchaseInvoiceService",
      async () => {
        const invoiceRepo = await c.resolve<any>(
          "fin.accounting.purchaseInvoiceRepo",
        );
        const lineRepo = await c.resolve<any>(
          "fin.accounting.purchaseInvoiceLineRepo",
        );
        const postingService = await c.resolve<any>(TOKENS.postingService);
        const documentControl = await c.resolve<any>(
          "fin.shared.documentControl",
        );
        const ouIntentResolver = await c.resolve<any>(
          "fin.shared.ouIntentResolver",
        );
        const decisionGrid = await c.resolve<any>(
          "fin.shared.decisionGridEvaluator",
        );
        const budgetOps = await c.resolve<any>(
          TOKENS.budgetFundLifecycleService,
        );
        const taxOps = await c.resolve<any>(TOKENS.taxCalculationService);
        const assetOps = await c.resolve<any>(TOKENS.assetService);
        const inventoryOps = await c.resolve<any>(TOKENS.inventoryService);
        const commissionOps = await c.resolve<any>(TOKENS.commissionService);
        const federationOps = {
          isIntercompany: async () => false,
          createICTransaction: async () => ({
            ok: false as const,
            error: { code: "NOT_IMPL", message: "IC not configured" },
          }),
        };
        const approvalOps = {
          createInstance: async () => ({
            ok: true as const,
            value: { id: crypto.randomUUID() },
          }),
          cancelInstance: async () => ({ ok: true as const, value: undefined }),
        };
        const outboxEmitter = new OutboxEmitter(c);

        return new DefaultPurchaseInvoiceService(
          invoiceRepo,
          lineRepo,
          postingService,
          documentControl,
          ouIntentResolver,
          decisionGrid,
          budgetOps,
          taxOps,
          assetOps,
          inventoryOps,
          commissionOps,
          federationOps,
          approvalOps,
          outboxEmitter,
        );
      },
      "singleton",
    );

    // ── Outbox Consumer (post-action side effects) ──
    c.register(
      "fin.accounting.outboxConsumer",
      async () => {
        const consumer = new OutboxConsumer(c, { maxRetries: 5 });
        consumer.registerHandler(new InventoryReceiptHandler(c));
        consumer.registerHandler(new AssetWIPHandler(c));
        consumer.registerHandler(new CommissionCalcHandler(c));
        consumer.registerHandler(new FederationICHandler(c));
        return consumer;
      },
      "singleton",
    );

    c.register(
      "fin.accounting.manualJEService",
      async () => {
        const jeRepo = await c.resolve<any>(TOKENS.postingJournalEntryRepo);
        const periodRepo = await c.resolve<any>(TOKENS.postingFiscalPeriodRepo);
        const glBalanceRepo = await c.resolve<any>(TOKENS.postingGlBalanceRepo);
        const coaRepo = await c.resolve<any>(TOKENS.postingChartOfAccountsRepo);
        const postingService = await c.resolve<any>(TOKENS.postingService);
        const decisionGrid = await c.resolve<any>(
          "fin.shared.decisionGridEvaluator",
        );
        const documentControl = await c.resolve<any>(
          "fin.shared.documentControl",
        );

        return new DefaultManualJEService(
          jeRepo,
          periodRepo,
          glBalanceRepo,
          coaRepo,
          postingService,
          decisionGrid,
          documentControl,
        );
      },
      "singleton",
    );

    c.register(
      "fin.accounting.glInquiryService",
      async () => {
        return new DefaultGLInquiryService(c);
      },
      "singleton",
    );

    // ── Period Close Governance ──
    c.register(
      "fin.accounting.closeHandlerRegistry",
      async () => {
        const registry = new CloseHandlerRegistry();
        registry.register(new TrialBalanceCloseHandler(c));
        registry.register(new DepreciationCheckHandler(c));
        registry.register(new FxRevaluationCheckHandler(c));
        registry.register(new BankReconCheckHandler(c));
        return registry;
      },
      "singleton",
    );

    c.register(
      "fin.accounting.periodCloseService",
      async () => {
        const taskRepo = await c.resolve<any>("fin.accounting.periodCloseTaskRepo");
        const checklistRepo = await c.resolve<any>("fin.accounting.periodCloseChecklistRepo");
        const periodRepo = await c.resolve<any>(TOKENS.postingFiscalPeriodRepo);
        const handlerRegistry = await c.resolve<CloseHandlerRegistry>(
          "fin.accounting.closeHandlerRegistry",
        );
        // Phase 3: optional dependencies (graceful degradation with explicit logging)
        let activityRepo: any = undefined;
        try { activityRepo = await c.resolve<any>("fin.accounting.periodCloseActivityRepo"); } catch {
          logger.warn("[fin.accounting] periodCloseActivityRepo not registered — timeline features degraded");
        }
        let approvalOps: any = undefined;
        try { approvalOps = await c.resolve<any>("fin.accounting.closeApprovalOps"); } catch {
          logger.warn("[fin.accounting] closeApprovalOps not registered — approval-required waivers will fail explicitly");
        }

        return new DefaultPeriodCloseService(
          taskRepo,
          checklistRepo,
          periodRepo,
          handlerRegistry,
          activityRepo,
          approvalOps,
        );
      },
      "singleton",
    );

    // ── Close Orchestration Graph ──
    c.register(
      "fin.accounting.periodCloseGraphService",
      async () => {
        const taskRepo = await c.resolve<any>("fin.accounting.periodCloseTaskRepo");
        const checklistRepo = await c.resolve<any>("fin.accounting.periodCloseChecklistRepo");
        return new DefaultPeriodCloseGraphService(taskRepo, checklistRepo);
      },
      "singleton",
    );

    // ── Phase 6.2: Risk Signal Operations Service ──
    c.register(
      "fin.accounting.riskSignalOperationsService",
      async () => {
        let ruleRepo: any;
        let signalRepo: any;
        let snapshotRepo: any;
        let activityRepo: any;
        let eventEmitter: RiskSignalEventEmitter;
        let contextLoader: RiskEvaluationContextLoader;

        try { ruleRepo = await c.resolve<any>("fin.accounting.closeRiskRuleRepo"); } catch {
          logger.warn("[fin.accounting] closeRiskRuleRepo not registered — risk signal operations degraded");
          return null;
        }
        try { signalRepo = await c.resolve<any>("fin.accounting.closeRiskSignalRepo"); } catch {
          logger.warn("[fin.accounting] closeRiskSignalRepo not registered — risk signal operations degraded");
          return null;
        }
        try { snapshotRepo = await c.resolve<any>("fin.accounting.closeOrchestrationSnapshotRepo"); } catch {
          logger.warn("[fin.accounting] closeOrchestrationSnapshotRepo not registered — risk signal operations degraded");
          return null;
        }
        try { activityRepo = await c.resolve<any>("fin.accounting.periodCloseActivityRepo"); } catch {
          logger.warn("[fin.accounting] periodCloseActivityRepo not registered — risk signal operations degraded");
          return null;
        }

        // Event emitter — use platform EventBus if available, else no-op
        try {
          const eventBus = await c.resolve<any>(TOKENS.eventBus);
          eventEmitter = createEventBusEmitter(eventBus);
        } catch {
          eventEmitter = NO_OP_EMITTER;
          logger.warn("[fin.accounting] EventBus not available — risk signal events will not be emitted");
        }

        // Context loader — uses repos to assemble RiskEvaluationContext
        contextLoader = {
          async load(tenantId, entityCode, fiscalYear, periodNumber, targetStatus) {
            const snapshots = await snapshotRepo.listByPeriod(
              tenantId, entityCode, fiscalYear, periodNumber, targetStatus, { limit: 10 },
            );
            if (!snapshots || snapshots.length === 0) return null;

            const activeSignals = await signalRepo.listActive(
              tenantId, entityCode, fiscalYear, periodNumber,
            );

            // Load checklist tasks as graph nodes
            const checklistRepo = await c.resolve<any>("fin.accounting.periodCloseChecklistRepo");
            const graphNodes = await checklistRepo.listByPeriod(
              tenantId, entityCode, fiscalYear, periodNumber,
            );

            // Load close calendar targets
            let closeCalendar: { softCloseTarget: Date; hardCloseTarget: Date } | null = null;
            try {
              const db = await c.resolve<any>(TOKENS.db);
              const { sql: sqlTag } = await import("kysely");
              const calResult = await sqlTag`
                SELECT soft_close_target, hard_close_target
                FROM fin.close_calendar
                WHERE tenant_id = ${tenantId}
                  AND entity_code = ${entityCode}
                  AND fiscal_year = ${fiscalYear}
                  AND period_number = ${periodNumber}
              `.execute(db);
              const calRow = (calResult.rows as any[])[0];
              if (calRow) {
                closeCalendar = {
                  softCloseTarget: new Date(calRow.soft_close_target),
                  hardCloseTarget: new Date(calRow.hard_close_target),
                };
              }
            } catch {
              // Close calendar not available — close_target_at_risk rule won't fire
            }

            return {
              tenantId,
              entityCode,
              fiscalYear,
              periodNumber,
              currentSnapshot: snapshots[0],
              priorSnapshots: snapshots.slice(1),
              activeSignals,
              closeCalendar,
              graphNodes: graphNodes ?? [],
            };
          },
        };

        return new DefaultCloseRiskSignalOperationsService(
          ruleRepo, signalRepo, snapshotRepo, activityRepo,
          eventEmitter, contextLoader,
        );
      },
      "singleton",
    );

    // ── Phase 6.2: Risk Signal Dispatcher ──
    c.register(
      "fin.accounting.riskSignalDispatcher",
      async () => {
        const opsService = await c.resolve<any>("fin.accounting.riskSignalOperationsService");
        if (!opsService) return null;

        // Discovery — queries fiscal_period + close_calendar + close_risk_schedule
        let discovery: InstanceType<typeof DefaultActiveCloseContextDiscovery>;
        try {
          const db = await c.resolve<any>(TOKENS.db);
          discovery = new DefaultActiveCloseContextDiscovery(db);
        } catch {
          logger.warn("[fin.accounting] Database not available — risk signal discovery disabled");
          return null;
        }

        return new DefaultCloseRiskSignalDispatcher(discovery, opsService);
      },
      "singleton",
    );

    // ── HTTP Handlers ──
    // Purchase Invoice
    c.register(
      "fin.handler.pi.create",
      async () => new CreatePurchaseInvoiceHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.list",
      async () => new ListPurchaseInvoicesHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.get",
      async () => new GetPurchaseInvoiceHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.update",
      async () => new UpdatePurchaseInvoiceHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.setLines",
      async () => new SetInvoiceLinesHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.lineDefaults",
      async () => new GetInvoiceLineDefaultsHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.submit",
      async () => new SubmitInvoiceHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.post",
      async () => new PostInvoiceHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.pi.cancel",
      async () => new CancelInvoiceHandler(),
      "singleton",
    );

    // Manual JE
    c.register(
      "fin.handler.je.create",
      async () => new CreateManualJEHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.je.list",
      async () => new ListJournalEntriesHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.je.get",
      async () => new GetJournalEntryHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.je.submit",
      async () => new SubmitManualJEHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.je.post",
      async () => new PostManualJEHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.je.reverse",
      async () => new ReverseManualJEHandler(),
      "singleton",
    );

    // GL Inquiry
    c.register(
      "fin.handler.gl.summary",
      async () => new GLSummaryHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.gl.detail",
      async () => new GLDetailHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.gl.trialBalance",
      async () => new TrialBalanceHandler(),
      "singleton",
    );

    // Period Close
    c.register(
      "fin.handler.close.checklist",
      async () => new GetCloseChecklistHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.progress",
      async () => new GetCloseProgressHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.materialize",
      async () => new MaterializeChecklistHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.completeTask",
      async () => new CompleteTaskHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.waiveTask",
      async () => new WaiveTaskHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.failTask",
      async () => new FailTaskHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.blockTask",
      async () => new BlockTaskHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.executeHandler",
      async () => new ExecuteSystemHandlerTaskHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.checkGate",
      async () => new CheckGateHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.transition",
      async () => new TransitionPeriodHandler(),
      "singleton",
    );

    // Period Close Phase 3
    c.register(
      "fin.handler.close.waiverRequest",
      async () => new RequestTaskWaiverHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.waiverApprove",
      async () => new ApproveTaskWaiverHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.waiverReject",
      async () => new RejectTaskWaiverHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.waiverStatus",
      async () => new GetWaiverStatusHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.assign",
      async () => new AssignTaskHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.bulkAssign",
      async () => new BulkAssignTasksHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.timeline",
      async () => new GetTimelineHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.taskTimeline",
      async () => new GetTaskTimelineHandler(),
      "singleton",
    );
    c.register(
      "fin.handler.close.recheckGate",
      async () => new RecheckGateHandler(),
      "singleton",
    );

    logger.info("[fin.accounting] Finance accounting module registered");
  },

  async contribute(c: Container) {
    const logger = await c.resolve<Logger>(TOKENS.logger);
    const routes = await c.resolve<any>(TOKENS.routeRegistry);

    // ── Purchase Invoice Routes ──
    routes.add({
      method: "POST",
      path: "/api/fin/purchase-invoices",
      handlerToken: "fin.handler.pi.create",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/purchase-invoices",
      handlerToken: "fin.handler.pi.list",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/purchase-invoices/:id",
      handlerToken: "fin.handler.pi.get",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "PATCH",
      path: "/api/fin/purchase-invoices/:id",
      handlerToken: "fin.handler.pi.update",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/purchase-invoices/:id/lines",
      handlerToken: "fin.handler.pi.setLines",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/purchase-invoices/:id/lines/defaults",
      handlerToken: "fin.handler.pi.lineDefaults",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/purchase-invoices/:id/submit",
      handlerToken: "fin.handler.pi.submit",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/purchase-invoices/:id/post",
      handlerToken: "fin.handler.pi.post",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/purchase-invoices/:id/cancel",
      handlerToken: "fin.handler.pi.cancel",
      authRequired: true,
      tags: ["fin", "purchase-invoice"],
    });

    // ── Manual JE Routes ──
    routes.add({
      method: "POST",
      path: "/api/fin/journal-entries",
      handlerToken: "fin.handler.je.create",
      authRequired: true,
      tags: ["fin", "journal-entry"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/journal-entries",
      handlerToken: "fin.handler.je.list",
      authRequired: true,
      tags: ["fin", "journal-entry"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/journal-entries/:id",
      handlerToken: "fin.handler.je.get",
      authRequired: true,
      tags: ["fin", "journal-entry"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/journal-entries/:id/submit",
      handlerToken: "fin.handler.je.submit",
      authRequired: true,
      tags: ["fin", "journal-entry"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/journal-entries/:id/post",
      handlerToken: "fin.handler.je.post",
      authRequired: true,
      tags: ["fin", "journal-entry"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/journal-entries/:id/reverse",
      handlerToken: "fin.handler.je.reverse",
      authRequired: true,
      tags: ["fin", "journal-entry"],
    });

    // ── GL Inquiry Routes ──
    routes.add({
      method: "GET",
      path: "/api/fin/gl/summary",
      handlerToken: "fin.handler.gl.summary",
      authRequired: true,
      tags: ["fin", "gl-inquiry"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/gl/detail",
      handlerToken: "fin.handler.gl.detail",
      authRequired: true,
      tags: ["fin", "gl-inquiry"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/gl/trial-balance",
      handlerToken: "fin.handler.gl.trialBalance",
      authRequired: true,
      tags: ["fin", "gl-inquiry"],
    });

    // ── Period Close Governance Routes ──
    routes.add({
      method: "GET",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/checklist",
      handlerToken: "fin.handler.close.checklist",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/progress",
      handlerToken: "fin.handler.close.progress",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/materialize",
      handlerToken: "fin.handler.close.materialize",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/complete",
      handlerToken: "fin.handler.close.completeTask",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/waive",
      handlerToken: "fin.handler.close.waiveTask",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/fail",
      handlerToken: "fin.handler.close.failTask",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/block",
      handlerToken: "fin.handler.close.blockTask",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/execute",
      handlerToken: "fin.handler.close.executeHandler",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/gate/:targetStatus",
      handlerToken: "fin.handler.close.checkGate",
      authRequired: true,
      tags: ["fin", "period-close"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/transition",
      handlerToken: "fin.handler.close.transition",
      authRequired: true,
      tags: ["fin", "period-close"],
    });

    // ── Period Close Phase 3 Routes ──
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/waiver/request",
      handlerToken: "fin.handler.close.waiverRequest",
      authRequired: true,
      tags: ["fin", "period-close", "waiver"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/waiver/:checklistId/approve",
      handlerToken: "fin.handler.close.waiverApprove",
      authRequired: true,
      tags: ["fin", "period-close", "waiver"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/waiver/:checklistId/reject",
      handlerToken: "fin.handler.close.waiverReject",
      authRequired: true,
      tags: ["fin", "period-close", "waiver"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/period-close/waiver/:checklistId",
      handlerToken: "fin.handler.close.waiverStatus",
      authRequired: true,
      tags: ["fin", "period-close", "waiver"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/assign",
      handlerToken: "fin.handler.close.assign",
      authRequired: true,
      tags: ["fin", "period-close", "assignment"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/tasks/assign/bulk",
      handlerToken: "fin.handler.close.bulkAssign",
      authRequired: true,
      tags: ["fin", "period-close", "assignment"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/timeline",
      handlerToken: "fin.handler.close.timeline",
      authRequired: true,
      tags: ["fin", "period-close", "timeline"],
    });
    routes.add({
      method: "GET",
      path: "/api/fin/period-close/tasks/:checklistId/timeline",
      handlerToken: "fin.handler.close.taskTimeline",
      authRequired: true,
      tags: ["fin", "period-close", "timeline"],
    });
    routes.add({
      method: "POST",
      path: "/api/fin/period-close/:fiscalYear/:periodNumber/gate/:targetStatus/recheck",
      handlerToken: "fin.handler.close.recheckGate",
      authRequired: true,
      tags: ["fin", "period-close"],
    });

    // ── Phase 6.2: Register risk signal dispatcher job ──
    try {
      const jobRegistry = await c.resolve<any>(TOKENS.jobRegistry);
      const dispatcher = await c.resolve<any>("fin.accounting.riskSignalDispatcher");
      if (jobRegistry && dispatcher) {
        jobRegistry.addJob({
          name: "fin.job.riskSignalDispatcher",
          queue: "fin.risk-signals",
          handlerToken: "fin.accounting.riskSignalDispatcher",
          concurrency: 1,
        });
        jobRegistry.addSchedule({
          name: "fin.schedule.riskSignalEvaluation",
          cron: "*/30 * * * *", // every 30 minutes
          jobName: "fin.job.riskSignalDispatcher",
        });
        logger.info("[fin.accounting] Risk signal dispatcher job registered (every 30 min)");
      }
    } catch {
      logger.warn("[fin.accounting] JobRegistry not available — risk signal scheduling disabled");
    }

    // ── Phase 6.2b: Register domain event outbox drain job ──
    try {
      const jobRegistry = await c.resolve<any>(TOKENS.jobRegistry);
      const jobQueue = await c.resolve<any>(TOKENS.jobQueue);
      const db = await c.resolve<any>(TOKENS.db);
      const eventBus = await c.resolve<any>(TOKENS.eventBus);

      const handler = createDrainDomainOutboxHandler(db, eventBus, logger);

      await jobQueue.process("fin.drain-domain-event-outbox", 1, handler);

      jobRegistry.addJob({
        name: "fin.drain-domain-event-outbox",
        queue: "fin.domain-events",
        handlerToken: "fin.drain-domain-event-outbox",
        concurrency: 1,
      });
      jobRegistry.addSchedule({
        name: "fin.schedule.drainDomainEventOutbox",
        cron: "*/15 * * * * *", // every 15 seconds
        jobName: "fin.drain-domain-event-outbox",
      });
      logger.info("[fin.accounting] Domain event outbox drain registered (every 15s)");
    } catch {
      logger.warn("[fin.accounting] Domain event outbox drain not available — BFF events will accumulate until drained");
    }

    logger.info(
      "[fin.accounting] Finance accounting routes registered: 37 endpoints",
    );
  },
};
