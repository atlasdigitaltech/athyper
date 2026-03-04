// framework/runtime/src/services/business/finance/payments/module.ts
//
// RuntimeModule: business.finance.payments
// Registers: PaymentEntryService
// Routes: /api/fin/payments/**

import { TOKENS } from "../../../../kernel/tokens.js";

import { DefaultPaymentEntryRepo } from "./persistence/payment-entry-repo.js";
import { DefaultPaymentAllocationRepo } from "./persistence/payment-allocation-repo.js";
import { DefaultPaymentEntryService } from "./services/payment-entry-service.js";
import { DocumentControl } from "../shared/document-control.js";
import { DecisionGridEvaluator } from "../shared/decision-grid-evaluator.js";

import {
    CreatePaymentHandler,
    ListPaymentsHandler,
    GetPaymentHandler,
    UpdatePaymentHandler,
    SetAllocationsHandler,
    SubmitPaymentHandler,
    PostPaymentHandler,
    CancelPaymentHandler,
    ReconcilePaymentHandler,
} from "./api/handlers.js";

import type { RuntimeModule } from "../../../types.js";
import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";

export const module: RuntimeModule = {
    name: "business.finance.payments",

    async register(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);

        // ── Persistence ──
        c.register("fin.payments.paymentEntryRepo", async () => {
            return new DefaultPaymentEntryRepo(c);
        }, "singleton");

        c.register("fin.payments.paymentAllocationRepo", async () => {
            return new DefaultPaymentAllocationRepo(c);
        }, "singleton");

        // ── Shared helpers (reuse from accounting module if already registered) ──
        if (!c.has("fin.shared.documentControl")) {
            c.register("fin.shared.documentControl", async () => {
                return new DocumentControl(c);
            }, "singleton");
        }

        if (!c.has("fin.shared.decisionGridEvaluator")) {
            c.register("fin.shared.decisionGridEvaluator", async () => {
                const pipeline = await c.resolve<any>(TOKENS.decisionGridPipeline);
                return new DecisionGridEvaluator(pipeline);
            }, "singleton");
        }

        // ── Service ──
        c.register("fin.payments.paymentEntryService", async () => {
            const paymentEntryRepo = await c.resolve<any>("fin.payments.paymentEntryRepo");
            const allocationRepo = await c.resolve<any>("fin.payments.paymentAllocationRepo");
            const purchaseInvoiceRepo = await c.resolve<any>("fin.accounting.purchaseInvoiceRepo");
            const postingService = await c.resolve<any>(TOKENS.postingService);
            const documentControl = await c.resolve<any>("fin.shared.documentControl");
            const decisionGrid = await c.resolve<any>("fin.shared.decisionGridEvaluator");
            const taxCalcService = await c.resolve<any>(TOKENS.taxCalculationService);

            return new DefaultPaymentEntryService(
                paymentEntryRepo, allocationRepo, purchaseInvoiceRepo,
                postingService, documentControl, decisionGrid, taxCalcService, c,
            );
        }, "singleton");

        // ── HTTP Handlers ──
        c.register("fin.handler.pay.create", async () => new CreatePaymentHandler(), "singleton");
        c.register("fin.handler.pay.list", async () => new ListPaymentsHandler(), "singleton");
        c.register("fin.handler.pay.get", async () => new GetPaymentHandler(), "singleton");
        c.register("fin.handler.pay.update", async () => new UpdatePaymentHandler(), "singleton");
        c.register("fin.handler.pay.allocations", async () => new SetAllocationsHandler(), "singleton");
        c.register("fin.handler.pay.submit", async () => new SubmitPaymentHandler(), "singleton");
        c.register("fin.handler.pay.post", async () => new PostPaymentHandler(), "singleton");
        c.register("fin.handler.pay.cancel", async () => new CancelPaymentHandler(), "singleton");
        c.register("fin.handler.pay.reconcile", async () => new ReconcilePaymentHandler(), "singleton");

        logger.info("[fin.payments] Finance payments module registered");
    },

    async contribute(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const routes = await c.resolve<any>(TOKENS.routeRegistry);

        // ── Payment Entry Routes ──
        routes.add({ method: "POST", path: "/api/fin/payments", handlerToken: "fin.handler.pay.create", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "GET", path: "/api/fin/payments", handlerToken: "fin.handler.pay.list", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "GET", path: "/api/fin/payments/:id", handlerToken: "fin.handler.pay.get", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "PATCH", path: "/api/fin/payments/:id", handlerToken: "fin.handler.pay.update", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "POST", path: "/api/fin/payments/:id/allocations", handlerToken: "fin.handler.pay.allocations", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "POST", path: "/api/fin/payments/:id/submit", handlerToken: "fin.handler.pay.submit", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "POST", path: "/api/fin/payments/:id/post", handlerToken: "fin.handler.pay.post", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "POST", path: "/api/fin/payments/:id/cancel", handlerToken: "fin.handler.pay.cancel", authRequired: true, tags: ["fin", "payment"] });
        routes.add({ method: "POST", path: "/api/fin/payments/:id/reconcile", handlerToken: "fin.handler.pay.reconcile", authRequired: true, tags: ["fin", "payment"] });

        logger.info("[fin.payments] Finance payments routes registered: 9 endpoints");
    },
};
