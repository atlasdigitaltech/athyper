/**
 * WorkflowEngine — core workflow processing service.
 *
 * Responsibilities:
 *   - shouldRequireWorkflow: evaluate control.workflow_definition rules
 *   - createRequest: create workflow_request + stages + work_items in a transaction
 *   - processAction: approve/reject/delegate on a work_item
 *   - evaluateQuorum: advance or close stages after each action
 *   - getInbox / getInboxCount: actor's pending work_items
 *   - getRequestDetail: full approval context for a request
 *   - getActivity: workflow_event_log for a request
 *
 * DB constraint relied upon:
 *   wreq_one_pending_per_entity_uix  — one pending workflow_request per entity.
 *   The engine checks for an existing pending request before inserting (idempotent).
 */

import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import { evaluateJsonLogic } from "./jsonlogic.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowEngineDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
}

interface CompiledStage {
  stage_no: number;
  name?: string;
  mode?: string;
  quorum?: { strategy: string; required?: number } | null;
  sla_policy_id?: string | null;
  template_stage_id?: string | null;
  rules?: CompiledRule[];
}

interface CompiledTemplate {
  stages: CompiledStage[];
  behaviors: Record<string, unknown>;
}

interface CompiledRule {
  priority?: number;
  conditions?: unknown;
  assign_to: { type: string; value?: string };
}

export interface ShouldRequireResult {
  required: boolean;
  definitionId?: string;
  templateCode?: string;
  workflowType?: string;
}

export interface CreateRequestParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  entityVersionId?: string;
  /**
   * Full entity payload used for JSONLogic rule evaluation + entity_snapshot.
   * companyCodeId and legalEntityId are merged in automatically — callers do
   * not need to duplicate them inside payload.
   */
  payload: Record<string, unknown>;
  /**
   * Company code UUID at the time of submission.
   * Injected as `company_code_id` into the JSONLogic evaluation context so
   * workflow definitions can branch by company without a dedicated column.
   */
  companyCodeId?: string;
  /**
   * Legal entity UUID at the time of submission.
   * Injected as `legal_entity_id` into the JSONLogic evaluation context.
   */
  legalEntityId?: string;
  requestedBy: string;
  correlationId?: string;
  /** Override approvers from policy engine (Phase 5). */
  overrideApprovers?: Array<{ type: string; value: string }>;
}

export interface CreateRequestResult {
  id: string;
  /** true when an existing pending request was returned (idempotent). */
  isExisting: boolean;
  status: string;
}

export interface ProcessActionParams {
  workItemId: string;
  actorId: string;
  tenantId: string;
  /** approve | reject | escalate | delegate | acknowledge | flag | read */
  action: string;
  comment?: string;
  /** Required when action === 'delegate'. */
  delegateTo?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";
const TERMINAL_STATUSES = new Set(["completed", "skipped", "escalated"]);
const POSITIVE_DECISIONS = new Set(["approve", "acknowledge", "read"]);
const NEGATIVE_DECISIONS = new Set(["reject", "flag"]);

// ── Engine ────────────────────────────────────────────────────────────────────

export class WorkflowEngine {
  constructor(private readonly deps: WorkflowEngineDeps) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): Kysely<any> { return this.deps.db; }

  // ── shouldRequireWorkflow ──────────────────────────────────────────────────

