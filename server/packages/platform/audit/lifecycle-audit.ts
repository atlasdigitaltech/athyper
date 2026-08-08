/**
 * Lifecycle audit writer — Phase C
 *
 * Replaces createDbAuditWriter() from server/src/audit.ts for staging/production.
 * Writes boot and shutdown events to audit.audit_log via audit.append_platform_event()
 * so they participate in the contract system and the hash-chain integrity chain.
 *
 * The writer is intentionally fire-and-forget: lifecycle events must never block
 * or crash the server. All errors are swallowed.
 *
 * Usage in bootstrap.ts:
 *   import { createLifecycleAuditWriter } from "@athyper/svc-audit";
 *
 *   // Replace:
 *   audit = createDbAuditWriter(_db);
 *   // With:
 *   audit = createLifecycleAuditWriter(_db, { plane: config.env });
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Well-known platform scope UUID. Used as scope_id for platform-level lifecycle
 * events that have no tenant context. append_platform_event() requires a
 * non-null scope_id; this sentinel identifies the platform itself as the scope.
 */
const PLATFORM_SCOPE_ID = "00000000-0000-0000-0001-000000000000";

/**
 * Maps the legacy AuditEvent.type strings (from server/src/audit.ts) to the
 * canonical platform_system_event codes that match the contract pattern:
 *   ^(system|platform)\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$
 */
const EVENT_CODE_MAP: Record<string, string> = {
  "server.boot.start":        "system.server.boot",
  "server.boot.success":      "system.server.boot",
  "server.shutdown":          "system.server.shutdown",
  "worker.start":             "system.worker.start",
  "worker.stop":              "system.worker.stop",
  "scheduler.start":          "system.scheduler.start",
  "db.migration.complete":    "system.db.migration",
};

const FALLBACK_EVENT_CODE = "system.server.boot";

// ── Writer interface (matches server/src/audit.ts AuditWriter) ────────────────

export interface LifecycleAuditEvent {
  type:       string;
  level:      "info" | "warn" | "error";
  actor:      { kind: string; id?: string };
  requestId?: string;
  message?:   string;
  meta?:      Record<string, unknown>;
}

export interface LifecycleAuditWriter {
  write(event: LifecycleAuditEvent): void | Promise<void>;
  flush?(): Promise<void>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface LifecycleAuditWriterOptions {
  /**
   * Runtime plane identifier surfaced in the context payload.
   * Matches app.database_plane (athyper | neon | mesh).
   */
  plane?: string;
}

export function createLifecycleAuditWriter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  opts: LifecycleAuditWriterOptions = {},
): LifecycleAuditWriter {
  return {
    async write(event: LifecycleAuditEvent): Promise<void> {
      const eventCode = EVENT_CODE_MAP[event.type] ?? FALLBACK_EVENT_CODE;
      const severity  = event.level === "error" ? "warning" : "info";
      const context   = JSON.stringify({
        ...event.meta,
        ...(event.message ? { message: event.message } : {}),
        ...(opts.plane ? { plane: opts.plane } : {}),
        original_type: event.type,
      });

      try {
        await sql`SELECT audit.append_platform_event(
          ${eventCode},
          ${"execute"}::audit.operation_d,
          ${"system.api_server"},
          ${PLATFORM_SCOPE_ID}::uuid,
          ${event.actor.id ?? null}::uuid,
          ${"success"}::audit.outcome_d,
          ${severity}::audit.event_severity_d,
          ${context}::jsonb,
          ${null}::uuid,
          ${event.requestId ?? null}
        )`.execute(db);
      } catch {
        // Never let audit writes crash or block the server lifecycle.
      }
    },
  };
}
