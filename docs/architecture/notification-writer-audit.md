# Notification message writer audit

Expand-rollout audit for `event.notification_message.plane_key`.

- `server/packages/services/platform/routes/notification.route.ts`
  derives `plane_key` only from relay-stamped `X-Plane`.
- `server/packages/services/platform/notification-orchestrator.ts`
  accepts a typed internal plane and explicitly persists it; legacy internal
  callers temporarily default to Neon.
- `server/packages/services/jobs/handlers/wf-outbox.handler.ts`
  explicitly persists Neon until workflow outbox provenance is typed.
- `server/packages/services/jobs/handlers/p2p-notification-outbox.handler.ts`
  explicitly persists Neon until P2P outbox provenance is typed.
- `server/packages/services/business/lifecycle/notification-dispatch.service.ts`
  explicitly persists Neon until lifecycle hook context carries a plane.
- `server/packages/services/jobs/workers/lifecycle-timer.worker.ts`
  explicitly persists Neon for background timer notifications.
- `server/packages/services/jobs/workers/notification.worker.ts`
  carries the source message plane into digest messages and groups digests by
  plane.

The temporary database default remains for mixed-version deployment safety.
Remove it only in a later contract release after telemetry confirms that no
writer relies on it.
