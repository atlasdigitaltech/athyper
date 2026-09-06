import { JobScheduleNotFoundError, JobScheduleConflictError } from "@athyper/server-contract-jobs";
import type { JobEnvelope, JobExecutionCoordinate, JobExecutionFailure, JobExecutionIdentity, JobExecutionResult, JobPayload, JobPayloadSchema, JobSubject } from "@athyper/server-contract-jobs";
import type { TransactionActor } from "@athyper/server-foundation/transaction";
import { sql, type Kysely, type Transaction } from "kysely";

import type { JobExecutionStore } from "./execution-lifecycle.js";
import type { JobAdministrationStore } from "./administration.js";
import type { JobGovernanceStore } from "./governance-service.js";

type PlaneKey = JobExecutionCoordinate["planeKey"];
type Database = Record<string, never>;
export type JobTransaction = Transaction<Database>;

export interface JobTransactionCoordinator {
  runTenant<T>(planeKey: PlaneKey, actor: TransactionActor, work: (transaction: JobTransaction) => Promise<T>): Promise<T>;
  runSystem<T>(planeKey: PlaneKey, work: (transaction: JobTransaction) => Promise<T>): Promise<T>;
}

export function createKyselyJobScheduleRepository(
  databases: Partial<Record<PlaneKey, Kysely<Database>>>,
) {
  return {
    async listActive(planeKey: PlaneKey) {
      const database = requiredDatabase(databases, planeKey);
      const result = await sql<Record<string, unknown>>`
        SELECT * FROM control.fn_cron_schedules_for_scheduler()
      `.execute(database);
      return result.rows.map((row) => {
        const tenantId = nullableString(row["tenant_id"]);
        const principalId = stringValue(row["created_by"], "created_by");
        const payload = objectValue(row["payload_template"]);
        return {
          id: stringValue(row["id"], "id"),
          planeKey,
          ...(tenantId ? { tenantId } : {}),
          code: stringValue(row["code"], "code"),
          handlerType: stringValue(row["handler_type"], "handler_type"),
          definition: {
            scheduleId: stringValue(row["id"], "id"),
            queue: stringValue(row["target_queue"], "target_queue"),
            name: stringValue(row["handler_type"], "handler_type"),
            data: {
              ...payload,
              planeKey,
              ...(tenantId ? { tenantId } : {}),
              principalId,
            },
            pattern: {
              kind: "cron" as const,
              expression: stringValue(row["cron_expression"], "cron_expression"),
              timezone: stringValue(row["timezone"], "timezone"),
            },
            options: {
              maxAttempts: Math.max(1, numberValue(row["max_retries"], 0) + 1),
              priority: Math.max(0, numberValue(row["priority"], 0)),
              removeOnComplete: 1_000,
              removeOnFail: 5_000,
              execution: {
                planeKey,
                scope: tenantId ? "tenant" as const : "plane" as const,
                ...(tenantId ? { tenantId } : {}),
                principalId,
              },
              payloadSchema: {
                name: stringValue(row["handler_type"], "handler_type"),
                version: 1,
              },
            },
          },
        };
      });
    },
    async markReconciled(input: { planeKey: PlaneKey; scheduleId: string; reconciledAt: string; nextRunAt?: string }) {
      const database = requiredDatabase(databases, input.planeKey);
      await sql`SELECT control.fn_mark_cron_schedule_reconciled(
        ${input.scheduleId}::uuid,
        ${input.reconciledAt}::timestamptz,
        ${input.nextRunAt ?? null}::timestamptz
      )`.execute(database);
    },
  };
}