  /**
   * Evaluate control.workflow_definition rules against an entity payload.
   *
   * evaluationPayload should already contain org-context fields
   * (company_code_id, legal_entity_id, tenant_id) so JSONLogic conditions
   * can branch at sub-tenant level. Use buildEvaluationPayload() to construct it.
   */
  async shouldRequireWorkflow(
    entityType: string,
    tenantId: string,
    evaluationPayload: Record<string, unknown>,
  ): Promise<ShouldRequireResult> {
    const now = new Date();
    const defs = await this.db
      .selectFrom("control.workflow_definition as wd")
      .select(["wd.id", "wd.rules"])
      .where("wd.tenant_id", "=", tenantId)
      .where("wd.entity_type", "=", entityType)
      .where("wd.is_active", "=", true)
      .where("wd.effective_from", "<=", now)
      .where((eb) =>
        eb.or([
          eb("wd.effective_to", "is", null),
          eb("wd.effective_to", ">", now),
        ]),
      )
      .orderBy("wd.effective_from", "asc")
      .execute();

    for (const def of defs) {
      const rules = (
        typeof def.rules === "string" ? JSON.parse(def.rules) : def.rules
      ) as Array<{
        condition?: unknown;
        template_code: string;
        workflow_type?: string;
        priority?: number;
      }>;

      const sorted = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
      for (const rule of sorted) {
        if (rule.condition == null || evaluateJsonLogic(rule.condition, evaluationPayload)) {
          return {
            required: true,
            definitionId: def.id as string,
            templateCode: rule.template_code,
            workflowType: rule.workflow_type ?? "approval",
          };
        }
      }
    }
    return { required: false };
  }

  // ── createRequest ──────────────────────────────────────────────────────────

