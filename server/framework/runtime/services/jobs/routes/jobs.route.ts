/**
 * Jobs Admin API Routes
 *
 * Exposes queue health and management endpoints consumed by the admin UI
 * (finance-admin → Platform tab → Automation).
 *
 * GET  /api/jobs                          — all queues: name + job counts
 * GET  /api/jobs/:queue                   — single queue job counts
 * GET  /api/jobs/:queue/failed            — list failed jobs (paged)
 * POST /api/jobs/:queue/failed/:jobId/retry — retry one failed job
 * POST /api/jobs/:queue/pause             — pause a queue
 * POST /api/jobs/:queue/resume            — resume a paused queue
 * DELETE /api/jobs/:queue/failed          — clean all failed jobs from queue
 *
 * All routes require a valid Bearer token (finance-admin scope enforced by
 * the BFF; the API just validates the token is present and authentic).
 */

import type { RequestHandler, Router } from "express";
import type { Queue } from "bullmq";
import { verifyBearer } from "@athyper/svc-shared";
import type { JobsQueues } from "../jobs.service.js";
import type { JobLogger } from "../jobs.types.js";

interface JobsRouteDeps {
  queues: JobsQueues;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: JobLogger;
}

const QUEUE_KEYS = ["lifecycleTimers", "notifications", "domainOutbox", "slaCheck"] as const;
type QueueKey = (typeof QUEUE_KEYS)[number];

function resolveQueue(queues: JobsQueues, name: string): Queue | undefined {
  // Accept both the BullMQ internal name (e.g. 'jobs:lifecycle-timers') and
  // the short alias (e.g. 'lifecycle-timers') for URL ergonomics.
  const aliasMap: Record<string, QueueKey> = {
    "lifecycle-timers":   "lifecycleTimers",
    "lifecycleTimers":    "lifecycleTimers",
    "notifications":      "notifications",
    "domain-outbox":      "domainOutbox",
    "domainOutbox":       "domainOutbox",
    "sla-check":          "slaCheck",
    "slaCheck":           "slaCheck",
  };
  const key = aliasMap[name];
  return key ? queues[key] : undefined;
}

async function getQueueStats(queue: Queue): Promise<{
  name: string;
  counts: Record<string, number>;
  isPaused: boolean;
}> {
  const [counts, isPaused] = await Promise.all([
    queue.getJobCounts("active", "waiting", "delayed", "failed", "completed", "paused"),
    queue.isPaused(),
  ]);
  return { name: queue.name, counts, isPaused };
}

export function registerJobsRoutes(router: Router, deps: JobsRouteDeps): Router {
  const { queues, auth, logger } = deps;

  // ── GET /api/jobs — all queues overview ──────────────────────────────────
  router.get("/jobs", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const stats = await Promise.all(
        QUEUE_KEYS.map((key) => getQueueStats(queues[key])),
      );

      res.json({ queues: stats, ts: Date.now() });
    } catch (err) {
      logger?.error("jobs_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/jobs/:queue — single queue stats ────────────────────────────
  router.get("/jobs/:queue", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const queue = resolveQueue(queues, req.params["queue"] as string);
      if (!queue) { res.status(404).json({ error: "QUEUE_NOT_FOUND" }); return; }

      res.json(await getQueueStats(queue));
    } catch (err) {
      logger?.error("jobs_queue_stats_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/jobs/:queue/failed — list failed jobs ───────────────────────
  router.get("/jobs/:queue/failed", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const queue = resolveQueue(queues, req.params["queue"] as string);
      if (!queue) { res.status(404).json({ error: "QUEUE_NOT_FOUND" }); return; }

      const start = parseInt((req.query["start"] as string) ?? "0", 10);
      const end   = Math.min(start + 49, start + parseInt((req.query["limit"] as string) ?? "20", 10) - 1);

      const jobs = await queue.getFailed(start, end);
      res.json({
        jobs: jobs.map((j) => ({
          id:          j.id,
          name:        j.name,
          data:        j.data,
          failedReason: j.failedReason,
          attemptsMade: j.attemptsMade,
          timestamp:   j.timestamp,
          processedOn: j.processedOn,
          finishedOn:  j.finishedOn,
        })),
      });
    } catch (err) {
      logger?.error("jobs_failed_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/:queue/failed/:jobId/retry ────────────────────────────
  router.post("/jobs/:queue/failed/:jobId/retry", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const queue = resolveQueue(queues, req.params["queue"] as string);
      if (!queue) { res.status(404).json({ error: "QUEUE_NOT_FOUND" }); return; }

      const jobId = req.params["jobId"] as string;
      const job   = await queue.getJob(jobId);
      if (!job) { res.status(404).json({ error: "JOB_NOT_FOUND" }); return; }

      await job.retry();
      logger?.info("jobs_job_retried", { queue: queue.name, jobId });
      res.json({ ok: true, jobId });
    } catch (err) {
      logger?.error("jobs_retry_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/:queue/pause ──────────────────────────────────────────
  router.post("/jobs/:queue/pause", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const queue = resolveQueue(queues, req.params["queue"] as string);
      if (!queue) { res.status(404).json({ error: "QUEUE_NOT_FOUND" }); return; }

      await queue.pause();
      logger?.info("jobs_queue_paused", { queue: queue.name });
      res.json({ ok: true, queue: queue.name, paused: true });
    } catch (err) {
      logger?.error("jobs_pause_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/jobs/:queue/resume ─────────────────────────────────────────
  router.post("/jobs/:queue/resume", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const queue = resolveQueue(queues, req.params["queue"] as string);
      if (!queue) { res.status(404).json({ error: "QUEUE_NOT_FOUND" }); return; }

      await queue.resume();
      logger?.info("jobs_queue_resumed", { queue: queue.name });
      res.json({ ok: true, queue: queue.name, paused: false });
    } catch (err) {
      logger?.error("jobs_resume_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── DELETE /api/jobs/:queue/failed — clean all failed jobs ───────────────
  router.delete("/jobs/:queue/failed", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const queue = resolveQueue(queues, req.params["queue"] as string);
      if (!queue) { res.status(404).json({ error: "QUEUE_NOT_FOUND" }); return; }

      const count = await queue.clean(0, 1000, "failed");
      logger?.info("jobs_failed_cleaned", { queue: queue.name, count });
      res.json({ ok: true, cleaned: count });
    } catch (err) {
      logger?.error("jobs_clean_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
