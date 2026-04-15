/**
 * SLA Check Worker — Phase 6: Full timer action execution
 *
 * Queue: jobs:sla-check
 * Schedule: every SLA_BREACH_CHECK_MS (default 5 min)
 *
 * Checks two SLA surfaces each sweep:
 *
 *   1. governance.cycle_task — finance close tasks past their due_at.
 *      Status PENDING or IN_PROGRESS + due_at < now() → mark BLOCKED,
 *      write event.outbox (topic='wf', event_type='sla.cycle_task.breach').
 *
 *   2. event.work_item — approval work items with SLA policies.
 *      For each overdue item, determines which timer thresholds from
 *      control.workflow_sla_policy.timers have been crossed since assigned_at,
 *      then EXECUTES the corresponding action:
 *
 *        reminder        → log workflow_event_log + publish outbox notification
 *        escalate        → reassign / notify escalation_chain targets
 *        auto_approve    → WorkflowEngine.processAction (action='approve')
 *        auto_reject     → WorkflowEngine.processAction (action='reject')
 *
 * Idempotency: Each timer action is keyed by sla:action:{work_item_id}:{after_minutes}
 * in event.outbox. A crossing is only executed once (ON CONFLICT DO NOTHING).
 *
 * Concurrency: 1 (single SLA sweep at a time — prevents race-escalate)
 */

import { Worker } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import {
  QUEUE_NAME,
  SYSTEM_ACTOR_ID,
  type SlaCheckJobData,
  type JobLogger,
} from "../jobs.types.js";
import { WorkflowEngine } from "../../workflow/engine.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

const BATCH = 100;

// ── Timer & escalation types ──────────────────────────────────────────────────

interface SlaTimer {
  after_minutes:        number;
  action:               "reminder" | "escalate" | "auto_approve" | "auto_reject";
  notify_roles?:        string[];
  message_template_key?: string;
}

interface EscalationTarget {
  type:   "principal" | "role" | "requester_manager";
  value:  string;       // uuid or role code
  notify: boolean;
}

// ─── Helper: safe JSON parse ──────────────────────────────────────────────────

function parseJson<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as T[]; } catch { return []; }
  }
  return [];
}

// ─── Governance cycle task SLA ────────────────────────────────────────────────

interface OverdueCycleTask {
  id:           string;
  tenant_id:    string;
  cycle_run_id: string;
  task_code:    string;
  is_mandatory: boolean;
  assigned_to:  string | null;
}