export function createKyselyJobExecutionStore(
  transactions: JobTransactionCoordinator,
): JobExecutionStore {
  return {
    async recordEnqueued(input) {
      return withCoordinate(transactions, {
        planeKey: input.planeKey,
        scope: input.tenantId ? "tenant" : "plane",
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        principalId: input.principalId,
      }, async (transaction) => {
        const persistedKey = await resolvePersistedExecutionKey(transaction, input.tenantId, input.queue, input.jobId, input.executionKey);
        const metadata = executionMetadata(input.jobId, input.queue, input.name, input.subject, input.payloadSchema);
        const result = await sql<{ id: string }>`
          INSERT INTO ops.job_execution
            (tenant_id,execution_key,job_code,job_type,status,attempt_no,max_attempts,
             input_payload,scheduled_at,metadata,created_by)
          VALUES (${input.tenantId ?? null}::uuid,${persistedKey},${jobCode(input.queue,input.name,input.payloadSchema)},
             ${input.name},'queued',1,${input.maxAttempts},${JSON.stringify(input.data)}::jsonb,
             ${input.enqueuedAt}::timestamptz,${JSON.stringify(metadata)}::jsonb,${input.principalId}::uuid)
          ON CONFLICT (tenant_id,execution_key) DO UPDATE SET
             max_attempts=GREATEST(ops.job_execution.max_attempts,EXCLUDED.max_attempts),
             updated_at=now(),updated_by=EXCLUDED.created_by
          RETURNING id`.execute(transaction);
        return { executionId: requiredRow(result.rows[0]).id, executionKey: persistedKey };
      });
    },
    async recordStarted(job) {
      const coordinate = requiredCoordinate(job);
      await withCoordinate(transactions, coordinate, async (transaction) => {
        const persistedKey = await resolvePersistedExecutionKey(transaction, coordinate.tenantId, job.queue, job.idempotencyKey ?? job.id, executionKey(job));
        await sql`
          INSERT INTO ops.job_execution
            (tenant_id,execution_key,job_code,job_type,status,attempt_no,max_attempts,
             input_payload,started_at,metadata,created_by)
          VALUES (${coordinate.tenantId ?? null}::uuid,${persistedKey},${jobCode(job.queue,job.name,job.payloadSchema)},
             ${job.name},'running',${job.attempt},${job.maxAttempts},${JSON.stringify(job.data)}::jsonb,
             now(),${JSON.stringify(executionMetadata(job.id,job.queue,job.name,job.subject,job.payloadSchema))}::jsonb,
             ${coordinate.principalId}::uuid)
          ON CONFLICT (tenant_id,execution_key) DO UPDATE SET
             status='running',attempt_no=EXCLUDED.attempt_no,max_attempts=EXCLUDED.max_attempts,
             started_at=now(),completed_at=NULL,duration_ms=NULL,error_code=NULL,error_message=NULL,
             error_detail=NULL,worker_id=EXCLUDED.worker_id,updated_at=now(),updated_by=EXCLUDED.created_by
        `.execute(transaction);
      });
    },
    async recordCompleted(job, result) {
      const coordinate = requiredCoordinate(job);
      await withCoordinate(transactions, coordinate, (transaction) => recordTerminal(
        transaction, job, coordinate, "succeeded", resultPayload(result), undefined,
      ));
    },
    async recordFailed(job, failure) {
      const coordinate = requiredCoordinate(job);
      const status = failureStatus(job, failure);
      await withCoordinate(transactions, coordinate, (transaction) => recordTerminal(
        transaction, job, coordinate, status, undefined, failure,
      ));
    },
  };
}

