/**
 * DagOrchestrationService — Phase 3.2
 *
 * Executes multi-step job DAGs (directed acyclic graphs) where each step
 * is a BullMQ job and progression is event-driven via Job.waitUntilFinished().
 *
 * Execution model (I1 from PLATFORM_MIGRATION.md §3.2):
 *   - Each DAG step is a BullMQ job in the "jobs-orchestration" queue.
 *   - On completion, a step job enqueues the next step (if any).
 *   - Do NOT poll — use BullMQ's event-driven Job.waitUntilFinished().
 *   - DAG state persisted to event.work_item so in-flight DAGs survive
 *     process restart.
 *
 * DAG definition format:
 *   {
 *     id:    "audit-archive-pipeline",
 *     steps: [
 *       { id: "snapshot", jobName: "dag:step:snapshot", data: { ... } },
 *       { id: "archive",  jobName: "dag:step:archive",  data: { ... }, dependsOn: ["snapshot"] },
 *       { id: "notify",   jobName: "dag:step:notify",   data: { ... }, dependsOn: ["archive"]  },
 *     ]
 *   }
 *
 * State persisted in event.work_item:
 *   - One work_item row per DAG step.
 *   - item_type = 'dag_step'
 *   - status: pending | active | completed | failed | skipped
 *   - metadata: { dagRunId, stepId, jobId, error? }
 *
 * Process restart recovery:
 *   On startup, DagOrchestrationService scans for in-progress DAG runs
 *   (active steps with no completed BullMQ job) and re-enqueues them.
 */

import type { Queue, Job } from "bullmq";
import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DagStep {
  id:        string;
  jobName:   string;
  data?:     Record<string, unknown>;
  dependsOn?: string[];
}

export interface DagDefinition {
  id:    string;
  steps: DagStep[];
}

export interface DagRunStatus {
  dagRunId:   string;
  dagId:      string;
  tenantId:   string;
  status:     "running" | "completed" | "failed" | "canceled";
  steps:      DagStepStatus[];
  startedAt:  string;
  finishedAt: string | null;
}

export interface DagStepStatus {
  stepId:     string;
  jobName:    string;
  status:     "pending" | "active" | "completed" | "failed" | "skipped";
  jobId:      string | null;
  error:      string | null;
  startedAt:  string | null;
  finishedAt: string | null;
}

export interface DagOrchestrationDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:     Kysely<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue:  Queue<Record<string, unknown>>;
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

const SYSTEM_ACTOR = "00000000-0000-7000-a000-000000000001";

// ── DagOrchestrationService ───────────────────────────────────────────────────

