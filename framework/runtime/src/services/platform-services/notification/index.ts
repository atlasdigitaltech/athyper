/**
 * Notification Framework — Module Composition Root
 *
 * Registers all notification services, repos, adapters, handlers, and routes.
 * Follows the RuntimeModule pattern (register + contribute).
 */

import { TOKENS } from "../../../kernel/tokens.js";

// Persistence
// Phase 2 persistence

// Domain services
// Phase 2 domain services

// Adapters
import { ChannelRegistry } from "./adapters/ChannelRegistry.js";
import { SendGridAdapter } from "./adapters/email/SendGridAdapter.js";
import { InAppAdapter } from "./adapters/inapp/InAppAdapter.js";
import { WebPushAdapter } from "./adapters/push/WebPushAdapter.js";
import { TwilioSmsAdapter } from "./adapters/sms/TwilioSmsAdapter.js";
import { TeamsAdapter } from "./adapters/teams/TeamsAdapter.js";
import { WhatsAppAdapter } from "./adapters/whatsapp/WhatsAppAdapter.js";
import { WhatsAppTemplateSync } from "./adapters/whatsapp/WhatsAppTemplateSync.js";
import { SendGridCallbackHandler } from "./api/handlers/callback.handler.js";
import {
  ListMessagesHandler,
  GetMessageDeliveriesHandler,
  ListDeliveriesHandler,
  MessageStatsHandler,
} from "./api/handlers/delivery-admin.handler.js";
// Phase 2 handlers
import {
  ListDlqHandler,
  InspectDlqHandler,
  RetryDlqHandler,
  BulkReplayDlqHandler,
} from "./api/handlers/dlq-admin.handler.js";
import { ExplainNotificationHandler } from "./api/handlers/explain.handler.js";
import {
  ListNotificationsHandler,
  UnreadCountHandler,
  MarkReadHandler,
  MarkAllReadHandler,
  DismissHandler,
} from "./api/handlers/notification.handler.js";
import {
  GetPreferencesHandler,
  UpdatePreferencesHandler,
} from "./api/handlers/preference.handler.js";
import {
  ListRulesHandler,
  CreateRuleHandler,
  UpdateRuleHandler,
} from "./api/handlers/rule-admin.handler.js";
import {
  SetTenantPreferenceHandler,
  SetOrgPreferenceHandler,
  GetEffectivePreferenceHandler,
} from "./api/handlers/scoped-preference.handler.js";
import {
  ListTemplatesHandler,
  CreateTemplateHandler,
  PreviewTemplateHandler,
} from "./api/handlers/template-admin.handler.js";
import {
  SyncWhatsAppTemplatesHandler,
  ListWhatsAppTemplatesHandler,
  ManageWhatsAppConsentHandler,
  ListWhatsAppConsentsHandler,
  CheckConversationWindowHandler,
} from "./api/handlers/whatsapp-admin.handler.js";
import { WhatsAppWebhookHandler } from "./api/handlers/whatsapp-webhook.handler.js";
import { DeduplicationService } from "./domain/services/DeduplicationService.js";
import { DigestAggregator } from "./domain/services/DigestAggregator.js";
import { DlqManager } from "./domain/services/DlqManager.js";
import { ExplainabilityService } from "./domain/services/ExplainabilityService.js";
import { NotificationOrchestrator } from "./domain/services/NotificationOrchestrator.js";
import { PreferenceEvaluator } from "./domain/services/PreferenceEvaluator.js";
import { RecipientResolver } from "./domain/services/RecipientResolver.js";
import { RuleEngine } from "./domain/services/RuleEngine.js";
import { ScopedPreferenceResolver } from "./domain/services/ScopedPreferenceResolver.js";
import { TemplateRenderer } from "./domain/services/TemplateRenderer.js";
import { createCleanupExpiredHandler } from "./jobs/workers/cleanupExpired.worker.js";
import { createDeliverNotificationHandler } from "./jobs/workers/deliverNotification.worker.js";
import { createDigestNotificationHandler } from "./jobs/workers/digestNotification.worker.js";
import { createPlanNotificationHandler } from "./jobs/workers/planNotification.worker.js";
import { createProcessCallbackHandler } from "./jobs/workers/processCallback.worker.js";
import { createNotifyLogger } from "./observability/logger.js";
import { NotificationMetrics } from "./observability/metrics.js";
import { DigestStagingRepo } from "./persistence/DigestStagingRepo.js";
import { InAppNotificationRepo } from "./persistence/InAppNotificationRepo.js";
import { NotificationDeliveryRepo } from "./persistence/NotificationDeliveryRepo.js";
import { NotificationDlqRepo } from "./persistence/NotificationDlqRepo.js";
import { NotificationMessageRepo } from "./persistence/NotificationMessageRepo.js";
import { NotificationPreferenceRepo } from "./persistence/NotificationPreferenceRepo.js";
import { NotificationRuleRepo } from "./persistence/NotificationRuleRepo.js";
import { NotificationSuppressionRepo } from "./persistence/NotificationSuppressionRepo.js";
import { NotificationTemplateRepo } from "./persistence/NotificationTemplateRepo.js";
import { PushSubscriptionRepo } from "./persistence/PushSubscriptionRepo.js";
import { ScopedNotificationPreferenceRepo } from "./persistence/ScopedNotificationPreferenceRepo.js";
import { WhatsAppConsentRepo } from "./persistence/WhatsAppConsentRepo.js";

