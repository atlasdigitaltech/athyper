// {GET|POST|PUT|PATCH|DELETE} /api/notifications/[...path] — BFF relay to runtime /api/notifications/*. Push (VAPID), SMS, WhatsApp, preferences, SSE stream.
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("notifications");