  async createRequest(params: CreateRequestParams): Promise<CreateRequestResult> {
    const {
      tenantId,
      entityType,
      entityId,
      entityVersionId,
      payload,
      companyCodeId,
      legalEntityId,
      requestedBy,
      correlationId,
      overrideApprovers,
    } = params;

    // Build evaluation payload: merge org-context fields so JSONLogic conditions
    // can branch by company code / legal entity without them needing to be in
    // the caller's payload explicitly.
    const evaluationPayload: Record<string, unknown> = {
      ...payload,
      tenant_id: tenantId,
      ...(companyCodeId ? { company_code_id: companyCodeId } : {}),
      ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
    };

    // Idempotency: return existing pending request if one exists
    const existing = await this.db
      .selectFrom("document.workflow_request as wr")
      .select(["wr.id", "wr.status"])
      .where("wr.tenant_id", "=", tenantId)
      .where("wr.entity_type", "=", entityType)
      .where("wr.entity_id", "=", entityId)
      .where("wr.status", "=", "pending")
      .executeTakeFirst();

    if (existing) {
      return { id: existing.id as string, isExisting: true, status: existing.status as string };
    }

    // Find matching workflow definition + template
    const wfReq = await this.shouldRequireWorkflow(entityType, tenantId, evaluationPayload);
    if (!wfReq.required || !wfReq.definitionId || !wfReq.templateCode) {
      throw Object.assign(
        new Error("NO_WORKFLOW_DEFINITION: no active definition matches this entity"),
        { code: 422 },
      );
    }

    const template = await this.db
      .selectFrom("control.workflow_template as wt")
      .select([
        "wt.id",
        "wt.code",
        "wt.compiled_json",
        "wt.compiled_hash",
        "wt.behaviors",
        "wt.sla_policy_id",
      ])
      .where("wt.code", "=", wfReq.templateCode)
      .where((eb) =>
        eb.or([
          eb("wt.tenant_id", "=", tenantId),
          eb("wt.tenant_id", "is", null),
        ]),
      )
      .where("wt.is_active", "=", true)
      // Prefer tenant-specific over platform-global
      .orderBy("wt.tenant_id", sql`desc nulls last`)
      .executeTakeFirst();

    if (!template) {
      throw Object.assign(
        new Error(`TEMPLATE_NOT_FOUND: '${wfReq.templateCode}'`),
        { code: 422 },
      );
    }
    if (!template.compiled_hash) {
      throw Object.assign(
        new Error(`TEMPLATE_NOT_COMPILED: '${wfReq.templateCode}' must be compiled before use`),
        { code: 422 },
      );
    }

    const compiledJson = (
      typeof template.compiled_json === "string"
        ? JSON.parse(template.compiled_json)
        : template.compiled_json
    ) as CompiledTemplate;

    const behaviors = (
      typeof template.behaviors === "string"
        ? JSON.parse(template.behaviors)
        : template.behaviors
    ) as Record<string, unknown> ?? {};

    return this.db.transaction().execute(async (trx) => {
      // Insert workflow_request
      const reqRow = await trx
        .insertInto("document.workflow_request" as never)
        .values({
          tenant_id: tenantId,
          workflow_type: wfReq.workflowType ?? "approval",
          workflow_definition_id: wfReq.definitionId,
          workflow_template_id: template.id,
          template_snapshot: JSON.stringify(compiledJson),
          entity_type: entityType,
          entity_id: entityId,
          entity_version_id: entityVersionId ?? null,
          entity_snapshot:
            behaviors["capture_entity_snapshot"] !== false
              ? JSON.stringify(payload)
              : null,
          requested_by: requestedBy,
          requested_at: new Date(),
          status: "pending",
          metadata: "{}",
          correlation_id: correlationId ?? null,
          created_by: requestedBy,
        } as never)
        .returning("id" as never)
        .executeTakeFirstOrThrow();

      const requestId = (reqRow as Record<string, unknown>).id as string;

      // Insert all workflow_stage rows upfront (version-pinned from compiledJson)
      for (const stage of compiledJson.stages ?? []) {
        await trx
          .insertInto("document.workflow_stage" as never)
          .values({
            tenant_id: tenantId,
            workflow_request_id: requestId,
            template_stage_id: stage.template_stage_id ?? null,
            stage_no: stage.stage_no,
            name: stage.name ?? null,
            mode: stage.mode ?? "serial",
            quorum: stage.quorum != null ? JSON.stringify(stage.quorum) : null,
            sla_policy_id: stage.sla_policy_id ?? template.sla_policy_id ?? null,
            status: "pending",
            created_by: requestedBy,
          } as never)
          .execute();
      }

      // Activate stage 1
      const stage1Row = await trx
        .selectFrom("document.workflow_stage as ws")
        .select(["ws.id", "ws.sla_policy_id"])
        .where("ws.workflow_request_id", "=", requestId)
        .where("ws.stage_no", "=", 1)
        .executeTakeFirstOrThrow();

      const stage1 = stage1Row as Record<string, unknown>;

      await trx
        .updateTable("document.workflow_stage" as never)
        .set({
          status: "active",
          started_at: new Date(),
          updated_at: new Date(),
          updated_by: requestedBy,
        } as never)
        .where("id" as never, "=", stage1.id)
        .execute();

      // Create work_items for stage 1
      const stage1Compiled = compiledJson.stages?.[0];
      const rules = overrideApprovers
        ? overrideApprovers.map((a, i) => ({ priority: i + 1, assign_to: { type: a.type, value: a.value } }))
        : (stage1Compiled?.rules ?? []);

      await this.createWorkItems(trx, {
        tenantId,
        requestId,
        stageId: stage1.id as string,
        stageMode: stage1Compiled?.mode ?? "serial",
        rules,
        payload: evaluationPayload,
        slaPolicyId: stage1.sla_policy_id as string | null,
        createdBy: requestedBy,
      });

      await this.logEvent(trx, {
        tenantId,
        eventType: "request_created",
        entityType,
        entityId: requestId,
        actorId: requestedBy,
        instanceId: requestId,
        toStatus: "pending",
        correlationId,
        detail: {
          definition_id: wfReq.definitionId,
          template_code: wfReq.templateCode,
        },
      });

      return { id: requestId, isExisting: false, status: "pending" };
    });
  }

  // ── processAction ──────────────────────────────────────────────────────────