import type { IPushSubscriptionRepo } from "./adapters/push/WebPushAdapter.js";
import type { RuntimeConfig } from "../../../kernel/config.schema.js";
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
// Repo Tokens (internal to this module)
// ============================================================================

const REPO_TOKENS = {
  message: "notify.repo.message",
  delivery: "notify.repo.delivery",
  rule: "notify.repo.rule",
  template: "notify.repo.template",
  preference: "notify.repo.preference",
  suppression: "notify.repo.suppression",
  inapp: "notify.repo.inapp",
  pushSubscription: "notify.repo.pushSubscription",
  // Phase 2
  dlq: "notify.repo.dlq",
  scopedPreference: "notify.repo.scopedPreference",
  whatsappConsent: "notify.repo.whatsappConsent",
  digestStaging: "notify.repo.digestStaging",
} as const;

// ============================================================================
// Handler Tokens (internal to this module)
// ============================================================================

const HANDLER_TOKENS = {
  listNotifications: "notify.handler.listNotifications",
  unreadCount: "notify.handler.unreadCount",
  markRead: "notify.handler.markRead",
  markAllRead: "notify.handler.markAllRead",
  dismiss: "notify.handler.dismiss",
  getPreferences: "notify.handler.getPreferences",
  updatePreferences: "notify.handler.updatePreferences",
  listTemplates: "notify.handler.listTemplates",
  createTemplate: "notify.handler.createTemplate",
  previewTemplate: "notify.handler.previewTemplate",
  listRules: "notify.handler.listRules",
  createRule: "notify.handler.createRule",
  updateRule: "notify.handler.updateRule",
  listMessages: "notify.handler.listMessages",
  getMessageDeliveries: "notify.handler.getMessageDeliveries",
  listDeliveries: "notify.handler.listDeliveries",
  messageStats: "notify.handler.messageStats",
  sendgridCallback: "notify.handler.sendgridCallback",
  syncWhatsAppTemplates: "notify.handler.syncWhatsAppTemplates",
  listWhatsAppTemplates: "notify.handler.listWhatsAppTemplates",
  // Phase 2
  listDlq: "notify.handler.listDlq",
  inspectDlq: "notify.handler.inspectDlq",
  retryDlq: "notify.handler.retryDlq",
  bulkReplayDlq: "notify.handler.bulkReplayDlq",
  explainNotification: "notify.handler.explainNotification",
  setTenantPreference: "notify.handler.setTenantPreference",
  setOrgPreference: "notify.handler.setOrgPreference",
  getEffectivePreference: "notify.handler.getEffectivePreference",
  whatsappWebhook: "notify.handler.whatsappWebhook",
  manageWhatsAppConsent: "notify.handler.manageWhatsAppConsent",
  listWhatsAppConsents: "notify.handler.listWhatsAppConsents",
  checkConversationWindow: "notify.handler.checkConversationWindow",
} as const;

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
  name: "platform-services.notification",

  async register(c: Container) {
    const db = await c.resolve<Kysely<DB>>(TOKENS.db);
    const baseLogger = await c.resolve<Logger>(TOKENS.logger);
    const logger = createNotifyLogger(baseLogger, "lifecycle");

    logger.info("Registering notification module");

    // ── Persistence ─────────────────────────────────────────────────
    c.register(
      REPO_TOKENS.message,
      async () => new NotificationMessageRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.delivery,
      async () => new NotificationDeliveryRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.rule,
      async () => new NotificationRuleRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.template,
      async () => new NotificationTemplateRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.preference,
      async () => new NotificationPreferenceRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.suppression,
      async () => new NotificationSuppressionRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.inapp,
      async () => new InAppNotificationRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.pushSubscription,
      async () => new PushSubscriptionRepo(db),
      "singleton",
    );
    // Phase 2 repos
    c.register(
      REPO_TOKENS.dlq,
      async () => new NotificationDlqRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.scopedPreference,
      async () => new ScopedNotificationPreferenceRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.whatsappConsent,
      async () => new WhatsAppConsentRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.digestStaging,
      async () => new DigestStagingRepo(db),
      "singleton",
    );

    // ── Channel Adapters + Registry ─────────────────────────────────
    c.register(
      TOKENS.notificationChannelRegistry,
      async () => {
        const adapterLogger = createNotifyLogger(baseLogger, "adapter");
        const config = await c.resolve<RuntimeConfig>(TOKENS.config);
        const registry = new ChannelRegistry(adapterLogger);

        // InApp adapter (always enabled)
        const inAppRepo = await c.resolve<InAppNotificationRepo>(
          REPO_TOKENS.inapp,
        );
        registry.register(new InAppAdapter(inAppRepo, adapterLogger));

        // SendGrid adapter (if configured)
        const sgConfig = config.notification?.providers?.email?.sendgrid;
        if (sgConfig?.enabled && sgConfig.apiKeyRef && sgConfig.fromAddress) {
          registry.register(
            new SendGridAdapter(
              {
                apiKeyRef: sgConfig.apiKeyRef,
                fromAddress: sgConfig.fromAddress,
                fromName: sgConfig.fromName,
              },
              adapterLogger,
            ),
          );
        }

        // Teams Power Automate adapter (if configured)
        const teamsConfig =
          config.notification?.providers?.teams?.powerAutomate;
        if (teamsConfig?.enabled && teamsConfig.webhookUrl) {
          registry.register(
            new TeamsAdapter(
              {
                webhookUrl: teamsConfig.webhookUrl,
              },
              adapterLogger,
            ),
          );
        }

        // WhatsApp adapter (if configured) — with consent repo for Phase 2
        const waConfig = config.notification?.providers?.whatsapp;
        if (
          waConfig?.enabled &&
          waConfig.phoneNumberId &&
          waConfig.accessTokenRef
        ) {
          const consentRepo = await c.resolve<WhatsAppConsentRepo>(
            REPO_TOKENS.whatsappConsent,
          );
          registry.register(
            new WhatsAppAdapter(
              {
                phoneNumberId: waConfig.phoneNumberId,
                accessTokenRef: waConfig.accessTokenRef,
                businessAccountId: waConfig.businessAccountId,
              },
              adapterLogger,
              consentRepo,
            ),
          );
        }

        // Twilio SMS adapter (if configured)
        const smsConfig = config.notification?.providers?.sms?.twilio;
        if (
          smsConfig?.enabled &&
          smsConfig.accountSidRef &&
          smsConfig.authTokenRef &&
          smsConfig.fromNumber
        ) {
          registry.register(
            new TwilioSmsAdapter(
              {
                accountSidRef: smsConfig.accountSidRef,
                authTokenRef: smsConfig.authTokenRef,
                fromNumber: smsConfig.fromNumber,
              },
              adapterLogger,
            ),
          );
        }

        // Web Push adapter (if configured)
        const pushConfig = config.notification?.providers?.push;
        if (
          pushConfig?.enabled &&
          pushConfig.vapidPublicKey &&
          pushConfig.vapidPrivateKeyRef &&
          pushConfig.vapidSubject
        ) {
          const pushSubRepo = await c.resolve<IPushSubscriptionRepo>(
            REPO_TOKENS.pushSubscription,
          );
          registry.register(
            new WebPushAdapter(
              {
                vapidPublicKey: pushConfig.vapidPublicKey,
                vapidPrivateKeyRef: pushConfig.vapidPrivateKeyRef,
                vapidSubject: pushConfig.vapidSubject,
              },
              pushSubRepo,
              adapterLogger,
            ),
          );
        }

        return registry;
      },
      "singleton",
    );

    // ── WhatsApp Template Sync ──────────────────────────────────────
    c.register(
      TOKENS.notificationWhatsAppSync,
      async () => {
        const config = await c.resolve<RuntimeConfig>(TOKENS.config);
        const waConfig = config.notification?.providers?.whatsapp;
        const templateRepo = await c.resolve<NotificationTemplateRepo>(
          REPO_TOKENS.template,
        );
        const syncLogger = createNotifyLogger(baseLogger, "adapter");

        return new WhatsAppTemplateSync(
          {
            businessAccountId: waConfig?.businessAccountId ?? "",
            accessTokenRef: waConfig?.accessTokenRef ?? "",
          },
          templateRepo,
          syncLogger,
        );
      },
      "singleton",
    );

    // ── Domain Services ─────────────────────────────────────────────
    c.register(
      TOKENS.notificationRuleEngine,
      async () => {
        const ruleRepo = await c.resolve<NotificationRuleRepo>(
          REPO_TOKENS.rule,
        );
        return new RuleEngine(
          ruleRepo,
          createNotifyLogger(baseLogger, "planning"),
        );
      },
      "singleton",
    );

    c.register(
      TOKENS.notificationTemplateRenderer,
      async () => {
        const templateRepo = await c.resolve<NotificationTemplateRepo>(
          REPO_TOKENS.template,
        );
        return new TemplateRenderer(
          templateRepo,
          createNotifyLogger(baseLogger, "template"),
        );
      },
      "singleton",
    );

    // Phase 2: Scoped Preference Resolver
    c.register(
      TOKENS.notificationScopedPreferences,
      async () => {
        const scopedRepo = await c.resolve<ScopedNotificationPreferenceRepo>(
          REPO_TOKENS.scopedPreference,
        );
        return new ScopedPreferenceResolver(
          scopedRepo,
          db,
          createNotifyLogger(baseLogger, "preference"),
        );
      },
      "singleton",
    );

    c.register(
      TOKENS.notificationPreferenceEvaluator,
      async () => {
        const prefRepo = await c.resolve<NotificationPreferenceRepo>(
          REPO_TOKENS.preference,
        );
        const suppRepo = await c.resolve<NotificationSuppressionRepo>(
          REPO_TOKENS.suppression,
        );
        const scopedResolver = await c.resolve<ScopedPreferenceResolver>(
          TOKENS.notificationScopedPreferences,
        );
        return new PreferenceEvaluator(
          prefRepo,
          suppRepo,
          createNotifyLogger(baseLogger, "preference"),
          scopedResolver,
        );
      },
      "singleton",
    );

    // Phase 2: DLQ Manager
    c.register(
      TOKENS.notificationDlqManager,
      async () => {
        const dlqRepo = await c.resolve<NotificationDlqRepo>(REPO_TOKENS.dlq);
        const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
        return new DlqManager(
          dlqRepo,
          jobQueue,
          createNotifyLogger(baseLogger, "dlq"),
        );
      },
      "singleton",
    );

    // Phase 2: Explainability Service
    c.register(
      TOKENS.notificationExplainability,
      async () => {
        const messageRepo = await c.resolve<NotificationMessageRepo>(
          REPO_TOKENS.message,
        );
        const deliveryRepo = await c.resolve<NotificationDeliveryRepo>(
          REPO_TOKENS.delivery,
        );
        return new ExplainabilityService(
          messageRepo,
          deliveryRepo,
          createNotifyLogger(baseLogger, "explain"),
        );
      },
      "singleton",
    );

    // Phase 2: Digest Aggregator
    c.register(
      TOKENS.notificationDigestAggregator,
      async () => {
        const config = await c.resolve<RuntimeConfig>(TOKENS.config);
        const stagingRepo = await c.resolve<DigestStagingRepo>(
          REPO_TOKENS.digestStaging,
        );
        const templateRenderer = await c.resolve<TemplateRenderer>(
          TOKENS.notificationTemplateRenderer,
        );
        const channelRegistry = await c.resolve<ChannelRegistry>(
          TOKENS.notificationChannelRegistry,
        );
        const messageRepo = await c.resolve<NotificationMessageRepo>(
          REPO_TOKENS.message,
        );
        const deliveryRepo = await c.resolve<NotificationDeliveryRepo>(
          REPO_TOKENS.delivery,
        );
        const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);

        const digestConfig = config.notification?.digest ?? {};

        return new DigestAggregator(
          stagingRepo,
          templateRenderer,
          channelRegistry,
          messageRepo,
          deliveryRepo,
          jobQueue,
          createNotifyLogger(baseLogger, "digest"),
          {
            maxItemsPerDigest: digestConfig.maxItemsPerDigest ?? 50,
            defaultLocale: config.notification?.delivery?.defaultLocale ?? "en",
          },
        );
      },
      "singleton",
    );

    // Orchestrator — now with Phase 2 optional dependencies
    c.register(
      TOKENS.notificationOrchestrator,
      async () => {
        const config = await c.resolve<RuntimeConfig>(TOKENS.config);
        const redis = await c.resolve<Redis>(TOKENS.cache);
        const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);

        const ruleEngine = await c.resolve<RuleEngine>(
          TOKENS.notificationRuleEngine,
        );
        const templateRenderer = await c.resolve<TemplateRenderer>(
          TOKENS.notificationTemplateRenderer,
        );
        const preferenceEval = await c.resolve<PreferenceEvaluator>(
          TOKENS.notificationPreferenceEvaluator,
        );
        const channelRegistry = await c.resolve<ChannelRegistry>(
          TOKENS.notificationChannelRegistry,
        );
        const messageRepo = await c.resolve<NotificationMessageRepo>(
          REPO_TOKENS.message,
        );
        const deliveryRepo = await c.resolve<NotificationDeliveryRepo>(
          REPO_TOKENS.delivery,
        );

        const recipientResolver = new RecipientResolver(
          db,
          createNotifyLogger(baseLogger, "planning"),
        );
        const dedupService = new DeduplicationService(
          redis,
          createNotifyLogger(baseLogger, "dedup"),
        );

        const deliveryConfig = config.notification?.delivery ?? {};

        // Phase 2 optional deps
        const dlqManager = await c.resolve<DlqManager>(
          TOKENS.notificationDlqManager,
        );
        const digestAggregator = await c.resolve<DigestAggregator>(
          TOKENS.notificationDigestAggregator,
        );

        return new NotificationOrchestrator(
          ruleEngine,
          recipientResolver,
          preferenceEval,
          templateRenderer,
          dedupService,
          channelRegistry,
          messageRepo,
          deliveryRepo,
          jobQueue,
          createNotifyLogger(baseLogger, "delivery"),
          {
            maxRetries: deliveryConfig.maxRetries ?? 3,
            retryBackoffMs: deliveryConfig.retryBackoffMs ?? 2000,
            defaultPriority: deliveryConfig.defaultPriority ?? "normal",
            defaultLocale: deliveryConfig.defaultLocale ?? "en",
          },
          redis,
          dlqManager,
          digestAggregator,
        );
      },
      "singleton",
    );

    // ── Observability ───────────────────────────────────────────────
    c.register(
      TOKENS.notificationMetrics,
      async () => {
        const metricsRegistry = await c.resolve<MetricsRegistry>(
          TOKENS.metricsRegistry,
        );
        return new NotificationMetrics(metricsRegistry);
      },
      "singleton",
    );

    // ── HTTP Handlers ───────────────────────────────────────────────
    c.register(
      HANDLER_TOKENS.listNotifications,
      async () => new ListNotificationsHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.unreadCount,
      async () => new UnreadCountHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.markRead,
      async () => new MarkReadHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.markAllRead,
      async () => new MarkAllReadHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.dismiss,
      async () => new DismissHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getPreferences,
      async () => new GetPreferencesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.updatePreferences,
      async () => new UpdatePreferencesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listTemplates,
      async () => new ListTemplatesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.createTemplate,
      async () => new CreateTemplateHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.previewTemplate,
      async () => new PreviewTemplateHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listRules,
      async () => new ListRulesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.createRule,
      async () => new CreateRuleHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.updateRule,
      async () => new UpdateRuleHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listMessages,
      async () => new ListMessagesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getMessageDeliveries,
      async () => new GetMessageDeliveriesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listDeliveries,
      async () => new ListDeliveriesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.messageStats,
      async () => new MessageStatsHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.sendgridCallback,
      async () => new SendGridCallbackHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.syncWhatsAppTemplates,
      async () => new SyncWhatsAppTemplatesHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listWhatsAppTemplates,
      async () => new ListWhatsAppTemplatesHandler(),
      "singleton",
    );

    // Phase 2 handlers
    c.register(
      HANDLER_TOKENS.listDlq,
      async () => new ListDlqHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.inspectDlq,
      async () => new InspectDlqHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.retryDlq,
      async () => new RetryDlqHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.bulkReplayDlq,
      async () => new BulkReplayDlqHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.explainNotification,
      async () => new ExplainNotificationHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.setTenantPreference,
      async () => new SetTenantPreferenceHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.setOrgPreference,
      async () => new SetOrgPreferenceHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getEffectivePreference,
      async () => new GetEffectivePreferenceHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.whatsappWebhook,
      async () => new WhatsAppWebhookHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.manageWhatsAppConsent,
      async () => new ManageWhatsAppConsentHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listWhatsAppConsents,
      async () => new ListWhatsAppConsentsHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.checkConversationWindow,
      async () => new CheckConversationWindowHandler(),
      "singleton",
    );
  },

  async contribute(c: Container) {
    const baseLogger = await c.resolve<Logger>(TOKENS.logger);
    const logger = createNotifyLogger(baseLogger, "lifecycle");
    const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

    // ================================================================
    // User-facing: Notification Inbox
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/notifications",
      handlerToken: HANDLER_TOKENS.listNotifications,
      authRequired: true,
      tags: ["notify"],
    });
    routes.add({
      method: "GET",
      path: "/api/notifications/unread-count",
      handlerToken: HANDLER_TOKENS.unreadCount,
      authRequired: true,
      tags: ["notify"],
    });
    routes.add({
      method: "POST",
      path: "/api/notifications/:id/read",
      handlerToken: HANDLER_TOKENS.markRead,
      authRequired: true,
      tags: ["notify"],
    });
    routes.add({
      method: "POST",
      path: "/api/notifications/mark-all-read",
      handlerToken: HANDLER_TOKENS.markAllRead,
      authRequired: true,
      tags: ["notify"],
    });
    routes.add({
      method: "POST",
      path: "/api/notifications/:id/dismiss",
      handlerToken: HANDLER_TOKENS.dismiss,
      authRequired: true,
      tags: ["notify"],
    });

    // ================================================================
    // User-facing: Preferences
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/notifications/preferences",
      handlerToken: HANDLER_TOKENS.getPreferences,
      authRequired: true,
      tags: ["notify"],
    });
    routes.add({
      method: "PUT",
      path: "/api/notifications/preferences",
      handlerToken: HANDLER_TOKENS.updatePreferences,
      authRequired: true,
      tags: ["notify"],
    });

    // ================================================================
    // User-facing: Explainability
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/notifications/:messageId/explain",
      handlerToken: HANDLER_TOKENS.explainNotification,
      authRequired: true,
      tags: ["notify"],
    });

    // ================================================================
    // Admin: Templates
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/admin/notifications/templates",
      handlerToken: HANDLER_TOKENS.listTemplates,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "POST",
      path: "/api/admin/notifications/templates",
      handlerToken: HANDLER_TOKENS.createTemplate,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "POST",
      path: "/api/admin/notifications/templates/:id/preview",
      handlerToken: HANDLER_TOKENS.previewTemplate,
      authRequired: true,
      tags: ["notify", "admin"],
    });

    // ================================================================
    // Admin: Rules
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/admin/notifications/rules",
      handlerToken: HANDLER_TOKENS.listRules,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "POST",
      path: "/api/admin/notifications/rules",
      handlerToken: HANDLER_TOKENS.createRule,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "PUT",
      path: "/api/admin/notifications/rules/:id",
      handlerToken: HANDLER_TOKENS.updateRule,
      authRequired: true,
      tags: ["notify", "admin"],
    });

    // ================================================================
    // Admin: Deliveries
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/admin/notifications/messages",
      handlerToken: HANDLER_TOKENS.listMessages,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/messages/:messageId/deliveries",
      handlerToken: HANDLER_TOKENS.getMessageDeliveries,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/deliveries",
      handlerToken: HANDLER_TOKENS.listDeliveries,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/stats",
      handlerToken: HANDLER_TOKENS.messageStats,
      authRequired: true,
      tags: ["notify", "admin"],
    });

    // ================================================================
    // Admin: DLQ (Phase 2)
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/admin/notifications/dlq",
      handlerToken: HANDLER_TOKENS.listDlq,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/dlq/:id",
      handlerToken: HANDLER_TOKENS.inspectDlq,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "POST",
      path: "/api/admin/notifications/dlq/:id/retry",
      handlerToken: HANDLER_TOKENS.retryDlq,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "POST",
      path: "/api/admin/notifications/dlq/replay",
      handlerToken: HANDLER_TOKENS.bulkReplayDlq,
      authRequired: true,
      tags: ["notify", "admin"],
    });

    // ================================================================
    // Admin: Scoped Preferences (Phase 2)
    // ================================================================

    routes.add({
      method: "PUT",
      path: "/api/admin/notifications/preferences/tenant",
      handlerToken: HANDLER_TOKENS.setTenantPreference,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "PUT",
      path: "/api/admin/notifications/preferences/org/:ouId",
      handlerToken: HANDLER_TOKENS.setOrgPreference,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/preferences/effective/:principalId",
      handlerToken: HANDLER_TOKENS.getEffectivePreference,
      authRequired: true,
      tags: ["notify", "admin"],
    });

    // ================================================================
    // Provider Webhooks
    // ================================================================

    routes.add({
      method: "POST",
      path: "/api/webhooks/notification/sendgrid",
      handlerToken: HANDLER_TOKENS.sendgridCallback,
      authRequired: false,
      tags: ["notify", "webhook"],
    });

    // WhatsApp Meta webhook (GET for verification, POST for updates)
    routes.add({
      method: "GET",
      path: "/api/webhooks/notification/whatsapp",
      handlerToken: HANDLER_TOKENS.whatsappWebhook,
      authRequired: false,
      tags: ["notify", "webhook"],
    });
    routes.add({
      method: "POST",
      path: "/api/webhooks/notification/whatsapp",
      handlerToken: HANDLER_TOKENS.whatsappWebhook,
      authRequired: false,
      tags: ["notify", "webhook"],
    });

    // ================================================================
    // Admin: WhatsApp
    // ================================================================

    routes.add({
      method: "POST",
      path: "/api/admin/notifications/whatsapp/sync-templates",
      handlerToken: HANDLER_TOKENS.syncWhatsAppTemplates,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/whatsapp/templates",
      handlerToken: HANDLER_TOKENS.listWhatsAppTemplates,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "POST",
      path: "/api/admin/notifications/whatsapp/consent",
      handlerToken: HANDLER_TOKENS.manageWhatsAppConsent,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/whatsapp/consents",
      handlerToken: HANDLER_TOKENS.listWhatsAppConsents,
      authRequired: true,
      tags: ["notify", "admin"],
    });
    routes.add({
      method: "GET",
      path: "/api/admin/notifications/whatsapp/window/:phone",
      handlerToken: HANDLER_TOKENS.checkConversationWindow,
      authRequired: true,
      tags: ["notify", "admin"],
    });

    // ================================================================
    // Register Job Workers
    // ================================================================

    const config = await c.resolve<RuntimeConfig>(TOKENS.config);
    const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
    const orchestrator = await c.resolve<NotificationOrchestrator>(
      TOKENS.notificationOrchestrator,
    );
    const workerLogger = createNotifyLogger(baseLogger, "delivery");
    const concurrency = config.notification?.delivery?.workerConcurrency ?? 5;

    const db = await c.resolve<Kysely<DB>>(TOKENS.db);
    const suppressionRepo = await c.resolve<NotificationSuppressionRepo>(
      REPO_TOKENS.suppression,
    );

    await jobQueue.process(
      "plan-notification",
      concurrency,
      createPlanNotificationHandler(orchestrator, workerLogger),
    );
    await jobQueue.process(
      "deliver-notification",
      concurrency,
      createDeliverNotificationHandler(orchestrator, workerLogger),
    );
    await jobQueue.process(
      "process-callback",
      2,
      createProcessCallbackHandler(orchestrator, workerLogger),
    );
    const retentionDefaults = {
      messageDays: config.notification?.retention?.messageDays ?? 90,
      deliveryDays: config.notification?.retention?.deliveryDays ?? 30,
    };
    await jobQueue.process(
      "cleanup-expired",
      1,
      createCleanupExpiredHandler(
        db,
        suppressionRepo,
        workerLogger,
        retentionDefaults,
      ),
    );

    // Phase 2: Digest worker
    const digestAggregator = await c.resolve<DigestAggregator>(
      TOKENS.notificationDigestAggregator,
    );
    await jobQueue.process(
      "digest-notification",
      1,
      createDigestNotificationHandler(digestAggregator, workerLogger),
    );

    // ================================================================
    // Schedule Contributions (for CronScheduler)
    // ================================================================

    const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);

    jobRegistry.addSchedule({
      name: "cleanup-expired-notifications",
      cron: "0 4 * * *", // daily at 4 AM
      jobName: "cleanup-expired",
    });

    logger.info(
      "Notification module contributed — routes, workers, and schedules registered",
    );
  },
};

export const moduleCode = "NOTIFY";
export const moduleName = "Notification Framework";