export function createKyselyJobAdministrationStore(
  transactions: JobTransactionCoordinator,
): JobAdministrationStore {
  return {
    async load(request) {
      return withCoordinate(transactions, request.execution, async (transaction) => {
        const result = await sql<Record<string, unknown>>`
          SELECT id,execution_key,job_type,attempt_no,max_attempts,input_payload,metadata
          FROM ops.job_execution
          WHERE id=${request.executionId}::uuid
            AND tenant_id IS NOT DISTINCT FROM ${request.execution.tenantId ?? null}::uuid
          LIMIT 1`.execute(transaction);
        const row = result.rows[0];
        if (!row) return undefined;
        const metadata = objectValue(row["metadata"]);
        return {
          executionId: stringValue(row["id"], "id"),
          executionKey: stringValue(row["execution_key"], "execution_key"),
          jobId: stringValue(metadata["jobId"], "metadata.jobId"),
          queue: stringValue(metadata["queue"], "metadata.queue"),
          name: stringValue(row["job_type"], "job_type"),
          data: objectValue(row["input_payload"]),
          maxAttempts: Math.max(1, numberValue(row["max_attempts"], 1)),
          attempt: numberValue(row["attempt_no"], 1),
          ...(metadata["subject"] ? { subject: objectValue(metadata["subject"]) as unknown as JobSubject } : {}),
          ...(metadata["payloadSchema"] ? { payloadSchema: objectValue(metadata["payloadSchema"]) as unknown as JobPayloadSchema } : {}),
        };
      });
    },
    async recordCommand(input) {
      await withCoordinate(transactions, input.request.execution, async (transaction) => {
        await sql`
          INSERT INTO ops.job_execution_command
            (tenant_id,execution_id,command,reason,requested_by,status,applied_at,detail)
          VALUES (${input.request.execution.tenantId ?? null}::uuid,${input.request.executionId}::uuid,
            ${input.command},${input.request.reason},${input.request.execution.principalId}::uuid,
            ${input.applied ? "applied" : "rejected"},now(),
            ${JSON.stringify({ ...(input.detail ?? {}), ...(input.replacementJobId ? { replacementJobId: input.replacementJobId } : {}) })}::jsonb)
        `.execute(transaction);

        if (input.applied && input.command === "cancel") {
          await sql`
            UPDATE ops.job_execution SET
              status='cancelled',completed_at=COALESCE(completed_at,now()),
              duration_ms=GREATEST(0,(extract(epoch FROM (now()-COALESCE(started_at,created_at)))*1000)::bigint),
              updated_at=now(),updated_by=${input.request.execution.principalId}::uuid
            WHERE id=${input.request.executionId}::uuid
              AND tenant_id IS NOT DISTINCT FROM ${input.request.execution.tenantId ?? null}::uuid
              AND status IN ('queued','running','retrying')
          `.execute(transaction);
        } else if (input.applied && input.command === "retry") {
          await sql`
            UPDATE ops.job_execution SET
              status='retrying',completed_at=NULL,duration_ms=NULL,
              error_code=NULL,error_message=NULL,error_detail=NULL,
              updated_at=now(),updated_by=${input.request.execution.principalId}::uuid
            WHERE id=${input.request.executionId}::uuid
              AND tenant_id IS NOT DISTINCT FROM ${input.request.execution.tenantId ?? null}::uuid
              AND attempt_no=${input.expectedAttempt ?? -1}
              AND status IN ('failed','dead_letter','timed_out','cancelled')
          `.execute(transaction);
        }
      });
    },
    async listDeadLetters(input) {
      return withCoordinate(transactions, input.execution, async (transaction) => {
        const result = await sql<Record<string, unknown>>`
          SELECT id,execution_key,job_code,attempt_no,error_code,error_message,completed_at
          FROM ops.job_execution
          WHERE tenant_id IS NOT DISTINCT FROM ${input.execution.tenantId ?? null}::uuid
            AND status='dead_letter'
          ORDER BY completed_at DESC LIMIT ${input.limit}`.execute(transaction);
        return result.rows.map((row) => ({
          executionId: stringValue(row["id"], "id"),
          executionKey: stringValue(row["execution_key"], "execution_key"),
          jobCode: stringValue(row["job_code"], "job_code"),
          attempt: numberValue(row["attempt_no"], 1),
          ...(nullableString(row["error_code"]) ? { errorCode: nullableString(row["error_code"])! } : {}),
          ...(nullableString(row["error_message"]) ? { errorMessage: nullableString(row["error_message"])! } : {}),
          completedAt: dateTime(row["completed_at"]),
        }));
      });
    },
  };
}

