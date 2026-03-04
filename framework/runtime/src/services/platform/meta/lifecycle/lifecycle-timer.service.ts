/**
 * Lifecycle Timer Service
 *
 * Manages automatic state transitions via scheduled timers.
 * Integrates with BullMQ for delayed job execution.
 *
 * Use cases:
 * - Auto-close: Automatically close entities after inactivity period
 * - Auto-cancel: Automatically cancel stale requests
 * - Reminders: Send notifications before deadlines
 * - Auto-transition: Generic scheduled state changes
 *
 * Pattern (mirrors approval SLA timer implementation):
 * 1. Entity enters state → scheduleTimer()
 * 2. Timer fires via BullMQ → processTimer()
 * 3. Conditions evaluated → transition executed
 * 4. Manual transition → cancelTimers() (prevent stale execution)
 */

import {
  evaluateConditionGroup,
  resolveFieldValue,
} from "../../shared/condition-evaluator.js";
import { uuid, now } from "../data/db-helpers.js";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type { JobQueue } from "@athyper/core";
import type {
  HealthCheckResult,
  LifecycleTimerService,
  LifecycleTimerSchedule,
  LifecycleTimerPolicy,
  LifecycleTimerPayload,
  LifecycleTimerRules,
  LifecycleTimerType,
  RequestContext,
  LifecycleManager,
  ConditionGroup,
  GenericDataAPI,
} from "@athyper/core/meta";

// ============================================================================
// Job Type Constants
// ============================================================================

export const TIMER_JOB_TYPES = {
  AUTO_TRANSITION: "lifecycle-auto-transition",
  REMINDER: "lifecycle-reminder",
} as const;

// ============================================================================
// Implementation
// ============================================================================

export class LifecycleTimerServiceImpl implements LifecycleTimerService {
  private jobQueue?: JobQueue;
  private lifecycleManager?: LifecycleManager;
  private genericDataAPI?: GenericDataAPI;

  constructor(private readonly db: LifecycleDB_Type) {}

  // ===== Dependency Injection =====

  setJobQueue(queue: JobQueue): void {
    this.jobQueue = queue;
  }

  setLifecycleManager(manager: LifecycleManager): void {
    this.lifecycleManager = manager;
  }

  setGenericDataAPI(api: GenericDataAPI): void {
    this.genericDataAPI = api;
  }

  // ===== Timer Scheduling =====

