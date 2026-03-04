/**
 * Integration Hub (INT) — Module Composition Root
 *
 * Depends on: CORE
 * Tenant scoped: true
 * Subscription: Base
 *
 * Registers all integration services, repos, connectors, handlers, and routes.
 * Follows the RuntimeModule pattern (register + contribute).
 */

import { TOKENS } from "../../../kernel/tokens.js";

// Persistence

// Domain services
import {
    ListFlowsHandler,
    GetFlowHandler,
    CreateFlowHandler,
    UpdateFlowHandler,
    ExecuteFlowHandler,
    GetFlowRunLogsHandler,
} from "./api/controllers/execution.controller.js";
import {
    ListEndpointsHandler,
    GetEndpointHandler,
    CreateEndpointHandler,
    UpdateEndpointHandler,
    DeleteEndpointHandler,
    TestEndpointHandler,
} from "./api/controllers/registry.controller.js";
import {
    ListWebhookSubscriptionsHandler,
    CreateWebhookSubscriptionHandler,
    UpdateWebhookSubscriptionHandler,
    DeleteWebhookSubscriptionHandler,
    RotateWebhookSecretHandler,
    InboundWebhookHandler,
} from "./api/controllers/webhook.controller.js";
import { HttpConnectorClient } from "./connectors/http/HttpConnectorClient.js";
import { DeliveryScheduler } from "./domain/services/DeliveryScheduler.js";
import { EventGateway } from "./domain/services/EventGateway.js";
import { MappingEngine } from "./domain/services/MappingEngine.js";
import { OrchestrationRuntime } from "./domain/services/OrchestrationRuntime.js";
import { IntegrationRateLimiter } from "./domain/services/RateLimiter.js";
import { WebhookService } from "./domain/services/WebhookService.js";
import { INT_JOB_TYPES } from "./jobs/queue/Queue.js";
import { registerIntegrationWorkers } from "./jobs/queue/Worker.js";
import { createIntLogger } from "./observability/logger.js";
import { IntegrationMetrics } from "./observability/metrics.js";
import { DeliveryLogRepo } from "./persistence/DeliveryLogRepo.js";
import { EndpointRepo } from "./persistence/EndpointRepo.js";
import { FlowRepo } from "./persistence/FlowRepo.js";
import { JobLogRepo } from "./persistence/JobLogRepo.js";
import { OutboxRepo } from "./persistence/OutboxRepo.js";
import { WebhookEventRepo } from "./persistence/WebhookEventRepo.js";
import { WebhookSubscriptionRepo } from "./persistence/WebhookSubscriptionRepo.js";

import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { JobRegistry } from "../../platform/foundation/registries/jobs.registry.js";
import type { RouteRegistry } from "../../platform/foundation/registries/routes.registry.js";
import type { RuntimeModule } from "../../types.js";
import type { DB } from "@athyper/adapter-db";
import type { JobQueue, MetricsRegistry } from "@athyper/core";
import type Redis from "ioredis";
import type { Kysely } from "kysely";

// ============================================================================
// Internal Tokens (module-local, not exported to global TOKENS)
// ============================================================================

const REPO_TOKENS = {
    endpoint: "int.repo.endpoint",
    flow: "int.repo.flow",
    webhookSubscription: "int.repo.webhookSubscription",
    webhookEvent: "int.repo.webhookEvent",
    outbox: "int.repo.outbox",
    deliveryLog: "int.repo.deliveryLog",
    jobLog: "int.repo.jobLog",
} as const;

const SERVICE_TOKENS = {
    httpClient: "int.service.httpClient",
    rateLimiter: "int.service.rateLimiter",
    mappingEngine: "int.service.mappingEngine",
    webhookService: "int.service.webhookService",
    deliveryScheduler: "int.service.deliveryScheduler",
    orchestrationRuntime: "int.service.orchestrationRuntime",
    eventGateway: "int.service.eventGateway",
    metrics: "int.service.metrics",
} as const;