export function createKyselyJobGovernanceStore(transactions: JobTransactionCoordinator): JobGovernanceStore {
  return {
    async listExecutions(input) {
      return withCoordinate(transactions, input.execution, async (transaction) => {
        const result = await sql<Record<string, unknown>>`
          SELECT id,execution_key,job_code,status,attempt_no,max_attempts,completed_at,error_code,error_message
          FROM ops.job_execution
          WHERE tenant_id IS NOT DISTINCT FROM ${input.execution.tenantId ?? null}::uuid
            AND (${input.cursor ?? null}::uuid IS NULL OR id < ${input.cursor ?? null}::uuid)
          ORDER BY id DESC LIMIT ${input.limit}`.execute(transaction);
        return result.rows.map((row) => ({
          executionId: stringValue(row["id"], "id"), executionKey: stringValue(row["execution_key"], "execution_key"),
          jobCode: stringValue(row["job_code"], "job_code"), status: stringValue(row["status"], "status"),
          attempt: numberValue(row["attempt_no"], 1), maxAttempts: numberValue(row["max_attempts"], 1),
          ...(row["completed_at"] ? { completedAt: dateTime(row["completed_at"]) } : {}),
          ...(nullableString(row["error_code"]) ? { errorCode: nullableString(row["error_code"])! } : {}),
          ...(nullableString(row["error_message"]) ? { errorMessage: nullableString(row["error_message"])! } : {}),
        }));
      });
    },
    async listSchedules(execution) {
      return withCoordinate(transactions, execution, async (transaction) => {
        const result = await sql<Record<string, unknown>>`
          SELECT id,code,name,handler_type,cron_expression,timezone,target_queue,payload_template,is_enabled,next_run_at
          FROM control.cron_schedule WHERE tenant_id IS NOT DISTINCT FROM ${execution.tenantId ?? null}::uuid ORDER BY code`.execute(transaction);
        return result.rows.map(scheduleRow);
      });
    },
    async createSchedule(input) {
      return withCoordinate(transactions, input.execution, async (transaction) => {
        const value = input.schedule;
        const result = await sql<Record<string, unknown>>`
          INSERT INTO control.cron_schedule
            (tenant_id,code,name,handler_type,cron_expression,timezone,target_queue,payload_template,created_by)
          VALUES (${input.execution.tenantId ?? null}::uuid,${value.code},${value.name},${value.handlerType},${value.cronExpression},${value.timezone},${value.targetQueue},${JSON.stringify(value.payloadTemplate)}::jsonb,${input.execution.principalId}::uuid)
          RETURNING id,code,name,handler_type,cron_expression,timezone,target_queue,payload_template,is_enabled,next_run_at`.execute(transaction);
        const schedule = scheduleRow(requiredRow(result.rows[0]));
        await recordScheduleChange(transaction, input.execution, schedule.id, "created", input.reason);
        return schedule;
      }).catch(scheduleWriteError);
    },
    async updateSchedule(input) {
      return withCoordinate(transactions, input.execution, async (transaction) => {
        const value = input.schedule;
        const result = await sql<Record<string, unknown>>`
          UPDATE control.cron_schedule SET code=${value.code},name=${value.name},handler_type=${value.handlerType},
            cron_expression=${value.cronExpression},timezone=${value.timezone},target_queue=${value.targetQueue},
            payload_template=${JSON.stringify(value.payloadTemplate)}::jsonb,updated_at=now(),updated_by=${input.execution.principalId}::uuid
          WHERE id=${input.scheduleId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.execution.tenantId ?? null}::uuid
          RETURNING id,code,name,handler_type,cron_expression,timezone,target_queue,payload_template,is_enabled,next_run_at`.execute(transaction);
        const schedule = scheduleRow(requiredScheduleRow(result.rows[0]));
        await recordScheduleChange(transaction, input.execution, schedule.id, "updated", input.reason);
        return schedule;
      }).catch(scheduleWriteError);
    },
    async deactivateSchedule(input) {
      await withCoordinate(transactions, input.execution, async (transaction) => {
        const result = await sql<{ id: string }>`UPDATE control.cron_schedule SET is_enabled=false,updated_at=now(),updated_by=${input.execution.principalId}::uuid
          WHERE id=${input.scheduleId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.execution.tenantId ?? null}::uuid AND is_enabled RETURNING id`.execute(transaction);
        const row = result.rows[0];
        if (!row) {
          const existing = await sql<{ id: string }>`SELECT id FROM control.cron_schedule
            WHERE id=${input.scheduleId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.execution.tenantId ?? null}::uuid`.execute(transaction);
          requiredScheduleRow(existing.rows[0]);
          return; // Already inactive: idempotent success without duplicate audit evidence.
        }
        await recordScheduleChange(transaction, input.execution, row.id, "deactivated", input.reason);
      });
    },
    async listScheduleAudit(input) {
      return withCoordinate(transactions, input.execution, async (transaction) => {
        const result = await sql<Record<string, unknown>>`SELECT action,reason,changed_at,changed_by FROM control.cron_schedule_change_log
          WHERE tenant_id IS NOT DISTINCT FROM ${input.execution.tenantId ?? null}::uuid AND schedule_id=${input.scheduleId}::uuid ORDER BY changed_at DESC`.execute(transaction);
        return result.rows.map((row) => ({ action: stringValue(row["action"], "action") as "created"|"updated"|"deactivated", reason: stringValue(row["reason"], "reason"), changedAt: dateTime(row["changed_at"]), changedBy: stringValue(row["changed_by"], "changed_by") }));
      });
    },
  };
}