async function checkCycleTasks(db: DB, logger?: JobLogger): Promise<void> {
  const overdue = await sql<OverdueCycleTask>`
    SELECT id, tenant_id, cycle_run_id, task_code, is_mandatory, assigned_to
    FROM   governance.cycle_task
    WHERE  status IN ('PENDING', 'IN_PROGRESS')
      AND  due_at < now()
      AND  due_at IS NOT NULL
    ORDER  BY due_at ASC
    LIMIT  ${BATCH}
  `.execute(db);

  if (overdue.rows.length === 0) return;

  // Batch idempotency check — one query for all tasks instead of N queries
  const allKeys = overdue.rows.map((t) => `sla:cycle_task:${t.id}`);
  const existingResult = await sql<{ event_key: string }>`
    SELECT event_key FROM event.outbox
    WHERE  topic = 'wf' AND event_key = ANY(${allKeys}) AND status != 'dead_letter'
  `.execute(db);
  const alreadyPublished = new Set(existingResult.rows.map((r) => r.event_key));

  let breached = 0;
  for (const task of overdue.rows) {
    const outboxKey = `sla:cycle_task:${task.id}`;
    if (alreadyPublished.has(outboxKey)) continue;

    await sql`
      UPDATE governance.cycle_task
      SET    status = 'BLOCKED', updated_at = now()
      WHERE  id = ${task.id}::uuid AND status IN ('PENDING', 'IN_PROGRESS')
    `.execute(db);

    const payload = JSON.stringify({
      taskId:       task.id,
      cycleRunId:   task.cycle_run_id,
      taskCode:     task.task_code,
      isMandatory:  task.is_mandatory,
      assignedTo:   task.assigned_to,
      breachedAt:   new Date().toISOString(),
    });

    await sql`
      INSERT INTO event.outbox
        (tenant_id,              topic, event_type,               event_key,
         payload,                status, created_by)
      VALUES
        (${task.tenant_id}::uuid, 'wf', 'sla.cycle_task.breach', ${outboxKey},
         ${payload}::jsonb,       'pending', ${SYSTEM_ACTOR_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);

    breached++;
  }

  logger?.info("sla_check_cycle_tasks", { scanned: overdue.rows.length, breached });
}

// ─── Workflow work_item SLA ───────────────────────────────────────────────────

interface OverdueWorkItem {
  id:                  string;
  tenant_id:           string;
  workflow_request_id: string | null;
  workflow_stage_id:   string | null;
  task_type:           string;
  assignee_id:         string | null;
  assigned_at:         string | null;
  sla_policy_id:       string | null;
  timers:              unknown | null;
  escalation_chain:    unknown | null;
}

/**
 * Execute a single SLA timer action for an overdue work_item.
 *
 * auto_approve / auto_reject → WorkflowEngine.processAction()
 * escalate                   → update assignee from escalation_chain + notify
 * reminder                   → workflow_event_log entry + outbox notification
 */
async function executeSlaAction(
  db:               DB,
  item:             OverdueWorkItem,
  timer:            SlaTimer,
  escalationChain:  EscalationTarget[],
  logger?:          JobLogger,
): Promise<void> {
  const { action, after_minutes, notify_roles, message_template_key } = timer;

  if (action === "auto_approve" || action === "auto_reject") {
    // ── Auto-terminal actions ──────────────────────────────────────────────
    const wfAction = action === "auto_approve" ? "approve" : "reject";
    const engine   = new WorkflowEngine({ db, logger: logger ? {
      error: (e, f) => logger.error(e, f),
      info:  (e, f) => logger.info?.(e, f),
    } : undefined });

    try {
      await engine.processAction({
        workItemId: item.id,
        actorId:    SYSTEM_ACTOR_ID,
        tenantId:   item.tenant_id,
        action:     wfAction,
        comment:    `Auto-${wfAction} by SLA policy after ${after_minutes} minutes without response.`,
      });
      logger?.info("sla_auto_action_executed", {
        workItemId: item.id,
        action:     wfAction,
        after_minutes,
      });
    } catch (err) {
      // Work item may already be in a terminal state — non-fatal
      logger?.warn("sla_auto_action_skipped", {
        workItemId: item.id,
        action:     wfAction,
        reason:     err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (action === "escalate") {
    // ── Escalation: notify escalation chain, update assignee if principal ──
    if (escalationChain.length === 0) {
      logger?.warn("sla_escalate_no_chain", { workItemId: item.id });
      return;
    }

    // Determine escalation level from work_item metadata (default 0)
    const metaRaw = await sql<{ metadata: unknown }>`
      SELECT metadata FROM event.work_item WHERE id = ${item.id}::uuid
    `.execute(db);
    const meta = metaRaw.rows[0]?.metadata;
    const metaObj = (typeof meta === "string" ? JSON.parse(meta) : meta ?? {}) as Record<string, unknown>;
    const currentLevel = typeof metaObj["sla_escalation_level"] === "number"
      ? metaObj["sla_escalation_level"]
      : 0;
    const nextTarget = escalationChain[currentLevel] ?? escalationChain[escalationChain.length - 1];
    if (!nextTarget) return;

    // Reassign if the target is a direct principal
    if (nextTarget.type === "principal") {
      await sql`
        UPDATE event.work_item
        SET    assignee_id = ${nextTarget.value}::uuid,
               status      = 'pending',
               assigned_at = now(),
               metadata    = metadata || ${JSON.stringify({ sla_escalation_level: currentLevel + 1 })}::jsonb,
               updated_at  = now()
        WHERE  id = ${item.id}::uuid
          AND  status IN ('pending', 'claimed', 'in_progress')
      `.execute(db);
    }

    // Publish escalation outbox event (notification worker picks it up)
    const escPayload = JSON.stringify({
      workItemId:         item.id,
      workflowRequestId:  item.workflow_request_id,
      workflowStageId:    item.workflow_stage_id,
      escalationTarget:   nextTarget,
      escalationLevel:    currentLevel,
      after_minutes,
      messageTemplateKey: message_template_key ?? "wf.sla.escalate",
      notifyRoles:        notify_roles ?? [],
      breachedAt:         new Date().toISOString(),
    });

    await sql`
      INSERT INTO event.outbox
        (tenant_id,              topic, event_type,          payload,
         status,                 created_by)
      VALUES
        (${item.tenant_id}::uuid, 'wf', 'sla.work_item.escalated', ${escPayload}::jsonb,
         'pending',               ${SYSTEM_ACTOR_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);

    logger?.info("sla_escalated", {
      workItemId: item.id,
      level:      currentLevel,
      targetType: nextTarget.type,
      targetValue: nextTarget.value,
    });
    return;
  }

  if (action === "reminder") {
    // ── Reminder: log event + publish notification outbox ──────────────────
    const reminderPayload = JSON.stringify({
      workItemId:         item.id,
      workflowRequestId:  item.workflow_request_id,
      workflowStageId:    item.workflow_stage_id,
      assigneeId:         item.assignee_id,
      after_minutes,
      notifyRoles:        notify_roles ?? [],
      messageTemplateKey: message_template_key ?? "wf.sla.reminder",
      remindedAt:         new Date().toISOString(),
    });

    await sql`
      INSERT INTO event.outbox
        (tenant_id,              topic, event_type,         payload,
         status,                 created_by)
      VALUES
        (${item.tenant_id}::uuid, 'wf', 'sla.work_item.reminder', ${reminderPayload}::jsonb,
         'pending',               ${SYSTEM_ACTOR_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);

    logger?.info("sla_reminder_sent", { workItemId: item.id, after_minutes });
  }
}

async function checkWorkflowWorkItems(db: DB, logger?: JobLogger): Promise<void> {
  // Join workflow_stage to get sla_policy_id + load policy timers in one query
  const overdue = await sql<OverdueWorkItem>`
    SELECT
      wi.id,
      wi.tenant_id,
      wi.workflow_request_id::text,
      wi.workflow_stage_id::text,
      wi.task_type,
      wi.assignee_id::text,
      wi.assigned_at::text,
      sp.id::text        AS sla_policy_id,
      sp.timers          AS timers,
      sp.escalation_chain AS escalation_chain
    FROM   event.work_item                wi
    LEFT JOIN document.workflow_stage     ws ON ws.id = wi.workflow_stage_id
    LEFT JOIN control.workflow_sla_policy sp ON sp.id = ws.sla_policy_id
    WHERE  wi.status IN ('pending', 'claimed', 'in_progress')
      AND  wi.assigned_at IS NOT NULL
      AND  wi.due_at IS NOT NULL
      AND  wi.due_at < now()
    ORDER  BY wi.due_at ASC
    LIMIT  ${BATCH}
  `.execute(db);

  if (overdue.rows.length === 0) return;

  let actionsExecuted = 0;

  for (const item of overdue.rows) {
    if (!item.sla_policy_id || !item.timers) {
      // No SLA policy — apply legacy breach fallback (escalate status + outbox)
      const fallbackKey = `sla:work_item:${item.id}`;
      const existing = await sql<{ id: string }>`
        SELECT id FROM event.outbox
        WHERE  topic = 'wf' AND event_key = ${fallbackKey} AND status != 'dead_letter'
        LIMIT  1
      `.execute(db);
      if (existing.rows.length > 0) continue;

      await sql`
        UPDATE event.work_item
        SET    status = 'escalated', updated_at = now()
        WHERE  id = ${item.id}::uuid
          AND  status IN ('pending', 'claimed', 'in_progress')
      `.execute(db);

      const payload = JSON.stringify({
        workItemId:         item.id,
        taskType:           item.task_type,
        workflowRequestId:  item.workflow_request_id,
        workflowStageId:    item.workflow_stage_id,
        assigneeId:         item.assignee_id,
        breachedAt:         new Date().toISOString(),
      });

      await sql`
        INSERT INTO event.outbox
          (tenant_id,              topic, event_type,              event_key,
           payload,                status, created_by)
        VALUES
          (${item.tenant_id}::uuid, 'wf', 'sla.work_item.breach', ${fallbackKey},
           ${payload}::jsonb,       'pending', ${SYSTEM_ACTOR_ID}::uuid)
        ON CONFLICT DO NOTHING
      `.execute(db);

      actionsExecuted++;
      continue;
    }

    // ── Policy-driven SLA execution ────────────────────────────────────────
    const timers          = parseJson<SlaTimer>(item.timers);
    const escalationChain = parseJson<EscalationTarget>(item.escalation_chain);

    if (timers.length === 0) continue;

    // Calculate elapsed minutes since assigned_at
    const assignedAt    = item.assigned_at ? new Date(item.assigned_at) : null;
    if (!assignedAt) continue;
    const elapsedMs     = Date.now() - assignedAt.getTime();
    const elapsedMinutes = elapsedMs / 60_000;

    // All thresholds that have been crossed (oldest first)
    const crossedTimers = timers
      .filter((t) => t.after_minutes <= elapsedMinutes)
      .sort((a, b) => a.after_minutes - b.after_minutes);

    for (const timer of crossedTimers) {
      const actionKey = `sla:action:${item.id}:${timer.after_minutes}`;

      // Idempotency: skip if this timer action was already recorded
      const already = await sql<{ id: string }>`
        SELECT id FROM event.outbox
        WHERE  event_key = ${actionKey} AND status != 'dead_letter'
        LIMIT  1
      `.execute(db);
      if (already.rows.length > 0) continue;

      // Execute the action
      await executeSlaAction(db, item, timer, escalationChain, logger);

      // Record execution to prevent re-firing (idempotency anchor)
      await sql`
        INSERT INTO event.outbox
          (tenant_id,              topic, event_type,
           event_key,              payload,            status, created_by)
        VALUES
          (${item.tenant_id}::uuid, 'wf', ${"sla." + timer.action},
           ${actionKey},
           ${JSON.stringify({ workItemId: item.id, action: timer.action, after_minutes: timer.after_minutes })}::jsonb,
           'pending',              ${SYSTEM_ACTOR_ID}::uuid)
        ON CONFLICT DO NOTHING
      `.execute(db);

      actionsExecuted++;

      // Terminal actions (auto_approve / auto_reject) end the SLA cascade —
      // no point executing further timer thresholds for this work_item.
      if (timer.action === "auto_approve" || timer.action === "auto_reject") break;
    }
  }

  logger?.info("sla_check_work_items", {
    overdue:  overdue.rows.length,
    executed: actionsExecuted,
  });
}

// ─── Workflow recovery: stuck work items ─────────────────────────────────────
//
// Detects work items in active states that have had no event_log activity for
// longer than STUCK_THRESHOLD_HOURS. Publishes a `wf.work_item.stuck` outbox
// event so operators can review and retry or escalate manually.
//
// Idempotency window: a `wf:stuck:<id>:<day>` key prevents re-alerting within
// the same calendar day. The day suffix rolls automatically each day.

const STUCK_THRESHOLD_HOURS = 24;

interface StuckWorkItem {
  id:                  string;
  tenant_id:           string;
  workflow_request_id: string | null;
  workflow_stage_id:   string | null;
  task_type:           string;
  assignee_id:         string | null;
  started_at:          string | null;
  status:              string;
}

async function checkStuckWorkItems(db: DB, logger?: JobLogger): Promise<void> {
  // Find work items that are in an active state, started more than N hours ago,
  // and have had no workflow_event_log entry in the last N hours.
  const stuck = await sql<StuckWorkItem>`
    SELECT
      wi.id,
      wi.tenant_id,
      wi.workflow_request_id::text,
      wi.workflow_stage_id::text,
      wi.task_type,
      wi.assignee_id::text,
      wi.started_at::text,
      wi.status
    FROM   event.work_item wi
    WHERE  wi.status IN ('pending', 'in_progress')
      AND  wi.started_at IS NOT NULL
      AND  wi.started_at < now() - (${STUCK_THRESHOLD_HOURS} * interval '1 hour')
      AND  NOT EXISTS (
             SELECT 1
             FROM   log.workflow_event_log el
             WHERE  el.work_item_id = wi.id
               AND  el.created_at   > now() - (${STUCK_THRESHOLD_HOURS} * interval '1 hour')
           )
    ORDER  BY wi.started_at ASC
    LIMIT  ${BATCH}
  `.execute(db);

  if (stuck.rows.length === 0) return;

  // Day key prevents re-alerting more than once per day per item
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Batch idempotency check
  const allKeys = stuck.rows.map((wi) => `wf:stuck:${wi.id}:${today}`);
  const existingResult = await sql<{ event_key: string }>`
    SELECT event_key FROM event.outbox
    WHERE  topic      = 'wf'
      AND  event_key  = ANY(${allKeys})
      AND  status    != 'dead_letter'
  `.execute(db);
  const alreadyPublished = new Set(existingResult.rows.map((r) => r.event_key));

  let flagged = 0;
  for (const item of stuck.rows) {
    const outboxKey = `wf:stuck:${item.id}:${today}`;
    if (alreadyPublished.has(outboxKey)) continue;

    const payload = JSON.stringify({
      workItemId:         item.id,
      taskType:           item.task_type,
      workflowRequestId:  item.workflow_request_id,
      workflowStageId:    item.workflow_stage_id,
      assigneeId:         item.assignee_id,
      status:             item.status,
      startedAt:          item.started_at,
      stuckThresholdHours: STUCK_THRESHOLD_HOURS,
      detectedAt:         new Date().toISOString(),
    });

    await sql`
      INSERT INTO event.outbox
        (tenant_id,              topic, event_type,          event_key,
         payload,                status, created_by)
      VALUES
        (${item.tenant_id}::uuid, 'wf', 'wf.work_item.stuck', ${outboxKey},
         ${payload}::jsonb,       'pending', ${SYSTEM_ACTOR_ID}::uuid)
      ON CONFLICT DO NOTHING
    `.execute(db);

    flagged++;
  }

  if (flagged > 0) {
    logger?.warn("wf_recovery_stuck_items_flagged", {
      scanned: stuck.rows.length,
      flagged,
      thresholdHours: STUCK_THRESHOLD_HOURS,
    });
  } else {
    logger?.info("wf_recovery_check", { scanned: stuck.rows.length, flagged: 0 });
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface SlaCheckWorkerDeps {
  db:         DB;
  connection: ConnectionOptions;
  logger?:    JobLogger;
}

export function createSlaCheckWorker(deps: SlaCheckWorkerDeps): Worker {
  const { db, connection, logger } = deps;

  return new Worker<SlaCheckJobData>(
    QUEUE_NAME.SLA_CHECK,
    async (_job: Job<SlaCheckJobData>) => {
      // Run all three checks in parallel — they touch separate tables
      await Promise.all([
        checkCycleTasks(db, logger),
        checkWorkflowWorkItems(db, logger),
        checkStuckWorkItems(db, logger),
      ]);
    },
    { connection, concurrency: 1 },
  );
}
