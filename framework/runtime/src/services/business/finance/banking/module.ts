// framework/runtime/src/services/business/finance/banking/module.ts
//
// RuntimeModule: business.finance.banking
// Registers: BankReconciliationService
// Routes: /api/fin/bank-statements/**, /api/fin/reconciliation/**

import { TOKENS } from "../../../../kernel/tokens.js";
import { DefaultBankReconciliationService } from "./services/bank-reconciliation-service.js";
import {
    ImportStatementHandler,
    ListStatementsHandler,
    GetStatementHandler,
    StartReconciliationHandler,
    AutoMatchHandler,
    ManualMatchHandler,
    UnmatchHandler,
    CompleteReconciliationHandler,
    ReconciliationReportHandler,
} from "./api/handlers.js";

import type { RuntimeModule } from "../../../types.js";
import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";

export const module: RuntimeModule = {
    name: "business.finance.banking",

    async register(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);

        // ── Persistence ──
        c.register("fin.banking.bankStatementRepo", async () => {
            const { DefaultBankStatementRepo } = await import("./persistence/bank-statement-repo.js");
            return new (DefaultBankStatementRepo as any)(c);
        }, "singleton");

        c.register("fin.banking.bankStatementLineRepo", async () => {
            const { DefaultBankStatementLineRepo } = await import("./persistence/bank-statement-repo.js");
            return new (DefaultBankStatementLineRepo as any)(c);
        }, "singleton");

        c.register("fin.banking.reconciliationSessionRepo", async () => {
            const { DefaultReconciliationSessionRepo } = await import("./persistence/reconciliation-repo.js");
            return new (DefaultReconciliationSessionRepo as any)(c);
        }, "singleton");

        // ── Service ──
        c.register("fin.banking.bankReconciliationService", async () => {
            const statementRepo = await c.resolve<any>("fin.banking.bankStatementRepo");
            const lineRepo = await c.resolve<any>("fin.banking.bankStatementLineRepo");
            const reconRepo = await c.resolve<any>("fin.banking.reconciliationSessionRepo");

            // Inline stub for payment query repo (will be replaced when banking
            // integration is fully wired to the payments module)
            const paymentQueryRepo = {
                getPostedPayments: async () => [],
                reconcilePayment: async () => {},
            };

            return new DefaultBankReconciliationService(
                statementRepo, lineRepo, reconRepo, paymentQueryRepo,
            );
        }, "singleton");

        // ── HTTP Handlers ──
        c.register("fin.handler.bank.importStatement", async () => new ImportStatementHandler(), "singleton");
        c.register("fin.handler.bank.listStatements", async () => new ListStatementsHandler(), "singleton");
        c.register("fin.handler.bank.getStatement", async () => new GetStatementHandler(), "singleton");
        c.register("fin.handler.bank.startRecon", async () => new StartReconciliationHandler(), "singleton");
        c.register("fin.handler.bank.autoMatch", async () => new AutoMatchHandler(), "singleton");
        c.register("fin.handler.bank.manualMatch", async () => new ManualMatchHandler(), "singleton");
        c.register("fin.handler.bank.unmatch", async () => new UnmatchHandler(), "singleton");
        c.register("fin.handler.bank.completeRecon", async () => new CompleteReconciliationHandler(), "singleton");
        c.register("fin.handler.bank.reconReport", async () => new ReconciliationReportHandler(), "singleton");

        logger.info("[fin.banking] Finance banking module registered");
    },

    async contribute(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const routes = await c.resolve<any>(TOKENS.routeRegistry);

        // ── Bank Statement Routes ──
        routes.add({ method: "POST", path: "/api/fin/bank-statements", handlerToken: "fin.handler.bank.importStatement", authRequired: true, tags: ["fin", "bank-recon"] });
        routes.add({ method: "GET", path: "/api/fin/bank-statements", handlerToken: "fin.handler.bank.listStatements", authRequired: true, tags: ["fin", "bank-recon"] });
        routes.add({ method: "GET", path: "/api/fin/bank-statements/:id", handlerToken: "fin.handler.bank.getStatement", authRequired: true, tags: ["fin", "bank-recon"] });
        routes.add({ method: "POST", path: "/api/fin/bank-statements/:id/reconcile", handlerToken: "fin.handler.bank.startRecon", authRequired: true, tags: ["fin", "bank-recon"] });

        // ── Reconciliation Routes ──
        routes.add({ method: "POST", path: "/api/fin/reconciliation/:id/auto-match", handlerToken: "fin.handler.bank.autoMatch", authRequired: true, tags: ["fin", "bank-recon"] });
        routes.add({ method: "POST", path: "/api/fin/reconciliation/:id/match", handlerToken: "fin.handler.bank.manualMatch", authRequired: true, tags: ["fin", "bank-recon"] });
        routes.add({ method: "POST", path: "/api/fin/reconciliation/:id/unmatch", handlerToken: "fin.handler.bank.unmatch", authRequired: true, tags: ["fin", "bank-recon"] });
        routes.add({ method: "POST", path: "/api/fin/reconciliation/:id/complete", handlerToken: "fin.handler.bank.completeRecon", authRequired: true, tags: ["fin", "bank-recon"] });
        routes.add({ method: "GET", path: "/api/fin/reconciliation/:id/report", handlerToken: "fin.handler.bank.reconReport", authRequired: true, tags: ["fin", "bank-recon"] });

        logger.info("[fin.banking] Finance banking routes registered: 9 endpoints");
    },
};