function scheduleRow(row: Record<string, unknown>) {
  return { id:stringValue(row["id"],"id"),code:stringValue(row["code"],"code"),name:stringValue(row["name"],"name"),handlerType:stringValue(row["handler_type"],"handler_type"),cronExpression:stringValue(row["cron_expression"],"cron_expression"),timezone:stringValue(row["timezone"],"timezone"),targetQueue:stringValue(row["target_queue"],"target_queue"),payloadTemplate:objectValue(row["payload_template"]),enabled:Boolean(row["is_enabled"]),...(row["next_run_at"]?{nextRunAt:dateTime(row["next_run_at"])}:{}) };
}
async function recordScheduleChange(transaction: JobTransaction, execution: JobExecutionCoordinate, scheduleId: string, action: string, reason: string) {
  await sql`INSERT INTO control.cron_schedule_change_log (tenant_id,schedule_id,action,reason,changed_by) VALUES (${execution.tenantId ?? null}::uuid,${scheduleId}::uuid,${action},${reason.trim().slice(0,1000)},${execution.principalId}::uuid)`.execute(transaction);
}

async function recordTerminal(
  transaction: JobTransaction,
  job: JobEnvelope,
  coordinate: JobExecutionCoordinate,
  status: "succeeded" | "retrying" | "cancelled" | "timed_out" | "dead_letter",
  result: Readonly<Record<string, unknown>> | undefined,
  failure: JobExecutionFailure | undefined,
): Promise<void> {
  const persistedKey = await resolvePersistedExecutionKey(transaction, coordinate.tenantId, job.queue, job.idempotencyKey ?? job.id, executionKey(job));
  const updated = await sql<{ id: string; started_at: Date; duration_ms: number }>`
    UPDATE ops.job_execution SET
      status=${status},attempt_no=${job.attempt},max_attempts=${job.maxAttempts},
      result_payload=${result ? JSON.stringify(result) : null}::jsonb,
      error_code=${failure?.code ?? null},error_message=${failure?.message ?? null},
      error_detail=${failure?.detail ? JSON.stringify(failure.detail) : null}::jsonb,
      completed_at=CASE WHEN ${status}='retrying' THEN NULL ELSE now() END,
      duration_ms=GREATEST(0,(extract(epoch FROM (now()-COALESCE(started_at,created_at)))*1000)::bigint),
      updated_at=now(),updated_by=${coordinate.principalId}::uuid
    WHERE tenant_id IS NOT DISTINCT FROM ${coordinate.tenantId ?? null}::uuid
      AND execution_key=${persistedKey}
    RETURNING id,COALESCE(started_at,created_at) AS started_at,duration_ms`.execute(transaction);
  const row = requiredRow(updated.rows[0]);
  await sql`
    INSERT INTO ops.job_execution_attempt
      (tenant_id,execution_id,attempt_no,status,started_at,completed_at,duration_ms,
       error_code,error_message,error_detail,metadata,created_by)
    VALUES (${coordinate.tenantId ?? null}::uuid,${row.id}::uuid,${job.attempt},${status},
       ${row.started_at}::timestamptz,now(),${row.duration_ms},${failure?.code ?? null},
       ${failure?.message ?? null},${failure?.detail ? JSON.stringify(failure.detail) : null}::jsonb,
       ${JSON.stringify({ jobId: job.id, queue: job.queue, name: job.name })}::jsonb,
       ${coordinate.principalId}::uuid)
    ON CONFLICT (execution_id,attempt_no) DO NOTHING`.execute(transaction);
}

