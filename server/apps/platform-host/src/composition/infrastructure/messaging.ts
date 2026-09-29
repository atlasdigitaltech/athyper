import {
  createEmailAdapter,
  createCaptureChannel,
  createCapturePush,
  createSesEmailAdapter,
  createSesEventSqsAdapter,
  createFcmPushAdapter,
  createMetaWhatsAppAdapter,
  createSmsAdapter,
  createWebPushAdapter,
} from "@athyper/server-adapter-communications";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import { deterministicEmailProviderTenantName } from "@athyper/server-platform-notifications";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type MessagingRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  | "createEmail"
  | "createSesEmail"
  | "createSesEventSource"
  | "createSms"
  | "createMetaWhatsApp"
  | "createFcmPush"
  | "createWebPush"
>;

const DEFAULT_DEPENDENCIES: MessagingRegistrationDependencies = {
  createEmail: createEmailAdapter,
  createSesEmail: createSesEmailAdapter,
  createSesEventSource: createSesEventSqsAdapter,
  createSms: createSmsAdapter,
  createMetaWhatsApp: createMetaWhatsAppAdapter,
  createFcmPush: createFcmPushAdapter,
  createWebPush: createWebPushAdapter,
};

export function registerMessaging(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<MessagingRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if (config.notificationCapture) {
    if (
      config.env !== "local" ||
      config.email.provider !== "smtp" ||
      !config.email.host ||
      !["mailtrap", "localhost", "127.0.0.1", "::1"].includes(
        config.email.host,
      ) ||
      !config.email.fromAddress ||
      config.email.user ||
      config.email.password
    ) {
      throw new Error(
        "Notification capture requires local unauthenticated Mailpit SMTP",
      );
    }
    const inbox = dependencies.createEmail({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      fromAddress: config.email.fromAddress,
    });
    const captureDomain = config.email.fromAddress.split("@").at(-1)!;
    for (const channel of ["email", "sms", "whatsapp"] as const) {
      container.adapters.notificationChannels.set(
        channel,
        createCaptureChannel(channel, inbox, captureDomain),
      );
    }
    container.adapters.pushTransports.push(
      createCapturePush(inbox, captureDomain),
    );
    lifecycle.onShutdown(() => inbox.close?.());
  } else {
    if (
      config.email.provider === "smtp" &&
      config.email.host &&
      config.email.fromAddress
    ) {
      const email = dependencies.createEmail({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        fromAddress: config.email.fromAddress,
        ...(config.email.user ? { user: config.email.user } : {}),
        ...(config.email.password ? { password: config.email.password } : {}),
      });
      container.adapters.notificationChannels.set("email", email);
      lifecycle.onShutdown(() => email.close?.());
    } else if (
      config.email.provider === "ses" &&
      config.email.sesRegion &&
      config.email.sesConfigurationSetName &&
      config.email.sesFromAddress
    ) {
      const email = dependencies.createSesEmail({
        region: config.email.sesRegion,
        configurationSetName: config.email.sesConfigurationSetName,
        fromAddress: config.email.sesFromAddress,
        environment: config.env,
        ...(config.email.sesReplyToAddress
          ? { replyToAddress: config.email.sesReplyToAddress }
          : {}),
        resolveTenantName(tenantId) {
          return deterministicEmailProviderTenantName(tenantId);
        },
      });
      container.adapters.notificationChannels.set("email", email);
      lifecycle.onShutdown(() => email.close?.());
    }

    if (
      config.email.provider === "ses" &&
      config.mode === "worker" &&
      config.sesEvents.region &&
      config.sesEvents.queueUrl
    ) {
      const sesEventSource = dependencies.createSesEventSource(
        {
          region: config.sesEvents.region,
          queueUrl: config.sesEvents.queueUrl,
          waitTimeSeconds: config.sesEvents.waitTimeSeconds,
          visibilityTimeoutSeconds: config.sesEvents.visibilityTimeoutSeconds,
          maxMessages: config.sesEvents.maxMessages,
          failureBackoffMs: config.sesEvents.failureBackoffMs,
        },
        {
          process(body) {
            const handler = container.adapters.sesEventHandler;
            if (!handler) throw new Error("SES event handler is not composed");
            return handler.process(body);
          },
        },
      );
      container.adapters.sesEventSource = sesEventSource;
      container.runtimes.health.register("notifications.ses-event-source", () =>
        sesEventSource.health(),
      );
      lifecycle.onReady(() => {
        void sesEventSource.run().catch(() => {
          console.error(
            "[notifications] ses_event_source_stopped_unexpectedly",
          );
        });
      });
      lifecycle.onShutdown(() => sesEventSource.close());
    }

    if (config.sms.accountSid && config.sms.authToken) {
      const sms = dependencies.createSms({
        accountSid: config.sms.accountSid,
        authToken: config.sms.authToken,
        ...(config.sms.fromNumber ? { fromNumber: config.sms.fromNumber } : {}),
        ...(config.sms.messagingServiceSid
          ? { messagingServiceSid: config.sms.messagingServiceSid }
          : {}),
      });
      container.adapters.notificationChannels.set("sms", sms);
    }

    if (
      config.metaWhatsApp.apiVersion &&
      config.metaWhatsApp.phoneNumberId &&
      config.metaWhatsApp.accessToken
    ) {
      const whatsApp = dependencies.createMetaWhatsApp({
        apiVersion: config.metaWhatsApp.apiVersion,
        phoneNumberId: config.metaWhatsApp.phoneNumberId,
        accessToken: config.metaWhatsApp.accessToken,
        ...(config.metaWhatsApp.graphBaseUrl
          ? { graphBaseUrl: config.metaWhatsApp.graphBaseUrl }
          : {}),
      });
      container.adapters.notificationChannels.set("whatsapp", whatsApp);
    }

    if (
      config.fcm.projectId &&
      config.fcm.clientEmail &&
      config.fcm.privateKey
    ) {
      container.adapters.pushTransports.push(
        dependencies.createFcmPush({
          projectId: config.fcm.projectId,
          clientEmail: config.fcm.clientEmail,
          privateKey: config.fcm.privateKey,
        }),
      );
    }

    if (
      config.webPush.subject &&
      config.webPush.publicKey &&
      config.webPush.privateKey
    ) {
      container.adapters.pushTransports.push(
        dependencies.createWebPush({
          subject: config.webPush.subject,
          publicKey: config.webPush.publicKey,
          privateKey: config.webPush.privateKey,
        }),
      );
    }
  }
}