  async processAction(params: ProcessActionParams): Promise<void> {
    const { workItemId, actorId, tenantId, action, comment, delegateTo } = params;

    await this.db.transaction().execute(async (trx) => {
      // Lock work_item row for the duration of the transaction
      const itemRow = await trx
        .selectFrom("event.work_item as wi")
        .selectAll()
        .where("wi.id", "=", workItemId)
        .where("wi.tenant_id", "=", tenantId)
        .forUpdate()
        .executeTakeFirst();

      if (!itemRow) {
        throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"), { code: 404 });
      }
      const wi = itemRow as Record<string, unknown>;

      if (TERMINAL_STATUSES.has(wi.status as string)) {
        throw Object.assign(new Error("WORK_ITEM_ALREADY_CLOSED"), { code: 409 });
      }

      // Authorization: must be the designated assignee or the group is set (claimable)
      const isDirectAssignee = wi.assignee_id === actorId;
      const isGroupClaim = wi.assignee_group_id != null && wi.assignee_id == null;
      const isTeamClaim = wi.assignee_team_id != null && wi.assignee_id == null;

      if (!isDirectAssignee && !isGroupClaim && !isTeamClaim) {
        throw Object.assign(new Error("NOT_AUTHORIZED_FOR_WORK_ITEM"), { code: 403 });
      }

      // Load request for behaviors + entity context
      const reqRow = await trx
        .selectFrom("document.workflow_request as wr")
        .select([
          "wr.requested_by",
          "wr.template_snapshot",
          "wr.entity_type",
          "wr.entity_id",
          "wr.entity_snapshot",
        ])
        .where("wr.id", "=", wi.workflow_request_id)
        .executeTakeFirst();

      if (!reqRow) {
        throw Object.assign(new Error("REQUEST_NOT_FOUND"), { code: 404 });
      }
      const req = reqRow as Record<string, unknown>;

      const snapshot = (
        typeof req.template_snapshot === "string"
          ? JSON.parse(req.template_snapshot)
          : req.template_snapshot
      ) as CompiledTemplate;
      const behaviors = snapshot?.behaviors ?? {};

      // Self-approval guard
      if (
        behaviors["allow_self_approval"] === false &&
        actorId === (req.requested_by as string) &&
        action === "approve"
      ) {
        throw Object.assign(new Error("SELF_APPROVAL_NOT_ALLOWED"), { code: 422 });
      }

      // Delegate: reassign the work_item, not a terminal decision
      if (action === "delegate") {
        if (!delegateTo) {
          throw Object.assign(new Error("DELEGATE_TARGET_REQUIRED"), { code: 400 });
        }
        await trx
          .updateTable("event.work_item" as never)
          .set({
            assignee_id: delegateTo,
            status: "assigned",
            assigned_at: new Date(),
            updated_at: new Date(),
            updated_by: actorId,
          } as never)
          .where("id" as never, "=", workItemId)
          .execute();

        await this.logEvent(trx, {
          tenantId,
          eventType: "item_reassigned",
          entityType: req.entity_type as string,
          entityId: wi.workflow_request_id as string,
          actorId,
          instanceId: wi.workflow_request_id as string,
          stepInstanceId: workItemId,
          action,
          comment,
          detail: { delegate_to: delegateTo },
        });
        return;
      }

      // Terminal action
      const newStatus = action === "escalate" ? "escalated" : "completed";
      await trx
        .updateTable("event.work_item" as never)
        .set({
          status: newStatus,
          decision: action,
          reason: comment ?? null,
          completed_at: new Date(),
          // Claim group/team assignment on first action
          ...(isGroupClaim || isTeamClaim
            ? { assignee_id: actorId, assigned_at: new Date() }
            : {}),
          updated_at: new Date(),
          updated_by: actorId,
        } as never)
        .where("id" as never, "=", workItemId)
        .execute();

      await this.logEvent(trx, {
        tenantId,
        eventType: "item_completed",
        entityType: req.entity_type as string,
        entityId: wi.workflow_request_id as string,
        actorId,
        instanceId: wi.workflow_request_id as string,
        stepInstanceId: workItemId,
        action,
        comment,
        toStatus: newStatus,
        detail: { decision: action },
      });

      // Quorum check for stage-linked work items
      if (wi.workflow_stage_id) {
        const entityPayload = (
          typeof req.entity_snapshot === "string"
            ? JSON.parse(req.entity_snapshot)
            : req.entity_snapshot
        ) as Record<string, unknown> ?? {};

        await this.evaluateQuorum(trx, {
          stageId: wi.workflow_stage_id as string,
          requestId: wi.workflow_request_id as string,
          tenantId,
          actorId,
          entityType: req.entity_type as string,
          entityPayload,
          behaviors,
          templateSnapshot: snapshot,
        });
      }
    });
  }

  // ── evaluateQuorum ─────────────────────────────────────────────────────────

