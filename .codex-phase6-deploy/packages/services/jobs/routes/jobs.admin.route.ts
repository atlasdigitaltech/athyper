/**
 * Jobs Admin API Routes — Phases 1 + 3 Operator Control Plane
 *
 * Extended admin surface beyond the basic queue stats in jobs.route.ts.
 * Requires db access for DLQ, run history, cron schedules, and orchestration runs.
 *
 * DLQ:
 *   GET    /api/jobs/admin/dlq                             — unified DLQ view (all 3 tables)
 *   POST   /api/jobs/admin/dlq/:table/:id/retry           — retry one DLQ record
 *   DELETE /api/jobs/admin/dlq/:table/:id                 — discard one DLQ record
 * Job detail:
 *   GET    /api/jobs/admin/queues/:queue/jobs/:jobId      — BullMQ job detail
 * History:
 *   GET    /api/jobs/admin/history                        — job run history (log.job_log)
 * Outbox:
 *   GET    /api/jobs/admin/outbox/dead                    — outbox dead_letter entries
 *   POST   /api/jobs/admin/outbox/:id/replay              — replay dead_letter outbox event
 * Schedules:
 *   GET    /api/jobs/admin/schedules                      — list cron schedules
 *   POST   /api/jobs/admin/schedules                      — create cron schedule
 *   PATCH  /api/jobs/admin/schedules/:id                  — update cron schedule
 *   DELETE /api/jobs/admin/schedules/:id                  — delete cron schedule
 * Orchestrations (Phase 3):
 *   GET    /api/jobs/admin/orchestrations                 — list DAG runs (paged)
 *   GET    /api/jobs/admin/orchestrations/:runId          — run detail + nodes
 *   POST   /api/jobs/admin/orchestrations/:runId/cancel   — cancel a running run
 *   POST   /api/jobs/admin/orchestrations/:runId/nodes/:nodeCode/retry — reset failed node
 *
 * Auth: Bearer token + X-Org tenant resolution.
 */

import { sql } from "kysely";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";

import { verifyBearer } from "@athyper/svc-shared";
import { createWorkflowRecoveryService } from "@athyper/svc-workflow";
import { listDlq, retryFromDlq, DLQ_TABLE } from "../dlq.middleware.js";
import type { JobsQueues } from "../jobs.service.js";
import { SYSTEM_ACTOR_ID, type JobLogger } from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Table allowlist (safe guard against injection via URL param) ───────────────
const ALLOWED_DLQ_TABLES = new Set([
  "log.audit_dlq",
  "log.notification_dlq",
  "log.render_dlq",
]);

const TABLE_ALIAS: Record<string, string> = {
  audit:        DLQ_TABLE.AUDIT,
  notification: DLQ_TABLE.NOTIFICATION,
  render:       DLQ_TABLE.RENDER,
};

function resolveTable(alias: string): string | undefined {
  // Accept both "audit" shorthand and "log.audit_dlq" full name
  return TABLE_ALIAS[alias] ?? (ALLOWED_DLQ_TABLES.has(alias) ? alias : undefined);
}

// ── Queue resolver (matches jobs.route.ts) ────────────────────────────────────