  async scheduleTimer(
    policyId: string,
    entityName: string,
    entityId: string,
    ctx: RequestContext,
    triggerData?: Record<string, unknown>,
  ): Promise<LifecycleTimerSchedule | undefined> {
    // Load timer policy
    const policy = await this.getPolicy(policyId, ctx.tenantId);
    if (!policy) {
      console.warn(
        JSON.stringify({
          msg: "lifecycle_timer_policy_not_found",
          policyId,
          tenantId: ctx.tenantId,
        }),
      );
      return undefined;
    }

    // Get current lifecycle instance
    if (!this.lifecycleManager) {
      console.warn(
        JSON.stringify({
          msg: "lifecycle_timer_manager_not_wired",
          policyId,
          entityName,
          entityId,
        }),
      );
      return undefined;
    }

    const instance = await this.lifecycleManager.getInstance(
      entityName,
      entityId,
      ctx.tenantId,
    );

    if (!instance) {
      console.warn(
        JSON.stringify({
          msg: "lifecycle_timer_instance_not_found",
          entityName,
          entityId,
          tenantId: ctx.tenantId,
        }),
      );
      return undefined;
    }

    // Calculate fire time
    const fireAt = this.calculateFireTime(policy.rules, triggerData);
    if (!fireAt || fireAt.getTime() <= Date.now()) {
      console.log(
        JSON.stringify({
          msg: "lifecycle_timer_fire_time_invalid",
          policyId,
          fireAt: fireAt?.toISOString(),
          reason: !fireAt ? "null" : "in_past",
        }),
      );
      return undefined;
    }

    // Create schedule record
    const scheduleId = uuid();
    const jobIdPlaceholder = `pending-${scheduleId}`;

    const schedule = await this.db
      .insertInto("wf.lifecycle_timer_schedule")
      .values({
        id: scheduleId,
        tenant_id: ctx.tenantId,
        entity_name: entityName,
        entity_id: entityId,
        lifecycle_id: instance.lifecycleId,
        state_id: instance.stateId,
        timer_type: policy.rules.timerType,
        transition_id: policy.rules.targetTransitionId ?? null,
        scheduled_at: now(),
        fire_at: fireAt,
        job_id: jobIdPlaceholder,
        policy_id: policyId,
        policy_snapshot: JSON.stringify(policy.rules),
        status: "scheduled",
        created_at: now(),
        created_by: ctx.userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Schedule BullMQ job
    if (this.jobQueue) {
      const delay = fireAt.getTime() - Date.now();
      const job = await this.jobQueue.add<LifecycleTimerPayload>(
        {
          type: TIMER_JOB_TYPES.AUTO_TRANSITION,
          payload: {
            scheduleId,
            tenantId: ctx.tenantId,
            entityName,
            entityId,
            timerType: policy.rules.timerType,
            policySnapshot: policy.rules,
          },
          metadata: {
            entityName,
            entityId,
            timerType: policy.rules.timerType,
            policyId,
          },
        },
        { delay, attempts: 1 },
      );

      // Update schedule with actual job ID
      await this.db
        .updateTable("wf.lifecycle_timer_schedule")
        .set({ job_id: job.id })
        .where("id", "=", scheduleId)
        .execute();

      console.log(
        JSON.stringify({
          msg: "lifecycle_timer_scheduled",
          scheduleId,
          entityName,
          entityId,
          timerType: policy.rules.timerType,
          fireAt: fireAt.toISOString(),
          jobId: job.id,
          delayMs: delay,
        }),
      );

      return this.mapScheduleRow({ ...schedule, job_id: job.id } as any);
    }

    console.warn(
      JSON.stringify({
        msg: "lifecycle_timer_queue_not_available",
        scheduleId,
      }),
    );

    return this.mapScheduleRow(schedule as any);
  }

  // ===== Timer Cancellation =====

  async cancelTimers(
    entityName: string,
    entityId: string,
    tenantId: string,
    reason: string,
  ): Promise<number> {
    // Fetch active timers
    const timers = await this.db
      .selectFrom("wf.lifecycle_timer_schedule")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_name", "=", entityName)
      .where("entity_id", "=", entityId)
      .where("status", "=", "scheduled")
      .execute();

    if (timers.length === 0) {
      return 0;
    }

    let canceled = 0;

    for (const timer of timers) {
      // Mark as canceled in DB
      await this.db
        .updateTable("wf.lifecycle_timer_schedule")
        .set({ status: "canceled" })
        .where("id", "=", timer.id)
        .execute();

      // Remove BullMQ job
      if (this.jobQueue && timer.job_id) {
        try {
          await this.jobQueue.removeJob(timer.job_id);
        } catch (err) {
          console.warn(
            JSON.stringify({
              msg: "lifecycle_timer_job_removal_failed",
              jobId: timer.job_id,
              error: String(err),
            }),
          );
        }
      }

      canceled++;
    }

    console.log(
      JSON.stringify({
        msg: "lifecycle_timers_canceled",
        entityName,
        entityId,
        tenantId,
        count: canceled,
        reason,
      }),
    );

    return canceled;
  }

  async cancelTimersByType(
    entityName: string,
    entityId: string,
    tenantId: string,
    timerType: LifecycleTimerType,
  ): Promise<number> {
    // Fetch active timers of specific type
    const timers = await this.db
      .selectFrom("wf.lifecycle_timer_schedule")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_name", "=", entityName)
      .where("entity_id", "=", entityId)
      .where("timer_type", "=", timerType)
      .where("status", "=", "scheduled")
      .execute();

    if (timers.length === 0) {
      return 0;
    }

    let canceled = 0;

    for (const timer of timers) {
      // Mark as canceled in DB
      await this.db
        .updateTable("wf.lifecycle_timer_schedule")
        .set({ status: "canceled" })
        .where("id", "=", timer.id)
        .execute();

      // Remove BullMQ job
      if (this.jobQueue && timer.job_id) {
        try {
          await this.jobQueue.removeJob(timer.job_id);
        } catch (err) {
          console.warn(
            JSON.stringify({
              msg: "lifecycle_timer_job_removal_failed",
              jobId: timer.job_id,
              error: String(err),
            }),
          );
        }
      }

      canceled++;
    }

    console.log(
      JSON.stringify({
        msg: "lifecycle_timers_canceled_by_type",
        entityName,
        entityId,
        tenantId,
        timerType,
        count: canceled,
      }),
    );

    return canceled;
  }

  // ===== Timer Execution =====

  async processTimer(scheduleId: string, tenantId: string): Promise<void> {
    // Load schedule
    const schedule = await this.db
      .selectFrom("wf.lifecycle_timer_schedule")
      .selectAll()
      .where("id", "=", scheduleId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!schedule) {
      console.warn(
        JSON.stringify({
          msg: "lifecycle_timer_schedule_not_found",
          scheduleId,
          tenantId,
        }),
      );
      return;
    }

    // Guard check: skip if already fired or canceled
    if (schedule.status !== "scheduled") {
      console.log(
        JSON.stringify({
          msg: "lifecycle_timer_already_processed",
          scheduleId,
          status: schedule.status,
        }),
      );
      return;
    }

    // Mark as fired (prevents double execution)
    await this.db
      .updateTable("wf.lifecycle_timer_schedule")
      .set({ status: "fired" })
      .where("id", "=", scheduleId)
      .execute();

    // Parse policy snapshot
    const policyRules = JSON.parse(
      schedule.policy_snapshot as any,
    ) as LifecycleTimerRules;

    // Guard check: verify entity still exists
    if (!this.lifecycleManager) {
      console.error(
        JSON.stringify({
          msg: "lifecycle_timer_manager_not_wired",
          scheduleId,
        }),
      );
      return;
    }

    const instance = await this.lifecycleManager.getInstance(
      schedule.entity_name,
      schedule.entity_id,
      tenantId,
    );

    if (!instance) {
      console.log(
        JSON.stringify({
          msg: "lifecycle_timer_skipped_instance_not_found",
          scheduleId,
          entityName: schedule.entity_name,
          entityId: schedule.entity_id,
        }),
      );
      return;
    }

    // Evaluate conditions (if any) - requires entity record
    if (policyRules.conditions) {
      if (!this.genericDataAPI) {
        console.warn(
          JSON.stringify({
            msg: "lifecycle_timer_condition_evaluation_skipped",
            scheduleId,
            reason: "generic_data_api_not_available",
          }),
        );
      } else {
        const evalCtx: RequestContext = {
          userId: "system",
          tenantId,
          realmId: "system",
          roles: ["system"],
          metadata: { _timerExecution: true },
        };
        const record = await this.genericDataAPI.get(
          schedule.entity_name,
          schedule.entity_id,
          evalCtx,
        );
        if (!record) {
          console.warn(
            JSON.stringify({
              msg: "lifecycle_timer_condition_entity_not_found",
              scheduleId,
              entityName: schedule.entity_name,
              entityId: schedule.entity_id,
            }),
          );
          return;
        }
        const conditionMet = evaluateConditionGroup(
          policyRules.conditions as ConditionGroup,
          record as Record<string, unknown>,
        );
        if (!conditionMet) {
          console.log(
            JSON.stringify({
              msg: "lifecycle_timer_condition_not_met",
              scheduleId,
              entityName: schedule.entity_name,
              entityId: schedule.entity_id,
            }),
          );
          return;
        }
      }
    }

    // Execute transition
    const operationCode = policyRules.targetOperationCode ?? "AUTO_TRANSITION";
    const ctx: RequestContext = {
      userId: "system",
      tenantId,
      realmId: "system",
      roles: ["system"],
      metadata: { _timerExecution: true },
    };

    const result = await this.lifecycleManager.transition({
      entityName: schedule.entity_name,
      entityId: schedule.entity_id,
      operationCode,
      payload: {
        timerType: schedule.timer_type,
        scheduleId,
        triggeredBy: "lifecycle_timer",
      },
      ctx,
    });

    console.log(
      JSON.stringify({
        msg: "lifecycle_timer_executed",
        scheduleId,
        entityName: schedule.entity_name,
        entityId: schedule.entity_id,
        timerType: schedule.timer_type,
        operationCode,
        success: result.success,
        newState: result.newStateCode,
        error: result.error,
        reason: result.reason,
      }),
    );
  }

  // ===== Reminder Processing =====

  async processReminder(scheduleId: string, tenantId: string): Promise<void> {
    // Load schedule record
    const schedule = await this.db
      .selectFrom("wf.lifecycle_timer_schedule")
      .selectAll()
      .where("id", "=", scheduleId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!schedule) {
      console.warn(
        JSON.stringify({
          msg: "lifecycle_reminder_schedule_not_found",
          scheduleId,
          tenantId,
        }),
      );
      return;
    }

    if (schedule.status !== "scheduled") {
      console.log(
        JSON.stringify({
          msg: "lifecycle_reminder_already_processed",
          scheduleId,
          status: schedule.status,
        }),
      );
      return;
    }

    // Mark as fired
    await this.db
      .updateTable("wf.lifecycle_timer_schedule")
      .set({ status: "fired" })
      .where("id", "=", scheduleId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "lifecycle_reminder_fired",
        scheduleId,
        tenantId,
        entityName: schedule.entity_name,
        entityId: schedule.entity_id,
        timerType: schedule.timer_type,
      }),
    );

    // TODO (P1): Send notification via NotificationService
  }

