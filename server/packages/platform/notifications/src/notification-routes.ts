import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  InAppNotificationRepository,
  NotificationEventPublisher,
  NotificationEventSubscriber,
  PushSubscriptionRepository,
} from "@athyper/server-contract-notifications";
import type { Application, RequestHandler, Response } from "express";
import {
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";
import { openNotificationSseStream } from "./notification-event-bus.js";
import type {
  NotificationPreference,
  createNotificationPreferenceService,
} from "./notification-preferences.js";
import type { createNotificationOperations } from "./notification-operations.js";

export function registerNotificationRoutes(
  application: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly inbox: InAppNotificationRepository;
    readonly push: PushSubscriptionRepository;
    readonly webPushPublicKey?: string;
    /** True only when a transport supporting browser push is registered. */
    readonly webPushAvailable?: boolean;
    readonly events: NotificationEventPublisher & NotificationEventSubscriber;
    readonly preferences?: ReturnType<
      typeof createNotificationPreferenceService
    >;
    readonly operations?: ReturnType<typeof createNotificationOperations>;
  },
) {
  registerContractRoute(
    application,
    contracts.pushConfiguration,
    options.authenticate,
    (_request, response) => {
      const publicKey = options.webPushAvailable
        ? options.webPushPublicKey?.trim()
        : undefined;
      response.status(200).json({
        webPush: {
          available: Boolean(publicKey),
          ...(publicKey ? { publicKey } : {}),
        },
      });
    },
  );
  if (options.preferences) {
    application.get(
      "/api/notifications/preferences",
      options.authenticate,
      async (_request, response, next) => {
        try {
          const context = options.readContext(response);
          const snapshot = await options.preferences!.get(context);
          response.setHeader("ETag", `\"${snapshot.version}\"`);
          response.status(200).json(snapshot);
        } catch (error) {
          next(error);
        }
      },
    );
    application.patch(
      "/api/notifications/preferences",
      options.authenticate,
      async (request, response, next) => {
        try {
          const context = options.readContext(response);
          const expectedVersion = ifMatch(request.headers["if-match"]);
          const body = record(request.body);
          if (!Array.isArray(body["preferences"]))
            throw new TypeError("preferences must be an array");
          const preferences = body["preferences"].map(preferenceInput);
          const snapshot = await options.preferences!.patch(
            context,
            expectedVersion,
            preferences,
          );
          response.setHeader("ETag", `\"${snapshot.version}\"`);
          response.status(200).json(snapshot);
        } catch (error) {
          next(error);
        }
      },
    );
    application.post(
      "/api/notifications/preferences/preview",
      options.authenticate,
      async (request, response, next) => {
        try {
          const context = options.readContext(response);
          const body = record(request.body);
          if (!Array.isArray(body["preferences"]))
            throw new TypeError("preferences must be an array");
          response.status(200).json({
            previews: await options.preferences!.preview(
              context,
              body["preferences"].map(preferenceInput),
            ),
          });
        } catch (error) {
          next(error);
        }
      },
    );
  }
  if (options.operations) {
    application.get(
      "/api/notifications/deliveries/:id/timeline",
      options.authenticate,
      async (request, response, next) => {
        try {
          const context = options.readContext(response);
          const timeline = await options.operations!.subscriberTimeline(
            context,
            uuid(request.params["id"]),
          );
          if (!timeline) {
            response
              .status(404)
              .json({ error: "NOTIFICATION_DELIVERY_NOT_FOUND" });
            return;
          }
          response.status(200).json(timeline);
        } catch (error) {
          next(error);
        }
      },
    );
    application.get(
      "/api/operations/notifications/deliveries/:id/timeline",
      options.authenticate,
      async (request, response, next) => {
        try {
          const timeline = await options.operations!.operatorTimeline(
            options.readContext(response),
            uuid(request.params["id"]),
          );
          if (!timeline) {
            response
              .status(404)
              .json({ error: "NOTIFICATION_DELIVERY_NOT_FOUND" });
            return;
          }
          response.status(200).json(timeline);
        } catch (error) {
          next(error);
        }
      },
    );
    application.post(
      "/api/operations/notifications/deliveries/:id/replay",
      options.authenticate,
      async (request, response, next) => {
        try {
          const body = record(request.body);
          const receipt = await options.operations!.replay(
            options.readContext(response),
            uuid(request.params["id"]),
            text(
              body["replayKey"] ?? request.header("idempotency-key"),
              "replayKey",
            ),
          );
          response.status(receipt.replayed ? 200 : 202).json(receipt);
        } catch (error) {
          next(error);
        }
      },
    );
  }
  application.get(
    "/api/notifications/inbox",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        const limit = integer(request.query["limit"], 50);
        const notifications = await options.inbox.list({
          tenantId: context.tenantId,
          principalId: context.principalId,
          planeKey: context.planeKey,
          limit,
          cursor: optional(request.query["cursor"]),
          unreadOnly: boolean(request.query["unread"]),
        });
        const unreadCount = await options.inbox.countUnread({
          tenantId: context.tenantId,
          principalId: context.principalId,
          planeKey: context.planeKey,
        });
        const last = notifications.at(-1);
        response.status(200).json({
          notifications,
          unreadCount,
          ...(last && notifications.length === limit
            ? {
                nextCursor: Buffer.from(
                  JSON.stringify({ createdAt: last.createdAt, id: last.id }),
                  "utf8",
                ).toString("base64url"),
              }
            : {}),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  registerContractRoute(
    application,
    contracts.counts,
    options.authenticate,
    async (_request, response, next) => {
      try {
        const context = options.readContext(response);
        response.status(200).json({
          unread: await options.inbox.countUnread({
            tenantId: context.tenantId,
            principalId: context.principalId,
            planeKey: context.planeKey,
          }),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  application.post(
    "/api/notifications/:id/read",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        const id = uuid(request.params["id"]);
        const occurredAt = new Date().toISOString();
        const updated = await options.inbox.markRead({
          tenantId: context.tenantId,
          principalId: context.principalId,
          planeKey: context.planeKey,
          notificationId: id,
          readAt: occurredAt,
        });
        if (!updated) {
          response.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
          return;
        }
        void publishInboxEvent(options.events, {
          type: "notification.read",
          tenantId: context.tenantId,
          principalId: context.principalId,
          notificationId: id,
          occurredAt,
        });
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
  registerContractRoute(
    application,
    contracts.readAll,
    options.authenticate,
    async (_request, response, next) => {
      try {
        const context = options.readContext(response);
        const occurredAt = new Date().toISOString();
        const updated = await options.inbox.markAllRead({
          tenantId: context.tenantId,
          principalId: context.principalId,
          planeKey: context.planeKey,
          readAt: occurredAt,
        });
        void publishInboxEvent(options.events, {
          type: "notification.refresh",
          tenantId: context.tenantId,
          principalId: context.principalId,
          occurredAt,
        });
        response.status(200).json({ updated, readAt: occurredAt });
      } catch (error) {
        next(error);
      }
    },
  );
  registerContractRoute(
    application,
    contracts.dismiss,
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        const id = uuid(request.params["id"]),
          occurredAt = new Date().toISOString();
        const updated = await options.inbox.dismiss({
          tenantId: context.tenantId,
          principalId: context.principalId,
          planeKey: context.planeKey,
          notificationId: id,
          dismissedAt: occurredAt,
        });
        if (!updated) {
          response.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
          return;
        }
        void publishInboxEvent(options.events, {
          type: "notification.refresh",
          tenantId: context.tenantId,
          principalId: context.principalId,
          notificationId: id,
          occurredAt,
        });
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
  application.get(
    "/api/notifications/stream",
    options.authenticate,
    (request, response) => {
      const context = options.readContext(response);
      response.status(200);
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders();
      const controller = new AbortController();
      request.once("close", () => controller.abort());
      openNotificationSseStream({
        subscriber: options.events,
        tenantId: context.tenantId,
        principalId: context.principalId,
        write: (chunk) => response.write(chunk),
        signal: controller.signal,
      });
    },
  );
  application.post(
    "/api/notifications/push-subscriptions",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        const body = record(request.body);
        const subscription = await options.push.upsert({
          tenantId: context.tenantId,
          principalId: context.principalId,
          planeKey: context.planeKey,
          platform: platform(body["platform"]),
          deviceId: text(body["deviceId"] ?? body["device_id"], "deviceId"),
          endpoint: text(body["endpoint"], "endpoint"),
          ...(optional(body["p256dhKey"] ?? body["p256dh_key"])
            ? { p256dhKey: optional(body["p256dhKey"] ?? body["p256dh_key"]) }
            : {}),
          ...(optional(body["authKey"] ?? body["auth_key"])
            ? { authKey: optional(body["authKey"] ?? body["auth_key"]) }
            : {}),
          ...(optional(body["deviceToken"] ?? body["device_token"])
            ? {
                deviceToken: optional(
                  body["deviceToken"] ?? body["device_token"],
                ),
              }
            : {}),
          ...(request.headers["user-agent"]
            ? { userAgent: request.headers["user-agent"] }
            : {}),
        });
        response.status(201).json(subscription);
      } catch (error) {
        next(error);
      }
    },
  );
  application.delete(
    "/api/notifications/push-subscriptions/:id",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response);
        await options.push.deactivate({
          tenantId: context.tenantId,
          principalId: context.principalId,
          planeKey: context.planeKey,
          subscriptionId: uuid(request.params["id"]),
          reason: "user_unsubscribed",
        });
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
}
const uuidExpression =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

// The inbox transaction has committed before fan-out. An optional SSE/Redis
// failure must not report the persisted mutation as a failed request. Callers
// intentionally do not await this best-effort broadcast: a stalled publisher
// must not hold the committed HTTP response open. Rejections are handled here.
async function publishInboxEvent(
  publisher: NotificationEventPublisher,
  event: Parameters<NotificationEventPublisher["publish"]>[0],
): Promise<void> {
  try {
    await publisher.publish(event);
  } catch {
    console.warn(
      `[notifications] inbox_event_publish_failed type=${event.type}`,
    );
  }
}

const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: { error: { type: "string" } },
} as const;
const contracts = {
  pushConfiguration: defineRouteContract({
    method: "get",
    path: "/api/notifications/push-configuration",
    operationId: "notifications.getPushConfiguration",
    summary: "Get browser push-notification availability",
    tags: ["Notifications"],
    authenticated: true,
    responses: {
      200: {
        description: "Push-notification configuration",
        body: {
          type: "object",
          additionalProperties: false,
          required: ["webPush"],
          properties: {
            webPush: {
              type: "object",
              additionalProperties: false,
              required: ["available"],
              properties: {
                available: { type: "boolean" },
                publicKey: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
      401: { description: "Authentication required" },
    },
  }),
  counts: defineRouteContract({
    method: "get",
    path: "/api/notifications/counts",
    operationId: "notifications.getCounts",
    summary: "Get notification counts for the authenticated principal",
    tags: ["Notifications"],
    authenticated: true,
    responses: {
      200: {
        description: "Notification counts",
        body: {
          type: "object",
          additionalProperties: false,
          required: ["unread"],
          properties: { unread: { type: "integer", minimum: 0 } },
        },
      },
      401: { description: "Authentication required" },
    },
  }),
  readAll: defineRouteContract({
    method: "post",
    path: "/api/notifications/read-all",
    operationId: "notifications.markAllRead",
    summary: "Mark all notifications as read for the authenticated principal",
    tags: ["Notifications"],
    authenticated: true,
    responses: {
      200: {
        description: "All visible notifications marked read",
        body: {
          type: "object",
          additionalProperties: false,
          required: ["updated", "readAt"],
          properties: {
            updated: { type: "integer", minimum: 0 },
            readAt: { type: "string", format: "date-time" },
          },
        },
      },
      401: { description: "Authentication required" },
    },
  }),
  dismiss: defineRouteContract({
    method: "post",
    path: "/api/notifications/:id/dismiss",
    operationId: "notifications.dismiss",
    summary: "Dismiss a notification for the authenticated principal",
    tags: ["Notifications"],
    authenticated: true,
    request: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            pattern: uuidExpression.source,
          },
        },
      },
    },
    responses: {
      204: { description: "Notification dismissed" },
      400: { description: "Invalid notification ID" },
      401: { description: "Authentication required" },
      404: { description: "Notification not found", body: errorSchema },
    },
  }),
} as const;
function integer(value: unknown, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
    throw new TypeError("limit must be between 1 and 100");
  return parsed;
}
function uuid(value: unknown) {
  const normalized = String(value ?? "");
  if (!uuidExpression.test(normalized)) throw new TypeError("Invalid UUID");
  return normalized;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("JSON object body required");
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${name} is required`);
  return value.trim();
}
function optional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function boolean(value: unknown) {
  if (value === undefined) return false;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  throw new TypeError("Boolean query value required");
}
function platform(value: unknown) {
  const result = text(value, "platform");
  if (!["web", "android", "ios"].includes(result))
    throw new TypeError("Invalid push platform");
  return result as "web" | "android" | "ios";
}
function ifMatch(value: unknown) {
  if (typeof value !== "string")
    throw new TypeError("If-Match header is required");
  const match = /^(?:W\/)?\"?(\d+)\"?$/.exec(value.trim());
  if (!match)
    throw new TypeError("If-Match must contain a numeric preference version");
  return Number(match[1]);
}
function preferenceInput(
  value: unknown,
): Omit<NotificationPreference, "tenantId" | "principalId" | "version"> {
  const body = record(value);
  const eventCode = text(body["eventCode"], "eventCode");
  if (!/^[a-z][a-z0-9_.-]+$/.test(eventCode))
    throw new TypeError("Invalid eventCode");
  if (!Array.isArray(body["channels"]))
    throw new TypeError("channels must be an array");
  const channels = body["channels"].map(channel);
  return { eventCode, channels };
}
function channel(value: unknown) {
  const result = text(value, "channel");
  if (!["in_app", "email", "sms", "push", "whatsapp"].includes(result))
    throw new TypeError("Invalid notification channel");
  return result as "in_app" | "email" | "sms" | "push" | "whatsapp";
}