export class DagOrchestrationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly queue: Queue<Record<string, unknown>>;
  private readonly logger?: DagOrchestrationDeps["logger"];

  constructor(deps: DagOrchestrationDeps) {
    this.db     = deps.db;
    this.queue  = deps.queue;
    this.logger = deps.logger;
  }

  /**
   * Enqueue a new DAG run.
   * Creates work_item rows for each step and enqueues the first ready step(s).
   */
  async startRun(
    dag: DagDefinition,
    tenantId: string,
    correlationId?: string,
  ): Promise<string> {
    const dagRunId = crypto.randomUUID();
    const now      = new Date().toISOString();

    // Persist step state rows
    await this.db.transaction().execute(async (tx) => {
      for (const step of dag.steps) {
        await tx
          .insertInto("event.work_item" as never)
          .values({
            id:          crypto.randomUUID(),
            tenant_id:   tenantId,
            item_type:   "dag_step",
            status:      "pending",
            metadata:    JSON.stringify({
              dagRunId,
              dagId:    dag.id,
              stepId:   step.id,
              jobName:  step.jobName,
              dependsOn: step.dependsOn ?? [],
              correlationId: correlationId ?? null,
            }),
            created_by:  SYSTEM_ACTOR,
            created_at:  now,
          } as never)
          .execute();
      }
    });

    // Enqueue first steps (no dependencies)
    const ready = dag.steps.filter((s) => !s.dependsOn || s.dependsOn.length === 0);
    for (const step of ready) {
      await this.enqueueStep(dagRunId, dag.id, step, tenantId);
    }

    this.logger?.info("dag_run_started", { dagRunId, dagId: dag.id, tenantId });
    return dagRunId;
  }

  /**
   * Called by the orchestration worker when a step job completes successfully.
   * Updates step status and enqueues the next ready step(s).
   */
  async onStepCompleted(
    dagRunId:  string,
    dagId:     string,
    stepId:    string,
    tenantId:  string,
    dag:       DagDefinition,
  ): Promise<void> {
    await this.markStepStatus(dagRunId, stepId, tenantId, "completed");

    // Find next steps whose dependencies are all completed
    const completedSteps = await this.getCompletedStepIds(dagRunId, tenantId);
    const nextReady = dag.steps.filter((s) =>
      !completedSteps.has(s.id) &&
      (s.dependsOn ?? []).every((dep) => completedSteps.has(dep))
    );

    for (const step of nextReady) {
      await this.enqueueStep(dagRunId, dagId, step, tenantId);
    }

    // Check if the entire DAG is done
    if (nextReady.length === 0 && dag.steps.every((s) => completedSteps.has(s.id))) {
      this.logger?.info("dag_run_completed", { dagRunId, dagId, tenantId });
    }
  }

  /**
   * Called when a step job fails.
   * Marks the step failed; does NOT automatically retry (BullMQ handles retries).
   */
  async onStepFailed(
    dagRunId: string,
    stepId:   string,
    tenantId: string,
    error:    string,
  ): Promise<void> {
    await this.markStepStatus(dagRunId, stepId, tenantId, "failed", error);
    this.logger?.error("dag_step_failed", { dagRunId, stepId, tenantId, error });
  }

  /**
   * Cancel a running DAG run. Marks all pending steps as canceled.
   */
  async cancelRun(dagRunId: string, tenantId: string): Promise<void> {
    await this.db
      .updateTable("event.work_item" as never)
      .set({ status: "skipped" as never, updated_at: new Date().toISOString() as never } as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("item_type" as never, "=", "dag_step" as never)
      .where("status" as never, "in", ["pending", "active"] as never)
      .where(sql`metadata->>'dagRunId'` as never, "=" as never, dagRunId as never)
      .execute();

    this.logger?.info("dag_run_canceled", { dagRunId, tenantId });
  }

  /**
   * Get the status of a DAG run including all step states.
   */
  async getRunStatus(dagRunId: string, tenantId: string): Promise<DagRunStatus | null> {
    const stepRows = await this.db
      .selectFrom("event.work_item as wi" as never)
      .selectAll("wi" as never)
      .where("wi.tenant_id" as never, "=", tenantId as never)
      .where("wi.item_type" as never, "=", "dag_step" as never)
      .where(sql`wi.metadata->>'dagRunId'` as never, "=" as never, dagRunId as never)
      .execute() as Record<string, unknown>[];

    if (stepRows.length === 0) return null;

    const steps: DagStepStatus[] = stepRows.map((r) => {
      const meta = JSON.parse(r["metadata"] as string ?? "{}") as Record<string, unknown>;
      return {
        stepId:     meta["stepId"] as string,
        jobName:    meta["jobName"] as string,
        status:     r["status"] as DagStepStatus["status"],
        jobId:      meta["jobId"] as string | null ?? null,
        error:      meta["error"] as string | null ?? null,
        startedAt:  r["started_at"] as string | null ?? null,
        finishedAt: r["finished_at"] as string | null ?? null,
      };
    });

    const hasFailed    = steps.some((s) => s.status === "failed");
    const allCompleted = steps.every((s) => s.status === "completed" || s.status === "skipped");
    const status: DagRunStatus["status"] = hasFailed ? "failed" : allCompleted ? "completed" : "running";

    const firstMeta = JSON.parse(stepRows[0]!["metadata"] as string ?? "{}") as Record<string, unknown>;

    return {
      dagRunId,
      dagId:      firstMeta["dagId"] as string,
      tenantId,
      status,
      steps,
      startedAt:  stepRows[0]!["created_at"] as string,
      finishedAt: allCompleted || hasFailed
        ? (stepRows.map((r) => r["updated_at"] as string | null).filter(Boolean).sort().pop() ?? null)
        : null,
    };
  }

  /**
   * Recover in-progress DAG runs on startup.
   * Scans for 'active' step rows and re-enqueues them if their BullMQ job
   * no longer exists.
   */
  async recoverOrphanedRuns(tenantId?: string): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.db
      .selectFrom("event.work_item as wi" as never)
      .selectAll("wi" as never)
      .where("wi.item_type" as never, "=", "dag_step" as never)
      .where("wi.status" as never, "=", "active" as never);

    if (tenantId) {
      q = q.where("wi.tenant_id" as never, "=", tenantId as never);
    }

    const activeRows = await q.execute() as Record<string, unknown>[];
    let recovered = 0;

    for (const row of activeRows) {
      const meta = JSON.parse(row["metadata"] as string ?? "{}") as Record<string, unknown>;
      const jobId = meta["jobId"] as string | null;

      if (jobId) {
        const job = await this.queue.getJob(jobId).catch(() => null) as Job | null;
        if (job) continue; // Job still exists — not orphaned
      }

      // Re-enqueue the step
      const step: DagStep = {
        id:      meta["stepId"] as string,
        jobName: meta["jobName"] as string,
        data:    meta["data"] as Record<string, unknown> | undefined,
      };
      await this.enqueueStep(
        meta["dagRunId"] as string,
        meta["dagId"] as string,
        step,
        row["tenant_id"] as string,
      );
      recovered++;
    }

    if (recovered > 0) {
      this.logger?.info("dag_orphaned_runs_recovered", { count: recovered });
    }
    return recovered;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async enqueueStep(
    dagRunId: string,
    dagId:    string,
    step:     DagStep,
    tenantId: string,
  ): Promise<void> {
    const job = await this.queue.add(
      step.jobName,
      {
        dagRunId,
        dagId,
        stepId:   step.id,
        tenantId,
        ...(step.data ?? {}),
      },
      {
        jobId:    `dag:${dagRunId}:${step.id}`,
        attempts: 3,
        backoff:  { type: "exponential", delay: 2000 },
      },
    );

    // Update work_item with jobId and set status to active
    await this.db
      .updateTable("event.work_item" as never)
      .set({
        status:     "active" as never,
        metadata:   sql`jsonb_set(metadata, '{jobId}', to_jsonb(${job.id ?? ""}::text))` as never,
        started_at: new Date().toISOString() as never,
        updated_at: new Date().toISOString() as never,
      } as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("item_type" as never, "=", "dag_step" as never)
      .where(sql`metadata->>'dagRunId'` as never, "=" as never, dagRunId as never)
      .where(sql`metadata->>'stepId'` as never, "=" as never, step.id as never)
      .execute()
      .catch(() => { /* best-effort */ });
  }

  private async markStepStatus(
    dagRunId:  string,
    stepId:    string,
    tenantId:  string,
    status:    "completed" | "failed" | "skipped",
    error?:    string,
  ): Promise<void> {
    await this.db
      .updateTable("event.work_item" as never)
      .set({
        status:      status as never,
        finished_at: new Date().toISOString() as never,
        updated_at:  new Date().toISOString() as never,
        ...(error ? { metadata: sql`jsonb_set(metadata, '{error}', to_jsonb(${error}::text))` as never } : {}),
      } as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("item_type" as never, "=", "dag_step" as never)
      .where(sql`metadata->>'dagRunId'` as never, "=" as never, dagRunId as never)
      .where(sql`metadata->>'stepId'` as never, "=" as never, stepId as never)
      .execute()
      .catch(() => { /* best-effort */ });
  }

  private async getCompletedStepIds(dagRunId: string, tenantId: string): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom("event.work_item as wi" as never)
      .select("wi.metadata" as never)
      .where("wi.tenant_id" as never, "=", tenantId as never)
      .where("wi.item_type" as never, "=", "dag_step" as never)
      .where("wi.status" as never, "=", "completed" as never)
      .where(sql`wi.metadata->>'dagRunId'` as never, "=" as never, dagRunId as never)
      .execute() as Array<{ metadata: string }>;

    return new Set(rows.map((r) => {
      const m = JSON.parse(r.metadata ?? "{}") as Record<string, unknown>;
      return m["stepId"] as string;
    }));
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createDagOrchestrationService(
  deps: DagOrchestrationDeps,
): DagOrchestrationService {
  return new DagOrchestrationService(deps);
}