  // ===== Timer Rehydration =====

  async rehydrateTimers(tenantId: string): Promise<number> {
    if (!this.jobQueue) {
      console.warn(
        JSON.stringify({
          msg: "lifecycle_timer_rehydration_skipped",
          reason: "job_queue_not_available",
          tenantId,
        }),
      );
      return 0;
    }

    // Query timers with future fire dates
    const now = new Date();
    const timers = await this.db
      .selectFrom("wf.lifecycle_timer_schedule")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "scheduled")
      .where("fire_at", ">", now)
      .execute();

    let rehydrated = 0;

    for (const timer of timers) {
      try {
        const policyRules = JSON.parse(
          timer.policy_snapshot as any,
        ) as LifecycleTimerRules;
        const fireAt = new Date(timer.fire_at);
        const delay = fireAt.getTime() - Date.now();

        if (delay <= 0) {
          console.log(
            JSON.stringify({
              msg: "lifecycle_timer_rehydration_skipped_past",
              scheduleId: timer.id,
              fireAt: fireAt.toISOString(),
            }),
          );
          continue;
        }

        // Reschedule BullMQ job
        const job = await this.jobQueue.add<LifecycleTimerPayload>(
          {
            type: TIMER_JOB_TYPES.AUTO_TRANSITION,
            payload: {
              scheduleId: timer.id,
              tenantId,
              entityName: timer.entity_name,
              entityId: timer.entity_id,
              timerType: timer.timer_type as LifecycleTimerType,
              policySnapshot: policyRules,
            },
            metadata: {
              entityName: timer.entity_name,
              entityId: timer.entity_id,
              timerType: timer.timer_type,
              rehydrated: true,
            },
          },
          { delay, attempts: 1 },
        );

        // Update job ID
        await this.db
          .updateTable("wf.lifecycle_timer_schedule")
          .set({ job_id: job.id })
          .where("id", "=", timer.id)
          .execute();

        rehydrated++;
      } catch (error) {
        console.error(
          JSON.stringify({
            msg: "lifecycle_timer_rehydration_failed",
            scheduleId: timer.id,
            error: String(error),
          }),
        );
      }
    }