async function withCoordinate<T>(
  transactions: JobTransactionCoordinator,
  coordinate: JobExecutionCoordinate,
  work: (transaction: JobTransaction) => Promise<T>,
): Promise<T> {
  if (coordinate.scope === "tenant") {
    if (!coordinate.tenantId) throw new Error("Tenant-scoped job is missing tenantId");
    return transactions.runTenant(coordinate.planeKey, {
      tenantId: coordinate.tenantId,
      principalId: coordinate.principalId,
    }, work);
  }
  return transactions.runSystem(coordinate.planeKey, work);
}

function failureStatus(job: JobEnvelope, failure: JobExecutionFailure) {
  if (failure.disposition === "cancelled") return "cancelled" as const;
  if (job.attempt < job.maxAttempts && (failure.disposition === "retryable" || failure.disposition === "timed_out")) return "retrying" as const;
  if (failure.disposition === "timed_out") return "timed_out" as const;
  return "dead_letter" as const;
}

function requiredCoordinate(job: JobEnvelope): JobExecutionCoordinate {
  if (!job.execution) throw new Error(`Job ${job.queue}/${job.name} is missing execution coordinates`);
  return job.execution;
}

function executionKey(job: JobEnvelope): string {
  return job.executionKey ?? job.idempotencyKey ?? job.id;
}

function jobCode(queue: string, name: string, schema?: JobPayloadSchema): string {
  const candidate = (schema?.name ?? `${queue}.${name}`).toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
  return candidate.slice(0, 127);
}

function executionMetadata(jobId: string, queue: string, name: string, subject?: JobSubject, schema?: JobPayloadSchema) {
  return { jobId, queue, name, ...(subject ? { subject } : {}), ...(schema ? { payloadSchema: schema } : {}) };
}

function resultPayload(result: JobExecutionResult | void): Readonly<Record<string, unknown>> {
  if (!result) return {};
  return result.status === "completed" ? { ...(result.output ?? {}) } : { discarded: true, reason: result.reason };
}

function requiredDatabase(databases: Partial<Record<PlaneKey, Kysely<Database>>>, planeKey: PlaneKey) {
  const database = databases[planeKey];
  if (!database) throw new Error(`Jobs database is not configured for ${planeKey}`);
  return database;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return {};
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid cron schedule ${field}`);
  return value;
}

function nullableString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error("Invalid job execution timestamp");
  return parsed.toISOString();
}

function requiredRow<T>(row: T | undefined): T {
  if (!row) throw new Error("Job execution row was not returned");
  return row;
}

function requiredScheduleRow<T>(row: T | undefined): T {
  if (!row) throw new JobScheduleNotFoundError();
  return row;
}

function scheduleWriteError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "23505"
    && "constraint" in error && error.constraint === "cron_schedule_code_uq") {
    throw new JobScheduleConflictError();
  }
  throw error;
}

/** Keep pre-upgrade executions on their existing row while new jobs use queue-qualified keys. */
async function resolvePersistedExecutionKey(transaction: JobTransaction, tenantId: string | undefined, queue: string, jobId: string, desiredKey: string): Promise<string> {
  if (desiredKey === jobId) return desiredKey;
  const result = await sql<{ execution_key: string }>`SELECT execution_key FROM ops.job_execution
    WHERE tenant_id IS NOT DISTINCT FROM ${tenantId ?? null}::uuid
      AND execution_key IN (${desiredKey}, ${jobId})
      AND metadata->>'queue'=${queue} AND metadata->>'jobId'=${jobId}
    ORDER BY (execution_key=${desiredKey}) DESC LIMIT 1`.execute(transaction);
  return result.rows[0]?.execution_key ?? desiredKey;
}
