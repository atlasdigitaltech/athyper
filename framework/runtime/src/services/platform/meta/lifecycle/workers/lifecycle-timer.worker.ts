/**
 * Lifecycle Timer Worker — BullMQ job handler for auto-transitions.
 *
 * Handles delayed job execution for scheduled lifecycle transitions.
 * Mirrors the SLA timer worker pattern from approval system.
 *
 * Job types:
 *   - "lifecycle-auto-transition" — Executes automatic state transition when timer fires
 *   - "lifecycle-reminder" — Sends reminder notification (future enhancement)
 *
 * Guard-checked: skips execution if timer was canceled or entity state changed.
 */

import type { Job, JobHandler } from "@athyper/core";
import type { LifecycleTimerService, LifecycleTimerPayload } from "@athyper/core/meta";

// ============================================================================
// Job Type Constants
// ============================================================================

export const TIMER_JOB_TYPES = {
  AUTO_TRANSITION: "lifecycle-auto-transition",
  REMINDER: "lifecycle-reminder",
} as const;

// ============================================================================
// Worker Handler Factory
// ============================================================================

/**
 * Creates a BullMQ handler for lifecycle auto-transition jobs.
 *
 * When fired, the handler delegates to LifecycleTimerService.processTimer()
 * which includes guard checks:
 * - Timer not already fired or canceled
 * - Entity still exists
 * - Conditions still met (if defined)
 *
 * @param timerService - Lifecycle timer service
 * @returns BullMQ job handler function
 */
export function createAutoTransitionHandler(
  timerService: LifecycleTimerService
): JobHandler<LifecycleTimerPayload, void> {
  return async (job: Job<LifecycleTimerPayload>): Promise<void> => {
    const { scheduleId, tenantId } = job.data.payload;

    // Delegate to timer service (includes all guard checks)
    await timerService.processTimer(scheduleId, tenantId);
  };
}

/**
 * Creates a BullMQ handler for lifecycle reminder jobs.
 *
 * Delegates to LifecycleTimerService.processReminder() which:
 * - Verifies the schedule is still active
 * - Marks the schedule as fired
 * - Logs the reminder event
 *
 * @param timerService - Lifecycle timer service
 * @returns BullMQ job handler function
 */
export function createReminderHandler(
  timerService: LifecycleTimerService
): JobHandler<LifecycleTimerPayload, void> {
  return async (job: Job<LifecycleTimerPayload>): Promise<void> => {
    const { scheduleId, tenantId } = job.data.payload;

    // Delegate to timer service (includes guard checks)
    await timerService.processReminder(scheduleId, tenantId);
  };
}