    console.log(
      JSON.stringify({
        msg: "lifecycle_timers_rehydrated",
        tenantId,
        count: rehydrated,
      }),
    );

    return rehydrated;
  }

  // ===== Timer Queries =====

  async getActiveTimers(
    entityName: string,
    entityId: string,
    tenantId: string,
  ): Promise<LifecycleTimerSchedule[]> {
    const timers = await this.db
      .selectFrom("wf.lifecycle_timer_schedule")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_name", "=", entityName)
      .where("entity_id", "=", entityId)
      .where("status", "=", "scheduled")
      .orderBy("fire_at", "asc")
      .execute();

    return timers.map((row) => this.mapScheduleRow(row as any));
  }

  // ===== Health Check =====

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Check for stale timers (fire_at < now - 1hr and status='scheduled')
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const staleTimers = await this.db
        .selectFrom("wf.lifecycle_timer_schedule")
        .select(({ fn }) => [fn.countAll<number>().as("count")])
        .where("status", "=", "scheduled")
        .where("fire_at", "<", oneHourAgo)
        .executeTakeFirst();

      const staleCount = Number(staleTimers?.count ?? 0);

      // Check total active timers
      const activeTimers = await this.db
        .selectFrom("wf.lifecycle_timer_schedule")
        .select(({ fn }) => [fn.countAll<number>().as("count")])
        .where("status", "=", "scheduled")
        .executeTakeFirst();

      const activeCount = Number(activeTimers?.count ?? 0);

      const healthy =
        staleCount === 0 && !!this.jobQueue && !!this.lifecycleManager;

      return {
        healthy,
        message: healthy
          ? "Lifecycle timer service is healthy"
          : `Lifecycle timer service has issues: stale=${staleCount}, queue=${!!this.jobQueue}, manager=${!!this.lifecycleManager}`,
        details: {
          staleTimers: staleCount,
          activeTimers: activeCount,
          jobQueueConnected: !!this.jobQueue,
          lifecycleManagerWired: !!this.lifecycleManager,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Lifecycle timer health check failed: ${error}`,
        details: { error: String(error) },
      };
    }
  }

  // ===== Private Helpers =====

  private async getPolicy(
    policyId: string,
    tenantId: string,
  ): Promise<LifecycleTimerPolicy | undefined> {
    const row = await this.db
      .selectFrom("meta.lifecycle_timer_policy")
      .selectAll()
      .where("id", "=", policyId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      rules: JSON.parse(row.rules as any) as LifecycleTimerRules,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
    };
  }

  private calculateFireTime(
    rules: LifecycleTimerRules,
    triggerData?: Record<string, unknown>,
  ): Date | undefined {
    const now = Date.now();

    switch (rules.delayType) {
      case "fixed": {
        if (!rules.delayMs || rules.delayMs <= 0) {
          return undefined;
        }
        return new Date(now + rules.delayMs);
      }

      case "field_relative": {
        if (!rules.delayFromField || !triggerData) {
          return undefined;
        }
        const fieldValue = resolveFieldValue(rules.delayFromField, triggerData);
        if (!(fieldValue instanceof Date)) {
          // Try parsing as ISO string
          const parsedDate =
            typeof fieldValue === "string" ? new Date(fieldValue) : null;
          if (!parsedDate || isNaN(parsedDate.getTime())) {
            return undefined;
          }
          const offsetMs = rules.delayOffsetMs ?? 0;
          return new Date(parsedDate.getTime() + offsetMs);
        }
        const offsetMs = rules.delayOffsetMs ?? 0;
        return new Date(fieldValue.getTime() + offsetMs);
      }

      case "sla": {
        // SLA calculation based on business hours (future enhancement)
        // For now, fall back to fixed delay
        if (!rules.delayMs || rules.delayMs <= 0) {
          return undefined;
        }
        return new Date(now + rules.delayMs);
      }

      default:
        return undefined;
    }
  }

  private mapScheduleRow(row: any): LifecycleTimerSchedule {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityName: row.entity_name,
      entityId: row.entity_id,
      lifecycleId: row.lifecycle_id,
      stateId: row.state_id,
      timerType: row.timer_type as LifecycleTimerType,
      transitionId: row.transition_id ?? undefined,
      scheduledAt: new Date(row.scheduled_at),
      fireAt: new Date(row.fire_at),
      jobId: row.job_id,
      policyId: row.policy_id ?? undefined,
      policySnapshot: JSON.parse(row.policy_snapshot),
      status: row.status,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
    };
  }
}
