// framework/runtime/src/services/business/finance/accounting/module.ts
//
// RuntimeModule: business.finance.accounting
// Registers: PurchaseInvoiceService, ManualJEService, GLInquiryService
// Routes: /api/fin/purchase-invoices/**, /api/fin/journal-entries/**, /api/fin/gl/**

import { TOKENS } from "../../../../kernel/tokens.js";

import { DefaultPurchaseInvoiceRepo, DefaultPurchaseInvoiceLineRepo } from "./persistence/purchase-invoice-repo.js";
import { DefaultPurchaseInvoiceService } from "./services/purchase-invoice-service.js";
import { DefaultManualJEService } from "./services/manual-je-service.js";
import { DefaultGLInquiryService } from "./services/gl-inquiry-service.js";
import { DocumentControl } from "../shared/document-control.js";
import { OUIntentResolver } from "../shared/ou-intent-resolver.js";
import { DecisionGridEvaluator } from "../shared/decision-grid-evaluator.js";
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

import type { RuntimeModule } from "../../../types.js";
import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";

export const module: RuntimeModule = {
    name: "business.finance.accounting",

    async register(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);

        // ── Persistence ──
        c.register("fin.accounting.purchaseInvoiceRepo", async () => {
            return new DefaultPurchaseInvoiceRepo(c);
        }, "singleton");

        c.register("fin.accounting.purchaseInvoiceLineRepo", async () => {
            return new DefaultPurchaseInvoiceLineRepo(c);
        }, "singleton");

        // ── Shared helpers ──
        c.register("fin.shared.documentControl", async () => {
            return new DocumentControl(c);
        }, "singleton");

        c.register("fin.shared.ouIntentResolver", async () => {
            const ouService = await c.resolve<any>(TOKENS.ouService);
            const intentRepo = await c.resolve<any>(TOKENS.ouIntentRepo);
            return new OUIntentResolver(ouService, intentRepo);
        }, "singleton");

        c.register("fin.shared.decisionGridEvaluator", async () => {
            const pipeline = await c.resolve<any>(TOKENS.decisionGridPipeline);
            return new DecisionGridEvaluator(pipeline);
        }, "singleton");

        // ── Services ──
        c.register("fin.accounting.purchaseInvoiceService", async () => {
            const invoiceRepo = await c.resolve<any>("fin.accounting.purchaseInvoiceRepo");
            const lineRepo = await c.resolve<any>("fin.accounting.purchaseInvoiceLineRepo");
            const postingService = await c.resolve<any>(TOKENS.postingService);
            const documentControl = await c.resolve<any>("fin.shared.documentControl");
            const ouIntentResolver = await c.resolve<any>("fin.shared.ouIntentResolver");
            const decisionGrid = await c.resolve<any>("fin.shared.decisionGridEvaluator");
            const budgetOps = await c.resolve<any>(TOKENS.budgetFundLifecycleService);
            const taxOps = await c.resolve<any>(TOKENS.taxCalculationService);
            const assetOps = await c.resolve<any>(TOKENS.assetService);
            const inventoryOps = await c.resolve<any>(TOKENS.inventoryService);
            const commissionOps = await c.resolve<any>(TOKENS.commissionService);
            const federationOps = { isIntercompany: async () => false, createICTransaction: async () => ({ ok: false as const, error: { code: "NOT_IMPL", message: "IC not configured" } }) };
            const approvalOps = { createInstance: async () => ({ ok: true as const, value: { id: crypto.randomUUID() } }), cancelInstance: async () => ({ ok: true as const, value: undefined }) };
            const outboxEmitter = new OutboxEmitter(c);

            return new DefaultPurchaseInvoiceService(
                invoiceRepo, lineRepo, postingService, documentControl,
                ouIntentResolver, decisionGrid, budgetOps, taxOps,
                assetOps, inventoryOps, commissionOps, federationOps, approvalOps,
                outboxEmitter,
            );
        }, "singleton");

        // ── Outbox Consumer (post-action side effects) ──
        c.register("fin.accounting.outboxConsumer", async () => {
            const consumer = new OutboxConsumer(c, { maxRetries: 5 });
            consumer.registerHandler(new InventoryReceiptHandler(c));
            consumer.registerHandler(new AssetWIPHandler(c));
            consumer.registerHandler(new CommissionCalcHandler(c));
            consumer.registerHandler(new FederationICHandler(c));
            return consumer;
        }, "singleton");

        c.register("fin.accounting.manualJEService", async () => {
            const jeRepo = await c.resolve<any>(TOKENS.postingJournalEntryRepo);
            const periodRepo = await c.resolve<any>(TOKENS.postingFiscalPeriodRepo);
            const glBalanceRepo = await c.resolve<any>(TOKENS.postingGlBalanceRepo);
            const coaRepo = await c.resolve<any>(TOKENS.postingChartOfAccountsRepo);
            const postingService = await c.resolve<any>(TOKENS.postingService);
            const decisionGrid = await c.resolve<any>("fin.shared.decisionGridEvaluator");
            const documentControl = await c.resolve<any>("fin.shared.documentControl");

            return new DefaultManualJEService(
                jeRepo, periodRepo, glBalanceRepo, coaRepo,
                postingService, decisionGrid, documentControl,
            );
        }, "singleton");

        c.register("fin.accounting.glInquiryService", async () => {
            return new DefaultGLInquiryService(c);
        }, "singleton");

        // ── HTTP Handlers ──
        // Purchase Invoice
        c.register("fin.handler.pi.create", async () => new CreatePurchaseInvoiceHandler(), "singleton");
        c.register("fin.handler.pi.list", async () => new ListPurchaseInvoicesHandler(), "singleton");
        c.register("fin.handler.pi.get", async () => new GetPurchaseInvoiceHandler(), "singleton");
        c.register("fin.handler.pi.update", async () => new UpdatePurchaseInvoiceHandler(), "singleton");
        c.register("fin.handler.pi.setLines", async () => new SetInvoiceLinesHandler(), "singleton");
        c.register("fin.handler.pi.lineDefaults", async () => new GetInvoiceLineDefaultsHandler(), "singleton");
        c.register("fin.handler.pi.submit", async () => new SubmitInvoiceHandler(), "singleton");
        c.register("fin.handler.pi.post", async () => new PostInvoiceHandler(), "singleton");
        c.register("fin.handler.pi.cancel", async () => new CancelInvoiceHandler(), "singleton");

        // Manual JE
        c.register("fin.handler.je.create", async () => new CreateManualJEHandler(), "singleton");
        c.register("fin.handler.je.list", async () => new ListJournalEntriesHandler(), "singleton");
        c.register("fin.handler.je.get", async () => new GetJournalEntryHandler(), "singleton");
        c.register("fin.handler.je.submit", async () => new SubmitManualJEHandler(), "singleton");
        c.register("fin.handler.je.post", async () => new PostManualJEHandler(), "singleton");
        c.register("fin.handler.je.reverse", async () => new ReverseManualJEHandler(), "singleton");

        // GL Inquiry
        c.register("fin.handler.gl.summary", async () => new GLSummaryHandler(), "singleton");
        c.register("fin.handler.gl.detail", async () => new GLDetailHandler(), "singleton");
        c.register("fin.handler.gl.trialBalance", async () => new TrialBalanceHandler(), "singleton");

        logger.info("[fin.accounting] Finance accounting module registered");
    },

    async contribute(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const routes = await c.resolve<any>(TOKENS.routeRegistry);

        // ── Purchase Invoice Routes ──
        routes.add({ method: "POST", path: "/api/fin/purchase-invoices", handlerToken: "fin.handler.pi.create", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "GET", path: "/api/fin/purchase-invoices", handlerToken: "fin.handler.pi.list", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "GET", path: "/api/fin/purchase-invoices/:id", handlerToken: "fin.handler.pi.get", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "PATCH", path: "/api/fin/purchase-invoices/:id", handlerToken: "fin.handler.pi.update", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "POST", path: "/api/fin/purchase-invoices/:id/lines", handlerToken: "fin.handler.pi.setLines", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "GET", path: "/api/fin/purchase-invoices/:id/lines/defaults", handlerToken: "fin.handler.pi.lineDefaults", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "POST", path: "/api/fin/purchase-invoices/:id/submit", handlerToken: "fin.handler.pi.submit", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "POST", path: "/api/fin/purchase-invoices/:id/post", handlerToken: "fin.handler.pi.post", authRequired: true, tags: ["fin", "purchase-invoice"] });
        routes.add({ method: "POST", path: "/api/fin/purchase-invoices/:id/cancel", handlerToken: "fin.handler.pi.cancel", authRequired: true, tags: ["fin", "purchase-invoice"] });

        // ── Manual JE Routes ──
        routes.add({ method: "POST", path: "/api/fin/journal-entries", handlerToken: "fin.handler.je.create", authRequired: true, tags: ["fin", "journal-entry"] });
        routes.add({ method: "GET", path: "/api/fin/journal-entries", handlerToken: "fin.handler.je.list", authRequired: true, tags: ["fin", "journal-entry"] });
        routes.add({ method: "GET", path: "/api/fin/journal-entries/:id", handlerToken: "fin.handler.je.get", authRequired: true, tags: ["fin", "journal-entry"] });
        routes.add({ method: "POST", path: "/api/fin/journal-entries/:id/submit", handlerToken: "fin.handler.je.submit", authRequired: true, tags: ["fin", "journal-entry"] });
        routes.add({ method: "POST", path: "/api/fin/journal-entries/:id/post", handlerToken: "fin.handler.je.post", authRequired: true, tags: ["fin", "journal-entry"] });
        routes.add({ method: "POST", path: "/api/fin/journal-entries/:id/reverse", handlerToken: "fin.handler.je.reverse", authRequired: true, tags: ["fin", "journal-entry"] });

        // ── GL Inquiry Routes ──
        routes.add({ method: "GET", path: "/api/fin/gl/summary", handlerToken: "fin.handler.gl.summary", authRequired: true, tags: ["fin", "gl-inquiry"] });
        routes.add({ method: "GET", path: "/api/fin/gl/detail", handlerToken: "fin.handler.gl.detail", authRequired: true, tags: ["fin", "gl-inquiry"] });
        routes.add({ method: "GET", path: "/api/fin/gl/trial-balance", handlerToken: "fin.handler.gl.trialBalance", authRequired: true, tags: ["fin", "gl-inquiry"] });

        logger.info("[fin.accounting] Finance accounting routes registered: 18 endpoints");
    },
};
