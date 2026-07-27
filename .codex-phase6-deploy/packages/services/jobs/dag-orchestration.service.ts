/**
 * DagOrchestrationService
 *
 * Executes multi-step job DAGs (directed acyclic graphs) where each step
 * is a BullMQ job and progression is event-driven.
 *
 * Execution model:
 *   - Each DAG step maps to a BullMQ job in the caller-supplied queue.
 *   - Ready steps (no un-completed deps) are enqueued immediately.
 *   - On step completion, the service checks for newly-unblocked steps.
 *   - State is persisted to event.orchestration_run + event.orchestration_node,
 *     so in-flight DAGs survive process restarts.
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
 * Recovery:
 *   On startup call recoverOrphanedRuns() — it finds 'running' nodes whose
 *   BullMQ job no longer exists and re-enqueues them.
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
  status:     "pending" | "running" | "completed" | "failed" | "skipped" | "canceled";
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

// Terminal node statuses — run is done when all nodes are in one of these
const TERMINAL_NODE_STATUSES = new Set(["completed", "failed", "skipped", "canceled"]);

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
   * Creates orchestration_run + orchestration_node rows, then enqueues the
   * first ready steps (those with no dependencies).
   */
  async startRun(
    dag:           DagDefinition,
    tenantId:      string,
    correlationId?: string,
  ): Promise<string> {
    const run = await this.db
      .insertInto("event.orchestration_run" as never)
      .values({
        tenant_id:      tenantId,
        dag_id:         dag.id,
        trigger_type:   "manual",
        correlation_id: correlationId ?? null,
        total_nodes:    dag.steps.length,
        created_by:     SYSTEM_ACTOR,
      } as never)
      .returning(["id"] as never[])
      .executeTakeFirstOrThrow() as { id: string };

    const dagRunId = run.id;

    // Insert one node per step (all start as 'pending')
    for (const step of dag.steps) {
      await this.db
        .insertInto("event.orchestration_node" as never)
        .values({
          tenant_id:  tenantId,
          run_id:     dagRunId,
          node_code:  step.id,
          node_type:  step.jobName,
          depends_on: step.dependsOn ?? [],
          status:     "pending",
          input:      step.data ? JSON.stringify(step.data) : null,
        } as never)
        .execute();
    }

    // Enqueue steps that have no dependencies
    const ready = dag.steps.filter((s) => !s.dependsOn || s.dependsOn.length === 0);
    for (const step of ready) {
      await this.enqueueStep(dagRunId, dag.id, step, tenantId);
    }

    this.logger?.info("dag_run_started", { dagRunId, dagId: dag.id, tenantId });
    return dagRunId;
  }

  /**
   * Called when a step job completes successfully.
   * Updates node status, rolls up counters, enqueues newly-unblocked steps,
   * and finalises the run if all steps are done.
   */
  async onStepCompleted(
    dagRunId: string,
    dagId:    string,
    stepId:   string,
    tenantId: string,
    dag:      DagDefinition,
  ): Promise<void> {
    await this.markNodeStatus(dagRunId, stepId, tenantId, "completed");

    const completedCodes = await this.getCompletedNodeCodes(dagRunId, tenantId);

    // Enqueue steps whose dependencies are all now completed
    const nextReady = dag.steps.filter((s) =>
      !completedCodes.has(s.id) &&
      (s.dependsOn ?? []).every((dep) => completedCodes.has(dep)),
    );
    for (const step of nextReady) {
      await this.enqueueStep(dagRunId, dagId, step, tenantId);
    }

    // Finalise run if all steps are done
    await this.tryFinaliseRun(dagRunId, tenantId);

    if (nextReady.length === 0) {
      this.logger?.info("dag_run_step_completed_no_next", { dagRunId, dagId, stepId, tenantId });
    }
  }

  /**
   * Called when a step job fails permanently (after BullMQ retries exhausted).
   * Marks the node failed and finalises the run.
   */
  async onStepFailed(
    dagRunId: string,
    stepId:   string,
    tenantId: string,
    error:    string,
  ): Promise<void> {
    await this.markNodeStatus(dagRunId, stepId, tenantId, "failed", error);
    await this.tryFinaliseRun(dagRunId, tenantId);
    this.logger?.error("dag_step_failed", { dagRunId, stepId, tenantId, error });
  }

  /**
   * Cancel all pending/running nodes in a run.
   */
  async cancelRun(dagRunId: string, tenantId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .updateTable("event.orchestration_node" as never)
      .set({ status: "canceled" as never, completed_at: now as never } as never)
      .where("run_id" as never, "=", dagRunId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("status" as never, "in", ["pending", "running"] as never)
      .execute();

    await this.db
      .updateTable("event.orchestration_run" as never)
      .set({ status: "canceled" as never, completed_at: now as never } as never)
      .where("id" as never, "=", dagRunId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("status" as never, "=", "running" as never)
      .execute();

    this.logger?.info("dag_run_canceled", { dagRunId, tenantId });
  }

  /**
   * Get the status of a DAG run including all node states.
   */
  async getRunStatus(dagRunId: string, tenantId: string): Promise<DagRunStatus | null> {
    const run = await this.db
      .selectFrom("event.orchestration_run as r" as never)
      .selectAll("r" as never)
      .where("r.id" as never, "=", dagRunId as never)
      .where("r.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!run) return null;

    const nodes = await this.db
      .selectFrom("event.orchestration_node as n" as never)
      .selectAll("n" as never)
      .where("n.run_id" as never, "=", dagRunId as never)
      .where("n.tenant_id" as never, "=", tenantId as never)
      .orderBy("n.started_at" as never, "asc nulls first" as never)
      .execute() as Record<string, unknown>[];

    const steps: DagStepStatus[] = nodes.map((n) => ({
      stepId:     n["node_code"] as string,
      jobName:    n["node_type"] as string,
      status:     n["status"] as DagStepStatus["status"],
      jobId:      n["job_id"] as string | null ?? null,
      error:      n["error"] as string | null ?? null,
      startedAt:  n["started_at"] as string | null ?? null,
      finishedAt: n["completed_at"] as string | null ?? null,
    }));

    return {
      dagRunId,
      dagId:      run["dag_id"] as string,
      tenantId,
      status:     run["status"] as DagRunStatus["status"],
      steps,
      startedAt:  run["started_at"] as string,
      finishedAt: run["completed_at"] as string | null ?? null,
    };
  }

  /**
   * Recover in-progress runs after a process restart.
   * Finds 'running' nodes whose BullMQ job no longer exists and re-enqueues.
   */
  async recoverOrphanedRuns(tenantId?: string): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (this.db as any)
      .selectFrom("event.orchestration_node as n")
      .innerJoin("event.orchestration_run as r", "r.id", "n.run_id")
      .select([
        "n.run_id" as never,
        "n.node_code" as never,
        "n.node_type" as never,
        "n.job_id" as never,
        "n.tenant_id" as never,
        "n.input" as never,
        "r.dag_id" as never,
      ])
      .where("n.status" as never, "=", "running" as never)
      .where("r.status" as never, "=", "running" as never);

    if (tenantId) {
      q = q.where("n.tenant_id" as never, "=", tenantId as never);
    }

    const activeNodes = await q.execute() as Record<string, unknown>[];
    let recovered = 0;

    for (const node of activeNodes) {
      const jobId = node["job_id"] as string | null;

      if (jobId) {
        const job = await this.queue.getJob(jobId).catch(() => null) as Job | null;
        if (job) continue; // Still alive — not orphaned
      }

      const step: DagStep = {
        id:      node["node_code"] as string,
        jobName: node["node_type"] as string,
        data:    node["input"]
          ? (JSON.parse(node["input"] as string) as Record<string, unknown>)
          : undefined,
      };

      await this.enqueueStep(
        node["run_id"] as string,
        node["dag_id"] as string,
        step,
        node["tenant_id"] as string,
      );
      recovered++;
    }

    if (recovered > 0) {
      this.logger?.info("dag_orphaned_runs_recovered", { count: recovered });
    }
    return recovered;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async enqueueStep(
    dagRunId: string,
    dagId:    string,
    step:     DagStep,
    tenantId: string,
  ): Promise<void> {
    const now = new Date().toISOString();

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

    await this.db
      .updateTable("event.orchestration_node" as never)
      .set({
        status:     "running" as never,
        job_id:     (job.id ?? "") as never,
        started_at: now as never,
      } as never)
      .where("run_id" as never, "=", dagRunId as never)
      .where("node_code" as never, "=", step.id as never)
      .execute()
      .catch(() => { /* best-effort — job is already enqueued */ });
  }

  private async markNodeStatus(
    dagRunId:  string,
    nodeCode:  string,
    tenantId:  string,
    status:    "completed" | "failed" | "skipped" | "canceled",
    error?:    string,
  ): Promise<void> {
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      status:       status,
      completed_at: now,
    };
    if (error) updates["error"] = error;

    await this.db
      .updateTable("event.orchestration_node" as never)
      .set(updates as never)
      .where("run_id" as never, "=", dagRunId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("node_code" as never, "=", nodeCode as never)
      .execute()
      .catch(() => { /* best-effort */ });

    // Roll-up counter on parent run
    const counterField =
      status === "completed" ? "completed_nodes" :
      status === "failed"    ? "failed_nodes" :
      status === "skipped"   ? "skipped_nodes" : null;

    if (counterField) {
      await this.db
        .updateTable("event.orchestration_run" as never)
        .set({ [counterField]: sql`${sql.raw(counterField)} + 1` as never } as never)
        .where("id" as never, "=", dagRunId as never)
        .execute()
        .catch(() => { /* best-effort */ });
    }
  }

  private async getCompletedNodeCodes(dagRunId: string, tenantId: string): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom("event.orchestration_node as n" as never)
      .select("n.node_code" as never)
      .where("n.run_id" as never, "=", dagRunId as never)
      .where("n.tenant_id" as never, "=", tenantId as never)
      .where("n.status" as never, "=", "completed" as never)
      .execute() as Array<{ node_code: string }>;

    return new Set(rows.map((r) => r.node_code));
  }

  private async tryFinaliseRun(dagRunId: string, tenantId: string): Promise<void> {
    const allNodes = await this.db
      .selectFrom("event.orchestration_node as n" as never)
      .select("n.status" as never)
      .where("n.run_id" as never, "=", dagRunId as never)
      .where("n.tenant_id" as never, "=", tenantId as never)
      .execute() as Array<{ status: string }>;

    const allTerminal = allNodes.every((n) => TERMINAL_NODE_STATUSES.has(n.status));
    if (!allTerminal) return;

    const hasFailed = allNodes.some((n) => n.status === "failed");
    const finalStatus = hasFailed ? "failed" : "completed";

    await this.db
      .updateTable("event.orchestration_run" as never)
      .set({
        status:       finalStatus as never,
        completed_at: new Date().toISOString() as never,
      } as never)
      .where("id" as never, "=", dagRunId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("status" as never, "=", "running" as never)
      .execute()
      .catch(() => { /* already finalised by a concurrent worker */ });

    this.logger?.info("dag_run_finalised", { dagRunId, tenantId, status: finalStatus });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createDagOrchestrationService(
  deps: DagOrchestrationDeps,
): DagOrchestrationService {
  return new DagOrchestrationService(deps);
}