const QUEUE_ALIAS: Record<string, keyof JobsQueues> = {
  "lifecycle-timers":   "lifecycleTimers",
  "lifecycleTimers":    "lifecycleTimers",
  "notifications":      "notifications",
  "domain-outbox":      "domainOutbox",
  "domainOutbox":       "domainOutbox",
  "sla-check":          "slaCheck",
  "slaCheck":           "slaCheck",
  "import":             "import",
  "jobs-import":        "import",
};

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface JobsAdminRouteDeps {
  queues:  JobsQueues;
  db:      AnyDb;
  auth:    { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: JobLogger;
}

// ── Auth helper (shared pattern from operator.routes.ts) ──────────────────────

async function resolveTenantFromHeader(
  db:   AnyDb,
  xOrg: string | undefined,
): Promise<string | null> {
  if (!xOrg) return null;
  const row = await db
    .selectFrom("master.tenant as t")
    .select("t.id")
    .where("t.code", "=", xOrg)
    .where("t.status", "=", "active")
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function registerJobsAdminRoutes(router: Router, deps: JobsAdminRouteDeps): Router {
  const { queues, db, auth, logger } = deps;

  // ══════════════════════════════════════════════════════════════════════════
  // DLQ — Dead Letter Queue management
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/jobs/admin/dlq — unified view across all DLQ tables ──────────
  router.get("/jobs/admin/dlq", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;

      const table = (req.query["table"] as string) ?? "all";
      const limit  = Math.min(parseInt((req.query["limit"] as string) ?? "50", 10), 200);
      const offset = parseInt((req.query["offset"] as string) ?? "0", 10);
      const queueName = req.query["queue"] as string | undefined;
      const unretriedOnly = req.query["unretried"] === "true";

      const targets = table === "all"
        ? Object.values(DLQ_TABLE)
        : [resolveTable(table)].filter(Boolean) as string[];

      if (targets.length === 0) {
        res.status(400).json({ error: "INVALID_TABLE", message: "Unknown DLQ table" });
        return;
      }

      // For cross-tenant (no X-Org), query a placeholder tenant that won't match;
      // cross-tenant admin view requires explicit tenantId param (Phase 5 RBAC).
      const effectiveTenantId = tenantId ?? (req.query["tenant_id"] as string | undefined) ?? "";

      const results = await Promise.all(
        targets.map(async (tbl) => {
          if (!effectiveTenantId) return { table: tbl, items: [], total: 0 };
          const r = await listDlq(db, {
            table:      tbl,
            tenantId:   effectiveTenantId,
            queueName,
            limit,
            offset,
            unretried:  unretriedOnly,
          });
          return { table: tbl, ...r };
        }),
      );

      res.json({ dlq: results, ts: Date.now() });
    } catch (err) {
      logger?.error("jobs_admin_dlq_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/admin/dlq/:table/:id/retry ─────────────────────────────
  router.post("/jobs/admin/dlq/:table/:id/retry", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const tableAlias = req.params["table"] as string;
      const table = resolveTable(tableAlias);
      if (!table) {
        res.status(400).json({ error: "INVALID_TABLE", message: "Unknown DLQ table. Use: audit, notification, render" });
        return;
      }

      const dlqId = req.params["id"] as string;

      // Determine which queue to re-enqueue to from the DLQ record's queue_name
      const row = await db
        .selectFrom(table as never)
        .select(["queue_name" as never, "job_name" as never])
        .where("id" as never, "=", dlqId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as { queue_name: string; job_name: string } | undefined;

      if (!row) {
        res.status(404).json({ error: "DLQ_RECORD_NOT_FOUND" });
        return;
      }

      const queueKey = QUEUE_ALIAS[row.queue_name.replace("jobs-", "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queue = queueKey ? (queues[queueKey] as any) : null;

      if (!queue) {
        res.status(422).json({ error: "QUEUE_NOT_FOUND", message: `Cannot map queue '${row.queue_name}'` });
        return;
      }

      const newJobId = await retryFromDlq(db, queue, table, dlqId, tenantId);
      if (!newJobId) {
        res.status(409).json({ error: "ALREADY_RETRIED", message: "This DLQ record was already retried" });
        return;
      }

      logger?.info("jobs_admin_dlq_retried", { table, dlqId, newJobId });
      res.json({ ok: true, dlq_id: dlqId, new_job_id: newJobId });
    } catch (err) {
      logger?.error("jobs_admin_dlq_retry_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/jobs/admin/dlq/:table/:id — discard a DLQ record ──────────
  router.delete("/jobs/admin/dlq/:table/:id", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const table = resolveTable(req.params["table"] as string);
      if (!table) {
        res.status(400).json({ error: "INVALID_TABLE" });
        return;
      }

      const dlqId = req.params["id"] as string;
      const deleted = await db
        .deleteFrom(table as never)
        .where("id" as never, "=", dlqId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!deleted) {
        res.status(404).json({ error: "DLQ_RECORD_NOT_FOUND" });
        return;
      }

      logger?.info("jobs_admin_dlq_discarded", { table, dlqId });
      res.status(204).end();
    } catch (err) {
      logger?.error("jobs_admin_dlq_discard_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // Job detail — BullMQ job by ID across queues
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/jobs/admin/queues/:queue/jobs/:jobId ─────────────────────────
  router.get("/jobs/admin/queues/:queue/jobs/:jobId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const queueKey = QUEUE_ALIAS[req.params["queue"] as string];
      const queue = queueKey ? queues[queueKey] : undefined;
      if (!queue) {
        res.status(404).json({ error: "QUEUE_NOT_FOUND" });
        return;
      }

      const jobId = req.params["jobId"] as string;
      const job = await queue.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: "JOB_NOT_FOUND" });
        return;
      }

      const [state, logs] = await Promise.all([
        job.getState(),
        Promise.resolve([] as string[]),
      ]);

      res.json({
        id:           job.id,
        name:         job.name,
        queue:        queue.name,
        data:         job.data,
        opts:         job.opts,
        state,
        failedReason: job.failedReason,
        stacktrace:   job.stacktrace,
        attemptsMade: job.attemptsMade,
        timestamp:    job.timestamp,
        processedOn:  job.processedOn,
        finishedOn:   job.finishedOn,
        returnvalue:  job.returnvalue,
        logs,
      });
    } catch (err) {
      logger?.error("jobs_admin_job_detail_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // Run history — log.job_log
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/jobs/admin/history ───────────────────────────────────────────
  router.get("/jobs/admin/history", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const limit  = Math.min(parseInt((req.query["limit"] as string) ?? "50", 10), 200);
      const offset = parseInt((req.query["offset"] as string) ?? "0", 10);
      const jobType = req.query["job_type"] as string | undefined;
      const status  = req.query["status"] as string | undefined;
      const since   = req.query["since"] as string | undefined; // ISO timestamp

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db
        .selectFrom("log.job_log as jl")
        .select([
          "jl.id", "jl.job_type", "jl.flow_id", "jl.run_id",
          "jl.step_index", "jl.step_type", "jl.status",
          "jl.duration_ms", "jl.attempt_no",
          "jl.started_at", "jl.completed_at",
          "jl.error", "jl.purge_after",
        ])
        .where("jl.tenant_id", "=", tenantId);

      if (jobType) q = q.where("jl.job_type", "=", jobType);
      if (status)  q = q.where("jl.status", "=", status);
      if (since)   q = q.where("jl.started_at", ">=", new Date(since));

      const [items, countRow] = await Promise.all([
        q.orderBy("jl.started_at", "desc").limit(limit).offset(offset).execute(),
        db
          .selectFrom("log.job_log as jl")
          .select(sql<string>`COUNT(*)`.as("cnt"))
          .where("jl.tenant_id", "=", tenantId)
          .$if(!!jobType, (qb) => qb.where("jl.job_type", "=", jobType!))
          .$if(!!status,  (qb) => qb.where("jl.status", "=", status!))
          .$if(!!since,   (qb) => qb.where("jl.started_at", ">=", new Date(since!)))
          .executeTakeFirst() as Promise<{ cnt: string } | undefined>,
      ]);

      res.json({
        items,
        total: parseInt(String(countRow?.cnt ?? "0"), 10),
        limit, offset,
      });
    } catch (err) {
      logger?.error("jobs_admin_history_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // Outbox dead-letter (event.outbox WHERE status = 'dead_letter')
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/jobs/admin/outbox/dead ───────────────────────────────────────
  router.get("/jobs/admin/outbox/dead", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const limit  = Math.min(parseInt((req.query["limit"] as string) ?? "50", 10), 200);
      const offset = parseInt((req.query["offset"] as string) ?? "0", 10);
      const topic  = req.query["topic"] as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db
        .selectFrom("event.outbox as ob")
        .select([
          "ob.id", "ob.topic", "ob.event_type", "ob.event_key",
          "ob.entity_type", "ob.entity_id",
          "ob.attempts", "ob.max_attempts", "ob.last_error",
          "ob.correlation_id", "ob.created_at", "ob.processed_at",
        ])
        .where("ob.tenant_id", "=", tenantId)
        .where("ob.status", "=", "dead_letter");

      if (topic) q = q.where("ob.topic", "=", topic);

      const [items, countRow] = await Promise.all([
        q.orderBy("ob.created_at", "desc").limit(limit).offset(offset).execute(),
        db
          .selectFrom("event.outbox as ob")
          .select(sql<string>`COUNT(*)`.as("cnt"))
          .where("ob.tenant_id", "=", tenantId)
          .where("ob.status", "=", "dead_letter")
          .$if(!!topic, (qb) => qb.where("ob.topic", "=", topic!))
          .executeTakeFirst() as Promise<{ cnt: string } | undefined>,
      ]);

      res.json({ items, total: parseInt(String(countRow?.cnt ?? "0"), 10), limit, offset });
    } catch (err) {
      logger?.error("jobs_admin_outbox_dead_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/admin/outbox/:id/replay — replay dead_letter event ─────
  router.post("/jobs/admin/outbox/:id/replay", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const outboxId = req.params["id"] as string;

      const original = await db
        .selectFrom("event.outbox as ob")
        .selectAll("ob")
        .where("ob.id", "=", outboxId)
        .where("ob.tenant_id", "=", tenantId)
        .where("ob.status", "=", "dead_letter")
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!original) {
        res.status(404).json({ error: "OUTBOX_EVENT_NOT_FOUND" });
        return;
      }

      const webhookChildren = await sql<{ total: string }>`
        SELECT COUNT(*)::text AS total
        FROM event.notification_delivery
        WHERE tenant_id = ${tenantId}::uuid
          AND outbox_id = ${outboxId}::uuid
          AND channel = 'webhook'
      `.execute(db);

      if (Number(webhookChildren.rows[0]?.total ?? "0") > 0) {
        await db.transaction().execute(async (tx) => {
          await sql`
            UPDATE event.notification_delivery
            SET    status         = 'pending',
                   attempt_count  = 0,
                   last_error     = NULL,
                   error_category = NULL,
                   next_retry_at  = NULL,
                   locked_until   = NULL,
                   bounced_at     = NULL,
                   updated_at     = now(),
                   updated_by     = ${SYSTEM_ACTOR_ID}::uuid
            WHERE  tenant_id = ${tenantId}::uuid
              AND  outbox_id = ${outboxId}::uuid
              AND  channel = 'webhook'
              AND  status IN ('failed', 'bounced')
          `.execute(tx);

          await sql`
            UPDATE event.outbox
            SET    status       = 'pending',
                   attempts     = 0,
                   available_at = now(),
                   locked_at    = NULL,
                   locked_by    = NULL,
                   locked_until = NULL,
                   last_error   = NULL,
                   processed_at = NULL
            WHERE  id = ${outboxId}::uuid
              AND  tenant_id = ${tenantId}::uuid
          `.execute(tx);
        });

        logger?.info("jobs_admin_webhook_outbox_replayed", { outboxId });
        res.json({ ok: true, original_id: outboxId, replayed_id: outboxId, mode: "webhook_partial" });
        return;
      }

      // Create a new outbox event as a replay — reset status to 'pending'
      const replayed = await db
        .insertInto("event.outbox")
        .values({
          tenant_id:      tenantId,
          topic:          original["topic"],
          event_type:     original["event_type"],
          event_key:      original["event_key"],
          entity_type:    original["entity_type"],
          entity_id:      original["entity_id"],
          aggregate_id:   original["aggregate_id"],
          aggregate_type: original["aggregate_type"],
          actor_id:       original["actor_id"],
          source:         `replay:${String(original["id"])}`,
          correlation_id: original["correlation_id"],
          payload:        original["payload"],
          status:         "pending",
          attempts:       0,
          max_attempts:   (original["max_attempts"] as number) ?? 5,
          available_at:   sql`now()`,
          created_by:     original["created_by"],
        })
        .returning(["id"])
        .executeTakeFirstOrThrow() as { id: string };

      logger?.info("jobs_admin_outbox_replayed", { original: outboxId, replayed: replayed.id });
      res.status(201).json({ ok: true, original_id: outboxId, replayed_id: replayed.id });
    } catch (err) {
      logger?.error("jobs_admin_outbox_replay_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // Cron Schedules — control.cron_schedule CRUD
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/jobs/admin/schedules ─────────────────────────────────────────
  // -- POST /api/jobs/admin/workflow/requests/:id/recover - recreate missing work items
  router.post("/jobs/admin/workflow/requests/:id/recover", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const requestId = req.params["id"] as string;
      const recovered = await createWorkflowRecoveryService(db).reEnqueueWorkItems(requestId, tenantId);
      if (!recovered) {
        res.status(409).json({
          error: "WORKFLOW_REQUEST_NOT_RECOVERED",
          message: "Request is not pending, has no active stage, or has no recoverable template snapshot",
        });
        return;
      }

      logger?.info("jobs_admin_workflow_request_recovered", { requestId, tenantId });
      res.json({ ok: true, request_id: requestId, recovered: true });
    } catch (err) {
      logger?.error("jobs_admin_workflow_recover_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.get("/jobs/admin/schedules", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      // Return platform-global + tenant-scoped schedules
      const rows = await db
        .selectFrom("control.cron_schedule as cs")
        .selectAll("cs")
        .where((eb) =>
          eb.or([
            eb("cs.tenant_id", "is", null),
            eb("cs.tenant_id", "=", tenantId),
          ]),
        )
        .orderBy("cs.code")
        .execute();

      res.json({ items: rows });
    } catch (err) {
      logger?.error("jobs_admin_schedules_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/admin/schedules — create cron schedule ─────────────────
  router.post("/jobs/admin/schedules", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      interface ScheduleBody {
        code?: string;
        name?: string;
        description?: string;
        handler_type?: string;
        cron_expression?: string;
        timezone?: string;
        target_queue?: string;
        payload_template?: Record<string, unknown>;
        priority?: number;
        max_retries?: number;
        concurrency_limit?: number | null;
        effective_from?: string | null;
        effective_until?: string | null;
        lock_key?: string | null;
        is_platform_global?: boolean;
      }
      const body = req.body as ScheduleBody;

      const required = ["code", "name", "handler_type", "cron_expression", "target_queue"] as const;
      for (const field of required) {
        if (!body[field]) {
          res.status(400).json({ error: "MISSING_FIELD", message: `'${field}' is required` });
          return;
        }
      }
      // Capture validated required fields — TypeScript can't narrow optional
      // properties after a loop check, so we assert here after the runtime guard.
      const code            = body.code as string;
      const name            = body.name as string;
      const handler_type    = body.handler_type as string;
      const cron_expression = body.cron_expression as string;
      const target_queue    = body.target_queue as string;

      const schedule = await db
        .insertInto("control.cron_schedule")
        .values({
          tenant_id:        body.is_platform_global ? null : tenantId,
          code:             code.trim(),
          name:             name.trim(),
          description:      body.description?.trim() ?? null,
          handler_type:     handler_type.trim(),
          cron_expression:  cron_expression.trim(),
          timezone:         (body.timezone ?? "UTC").trim(),
          target_queue:     target_queue.trim(),
          payload_template: JSON.stringify(body.payload_template ?? {}),
          priority:         body.priority ?? 0,
          max_retries:      body.max_retries ?? 3,
          concurrency_limit: body.concurrency_limit ?? null,
          effective_from:   body.effective_from ? new Date(body.effective_from) : null,
          effective_until:  body.effective_until ? new Date(body.effective_until) : null,
          lock_key:         body.lock_key ?? null,
          is_enabled:       true,
          created_by:       tenantId, // use tenantId as placeholder; Phase 5: real principalId
        })
        .returning(["id", "code", "created_at"])
        .executeTakeFirstOrThrow() as { id: string; code: string; created_at: unknown };

      logger?.info("jobs_admin_schedule_created", { id: schedule.id, code: schedule.code });
      res.status(201).json({ id: schedule.id, code: schedule.code, created_at: schedule.created_at });
    } catch (err) {
      logger?.error("jobs_admin_schedule_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── PATCH /api/jobs/admin/schedules/:id — update cron schedule ────────────
  router.patch("/jobs/admin/schedules/:id", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const scheduleId = req.params["id"] as string;

      // Verify record exists and belongs to this tenant (or is global)
      const existing = await db
        .selectFrom("control.cron_schedule as cs")
        .select(["cs.id", "cs.tenant_id"])
        .where("cs.id", "=", scheduleId)
        .where((eb) =>
          eb.or([
            eb("cs.tenant_id", "is", null),
            eb("cs.tenant_id", "=", tenantId),
          ]),
        )
        .executeTakeFirst() as { id: string; tenant_id: string | null } | undefined;

      if (!existing) {
        res.status(404).json({ error: "SCHEDULE_NOT_FOUND" });
        return;
      }

      interface PatchBody {
        name?: string;
        description?: string;
        cron_expression?: string;
        timezone?: string;
        payload_template?: Record<string, unknown>;
        priority?: number;
        max_retries?: number;
        concurrency_limit?: number | null;
        effective_from?: string | null;
        effective_until?: string | null;
        lock_key?: string | null;
        is_enabled?: boolean;
      }
      const body = req.body as PatchBody;

      // Build update set — only include fields present in body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_at: sql`now()`, updated_by: tenantId };
      if (body.name             !== undefined) updates["name"]              = body.name.trim();
      if (body.description      !== undefined) updates["description"]       = body.description?.trim() ?? null;
      if (body.cron_expression  !== undefined) updates["cron_expression"]   = body.cron_expression.trim();
      if (body.timezone         !== undefined) updates["timezone"]          = body.timezone.trim();
      if (body.payload_template !== undefined) updates["payload_template"]  = JSON.stringify(body.payload_template);
      if (body.priority         !== undefined) updates["priority"]          = body.priority;
      if (body.max_retries      !== undefined) updates["max_retries"]       = body.max_retries;
      if ("concurrency_limit" in body)         updates["concurrency_limit"] = body.concurrency_limit ?? null;
      if ("effective_from"    in body)         updates["effective_from"]    = body.effective_from ? new Date(body.effective_from) : null;
      if ("effective_until"   in body)         updates["effective_until"]   = body.effective_until ? new Date(body.effective_until) : null;
      if ("lock_key"          in body)         updates["lock_key"]          = body.lock_key ?? null;
      if (body.is_enabled       !== undefined) updates["is_enabled"]        = body.is_enabled;

      await db
        .updateTable("control.cron_schedule")
        .set(updates)
        .where("id", "=", scheduleId)
        .execute();

      logger?.info("jobs_admin_schedule_updated", { id: scheduleId });
      res.json({ ok: true, id: scheduleId });
    } catch (err) {
      logger?.error("jobs_admin_schedule_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/jobs/admin/schedules/:id — remove cron schedule ───────────
  router.delete("/jobs/admin/schedules/:id", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const scheduleId = req.params["id"] as string;

      const deleted = await db
        .deleteFrom("control.cron_schedule")
        .where("id", "=", scheduleId)
        .where((eb) =>
          eb.or([
            eb("tenant_id", "is", null),
            eb("tenant_id", "=", tenantId),
          ]),
        )
        .returning(["id"])
        .executeTakeFirst() as { id: string } | undefined;

      if (!deleted) {
        res.status(404).json({ error: "SCHEDULE_NOT_FOUND" });
        return;
      }

      logger?.info("jobs_admin_schedule_deleted", { id: scheduleId });
      res.status(204).end();
    } catch (err) {
      logger?.error("jobs_admin_schedule_delete_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // Orchestration runs — event.orchestration_run / event.orchestration_node
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/jobs/admin/orchestrations — list recent runs ─────────────────
  router.get("/jobs/admin/orchestrations", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const limit   = Math.min(parseInt((req.query["limit"] as string) ?? "50", 10), 200);
      const offset  = parseInt((req.query["offset"] as string) ?? "0", 10);
      const dagId   = req.query["dag_id"] as string | undefined;
      const status  = req.query["status"] as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db
        .selectFrom("event.orchestration_run as r")
        .select([
          "r.id", "r.dag_id", "r.trigger_type", "r.trigger_ref",
          "r.status", "r.total_nodes", "r.completed_nodes",
          "r.failed_nodes", "r.skipped_nodes",
          "r.started_at", "r.completed_at", "r.correlation_id",
        ])
        .where("r.tenant_id", "=", tenantId);

      if (dagId)  q = q.where("r.dag_id", "=", dagId);
      if (status) q = q.where("r.status", "=", status);

      const [items, countRow] = await Promise.all([
        q.orderBy("r.started_at", "desc").limit(limit).offset(offset).execute(),
        db
          .selectFrom("event.orchestration_run as r")
          .select(sql<string>`COUNT(*)`.as("cnt"))
          .where("r.tenant_id", "=", tenantId)
          .$if(!!dagId,  (qb) => qb.where("r.dag_id", "=", dagId!))
          .$if(!!status, (qb) => qb.where("r.status", "=", status!))
          .executeTakeFirst() as Promise<{ cnt: string } | undefined>,
      ]);

      res.json({ items, total: parseInt(String(countRow?.cnt ?? "0"), 10), limit, offset });
    } catch (err) {
      logger?.error("jobs_admin_orch_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/jobs/admin/orchestrations/:runId — run detail with nodes ─────
  router.get("/jobs/admin/orchestrations/:runId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const runId = req.params["runId"] as string;

      const [run, nodes] = await Promise.all([
        db
          .selectFrom("event.orchestration_run as r")
          .selectAll("r")
          .where("r.id", "=", runId)
          .where("r.tenant_id", "=", tenantId)
          .executeTakeFirst(),
        db
          .selectFrom("event.orchestration_node as n")
          .select([
            "n.id", "n.node_code", "n.node_type", "n.depends_on",
            "n.status", "n.job_id", "n.error",
            "n.retry_count", "n.started_at", "n.completed_at", "n.duration_ms",
          ])
          .where("n.run_id", "=", runId)
          .where("n.tenant_id", "=", tenantId)
          .orderBy("n.started_at", "asc")
          .execute(),
      ]);

      if (!run) {
        res.status(404).json({ error: "RUN_NOT_FOUND" });
        return;
      }

      res.json({ run, nodes });
    } catch (err) {
      logger?.error("jobs_admin_orch_detail_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/admin/orchestrations/:runId/cancel ─────────────────────
  router.post("/jobs/admin/orchestrations/:runId/cancel", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const runId = req.params["runId"] as string;
      const now   = new Date().toISOString();

      // Only cancel runs that are still running
      const run = await db
        .selectFrom("event.orchestration_run as r")
        .select(["r.id", "r.status"])
        .where("r.id", "=", runId)
        .where("r.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string; status: string } | undefined;

      if (!run) {
        res.status(404).json({ error: "RUN_NOT_FOUND" });
        return;
      }
      if (run.status !== "running") {
        res.status(409).json({ error: "RUN_NOT_RUNNING", message: `Run is already '${run.status}'` });
        return;
      }

      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable("event.orchestration_node" as never)
          .set({ status: "canceled" as never, completed_at: now as never } as never)
          .where("run_id" as never, "=", runId as never)
          .where("tenant_id" as never, "=", tenantId as never)
          .where("status" as never, "in", ["pending", "running"] as never)
          .execute();

        await tx
          .updateTable("event.orchestration_run" as never)
          .set({ status: "canceled" as never, completed_at: now as never } as never)
          .where("id" as never, "=", runId as never)
          .execute();
      });

      logger?.info("jobs_admin_orch_canceled", { runId, tenantId });
      res.json({ ok: true, runId });
    } catch (err) {
      logger?.error("jobs_admin_orch_cancel_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/admin/orchestrations/:runId/nodes/:nodeCode/retry ──────
  // Resets a failed node back to pending so the recovery scanner can re-enqueue it.
  router.post("/jobs/admin/orchestrations/:runId/nodes/:nodeCode/retry", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = xOrg ? await resolveTenantFromHeader(db, xOrg) : null;
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header is required" });
        return;
      }

      const runId    = req.params["runId"] as string;
      const nodeCode = req.params["nodeCode"] as string;

      const node = await db
        .selectFrom("event.orchestration_node as n")
        .select(["n.id", "n.status", "n.retry_count"])
        .where("n.run_id", "=", runId)
        .where("n.tenant_id", "=", tenantId)
        .where("n.node_code", "=", nodeCode)
        .executeTakeFirst() as { id: string; status: string; retry_count: number } | undefined;

      if (!node) {
        res.status(404).json({ error: "NODE_NOT_FOUND" });
        return;
      }
      if (node.status !== "failed") {
        res.status(409).json({ error: "NODE_NOT_FAILED", message: `Node status is '${node.status}', only 'failed' nodes can be retried` });
        return;
      }

      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable("event.orchestration_node" as never)
          .set({
            status:       "pending" as never,
            error:        null as never,
            job_id:       null as never,
            completed_at: null as never,
            retry_count:  (node.retry_count + 1) as never,
          } as never)
          .where("id" as never, "=", node.id as never)
          .execute();

        // Reopen the run if it was finalised as failed
        await tx
          .updateTable("event.orchestration_run" as never)
          .set({
            status:       "running" as never,
            completed_at: null as never,
            failed_nodes: sql`GREATEST(0, failed_nodes - 1)` as never,
          } as never)
          .where("id" as never, "=", runId as never)
          .where("status" as never, "=", "failed" as never)
          .execute();
      });

      logger?.info("jobs_admin_orch_node_retry", { runId, nodeCode, tenantId });
      res.json({ ok: true, runId, nodeCode, message: "Node reset to pending — will be re-enqueued on next recovery scan" });
    } catch (err) {
      logger?.error("jobs_admin_orch_node_retry_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