const HANDLER_TOKENS = {
    // Endpoints
    listEndpoints: "int.handler.listEndpoints",
    getEndpoint: "int.handler.getEndpoint",
    createEndpoint: "int.handler.createEndpoint",
    updateEndpoint: "int.handler.updateEndpoint",
    deleteEndpoint: "int.handler.deleteEndpoint",
    testEndpoint: "int.handler.testEndpoint",
    // Flows
    listFlows: "int.handler.listFlows",
    getFlow: "int.handler.getFlow",
    createFlow: "int.handler.createFlow",
    updateFlow: "int.handler.updateFlow",
    executeFlow: "int.handler.executeFlow",
    getFlowRunLogs: "int.handler.getFlowRunLogs",
    // Webhooks
    listWebhookSubs: "int.handler.listWebhookSubs",
    createWebhookSub: "int.handler.createWebhookSub",
    updateWebhookSub: "int.handler.updateWebhookSub",
    deleteWebhookSub: "int.handler.deleteWebhookSub",
    rotateWebhookSecret: "int.handler.rotateWebhookSecret",
    inboundWebhook: "int.handler.inboundWebhook",
} as const;

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
    name: "platform-services.integration-hub",

    async register(c: Container) {
        const db = await c.resolve<Kysely<DB>>(TOKENS.db);
        const baseLogger = await c.resolve<Logger>(TOKENS.logger);
        const logger = createIntLogger(baseLogger, "lifecycle");

        logger.info("Registering integration-hub module");

        // ── Persistence ─────────────────────────────────────────────────
        c.register(REPO_TOKENS.endpoint, async () => new EndpointRepo(db), "singleton");
        c.register(REPO_TOKENS.flow, async () => new FlowRepo(db), "singleton");
        c.register(REPO_TOKENS.webhookSubscription, async () => new WebhookSubscriptionRepo(db), "singleton");
        c.register(REPO_TOKENS.webhookEvent, async () => new WebhookEventRepo(db), "singleton");
        c.register(REPO_TOKENS.outbox, async () => new OutboxRepo(db), "singleton");
        c.register(REPO_TOKENS.deliveryLog, async () => new DeliveryLogRepo(db), "singleton");
        c.register(REPO_TOKENS.jobLog, async () => new JobLogRepo(db), "singleton");

        // ── Observability ───────────────────────────────────────────────
        c.register(SERVICE_TOKENS.metrics, async () => {
            const metricsRegistry = await c.resolve<MetricsRegistry>(TOKENS.metricsRegistry);
            return new IntegrationMetrics(metricsRegistry);
        }, "singleton");

        // ── Core Services ───────────────────────────────────────────────

        // Rate Limiter (Redis-backed)
        c.register(SERVICE_TOKENS.rateLimiter, async () => {
            const redis = await c.resolve<Redis>(TOKENS.cache);
            return new IntegrationRateLimiter(redis, createIntLogger(baseLogger, "rate-limit"));
        }, "singleton");

        // HTTP Connector Client
        c.register(SERVICE_TOKENS.httpClient, async () => {
            const deliveryLogRepo = await c.resolve<DeliveryLogRepo>(REPO_TOKENS.deliveryLog);
            return new HttpConnectorClient(createIntLogger(baseLogger, "connector"), deliveryLogRepo);
        }, "singleton");

        // Mapping Engine
        c.register(SERVICE_TOKENS.mappingEngine, async () => {
            return new MappingEngine(createIntLogger(baseLogger, "mapping"));
        }, "singleton");

        // Webhook Service
        c.register(SERVICE_TOKENS.webhookService, async () => {
            const subRepo = await c.resolve<WebhookSubscriptionRepo>(REPO_TOKENS.webhookSubscription);
            const eventRepo = await c.resolve<WebhookEventRepo>(REPO_TOKENS.webhookEvent);
            const httpClient = await c.resolve<HttpConnectorClient>(SERVICE_TOKENS.httpClient);
            return new WebhookService(subRepo, eventRepo, httpClient, createIntLogger(baseLogger, "webhook"));
        }, "singleton");

        // Delivery Scheduler
        c.register(SERVICE_TOKENS.deliveryScheduler, async () => {
            const outboxRepo = await c.resolve<OutboxRepo>(REPO_TOKENS.outbox);
            const httpClient = await c.resolve<HttpConnectorClient>(SERVICE_TOKENS.httpClient);
            const endpointRepo = await c.resolve<EndpointRepo>(REPO_TOKENS.endpoint);
            const rateLimiter = await c.resolve<IntegrationRateLimiter>(SERVICE_TOKENS.rateLimiter);
            const metrics = await c.resolve<IntegrationMetrics>(SERVICE_TOKENS.metrics);
            return new DeliveryScheduler(
                outboxRepo, httpClient, endpointRepo, rateLimiter, metrics,
                createIntLogger(baseLogger, "delivery"),
            );
        }, "singleton");

        // Orchestration Runtime
        c.register(SERVICE_TOKENS.orchestrationRuntime, async () => {
            const httpClient = await c.resolve<HttpConnectorClient>(SERVICE_TOKENS.httpClient);
            const endpointRepo = await c.resolve<EndpointRepo>(REPO_TOKENS.endpoint);
            const mappingEngine = await c.resolve<MappingEngine>(SERVICE_TOKENS.mappingEngine);
            const jobLogRepo = await c.resolve<JobLogRepo>(REPO_TOKENS.jobLog);
            const metrics = await c.resolve<IntegrationMetrics>(SERVICE_TOKENS.metrics);
            return new OrchestrationRuntime(
                httpClient, endpointRepo, mappingEngine, jobLogRepo, metrics,
                createIntLogger(baseLogger, "orchestration"),
            );
        }, "singleton");

        // Event Gateway
        c.register(SERVICE_TOKENS.eventGateway, async () => {
            const outboxRepo = await c.resolve<OutboxRepo>(REPO_TOKENS.outbox);
            const subRepo = await c.resolve<WebhookSubscriptionRepo>(REPO_TOKENS.webhookSubscription);
            const eventRepo = await c.resolve<WebhookEventRepo>(REPO_TOKENS.webhookEvent);
            return new EventGateway(outboxRepo, subRepo, eventRepo, createIntLogger(baseLogger, "webhook"));
        }, "singleton");

        // ── Also register under global TOKENS for cross-module access ───
        c.register(TOKENS.integrationHttpClient, async () => c.resolve<HttpConnectorClient>(SERVICE_TOKENS.httpClient), "singleton");
        c.register(TOKENS.integrationRateLimiter, async () => c.resolve<IntegrationRateLimiter>(SERVICE_TOKENS.rateLimiter), "singleton");
        c.register(TOKENS.integrationMetrics, async () => c.resolve<IntegrationMetrics>(SERVICE_TOKENS.metrics), "singleton");
        c.register(TOKENS.integrationDeliveryScheduler, async () => c.resolve<DeliveryScheduler>(SERVICE_TOKENS.deliveryScheduler), "singleton");
        c.register(TOKENS.integrationOrchestrator, async () => c.resolve<OrchestrationRuntime>(SERVICE_TOKENS.orchestrationRuntime), "singleton");
        c.register(TOKENS.integrationWebhookService, async () => c.resolve<WebhookService>(SERVICE_TOKENS.webhookService), "singleton");
        c.register(TOKENS.integrationEventGateway, async () => c.resolve<EventGateway>(SERVICE_TOKENS.eventGateway), "singleton");

        // ── HTTP Handlers ───────────────────────────────────────────────
        // Endpoint handlers
        c.register(HANDLER_TOKENS.listEndpoints, async () => new ListEndpointsHandler(), "singleton");
        c.register(HANDLER_TOKENS.getEndpoint, async () => new GetEndpointHandler(), "singleton");
        c.register(HANDLER_TOKENS.createEndpoint, async () => new CreateEndpointHandler(), "singleton");
        c.register(HANDLER_TOKENS.updateEndpoint, async () => new UpdateEndpointHandler(), "singleton");
        c.register(HANDLER_TOKENS.deleteEndpoint, async () => new DeleteEndpointHandler(), "singleton");
        c.register(HANDLER_TOKENS.testEndpoint, async () => new TestEndpointHandler(), "singleton");

        // Flow handlers
        c.register(HANDLER_TOKENS.listFlows, async () => new ListFlowsHandler(), "singleton");
        c.register(HANDLER_TOKENS.getFlow, async () => new GetFlowHandler(), "singleton");
        c.register(HANDLER_TOKENS.createFlow, async () => new CreateFlowHandler(), "singleton");
        c.register(HANDLER_TOKENS.updateFlow, async () => new UpdateFlowHandler(), "singleton");
        c.register(HANDLER_TOKENS.executeFlow, async () => new ExecuteFlowHandler(), "singleton");
        c.register(HANDLER_TOKENS.getFlowRunLogs, async () => new GetFlowRunLogsHandler(), "singleton");

        // Webhook handlers
        c.register(HANDLER_TOKENS.listWebhookSubs, async () => new ListWebhookSubscriptionsHandler(), "singleton");
        c.register(HANDLER_TOKENS.createWebhookSub, async () => new CreateWebhookSubscriptionHandler(), "singleton");
        c.register(HANDLER_TOKENS.updateWebhookSub, async () => new UpdateWebhookSubscriptionHandler(), "singleton");
        c.register(HANDLER_TOKENS.deleteWebhookSub, async () => new DeleteWebhookSubscriptionHandler(), "singleton");
        c.register(HANDLER_TOKENS.rotateWebhookSecret, async () => new RotateWebhookSecretHandler(), "singleton");
        c.register(HANDLER_TOKENS.inboundWebhook, async () => new InboundWebhookHandler(), "singleton");
    },

    async contribute(c: Container) {
        const baseLogger = await c.resolve<Logger>(TOKENS.logger);
        const logger = createIntLogger(baseLogger, "lifecycle");
        const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

        // ================================================================
        // Admin: Endpoint Registry
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/integrations/endpoints",
            handlerToken: HANDLER_TOKENS.listEndpoints,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/integrations/endpoints/:id",
            handlerToken: HANDLER_TOKENS.getEndpoint,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/integrations/endpoints",
            handlerToken: HANDLER_TOKENS.createEndpoint,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "PUT",
            path: "/api/admin/integrations/endpoints/:id",
            handlerToken: HANDLER_TOKENS.updateEndpoint,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "DELETE",
            path: "/api/admin/integrations/endpoints/:id",
            handlerToken: HANDLER_TOKENS.deleteEndpoint,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/integrations/endpoints/:id/test",
            handlerToken: HANDLER_TOKENS.testEndpoint,
            authRequired: true,
            tags: ["integration", "admin"],
        });

        // ================================================================
        // Admin: Integration Flows
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/integrations/flows",
            handlerToken: HANDLER_TOKENS.listFlows,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/integrations/flows/:id",
            handlerToken: HANDLER_TOKENS.getFlow,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/integrations/flows",
            handlerToken: HANDLER_TOKENS.createFlow,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "PUT",
            path: "/api/admin/integrations/flows/:id",
            handlerToken: HANDLER_TOKENS.updateFlow,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/integrations/flows/:id/execute",
            handlerToken: HANDLER_TOKENS.executeFlow,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/integrations/flows/:id/runs/:runId/logs",
            handlerToken: HANDLER_TOKENS.getFlowRunLogs,
            authRequired: true,
            tags: ["integration", "admin"],
        });

        // ================================================================
        // Admin: Webhook Subscriptions
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/integrations/webhooks",
            handlerToken: HANDLER_TOKENS.listWebhookSubs,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/integrations/webhooks",
            handlerToken: HANDLER_TOKENS.createWebhookSub,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "PUT",
            path: "/api/admin/integrations/webhooks/:id",
            handlerToken: HANDLER_TOKENS.updateWebhookSub,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "DELETE",
            path: "/api/admin/integrations/webhooks/:id",
            handlerToken: HANDLER_TOKENS.deleteWebhookSub,
            authRequired: true,
            tags: ["integration", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/integrations/webhooks/:id/rotate-secret",
            handlerToken: HANDLER_TOKENS.rotateWebhookSecret,
            authRequired: true,
            tags: ["integration", "admin"],
        });

        // ================================================================
        // Public: Inbound Webhook Receiver
        // ================================================================

        routes.add({
            method: "POST",
            path: "/api/webhooks/integration/:subscriptionCode",
            handlerToken: HANDLER_TOKENS.inboundWebhook,
            authRequired: false,
            tags: ["integration", "webhook"],
        });

        // ================================================================
        // Register Job Workers
        // ================================================================

        try {
            const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
            const scheduler = await c.resolve<DeliveryScheduler>(SERVICE_TOKENS.deliveryScheduler);
            const webhookEventRepo = await c.resolve<WebhookEventRepo>(REPO_TOKENS.webhookEvent);
            const eventGateway = await c.resolve<EventGateway>(SERVICE_TOKENS.eventGateway);

            await registerIntegrationWorkers(
                jobQueue,
                scheduler,
                webhookEventRepo,
                eventGateway,
                createIntLogger(baseLogger, "delivery"),
            );
        } catch (err) {
            logger.warn({ error: String(err) }, "Could not register integration workers");
        }

        // ================================================================
        // Schedule Contributions
        // ================================================================

        try {
            const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);

            jobRegistry.addSchedule({
                name: "int-outbox-poll",
                cron: "*/30 * * * * *",     // every 30 seconds
                jobName: INT_JOB_TYPES.DELIVER_OUTBOX,
            });

            jobRegistry.addSchedule({
                name: "int-webhook-inbox-poll",
                cron: "*/30 * * * * *",     // every 30 seconds
                jobName: INT_JOB_TYPES.PROCESS_WEBHOOK,
            });
        } catch (err) {
            logger.warn({ error: String(err) }, "Could not register integration schedules");
        }

        logger.info("Integration Hub module contributed — routes, workers, and schedules registered");
    },
};

export const moduleCode = "INT";
export const moduleName = "Integration Hub";