  private async evaluateQuorum(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      stageId: string;
      requestId: string;
      tenantId: string;
      actorId: string;
      entityType: string;
      entityPayload: Record<string, unknown>;
      behaviors: Record<string, unknown>;
      templateSnapshot: CompiledTemplate;
    },
  ): Promise<void> {
    const { stageId, requestId, tenantId, actorId, entityType, entityPayload, behaviors, templateSnapshot } = params;

    // Lock stage for serialized quorum evaluation
    const stageRow = await trx
      .selectFrom("document.workflow_stage as ws")
      .selectAll()
      .where("ws.id", "=", stageId)
      .forUpdate()
      .executeTakeFirst();

    if (!stageRow) return;
    const ws = stageRow as Record<string, unknown>;
    if (ws.status !== "active") return;

    // Count work_item decisions for this stage
    const items = await trx
      .selectFrom("event.work_item as wi")
      .select(["wi.status", "wi.decision"])
      .where("wi.workflow_stage_id", "=", stageId)
      .execute();

    const total    = items.length;
    const positive = items.filter((i) => POSITIVE_DECISIONS.has((i as Record<string, unknown>).decision as string)).length;
    const negative = items.filter((i) => NEGATIVE_DECISIONS.has((i as Record<string, unknown>).decision as string)).length;
    const pending  = items.filter((i) => !TERMINAL_STATUSES.has((i as Record<string, unknown>).status as string)).length;

    const quorum = ws.quorum != null
      ? (typeof ws.quorum === "string" ? JSON.parse(ws.quorum) : ws.quorum) as { strategy: string; required?: number }
      : null;

    let stageComplete = false;
    let outcome: "approved" | "rejected" = "approved";

    // Early reject if behavior enabled and any negative vote exists
    if (behaviors["early_reject_on_quorum_fail"] && negative > 0) {
      stageComplete = true;
      outcome = "rejected";
    } else if (!quorum || quorum.strategy === "unanimous") {
      if (pending === 0) {
        stageComplete = true;
        outcome = negative > 0 ? "rejected" : "approved";
      }
    } else if (quorum.strategy === "count") {
      const required = quorum.required ?? 1;
      if (positive >= required) {
        stageComplete = true;
        outcome = "approved";
      } else if (total - negative < required) {
        // Not enough remaining approvals possible
        stageComplete = true;
        outcome = "rejected";
      }
    } else if (quorum.strategy === "percent") {
      const required = quorum.required ?? 100;
      if (total > 0) {
        if ((positive / total) * 100 >= required) {
          stageComplete = true;
          outcome = "approved";
        } else if (((total - negative) / total) * 100 < required) {
          stageComplete = true;
          outcome = "rejected";
        }
      }
    }

    if (!stageComplete) return;

    // Close this stage
    await trx
      .updateTable("document.workflow_stage" as never)
      .set({
        status: "completed",
        outcome,
        completed_at: new Date(),
        updated_at: new Date(),
        updated_by: actorId,
      } as never)
      .where("id" as never, "=", stageId)
      .execute();

    await this.logEvent(trx, {
      tenantId,
      eventType: "stage_completed",
      entityType,
      entityId: requestId,
      actorId,
      instanceId: requestId,
      stepInstanceId: stageId,
      toStatus: "completed",
      detail: { outcome, stage_no: ws.stage_no },
    });

    const stageNo = ws.stage_no as number;

    if (outcome === "approved") {
      // Try to activate the next stage
      const nextStageRow = await trx
        .selectFrom("document.workflow_stage as ws")
        .select(["ws.id", "ws.stage_no", "ws.mode", "ws.sla_policy_id"])
        .where("ws.workflow_request_id", "=", requestId)
        .where("ws.stage_no", "=", stageNo + 1)
        .executeTakeFirst();

      if (nextStageRow) {
        const ns = nextStageRow as Record<string, unknown>;
        await trx
          .updateTable("document.workflow_stage" as never)
          .set({
            status: "active",
            started_at: new Date(),
            updated_at: new Date(),
            updated_by: actorId,
          } as never)
          .where("id" as never, "=", ns.id)
          .execute();

        const nextCompiledStage = templateSnapshot.stages?.find(
          (s) => s.stage_no === ns.stage_no,
        );

        await this.createWorkItems(trx, {
          tenantId,
          requestId,
          stageId: ns.id as string,
          stageMode: ns.mode as string ?? "serial",
          rules: nextCompiledStage?.rules ?? [],
          payload: entityPayload,
          slaPolicyId: ns.sla_policy_id as string | null,
          createdBy: actorId,
        });

        await this.logEvent(trx, {
          tenantId,
          eventType: "stage_activated",
          entityType,
          entityId: requestId,
          actorId,
          instanceId: requestId,
          detail: { stage_no: ns.stage_no },
        });
        return;
      }
    }

    // No next stage (or stage rejected) — close the request
    const requestStatus = outcome === "approved" ? "approved" : "rejected";
    const requestDecision = outcome === "approved" ? "approve" : "reject";

    await trx
      .updateTable("document.workflow_request" as never)
      .set({
        status: requestStatus,
        decision: requestDecision,
        decided_by: actorId,
        decided_at: new Date(),
        updated_at: new Date(),
        updated_by: actorId,
      } as never)
      .where("id" as never, "=", requestId)
      .execute();

    await this.logEvent(trx, {
      tenantId,
      eventType: "request_completed",
      entityType,
      entityId: requestId,
      actorId,
      instanceId: requestId,
      toStatus: requestStatus,
      detail: { outcome, final_stage_no: stageNo },
    });
  }

  // ── createWorkItems ────────────────────────────────────────────────────────

  private async createWorkItems(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      tenantId: string;
      requestId: string;
      stageId: string;
      stageMode: string;
      rules: CompiledRule[];
      payload: Record<string, unknown>;
      slaPolicyId: string | null;
      createdBy: string;
    },
  ): Promise<void> {
    const { tenantId, requestId, stageId, stageMode, rules, payload, slaPolicyId, createdBy } = params;

    const assignees = this.resolveAssignees(rules, payload);
    if (assignees.length === 0) {
      this.deps.logger?.error("workflow_no_assignees", {
        stageId,
        requestId,
        ruleCount: rules.length,
      });
      return;
    }

    const dueAt = slaPolicyId ? await this.computeDueAt(trx, slaPolicyId) : null;
    let orderIndex = 1;

    for (const assignee of assignees) {
      await trx
        .insertInto("event.work_item" as never)
        .values({
          tenant_id: tenantId,
          task_type: "approval",
          workflow_request_id: requestId,
          workflow_stage_id: stageId,
          designated_id:
            assignee.type === "principal" || assignee.type === "requester_manager"
              ? assignee.id || null
              : null,
          designated_group_id:
            assignee.type === "group" ? assignee.id || null : null,
          assignee_id:
            assignee.type === "principal" || assignee.type === "requester_manager"
              ? assignee.id || null
              : null,
          assignee_group_id:
            assignee.type === "group" || assignee.type === "ou"
              ? assignee.id || null
              : null,
          assignee_team_id:
            assignee.type === "team" ? assignee.id || null : null,
          order_index: stageMode === "serial" ? orderIndex++ : 1,
          status: "pending",
          assigned_at: new Date(),
          due_at: dueAt,
          metadata: "{}",
          created_by: createdBy,
        } as never)
        .execute();
    }
  }

  // ── resolveAssignees ───────────────────────────────────────────────────────

  private resolveAssignees(
    rules: CompiledRule[],
    payload: Record<string, unknown>,
  ): Array<{ type: string; id: string }> {
    const sorted = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const rule of sorted) {
      const matches =
        rule.conditions == null || evaluateJsonLogic(rule.conditions, payload);
      if (matches) {
        const at = rule.assign_to;
        return [{ type: at.type, id: String(at.value ?? "") }];
      }
    }
    return [];
  }

  // ── computeDueAt ───────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async computeDueAt(trx: Transaction<any>, slaPolicyId: string): Promise<Date | null> {
    const policy = await trx
      .selectFrom("control.workflow_sla_policy as sp")
      .select("sp.timers")
      .where("sp.id", "=", slaPolicyId)
      .executeTakeFirst();

    if (!policy) return null;
    const timers = (
      typeof policy.timers === "string" ? JSON.parse(policy.timers) : policy.timers
    ) as Array<{ after_minutes: number }>;
    if (!timers.length) return null;

    const first = timers.reduce((min, t) =>
      t.after_minutes < min.after_minutes ? t : min,
    );
    const due = new Date();
    due.setMinutes(due.getMinutes() + first.after_minutes);
    return due;
  }

  // ── getInboxCount ──────────────────────────────────────────────────────────

  async getInboxCount(params: { principalId: string; tenantId: string }): Promise<number> {
    const { principalId, tenantId } = params;
    const row = await this.db
      .selectFrom("event.work_item as wi")
      .select(this.db.fn.count("wi.id").as("count"))
      .where("wi.tenant_id", "=", tenantId)
      .where("wi.assignee_id", "=", principalId)
      .where("wi.status", "in", ["pending", "assigned", "in_progress"])
      .executeTakeFirst();
    return Number((row as Record<string, unknown>)?.count ?? 0);
  }

  // ── getInbox ───────────────────────────────────────────────────────────────

  async getInbox(params: {
    principalId: string;
    tenantId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: unknown[]; total: number }> {
    const { principalId, tenantId, limit, offset } = params;

    const base = this.db
      .selectFrom("event.work_item as wi")
      .innerJoin(
        "document.workflow_request as wr",
        "wr.id",
        "wi.workflow_request_id",
      )
      .leftJoin(
        "document.workflow_stage as ws",
        "ws.id",
        "wi.workflow_stage_id",
      )
      .where("wi.tenant_id", "=", tenantId)
      .where("wi.assignee_id", "=", principalId)
      .where("wi.status", "in", ["pending", "assigned", "in_progress"]);

    const [items, countRow] = await Promise.all([
      base
        .select([
          "wi.id",
          "wi.workflow_request_id as workflowRequestId",
          "wi.workflow_stage_id as workflowStageId",
          "wi.task_type as taskType",
          "wi.status",
          "wi.assigned_at as assignedAt",
          "wi.due_at as dueAt",
          "wi.decision",
          "wr.entity_type as entityType",
          "wr.entity_id as entityId",
          "wr.workflow_type as workflowType",
          "wr.requested_by as requestedBy",
          "wr.requested_at as requestedAt",
          "ws.stage_no as stageNo",
          "ws.name as stageName",
        ])
        .orderBy("wi.due_at", sql`asc nulls last`)
        .orderBy("wi.assigned_at", "asc")
        .limit(limit)
        .offset(offset)
        .execute(),
      base
        .select(this.db.fn.count("wi.id").as("total"))
        .executeTakeFirst(),
    ]);

    return {
      items,
      total: Number((countRow as Record<string, unknown>)?.total ?? 0),
    };
  }

  // ── getRequestDetail ───────────────────────────────────────────────────────

  async getRequestDetail(params: {
    requestId: string;
    tenantId: string;
  }): Promise<{
    request: unknown;
    stages: unknown[];
    workItems: unknown[];
    behaviors: Record<string, unknown>;
  } | null> {
    const { requestId, tenantId } = params;

    const requestRow = await this.db
      .selectFrom("document.workflow_request as wr")
      .select([
        "wr.id",
        "wr.tenant_id as tenantId",
        "wr.workflow_type as workflowType",
        "wr.entity_type as entityType",
        "wr.entity_id as entityId",
        "wr.status",
        "wr.decision",
        "wr.requested_by as requestedBy",
        "wr.requested_at as requestedAt",
        "wr.decided_by as decidedBy",
        "wr.decided_at as decidedAt",
        "wr.reason",
        "wr.template_snapshot as templateSnapshot",
        "wr.entity_snapshot as entitySnapshot",
        "wr.created_at as createdAt",
        "wr.updated_at as updatedAt",
      ])
      .where("wr.id", "=", requestId)
      .where("wr.tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!requestRow) return null;
    const req = requestRow as Record<string, unknown>;

    const snapshot = (
      typeof req.templateSnapshot === "string"
        ? JSON.parse(req.templateSnapshot)
        : req.templateSnapshot
    ) as CompiledTemplate;
    const behaviors = snapshot?.behaviors ?? {};

    const [stages, workItems] = await Promise.all([
      this.db
        .selectFrom("document.workflow_stage as ws")
        .select([
          "ws.id",
          "ws.stage_no as stageNo",
          "ws.name",
          "ws.mode",
          "ws.quorum",
          "ws.status",
          "ws.outcome",
          "ws.started_at as startedAt",
          "ws.completed_at as completedAt",
        ])
        .where("ws.workflow_request_id", "=", requestId)
        .orderBy("ws.stage_no", "asc")
        .execute(),
      this.db
        .selectFrom("event.work_item as wi")
        .select([
          "wi.id",
          "wi.workflow_stage_id as workflowStageId",
          "wi.task_type as taskType",
          "wi.designated_id as designatedId",
          "wi.assignee_id as assigneeId",
          "wi.assignee_group_id as assigneeGroupId",
          "wi.assignee_team_id as assigneeTeamId",
          "wi.order_index as orderIndex",
          "wi.status",
          "wi.decision",
          "wi.reason",
          "wi.assigned_at as assignedAt",
          "wi.completed_at as completedAt",
          "wi.due_at as dueAt",
        ])
        .where("wi.workflow_request_id", "=", requestId)
        .orderBy("wi.order_index", "asc")
        .execute(),
    ]);

    return {
      request: { ...req, templateSnapshot: undefined, entitySnapshot: undefined },
      stages,
      workItems,
      behaviors,
    };
  }

  // ── getActivity ────────────────────────────────────────────────────────────

  async getActivity(params: {
    requestId: string;
    tenantId: string;
    limit?: number;
  }): Promise<unknown[]> {
    const { requestId, tenantId, limit = 100 } = params;
    return this.db
      .selectFrom("log.workflow_event_log as wel")
      .select([
        "wel.id",
        "wel.event_type as eventType",
        "wel.from_status as fromStatus",
        "wel.to_status as toStatus",
        "wel.action",
        "wel.actor_id as actorId",
        "wel.comment",
        "wel.severity",
        "wel.detail",
        "wel.transition_name as transitionName",
        "wel.created_at as createdAt",
      ])
      .where("wel.tenant_id", "=", tenantId)
      .where("wel.instance_id", "=", requestId)
      .orderBy("wel.created_at", "asc")
      .limit(limit)
      .execute();
  }

  // ── logEvent ───────────────────────────────────────────────────────────────

  private async logEvent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Transaction<any>,
    params: {
      tenantId: string;
      eventType: string;
      entityType: string;
      entityId: string;
      actorId?: string;
      instanceId: string;
      stepInstanceId?: string;
      fromStatus?: string;
      toStatus?: string;
      action?: string;
      comment?: string;
      correlationId?: string;
      detail?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await trx
        .insertInto("log.workflow_event_log" as never)
        .values({
          tenant_id: params.tenantId,
          event_type: params.eventType,
          severity: "info",
          instance_id: params.instanceId,
          step_instance_id: params.stepInstanceId ?? null,
          entity_type: params.entityType,
          entity_id: params.entityId,
          actor_id: params.actorId ?? null,
          from_status: params.fromStatus ?? null,
          to_status: params.toStatus ?? null,
          action: params.action ?? null,
          comment: params.comment ?? null,
          detail: params.detail ? JSON.stringify(params.detail) : null,
          correlation_id: params.correlationId ?? null,
          created_at: new Date(),
          created_by: params.actorId ?? SYSTEM_ACTOR,
        } as never)
        .execute();
    } catch (err) {
      // Log errors must not fail the main transaction
      this.deps.logger?.error("workflow_log_event_failed", {
        eventType: params.eventType,
        err: String(err),
      });
    }
  }
}
